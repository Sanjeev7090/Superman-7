"""
Market Intelligence Engine
==========================
Fetches live macro data and applies decision matrix to determine Nifty bias.

Data Sources (all free, no API key):
  - Brent Crude    : yfinance BZ=F (ICE Brent Crude Futures)
  - India VIX      : yfinance ^INDIAVIX
  - Nifty Spot     : yfinance ^NSEI
  - GIFT Nifty     : yfinance NIFTYIFTB.NS (fallback: estimate from ^GSPC futures)
  - S&P 500 Futures: yfinance ES=F (global cues proxy)
  - Regulatory     : SEBI / NSE RSS via aiohttp (keyword sentiment)
  - Nifty 50 Breadth: yfinance bulk download (advances/declines count)

Decision Matrix (updated with Breadth):
  Strong Bullish : Brent < 82, VIX < 13.5, Positive, Gift +0.4%+, Breadth 28+  → +350 to +650 pts (95%+)
  Mild Bullish   : Brent 80-83, VIX 13.5-15, Neutral, +0.2-0.4%, Breadth 22-27 → +180 to +380 pts (92%)
  Neutral        : Brent 82-85, VIX 14-16, Neutral, ±0.2%, Breadth 18-22       → -120 to +120 pts (94%)
  Mild Bearish   : Brent 85+,  VIX 15+,  Neutral, -0.2 to -0.4%, Breadth 12-17 → -160 to -380 pts (93%)
  Strong Bearish : Brent 87+,  VIX 16+,  Negative, -0.4%+, Breadth <12         → -450 to -850 pts (95%)
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

_cache: Dict[str, Any] = {}
CACHE_TTL       = 120   # 2 min — fresh threshold
CACHE_STALE_TTL = 300   # 5 min — serve stale while refreshing
_refreshing     = False  # prevent concurrent background refreshes

# ── PCR Cache + History ────────────────────────────────────────────────────────
_pcr_cache:   Dict[str, Any] = {}
_PCR_HISTORY: List[Dict]     = []   # [{"ts": ISO, "pcr": float}, ...]
_MAX_PCR_HIS  = 750                 # ~25 hrs @ 2-min refresh

# NSE failure tracking — backoff when NSE is repeatedly unreachable
_nse_fail_count    = 0
_nse_next_retry_ts = 0.0   # epoch seconds, 0 = retry immediately = 750 readings


# ── Nifty PCR Signal Guide (image-accurate thresholds) ────────────────────────

def _pcr_signal(pcr: float) -> Dict:
    """
    Returns signal, label, color, description based on PCR value.
    Thresholds match the Nifty PCR Signal Guide image exactly.
    """
    if pcr <= 0:
        return {"signal": "UNAVAILABLE", "label": "No Data", "color": "#64748b",
                "description": "PCR data unavailable", "caution": False}
    if pcr < 0.50:
        return {"signal": "OVER_BEARISH", "label": "OVER-BEARISH",
                "color": "#ef4444", "bg": "#ef444418",
                "description": "Market oversold — short covering se sharp bounce aa sakta hai",
                "caution": True, "caution_label": "CAUTION (Bounce Possible)"}
    if pcr < 0.70:
        return {"signal": "BEARISH", "label": "BEARISH",
                "color": "#f97316", "bg": "#f9731618",
                "description": "Call writing zyada — downside pressure ka signal",
                "caution": False}
    if pcr < 0.90:
        return {"signal": "NEUTRAL_BEARISH", "label": "NEUTRAL / SLIGHTLY BEARISH",
                "color": "#eab308", "bg": "#eab30818",
                "description": "Balanced market with slight bearish tilt",
                "caution": False}
    if pcr < 1.20:
        return {"signal": "BULLISH", "label": "HEALTHY BULLISH",
                "color": "#22c55e", "bg": "#22c55e18",
                "description": "Balanced market — bullish sentiment",
                "caution": False}
    if pcr < 1.50:
        return {"signal": "STRONG_BULLISH", "label": "STRONG BULLISH",
                "color": "#16a34a", "bg": "#16a34a18",
                "description": "Put writing dominant — upside momentum ka signal",
                "caution": False}
    # pcr >= 1.50
    return {"signal": "OVER_BULLISH", "label": "OVER-BULLISH",
            "color": "#f59e0b", "bg": "#f59e0b18",
            "description": "Market overbought ho sakta hai — reversal ka signal ban sakta hai",
            "caution": True, "caution_label": "CAUTION (Reversal Risk)"}


def _pcr_price_action_signal(pcr: float, nifty_chg_pct: float) -> Dict:
    """
    PCR + Price Action combined signal (bottom section of the image).
    PCR direction derived: pcr >= 1.0 → 'UP' (bullish), < 1.0 → 'DOWN' (bearish)
    Price direction: nifty_chg_pct > 0 → UP, < 0 → DOWN
    """
    price_up = nifty_chg_pct > 0.05
    price_dn = nifty_chg_pct < -0.05
    pcr_up   = pcr >= 1.0    # >= 1.0 = puts dominant = bullish
    pcr_dn   = pcr < 1.0     # < 1.0  = calls dominant = bearish

    if price_up and pcr_up:
        return {"signal": "BULLISH_CONFIRMATION", "label": "BULLISH CONFIRMATION",
                "color": "#22c55e", "icon": "CHECK",
                "detail": "Price UP + PCR UP — strong upside signal"}
    if price_dn and pcr_dn:
        return {"signal": "BEARISH_CONFIRMATION", "label": "BEARISH CONFIRMATION",
                "color": "#ef4444", "icon": "CHECK",
                "detail": "Price DOWN + PCR DOWN — strong downside signal"}
    if price_up and pcr_dn:
        return {"signal": "WEAK_RALLY", "label": "WEAK RALLY (CAUTION)",
                "color": "#f59e0b", "icon": "WARN",
                "detail": "Price UP but PCR DOWN — rally may not sustain"}
    if price_dn and pcr_up:
        return {"signal": "BOUNCE_POSSIBLE", "label": "BOUNCE POSSIBLE",
                "color": "#06b6d4", "icon": "INFO",
                "detail": "Price DOWN but PCR UP — selling may be exhausting, watch for reversal"}
    # price near flat
    return {"signal": "WATCH", "label": "RANGE / WATCH",
            "color": "#94a3b8", "icon": "NEUTRAL",
            "detail": "Price flat — wait for directional confirmation"}


def _fetch_vix_derived_pcr() -> Optional[Dict]:
    """
    Fallback PCR proxy computed from India VIX via NSE allIndices endpoint.
    NSE option chain API is blocked from cloud IPs, but allIndices works.
    VIX percentile is mapped linearly to PCR range [0.65 → 1.50]:
      - Low VIX (complacency, call-buying)  → Low PCR  (~0.65–0.75, Bearish)
      - High VIX (panic, put-buying)        → High PCR (~1.20–1.50, Bullish)
    """
    try:
        import httpx as _httpx
        r = _httpx.get(
            "https://www.nseindia.com/api/allIndices",
            timeout=4,
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        )
        r.raise_for_status()
        indices = r.json().get("data", [])

        vix_item   = next((x for x in indices if x.get("indexSymbol") == "INDIA VIX"), None)
        nifty_item = next((x for x in indices if x.get("indexSymbol") == "NIFTY 50"), None)
        if not vix_item:
            return None

        vix        = float(vix_item["last"])
        year_low   = float(vix_item.get("yearLow",  8.0))
        year_high  = float(vix_item.get("yearHigh", 28.0))

        # Clamp percentile to [0, 1] and map to PCR [0.65, 1.50]
        pct        = max(0.0, min(1.0, (vix - year_low) / max(year_high - year_low, 1.0)))
        synth_pcr  = round(0.65 + pct * 0.85, 2)

        sig = _pcr_signal(synth_pcr)
        return {
            "pcr":           synth_pcr,
            "total_call_oi": 0,
            "total_put_oi":  0,
            "signal":        sig["signal"],
            "signal_label":  sig["label"],
            "signal_color":  sig["color"],
            "signal_bg":     sig.get("bg", sig["color"] + "18"),
            "description":   f"VIX {vix:.1f} → Synthetic PCR · NSE OI data blocked from cloud",
            "caution":       sig.get("caution", False),
            "caution_label": sig.get("caution_label", ""),
            "source":        "vix_derived",
            "vix":           vix,
        }
    except Exception as exc:
        logger.debug(f"[PCR] VIX fallback failed: {exc}")
        return None


def _fetch_nifty_pcr_sync() -> Dict:
    """
    Fetch live Nifty PCR from NSE option chain.
    Falls back to VIX-derived synthetic PCR when NSE API is blocked (cloud env).
    - Short 2s+2s warmup timeouts to avoid thread-pool starvation
    - Exponential backoff when NSE is repeatedly unreachable
    """
    global _nse_fail_count, _nse_next_retry_ts

    _UNAVAILABLE = {
        "pcr": 0.0, "total_call_oi": 0, "total_put_oi": 0,
        "signal": "UNAVAILABLE", "signal_label": "PCR Unavailable",
        "signal_color": "#64748b", "signal_bg": "#64748b18",
        "description": "NSE data temporarily unavailable",
        "caution": False, "caution_label": "", "source": "unavailable",
    }

    import time as _time

    # Exponential backoff — skip NSE fetch if we're in a backoff window
    if _time.time() < _nse_next_retry_ts:
        cached = _pcr_cache.get("nifty_pcr")
        return cached["data"] if cached else _UNAVAILABLE

    # Serve from cache if fresh (< 2 min old)
    cached = _pcr_cache.get("nifty_pcr")
    if cached:
        age = (_time.time() - cached["ts_epoch"])
        if age < 120:
            return cached["data"]

    try:
        from curl_cffi import requests as cffi_req
        s = cffi_req.Session(impersonate="chrome120")
        s.headers.update({
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
        })
        # Minimal warmup — short 2s timeouts so thread pool is never blocked long
        try:
            s.get("https://www.nseindia.com/", timeout=2)
        except Exception:
            pass
        try:
            s.get("https://www.nseindia.com/option-chain", timeout=2)
        except Exception:
            pass

        s.headers.update({
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.nseindia.com/option-chain",
            "X-Requested-With": "XMLHttpRequest",
        })
        r = s.get(
            "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY",
            timeout=4,
        )
        r.raise_for_status()
        raw = r.json()
        records = raw.get("records", {}).get("data", [])
        if not records:
            raise ValueError("Empty option chain")

        total_call_oi = sum(row.get("CE", {}).get("openInterest", 0) for row in records if row.get("CE"))
        total_put_oi  = sum(row.get("PE", {}).get("openInterest", 0) for row in records if row.get("PE"))
        pcr_val = round(total_put_oi / total_call_oi, 2) if total_call_oi else 0.0
        sig     = _pcr_signal(pcr_val)

        result = {
            "pcr":           pcr_val,
            "total_call_oi": int(total_call_oi),
            "total_put_oi":  int(total_put_oi),
            "signal":        sig["signal"],
            "signal_label":  sig["label"],
            "signal_color":  sig["color"],
            "signal_bg":     sig.get("bg", sig["color"] + "18"),
            "description":   sig["description"],
            "caution":       sig.get("caution", False),
            "caution_label": sig.get("caution_label", ""),
            "source":        "nse_live",
        }
        _pcr_cache["nifty_pcr"] = {"data": result, "ts_epoch": _time.time()}
        _PCR_HISTORY.append({"ts": datetime.now(timezone.utc).isoformat(), "pcr": pcr_val})
        if len(_PCR_HISTORY) > _MAX_PCR_HIS:
            del _PCR_HISTORY[0]

        # Reset failure count on success
        _nse_fail_count    = 0
        _nse_next_retry_ts = 0.0
        return result

    except Exception as e:
        # Exponential backoff: 2min, 4min, 8min, max 30min
        _nse_fail_count += 1
        backoff = min(30 * 60, 120 * (2 ** (_nse_fail_count - 1)))
        _nse_next_retry_ts = _time.time() + backoff
        logger.debug(f"[PCR] NSE unavailable (fail #{_nse_fail_count}), backoff {backoff}s: {e}")

        # ── VIX-derived fallback ───────────────────────────────────────────────
        # NSE option chain API is blocked from cloud IPs.
        # Use India VIX (allIndices endpoint — always accessible) to compute
        # a synthetic PCR proxy so the card shows meaningful data.
        vix_result = _fetch_vix_derived_pcr()
        if vix_result:
            _pcr_cache["nifty_pcr"] = {"data": vix_result, "ts_epoch": _time.time()}
            _PCR_HISTORY.append({"ts": datetime.now(timezone.utc).isoformat(), "pcr": vix_result["pcr"]})
            if len(_PCR_HISTORY) > _MAX_PCR_HIS:
                del _PCR_HISTORY[0]
            logger.info(f"[PCR] Using VIX-derived PCR: {vix_result['pcr']} (VIX={vix_result.get('vix')})")
            return vix_result
        # ── Last resort: return cached stale data or UNAVAILABLE ──────────────
        return cached["data"] if cached else _UNAVAILABLE


# ── Bias Levels ────────────────────────────────────────────────────────────────

BIAS_LEVELS = [
    {
        "label": "Strong Bullish",
        "score_min": 2.5,
        "score_max": 99,
        "move_label": "+300 to +600 pts",
        "move_min": 300,
        "move_max": 600,
        "probability": "93%+",
        "action": "Aggressive Long (Banking + Energy)",
        "color": "#22c55e",
        "gift_color": "+0.4% or more",
        "brent_ref": "< $84",
        "vix_ref": "< 11.5",
        "regulatory_ref": "Positive",
        "breadth_ref": "28+ stocks",
    },
    {
        "label": "Mild Bullish",
        "score_min": 0.8,
        "score_max": 2.5,
        "move_label": "+150 to +350 pts",
        "move_min": 150,
        "move_max": 350,
        "probability": "90%",
        "action": "Selective Long",
        "color": "#86efac",
        "gift_color": "+0.2% to +0.4%",
        "brent_ref": "$84 – 87",
        "vix_ref": "11.5 – 13.0",
        "regulatory_ref": "Neutral",
        "breadth_ref": "22 – 27 stocks",
    },
    {
        "label": "Neutral",
        "score_min": -0.5,
        "score_max": 0.8,
        "move_label": "-150 to +150 pts (Sideways)",
        "move_min": -150,
        "move_max": 150,
        "probability": "92%",
        "action": "Range trading / Small positions",
        "color": "#94a3b8",
        "gift_color": "-0.2% to +0.2%",
        "brent_ref": "$87 – 91",
        "vix_ref": "13.0 – 14.5",
        "regulatory_ref": "Neutral",
        "breadth_ref": "17 – 22 stocks",
    },
    {
        "label": "Mild Bearish",
        "score_min": -2.0,
        "score_max": -0.5,
        "move_label": "-150 to -350 pts",
        "move_min": -350,
        "move_max": -150,
        "probability": "91%",
        "action": "Selective Energy Long + Profit booking",
        "color": "#fca5a5",
        "gift_color": "-0.2% to -0.4%",
        "brent_ref": "$91 – 94",
        "vix_ref": "14.5 – 16.0",
        "regulatory_ref": "Neutral",
        "breadth_ref": "12 – 17 stocks",
    },
    {
        "label": "Strong Bearish",
        "score_min": -99,
        "score_max": -2.0,
        "move_label": "-400 to -800 pts",
        "move_min": -800,
        "move_max": -400,
        "probability": "94%",
        "action": "Hedging / Increase Cash",
        "color": "#ef4444",
        "gift_color": "-0.4% or less",
        "brent_ref": "$94+",
        "vix_ref": "16.0+",
        "regulatory_ref": "Negative",
        "breadth_ref": "< 12 stocks",
    },
]


# ── Scoring ────────────────────────────────────────────────────────────────────

def _score_brent(brent: float) -> float:
    if brent < 84:
        return 2.5
    elif brent < 87:
        return 1.0
    elif brent < 91:
        return 0.0
    elif brent < 94:
        return -1.0
    else:
        return -2.0


def _score_vix(vix: float) -> float:
    if vix < 11.5:
        return 1.5
    elif vix < 13.0:
        return 1.0
    elif vix < 14.5:
        return 0.0
    elif vix < 16.0:
        return -0.8
    else:
        return -1.5


def _score_regulatory(sentiment: str) -> float:
    mapping = {"Positive": 1.0, "Neutral": 0.0, "Negative": -1.5}
    return mapping.get(sentiment, 0.0)


def _score_gift(gift_premium: float) -> float:
    """Gift Nifty premium over spot Nifty → score."""
    if gift_premium > 80:
        return 1.0
    elif gift_premium > 20:
        return 0.5
    elif gift_premium > -20:
        return 0.0
    elif gift_premium > -80:
        return -0.5
    else:
        return -1.0


def _determine_bias(score: float) -> Dict:
    for level in BIAS_LEVELS:
        if level["score_min"] <= score < level["score_max"]:
            return level
    return BIAS_LEVELS[2]  # default neutral


# ── Nifty 50 Breadth ───────────────────────────────────────────────────────────

def _breadth_signal(advances: int, declines: int, total: int) -> Dict:
    """
    Returns breadth signal, color, impact label based on advances count out of 50.
    Decision matrix: 28+ = Strong Bull, 22-27 = Mild Bull, 18-22 = Neutral,
                     12-17 = Mild Bear, <12 = Strong Bear.
    Each declining stock ≈ 8-12 Nifty pts impact.
    """
    if total == 0:
        return {"signal": "UNKNOWN", "label": "No Data", "color": "#64748b",
                "impact_label": "—", "description": "Breadth data unavailable", "freq": "—"}

    if advances >= 35:
        return {"signal": "STRONG_BULL", "label": "Strong Bull Day", "color": "#22c55e",
                "impact_label": "+300 to +600 pts", "description": "35+ stocks up — broad rally, heavy buying",
                "freq": "~7% days"}
    if advances >= 28:
        return {"signal": "BULL", "label": "Bull Breadth", "color": "#4ade80",
                "impact_label": "+150 to +350 pts", "description": "28+ stocks up — broad participation in rally",
                "freq": "~8% days"}
    if advances >= 22:
        return {"signal": "MILD_BULL", "label": "Mild Bullish", "color": "#86efac",
                "impact_label": "+150 to +350 pts", "description": "22-27 stocks up — normal up day",
                "freq": "~15% days"}
    if advances >= 17:
        return {"signal": "NEUTRAL", "label": "Balanced", "color": "#94a3b8",
                "impact_label": "-150 to +150 pts", "description": "17-22 stocks up — sideways/choppy market",
                "freq": "~28% days"}
    if advances >= 12:
        return {"signal": "MILD_BEAR", "label": "Mild Bearish", "color": "#fca5a5",
                "impact_label": "-150 to -350 pts", "description": "12-17 stocks up — more declines, normal down day",
                "freq": "~32% days"}
    # <12
    return {"signal": "STRONG_BEAR", "label": "Heavy Selling", "color": "#ef4444",
            "impact_label": "-400 to -800 pts", "description": "< 12 stocks up — broad sell-off across board",
            "freq": "~18% days"}


_breadth_cache: Dict[str, Any] = {}
_BREADTH_CACHE_TTL = 300   # 5 min (matches market-intel stale TTL)


def _fetch_nifty_breadth_sync() -> Dict:
    """
    Fetch Nifty 50 breadth (advances/declines) from moneycontrol AD cache.
    Falls back to a fresh yfinance fetch if cache is stale.
    Cache shared with /api/moneycontrol/advance-decline endpoint.
    """
    import time as _time
    global _breadth_cache

    cached = _breadth_cache.get("data")
    if cached and (_time.time() - _breadth_cache.get("ts", 0)) < _BREADTH_CACHE_TTL:
        return cached

    try:
        from moneycontrol.router import _ad_cache, _AD_TTL_SEC, _fetch_nifty50_ad_sync
        ad_data = _ad_cache.get("data")
        ad_ts   = _ad_cache.get("ts", 0)

        if ad_data and (_time.time() - ad_ts) < _AD_TTL_SEC * 5:
            # Reuse moneycontrol cache (slightly stale OK for breadth display)
            raw = ad_data
        else:
            raw = _fetch_nifty50_ad_sync()

        advances  = int(raw.get("advances", 0))
        declines  = int(raw.get("declines", 0))
        unchanged = int(raw.get("unchanged", 0))
        total     = int(raw.get("total", 50)) or 50

        sig = _breadth_signal(advances, declines, total)

        result = {
            "advances":      advances,
            "declines":      declines,
            "unchanged":     unchanged,
            "total":         total,
            "advances_pct":  round(advances / total * 100, 1),
            "declines_pct":  round(declines / total * 100, 1),
            "signal":        sig["signal"],
            "signal_label":  sig["label"],
            "signal_color":  sig["color"],
            "impact_label":  sig["impact_label"],
            "description":   sig["description"],
            "freq":          sig["freq"],
            "per_stock_pts": "~8-12 pts / declining stock",
        }
        _breadth_cache["data"] = result
        _breadth_cache["ts"]   = _time.time()
        return result

    except Exception as e:
        logger.debug(f"Breadth fetch failed: {e}")
        return {}


# ── Today / Tomorrow Move Calculator ──────────────────────────────────────────

import math as _math

def _compute_today_tomorrow_moves(
    nifty: float,
    vix: float,
    gift_premium: float,
    total_score: float,
    nasdaq_chg: float,
    hang_seng_chg: float,
) -> Dict:
    """
    Returns today_move and tomorrow_move dicts:
      {direction, label, range_label, color, probability, icon}

    Today:  driven mainly by GIFT Nifty premium + VIX 1-day σ
    Tomorrow: driven by overall bias score + Nasdaq/HangSeng momentum
    """
    # 1-day 1σ move in Nifty points (VIX = annualised volatility in %)
    sigma_1d = round(nifty * (vix / 100.0) / _math.sqrt(252))

    # ── TODAY ──────────────────────────────────────────────────────────────────
    # Primary signal: GIFT Nifty premium
    if gift_premium > 40 or (gift_premium > 15 and total_score > 0.5):
        today_dir   = "BULLISH"
        today_low   = max(30, round(abs(gift_premium) * 1.5))
        today_high  = max(today_low + 50, today_low + round(sigma_1d * 0.6))
        today_low   = round(today_low / 10) * 10
        today_high  = round(today_high / 10) * 10
        today_label = f"+{today_low} to +{today_high} pts"
        today_color = "#22c55e"
        today_icon  = "UP"
        if total_score > 2.0:
            today_prob = "High (80%+)"
        elif total_score > 1.0:
            today_prob = "Medium-High (65-80%)"
        else:
            today_prob = "Medium (55-65%)"

    elif gift_premium < -40 or (gift_premium < -15 and total_score < -0.5):
        today_dir   = "BEARISH"
        today_low   = max(30, round(abs(gift_premium) * 1.5))
        today_high  = max(today_low + 50, today_low + round(sigma_1d * 0.6))
        today_low   = round(today_low / 10) * 10
        today_high  = round(today_high / 10) * 10
        today_label = f"-{today_low} to -{today_high} pts"
        today_color = "#ef4444"
        today_icon  = "DOWN"
        if total_score < -2.0:
            today_prob = "High (80%+)"
        elif total_score < -1.0:
            today_prob = "Medium-High (65-80%)"
        else:
            today_prob = "Medium (55-65%)"

    else:
        # Sideways / unclear
        today_dir   = "SIDEWAYS"
        half        = max(30, round(sigma_1d * 0.4 / 10) * 10)
        today_label = f"±{half} to ±{half + 50} pts"
        today_color = "#94a3b8"
        today_icon  = "SIDE"
        today_prob  = "High (range-bound)"

    # ── TOMORROW ────────────────────────────────────────────────────────────────
    # Primary: overall bias (total_score) + global momentum
    nasdaq_boost   = 0.5 if nasdaq_chg > 0.3 else (-0.5 if nasdaq_chg < -0.3 else 0)
    hs_boost       = 0.3 if hang_seng_chg > 0.3 else (-0.3 if hang_seng_chg < -0.3 else 0)
    tmw_score      = total_score + nasdaq_boost + hs_boost

    if tmw_score > 1.2:
        tmw_dir    = "BULLISH"
        tmw_sigma  = round(sigma_1d * 0.8)
        tmw_low    = round(max(50, tmw_sigma * 0.5) / 10) * 10
        tmw_high   = round(max(100, tmw_sigma * 1.1) / 10) * 10
        tmw_label  = f"+{tmw_low} to +{tmw_high} pts"
        tmw_color  = "#22c55e"
        tmw_icon   = "UP"
        if tmw_score > 2.5:
            tmw_prob = "Medium-High (60-75%)"
        else:
            tmw_prob = "Medium (50-60%)"

    elif tmw_score < -1.2:
        tmw_dir    = "BEARISH"
        tmw_sigma  = round(sigma_1d * 0.8)
        tmw_low    = round(max(50, tmw_sigma * 0.5) / 10) * 10
        tmw_high   = round(max(100, tmw_sigma * 1.1) / 10) * 10
        tmw_label  = f"-{tmw_low} to -{tmw_high} pts"
        tmw_color  = "#ef4444"
        tmw_icon   = "DOWN"
        if tmw_score < -2.5:
            tmw_prob = "Medium-High (60-75%)"
        else:
            tmw_prob = "Medium (50-60%)"

    else:
        tmw_dir    = "SIDEWAYS"
        half_tmw   = max(50, round(sigma_1d * 0.5 / 10) * 10)
        tmw_label  = f"±{half_tmw} to ±{half_tmw + 80} pts"
        tmw_color  = "#94a3b8"
        tmw_icon   = "SIDE"
        tmw_prob   = "Medium (range / wait-and-watch)"

    return {
        "today_move":    {"direction": today_dir, "label": today_label, "color": today_color, "probability": today_prob, "icon": today_icon},
        "tomorrow_move": {"direction": tmw_dir,   "label": tmw_label,   "color": tmw_color,   "probability": tmw_prob,   "icon": tmw_icon},
    }


# ── Regulatory Sentiment ───────────────────────────────────────────────────────

REGULATORY_RSS = [
    "https://www.sebi.gov.in/sebirss.aspx",
    "https://www.nseindia.com/rss/circulars.xml",
]

NEGATIVE_KEYWORDS = [
    "ban", "banned", "suspend", "suspended", "penalty", "penalise", "penalize",
    "violation", "fraud", "crackdown", "restrict", "restriction", "probe",
    "investigation", "order", "seized", "action against", "barred",
]
POSITIVE_KEYWORDS = [
    "relief", "relaxed", "ease", "approve", "approved", "launch",
    "new scheme", "benefit", "positive", "reform", "deregulate",
]

# ── Market News Sources & Sentiment Keywords ────────────────────────────────────
_NEWS_MARKET_RSS = [
    # ET Markets — Nifty 50 index feed (most direct)
    ("ET Markets",   "https://economictimes.indiatimes.com/indices/nifty_50/rssfeeds/1977021501.cms"),
    # ET Markets — broader markets feed
    ("ET Markets",   "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"),
    # LiveMint — markets feed
    ("LiveMint",     "https://www.livemint.com/rss/markets"),
    # Moneycontrol — market reports
    ("Moneycontrol", "https://www.moneycontrol.com/rss/marketreports.xml"),
    # Google News — Nifty 50 specific
    ("Google News",  "https://news.google.com/rss/search?q=Nifty+50+FII+DII+India+market&hl=en-IN&gl=IN&ceid=IN:en"),
    # Google News — macro factors affecting Nifty
    ("Google News",  "https://news.google.com/rss/search?q=India+VIX+RBI+crude+oil+rupee+Sensex&hl=en-IN&gl=IN&ceid=IN:en"),
]

# ── Nifty 50 Important Factors — HIGH IMPACT (direct market movers) ───────────
# News containing any of these ALWAYS passes the filter and gets HIGH impact tag
_N50_HIGH_IMPACT_KW = [
    "fii", "dii", "foreign institutional", "domestic institutional",
    "india vix", "vix spike", "vix surges", "vix falls",
    "rbi", "repo rate", "monetary policy", "interest rate", "rate cut", "rate hike",
    "gift nifty", "sgx nifty", "nifty premium", "nifty discount",
    "f&o expiry", "options expiry", "derivatives expiry", "monthly expiry", "weekly expiry",
    "crude oil", "brent crude", "oil price",
    "rupee", "usd/inr", "dollar india",
    "us fed", "federal reserve", "fed rate", "fomc",
    "budget", "union budget", "fiscal deficit",
    "nifty 50", "sensex", "nifty bank", "banknifty",
    "inflation india", "cpi india", "gdp india", "iip data",
    "sebi circular", "sebi ban", "sebi order",
]

# ── Nifty 50 Top-15 Heavyweight Companies (by index weight) ──────────────────
# News about these companies passes filter with MEDIUM impact
_N50_TOP_COMPANIES = [
    "hdfc bank", "reliance industries", "reliance", "icici bank",
    "infosys", "tcs", "tata consultancy",
    "bajaj finance", "bharti airtel", "airtel",
    "kotak mahindra", "kotak bank",
    "larsen", "l&t", "sbi", "state bank of india",
    "axis bank", "hindustan unilever", "hul",
    "asian paints", "hcl tech", "wipro", "maruti",
    "sun pharma", "ntpc", "power grid", "adani ports",
]

# ── Sentiment Keywords (Nifty 50 context) ─────────────────────────────────────
# NOTE: Generic price-movement words (surge/jump/rise) are intentionally EXCLUDED
# from bullish list because they must be evaluated in context (oil surge = BEARISH).
_N50_BULLISH_KW = [
    "rally", "rallies", "bullish", "strong", "upside", "positive", "rebound",
    "recovery", "breakout", "fii buying", "foreign buying", "fii inflow",
    "buying interest", "support", "all-time high", "record high",
    "rate cut", "repo cut", "outperform", "upgrade", "accumulate", "overweight",
    "net buyer", "net inflow", "inflows", "advances", "green", "gains today",
    "oil falls", "crude falls", "oil drops", "crude drops", "oil declines",
    "brent falls", "brent drops", "crude down", "oil down",
    "rupee strengthens", "rupee gains", "rupee rises",
    "us markets rise", "wall street gains", "dow gains", "s&p gains",
]

_N50_BEARISH_KW = [
    "crash", "fall", "falls", "drop", "drops", "decline", "declines",
    "bearish", "selloff", "sell-off", "weak", "weakness", "downside",
    "negative", "caution", "fear", "fii selling", "foreign selling", "fii outflow",
    "net seller", "outflow", "outflows", "correction", "breakdown",
    "pressure", "plunge", "slump", "rout", "rate hike", "repo hike",
    "overbought", "downgrade", "reduce", "underweight", "avoid",
    "geopolitical", "escalation", "war", "attack", "strikes", "conflict",
    "rupee weakens", "rupee falls", "rupee declines", "rupee at record low",
    "us stocks slide", "wall street falls", "dow falls", "s&p falls", "us markets fall",
    "inflation rises", "inflation surge", "high inflation",
]

# ── Oil/Crude Contextual Rules (India is net oil importer) ───────────────────
# These patterns OVERRIDE generic keyword scoring for oil-related news
_OIL_SURGE_PATTERNS = [
    "crude jumps", "crude surges", "crude rises", "crude soars", "crude spikes",
    "crude climbs", "brent jumps", "brent surges", "brent rises", "brent soars",
    "brent climbs", "oil jumps", "oil surges", "oil rises", "oil soars",
    "oil spikes", "oil climbs", "oil rebound", "oil prices jump", "oil prices rise",
    "oil prices surge", "oil prices soar", "oil prices climb", "crude up",
    "brent up", "oil up", "crude nears", "brent nears", "oil nears",
    "crude above", "brent above",
]
_OIL_FALL_PATTERNS = [
    "crude falls", "crude drops", "crude declines", "crude plunges", "crude slumps",
    "brent falls", "brent drops", "brent declines", "brent plunges",
    "oil falls", "oil drops", "oil declines", "oil plunges", "oil slumps",
    "oil prices fall", "oil prices drop", "oil prices decline",
    "crude down", "brent down", "oil down",
]

# ── Geopolitical Escalation → BEARISH for Nifty (global risk-off) ─────────────
_GEO_BEARISH_PATTERNS = [
    "middle east", "iran", "israel", "gaza", "hamas", "hezbollah",
    "trump warns", "us forces attack", "missile", "airstrike", "air strike",
    "war escalates", "conflict escalates", "military strike", "us iran",
]


def _n50_context_sentiment(text_lower: str) -> Optional[str]:
    """
    Context-aware Nifty 50 sentiment override.
    Returns 'BEARISH' | 'BULLISH' | None (use keyword fallback).

    Key India-specific rules:
    - Oil/Crude surge → BEARISH (India imports ~85% crude → inflation + CAD + rupee weak)
    - Oil/Crude fall  → BULLISH
    - Geopolitical escalation + oil surge → STRONGLY BEARISH
    - US stocks slide  → BEARISH (global risk-off hits FII flows)
    """
    has_oil_topic = any(p in text_lower for p in [
        "crude", "brent", "oil price", "wti", "petroleum"
    ])

    if has_oil_topic:
        # Oil surge → BEARISH for India
        if any(p in text_lower for p in _OIL_SURGE_PATTERNS):
            return "BEARISH"
        # Oil fall → BULLISH for India
        if any(p in text_lower for p in _OIL_FALL_PATTERNS):
            return "BULLISH"

    # US stocks falling → global risk-off → FII sell India → BEARISH
    us_bear = ["us stocks slide", "us stocks fall", "wall street falls", "wall street slides",
               "dow falls", "dow drops", "s&p falls", "s&p drops", "nasdaq falls",
               "us markets fall", "us markets down", "american stocks fall"]
    if any(p in text_lower for p in us_bear):
        return "BEARISH"

    # Geopolitical escalation with oil → strong BEARISH
    has_geo = any(p in text_lower for p in _GEO_BEARISH_PATTERNS)
    if has_geo and has_oil_topic:
        return "BEARISH"

    return None  # fallback to keyword counting

_news_market_cache: Dict[str, Any] = {}
_NEWS_MARKET_CACHE_TTL = 900  # 15 minutes


# ── Geopolitical Risk Scoring ──────────────────────────────────────────────────
# Categorized keywords with severity weights (max score cap = 15)
_GEO_RISK_CATEGORIES: Dict[str, Dict] = {
    "nuclear": {
        "weight": 4, "label": "Nuclear Threat",
        "keywords": ["nuclear weapon", "atomic bomb", "nuclear threat", "nuclear strike",
                     "radiation leak", "radioactive", "nuclear crisis"],
        "sectors": ["All Sectors (Severe)"],
    },
    "war_conflict": {
        "weight": 3, "label": "Armed Conflict / War",
        "keywords": ["war declared", "military invasion", "ground offensive", "airstrike",
                     "air strike", "missile attack", "bombing", "naval blockade",
                     "troops deployed", "military escalation", "armed conflict"],
        "sectors": ["Aviation", "Oil & Gas", "Defence"],
    },
    "middle_east": {
        "weight": 2, "label": "Middle East Tensions",
        "keywords": ["iran", "israel", "hamas", "hezbollah", "gaza strip", "west bank",
                     "strait of hormuz", "middle east conflict", "tehran", "beirut attack",
                     "houthi", "red sea attack"],
        "sectors": ["Aviation", "Paints", "Auto", "FMCG"],
    },
    "oil_supply": {
        "weight": 2, "label": "Oil Supply Disruption",
        "keywords": ["opec cut", "oil supply cut", "pipeline attack", "oil embargo",
                     "crude supply disruption", "oil sanctions", "refinery attack"],
        "sectors": ["Aviation", "Paints", "Chemicals", "Auto"],
    },
    "sanctions": {
        "weight": 2, "label": "Economic Sanctions",
        "keywords": ["us sanctions", "trade sanctions", "export ban", "import embargo",
                     "trade blockade", "technology ban", "chip ban", "iran sanctions"],
        "sectors": ["IT", "Pharma", "Metals", "Chemicals"],
    },
    "us_china": {
        "weight": 2, "label": "US-China Tensions",
        "keywords": ["us china trade war", "china tariff", "taiwan strait", "china blockade",
                     "beijing sanctions", "sino-american", "trade restriction china"],
        "sectors": ["IT", "Electronics", "Specialty Chemicals"],
    },
    "russia_ukraine": {
        "weight": 2, "label": "Russia-Ukraine Conflict",
        "keywords": ["russia ukraine", "ukraine war", "kyiv attack", "moscow strike",
                     "nato russia", "russian invasion", "ukraine ceasefire"],
        "sectors": ["Metals", "Fertilisers", "Energy"],
    },
    "risk_off": {
        "weight": 1, "label": "Global Risk-Off Sentiment",
        "keywords": ["geopolitical risk", "safe haven demand", "flight to safety",
                     "risk-off", "global uncertainty", "war premium crude",
                     "geopolitical tension", "escalating tensions"],
        "sectors": ["FII Flows", "Banking", "Midcap"],
    },
}


def _compute_geo_risk(news_items: List[Dict]) -> Dict:
    """
    Compute geopolitical risk score from already-fetched Nifty 50 news items.
    No extra network call — reuses the existing news cache.

    Returns:
        score      : int 0-15
        level      : 'LOW' | 'MEDIUM' | 'HIGH'
        level_color: hex color
        triggers   : list of {category, keyword, news_title, weight}
        nifty_impact: descriptive string
        affected_sectors: list of sector strings
        headline_count: int
    """
    score = 0
    triggers: List[Dict] = []
    affected_sectors_set: set = set()
    seen_categories: set = set()

    for item in news_items:
        text = (item.get("title", "") + " " + item.get("summary", "")).lower()
        for cat_key, cat in _GEO_RISK_CATEGORIES.items():
            matched_kw = next((kw for kw in cat["keywords"] if kw in text), None)
            if matched_kw and cat_key not in seen_categories:
                score += cat["weight"]
                seen_categories.add(cat_key)
                for s in cat["sectors"]:
                    affected_sectors_set.add(s)
                triggers.append({
                    "category":   cat["label"],
                    "keyword":    matched_kw,
                    "news_title": item.get("title", "")[:80],
                    "weight":     cat["weight"],
                })

    score = min(score, 15)

    if score >= 8:
        level       = "HIGH"
        level_color = "#ef4444"
        nifty_impact = (
            "Strong bearish risk — expect VIX spike, FII selling pressure, "
            "potential 200-400 pts downside. Avoid aggressive longs."
        )
        nifty_sectors_note = "Defensives (Pharma/FMCG) may outperform; Aviation, Auto vulnerable"
    elif score >= 4:
        level       = "MEDIUM"
        level_color = "#f97316"
        nifty_impact = (
            "Moderate risk — FII outflow possible, oil-import sectors under pressure. "
            "Wait for stability before entering large positions."
        )
        nifty_sectors_note = "Monitor oil-linked sectors (Auto, Paints, Aviation)"
    else:
        level       = "LOW"
        level_color = "#22c55e"
        nifty_impact = (
            "Minimal direct geopolitical impact on Nifty 50 currently. "
            "Focus on domestic macro (PCR, FII/DII, VIX) for direction."
        )
        nifty_sectors_note = "No sector-specific geo-risk today"

    # Sort triggers by weight (highest first)
    triggers.sort(key=lambda x: -x["weight"])

    return {
        "score":            score,
        "score_max":        15,
        "level":            level,
        "level_color":      level_color,
        "nifty_impact":     nifty_impact,
        "sectors_note":     nifty_sectors_note,
        "triggers":         triggers[:6],
        "affected_sectors": sorted(list(affected_sectors_set))[:8],
        "headline_count":   len(news_items),
        "available":        True,
    }


def _n50_classify_item(title: str, desc: str) -> Optional[str]:
    """
    Classify a news item for Nifty 50 relevance.
    Returns: 'HIGH' | 'MEDIUM' | None (skip)
    """
    text = (title + " " + desc).lower()

    # HIGH impact: direct Nifty 50 market movers
    if any(kw in text for kw in _N50_HIGH_IMPACT_KW):
        return "HIGH"

    # MEDIUM impact: news about Nifty 50 top constituent companies
    if any(co in text for co in _N50_TOP_COMPANIES):
        return "MEDIUM"

    return None  # Not Nifty 50 relevant — skip


async def _fetch_regulatory_sentiment() -> str:
    """Return Positive / Neutral / Negative based on recent SEBI/NSE news."""
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            for url in REGULATORY_RSS:
                try:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as r:
                        if r.status == 200:
                            text = (await r.text()).lower()
                            neg = sum(1 for k in NEGATIVE_KEYWORDS if k in text)
                            pos = sum(1 for k in POSITIVE_KEYWORDS if k in text)
                            if neg > pos + 1:
                                return "Negative"
                            elif pos > neg:
                                return "Positive"
                            return "Neutral"
                except Exception:
                    continue
    except Exception as e:
        logger.debug(f"Regulatory RSS failed: {e}")
    return "Neutral"


# ── Market News Intelligence ────────────────────────────────────────────────────

def _fetch_nifty_market_news_sync(force: bool = False) -> Dict:
    """
    Fetch Nifty 50 market news — only important factors that directly impact
    Nifty 50 (FII/DII, VIX, RBI, GIFT Nifty, crude oil, rupee, top heavyweights).

    impact_level:
      HIGH   — direct Nifty movers (FII, VIX, RBI, crude, expiry, rupee, budget)
      MEDIUM — major Nifty 50 constituent company news

    Returns: {items, outlook, outlook_color, outlook_label, confidence, ...}
    """
    import time as _time
    import requests
    import xml.etree.ElementTree as ET
    import re as _re

    # Cache check (skip if force=True)
    if not force:
        cached = _news_market_cache.get("news")
        if cached and (_time.time() - cached.get("ts", 0)) < _NEWS_MARKET_CACHE_TTL:
            return cached["data"]

    _HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    }

    all_items: List[Dict] = []

    for source_name, url in _NEWS_MARKET_RSS:
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=6)
            if resp.status_code != 200:
                continue
            root = ET.fromstring(resp.content)
            channel = root.find("channel") or root
            for item in (channel.findall("item") or [])[:25]:
                title = (item.findtext("title") or "").strip()
                link  = (item.findtext("link") or "").strip()
                pub   = (item.findtext("pubDate") or "").strip()
                desc  = _re.sub(r"<[^>]+>", "", item.findtext("description") or "").strip()[:300]

                if not title or not link:
                    continue

                # Strict Nifty 50 relevance filter — skip irrelevant news
                impact_level = _n50_classify_item(title, desc)
                if impact_level is None:
                    continue

                # Context-aware sentiment (India-specific rules first)
                text_lower = (title + " " + desc).lower()
                ctx_sentiment = _n50_context_sentiment(text_lower)
                if ctx_sentiment:
                    sentiment = ctx_sentiment
                    s_color = "#22c55e" if sentiment == "BULLISH" else "#ef4444"
                else:
                    # Fallback: keyword-based scoring
                    bull = sum(1 for kw in _N50_BULLISH_KW if kw in text_lower)
                    bear = sum(1 for kw in _N50_BEARISH_KW if kw in text_lower)
                    if bull > bear:
                        sentiment, s_color = "BULLISH", "#22c55e"
                    elif bear > bull:
                        sentiment, s_color = "BEARISH", "#ef4444"
                    else:
                        sentiment, s_color = "NEUTRAL", "#94a3b8"

                # Parse pub date to ISO
                pub_iso = ""
                try:
                    from email.utils import parsedate_to_datetime
                    pub_iso = parsedate_to_datetime(pub).isoformat()
                except Exception:
                    pub_iso = pub

                all_items.append({
                    "title":           title,
                    "url":             link,
                    "source":          source_name,
                    "published":       pub_iso,
                    "summary":         desc,
                    "sentiment":       sentiment,
                    "sentiment_color": s_color,
                    "impact_level":    impact_level,
                    "impact_color":    "#f97316" if impact_level == "HIGH" else "#eab308",
                })
        except Exception as e:
            logger.debug(f"[MarketNews] {source_name} failed: {e}")

    # Deduplicate by title prefix (first 55 chars)
    seen: set = set()
    unique: List[Dict] = []
    for item in all_items:
        key = item["title"][:55].lower()
        if key not in seen:
            seen.add(key)
            unique.append(item)

    # Sort: HIGH impact first, then by recency within same impact tier
    def _sort_key(x):
        tier = 0 if x.get("impact_level") == "HIGH" else 1
        return (tier, -(len(x.get("published", "") or "")))

    # First sort by date to get most-recent per tier
    unique.sort(key=lambda x: x.get("published", "") or "", reverse=True)
    # Then stable-sort by impact tier (HIGH first)
    unique.sort(key=lambda x: 0 if x.get("impact_level") == "HIGH" else 1)
    top = unique[:20]

    # Overall outlook (weight HIGH items more)
    bull_c = sum(2 if i["impact_level"] == "HIGH" else 1
                 for i in top if i["sentiment"] == "BULLISH")
    bear_c = sum(2 if i["impact_level"] == "HIGH" else 1
                 for i in top if i["sentiment"] == "BEARISH")
    raw_bull = sum(1 for i in top if i["sentiment"] == "BULLISH")
    raw_bear = sum(1 for i in top if i["sentiment"] == "BEARISH")
    total  = len(top)

    if total == 0:
        outlook, outlook_color = "NEUTRAL", "#94a3b8"
        outlook_label, confidence = "No data available", 0
    elif bull_c >= bear_c + 2:
        outlook, outlook_color = "BULLISH", "#22c55e"
        outlook_label = f"{raw_bull}/{total} headlines bullish"
        confidence = min(95, round(raw_bull / total * 100))
    elif bear_c >= bull_c + 2:
        outlook, outlook_color = "BEARISH", "#ef4444"
        outlook_label = f"{raw_bear}/{total} headlines bearish"
        confidence = min(95, round(raw_bear / total * 100))
    else:
        outlook, outlook_color = "NEUTRAL", "#eab308"
        outlook_label = f"Mixed signals ({raw_bull}\u2191 {raw_bear}\u2193)"
        confidence = 50

    result: Dict = {
        "items":         top,
        "outlook":       outlook,
        "outlook_color": outlook_color,
        "outlook_label": outlook_label,
        "confidence":    confidence,
        "bull_count":    raw_bull,
        "bear_count":    raw_bear,
        "high_count":    sum(1 for i in top if i["impact_level"] == "HIGH"),
        "total":         total,
        "fetched_at":    datetime.now(timezone.utc).isoformat(),
        "available":     total > 0,
    }
    _news_market_cache["news"] = {"data": result, "ts": _time.time()}
    logger.info(f"[MarketNews] {total} items | HIGH={result['high_count']} | outlook={outlook}")
    return result


# ── GIFT Nifty Fetch ───────────────────────────────────────────────────────────

def _fetch_gift_nifty(nifty_price: float) -> float:
    """
    Attempt to fetch GIFT Nifty from yfinance.
    Fallback: estimate using S&P 500 / Dow futures change%.
    """
    import yfinance as yf

    # Try NSE IFSC direct ticker
    for ticker in ["NIFTYIFTB.NS", "^NIFTYIFTB"]:
        try:
            info = yf.Ticker(ticker).fast_info
            price = getattr(info, "last_price", None)
            if price and price > 1000:
                return float(price)
        except Exception:
            pass

    # Fallback: Use S&P 500 futures % change as global cue proxy
    try:
        info = yf.Ticker("ES=F").fast_info
        prev_close = getattr(info, "previous_close", None)
        curr = getattr(info, "last_price", None)
        if prev_close and curr and prev_close > 0:
            sp_chg_pct = (curr - prev_close) / prev_close
            # GIFT Nifty roughly tracks 50-60% of S&P moves for Indian context
            estimated_premium = nifty_price * sp_chg_pct * 0.55
            return nifty_price + estimated_premium
    except Exception as e:
        logger.debug(f"S&P futures fallback for GIFT Nifty failed: {e}")

    # Last fallback — return spot with zero premium
    return nifty_price


def _calc_vix_percentile(vix: float, low: float, high: float) -> float:
    if not low or not high or high == low:
        return 50.0
    pct = (vix - low) / (high - low) * 100
    return round(max(0.0, min(100.0, pct)), 1)


# ── Expiry Countdown ──────────────────────────────────────────────────────────

def _next_expiry_info() -> Dict:
    """
    Next weekly options expiry countdown (IST timezone).
    NIFTY  weekly expiry : every Thursday  3:30 PM IST
    BANKNIFTY weekly     : every Wednesday 3:30 PM IST
    """

    IST = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(IST)

    result = {}
    for name, weekday in [("NIFTY", 3), ("BANKNIFTY", 2)]:  # Thu=3, Wed=2
        days_ahead = (weekday - now_ist.weekday()) % 7
        expiry_base = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)

        if days_ahead == 0 and now_ist >= expiry_base:
            days_ahead = 7  # today's expiry already passed → next week

        expiry_dt = expiry_base + timedelta(days=days_ahead)
        delta     = expiry_dt - now_ist
        total_sec = max(0, int(delta.total_seconds()))

        days    = total_sec // 86400
        hours   = (total_sec % 86400) // 3600
        minutes = (total_sec % 3600) // 60

        result[name] = {
            "days":        days,
            "hours":       hours,
            "minutes":     minutes,
            "expiry_date": expiry_dt.strftime("%d %b %Y"),
            "is_today":    days == 0,
        }


    return result


# ── VIX 52-week History + Period Changes ──────────────────────────────────────

def _fetch_vix_history() -> Dict:
    """Fetch India VIX 52-week high/low + weekly/monthly changes."""
    import yfinance as yf
    try:
        hist = yf.Ticker("^INDIAVIX").history(period="1y")
        if hist.empty:
            return {}
        closes = hist["Close"].dropna()
        current = float(closes.iloc[-1])

        def _pct(n: int) -> Optional[float]:
            if len(closes) > n:
                prev = float(closes.iloc[-n - 1])
                return round((current - prev) / prev * 100, 2) if prev else None
            return None

        return {
            "vix_52w_high":  round(float(closes.max()), 2),
            "vix_52w_low":   round(float(closes.min()), 2),
            "vix_chg_week":  _pct(5),
            "vix_chg_month": _pct(21),
        }
    except Exception as e:
        logger.debug(f"VIX history fetch failed: {e}")
        return {}


def _fetch_brent_history() -> Dict:
    """
    Fetch Brent Crude live price + day/week/month changes from history.
    Using history (daily closes) avoids futures-rollover artifacts that
    cause `fast_info.previous_close` to show large artificial price swings.
    """
    import yfinance as yf
    try:
        hist = yf.Ticker("BZ=F").history(period="3mo")
        if hist.empty:
            return {}
        closes = hist["Close"].dropna()
        current = float(closes.iloc[-1])
        prev_day = float(closes.iloc[-2]) if len(closes) > 1 else None

        def _pct(n: int) -> Optional[float]:
            if len(closes) > n:
                prev = float(closes.iloc[-n - 1])
                return round((current - prev) / prev * 100, 2) if prev else None
            return None

        day_chg = round((current - prev_day) / prev_day * 100, 2) if prev_day and prev_day > 0 else None

        return {
            "brent_current":  round(current, 2),   # live price from history
            "brent_chg_day":  day_chg,              # day % change (reliable, no rollover artifact)
            "brent_chg_week":  _pct(5),
            "brent_chg_month": _pct(21),
        }
    except Exception as e:
        logger.debug(f"Brent history fetch failed: {e}")
        return {}


def _fetch_hang_seng_history() -> Dict:
    """Fetch Hang Seng weekly/monthly change."""
    import yfinance as yf
    try:
        hist = yf.Ticker("^HSI").history(period="3mo")
        if hist.empty:
            return {}
        closes = hist["Close"].dropna()
        current = float(closes.iloc[-1])

        def _pct(n: int) -> Optional[float]:
            if len(closes) > n:
                prev = float(closes.iloc[-n - 1])
                return round((current - prev) / prev * 100, 2) if prev else None
            return None

        return {
            "hang_seng_chg_week":  _pct(5),
            "hang_seng_chg_month": _pct(21),
        }
    except Exception as e:
        logger.debug(f"Hang Seng history fetch failed: {e}")
        return {}


def _fetch_nasdaq_history() -> Dict:
    """Fetch Nasdaq weekly/monthly change."""
    import yfinance as yf
    try:
        hist = yf.Ticker("^IXIC").history(period="3mo")
        if hist.empty:
            return {}
        closes = hist["Close"].dropna()
        current = float(closes.iloc[-1])

        def _pct(n: int) -> Optional[float]:
            if len(closes) > n:
                prev = float(closes.iloc[-n - 1])
                return round((current - prev) / prev * 100, 2) if prev else None
            return None

        return {
            "nasdaq_chg_week":  _pct(5),
            "nasdaq_chg_month": _pct(21),
        }
    except Exception as e:
        logger.debug(f"Nasdaq history fetch failed: {e}")
        return {}


def _fetch_nifty_history() -> Dict:
    """Fetch Nifty 50 weekly/monthly change."""
    import yfinance as yf
    try:
        hist = yf.Ticker("^NSEI").history(period="3mo")
        if hist.empty:
            return {}
        closes = hist["Close"].dropna()
        current = float(closes.iloc[-1])

        def _pct(n: int) -> Optional[float]:
            if len(closes) > n:
                prev = float(closes.iloc[-n - 1])
                return round((current - prev) / prev * 100, 2) if prev else None
            return None

        return {
            "nifty_chg_week":  _pct(5),
            "nifty_chg_month": _pct(21),
        }
    except Exception as e:
        logger.debug(f"Nifty history fetch failed: {e}")
        return {}


def _fetch_nifty_today_actual() -> Dict:
    """
    Fetch Nifty's actual intraday move for today (open → close/current).
    Returns actual_pts, actual_pct, market_closed, open_price, close_price.
    Only meaningful after NSE market opens (9:15 AM IST).
    """
    import yfinance as yf
    from zoneinfo import ZoneInfo
    try:
        IST = ZoneInfo("Asia/Kolkata")
        now_ist = datetime.now(IST)
        is_weekday = now_ist.weekday() < 5  # Mon-Fri
        market_open_time  = now_ist.replace(hour=9,  minute=15, second=0, microsecond=0)
        market_close_time = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)

        # Only fetch on weekdays after 9:15 AM
        if not is_weekday or now_ist < market_open_time:
            return {"available": False, "market_closed": False}

        hist = yf.Ticker("^NSEI").history(period="1d", interval="5m")
        if hist.empty:
            return {"available": False, "market_closed": False}

        open_price  = float(hist["Open"].iloc[0])
        close_price = float(hist["Close"].iloc[-1])
        actual_pts  = round(close_price - open_price, 2)
        actual_pct  = round((actual_pts / open_price) * 100, 2) if open_price else 0.0
        market_closed = now_ist >= market_close_time

        return {
            "available":     True,
            "market_closed": market_closed,
            "open_price":    round(open_price, 2),
            "close_price":   round(close_price, 2),
            "actual_pts":    actual_pts,
            "actual_pct":    actual_pct,
            "color":         "#22c55e" if actual_pts >= 0 else "#ef4444",
            "label":         f"{'▲' if actual_pts >= 0 else '▼'} {abs(actual_pts):.0f} pts ({'+' if actual_pts >= 0 else ''}{actual_pct:.2f}%)",
        }
    except Exception as e:
        logger.debug(f"Nifty today actual fetch failed: {e}")
        return {"available": False, "market_closed": False}


def _fetch_gift_nifty_history() -> Dict:
    """Fetch GIFT Nifty (SGX Nifty proxy) weekly/monthly change via NIFTYIFTB.NS or ES=F."""
    import yfinance as yf
    for sym in ("^NSEI",):   # use Nifty as proxy since GIFT is ~same
        try:
            hist = yf.Ticker(sym).history(period="3mo")
            if hist.empty:
                continue
            closes = hist["Close"].dropna()
            current = float(closes.iloc[-1])

            def _pct(n: int) -> Optional[float]:
                if len(closes) > n:
                    prev = float(closes.iloc[-n - 1])
                    return round((current - prev) / prev * 100, 2) if prev else None
                return None

            return {
                "gift_chg_week":  _pct(5),
                "gift_chg_month": _pct(21),
            }
        except Exception:
            continue
    return {}




# ── FII / DII Data from NSE ────────────────────────────────────────────────────

_FII_CACHE: Dict[str, Any] = {}
_FII_CACHE_TTL = 3600  # 1 hour (NSE updates FII data once at ~6 PM IST)

def _parse_fii_row(row: dict) -> Optional[Dict]:
    """Parse one FII/DII row from NSE API response."""
    try:
        def _f(v):
            if v is None: return 0.0
            return float(str(v).replace(",", ""))
        buy  = _f(row.get("buyValue")  or row.get("grossPurchase") or row.get("grossBuy"))
        sell = _f(row.get("sellValue") or row.get("grossSales")    or row.get("grossSell"))
        net  = _f(row.get("netValue")  or row.get("netPurchase")   or row.get("net"))
        if buy == 0 and sell == 0 and net != 0:
            buy, sell = (net, 0) if net > 0 else (0, -net)
        return {"buy": round(buy, 2), "sell": round(sell, 2), "net": round(net, 2)}
    except Exception:
        return None


def _activity_label(instrument: str, net: int) -> str:
    """Return human-readable activity label based on instrument and net direction."""
    if net == 0:
        return "Neutral"
    if instrument == "Future":
        return "Bought Futures" if net > 0 else "Sold Futures"
    if instrument == "CE":
        return "Bought Calls" if net > 0 else "Sold Calls"
    if instrument == "PE":
        return "Bought Puts" if net > 0 else "Sold Puts"
    return "Bought" if net > 0 else "Sold"


def _activity_color(net: int) -> str:
    if net > 0:
        return "#22c55e"   # green
    if net < 0:
        return "#f43f5e"   # rose-red
    return "#94a3b8"       # neutral gray


def _parse_fao_csv(text: str) -> Optional[Dict]:
    """
    Parse NSE F&O participant CSV:
    archives.nseindia.com/content/nsccl/fao_participant_vol_{DDMMYYYY}.csv

    Extracts all 4 participants (FII, PRO, DII, CLIENT/RETAIL) ×
    3 instruments (Future Index, CE Index, PE Index) with Change + Activity.
    """
    try:
        import csv
        lines = [l for l in text.splitlines() if l.strip() and not l.startswith('"')]
        reader = csv.DictReader(lines)
        rows = {}
        for r in reader:
            key = r.get("Client Type", "").strip().upper()
            rows[key] = r

        def _n(row, key):
            val = row.get(key, "0") or "0"
            try:
                return int(str(val).replace(",", "").strip() or "0")
            except Exception:
                return 0

        # NSE CSV client types: FII, DII, PRO, CLIENT (= Retail)
        PARTIES = [
            ("FII",    "FII"),
            ("PRO",    "PRO"),
            ("DII",    "DII"),
            ("CLIENT", "RETAIL"),
        ]

        result = {}
        for csv_key, label in PARTIES:
            row = rows.get(csv_key)
            if not row:
                continue

            fi_long  = _n(row, "Future Index Long")
            fi_short = _n(row, "Future Index Short")
            ce_long  = _n(row, "Option Index Call Long")
            ce_short = _n(row, "Option Index Call Short")
            pe_long  = _n(row, "Option Index Put Long")
            pe_short = _n(row, "Option Index Put Short")
            opt_long = _n(row, "Total Long Contracts")
            opt_short= _n(row, "Total Short Contracts")

            net_fut  = fi_long  - fi_short
            net_ce   = ce_long  - ce_short
            net_pe   = pe_long  - pe_short
            net_total= opt_long - opt_short

            result[label.lower()] = {
                # Raw
                "fi_long":   fi_long,
                "fi_short":  fi_short,
                "net_index": net_fut,
                "net_total": net_total,
                "total_long": opt_long,
                "total_short": opt_short,
                # Full instrument breakdown
                "instruments": [
                    {
                        "instrument": "Future",
                        "change":     net_fut,
                        "activity":   _activity_label("Future", net_fut),
                        "color":      _activity_color(net_fut),
                    },
                    {
                        "instrument": "CE",
                        "change":     net_ce,
                        "activity":   _activity_label("CE", net_ce),
                        "color":      _activity_color(net_ce),
                    },
                    {
                        "instrument": "PE",
                        "change":     net_pe,
                        "activity":   _activity_label("PE", net_pe),
                        "color":      _activity_color(net_pe),
                    },
                ],
            }

        return result if result else None
    except Exception as e:
        logger.debug(f"FAO CSV parse error: {e}")
        return None


def _compute_nifty_fo_impact(participants: Dict) -> Dict:
    """
    Estimate Nifty 50 point impact based on F&O participant activity.

    Signals (weighted):
      FII Future net  → strongest signal (each 1000 contracts ≈ 4-5 pts)
      FII CE net      → sold calls = capping = mild bearish
      FII PE net      → bought puts = hedging = mild bearish
      DII Future net  → institutional support/selling
      PRO CE/PE       → smart money positioning

    Returns: {score, pts_estimate, direction, color, summary, signals[]}
    """
    fii  = participants.get("fii", {})
    dii  = participants.get("dii", {})
    pro  = participants.get("pro", {})

    def _net(p, instrument):
        for row in p.get("instruments", []):
            if row["instrument"] == instrument:
                return row["change"]
        return 0

    fii_fut = _net(fii, "Future")
    fii_ce  = _net(fii, "CE")
    fii_pe  = _net(fii, "PE")
    dii_fut = _net(dii, "Future")
    pro_ce  = _net(pro, "CE")

    signals = []
    score   = 0.0

    # FII Futures: primary signal — each 10000 contracts ≈ 1 bias unit
    if fii_fut != 0:
        unit = fii_fut / 10000
        score += unit * 1.5
        signals.append({
            "label":  f"FII {'Long' if fii_fut > 0 else 'Short'} Futures",
            "change": fii_fut,
            "impact": "Bullish" if fii_fut > 0 else "Bearish",
            "weight": "HIGH",
            "color":  "#22c55e" if fii_fut > 0 else "#ef4444",
        })

    # FII sold calls → expects market to stay below strikes (mildly bearish)
    if fii_ce < -2000:
        score -= 0.3
        signals.append({
            "label":  "FII Sold Calls",
            "change": fii_ce,
            "impact": "Capping Upside (Mild Bearish)",
            "weight": "MEDIUM",
            "color":  "#f97316",
        })
    elif fii_ce > 2000:
        score += 0.2
        signals.append({
            "label":  "FII Bought Calls",
            "change": fii_ce,
            "impact": "Bullish Momentum Expected",
            "weight": "MEDIUM",
            "color":  "#22c55e",
        })

    # FII bought puts → hedging = cautious/bearish
    if fii_pe > 2000:
        score -= 0.4
        signals.append({
            "label":  "FII Bought Puts",
            "change": fii_pe,
            "impact": "Hedging / Cautious (Bearish)",
            "weight": "MEDIUM",
            "color":  "#f43f5e",
        })
    elif fii_pe < -2000:
        score += 0.3
        signals.append({
            "label":  "FII Sold Puts",
            "change": fii_pe,
            "impact": "Confident (Bullish Support)",
            "weight": "MEDIUM",
            "color":  "#22c55e",
        })

    # DII futures support
    if dii_fut > 5000:
        score += 0.4
        signals.append({
            "label":  "DII Long Futures",
            "change": dii_fut,
            "impact": "Institutional Support (Bullish)",
            "weight": "MEDIUM",
            "color":  "#22c55e",
        })
    elif dii_fut < -5000:
        score -= 0.3
        signals.append({
            "label":  "DII Short Futures",
            "change": dii_fut,
            "impact": "Institutional Selling (Bearish)",
            "weight": "MEDIUM",
            "color":  "#ef4444",
        })

    # Translate score → pts estimate
    abs_s = abs(score)
    if abs_s > 2.5:
        pts_low, pts_high = 250, 500
    elif abs_s > 1.5:
        pts_low, pts_high = 150, 300
    elif abs_s > 0.8:
        pts_low, pts_high = 80, 200
    elif abs_s > 0.3:
        pts_low, pts_high = 40, 100
    else:
        pts_low, pts_high = 0, 50

    if score > 0.3:
        direction = "Bullish"
        color     = "#22c55e"
        pts_label = f"+{pts_low} to +{pts_high} pts"
    elif score < -0.3:
        direction = "Bearish"
        color     = "#ef4444"
        pts_label = f"-{pts_low} to -{pts_high} pts"
    else:
        direction = "Neutral / Sideways"
        color     = "#94a3b8"
        pts_label = f"±{pts_high} pts"

    return {
        "score":     round(score, 2),
        "direction": direction,
        "pts_label": pts_label,
        "color":     color,
        "signals":   signals,
    }


def _fetch_fii_data_sync() -> Dict:
    """
    Fetch FII/DII activity from NSE F&O participant CSV archives.
    Works reliably for last 3 trading days.
    """
    from curl_cffi import requests as cffi_req

    s = cffi_req.Session(impersonate="chrome120")
    s.get("https://www.nseindia.com/", timeout=8, headers={"Accept": "text/html"})

    def _trading_days_back(n: int = 5):
        """
        Return last n weekday dates to try.
        After 6 PM IST: also include today first (NSE uploads by ~6 PM).
        """
        from zoneinfo import ZoneInfo
        ist = datetime.now(ZoneInfo("Asia/Kolkata"))
        days = []
        d = ist.date()
        # After 6 PM on a weekday → today's data might be available
        if ist.hour >= 18 and d.weekday() < 5:
            days.append(d)
        # Then go backwards
        while len(days) < n:
            d -= timedelta(days=1)
            if d.weekday() < 5:   # Mon-Fri
                days.append(d)
        return days

    trading_days = _trading_days_back(5)   # try 5 in case some are holidays
    history = []

    for td in trading_days:
        if len(history) >= 3:
            break
        ds = td.strftime("%d%m%Y")
        url = f"https://archives.nseindia.com/content/nsccl/fao_participant_vol_{ds}.csv"
        try:
            r = s.get(url, timeout=8)
            if r.status_code != 200 or r.text.strip().startswith("<"):
                continue
            parsed = _parse_fao_csv(r.text)
            if not parsed:
                continue
            fii    = parsed.get("fii",    {})
            dii    = parsed.get("dii",    {})
            pro    = parsed.get("pro",    {})
            retail = parsed.get("retail", {})
            net_idx = fii.get("net_index", 0)

            # Full participant breakdown for table display
            participants = {
                "FII":    fii,
                "PRO":    pro,
                "DII":    dii,
                "RETAIL": retail,
            }

            history.append({
                "date": td.strftime("%d-%b-%Y"),
                "fii":  {
                    "buy":  fii.get("fi_long", 0),
                    "sell": fii.get("fi_short", 0),
                    "net":  net_idx,
                    "net_total": fii.get("net_total", 0),
                    "total_long": fii.get("total_long", 0),
                    "total_short": fii.get("total_short", 0),
                },
                "dii": {
                    "buy":  dii.get("fi_long", 0),
                    "sell": dii.get("fi_short", 0),
                    "net":  dii.get("net_index", 0),
                    "net_total": dii.get("net_total", 0),
                },
                "participants": participants,
                "classification": _classify_fii_fo(net_idx),
                "nifty_impact": _compute_nifty_fo_impact(
                    {"fii": fii, "dii": dii, "pro": pro}
                ),
            })
        except Exception as e:
            logger.debug(f"FAO CSV fetch failed for {ds}: {e}")
            continue

    if not history:
        return {}

    # Latest entry = today/most recent day
    latest = history[0]
    trend  = [{"date": h["date"], "net": h["fii"]["net"]} for h in history]

    # Momentum
    momentum = "Neutral"
    nets = [h["fii"]["net"] for h in history]
    if len(nets) >= 3:
        if all(n > 5000 for n in nets[:3]):   momentum = "Strong Bullish (3+ days long)"
        elif all(n > 0  for n in nets[:3]):   momentum = "Mild Bullish (3 days net long)"
        elif all(n < -5000 for n in nets[:3]):momentum = "Strong Bearish (3+ days short)"
        elif all(n < 0  for n in nets[:3]):   momentum = "Mild Bearish (3 days net short)"

    cls = latest["classification"]
    return {
        "date":           latest["date"],
        "fii":            latest["fii"],
        "dii":            latest["dii"],
        "participants":   latest.get("participants", {}),
        "nifty_impact":   latest.get("nifty_impact", {}),
        "classification": cls,
        "momentum":       momentum,
        "trend":          trend,
        "history":        history,
        "source":         "NSE F&O Archive",
        "note":           "Data: NSE F&O Participant-wise Position (Contracts)",
    }


def _classify_fii_fo(net_contracts: int) -> Dict:
    """Classify FII based on F&O net index futures contracts."""
    if   net_contracts >  20000: return {"action": "Heavy Buying",    "nifty": "Strong Bullish",  "move": "+150 to +400 pts", "color": "#22c55e"}
    elif net_contracts >   5000: return {"action": "Moderate Buying", "nifty": "Mild Bullish",    "move": "+50 to +150 pts",  "color": "#86efac"}
    elif net_contracts >  -5000: return {"action": "Neutral",         "nifty": "Sideways",        "move": "-100 to +100 pts", "color": "#94a3b8"}
    elif net_contracts > -20000: return {"action": "Mild Selling",    "nifty": "Mild Bearish",    "move": "-50 to -150 pts",  "color": "#fca5a5"}
    else:                        return {"action": "Heavy Selling",   "nifty": "Bearish",         "move": "-150 to -400 pts", "color": "#ef4444"}


def _ist_now():
    """Current datetime in IST (UTC+5:30)."""
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Asia/Kolkata"))


def _last_trading_day_for_fii() -> str:
    """
    Determine which trading day's FII data we should display:
    - NSE archives upload F&O participant data ~6 PM IST each trading day
    - Before 6 PM IST → show previous trading day's data
    - After 6 PM IST  → show today's data (if it's a weekday)
    Returns a date string in 'DDMMYYYY' format (for NSE archive URL).
    """
    ist = _ist_now()
    d = ist.date()
    # Before 6 PM or weekend → go back one day
    if ist.hour < 18 or d.weekday() >= 5:
        d -= timedelta(days=1)
    # Skip to nearest previous weekday (Mon-Fri)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d.strftime("%d%m%Y"), d.strftime("%d-%b-%Y")


def _fii_data_availability_info() -> Dict:
    """
    Returns info about FII data availability window based on IST time.
    Used to inform the frontend about current data freshness.
    """
    ist = _ist_now()
    ist_hour = ist.hour
    ist_min  = ist.minute
    is_weekday = ist.date().weekday() < 5

    if not is_weekday:
        return {
            "status": "weekend",
            "message": "Market closed (Weekend). Showing last available data.",
            "next_update": "Monday 6 PM IST",
            "show_timer": False,
        }

    if ist_hour < 18:
        # Data not yet available for today
        mins_left = (18 - ist_hour) * 60 - ist_min
        hrs_left  = mins_left // 60
        m_left    = mins_left % 60
        time_str  = f"{hrs_left}h {m_left}m" if hrs_left > 0 else f"{m_left}m"
        return {
            "status": "pre_release",
            "message": f"Today's NSE F&O data available at 6 PM IST (~{time_str} away).",
            "next_update": "Today 6 PM IST",
            "show_timer": True,
            "mins_to_release": mins_left,
        }
    else:
        return {
            "status": "released",
            "message": "Today's data released. Fetching from NSE F&O archives...",
            "next_update": "Tomorrow 6 PM IST",
            "show_timer": False,
        }


async def fetch_fii_intel(db=None) -> Dict:
    """
    Public API — FII/DII data with IST-aware date logic and MongoDB persistence.
    
    Logic:
    - Before 6 PM IST → previous trading day's data
    - After 6 PM IST  → today's data
    - Tries NSE archives (blocked from cloud IPs) → falls back to MongoDB cache
    - Stores any successful fetch to MongoDB for persistence across restarts
    """
    now       = datetime.now(timezone.utc)
    date_code, date_label = _last_trading_day_for_fii()
    avail_info = _fii_data_availability_info()

    # ── 1. Check in-memory cache (1 hour TTL) ─────────────────────────────────
    cached = _FII_CACHE.get("fii")
    if cached and (now - cached["ts"]).total_seconds() < _FII_CACHE_TTL:
        result = cached["data"].copy()
        result["availability"] = avail_info
        result["data_for_date"] = date_label
        return result

    # ── 2. Try live NSE fetch ──────────────────────────────────────────────────
    loop  = asyncio.get_event_loop()
    data  = await loop.run_in_executor(None, _fetch_fii_data_sync)

    if data:
        # Successful fetch → persist to MongoDB
        data["data_for_date"] = date_label
        data["fetched_at_ist"] = _ist_now().strftime("%d-%b-%Y %I:%M %p IST")
        if db is not None:
            try:
                await db["fii_intel_cache"].replace_one(
                    {"_id": "latest"},
                    {"_id": "latest", **{k: v for k, v in data.items()}, "cached_at": now.isoformat()},
                    upsert=True
                )
            except Exception as ex:
                logger.debug(f"FII MongoDB persist failed: {ex}")

        _FII_CACHE["fii"] = {"data": data, "ts": now}
        data["availability"] = avail_info
        return data

    # ── 3. Try MongoDB for last known good data ────────────────────────────────
    if db is not None:
        try:
            doc = await db["fii_intel_cache"].find_one({"_id": "latest"})
            if doc:
                doc.pop("_id", None)
                doc.pop("cached_at", None)
                doc["source"]         = "mongodb_cache"
                doc["availability"]   = avail_info
                doc["data_for_date"]  = doc.get("data_for_date", date_label)
                doc["cache_note"]     = f"NSE archives blocked from cloud. Showing last saved data ({doc.get('fetched_at_ist', 'unknown time')})."
                # Also store in memory so we don't hit MongoDB every time
                _FII_CACHE["fii"] = {"data": doc, "ts": now}
                return doc
        except Exception as ex:
            logger.debug(f"FII MongoDB read failed: {ex}")

    # ── 4. Full unavailability ─────────────────────────────────────────────────
    return {
        "source":        "unavailable",
        "availability":  avail_info,
        "data_for_date": date_label,
        "message":       "NSE F&O archives are not accessible from cloud servers (IP-level block). Data will auto-update when accessible.",
        "nse_url":       "https://www.nseindia.com/report-detail/fo_participant_vol",
    }


# ── Main Fetch ─────────────────────────────────────────────────────────────────

def _fetch_single_ticker(sym: str, key: str) -> Dict[str, float]:
    """Fetch one yfinance ticker — used in parallel pool."""
    import yfinance as yf
    out: Dict[str, float] = {}
    try:
        info  = yf.Ticker(sym).fast_info
        price = getattr(info, "last_price", None)
        prev  = getattr(info, "previous_close", None)
        if price:
            out[key] = float(price)
            if prev and prev > 0:
                out[f"{key}_prev"]    = float(prev)
                out[f"{key}_chg_pct"] = round((float(price) - float(prev)) / float(prev) * 100, 2)
    except Exception as e:
        logger.debug(f"yfinance fetch failed for {sym}: {e}")
    return out


def _fetch_yf_prices() -> Dict[str, float]:
    """Parallel yfinance multi-ticker fetch (4 threads simultaneously)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    tickers_map = {
        "BZ=F":       "brent",
        "^INDIAVIX":  "vix",
        "^NSEI":      "nifty",
        "^IXIC":      "nasdaq",
        "^HSI":       "hang_seng",
        "USDINR=X":   "usdinr",
    }
    results: Dict[str, float] = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(_fetch_single_ticker, sym, key): key
                   for sym, key in tickers_map.items()}
        for fut in as_completed(futures):
            try:
                results.update(fut.result())
            except Exception:
                pass
    return results


async def _do_refresh() -> None:
    """Background refresh — updates cache without blocking the caller."""
    global _refreshing
    _refreshing = True
    try:
        await _build_intel()
    except Exception as e:
        logger.warning(f"Background market-intel refresh failed: {e}")
    finally:
        _refreshing = False


async def _build_intel() -> Dict:
    """Core fetch-and-compute logic that writes to cache and returns data."""
    now  = datetime.now(timezone.utc)
    loop = asyncio.get_event_loop()

    # Phase 1: parallel prices + regulatory
    yf_task  = loop.run_in_executor(None, _fetch_yf_prices)
    reg_task = asyncio.ensure_future(_fetch_regulatory_sentiment())
    yf_data, regulatory = await asyncio.gather(yf_task, reg_task)

    # Brent: prefer history-based price (avoids futures rollover artifacts in fast_info)
    # Will be overridden by more reliable history data in Phase 2 below
    brent = yf_data.get("brent", 0.0)   # 0 = unknown until history confirms
    vix   = yf_data.get("vix",   15.0)
    nifty = yf_data.get("nifty", 24000.0)
    nasdaq = yf_data.get("nasdaq", 0.0)
    hang_seng = yf_data.get("hang_seng", 0.0)
    brent_chg     = yf_data.get("brent_chg_pct",     0.0)
    vix_chg       = yf_data.get("vix_chg_pct",       0.0)
    nifty_chg     = yf_data.get("nifty_chg_pct",     0.0)
    nasdaq_chg    = yf_data.get("nasdaq_chg_pct",    0.0)
    hang_seng_chg = yf_data.get("hang_seng_chg_pct", 0.0)
    nasdaq_prev = yf_data.get("nasdaq_prev", nasdaq)
    usdinr      = yf_data.get("usdinr", 0.0)
    usdinr_chg  = yf_data.get("usdinr_chg_pct", 0.0)

    # Nasdaq absolute point change (for Nifty correlation)
    nasdaq_pts = round(nasdaq - nasdaq_prev, 2) if nasdaq_prev else 0.0

    # Nasdaq → Nifty projected impact
    # 100 pts up → Nifty +80 to +150 | 100 pts down → Nifty -100 to -200
    if nasdaq_pts > 0:
        nifty_impact_low  = round(nasdaq_pts * 0.80)
        nifty_impact_high = round(nasdaq_pts * 1.50)
        nasdaq_nifty_label = f"+{nifty_impact_low} to +{nifty_impact_high} pts"
        nasdaq_nifty_color = "#22c55e"
        nasdaq_nifty_signal = "Bullish for Nifty"
    elif nasdaq_pts < 0:
        nifty_impact_low  = round(nasdaq_pts * 1.00)
        nifty_impact_high = round(nasdaq_pts * 2.00)
        nasdaq_nifty_label = f"{nifty_impact_low} to {nifty_impact_high} pts"
        nasdaq_nifty_color = "#ef4444"
        nasdaq_nifty_signal = "Bearish for Nifty"
    else:
        nasdaq_nifty_label = "Neutral"
        nasdaq_nifty_color = "#94a3b8"
        nasdaq_nifty_signal = "Neutral"

    # Hang Seng → Nifty projected impact (% based)
    # +1% HS → Nifty +50 to +100 pts | -1% HS → Nifty -70 to -150 pts
    if hang_seng_chg > 0:
        hs_nifty_low  = round(hang_seng_chg * 50)
        hs_nifty_high = round(hang_seng_chg * 100)
        hs_nifty_label  = f"+{hs_nifty_low} to +{hs_nifty_high} pts"
        hs_nifty_color  = "#22c55e"
        hs_nifty_signal = "Bullish for Nifty"
    elif hang_seng_chg < 0:
        hs_nifty_low  = round(hang_seng_chg * 70)
        hs_nifty_high = round(hang_seng_chg * 150)
        hs_nifty_label  = f"{hs_nifty_low} to {hs_nifty_high} pts"
        hs_nifty_color  = "#ef4444"
        hs_nifty_signal = "Bearish for Nifty"
    else:
        hs_nifty_label  = "Neutral"
        hs_nifty_color  = "#94a3b8"
        hs_nifty_signal = "Neutral"

    # Phase 2: parallel GIFT + history fetches + breadth (PCR runs in background separately)
    gift_task          = loop.run_in_executor(None, _fetch_gift_nifty, nifty)
    vix_hist_task      = loop.run_in_executor(None, _fetch_vix_history)
    brent_hist_task    = loop.run_in_executor(None, _fetch_brent_history)
    nasdaq_hist_task   = loop.run_in_executor(None, _fetch_nasdaq_history)
    nifty_hist_task    = loop.run_in_executor(None, _fetch_nifty_history)
    gift_hist_task     = loop.run_in_executor(None, _fetch_gift_nifty_history)
    hs_hist_task       = loop.run_in_executor(None, _fetch_hang_seng_history)
    breadth_task       = loop.run_in_executor(None, _fetch_nifty_breadth_sync)
    actual_move_task   = loop.run_in_executor(None, _fetch_nifty_today_actual)
    news_task          = loop.run_in_executor(None, _fetch_nifty_market_news_sync)
    gift_nifty, vix_hist, brent_hist, nasdaq_hist, nifty_hist, gift_hist, hs_hist, breadth_data, today_actual, market_news_data = await asyncio.gather(
        gift_task, vix_hist_task, brent_hist_task, nasdaq_hist_task, nifty_hist_task, gift_hist_task, hs_hist_task, breadth_task, actual_move_task, news_task)
    expiry_info  = _next_expiry_info()
    gift_premium = round(gift_nifty - nifty, 1)

    # ── Brent: override with history-based reliable values ─────────────────────
    # history gives cleaner day-change without futures-rollover artifacts
    if brent_hist.get("brent_current"):
        brent = brent_hist["brent_current"]
        if brent_hist.get("brent_chg_day") is not None:
            brent_chg = brent_hist["brent_chg_day"]
    elif not brent:           # fast_info also failed — keep 0 rather than fake 85
        brent = 0.0
        brent_chg = 0.0
    # ───────────────────────────────────────────────────────────────────────────

    vix_52w_high   = vix_hist.get("vix_52w_high", 0.0)
    vix_52w_low    = vix_hist.get("vix_52w_low",  0.0)
    vix_percentile = _calc_vix_percentile(vix, vix_52w_low, vix_52w_high)

    if   vix_percentile >= 75: vix_zone, vix_zone_color = "Extreme Fear", "#ef4444"
    elif vix_percentile >= 50: vix_zone, vix_zone_color = "Elevated",     "#f97316"
    elif vix_percentile >= 25: vix_zone, vix_zone_color = "Moderate",     "#eab308"
    else:                      vix_zone, vix_zone_color = "Low / Calm",   "#22c55e"

    brent_score = _score_brent(brent)
    vix_score   = _score_vix(vix)
    reg_score   = _score_regulatory(regulatory)
    gift_score  = _score_gift(gift_premium)
    total_score = round(brent_score + vix_score + reg_score + gift_score, 2)
    bias        = _determine_bias(total_score)

    # Today / Tomorrow move predictions
    moves = _compute_today_tomorrow_moves(
        nifty, vix, gift_premium, total_score, nasdaq_chg, hang_seng_chg
    )

    # PCR data — read from background cache (never blocks market-intel)
    _PCR_UNAVAILABLE = {
        "pcr": 0.0, "total_call_oi": 0, "total_put_oi": 0,
        "signal": "UNAVAILABLE", "signal_label": "PCR Unavailable",
        "signal_color": "#64748b", "signal_bg": "#64748b18",
        "description": "NSE data temporarily unavailable",
        "caution": False, "caution_label": "", "source": "unavailable",
    }
    pcr_data = _pcr_cache.get("nifty_pcr", {}).get("data")
    if not pcr_data:
        # Cache is empty (first call before background loop runs) — compute inline
        import time as _time
        try:
            vix_result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, _fetch_vix_derived_pcr),
                timeout=6.0,
            )
            if vix_result:
                pcr_data = vix_result
                _pcr_cache["nifty_pcr"] = {"data": vix_result, "ts_epoch": _time.time()}
                _PCR_HISTORY.append({"ts": datetime.now(timezone.utc).isoformat(), "pcr": vix_result["pcr"]})
        except Exception:
            pcr_data = None
    if not pcr_data:
        pcr_data = _PCR_UNAVAILABLE
    pcr_value          = pcr_data.get("pcr", 0.0)
    pcr_price_action   = _pcr_price_action_signal(pcr_value, nifty_chg) if pcr_value > 0 else {
        "signal": "UNAVAILABLE", "label": "PCR Unavailable", "color": "#64748b", "icon": "NEUTRAL", "detail": ""
    }

    data = {
        "brent": round(brent, 2), "brent_chg_pct": brent_chg,
        "brent_chg_week": brent_hist.get("brent_chg_week"),
        "brent_chg_month": brent_hist.get("brent_chg_month"),
        "vix": round(vix, 2), "vix_chg_pct": vix_chg,
        "vix_chg_week": vix_hist.get("vix_chg_week"),
        "vix_chg_month": vix_hist.get("vix_chg_month"),
        "nifty": round(nifty, 2), "nifty_chg_pct": nifty_chg,
        "nifty_chg_week":  nifty_hist.get("nifty_chg_week"),
        "nifty_chg_month": nifty_hist.get("nifty_chg_month"),
        "nasdaq": round(nasdaq, 2), "nasdaq_chg_pct": nasdaq_chg,
        "nasdaq_pts": nasdaq_pts,
        "nasdaq_chg_week":  nasdaq_hist.get("nasdaq_chg_week"),
        "nasdaq_chg_month": nasdaq_hist.get("nasdaq_chg_month"),
        "nasdaq_nifty_label": nasdaq_nifty_label,
        "nasdaq_nifty_color": nasdaq_nifty_color,
        "nasdaq_nifty_signal": nasdaq_nifty_signal,
        "hang_seng": round(hang_seng, 2), "hang_seng_chg_pct": hang_seng_chg,
        "hang_seng_chg_week":  hs_hist.get("hang_seng_chg_week"),
        "hang_seng_chg_month": hs_hist.get("hang_seng_chg_month"),
        "hs_nifty_label": hs_nifty_label,
        "hs_nifty_color": hs_nifty_color,
        "hs_nifty_signal": hs_nifty_signal,
        "gift_nifty": round(gift_nifty, 2), "gift_premium": gift_premium,
        "gift_chg_week":  gift_hist.get("gift_chg_week"),
        "gift_chg_month": gift_hist.get("gift_chg_month"),
        "regulatory": regulatory,
        "vix_52w_high": vix_52w_high, "vix_52w_low": vix_52w_low,
        "vix_percentile": vix_percentile, "vix_zone": vix_zone,
        "vix_zone_color": vix_zone_color, "expiry": expiry_info,
        "bias": bias["label"], "bias_color": bias["color"],
        "move_label": bias["move_label"], "move_min": bias["move_min"],
        "move_max": bias["move_max"], "probability": bias["probability"],
        "action": bias["action"], "gift_color_label": bias["gift_color"],
        "today_move":    moves["today_move"],
        "tomorrow_move": moves["tomorrow_move"],
        "pcr":           pcr_data,
        "pcr_price_action": pcr_price_action,
        "pcr_history":   _PCR_HISTORY[-300:],  # last 300 pts (10 hrs) for chart
        "scores": {
            "brent": brent_score, "vix": vix_score,
            "regulatory": reg_score, "gift": gift_score, "total": total_score,
        },
        "matrix": BIAS_LEVELS,
        "breadth": breadth_data if breadth_data else {},
        "today_actual": today_actual,
        "market_news": market_news_data if market_news_data else {"available": False, "items": []},
        "geo_risk":    _compute_geo_risk(market_news_data.get("items", []) if market_news_data else []),
        "usdinr":      round(usdinr, 2) if usdinr else None,
        "usdinr_chg_pct": round(usdinr_chg, 3) if usdinr_chg else None,
        "updated_at": now.isoformat(),
    }
    _cache["intel"] = {"data": data, "ts": now}
    return data


async def fetch_market_intel() -> Dict:
    """
    Public API — stale-while-revalidate cache strategy.
    • Fresh (< 15 min): return instantly from cache.
    • Stale (15-30 min): return old cache immediately + trigger background refresh.
    • Expired (> 30 min) or cold start: block and fetch fresh data.
    """
    global _refreshing
    now    = datetime.now(timezone.utc)
    cached = _cache.get("intel")

    if cached:
        age = (now - cached["ts"]).total_seconds()
        if age < CACHE_TTL:
            return cached["data"]          # Fresh — instant
        if age < CACHE_STALE_TTL:
            if not _refreshing:            # Trigger background refresh once
                asyncio.ensure_future(_do_refresh())
            return cached["data"]          # Return stale immediately

    # Cold start or very stale — block and fetch
    return await _build_intel()

 


async def pcr_background_loop():
    """
    Run PCR fetch in a background asyncio loop — completely independent of
    market-intel requests so it never blocks the thread pool.
    First attempt after 10s (give server time to start), then every 2 minutes.
    """
    import time as _time
    await asyncio.sleep(10)   # startup grace period
    while True:
        try:
            loop = asyncio.get_event_loop()
            await asyncio.wait_for(
                loop.run_in_executor(None, _fetch_nifty_pcr_sync),
                timeout=10.0,
            )
        except Exception:
            pass
        await asyncio.sleep(120)  # 2-minute refresh cycle
