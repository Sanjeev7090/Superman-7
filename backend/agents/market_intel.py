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

Decision Matrix:
  Strong Bullish : Brent < 82, VIX < 14, Positive regulatory, GIFT Green   → +300 to +600 pts
  Mild Bullish   : Brent 80-83, VIX 13-15, Neutral, GIFT Mild Green        → +150 to +350 pts
  Neutral        : Brent 82-85, VIX 14-16, Neutral, GIFT Flat              → -150 to +150 pts
  Mild Bearish   : Brent 85+,  VIX 15+,  Neutral, GIFT Red                → -150 to -350 pts
  Strong Bearish : Brent 87+,  VIX 16+,  Negative, GIFT Strong Red        → -400 to -800 pts
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

_cache: Dict[str, Any] = {}
CACHE_TTL       = 900   # 15 min — fresh threshold
CACHE_STALE_TTL = 1800  # 30 min — serve stale while refreshing
_refreshing     = False  # prevent concurrent background refreshes


# ── Bias Levels ────────────────────────────────────────────────────────────────

BIAS_LEVELS = [
    {
        "label": "Strong Bullish",
        "score_min": 2.5,
        "score_max": 99,
        "move_label": "+300 to +600 pts",
        "move_min": 300,
        "move_max": 600,
        "probability": "High",
        "action": "Aggressive Long (Energy + Banking)",
        "color": "#22c55e",
        "gift_color": "Green",
        "brent_ref": "< $82",
        "vix_ref": "< 14",
        "regulatory_ref": "Positive",
    },
    {
        "label": "Mild Bullish",
        "score_min": 0.8,
        "score_max": 2.5,
        "move_label": "+150 to +350 pts",
        "move_min": 150,
        "move_max": 350,
        "probability": "Medium-High",
        "action": "Selective Long",
        "color": "#86efac",
        "gift_color": "Mild Green",
        "brent_ref": "$80-83",
        "vix_ref": "13-15",
        "regulatory_ref": "Neutral",
    },
    {
        "label": "Neutral",
        "score_min": -0.5,
        "score_max": 0.8,
        "move_label": "-150 to +150 pts (Sideways)",
        "move_min": -150,
        "move_max": 150,
        "probability": "High",
        "action": "Range trading, small positions",
        "color": "#94a3b8",
        "gift_color": "Flat",
        "brent_ref": "$82-85",
        "vix_ref": "14-16",
        "regulatory_ref": "Neutral",
    },
    {
        "label": "Mild Bearish",
        "score_min": -2.0,
        "score_max": -0.5,
        "move_label": "-150 to -350 pts",
        "move_min": -350,
        "move_max": -150,
        "probability": "High",
        "action": "Selective Energy Long, Profit booking",
        "color": "#fca5a5",
        "gift_color": "Red/Mild Red",
        "brent_ref": "$85+",
        "vix_ref": "15+",
        "regulatory_ref": "Neutral",
    },
    {
        "label": "Strong Bearish",
        "score_min": -99,
        "score_max": -2.0,
        "move_label": "-400 to -800 pts",
        "move_min": -800,
        "move_max": -400,
        "probability": "Medium",
        "action": "Hedging, Cash increase",
        "color": "#ef4444",
        "gift_color": "Strong Red",
        "brent_ref": "$87+",
        "vix_ref": "16+",
        "regulatory_ref": "Negative",
    },
]


# ── Scoring ────────────────────────────────────────────────────────────────────

def _score_brent(brent: float) -> float:
    if brent < 80:
        return 2.5
    elif brent < 82:
        return 2.0
    elif brent < 84:
        return 1.0
    elif brent < 86:
        return 0.0
    elif brent < 88:
        return -1.0
    else:
        return -2.0


def _score_vix(vix: float) -> float:
    if vix < 12:
        return 1.5
    elif vix < 14:
        return 1.0
    elif vix < 15:
        return 0.5
    elif vix < 16:
        return 0.0
    elif vix < 18:
        return -0.5
    elif vix < 20:
        return -1.0
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
    """Fetch Brent Crude weekly/monthly change."""
    import yfinance as yf
    try:
        hist = yf.Ticker("BZ=F").history(period="3mo")
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
            "brent_chg_week":  _pct(5),
            "brent_chg_month": _pct(21),
        }
    except Exception as e:
        logger.debug(f"Brent history fetch failed: {e}")
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


def _parse_fao_csv(text: str) -> Optional[Dict]:
    """
    Parse NSE F&O participant CSV:
    archives.nseindia.com/content/nsccl/fao_participant_vol_{DDMMYYYY}.csv
    Returns FII and DII index futures net-position summary.
    """
    try:
        import csv, io
        lines = [l for l in text.splitlines() if l.strip() and not l.startswith('"')]
        reader = csv.DictReader(lines)
        rows = {r.get("Client Type","").strip().upper(): r for r in reader}

        def _n(row, key):
            val = row.get(key, "0") or "0"
            return int(str(val).replace(",","").strip() or "0")

        result = {}
        for party in ("FII", "DII"):
            row = rows.get(party)
            if not row: continue
            fi_long  = _n(row, "Future Index Long")
            fi_short = _n(row, "Future Index Short")
            fs_long  = _n(row, "Future Stock Long")
            fs_short = _n(row, "Future Stock Short")
            opt_long = _n(row, "Total Long Contracts")
            opt_short= _n(row, "Total Short Contracts")

            net_idx  = fi_long - fi_short
            net_total= opt_long - opt_short
            result[party.lower()] = {
                "fi_long":   fi_long,
                "fi_short":  fi_short,
                "net_index": net_idx,
                "net_total": net_total,
                "total_long": opt_long,
                "total_short": opt_short,
            }
        return result if result else None
    except Exception as e:
        logger.debug(f"FAO CSV parse error: {e}")
        return None


def _fetch_fii_data_sync() -> Dict:
    """
    Fetch FII/DII activity from NSE F&O participant CSV archives.
    Works reliably for last 3 trading days.
    """
    from curl_cffi import requests as cffi_req

    s = cffi_req.Session(impersonate="chrome120")
    s.get("https://www.nseindia.com/", timeout=8, headers={"Accept": "text/html"})

    def _trading_days_back(n: int = 5):
        """Return last n calendar days that are weekdays."""
        days = []
        d = datetime.now().date()
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
            fii = parsed.get("fii", {})
            dii = parsed.get("dii", {})
            net_idx = fii.get("net_index", 0)
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
                "classification": _classify_fii_fo(net_idx),
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


async def fetch_fii_intel() -> Dict:
    """Public API — FII/DII data with 1-hour cache."""
    now    = datetime.now(timezone.utc)
    cached = _FII_CACHE.get("fii")
    if cached and (now - cached["ts"]).total_seconds() < _FII_CACHE_TTL:
        return cached["data"]

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _fetch_fii_data_sync)

    if not data:
        data = {"source": "unavailable", "message": "NSE FII data available after 6 PM IST"}

    _FII_CACHE["fii"] = {"data": data, "ts": now}
    return data


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
    }
    results: Dict[str, float] = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
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

    brent = yf_data.get("brent", 85.0)
    vix   = yf_data.get("vix",   15.0)
    nifty = yf_data.get("nifty", 24000.0)
    nasdaq = yf_data.get("nasdaq", 0.0)
    brent_chg  = yf_data.get("brent_chg_pct",  0.0)
    vix_chg    = yf_data.get("vix_chg_pct",    0.0)
    nifty_chg  = yf_data.get("nifty_chg_pct",  0.0)
    nasdaq_chg = yf_data.get("nasdaq_chg_pct", 0.0)
    nasdaq_prev = yf_data.get("nasdaq_prev", nasdaq)

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
        nifty_impact_low  = 0
        nifty_impact_high = 0
        nasdaq_nifty_label = "Neutral"
        nasdaq_nifty_color = "#94a3b8"
        nasdaq_nifty_signal = "Neutral"

    # Phase 2: parallel GIFT + history fetches
    gift_task          = loop.run_in_executor(None, _fetch_gift_nifty, nifty)
    vix_hist_task      = loop.run_in_executor(None, _fetch_vix_history)
    brent_hist_task    = loop.run_in_executor(None, _fetch_brent_history)
    nasdaq_hist_task   = loop.run_in_executor(None, _fetch_nasdaq_history)
    nifty_hist_task    = loop.run_in_executor(None, _fetch_nifty_history)
    gift_hist_task     = loop.run_in_executor(None, _fetch_gift_nifty_history)
    gift_nifty, vix_hist, brent_hist, nasdaq_hist, nifty_hist, gift_hist = await asyncio.gather(
        gift_task, vix_hist_task, brent_hist_task, nasdaq_hist_task, nifty_hist_task, gift_hist_task)

    expiry_info  = _next_expiry_info()
    gift_premium = round(gift_nifty - nifty, 1)

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
        "scores": {
            "brent": brent_score, "vix": vix_score,
            "regulatory": reg_score, "gift": gift_score, "total": total_score,
        },
        "matrix": BIAS_LEVELS,
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

 