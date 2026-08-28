"""
Institutional Flow Intelligence — /api/institutional/flow
Combines: VWAP deviation, PCR imbalance, inter-market correlation,
momentum divergence, session bias, block-trade activity, noise filter.
Cache: 3 minutes
"""
import asyncio
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api/institutional")

IST = ZoneInfo("Asia/Kolkata")

_CACHE: dict = {}
_CACHE_TTL = 180  # 3 minutes


# ── helpers ──────────────────────────────────────────────────────────────────

def _safe(v, default=0.0):
    try:
        return float(v) if v is not None else default
    except Exception:
        return default


def _rsi(closes: list, period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]
    avg_g = sum(gains[-period:]) / period
    avg_l = sum(losses[-period:]) / period
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return round(100 - 100 / (1 + rs), 1)


def _macd_divergence(closes: list) -> dict:
    """Returns macd_line[-1], signal[-1], histogram[-1], divergence signal."""
    if len(closes) < 35:
        return {"macd": 0, "signal": 0, "hist": 0, "divergence": "NONE"}

    def ema(data, span):
        k = 2 / (span + 1)
        result = [data[0]]
        for v in data[1:]:
            result.append(v * k + result[-1] * (1 - k))
        return result

    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    macd_line = [ema12[i] - ema26[i] for i in range(len(closes))]
    sig_line = ema(macd_line, 9)
    hist = [macd_line[i] - sig_line[i] for i in range(len(macd_line))]

    # Bearish divergence: price made higher high, MACD made lower high
    div = "NONE"
    if len(closes) >= 5 and len(macd_line) >= 5:
        price_hh = closes[-1] > closes[-3]
        macd_lh = macd_line[-1] < macd_line[-3]
        if price_hh and macd_lh and macd_line[-1] > 0:
            div = "BEARISH_DIVERGENCE"
        price_ll = closes[-1] < closes[-3]
        macd_hl = macd_line[-1] > macd_line[-3]
        if price_ll and macd_hl and macd_line[-1] < 0:
            div = "BULLISH_DIVERGENCE"

    return {
        "macd":      round(macd_line[-1], 2),
        "signal":    round(sig_line[-1], 2),
        "hist":      round(hist[-1], 2),
        "divergence": div,
    }


def _session_bias(now_ist: datetime) -> dict:
    h, m = now_ist.hour, now_ist.minute
    t = h * 60 + m
    if t < 9 * 60 + 15:
        return {"session": "PRE-OPEN", "color": "#94a3b8",
                "tendency": "GIFT Nifty se cue lo — direction set hoti hai",
                "active": False}
    if t <= 12 * 60:
        return {"session": "MORNING (9:15–12:00)", "color": "#22c55e",
                "tendency": "FII activity high — trend-follow bias",
                "active": True, "vol_expectation": "HIGH"}
    if t <= 14 * 60:
        return {"session": "LUNCH LULL (12:00–14:00)", "color": "#f59e0b",
                "tendency": "Liquidity thin — false breakouts common",
                "active": True, "vol_expectation": "LOW"}
    if t <= 15 * 60 + 30:
        return {"session": "LAST HOUR (14:00–15:30)", "color": "#818cf8",
                "tendency": "Institutional rebalancing — trend acceleration / reversal",
                "active": True, "vol_expectation": "HIGH"}
    return {"session": "POST-CLOSE", "color": "#64748b",
            "tendency": "Koi trade nahi — next day ki planning karo",
            "active": False}


def _fetch_market_data_sync():
    """Fetch NIFTY spot, VIX, and hourly closes directly via yfinance."""
    try:
        import yfinance as yf
        nsei  = yf.Ticker("^NSEI")
        vindia = yf.Ticker("^INDIAVIX")

        hist  = nsei.history(period="20d", interval="1h")
        vhist = vindia.history(period="2d",  interval="1d")

        closes = []
        spot   = 0.0
        vix    = 0.0

        if hist is not None and len(hist) > 5:
            closes = [float(v) for v in hist["Close"].dropna().tolist()]
            spot   = closes[-1] if closes else 0.0

        if vhist is not None and len(vhist) > 0:
            vix = float(vhist["Close"].dropna().iloc[-1])

        return {"spot": spot, "vix": vix, "closes": closes}
    except Exception:
        return {"spot": 0.0, "vix": 0.0, "closes": []}


def _fetch_nse_bulk_block_sync():
    """Fetch latest bulk/block trades from NSE. Returns list of large trades."""
    import datetime as _dt
    today = _dt.date.today()
    end   = today.strftime("%d-%m-%Y")
    start = (today - _dt.timedelta(days=3)).strftime("%d-%m-%Y")
    trades = []
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Referer": "https://www.nseindia.com/",
    }
    for url, kind in [
        (f"https://www.nseindia.com/api/historical/bulk-deals?from={start}&to={end}", "BULK"),
        (f"https://www.nseindia.com/api/historical/block-deals?from={start}&to={end}", "BLOCK"),
    ]:
        try:
            with httpx.Client(headers=headers, timeout=8) as c:
                r = c.get(url)
                if r.status_code == 200:
                    data = r.json().get("data", [])
                    for row in data[:10]:
                        qty  = _safe(row.get("BD_QTY_TRD") or row.get("BD_QTY_TRD", 0))
                        price = _safe(row.get("BD_TP_WATP") or row.get("BD_TP_WATP", 0))
                        val_cr = round(qty * price / 1e7, 1)
                        trades.append({
                            "kind":     kind,
                            "symbol":   (row.get("BD_SYMBOL") or row.get("BD_SYMBOL", "")).upper(),
                            "client":   row.get("BD_CLIENT_N") or row.get("BD_CLIENT_N") or "—",
                            "trade":    row.get("BD_BUY_SELL") or row.get("BD_BUY_SELL") or "—",
                            "qty":      int(qty),
                            "price":    price,
                            "value_cr": val_cr,
                            "date":     row.get("BD_DT_DATE") or "",
                        })
        except Exception:
            pass
    trades.sort(key=lambda x: x["value_cr"], reverse=True)
    return trades[:15]


async def _fetch_oi_data():
    """Fetch OI indicator data from our own endpoint."""
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get("http://localhost:8001/api/oi-indicator/nifty")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {}


async def _fetch_market_intel():
    """Fetch market intel data."""
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get("http://localhost:8001/api/market-intel")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {}


async def _fetch_doom():
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get("http://localhost:8001/api/doom/score")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {}


# ── main endpoint ─────────────────────────────────────────────────────────────

@router.get("/flow")
async def get_institutional_flow(refresh: bool = False):
    now = datetime.now(timezone.utc)
    now_ist = datetime.now(IST)

    if not refresh and _CACHE.get("ts") and (now - _CACHE["ts"]).seconds < _CACHE_TTL:
        return _CACHE["data"]

    loop = asyncio.get_event_loop()

    # Parallel fetches — direct sources, no self-referential HTTP
    market_data, oi_data, block_trades = await asyncio.gather(
        loop.run_in_executor(None, _fetch_market_data_sync),
        _fetch_oi_data(),
        loop.run_in_executor(None, _fetch_nse_bulk_block_sync),
        return_exceptions=True,
    )

    market_data  = market_data  if isinstance(market_data, dict)  else {"spot": 0.0, "vix": 0.0, "closes": []}
    oi_data      = oi_data      if isinstance(oi_data, dict)       else {}
    block_trades = block_trades if isinstance(block_trades, list)  else []

    spot     = market_data.get("spot", 0.0)
    vix_eff  = market_data.get("vix", 0.0) or 15.0
    yf_closes = market_data.get("closes", [])
    vwap_est  = _safe(oi_data.get("max_pain"))
    call_wall = _safe(oi_data.get("call_wall"))
    put_wall  = _safe(oi_data.get("put_wall"))
    pcr       = _safe(oi_data.get("pcr"))
    gift      = 0.0
    fii_net   = 0.0
    doom_score = 0.0
    vix       = vix_eff

    # ── 1. VWAP Deviation ────────────────────────────────────────────────────
    # 1-day 1SD using VIX: σ_1day = spot × VIX/100 × sqrt(1/252)
    import math
    sd_1day = spot * (vix_eff / 100) * math.sqrt(1 / 252) if spot > 0 else 0
    sd1_high = round(spot + sd_1day, 0)
    sd1_low  = round(spot - sd_1day, 0)
    sd2_high = round(spot + 2 * sd_1day, 0)
    sd2_low  = round(spot - 2 * sd_1day, 0)

    # VWAP deviation signal
    vwap_alert = "NORMAL"
    vwap_msg   = "Price within 1SD — no alert"
    if vwap_est > 0 and spot > 0:
        dev = (spot - vwap_est) / vwap_est * 100
        if abs(dev) >= 1.5:
            vwap_alert = "ALERT"
            vwap_msg = f"Spot {spot:.0f} is {dev:+.1f}% from Max Pain {vwap_est:.0f} — mean-reversion possible"
        elif abs(dev) >= 0.8:
            vwap_alert = "WATCH"
            vwap_msg = f"Spot {spot:.0f} is {dev:+.1f}% from Max Pain {vwap_est:.0f}"
    else:
        vwap_msg = f"Intraday 1SD band: {sd1_low:.0f}–{sd1_high:.0f} | 2SD: {sd2_low:.0f}–{sd2_high:.0f}"

    vwap_section = {
        "spot": spot, "max_pain": vwap_est, "vix": vix_eff,
        "sd1_high": sd1_high, "sd1_low": sd1_low,
        "sd2_high": sd2_high, "sd2_low": sd2_low,
        "alert": vwap_alert, "msg": vwap_msg,
        "call_wall": call_wall, "put_wall": put_wall,
    }

    # ── 2. Order Book Imbalance (PCR-based delta) ─────────────────────────────
    oi_signal = oi_data.get("signal", "NEUTRAL")
    ob_alert  = "NORMAL"
    ob_msg    = ""
    delta_bias = "NEUTRAL"
    if pcr > 0:
        if pcr > 1.3:
            delta_bias = "BULLISH"
            ob_alert   = "WATCH"
            ob_msg     = f"PCR {pcr:.2f} — Heavy put writing (bearish crowd), possible squeeze fuel"
        elif pcr < 0.7:
            delta_bias = "BEARISH"
            ob_alert   = "WATCH"
            ob_msg     = f"PCR {pcr:.2f} — Heavy call writing (bullish crowd), dealers may cap upside"
        else:
            ob_msg     = f"PCR {pcr:.2f} — Balanced order book"

    # Call/Put wall imbalance
    wall_imbalance = "NEUTRAL"
    if call_wall and put_wall and spot > 0:
        dist_call = abs(call_wall - spot)
        dist_put  = abs(put_wall - spot)
        if dist_call < dist_put * 0.6:
            wall_imbalance = "CAPPED_UPSIDE"
            ob_msg += f" | Call Wall {call_wall:.0f} very close"
        elif dist_put < dist_call * 0.6:
            wall_imbalance = "SUPPORTED"
            ob_msg += f" | Put Wall {put_wall:.0f} close support"

    ob_section = {
        "pcr": pcr, "oi_signal": oi_signal,
        "delta_bias": delta_bias, "wall_imbalance": wall_imbalance,
        "call_wall": call_wall, "put_wall": put_wall,
        "alert": ob_alert, "msg": ob_msg or "OI data unavailable",
    }

    # ── 3. Inter-Market Correlation ───────────────────────────────────────────
    inter_alert = "NORMAL"
    inter_signals = []

    if vix > 18:
        inter_alert = "ALERT"
        inter_signals.append(f"VIX {vix:.1f} — Elevated fear, institutional hedging active")
    elif vix > 14:
        inter_alert = "WATCH"
        inter_signals.append(f"VIX {vix:.1f} — Caution zone")

    if gift > 80:
        inter_signals.append(f"GIFT +{gift:.0f} — Strong positive gap expected, watch for fade")
    elif gift < -80:
        inter_alert = max(inter_alert, "WATCH", key=["NORMAL","WATCH","ALERT"].index)
        inter_signals.append(f"GIFT {gift:.0f} — Gap down expected, wait for 9:50 confirmation")

    if fii_net > 2000:
        inter_signals.append(f"FII Net +₹{fii_net:.0f}Cr — Strong institutional buying")
    elif fii_net < -2000:
        inter_alert = "ALERT" if inter_alert != "ALERT" else "ALERT"
        inter_signals.append(f"FII Net ₹{fii_net:.0f}Cr — Institutional selling pressure")

    doom_color = "#22c55e" if doom_score >= 4 else "#ef4444" if doom_score <= -4 else "#f59e0b"
    inter_signals.append(f"DOOM {doom_score:+.0f} — Market bias {'BULLISH' if doom_score >= 4 else 'BEARISH' if doom_score <= -4 else 'NEUTRAL'}")

    inter_section = {
        "vix": vix, "gift": gift, "fii_net": fii_net, "doom": doom_score,
        "doom_color": doom_color,
        "alert": inter_alert,
        "signals": inter_signals or ["Awaiting inter-market data"],
    }

    # ── 4. Momentum Divergence ────────────────────────────────────────────────
    rsi = _safe(_rsi(yf_closes)) if yf_closes else 50.0
    macd_info = _macd_divergence(yf_closes) if yf_closes else {"macd": 0, "signal": 0, "hist": 0, "divergence": "NONE"}
    mom_alert = "NORMAL"
    mom_signals = []

    if rsi >= 72:
        mom_alert = "ALERT"
        mom_signals.append(f"RSI {rsi:.0f} — Overbought zone, profit-booking watch")
    elif rsi >= 65:
        mom_alert = "WATCH"
        mom_signals.append(f"RSI {rsi:.0f} — Upper band, momentum stretched")
    elif rsi <= 28:
        mom_alert = "ALERT"
        mom_signals.append(f"RSI {rsi:.0f} — Oversold zone, bounce watch")
    elif rsi <= 35:
        mom_alert = "WATCH"
        mom_signals.append(f"RSI {rsi:.0f} — Lower band, potential mean revert")
    else:
        mom_signals.append(f"RSI {rsi:.0f} — Neutral range")

    if macd_info["divergence"] == "BEARISH_DIVERGENCE":
        mom_alert = "ALERT"
        mom_signals.append(f"MACD Bearish Divergence — Price higher but MACD lower, exhaustion signal")
    elif macd_info["divergence"] == "BULLISH_DIVERGENCE":
        mom_alert = "ALERT"
        mom_signals.append(f"MACD Bullish Divergence — Price lower but MACD higher, reversal signal")
    else:
        mom_signals.append(f"MACD Hist {macd_info['hist']:+.1f} — {'Positive' if macd_info['hist'] > 0 else 'Negative'} momentum")

    mom_section = {
        "rsi": rsi, "macd": macd_info,
        "alert": mom_alert, "signals": mom_signals,
        "data_available": len(yf_closes) > 20,
    }

    # ── 5. Session Bias ───────────────────────────────────────────────────────
    session_info = _session_bias(now_ist)
    session_section = {**session_info, "current_time_ist": now_ist.strftime("%H:%M IST")}

    # ── 6. Block Trade Activity ───────────────────────────────────────────────
    large_trades = [t for t in block_trades if t["value_cr"] >= 10]
    block_alert = "NORMAL"
    if any(t["value_cr"] >= 50 for t in block_trades):
        block_alert = "ALERT"
    elif any(t["value_cr"] >= 20 for t in block_trades):
        block_alert = "WATCH"

    block_section = {
        "trades": block_trades[:8],
        "large_count": len(large_trades),
        "total_value_cr": round(sum(t["value_cr"] for t in block_trades), 1),
        "alert": block_alert,
        "msg": f"{len(block_trades)} bulk/block deals | ₹{round(sum(t['value_cr'] for t in block_trades),1)} Cr total" if block_trades else "NSE bulk/block data unavailable",
    }

    # ── 7. Noise Filter ───────────────────────────────────────────────────────
    # Simple time-of-day and signal count based filter
    active_alerts = sum(1 for s in [vwap_alert, ob_alert, inter_alert, mom_alert, block_alert] if s == "ALERT")
    watches = sum(1 for s in [vwap_alert, ob_alert, inter_alert, mom_alert, block_alert] if s == "WATCH")

    noise_level = "LOW"
    noise_msg   = "Signal quality high — low noise environment"
    if not session_info["active"]:
        noise_level = "HIGH"
        noise_msg   = "Market closed — all signals are forward-looking"
    elif session_info["session"].startswith("LUNCH"):
        noise_level = "HIGH"
        noise_msg   = "Lunch lull — liquidity thin, false signals common. Avoid new trades"
    elif active_alerts >= 3:
        noise_level = "LOW"
        noise_msg   = f"{active_alerts} active alerts — Strong confluence, signal quality HIGH"
    elif active_alerts == 0 and watches == 0:
        noise_level = "MEDIUM"
        noise_msg   = "No alerts active — market in balance, wait for setup"

    noise_section = {
        "noise_level": noise_level,
        "noise_msg": noise_msg,
        "active_alerts": active_alerts,
        "watches": watches,
        "vol_decay_note": "Alert volume / avg-1h volume — check on broker terminal for live ratio",
        "time_decay_note": "If signal reverses within 30s after alert — mark as Momentary Spike Noise",
    }

    result = {
        "generated_at": now_ist.strftime("%H:%M IST"),
        "vwap":        vwap_section,
        "order_book":  ob_section,
        "intermarket": inter_section,
        "momentum":    mom_section,
        "session":     session_section,
        "block_trade": block_section,
        "noise":       noise_section,
        "overall_alert": "ALERT" if active_alerts >= 2 else "WATCH" if active_alerts >= 1 or watches >= 2 else "NORMAL",
    }

    _CACHE["ts"]   = now
    _CACHE["data"] = result
    return result
