import time
from fastapi import APIRouter

router = APIRouter(prefix="/api/metals")

_metals_cache: dict = {"data": None, "ts": 0.0}
_METALS_TTL = 60  # 1 minute refresh


@router.get("/prices")
async def get_metals_prices():
    """Gold (GC=F / XAUUSD) and Silver (SI=F / XAGUSD) live prices via yfinance."""
    import yfinance as _yf
    from concurrent.futures import ThreadPoolExecutor as _TPE

    now_ts = time.time()
    if _metals_cache["data"] and (now_ts - _metals_cache["ts"]) < _METALS_TTL:
        return _metals_cache["data"]

    TICKERS = {
        "GC=F": ("gold",   "XAUUSD", "$"),
        "SI=F": ("silver", "XAGUSD", "$"),
    }

    def _fetch_one(sym_info):
        sym, (key, label, unit) = sym_info
        try:
            hist = _yf.Ticker(sym).history(period="5d", interval="1d")
            if hist.empty:
                return key, None
            curr  = float(hist["Close"].iloc[-1])
            prev  = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else curr
            chg   = round((curr - prev) / prev * 100, 2) if prev else 0
            wk_p  = float(hist["Close"].iloc[0]) if len(hist) >= 5 else prev
            wk_ch = round((curr - wk_p) / wk_p * 100, 2) if wk_p else 0
            return key, {
                "price":      round(curr, 2),
                "change_pct": chg,
                "week_chg":   wk_ch,
                "label":      label,
                "unit":       unit,
                "ticker":     sym,
            }
        except Exception as e:
            return key, {"price": 0, "change_pct": 0, "week_chg": 0,
                         "label": label, "unit": unit, "ticker": sym, "error": str(e)}

    with _TPE(max_workers=2) as ex:
        results = dict(ex.map(_fetch_one, TICKERS.items()))

    out = {"gold": results.get("gold"), "silver": results.get("silver"), "ts": now_ts}
    _metals_cache["data"] = out
    _metals_cache["ts"]   = now_ts
    return out
