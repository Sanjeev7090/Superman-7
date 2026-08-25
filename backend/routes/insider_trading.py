"""
Insider Trading Detection + Chart Pattern Scanner
-------------------------------------------------
Endpoints:
  GET /api/insider/detections       — SEBI Reg 7(2) NSE disclosures with priority scores
  GET /api/insider/pattern-scan     — Chart pattern detection across F&O universe
"""
import logging
import asyncio
import concurrent.futures
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import APIRouter, Query
from typing import Optional
import numpy as np
import yfinance as yf

router = APIRouter(prefix="/api/insider")
logger = logging.getLogger(__name__)

# ── Caches ───────────────────────────────────────────────────────────────────
_insider_cache: dict = {"data": None, "ts": None}
_pattern_cache: dict = {"data": None, "ts": None}

INSIDER_TTL = 1800    # 30 min
PATTERN_TTL = 900     # 15 min

# ── Stock Universe ───────────────────────────────────────────────────────────
SCAN_UNIVERSE = [
    {"ticker": "RELIANCE.NS",   "name": "Reliance",        "sector": "Energy"},
    {"ticker": "HDFCBANK.NS",   "name": "HDFC Bank",       "sector": "Banking"},
    {"ticker": "ICICIBANK.NS",  "name": "ICICI Bank",      "sector": "Banking"},
    {"ticker": "SBIN.NS",       "name": "SBI",             "sector": "Banking"},
    {"ticker": "AXISBANK.NS",   "name": "Axis Bank",       "sector": "Banking"},
    {"ticker": "KOTAKBANK.NS",  "name": "Kotak Bank",      "sector": "Banking"},
    {"ticker": "INDUSINDBK.NS", "name": "IndusInd Bank",   "sector": "Banking"},
    {"ticker": "INFY.NS",       "name": "Infosys",         "sector": "IT"},
    {"ticker": "TCS.NS",        "name": "TCS",             "sector": "IT"},
    {"ticker": "HCLTECH.NS",    "name": "HCL Tech",        "sector": "IT"},
    {"ticker": "WIPRO.NS",      "name": "Wipro",           "sector": "IT"},
    {"ticker": "BAJFINANCE.NS", "name": "Bajaj Finance",   "sector": "NBFC"},
    {"ticker": "LT.NS",         "name": "L&T",             "sector": "Infra"},
    {"ticker": "MARUTI.NS",     "name": "Maruti",          "sector": "Auto"},
    {"ticker": "TATAMOTORS.NS", "name": "Tata Motors",     "sector": "Auto"},
    {"ticker": "TATASTEEL.NS",  "name": "Tata Steel",      "sector": "Metals"},
    {"ticker": "JSWSTEEL.NS",   "name": "JSW Steel",       "sector": "Metals"},
    {"ticker": "SUNPHARMA.NS",  "name": "Sun Pharma",      "sector": "Pharma"},
    {"ticker": "DRREDDY.NS",    "name": "Dr Reddy",        "sector": "Pharma"},
    {"ticker": "CIPLA.NS",      "name": "Cipla",           "sector": "Pharma"},
    {"ticker": "ITC.NS",        "name": "ITC",             "sector": "FMCG"},
    {"ticker": "BHARTIARTL.NS", "name": "Airtel",          "sector": "Telecom"},
    {"ticker": "NTPC.NS",       "name": "NTPC",            "sector": "Power"},
    {"ticker": "ADANIPORTS.NS", "name": "Adani Ports",     "sector": "Ports"},
    {"ticker": "DLF.NS",        "name": "DLF",             "sector": "Realty"},
    {"ticker": "TRENT.NS",      "name": "Trent",           "sector": "Retail"},
    {"ticker": "PERSISTENT.NS", "name": "Persistent",      "sector": "IT"},
    {"ticker": "LTIM.NS",       "name": "LTIMindtree",     "sector": "IT"},
    {"ticker": "ZOMATO.NS",     "name": "Zomato",          "sector": "Internet"},
    {"ticker": "NAUKRI.NS",     "name": "Naukri",          "sector": "Internet"},
    {"ticker": "DIXON.NS",      "name": "Dixon Tech",      "sector": "Electronics"},
    {"ticker": "POLYCAB.NS",    "name": "Polycab",         "sector": "Cables"},
    {"ticker": "PAGEIND.NS",    "name": "Page Industries",  "sector": "FMCG"},
    {"ticker": "HAVELLS.NS",    "name": "Havells",         "sector": "Electricals"},
    {"ticker": "PIIND.NS",      "name": "PI Industries",   "sector": "Agro Chem"},
    {"ticker": "DEEPAKNTR.NS",  "name": "Deepak Nitrite",  "sector": "Chemicals"},
]


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 1 — INSIDER TRADING DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_nse_pit_data(days_back: int = 7) -> list:
    """Fetch SEBI Regulation 7(2) disclosures from NSE corporates-pit endpoint."""
    try:
        from curl_cffi import requests as cffi_req
    except ImportError:
        logger.warning("curl_cffi not available for insider trading fetch")
        return []

    today    = datetime.now(timezone.utc)
    from_dt  = today - timedelta(days=days_back)
    from_str = from_dt.strftime("%d-%m-%Y")
    to_str   = today.strftime("%d-%m-%Y")

    base_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept":          "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
    }

    def _sync_fetch():
        s = cffi_req.Session(impersonate="chrome110")
        s.get("https://www.nseindia.com/", timeout=8,
              headers={**base_headers, "Referer": "https://www.google.com/"})
        s.get(
            "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading",
            timeout=6, headers={**base_headers, "Referer": "https://www.nseindia.com/"},
        )
        url = (
            f"https://www.nseindia.com/api/corporates-pit"
            f"?index=equities&from_date={from_str}&to_date={to_str}"
        )
        resp = s.get(
            url, timeout=12,
            headers={
                **base_headers,
                "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading",
            },
        )
        return resp.json()

    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _sync_fetch)
        rows   = result.get("data", [])
        logger.info(f"NSE insider PIT: {len(rows)} rows for {from_str}–{to_str}")
        return rows
    except Exception as e:
        logger.warning(f"NSE insider PIT fetch failed: {e}")
        return []


def _is_buy(row: dict) -> bool:
    mode = (
        row.get("acqMode") or row.get("reg7A1acqMode") or row.get("transType") or ""
    ).lower()
    return not any(k in mode for k in ("sale", "sell", "disposal"))


def _cat_score(row: dict) -> int:
    cat = (row.get("pid") or row.get("personCategory") or row.get("category") or "").lower()
    if any(k in cat for k in ("promoter", "director", "key managerial", "kmp")):
        return 3
    return 1


def _vol_score(vr: float) -> int:
    if vr >= 2.0:
        return 2
    if vr >= 1.5:
        return 1
    return 0


def _build_factors(cat: int, count: int, vr: float, brk: bool, small: bool) -> list:
    tags = []
    if cat >= 3:
        tags.append("PROMOTER BUY")
    else:
        tags.append("INSIDER BUY")
    if count >= 2:
        tags.append(f"CLUSTER ({count})")
    if vr >= 1.5:
        tags.append(f"VOL {vr:.1f}x")
    if brk:
        tags.append("BREAKOUT")
    if small:
        tags.append("SMALL CAP")
    return tags


async def _build_detections() -> list:
    raw      = await _fetch_nse_pit_data(days_back=7)
    buy_rows = [r for r in raw if _is_buy(r)]

    sym_map: dict = defaultdict(list)
    for row in buy_rows:
        sym = (row.get("symbol") or "").strip().upper()
        if sym:
            sym_map[sym].append(row)

    if not sym_map:
        return []

    def _yf_batch(syms: list) -> dict:
        out = {}
        for s in syms:
            try:
                hist = yf.Ticker(f"{s}.NS").history(period="30d")
                if hist.empty:
                    out[s] = {"vol_ratio": 1.0, "price": 0, "breakout": False, "small_cap": True}
                    continue
                price    = float(hist["Close"].iloc[-1])
                avg_v    = float(hist["Volume"].iloc[:-1].mean()) if len(hist) > 1 else float(hist["Volume"].mean())
                today_v  = float(hist["Volume"].iloc[-1])
                vr       = (today_v / avg_v) if avg_v > 0 else 1.0
                sma20    = float(hist["Close"].tail(20).mean())
                try:
                    mc = getattr(yf.Ticker(f"{s}.NS").fast_info, "market_cap", 0) or 0
                except Exception:
                    mc = 0
                out[s] = {
                    "vol_ratio": round(vr, 2),
                    "price":     round(price, 2),
                    "breakout":  price > sma20,
                    "small_cap": mc < 5e10 or mc == 0,
                }
            except Exception as exc:
                logger.debug(f"yf error {s}: {exc}")
                out[s] = {"vol_ratio": 1.0, "price": 0, "breakout": False, "small_cap": True}
        return out

    loop    = asyncio.get_event_loop()
    yf_data = await loop.run_in_executor(None, _yf_batch, list(sym_map.keys()))

    results = []
    for sym, rows in sym_map.items():
        mkt  = yf_data.get(sym, {"vol_ratio": 1.0, "price": 0, "breakout": False, "small_cap": True})
        cat  = max((_cat_score(r) for r in rows), default=1)
        vr   = mkt["vol_ratio"]
        score = min(10, cat + (2 if len(rows) >= 2 else 0) + _vol_score(vr)
                    + (2 if mkt["breakout"] else 0) + (1 if mkt["small_cap"] else 0))
        if score < 1:
            continue

        insiders = []
        for r in rows:
            shares = r.get("secAcq") or r.get("sharesAcquired") or 0
            try:
                shares = int(str(shares).replace(",", ""))
            except Exception:
                shares = 0
            insiders.append({
                "name":       r.get("acqName") or r.get("acquirerName") or "Unknown",
                "category":   r.get("pid") or r.get("personCategory") or "Insider",
                "mode":       r.get("acqMode") or r.get("reg7A1acqMode") or "Market Purchase",
                "shares":     shares,
                "date":       r.get("acqToDate") or r.get("date") or "",
                "value_lakh": round(shares * mkt["price"] / 1e5, 2) if mkt["price"] > 0 else 0,
            })

        results.append({
            "symbol":           sym,
            "company":          rows[0].get("company") or rows[0].get("companyName") or sym,
            "score":            score,
            "priority":         "HIGH" if score >= 8 else "WATCHLIST" if score >= 5 else "MONITOR",
            "insiders":         insiders,
            "cluster":          len(rows) >= 2,
            "vol_ratio":        vr,
            "price":            mkt["price"],
            "price_breakout":   mkt["breakout"],
            "is_small_cap":     mkt["small_cap"],
            "total_value_lakh": round(sum(i["value_lakh"] for i in insiders), 2),
            "factors":          _build_factors(cat, len(rows), vr, mkt["breakout"], mkt["small_cap"]),
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 2 — CHART PATTERN SCANNER
# ═══════════════════════════════════════════════════════════════════════════════

# Timeframe config: label → (yfinance period, interval, min_bars, display)
TIMEFRAMES = {
    "15m": {"period": "5d",   "interval": "15m", "min_bars": 30,  "display": "15 Min"},
    "1H":  {"period": "60d",  "interval": "1h",  "min_bars": 40,  "display": "1 Hour"},
    "1D":  {"period": "200d", "interval": "1d",  "min_bars": 80,  "display": "Daily"},
}


def _local_extrema(arr: np.ndarray, w: int = 5):
    """Return indices of local maxima and minima with window w."""
    highs, lows = [], []
    n = len(arr)
    for i in range(w, n - w):
        seg = arr[i - w: i + w + 1]
        if arr[i] == seg.max() and arr[i] > seg[np.arange(len(seg)) != w].mean():
            highs.append(i)
        if arr[i] == seg.min() and arr[i] < seg[np.arange(len(seg)) != w].mean():
            lows.append(i)
    return highs, lows


def _pct_diff(a: float, b: float) -> float:
    ref = max(abs(a), abs(b))
    return abs(a - b) / ref if ref > 0 else 0.0


# ── Pattern detectors (each returns dict or None) ────────────────────────────

def detect_double_top(highs, prices, tol=0.025, min_gap=8) -> Optional[dict]:
    """Two peaks within `tol`% of each other, valley ≥ 2% below."""
    for i in range(len(highs) - 1):
        for j in range(i + 1, len(highs)):
            if highs[j] - highs[i] < min_gap:
                continue
            h1, h2 = prices[highs[i]], prices[highs[j]]
            if _pct_diff(h1, h2) > tol:
                continue
            valley = prices[highs[i]: highs[j] + 1].min()
            depth  = (min(h1, h2) - valley) / min(h1, h2)
            if depth >= 0.02:
                return {
                    "pattern":    "Double Top",
                    "bias":       "BEARISH",
                    "confidence": int(min(95, 60 + depth * 400)),
                    "level":      round((h1 + h2) / 2, 2),
                    "description": f"Two peaks ~{round((h1+h2)/2,2)}, valley {round(depth*100,1)}% below",
                }
    return None


def detect_double_bottom(lows, prices, tol=0.025, min_gap=8) -> Optional[dict]:
    """Two troughs within `tol`% of each other, peak ≥ 2% above."""
    for i in range(len(lows) - 1):
        for j in range(i + 1, len(lows)):
            if lows[j] - lows[i] < min_gap:
                continue
            l1, l2 = prices[lows[i]], prices[lows[j]]
            if _pct_diff(l1, l2) > tol:
                continue
            peak  = prices[lows[i]: lows[j] + 1].max()
            rise  = (peak - max(l1, l2)) / max(l1, l2)
            if rise >= 0.02:
                return {
                    "pattern":    "Double Bottom",
                    "bias":       "BULLISH",
                    "confidence": int(min(95, 60 + rise * 400)),
                    "level":      round((l1 + l2) / 2, 2),
                    "description": f"Two troughs ~{round((l1+l2)/2,2)}, peak {round(rise*100,1)}% above",
                }
    return None


def detect_hs(highs, lows, prices, inv=False) -> Optional[dict]:
    """
    Head & Shoulders (inv=False) or Inverse H&S (inv=True).
    3 peaks/troughs: LS, HEAD, RS  with HEAD higher/lower than shoulders.
    """
    pts = lows if inv else highs
    if len(pts) < 3:
        return None
    for i in range(len(pts) - 2):
        ls_i, hd_i, rs_i = pts[i], pts[i + 1], pts[i + 2]
        ls, hd, rs = prices[ls_i], prices[hd_i], prices[rs_i]
        cond = (hd > ls and hd > rs) if not inv else (hd < ls and hd < rs)
        if not cond:
            continue
        shoulder_diff = _pct_diff(ls, rs)
        if shoulder_diff > 0.05:        # shoulders should be roughly equal
            continue
        head_margin = abs(hd - (ls + rs) / 2) / ((ls + rs) / 2)
        if head_margin < 0.02:          # head must stand out by ≥ 2%
            continue
        name  = "Inverse H&S" if inv else "H&S (Head & Shoulders)"
        bias  = "BULLISH" if inv else "BEARISH"
        neckline = prices[lows[i]: rs_i + 1].max() if not inv else prices[highs[i]: rs_i + 1].min()
        return {
            "pattern":    name,
            "bias":       bias,
            "confidence": int(min(92, 55 + head_margin * 500)),
            "level":      round(float(neckline), 2),
            "description": (
                f"LS={round(ls,2)} Head={round(hd,2)} RS={round(rs,2)} "
                f"| Neckline≈{round(float(neckline),2)}"
            ),
        }
    return None


def detect_flag(closes, opens, is_bull=True) -> Optional[dict]:
    """
    Bull/Bear Flag: strong pole (≥4%) followed by 5–15-bar consolidation.
    """
    n = len(closes)
    if n < 25:
        return None
    # Scan last 40 bars for a pole
    for pole_end in range(n - 15, n - 5):
        pole_start = max(0, pole_end - 10)
        seg        = closes[pole_start: pole_end + 1]
        chg        = (seg[-1] - seg[0]) / seg[0] if seg[0] > 0 else 0
        if is_bull and chg < 0.04:
            continue
        if not is_bull and chg > -0.04:
            continue
        # Check consolidation after pole
        cons = closes[pole_end: min(n, pole_end + 15)]
        if len(cons) < 5:
            continue
        cons_range = (cons.max() - cons.min()) / cons.min() if cons.min() > 0 else 1
        if cons_range > 0.06:           # tight range (<6%)
            continue
        name = "Bull Flag" if is_bull else "Bear Flag"
        bias = "BULLISH" if is_bull else "BEARISH"
        return {
            "pattern":    name,
            "bias":       bias,
            "confidence": int(min(90, 60 + abs(chg) * 400)),
            "level":      round(float(closes[-1]), 2),
            "description": (
                f"Pole {round(chg*100,1)}% | Consolidation range {round(cons_range*100,1)}% "
                f"over {len(cons)} bars"
            ),
        }
    return None


def detect_cup_handle(closes) -> Optional[dict]:
    """
    Cup & Handle: U-shaped recovery to prior high, then small pullback (<35%).
    """
    n = len(closes)
    if n < 60:
        return None
    # Cup uses last 60 bars
    cup_seg = closes[max(0, n - 60):]
    cup_high_l = float(cup_seg[: len(cup_seg) // 3].max())
    cup_bottom  = float(cup_seg[len(cup_seg) // 4: 3 * len(cup_seg) // 4].min())
    cup_high_r  = float(cup_seg[2 * len(cup_seg) // 3:].max())
    depth = (cup_high_l - cup_bottom) / cup_high_l if cup_high_l > 0 else 0
    recovery = (cup_high_r - cup_bottom) / (cup_high_l - cup_bottom) if (cup_high_l - cup_bottom) > 0 else 0
    if depth < 0.10 or recovery < 0.80:
        return None
    # Handle: last 10 bars should retrace ≤35% of cup height
    handle_seg  = closes[-10:]
    handle_pull = (cup_high_r - float(handle_seg.min())) / (cup_high_l - cup_bottom) if (cup_high_l - cup_bottom) > 0 else 1
    if handle_pull > 0.35:
        return None
    return {
        "pattern":    "Cup & Handle",
        "bias":       "BULLISH",
        "confidence": int(min(90, 60 + recovery * 25 + (0.35 - handle_pull) * 40)),
        "level":      round(cup_high_r, 2),
        "description": (
            f"Cup depth {round(depth*100,1)}% | Recovery {round(recovery*100,1)}% "
            f"| Handle pullback {round(handle_pull*100,1)}%"
        ),
    }


def detect_range(closes, highs_arr, lows_arr) -> Optional[dict]:
    """
    Range / Consolidation: last 20 bars price stays within ±3% of midpoint.
    Min 3 touches of support + 3 touches of resistance.
    """
    seg_n   = min(30, len(closes))
    closes_seg = closes[-seg_n:]
    highs_seg  = highs_arr[-seg_n:]
    lows_seg   = lows_arr[-seg_n:]

    rng_high = float(highs_seg.max())
    rng_low  = float(lows_seg.min())
    mid      = (rng_high + rng_low) / 2
    width    = (rng_high - rng_low) / mid if mid > 0 else 1

    if width > 0.07:         # must be within 7% range
        return None

    tol   = (rng_high - rng_low) * 0.15
    res_t = int((highs_seg > rng_high - tol).sum())
    sup_t = int((lows_seg  < rng_low  + tol).sum())
    if res_t < 2 or sup_t < 2:
        return None

    return {
        "pattern":    "Range / Consolidation",
        "bias":       "NEUTRAL",
        "confidence": int(min(88, 50 + (res_t + sup_t) * 5)),
        "level":      round(mid, 2),
        "description": (
            f"Range {round(rng_low,2)}–{round(rng_high,2)} "
            f"({round(width*100,1)}% wide) | "
            f"Resistance touches {res_t} | Support touches {sup_t}"
        ),
    }


def _detect_patterns_for_df(df) -> list:
    """Run all pattern detectors on a single DataFrame (one timeframe)."""
    closes = df["Close"].values.astype(float)
    highs  = df["High"].values.astype(float)
    lows   = df["Low"].values.astype(float)

    window = max(3, len(closes) // 15)
    h_idx, l_idx = _local_extrema(closes, w=window)

    found = []
    for fn in [
        lambda: detect_double_top(h_idx, closes),
        lambda: detect_double_bottom(l_idx, closes),
        lambda: detect_hs(h_idx, l_idx, closes, inv=False),
        lambda: detect_hs(l_idx, h_idx, closes, inv=True),
        lambda: detect_flag(closes, df["Open"].values.astype(float), is_bull=True),
        lambda: detect_flag(closes, df["Open"].values.astype(float), is_bull=False),
        lambda: detect_cup_handle(closes),
        lambda: detect_range(closes, highs, lows),
    ]:
        try:
            r = fn()
            if r:
                found.append(r)
        except Exception:
            pass

    return found


def _scan_ticker_patterns(meta: dict) -> Optional[dict]:
    """Fetch data for all timeframes and detect patterns. Runs in thread."""
    ticker_sym = meta["ticker"]
    detections = []

    for tf_key, tf_cfg in TIMEFRAMES.items():
        try:
            t    = yf.Ticker(ticker_sym)
            hist = t.history(period=tf_cfg["period"], interval=tf_cfg["interval"])
            if hist is None or len(hist) < tf_cfg["min_bars"]:
                continue

            patterns = _detect_patterns_for_df(hist)
            for p in patterns:
                p["timeframe"]         = tf_key
                p["timeframe_display"] = tf_cfg["display"]
                detections.append(p)
        except Exception as exc:
            logger.debug(f"Pattern scan {ticker_sym} {tf_key}: {exc}")

    if not detections:
        return None

    # Current price
    try:
        price = float(yf.Ticker(ticker_sym).fast_info.last_price or 0)
    except Exception:
        price = 0.0

    return {
        "symbol":     meta["ticker"].replace(".NS", ""),
        "ticker":     meta["ticker"],
        "name":       meta["name"],
        "sector":     meta["sector"],
        "price":      round(price, 2),
        "patterns":   detections,
        "pattern_count": len(detections),
        "top_pattern": detections[0]["pattern"],
        "top_bias":    detections[0]["bias"],
        "top_tf":      detections[0]["timeframe"],
    }


async def _build_pattern_scan(symbols: Optional[list] = None) -> list:
    """Run pattern scan across SCAN_UNIVERSE (or custom list) using thread pool."""
    universe = SCAN_UNIVERSE
    if symbols:
        syms_upper = [s.upper() for s in symbols]
        filtered   = [s for s in SCAN_UNIVERSE if s["ticker"].replace(".NS", "") in syms_upper]
        if filtered:
            universe = filtered

    loop    = asyncio.get_event_loop()
    results = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_scan_ticker_patterns, meta): meta for meta in universe}
        done    = await loop.run_in_executor(
            None,
            lambda: concurrent.futures.wait(list(futures.keys()), timeout=90),
        )

    for fut in futures:
        try:
            r = fut.result()
            if r:
                results.append(r)
        except Exception as exc:
            logger.debug(f"Pattern future error: {exc}")

    # Sort: more patterns first, then by confidence of top pattern
    results.sort(key=lambda x: (x["pattern_count"], x["patterns"][0]["confidence"]), reverse=True)
    return results


# ═══════════════════════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/detections")
async def get_insider_detections(refresh: bool = False):
    """
    SEBI Regulation 7(2) insider trading disclosures — last 7 days.
    Priority score: 8+ HIGH | 5-7 WATCHLIST | <5 MONITOR.
    Cache: 30 min.
    """
    global _insider_cache
    now = datetime.now(timezone.utc)

    if not refresh and _insider_cache["data"] is not None and _insider_cache["ts"]:
        if (now - _insider_cache["ts"]).total_seconds() < INSIDER_TTL:
            return {
                "detections": _insider_cache["data"],
                "count":      len(_insider_cache["data"]),
                "cached":     True,
                "updated_at": _insider_cache["ts"].isoformat(),
                "source":     "NSE SEBI Reg 7(2)",
            }

    try:
        detections = await _build_detections()
        _insider_cache = {"data": detections, "ts": now}
        return {
            "detections": detections,
            "count":      len(detections),
            "cached":     False,
            "updated_at": now.isoformat(),
            "source":     "NSE SEBI Reg 7(2)",
        }
    except Exception as e:
        logger.error(f"Insider detection error: {e}")
        return {"detections": [], "count": 0, "error": str(e), "updated_at": now.isoformat()}


@router.get("/pattern-scan")
async def get_pattern_scan(
    refresh:  bool             = False,
    symbols:  Optional[str]    = Query(None, description="Comma-separated NSE symbols, e.g. RELIANCE,TCS"),
    timeframe: Optional[str]   = Query(None, description="Filter: 15m | 1H | 1D"),
    pattern:  Optional[str]    = Query(None, description="Filter pattern name"),
    bias:     Optional[str]    = Query(None, description="BULLISH | BEARISH | NEUTRAL"),
):
    """
    Detects chart patterns across F&O stock universe.
    Patterns: Double Top/Bottom, H&S, Inverse H&S, Bull/Bear Flag, Cup & Handle, Range.
    Timeframes scanned: 15m, 1H, 1D.
    Cache: 15 min. Use ?refresh=true to force rescan.
    """
    global _pattern_cache
    now = datetime.now(timezone.utc)

    sym_list = [s.strip().upper() for s in symbols.split(",")] if symbols else None

    if not refresh and not sym_list and _pattern_cache["data"] is not None and _pattern_cache["ts"]:
        if (now - _pattern_cache["ts"]).total_seconds() < PATTERN_TTL:
            data = _pattern_cache["data"]
            # Apply filters on cached result
            data = _apply_filters(data, timeframe, pattern, bias)
            return {
                "results":       data,
                "count":         len(data),
                "cached":        True,
                "updated_at":    _pattern_cache["ts"].isoformat(),
                "scanned_stocks": len(SCAN_UNIVERSE),
            }

    try:
        raw  = await _build_pattern_scan(sym_list)
        if not sym_list:
            _pattern_cache = {"data": raw, "ts": now}

        filtered = _apply_filters(raw, timeframe, pattern, bias)
        return {
            "results":        filtered,
            "count":          len(filtered),
            "cached":         False,
            "updated_at":     now.isoformat(),
            "scanned_stocks": len(sym_list) if sym_list else len(SCAN_UNIVERSE),
        }
    except Exception as e:
        logger.error(f"Pattern scan error: {e}")
        return {"results": [], "count": 0, "error": str(e), "updated_at": now.isoformat()}


def _apply_filters(data: list, tf: Optional[str], pat: Optional[str], bias: Optional[str]) -> list:
    out = []
    for stock in data:
        patterns = stock["patterns"]
        if tf:
            patterns = [p for p in patterns if p["timeframe"].lower() == tf.lower()]
        if pat:
            patterns = [p for p in patterns if pat.lower() in p["pattern"].lower()]
        if bias:
            patterns = [p for p in patterns if p["bias"].upper() == bias.upper()]
        if patterns:
            out.append({**stock, "patterns": patterns, "pattern_count": len(patterns)})
    return out
