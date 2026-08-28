"""
Trade Setup Suggester — /api/trade-setup/suggest
Combines DOOM + GEX + OI + RSI/MACD + PCR to suggest:
  direction (BUY CE / BUY PE / NO TRADE)
  best strike price
  entry range, SL, T1, T2
  risk:reward ratio
Cache: 2 minutes
"""
import asyncio, math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api/trade-setup")
IST    = ZoneInfo("Asia/Kolkata")
_CACHE: dict = {}
_TTL   = 120  # 2 min


# ── helpers ───────────────────────────────────────────────────────────────────

def _sf(v, d=0.0):
    try: return float(v) if v is not None else d
    except Exception: return d


def _atm(spot: float, step: int = 50) -> int:
    """Nearest ATM strike rounded to step (50 for NIFTY)."""
    return int(round(spot / step) * step)


def _signal_score(doom, is_pos_gex, pcr, rsi, macd_hist, spot, max_pain) -> tuple[int, list]:
    """Returns (score, reasons). +ve = CE, -ve = PE."""
    score   = 0
    reasons = []

    # DOOM
    if doom >= 6:    score += 3; reasons.append(f"DOOM +{doom:.0f} — Strong Bull bias")
    elif doom >= 3:  score += 2; reasons.append(f"DOOM +{doom:.0f} — Bull bias")
    elif doom >= 1:  score += 1; reasons.append(f"DOOM +{doom:.0f} — Mild Bull")
    elif doom <= -6: score -= 3; reasons.append(f"DOOM {doom:.0f} — Strong Bear bias")
    elif doom <= -3: score -= 2; reasons.append(f"DOOM {doom:.0f} — Bear bias")
    elif doom <= -1: score -= 1; reasons.append(f"DOOM {doom:.0f} — Mild Bear")
    else:            reasons.append("DOOM 0 — Neutral, no directional bias")

    # GEX
    if is_pos_gex:
        score += 1; reasons.append("GEX Positive — Dealers buying dips, range-bound support")
    else:
        reasons.append("GEX Negative — Explosive move possible (both sides), no dealer support")

    # PCR
    if pcr > 1.3:
        score += 1; reasons.append(f"PCR {pcr:.2f} — Heavy put writing, crowd bullish, squeeze fuel")
    elif pcr > 1.1:
        score += 1; reasons.append(f"PCR {pcr:.2f} — Slightly bullish put writers")
    elif pcr < 0.7:
        score -= 1; reasons.append(f"PCR {pcr:.2f} — Heavy call writing, dealers capping upside")
    elif pcr < 0.9:
        score -= 1; reasons.append(f"PCR {pcr:.2f} — Slightly bearish sentiment")
    else:
        reasons.append(f"PCR {pcr:.2f} — Balanced OI")

    # RSI
    if rsi < 30:
        score += 2; reasons.append(f"RSI {rsi:.0f} — Oversold, bounce probable")
    elif rsi < 42:
        score += 1; reasons.append(f"RSI {rsi:.0f} — Below midline, potential reversal zone")
    elif rsi > 70:
        score -= 2; reasons.append(f"RSI {rsi:.0f} — Overbought, profit-booking likely")
    elif rsi > 58:
        score -= 1; reasons.append(f"RSI {rsi:.0f} — Stretched, watch for rejection")
    else:
        reasons.append(f"RSI {rsi:.0f} — Neutral zone")

    # MACD histogram
    if macd_hist > 0.5:
        score += 1; reasons.append(f"MACD Hist +{macd_hist:.1f} — Positive momentum")
    elif macd_hist < -0.5:
        score -= 1; reasons.append(f"MACD Hist {macd_hist:.1f} — Negative momentum")

    # Max Pain pinning
    if max_pain > 0 and spot > 0:
        if spot < max_pain:
            score += 1; reasons.append(f"Spot {spot:.0f} below Max Pain {max_pain:.0f} — gravitational pull upward")
        elif spot > max_pain * 1.015:
            score -= 1; reasons.append(f"Spot {spot:.0f} above Max Pain {max_pain:.0f} — gravitational pull downward")

    return score, reasons


def _build_setup(spot, score, call_wall, put_wall, max_pain, sd1, reasons, gex_regime, is_pos_gex):
    atm = _atm(spot)
    abs_score = abs(score)

    # Direction
    if score >= 2:
        direction = "BUY CE"
        confidence = "HIGH" if score >= 4 else "MODERATE"
        conf_color = "#22c55e" if score >= 4 else "#f59e0b"
    elif score <= -2:
        direction = "BUY PE"
        confidence = "HIGH" if score <= -4 else "MODERATE"
        conf_color = "#ef4444" if score <= -4 else "#f97316"
    else:
        direction  = "NO TRADE"
        confidence = "LOW"
        conf_color = "#64748b"

    # Strike selection
    # For max movement:
    #   ATM  = highest gamma, moves fastest (best for confident setups)
    #   1OTM = better R:R but needs bigger move
    if direction == "NO TRADE":
        strike     = atm
        strike_str = f"{atm} CE / PE"
    elif direction == "BUY CE":
        if abs_score >= 4:
            strike = atm           # ATM — max gamma
            strike_str = f"{strike} CE"
        else:
            strike = atm + 50      # 1 OTM — better R:R
            strike_str = f"{strike} CE"
    else:  # BUY PE
        if abs_score >= 4:
            strike = atm           # ATM
            strike_str = f"{strike} PE"
        else:
            strike = atm - 50      # 1 OTM
            strike_str = f"{strike} PE"

    # Entry — current spot (enter near market)
    entry_low  = round(spot - 15)
    entry_high = round(spot + 15)

    # SL and Targets (NIFTY spot levels)
    if direction == "BUY CE":
        sl      = max(put_wall, round(spot - 1.3 * sd1))
        t1      = round(min(call_wall - 50, spot + 0.9 * sd1))
        t2      = round(spot + 1.8 * sd1)
        sl_pts  = round(spot - sl)
        t1_pts  = round(t1 - spot)
        t2_pts  = round(t2 - spot)
    elif direction == "BUY PE":
        sl      = min(call_wall, round(spot + 1.3 * sd1))
        t1      = round(max(put_wall + 50, spot - 0.9 * sd1))
        t2      = round(spot - 1.8 * sd1)
        sl_pts  = round(sl - spot)
        t1_pts  = round(spot - t1)
        t2_pts  = round(spot - t2)
    else:
        sl = put_wall; t1 = call_wall; t2 = max_pain
        sl_pts = t1_pts = t2_pts = 0

    # R:R
    rr_t1 = round(t1_pts / sl_pts, 2) if sl_pts > 0 else 0
    rr_t2 = round(t2_pts / sl_pts, 2) if sl_pts > 0 else 0

    # Option SL: 40% of entry premium (practical rule)
    opt_sl_note = "Option SL = entry premium ka 40% loss pe exit (e.g. ₹100 buy → exit at ₹60)"

    # Strike selection explanation
    why_strike_parts = []
    if direction != "NO TRADE":
        why_strike_parts.append(f"ATM = {atm} (spot {spot:.0f} rounded to nearest 50)")
        if abs_score >= 4:
            why_strike_parts.append(f"Score {score:+d} strong → ATM chose kiya (max gamma, max movement speed)")
        else:
            why_strike_parts.append(f"Score {score:+d} moderate → 1 OTM chose kiya ({strike}) — better R:R")
        why_strike_parts.append(f"GEX {gex_regime}: {'Dealers support moves from key levels' if is_pos_gex else 'Explosive volatility possible, strike exposure important'}")

    return {
        "direction":   direction,
        "confidence":  confidence,
        "conf_color":  conf_color,
        "score":       score,
        "strike":      strike_str,
        "strike_num":  strike,
        "entry_low":   entry_low,
        "entry_high":  entry_high,
        "sl_spot":     round(sl),
        "sl_pts":      sl_pts,
        "t1":          round(t1),
        "t1_pts":      t1_pts,
        "t2":          round(t2),
        "t2_pts":      t2_pts,
        "rr_t1":       rr_t1,
        "rr_t2":       rr_t2,
        "opt_sl_note": opt_sl_note,
        "why_strike":  why_strike_parts,
        "signals":     reasons,
        "sd1":         round(sd1),
        "call_wall":   round(call_wall),
        "put_wall":    round(put_wall),
        "max_pain":    round(max_pain),
        "atm":         atm,
    }


# ── data fetchers ─────────────────────────────────────────────────────────────

def _fetch_all_sync():
    """One call to fetch spot, VIX, RSI, MACD via yfinance."""
    try:
        import yfinance as yf
        nsei  = yf.Ticker("^NSEI")
        vindia = yf.Ticker("^INDIAVIX")
        nhist = nsei.history(period="20d",  interval="1h")
        vhist = vindia.history(period="2d", interval="1d")

        closes = []
        spot = vix = 0.0
        if nhist is not None and len(nhist) > 5:
            closes = [float(v) for v in nhist["Close"].dropna().tolist()]
            spot   = closes[-1]
        if vhist is not None and len(vhist) > 0:
            vix = float(vhist["Close"].dropna().iloc[-1])
        return {"spot": spot, "vix": vix, "closes": closes}
    except Exception:
        return {"spot": 0.0, "vix": 0.0, "closes": []}


async def _fetch_gex():
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get("http://localhost:8001/api/gex/nifty")
            if r.status_code == 200: return r.json()
    except Exception:
        pass
    return {}


async def _fetch_oi():
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get("http://localhost:8001/api/oi-indicator/nifty")
            if r.status_code == 200: return r.json()
    except Exception:
        pass
    return {}


async def _fetch_doom_db():
    try:
        async with httpx.AsyncClient(timeout=4) as c:
            r = await c.get("http://localhost:8001/api/doom/score")
            if r.status_code == 200: return r.json()
    except Exception:
        pass
    return {}


def _rsi_fast(closes, period=14):
    if len(closes) < period + 1: return 50.0
    d = [closes[i]-closes[i-1] for i in range(1, len(closes))]
    g = sum(x for x in d[-period:] if x > 0) / period
    l = sum(-x for x in d[-period:] if x < 0) / period
    return round(100 - 100/(1+(g/l if l else 999)), 1)


def _macd_hist_fast(closes):
    if len(closes) < 35: return 0.0
    def ema(d, s):
        k = 2/(s+1); r = [d[0]]
        for v in d[1:]: r.append(v*k+r[-1]*(1-k))
        return r
    m = [ema(closes,12)[i]-ema(closes,26)[i] for i in range(len(closes))]
    sig = ema(m, 9)
    return round(m[-1]-sig[-1], 2)


# ── endpoint ──────────────────────────────────────────────────────────────────

@router.get("/suggest")
async def suggest_trade_setup(refresh: bool = False):
    now = datetime.now(timezone.utc)
    if not refresh and _CACHE.get("ts") and (now - _CACHE["ts"]).seconds < _TTL:
        return _CACHE["data"]

    loop = asyncio.get_event_loop()

    yf_data, gex_data, oi_data, doom_data = await asyncio.gather(
        loop.run_in_executor(None, _fetch_all_sync),
        _fetch_gex(), _fetch_oi(), _fetch_doom_db(),
        return_exceptions=True,
    )

    yf_data   = yf_data   if isinstance(yf_data, dict)  else {"spot": 0.0, "vix": 0.0, "closes": []}
    gex_data  = gex_data  if isinstance(gex_data, dict)  else {}
    oi_data   = oi_data   if isinstance(oi_data, dict)   else {}
    doom_data = doom_data if isinstance(doom_data, dict) else {}

    spot   = yf_data.get("spot", 0.0)
    vix    = yf_data.get("vix", 15.0) or 15.0
    closes = yf_data.get("closes", [])
    rsi    = _rsi_fast(closes)
    macd_h = _macd_hist_fast(closes)

    # GEX
    gex_regime  = gex_data.get("regime", "UNKNOWN")
    is_pos_gex  = gex_data.get("is_positive", False)
    gamma_flip  = _sf(gex_data.get("gamma_flip"))
    gex_cwall   = _sf(gex_data.get("call_wall"))
    gex_pwall   = _sf(gex_data.get("put_wall"))

    # OI
    pcr        = _sf(oi_data.get("pcr"), 1.0)
    max_pain   = _sf(oi_data.get("max_pain"))
    oi_cwall   = _sf(oi_data.get("call_wall"))
    oi_pwall   = _sf(oi_data.get("put_wall"))

    # Use OI walls as primary, GEX walls as fallback
    call_wall = oi_cwall or gex_cwall
    put_wall  = oi_pwall or gex_pwall

    # DOOM
    doom = _sf(doom_data.get("score", 0))

    # SD1 (1-day expected move using VIX)
    sd1 = spot * (vix / 100) * math.sqrt(1 / 252) if spot > 0 else 100.0

    # Score + Setup
    score, reasons = _signal_score(doom, is_pos_gex, pcr, rsi, macd_h, spot, max_pain)
    setup = _build_setup(spot, score, call_wall, put_wall, max_pain, sd1, reasons, gex_regime, is_pos_gex)

    result = {
        "generated_at": datetime.now(IST).strftime("%H:%M IST"),
        "spot":        round(spot, 1),
        "vix":         round(vix, 2),
        "rsi":         rsi,
        "macd_hist":   macd_h,
        "pcr":         pcr,
        "doom":        doom,
        "gex_regime":  gex_regime,
        "gamma_flip":  gamma_flip,
        **setup,
    }

    _CACHE["ts"]   = now
    _CACHE["data"] = result
    return result
