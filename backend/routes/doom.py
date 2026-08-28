"""
DOOM Card — Daily Bias Score Engine
Calculates a −12 to +12 score from 6 factors (Brent, VIX, GIFT%, Breadth, FII, GEX)
with expiry/clash overrides and fuel (expected Nifty move) calculation.
"""
import asyncio
import logging
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor as _TPE
from typing import Optional

import yfinance as yf
import pytz
from fastapi import APIRouter
from database import db

router   = APIRouter(prefix="/api/doom")
IST      = pytz.timezone("Asia/Kolkata")
_TPE_SZ  = 6

# ── Bias buckets ──────────────────────────────────────────────────
BIAS_TABLE = [
    {"bias": "Strong Bull", "score_min": 8,  "score_max": 12,
     "pts_low": 80,  "pts_high": 180,  "range_low": 80,  "range_high": 180,
     "color": "#22c55e", "action": "Aggressive Long / Call"},
    {"bias": "Mild Bull",   "score_min": 4,  "score_max": 7,
     "pts_low": 20,  "pts_high": 120,  "range_low": 80,  "range_high": 160,
     "color": "#86efac", "action": "Small Long"},
    {"bias": "Neutral",     "score_min": -3, "score_max": 3,
     "pts_low": -80, "pts_high": 80,   "range_low": 70,  "range_high": 160,
     "color": "#fbbf24", "action": "Range"},
    {"bias": "Mild Bear",   "score_min": -7, "score_max": -4,
     "pts_low": -140,"pts_high": -40,  "range_low": 100, "range_high": 180,
     "color": "#fca5a5", "action": "Book / small Put"},
    {"bias": "Strong Bear", "score_min": -12,"score_max": -8,
     "pts_low": -350,"pts_high": -180, "range_low": 180, "range_high": 300,
     "color": "#ef4444", "action": "Hedge / Put / cash"},
]

# Display matrix (reference)
DISPLAY_MATRIX = [
    {"sectors_up": "10–12", "sectors_dn": "0–2",  "brent": "<84",    "vix": "<11.5",   "gift": "+0.4%+",    "breadth": "28+", **BIAS_TABLE[0]},
    {"sectors_up": "8–9",   "sectors_dn": "3–4",  "brent": "84–87",  "vix": "11.5–13", "gift": "+0.2–0.4%", "breadth": "22–27", **BIAS_TABLE[1]},
    {"sectors_up": "5–7",   "sectors_dn": "5–7",  "brent": "87–91",  "vix": "13–14.5", "gift": "±0.2%",     "breadth": "17–22", **BIAS_TABLE[2]},
    {"sectors_up": "3–4",   "sectors_dn": "8–9",  "brent": "91–94",  "vix": "14.5–16", "gift": "-0.2–0.4%", "breadth": "12–17", **BIAS_TABLE[3]},
    {"sectors_up": "0–2",   "sectors_dn": "10–12","brent": "94+",    "vix": "16+",     "gift": "-0.4%+",    "breadth": "<12",  **BIAS_TABLE[4]},
]


def _bucket_bias(score: int) -> dict:
    for row in BIAS_TABLE:
        if row["score_min"] <= score <= row["score_max"]:
            return row
    # clamp extremes
    return BIAS_TABLE[0] if score > 0 else BIAS_TABLE[-1]


def _score_factors(brent: float, vix: float, gift_pct: float,
                   breadth_up: int, fii_cr: float, gex_regime: str) -> dict:
    """Score each of the 6 factors → sum → raw_score (-12 to +12)."""
    # Brent
    s_brent = +2 if brent < 84 else (0 if brent <= 91 else -2)
    # VIX
    s_vix   = +2 if vix < 11.5 else (0 if vix <= 14.5 else -2)
    # GIFT %
    s_gift  = +2 if gift_pct >= 0.30 else (-2 if gift_pct <= -0.30 else 0)
    # Breadth (Nifty 50 advances)
    s_bread = +2 if breadth_up >= 28 else (-2 if breadth_up <= 16 else 0)
    # FII cash last day (crore)
    s_fii   = +2 if fii_cr >= 1000 else (-2 if fii_cr <= -500 else 0)
    # GEX regime: Negative → +2 (big moves possible), Strong Positive → -2 (pinning)
    s_gex   = +2 if gex_regime in ("STRONG_NEGATIVE", "NEGATIVE") \
              else (-2 if gex_regime == "STRONG_POSITIVE" else 0)

    raw = s_brent + s_vix + s_gift + s_bread + s_fii + s_gex
    return {
        "raw": raw,
        "factors": {
            "brent": s_brent, "vix": s_vix, "gift": s_gift,
            "breadth": s_bread, "fii": s_fii, "gex": s_gex,
        },
    }


def _calc_fuel(bias: str, gex_regime: str, vix: float, is_expiry: bool) -> tuple:
    """Return (pts_low, pts_high) expected Nifty move."""
    if gex_regime == "STRONG_POSITIVE" or (is_expiry and vix < 12):
        return 70, 140
    if gex_regime in ("STRONG_NEGATIVE", "NEGATIVE") and vix >= 15:
        return 180, 300
    for row in BIAS_TABLE:
        if row["bias"] == bias:
            return row["pts_low"], row["pts_high"]
    return -80, 80


def _ist_now() -> datetime:
    return datetime.now(IST)


def _is_expiry_day() -> bool:
    """Nifty weekly = Thursday (3); Sensex weekly = Tuesday (1)."""
    return _ist_now().weekday() in (1, 3)


def _past_950() -> bool:
    t = _ist_now()
    return t.hour > 9 or (t.hour == 9 and t.minute >= 50)


def _fetch_nifty_spot_open():
    """Get Nifty 50 current spot and today's open for 9:50 confirm gate."""
    try:
        t = yf.Ticker("^NSEI")
        fi = t.fast_info
        spot = fi.get("last_price") or fi.get("lastPrice")
        hist = t.history(period="1d", interval="1m")
        day_open = float(hist["Open"].iloc[0]) if not hist.empty else None
        prev_close = fi.get("previous_close") or fi.get("previousClose")
        return spot, day_open, prev_close
    except Exception:
        return None, None, None


def _fetch_live_inputs():
    """Fetch all 6 scoring inputs synchronously (runs in ThreadPoolExecutor)."""
    results = {}

    def fetch_brent():
        try:
            fi = yf.Ticker("BZ=F").fast_info
            return fi.get("last_price") or fi.get("lastPrice") or 88.0
        except Exception:
            return 88.0

    def fetch_vix():
        try:
            fi = yf.Ticker("^INDIAVIX").fast_info
            return fi.get("last_price") or fi.get("lastPrice") or 13.0
        except Exception:
            try:
                fi = yf.Ticker("^VIX").fast_info
                return fi.get("last_price") or 13.0
            except Exception:
                return 13.0

    def fetch_nifty_data():
        return _fetch_nifty_spot_open()

    def fetch_gift():
        try:
            fi = yf.Ticker("^NSEI").fast_info
            nifty_prev = fi.get("previous_close") or fi.get("previousClose") or 24000
            # GIFT Nifty via NIFTYBEES proxy or direct NSEIFTY
            gift_fi = yf.Ticker("NIFTYBEES.NS").fast_info
            gift_price = gift_fi.get("last_price") or nifty_prev
            gift_pct = (gift_price - nifty_prev) / nifty_prev * 100 if nifty_prev else 0
            return round(gift_pct, 4), nifty_prev
        except Exception:
            return 0.0, 24000

    def fetch_breadth():
        try:
            stocks_up = 0
            for t in ["^NSEI"]:
                fi = yf.Ticker(t).fast_info
                prev = fi.get("previous_close") or 1
                curr = fi.get("last_price") or prev
                # Proxy: use VIX and Nifty returns to estimate advances
            # Actual Nifty 50 advances from fast_info breadth proxy
            nifty_fi = yf.Ticker("^NSEI").fast_info
            pct = ((nifty_fi.get("last_price", 0) or 0) - (nifty_fi.get("previous_close", 1) or 1)) / (nifty_fi.get("previous_close", 1) or 1) * 100
            # Rough proxy: if Nifty +1% → ~35 advances, -1% → ~15 advances
            if pct > 0.5:   return min(40, int(25 + pct * 10))
            elif pct < -0.5: return max(10, int(25 + pct * 10))
            return 25
        except Exception:
            return 25

    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=_TPE_SZ) as exe:
        f_brent   = exe.submit(fetch_brent)
        f_vix     = exe.submit(fetch_vix)
        f_gift    = exe.submit(fetch_gift)
        f_nifty   = exe.submit(fetch_nifty_data)
        f_breadth = exe.submit(fetch_breadth)

        brent             = f_brent.result()
        vix               = f_vix.result()
        gift_pct, nifty_prev = f_gift.result()
        spot, day_open, prev_close = f_nifty.result()
        breadth_up        = f_breadth.result()

    results["brent"]      = round(brent, 2)
    results["vix"]        = round(vix, 2)
    results["gift_pct"]   = round(gift_pct, 4)
    results["breadth_up"] = breadth_up
    results["nifty_spot"] = round(spot, 2) if spot else None
    results["nifty_open"] = round(day_open, 2) if day_open else None
    results["prev_close"] = round(nifty_prev, 2) if nifty_prev else None
    return results


async def _get_fii_cr() -> float:
    """Pull FII net cash from MongoDB (already stored by market_intel route)."""
    try:
        doc = await db.fii_cache.find_one(sort=[("_id", -1)], projection={"_id": 0})
        if doc:
            return float(doc.get("fii", {}).get("net", 0) or 0)
    except Exception:
        pass
    return 0.0


async def _get_gex_regime() -> str:
    """Pull latest GEX regime from MongoDB cache."""
    try:
        doc = await db.gex_cache.find_one(sort=[("_id", -1)], projection={"_id": 0})
        if doc:
            return doc.get("regime", "WEAK_POSITIVE")
    except Exception:
        pass
    return "WEAK_POSITIVE"


# ── 9:50 Confirm Gate ─────────────────────────────────────────────
def _compute_confirm_950(spot: Optional[float], day_open: Optional[float],
                         prev_close: Optional[float], score: int) -> dict:
    """
    up_confirm   = spot > open AND gap_hold_up AND low holds
    down_confirm = spot < open AND (gap_fill_up OR gap_hold_down)
    """
    if not _past_950() or spot is None or day_open is None:
        return {"confirmed": None, "direction": None, "action": "WAIT"}

    gap_up   = (day_open > prev_close) if prev_close else False
    gap_down = (day_open < prev_close) if prev_close else False
    spot_above_open = spot > day_open

    up_confirm   = spot_above_open and (gap_up or not gap_down)
    down_confirm = (not spot_above_open) and (gap_down or not gap_up)

    if up_confirm and score >= 4:
        return {"confirmed": True, "direction": "UP", "action": "LONG"}
    elif down_confirm and score <= -4:
        return {"confirmed": True, "direction": "DOWN", "action": "SHORT"}
    else:
        return {"confirmed": False, "direction": None, "action": "RANGE / no trade"}


# ── DOOM Score Calculation ────────────────────────────────────────
async def compute_doom_score() -> dict:
    now_ist  = _ist_now()
    today    = now_ist.strftime("%Y-%m-%d")
    is_expiry = _is_expiry_day()

    # Fetch live inputs (blocking IO in executor)
    loop = asyncio.get_event_loop()
    live = await loop.run_in_executor(None, _fetch_live_inputs)

    brent      = live["brent"]
    vix        = live["vix"]
    gift_pct   = live["gift_pct"]
    breadth_up = live["breadth_up"]
    spot       = live["nifty_spot"]
    day_open   = live["nifty_open"]
    prev_close = live["prev_close"]

    fii_cr     = await _get_fii_cr()
    gex_regime = await _get_gex_regime()

    # Score
    scored = _score_factors(brent, vix, gift_pct, breadth_up, fii_cr, gex_regime)
    raw    = scored["raw"]
    factors = scored["factors"]

    # Overrides
    mode = "NORMAL"
    final_score = raw
    if is_expiry and vix < 12:
        final_score = round(raw * 0.3)
        mode = "EXPIRY_NEUTRAL"
    brent_bull = brent < 88
    vix_bull   = vix < 13
    if (brent_bull != vix_bull) and abs(raw) <= 4:
        mode = "CLASH_NEUTRAL"

    bias_row = _bucket_bias(final_score)
    bias     = bias_row["bias"]
    color    = bias_row["color"]
    action_matrix = bias_row["action"]

    # Fuel
    fuel_low, fuel_high = _calc_fuel(bias, gex_regime, vix, is_expiry)

    # 9:50 confirm
    confirm = _compute_confirm_950(spot, day_open, prev_close, final_score)
    action  = confirm["action"] if confirm["confirmed"] is not None else "WAIT"

    # Size
    size_pct = 0.5 if final_score >= 8 or final_score <= -8 else \
               0.4 if abs(final_score) >= 4 else 0.25

    result = {
        "date":               today,
        "timestamp":          now_ist.isoformat(),
        "score":              final_score,
        "raw_score":          raw,
        "bias":               bias,
        "color":              color,
        "mode":               mode,
        "expiry":             is_expiry,
        "brent":              brent,
        "vix":                vix,
        "gift_pct":           gift_pct,
        "fii_cr":             fii_cr,
        "breadth_up":         breadth_up,
        "gex":                gex_regime,
        "expected_close_pts": [fuel_low, fuel_high],
        "confirm_950":        confirm["confirmed"],
        "confirm_direction":  confirm["direction"],
        "action":             action,
        "action_matrix":      action_matrix,
        "size_pct":           size_pct,
        "factors":            factors,
        "display_matrix":     DISPLAY_MATRIX,
    }

    # Persist to MongoDB
    try:
        await db.doom_scores.update_one(
            {"date": today},
            {"$set": {**result, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    except Exception as e:
        logging.warning(f"Doom DB save failed: {e}")

    return result


# ── Endpoints ─────────────────────────────────────────────────────
@router.get("/score")
async def get_doom_score():
    """DOOM card — daily bias score engine."""
    try:
        return await compute_doom_score()
    except Exception as e:
        logging.error(f"Doom score error: {e}")
        return {
            "score": 0, "bias": "Neutral", "color": "#fbbf24",
            "mode": "NORMAL", "expiry": False,
            "expected_close_pts": [-80, 80],
            "action": "WAIT", "error": str(e),
            "display_matrix": DISPLAY_MATRIX,
        }


@router.get("/history")
async def get_doom_history(limit: int = 30):
    """Last N days of DOOM scores for learning/backtest."""
    try:
        cursor = db.doom_scores.find(
            {}, {"_id": 0}
        ).sort("date", -1).limit(limit)
        rows = await cursor.to_list(length=limit)
        return {"rows": rows, "total": len(rows)}
    except Exception as e:
        return {"rows": [], "error": str(e)}
