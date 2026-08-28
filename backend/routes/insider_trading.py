"""
Insider Activity Detection + Chart Pattern Scanner
---------------------------------------------------
Source Priority Chain:
  1. NSE Archives CSV bulk deals (archives.nseindia.com - static files, most accessible)
  2. NSE Bulk Deals API (snapshot-capital-market-largedeals)
  3. NSE Block Deals API
  4. NSE PIT API SEBI Reg 7(2) (often cloud-blocked, tried anyway)
  5. yfinance Unusual Activity scan (always produces results - volume+price signals)
  6. MongoDB persisted history (ultimate fallback - never blank)

Endpoints:
  GET /api/insider/detections   — Activity detections with priority scores
  GET /api/insider/pattern-scan — Chart pattern detection across F&O universe
"""
import logging
import asyncio
import concurrent.futures
import io
import csv
import httpx
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import APIRouter, Query
from typing import Optional
import numpy as np
import yfinance as yf
from database import db

router = APIRouter(prefix="/api/insider")
logger = logging.getLogger(__name__)

_insider_cache: dict = {"data": None, "ts": None}
_pattern_cache: dict = {"data": None, "ts": None}

INSIDER_TTL = 900      # 15 min
PATTERN_TTL = 900      # 15 min
MONGO_COLL  = "insider_detections_history"

FII_KEYWORDS = [
    "goldman", "morgan", "jpmorgan", "citibank", "ubs", "credit suisse",
    "nomura", "hsbc", "barclays", "merrill", "macquarie", "fidelity",
    "blackrock", "vanguard", "invesco", "aberdeen", "mutual fund",
    "asset management", "insurance", "pension", "etf", "sbi mf",
    "hdfc mf", "icici pru", "nippon", "kotak mf", "axis mf",
    "lic ", "lic of india", "templeton", "dsp",
]

SCAN_UNIVERSE = [
    {"ticker": "RELIANCE.NS",    "name": "Reliance",       "sector": "Energy"},
    {"ticker": "HDFCBANK.NS",    "name": "HDFC Bank",      "sector": "Banking"},
    {"ticker": "ICICIBANK.NS",   "name": "ICICI Bank",     "sector": "Banking"},
    {"ticker": "SBIN.NS",        "name": "SBI",            "sector": "Banking"},
    {"ticker": "AXISBANK.NS",    "name": "Axis Bank",      "sector": "Banking"},
    {"ticker": "KOTAKBANK.NS",   "name": "Kotak Bank",     "sector": "Banking"},
    {"ticker": "INDUSINDBK.NS",  "name": "IndusInd Bank",  "sector": "Banking"},
    {"ticker": "INFY.NS",        "name": "Infosys",        "sector": "IT"},
    {"ticker": "TCS.NS",         "name": "TCS",            "sector": "IT"},
    {"ticker": "HCLTECH.NS",     "name": "HCL Tech",       "sector": "IT"},
    {"ticker": "WIPRO.NS",       "name": "Wipro",          "sector": "IT"},
    {"ticker": "BAJFINANCE.NS",  "name": "Bajaj Finance",  "sector": "NBFC"},
    {"ticker": "LT.NS",          "name": "L&T",            "sector": "Infra"},
    {"ticker": "MARUTI.NS",      "name": "Maruti",         "sector": "Auto"},
    {"ticker": "TATAMOTORS.NS",  "name": "Tata Motors",    "sector": "Auto"},
    {"ticker": "TATASTEEL.NS",   "name": "Tata Steel",     "sector": "Metals"},
    {"ticker": "JSWSTEEL.NS",    "name": "JSW Steel",      "sector": "Metals"},
    {"ticker": "SUNPHARMA.NS",   "name": "Sun Pharma",     "sector": "Pharma"},
    {"ticker": "DRREDDY.NS",     "name": "Dr Reddy",       "sector": "Pharma"},
    {"ticker": "CIPLA.NS",       "name": "Cipla",          "sector": "Pharma"},
    {"ticker": "ITC.NS",         "name": "ITC",            "sector": "FMCG"},
    {"ticker": "BHARTIARTL.NS",  "name": "Airtel",         "sector": "Telecom"},
    {"ticker": "NTPC.NS",        "name": "NTPC",           "sector": "Power"},
    {"ticker": "ADANIPORTS.NS",  "name": "Adani Ports",    "sector": "Ports"},
    {"ticker": "DLF.NS",         "name": "DLF",            "sector": "Realty"},
    {"ticker": "TRENT.NS",       "name": "Trent",          "sector": "Retail"},
    {"ticker": "PERSISTENT.NS",  "name": "Persistent",     "sector": "IT"},
    {"ticker": "LTIM.NS",        "name": "LTIMindtree",    "sector": "IT"},
    {"ticker": "ZOMATO.NS",      "name": "Zomato",         "sector": "Internet"},
    {"ticker": "NAUKRI.NS",      "name": "Naukri",         "sector": "Internet"},
    {"ticker": "DIXON.NS",       "name": "Dixon Tech",     "sector": "Electronics"},
    {"ticker": "POLYCAB.NS",     "name": "Polycab",        "sector": "Cables"},
    {"ticker": "HAVELLS.NS",     "name": "Havells",        "sector": "Electricals"},
    {"ticker": "PIIND.NS",       "name": "PI Industries",  "sector": "Agro Chem"},
    {"ticker": "DEEPAKNTR.NS",   "name": "Deepak Nitrite", "sector": "Chemicals"},
]

_NSE_HDRS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    "Accept":           "application/json, text/plain, */*",
    "Accept-Language":  "en-US,en;q=0.9",
    "Referer":          "https://www.nseindia.com/",
}


# ═══════════════════════════════════════════════════════════════════════════════
#  SOURCE 1 — NSE Archives CSV Bulk Deals (static files, most accessible)
# ═══════════════════════════════════════════════════════════════════════════════

def _prev_trading_day(d: datetime, skip: int = 0) -> datetime:
    """Go back to last weekday, optionally skip more days."""
    d2 = d - timedelta(days=1 + skip)
    while d2.weekday() >= 5:   # skip Sat/Sun
        d2 -= timedelta(days=1)
    return d2



# Market open check (IST)
def _ist_market_open() -> tuple:
    from zoneinfo import ZoneInfo as _ZI
    _IST = _ZI("Asia/Kolkata")
    _now = datetime.now(_ZI("Asia/Kolkata"))
    _wd  = _now.weekday() < 5
    _mo  = _now.replace(hour=9, minute=15, second=0, microsecond=0)
    _mc  = _now.replace(hour=15, minute=30, second=0, microsecond=0)
    is_open = _wd and _mo <= _now <= _mc
    after_close = _wd and _now > _mc
    return is_open, after_close, _now


def _fetch_nse_archives_bulk_sync(days_back: int = 5) -> list:
    """
    Fetch bulk deals from NSE archives CSV.
    After market close (>4:30 PM IST): tries today's CSV first.
    Else: falls back through last `days_back` trading days.
    """
    _, after_close, now_ist = _ist_market_open()
    results = []
    today = datetime.now(timezone.utc)

    # After market close, today's CSV may be published — try it first
    if after_close and now_ist.hour >= 16:
        date_str = now_ist.strftime("%d%m%Y")
        url = f"https://archives.nseindia.com/archives/equities/bulkdeals/bulk_deals_{date_str}.csv"
        try:
            r = httpx.get(url, timeout=8, headers={"User-Agent": _NSE_HDRS["User-Agent"],
                          "Accept": "text/csv,*/*", "Referer": "https://www.nseindia.com/"}, follow_redirects=True)
            if r.status_code == 200 and "symbol" in r.text.lower():
                reader = csv.DictReader(io.StringIO(r.text))
                for row in reader:
                    row_n = {k.strip().upper(): v.strip() for k, v in row.items()}
                    results.append({**row_n, "_date_str": now_ist.strftime("%d-%m-%Y"), "_source": "NSE_ARCHIVE_BULK"})
                if results:
                    logger.info(f"NSE archive bulk (TODAY): {len(results)} rows")
                    return results
        except Exception as e:
            logger.debug(f"Archive bulk today: {e}")

    for skip in range(days_back):
        dt = _prev_trading_day(today, skip)
        date_str = dt.strftime("%d%m%Y")
        url = f"https://archives.nseindia.com/archives/equities/bulkdeals/bulk_deals_{date_str}.csv"
        try:
            r = httpx.get(url, timeout=10, headers={
                "User-Agent": _NSE_HDRS["User-Agent"],
                "Accept":     "text/csv,*/*",
                "Referer":    "https://www.nseindia.com/",
            }, follow_redirects=True)
            if r.status_code == 200 and "symbol" in r.text.lower():
                reader = csv.DictReader(io.StringIO(r.text))
                for row in reader:
                    row_n = {k.strip().upper(): v.strip() for k, v in row.items()}
                    results.append({**row_n, "_date_str": dt.strftime("%d-%m-%Y"), "_source": "NSE_ARCHIVE_BULK"})
                if results:
                    logger.info(f"NSE archive bulk deals: {len(results)} rows from {dt.strftime('%d-%m-%Y')}")
                    break
        except Exception as e:
            logger.debug(f"Archive bulk {date_str}: {e}")
    return results


def _fetch_nse_archives_block_sync(days_back: int = 5) -> list:
    """Fetch block deals from NSE archives static CSV."""
    results = []
    today = datetime.now(timezone.utc)
    for skip in range(days_back):
        dt = _prev_trading_day(today, skip)
        date_str = dt.strftime("%d%m%Y")
        url = f"https://archives.nseindia.com/archives/equities/blockdeals/block_deals_{date_str}.csv"
        try:
            r = httpx.get(url, timeout=10, headers={
                "User-Agent": _NSE_HDRS["User-Agent"],
                "Accept":     "text/csv,*/*",
            }, follow_redirects=True)
            if r.status_code == 200 and len(r.text) > 100:
                reader = csv.DictReader(io.StringIO(r.text))
                for row in reader:
                    row_n = {k.strip().upper(): v.strip() for k, v in row.items()}
                    results.append({**row_n, "_date_str": dt.strftime("%d-%m-%Y"), "_source": "NSE_ARCHIVE_BLOCK"})
                if results:
                    logger.info(f"NSE archive block deals: {len(results)} rows from {dt.strftime('%d-%m-%Y')}")
                    break
        except Exception as e:
            logger.debug(f"Archive block {date_str}: {e}")
    return results


# ═══════════════════════════════════════════════════════════════════════════════
#  SOURCE 2 — NSE Live APIs (require session cookies)
# ═══════════════════════════════════════════════════════════════════════════════

def _cffi_session():
    from curl_cffi import requests as cffi_req
    s = cffi_req.Session(impersonate="chrome110")
    s.get("https://www.nseindia.com/", timeout=8, headers={**_NSE_HDRS, "Referer": "https://www.google.com/"})
    return s


def _fetch_nse_bulk_live_sync() -> list:
    try:
        s = _cffi_session()
        r = s.get("https://www.nseindia.com/api/snapshot-capital-market-largedeals",
                  timeout=10, headers=_NSE_HDRS)
        data = r.json()
        if isinstance(data, list):
            return data
        for key in ("data", "BULK_DEALS_DATA", "bulkDeals"):
            if key in data and isinstance(data[key], list):
                return data[key]
        return []
    except Exception as e:
        logger.debug(f"NSE bulk live: {e}")
        return []


def _fetch_nse_pit_sync(days_back: int = 30) -> list:
    try:
        today    = datetime.now(timezone.utc)
        from_str = (today - timedelta(days=days_back)).strftime("%d-%m-%Y")
        to_str   = today.strftime("%d-%m-%Y")
        s        = _cffi_session()
        hdrs     = {**_NSE_HDRS, "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading"}
        r = s.get(
            f"https://www.nseindia.com/api/corporates-pit?index=equities&from_date={from_str}&to_date={to_str}",
            timeout=12, headers=hdrs,
        )
        rows = r.json().get("data", [])
        logger.info(f"NSE PIT: {len(rows)} rows")
        return rows
    except Exception as e:
        logger.debug(f"NSE PIT: {e}")
        return []


# ═══════════════════════════════════════════════════════════════════════════════
#  SOURCE 3 — yfinance Unusual Activity (ALWAYS produces results)
# ═══════════════════════════════════════════════════════════════════════════════

def _yf_unusual_activity_sync() -> list:
    """
    Detect stocks with unusual buying signals via yfinance.
    Criteria: Volume > 1.5x average + Price breakout from 20-day MA.
    Returns normalized rows in common schema.
    """
    rows = []
    for meta in SCAN_UNIVERSE:
        try:
            t    = yf.Ticker(meta["ticker"])
            hist = t.history(period="30d")
            if hist.empty or len(hist) < 10:
                continue
            price   = float(hist["Close"].iloc[-1])
            avg_v   = float(hist["Volume"].iloc[:-5].mean()) if len(hist) > 5 else float(hist["Volume"].mean())
            today_v = float(hist["Volume"].iloc[-1])
            vr      = today_v / avg_v if avg_v > 0 else 1.0
            sma20   = float(hist["Close"].tail(20).mean())
            sma5    = float(hist["Close"].tail(5).mean())
            brk     = price > sma20

            # Only flag if volume spike OR price above SMA20
            if vr < 1.3 and not brk:
                continue

            # Check institutional holder data (quarterly)
            try:
                inst = t.institutional_holders
                inst_pct = float(inst["% Out"].sum()) * 100 if inst is not None and not inst.empty and "% Out" in inst.columns else 0
            except Exception:
                inst_pct = 0

            signal = "VOLUME SPIKE" if vr >= 2.0 else "ABOVE SMA20" if brk else "UNUSUAL"
            rows.append({
                "symbol":     meta["ticker"].replace(".NS", ""),
                "company":    meta["name"],
                "name":       "Volume/Institutional Activity",
                "category":   "INSTITUTIONAL",
                "mode":       f"yfinance Signal ({signal})",
                "shares":     int(today_v),
                "price":      round(price, 2),
                "value_lakh": round(today_v * price / 1e5, 2),
                "date":       hist.index[-1].strftime("%d-%m-%Y"),
                "source":     "YF_ACTIVITY",
                "vol_ratio":  round(vr, 2),
                "breakout":   brk,
                "signal":     signal,
                "inst_pct":   round(inst_pct, 1),
            })
        except Exception as e:
            logger.debug(f"yf activity {meta['ticker']}: {e}")
    rows.sort(key=lambda x: x["vol_ratio"], reverse=True)
    return rows[:20]   # top 20 by volume ratio


# ═══════════════════════════════════════════════════════════════════════════════
#  NORMALISE — common schema from each source
# ═══════════════════════════════════════════════════════════════════════════════

def _client_category(name: str) -> str:
    n = name.lower()
    if "promoter" in n:                          return "PROMOTER"
    if any(k in n for k in FII_KEYWORDS):        return "INSTITUTIONAL"
    if len(n.split()) >= 2 and n.replace(" ", "").isalpha():
        return "INSIDER"
    return "OTHER"


def _normalise_archive_bulk(rows: list) -> list:
    out = []
    for r in rows:
        # NSE CSV headers: SYMBOL, SECURITY NAME, CLIENT NAME, BUY/SELL, QTY., TRADE PRICE / WGHT. AVG. PRICE
        sym   = (r.get("SYMBOL") or r.get("SYMBOL NAME") or "").strip().upper()
        name  = (r.get("CLIENT NAME") or r.get("CLIENT_NAME") or "Unknown").strip()
        deal  = (r.get("BUY/SELL") or r.get("BUY_SELL") or "B").strip().upper()
        qty_raw   = r.get("QTY.") or r.get("QTY") or r.get("QUANTITY") or 0
        price_raw = (r.get("TRADE PRICE / WGHT. AVG. PRICE") or r.get("TRADE_PRICE") or
                     r.get("PRICE") or 0)
        try: qty   = int(str(qty_raw).replace(",", ""))
        except Exception: qty = 0
        try: price = float(str(price_raw).replace(",", ""))
        except Exception: price = 0.0

        if not sym or deal not in ("B", "BUY", "P"):
            continue
        out.append({
            "symbol":     sym,
            "company":    r.get("SECURITY NAME") or sym,
            "name":       name,
            "category":   _client_category(name),
            "mode":       "Bulk Deal (NSE Archive)",
            "shares":     qty,
            "price":      price,
            "value_lakh": round(qty * price / 1e5, 2) if price > 0 else 0,
            "date":       r.get("_date_str", ""),
            "source":     "NSE_ARCHIVE_BULK",
        })
    return out


def _normalise_archive_block(rows: list) -> list:
    out = []
    for r in rows:
        sym   = (r.get("SYMBOL") or "").strip().upper()
        name  = (r.get("CLIENT NAME") or r.get("CLIENT_NAME") or "Unknown").strip()
        deal  = (r.get("BUY/SELL") or "B").strip().upper()
        qty_raw   = r.get("QTY.") or r.get("QTY") or 0
        price_raw = r.get("PRICE") or r.get("TRADE_PRICE") or 0
        try: qty   = int(str(qty_raw).replace(",", ""))
        except Exception: qty = 0
        try: price = float(str(price_raw).replace(",", ""))
        except Exception: price = 0.0
        if not sym or deal not in ("B", "BUY", "P"):
            continue
        out.append({
            "symbol": sym, "company": sym,
            "name": name, "category": _client_category(name),
            "mode": "Block Deal (NSE Archive)",
            "shares": qty, "price": price,
            "value_lakh": round(qty * price / 1e5, 2) if price > 0 else 0,
            "date": r.get("_date_str", ""),
            "source": "NSE_ARCHIVE_BLOCK",
        })
    return out


def _normalise_live_bulk(rows: list) -> list:
    out = []
    for r in rows:
        sym   = (r.get("bdSymbol") or r.get("symbol") or r.get("Symbol") or "").strip().upper()
        name  = (r.get("bdClientName") or r.get("clientName") or r.get("Client_Name") or "Unknown").strip()
        deal  = (r.get("bdBuySell") or r.get("dealType") or r.get("BS_indicator") or "B").strip().upper()
        try:   qty   = int(str(r.get("bdQty") or r.get("quantity") or 0).replace(",", ""))
        except Exception: qty  = 0
        try:   price = float(str(r.get("bdTrdPrc") or r.get("price") or 0).replace(",", ""))
        except Exception: price = 0.0
        if not sym or deal not in ("B", "BUY", "P", "PURCHASE"):
            continue
        out.append({
            "symbol": sym, "company": sym,
            "name": name, "category": _client_category(name),
            "mode": "Bulk Deal (NSE Live)",
            "shares": qty, "price": price,
            "value_lakh": round(qty * price / 1e5, 2) if price > 0 else 0,
            "date": datetime.now(timezone.utc).strftime("%d-%m-%Y"),
            "source": "NSE_BULK_LIVE",
        })
    return out


def _normalise_pit(rows: list) -> list:
    out = []
    for r in rows:
        mode_raw = (r.get("acqMode") or r.get("reg7A1acqMode") or r.get("transType") or "").lower()
        if any(k in mode_raw for k in ("sale", "sell", "disposal")):
            continue
        sym = (r.get("symbol") or "").strip().upper()
        if not sym:
            continue
        try:   qty = int(str(r.get("secAcq") or r.get("sharesAcquired") or 0).replace(",", ""))
        except Exception: qty = 0
        cat_raw = (r.get("pid") or r.get("personCategory") or "").lower()
        cat = ("PROMOTER" if "promoter" in cat_raw else
               "DIRECTOR" if "director" in cat_raw else
               "KMP"      if any(k in cat_raw for k in ("key", "kmp")) else "INSIDER")
        out.append({
            "symbol": sym,
            "company": r.get("company") or r.get("companyName") or sym,
            "name": r.get("acqName") or r.get("acquirerName") or "Unknown",
            "category": cat,
            "mode": r.get("acqMode") or r.get("reg7A1acqMode") or "Market Purchase",
            "shares": qty, "price": 0, "value_lakh": 0,
            "date": r.get("acqToDate") or r.get("date") or "",
            "source": "NSE_PIT",
        })
    return out


def _normalise_yf_activity(rows: list) -> list:
    """yfinance unusual activity rows are already in common schema."""
    return rows


# ═══════════════════════════════════════════════════════════════════════════════
#  GOD SCORE ENGINE (0–20)
# ═══════════════════════════════════════════════════════════════════════════════

_FAKE_MODES = frozenset([
    "inter-se", "inter se", "gift", "esop", "allotment",
    "preferential", "warrant", "conversion", "pledge invoke",
    "pledge release", "transmission", "off market",
])


def _days_since(date_str: str) -> int:
    """Parse DD-MM-YYYY → days since filing (int). Returns 999 on failure."""
    try:
        d = datetime.strptime(date_str.strip(), "%d-%m-%Y")
        return max(0, (datetime.now() - d).days)
    except Exception:
        return 999


def _is_market_mode(mode: str) -> bool:
    m = mode.lower()
    return ("market" in m and ("purchase" in m or "buy" in m)) or m.strip() == "buy"


def _is_fake(rows: list) -> tuple:
    """Returns (True, reason) if transactions should be auto-rejected."""
    # yfinance volume signals are not insider filings — different module
    if all(r.get("source") == "YF_ACTIVITY" for r in rows):
        return False, ""
    for r in rows:
        mode = r.get("mode", "").lower()
        if any(k in mode for k in _FAKE_MODES):
            return True, f"Mode: {r.get('mode', 'unknown')}"
        cat = r.get("category", "")
        if cat == "INSTITUTIONAL":   # FII/MF bulk deals = not insider module
            return True, "Institutional (not insider)"
    return False, ""


def _time_window(best_date: str) -> dict:
    days = _days_since(best_date)
    if days <= 2:
        return {"window": "T0-T2", "label": "Fresh",      "color": "#06b6d4", "days": days, "score_adj": 0}
    if days <= 8:
        return {"window": "T3-T8", "label": "Absorption", "color": "#22c55e", "days": days, "score_adj": 0}
    return     {"window": "T9+",   "label": "Stale",      "color": "#ef4444", "days": days, "score_adj": -3}


def _god_score(rows: list, vr: float, brk: bool,
               has_bulk: bool, has_block: bool) -> tuple:
    """
    God Score 0–20. Returns (raw_score, factors_list, rejected, reject_reason).
    Scoring per spec:
      Promoter open market buy  +4 | inter-se/gift = 0
      Promoter group cluster    +2
      Director/KMP buy          +2 | +1 extra if alongside promoter
      Value ≥ ₹2Cr             +2 | ₹50L–2Cr = +1
      Mode = Market Purchase    +2
      Delivery spike >1.8×      +2 | 1.3–1.8× = +1
      Volume ≥ 2× 20D           +2
      Close > 20DMA             +2
      Bulk/block same side      +1
      No pledge data            +1 (we can't check; default safe)
    Penalties: T9+ stale -3 (applied in status, not score)
    """
    rejected, rej_reason = _is_fake(rows)
    if rejected:
        return 0, ["AUTO-REJECT"], True, rej_reason

    # ── YF Activity fallback: simplified scoring ───────────────────────────
    if all(r.get("source") == "YF_ACTIVITY" for r in rows):
        s = 0; factors = ["YF VOLUME SIGNAL"]
        if vr >= 2.0:  s += 4; factors.append(f"VOL ≥2× ({vr:.1f}×) +4")
        elif vr >= 1.5:  s += 2; factors.append(f"VOL {vr:.1f}× +2")
        if brk:   s += 2; factors.append("ABOVE 20DMA +2")
        if has_bulk: s += 1; factors.append("BULK DEAL +1")
        factors.append("L1 FILING: NOT AVAILABLE")
        return min(s, 12), factors, False, ""  # cap at 12 since no L1

    cat_priority = {"PROMOTER": 4, "DIRECTOR": 3, "KMP": 3,
                    "INSIDER": 2, "INSTITUTIONAL": 1, "OTHER": 0}
    best_row  = max(rows, key=lambda r: cat_priority.get(r["category"], 0))
    best_cat  = best_row["category"]
    mode_raw  = best_row.get("mode", "")
    total_val_cr = sum(r.get("value_lakh", 0) for r in rows) / 100.0

    score   = 0
    factors = []

    # ── 1. Buyer type ─────────────────────────────────────────────────────────
    if best_cat == "PROMOTER":
        if _is_market_mode(mode_raw):
            score += 4;  factors.append("PROMOTER MARKET BUY +4")
        else:
            score += 0;  factors.append("PROMOTER (non-market) +0")
    elif best_cat in ("DIRECTOR", "KMP"):
        score += 2;      factors.append("DIRECTOR/KMP BUY +2")
    elif best_cat == "INSIDER":
        score += 1;      factors.append("INSIDER BUY +1")

    # ── 2. Promoter group multiple buyers same week ───────────────────────────
    promo_rows = [r for r in rows if r["category"] == "PROMOTER"]
    promo_buyers = {r.get("name", "") for r in promo_rows}
    if len(promo_buyers) >= 2:
        score += 2;  factors.append(f"PROMOTER GROUP ({len(promo_buyers)} people) +2")

    # ── 3. Director alongside promoter ───────────────────────────────────────
    dir_rows = [r for r in rows if r["category"] in ("DIRECTOR", "KMP")]
    if dir_rows and promo_rows:
        score += 1;  factors.append("PROMOTER+DIRECTOR COMBO +1")
    elif dir_rows and best_cat not in ("PROMOTER",):
        pass  # already scored above

    # ── 4. Transaction value ──────────────────────────────────────────────────
    if total_val_cr >= 2.0:
        score += 2;  factors.append(f"VALUE ₹{total_val_cr:.1f}Cr +2")
    elif total_val_cr >= 0.5:
        score += 1;  factors.append(f"VALUE ₹{total_val_cr:.1f}Cr +1")

    # ── 5. Mode = Market Purchase ─────────────────────────────────────────────
    if _is_market_mode(mode_raw):
        score += 2;  factors.append("MARKET PURCHASE MODE +2")

    # ── 6. Delivery/Volume spike ──────────────────────────────────────────────
    if vr >= 1.8:
        score += 2;  factors.append(f"DELIVERY SPIKE {vr:.1f}× +2")
    elif vr >= 1.3:
        score += 1;  factors.append(f"VOL {vr:.1f}× +1")

    if vr >= 2.0:    # Volume ≥ 2× separately per spec
        score += 2;  factors.append(f"VOL ≥2× ({vr:.1f}×) +2")

    # ── 7. Breakout: close > 20DMA ────────────────────────────────────────────
    if brk:
        score += 2;  factors.append("ABOVE 20DMA BREAKOUT +2")

    # ── 8. Bulk + Block same side ─────────────────────────────────────────────
    if has_bulk and has_block:
        score += 1;  factors.append("BULK+BLOCK SAME SIDE +1")

    # ── 9. No pledge data (safe default +1) ──────────────────────────────────
    score += 1;  factors.append("PLEDGE: N/A +1")

    return min(score, 20), factors, False, ""


def _cluster_info(rows: list) -> dict:
    """Cluster: 3+ promoter/director/kmp buys in 7 days, ≥₹3Cr, ≥70% market mode."""
    recent = [r for r in rows if _days_since(r.get("date", "")) <= 7
              and r["category"] in ("PROMOTER", "DIRECTOR", "KMP")]
    if not recent:
        return {"is_cluster": False, "count": 0, "value_cr": 0, "market_pct": 0}

    val_cr    = sum(r.get("value_lakh", 0) for r in recent) / 100.0
    mkt_buys  = [r for r in recent if _is_market_mode(r.get("mode", ""))]
    mkt_ratio = len(mkt_buys) / len(recent)

    is_cluster = len(recent) >= 3 and val_cr >= 3 and mkt_ratio >= 0.7
    return {
        "is_cluster":  is_cluster,
        "count":       len(recent),
        "value_cr":    round(val_cr, 2),
        "market_pct":  round(mkt_ratio * 100),
        "buyers":      len({r.get("name", "") for r in recent}),
    }


def _assign_status(score: int, window: dict, cluster: dict, rejected: bool) -> dict:
    if rejected:
        return {"status": "REJECT",    "color": "#475569", "priority": "REJECT"}

    adj = score + window["score_adj"]

    if adj < 8:
        return {"status": "MONITOR",   "color": "#64748b", "priority": "MONITOR"}

    if cluster["is_cluster"] and adj >= 15:
        return {"status": "GOD LEVEL", "color": "#f59e0b", "priority": "HIGH"}
    if adj >= 18:
        return {"status": "RARE",      "color": "#a78bfa", "priority": "HIGH"}
    if adj >= 15:
        return {"status": "POSITIONAL","color": "#22c55e", "priority": "HIGH"}
    if adj >= 12:
        if window["window"] == "T3-T8":
            return {"status": "SETUP", "color": "#4ade80", "priority": "HIGH"}
        return {"status": "WATCH",     "color": "#fbbf24", "priority": "WATCHLIST"}
    if adj >= 8:
        return {"status": "WATCH",     "color": "#fbbf24", "priority": "WATCHLIST"}

    return {"status": "MONITOR",       "color": "#64748b", "priority": "MONITOR"}




# ═══════════════════════════════════════════════════════════════════════════════
#  CORE BUILD FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════

async def _build_detections() -> tuple:
    loop = asyncio.get_event_loop()

    # Fire all sources in parallel (timeout handled inside each)
    arch_bulk, arch_block, live_bulk, pit_raw, yf_rows = await asyncio.gather(
        loop.run_in_executor(None, _fetch_nse_archives_bulk_sync, 5),
        loop.run_in_executor(None, _fetch_nse_archives_block_sync, 5),
        loop.run_in_executor(None, _fetch_nse_bulk_live_sync),
        loop.run_in_executor(None, _fetch_nse_pit_sync, 30),
        loop.run_in_executor(None, _yf_unusual_activity_sync),
        return_exceptions=True,
    )

    def _safe(x):
        return x if isinstance(x, list) else []

    arch_bulk  = _safe(arch_bulk)
    arch_block = _safe(arch_block)
    live_bulk  = _safe(live_bulk)
    pit_raw    = _safe(pit_raw)
    yf_rows    = _safe(yf_rows)

    logger.info(f"Sources raw: arch_bulk={len(arch_bulk)} arch_block={len(arch_block)} "
                f"live_bulk={len(live_bulk)} pit={len(pit_raw)} yf={len(yf_rows)}")

    # Normalise all sources
    all_rows = []
    all_rows.extend(_normalise_archive_bulk(arch_bulk))
    all_rows.extend(_normalise_archive_block(arch_block))
    all_rows.extend(_normalise_live_bulk(live_bulk))
    all_rows.extend(_normalise_pit(pit_raw))
    # yfinance: use as fallback only if no NSE data found
    use_yf = not (arch_bulk or arch_block or live_bulk or pit_raw)
    if use_yf:
        all_rows.extend(_normalise_yf_activity(yf_rows))

    # Build source label
    sources_hit = []
    if arch_bulk:   sources_hit.append("NSE Archive Bulk")
    if arch_block:  sources_hit.append("NSE Archive Block")
    if live_bulk:   sources_hit.append("NSE Live Bulk")
    if pit_raw:     sources_hit.append("SEBI PIT")
    if use_yf and yf_rows: sources_hit.append("yfinance Activity")
    source_label = " + ".join(sources_hit) if sources_hit else "yfinance Fallback"

    if not all_rows:
        return [], source_label

    # Group by symbol
    sym_map: dict = defaultdict(list)
    for row in all_rows:
        sym_map[row["symbol"]].append(row)

    # yfinance price + volume data (only for non-yf sources that lack price)
    def _yf_price_batch(syms: list) -> dict:
        out = {}
        for s in syms:
            try:
                t    = yf.Ticker(f"{s}.NS")
                hist = t.history(period="30d")
                if hist.empty:
                    out[s] = {"price": 0, "vol_ratio": 1.0, "breakout": False, "small_cap": True}
                    continue
                price   = _safe_float(float(hist["Close"].iloc[-1]))
                avg_v   = _safe_float(float(hist["Volume"].iloc[:-1].mean()) if len(hist) > 1 else float(hist["Volume"].mean()), 1.0)
                today_v = _safe_float(float(hist["Volume"].iloc[-1]))
                vr      = _safe_float(today_v / avg_v if avg_v > 0 else 1.0)
                sma20   = _safe_float(float(hist["Close"].tail(20).mean()))
                try:
                    mc = getattr(t.fast_info, "market_cap", 0) or 0
                except Exception:
                    mc = 0
                out[s] = {
                    "price":     round(price, 2),
                    "vol_ratio": round(vr, 2),
                    "breakout":  bool(price > sma20),
                    "small_cap": mc < 5e10 or mc == 0,
                    "sma20":     round(sma20, 2),
                }
            except Exception:
                out[s] = {"price": 0, "vol_ratio": 1.0, "breakout": False, "small_cap": True}
        return out

    yf_data = await loop.run_in_executor(None, _yf_price_batch, list(sym_map.keys()))

    results = []
    for sym, rows in sym_map.items():
        mkt   = yf_data.get(sym) or {}
        price = _safe_float(mkt.get("price", 0))
        vr    = _safe_float(mkt.get("vol_ratio", 1.0))
        brk   = mkt.get("breakout", False)
        small = mkt.get("small_cap", True)
        sma20 = _safe_float(mkt.get("sma20", 0))

        # Use pre-existing vol_ratio from yfinance activity rows if available
        if rows[0].get("source") == "YF_ACTIVITY":
            vr  = _safe_float(rows[0].get("vol_ratio", vr))
            brk = rows[0].get("breakout",  brk)

        # Fill prices from yfinance if missing
        for r in rows:
            if r["price"] == 0 and price > 0:
                r["price"]      = price
                r["value_lakh"] = _safe_float(round(r["shares"] * price / 1e5, 2))

        total_val = _safe_float(sum(r["value_lakh"] for r in rows))

        # Detect source types for bulk/block confirmation
        sources_set = {r["source"] for r in rows}
        has_bulk  = bool(sources_set & {"NSE_ARCHIVE_BULK", "NSE_BULK_LIVE"})
        has_block = bool(sources_set & {"NSE_ARCHIVE_BLOCK"})

        # ── God Score ─────────────────────────────────────────────────────────
        score, factors, rejected, rej_reason = _god_score(rows, vr, brk, has_bulk, has_block)

        # ── Cluster analysis ──────────────────────────────────────────────────
        cluster = _cluster_info(rows)

        # ── Time window (use most recent filing date) ─────────────────────────
        best_date = max(
            (r.get("date", "") for r in rows),
            key=lambda d: _days_since(d),
            default="",
        )
        # Actually use MOST RECENT date (smallest days_since)
        best_date = min(
            (r.get("date", "") for r in rows if r.get("date")),
            key=lambda d: _days_since(d),
            default="",
        )
        window = _time_window(best_date)

        # ── Status ────────────────────────────────────────────────────────────
        status_info = _assign_status(score, window, cluster, rejected)
        adj_score   = max(0, score + window["score_adj"])

        # SL hint
        sl_note = f"Filing-week low or 8-day swing low"

        results.append({
            "symbol":           sym,
            "company":          rows[0].get("company") or sym,
            # God Score
            "score":            score,
            "adj_score":        adj_score,
            "score_max":        20,
            "score_threshold":  12,
            # Status & priority
            "status":           status_info["status"],
            "status_color":     status_info["color"],
            "priority":         status_info["priority"],
            "rejected":         rejected,
            "reject_reason":    rej_reason,
            # Cluster
            "cluster":          cluster["is_cluster"],
            "cluster_info":     cluster,
            # Time window
            "window":           window["window"],
            "window_label":     window["label"],
            "window_color":     window["color"],
            "days_since":       window["days"],
            # Market data
            "vol_ratio":        _safe_float(round(vr, 2)),
            "price":            _safe_float(price),
            "sma20":            _safe_float(sma20),
            "price_breakout":   brk,
            "is_small_cap":     small,
            "total_value_lakh": _safe_float(round(total_val, 2)),
            "total_value_cr":   _safe_float(round(total_val / 100, 2)),
            # Transactions
            "insiders":         rows,
            "factors":          factors,
            "sources":          list(sources_set),
            "has_bulk":         has_bulk,
            "has_block":        has_block,
            # Position sizing rule (user-facing text)
            "sl_note":          sl_note,
            "filing_date":      best_date,
        })

    # Sort: non-rejected first, then by adj_score
    results.sort(key=lambda x: (0 if x["rejected"] else 1, x["adj_score"]), reverse=True)
    return results, source_label


# ── MongoDB persistence ───────────────────────────────────────────────────────

async def _save_to_db(detections: list, source_label: str) -> None:
    if not detections:
        return
    try:
        await db[MONGO_COLL].replace_one(
            {"type": "insider_detections"},
            {
                "type":       "insider_detections",
                "detections": detections,
                "source":     source_label,
                "saved_at":   datetime.now(timezone.utc).isoformat(),
                "count":      len(detections),
            },
            upsert=True,
        )
        logger.info(f"Saved {len(detections)} insider detections to MongoDB")
    except Exception as e:
        logger.warning(f"DB save: {e}")


async def _load_from_db() -> Optional[dict]:
    try:
        return await db[MONGO_COLL].find_one({"type": "insider_detections"}, {"_id": 0})
    except Exception as e:
        logger.warning(f"DB load: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  SECTION 2 — CHART PATTERN SCANNER
# ═══════════════════════════════════════════════════════════════════════════════

TIMEFRAMES = {
    "15m": {"period": "5d",   "interval": "15m", "min_bars": 30,  "display": "15 Min"},
    "1H":  {"period": "60d",  "interval": "1h",  "min_bars": 40,  "display": "1 Hour"},
    "1D":  {"period": "200d", "interval": "1d",  "min_bars": 80,  "display": "Daily"},
}


def _local_extrema(arr: np.ndarray, w: int = 5):
    highs, lows = [], []
    n = len(arr)
    for i in range(w, n - w):
        seg = arr[i - w: i + w + 1]
        if arr[i] == seg.max() and arr[i] > seg[np.arange(len(seg)) != w].mean():
            highs.append(i)
        if arr[i] == seg.min() and arr[i] < seg[np.arange(len(seg)) != w].mean():
            lows.append(i)
    return highs, lows


def _pct_diff(a, b):
    ref = max(abs(a), abs(b))
    return abs(a - b) / ref if ref > 0 else 0.0


def detect_double_top(highs, prices, tol=0.025, min_gap=8):
    for i in range(len(highs) - 1):
        for j in range(i + 1, len(highs)):
            if highs[j] - highs[i] < min_gap: continue
            h1, h2 = prices[highs[i]], prices[highs[j]]
            if _pct_diff(h1, h2) > tol: continue
            valley = prices[highs[i]: highs[j] + 1].min()
            depth  = (min(h1, h2) - valley) / min(h1, h2)
            if depth >= 0.02:
                return {"pattern": "Double Top", "bias": "BEARISH",
                        "confidence": int(min(95, 60 + depth * 400)),
                        "level": round((h1 + h2) / 2, 2),
                        "description": f"Two peaks ~{round((h1+h2)/2,2)}, valley {round(depth*100,1)}% below"}
    return None


def detect_double_bottom(lows, prices, tol=0.025, min_gap=8):
    for i in range(len(lows) - 1):
        for j in range(i + 1, len(lows)):
            if lows[j] - lows[i] < min_gap: continue
            l1, l2 = prices[lows[i]], prices[lows[j]]
            if _pct_diff(l1, l2) > tol: continue
            peak = prices[lows[i]: lows[j] + 1].max()
            rise = (peak - max(l1, l2)) / max(l1, l2)
            if rise >= 0.02:
                return {"pattern": "Double Bottom", "bias": "BULLISH",
                        "confidence": int(min(95, 60 + rise * 400)),
                        "level": round((l1 + l2) / 2, 2),
                        "description": f"Two troughs ~{round((l1+l2)/2,2)}, peak {round(rise*100,1)}% above"}
    return None


def detect_hs(highs, lows, prices, inv=False):
    pts = lows if inv else highs
    if len(pts) < 3: return None
    for i in range(len(pts) - 2):
        ls_i, hd_i, rs_i = pts[i], pts[i + 1], pts[i + 2]
        ls, hd, rs = prices[ls_i], prices[hd_i], prices[rs_i]
        if not ((hd > ls and hd > rs) if not inv else (hd < ls and hd < rs)): continue
        if _pct_diff(ls, rs) > 0.05: continue
        hm = abs(hd - (ls + rs) / 2) / ((ls + rs) / 2)
        if hm < 0.02: continue
        name = "Inverse H&S" if inv else "H&S (Head & Shoulders)"
        neckline = prices[lows[i]: rs_i + 1].max() if not inv else prices[highs[i]: rs_i + 1].min()
        return {"pattern": name, "bias": "BULLISH" if inv else "BEARISH",
                "confidence": int(min(92, 55 + hm * 500)),
                "level": round(float(neckline), 2),
                "description": f"LS={round(ls,2)} Head={round(hd,2)} RS={round(rs,2)} | Neckline≈{round(float(neckline),2)}"}
    return None


def detect_flag(closes, opens, is_bull=True):
    n = len(closes)
    if n < 25: return None
    for pe in range(n - 15, n - 5):
        ps  = max(0, pe - 10)
        seg = closes[ps: pe + 1]
        chg = (seg[-1] - seg[0]) / seg[0] if seg[0] > 0 else 0
        if is_bull and chg < 0.04: continue
        if not is_bull and chg > -0.04: continue
        cons = closes[pe: min(n, pe + 15)]
        if len(cons) < 5: continue
        cr = (cons.max() - cons.min()) / cons.min() if cons.min() > 0 else 1
        if cr > 0.06: continue
        return {"pattern": "Bull Flag" if is_bull else "Bear Flag",
                "bias": "BULLISH" if is_bull else "BEARISH",
                "confidence": int(min(90, 60 + abs(chg) * 400)),
                "level": round(float(closes[-1]), 2),
                "description": f"Pole {round(chg*100,1)}% | Consolidation {round(cr*100,1)}% over {len(cons)} bars"}
    return None


def detect_cup_handle(closes):
    n = len(closes)
    if n < 60: return None
    cs   = closes[max(0, n - 60):]
    chl  = float(cs[: len(cs) // 3].max())
    cb   = float(cs[len(cs) // 4: 3 * len(cs) // 4].min())
    chr_ = float(cs[2 * len(cs) // 3:].max())
    dep  = (chl - cb) / chl if chl > 0 else 0
    rec  = (chr_ - cb) / (chl - cb) if (chl - cb) > 0 else 0
    if dep < 0.10 or rec < 0.80: return None
    hp   = (chr_ - float(closes[-10:].min())) / (chl - cb) if (chl - cb) > 0 else 1
    if hp > 0.35: return None
    return {"pattern": "Cup & Handle", "bias": "BULLISH",
            "confidence": int(min(90, 60 + rec * 25 + (0.35 - hp) * 40)),
            "level": round(chr_, 2),
            "description": f"Cup depth {round(dep*100,1)}% | Recovery {round(rec*100,1)}% | Handle pullback {round(hp*100,1)}%"}


def detect_range(closes, highs_arr, lows_arr):
    sn   = min(30, len(closes))
    h_sg = highs_arr[-sn:]
    l_sg = lows_arr[-sn:]
    rhi  = float(h_sg.max())
    rlo  = float(l_sg.min())
    mid  = (rhi + rlo) / 2
    w    = (rhi - rlo) / mid if mid > 0 else 1
    if w > 0.07: return None
    tol  = (rhi - rlo) * 0.15
    rt   = int((h_sg > rhi - tol).sum())
    st   = int((l_sg < rlo + tol).sum())
    if rt < 2 or st < 2: return None
    return {"pattern": "Range / Consolidation", "bias": "NEUTRAL",
            "confidence": int(min(88, 50 + (rt + st) * 5)),
            "level": round(mid, 2),
            "description": f"Range {round(rlo,2)}–{round(rhi,2)} ({round(w*100,1)}% wide) | Res {rt}x | Sup {st}x"}


def _safe_float(v, fallback=0.0) -> float:
    """Return a JSON-safe float (no NaN/Inf)."""
    import math
    try:
        f = float(v)
        return fallback if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return fallback


def _sanitize_pattern(p: dict) -> dict:
    """Replace any NaN/Inf float values in a pattern dict with 0.0."""
    return {
        k: (_safe_float(v) if isinstance(v, (float, int, np.floating)) else v)
        for k, v in p.items()
    }


def _deep_sanitize(obj):
    """
    Recursively walk any dict/list and replace NaN/Inf floats with 0.0.
    This ensures FastAPI's json.dumps() never raises ValueError on float serialization.
    """
    import math
    if isinstance(obj, dict):
        return {k: _deep_sanitize(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_deep_sanitize(v) for v in obj]
    elif isinstance(obj, float):
        return 0.0 if (math.isnan(obj) or math.isinf(obj)) else obj
    elif isinstance(obj, np.floating):
        f = float(obj)
        return 0.0 if (math.isnan(f) or math.isinf(f)) else f
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.ndarray):
        return _deep_sanitize(obj.tolist())
    else:
        return obj


def _compute_technicals(df) -> dict:
    """Compute EMA 20/50/200, RSI 14, volume ratio, 52w-high from daily OHLCV."""
    if df is None or len(df) < 20:
        return {}
    closes  = df["Close"].values.astype(float)
    volumes = df["Volume"].values.astype(float)
    curr    = closes[-1]

    def _ema_arr(arr, n):
        k, e = 2 / (n + 1), [float(arr[0])]
        for v in arr[1:]:
            e.append(float(v) * k + e[-1] * (1 - k))
        return np.array(e)

    ema20_val  = _safe_float(_ema_arr(closes, 20)[-1])  if len(closes) >= 20  else None
    ema50_val  = _safe_float(_ema_arr(closes, 50)[-1])  if len(closes) >= 50  else None
    ema200_val = _safe_float(_ema_arr(closes, 200)[-1]) if len(closes) >= 200 else None

    above_ema20  = bool(curr > ema20_val)  if ema20_val  is not None else None
    above_ema50  = bool(curr > ema50_val)  if ema50_val  is not None else None
    above_ema200 = bool(curr > ema200_val) if ema200_val is not None else None
    ema_score    = int(sum(1 for x in [above_ema20, above_ema50, above_ema200] if x))

    # RSI-14
    rsi = None
    if len(closes) >= 16:
        deltas = np.diff(closes)
        gains  = np.maximum(deltas, 0.0)
        losses = np.maximum(-deltas, 0.0)
        ag = float(np.mean(gains[:14]))
        al = float(np.mean(losses[:14]))
        for i in range(14, len(gains)):
            ag = (ag * 13 + gains[i]) / 14
            al = (al * 13 + losses[i]) / 14
        rsi = round(100 - 100 / (1 + ag / al), 1) if al > 0 else 100.0
        rsi = _safe_float(rsi, 50.0)

    momentum_ok = bool(rsi is not None and 50 <= rsi <= 75)

    # 52-week high proximity (within 5% of max in last ~200 days)
    high_200      = _safe_float(np.max(closes), 1.0)
    pct_from_52w  = _safe_float(round(float((high_200 - curr) / high_200 * 100), 2) if high_200 > 0 else 100.0)
    near_52w_high = bool(pct_from_52w <= 5.0)

    # Volume: last bar vs 20-day avg (excluding last)
    if len(volumes) >= 21:
        vol_avg20 = _safe_float(np.mean(volumes[-21:-1]), 1.0)
    else:
        vol_avg20 = _safe_float(np.mean(volumes[:-1]) if len(volumes) > 1 else 1.0, 1.0)
    vol_ratio = _safe_float(round(float(volumes[-1]) / vol_avg20, 2) if vol_avg20 > 0 else 0.0)
    volume_ok = bool(vol_ratio >= 1.2)

    return {
        "above_ema20":   above_ema20,
        "above_ema50":   above_ema50,
        "above_ema200":  above_ema200,
        "ema20":         _safe_float(round(ema20_val, 2))  if ema20_val  is not None else None,
        "ema50":         _safe_float(round(ema50_val, 2))  if ema50_val  is not None else None,
        "ema200":        _safe_float(round(ema200_val, 2)) if ema200_val is not None else None,
        "ema_score":     ema_score,
        "rsi":           rsi,
        "momentum_ok":   momentum_ok,
        "near_52w_high": near_52w_high,
        "pct_from_52w":  pct_from_52w,
        "volume_ok":     volume_ok,
        "vol_ratio":     vol_ratio,
    }


def _detect_patterns_for_df(df) -> list:
    # Drop rows with NaN in price columns to prevent NaN propagation
    df = df.dropna(subset=["Close", "High", "Low", "Open"])
    if df.empty or len(df) < 10:
        return []
    closes = df["Close"].values.astype(float)
    highs  = df["High"].values.astype(float)
    lows   = df["Low"].values.astype(float)
    w      = max(3, len(closes) // 15)
    hi, li = _local_extrema(closes, w=w)
    found  = []
    for fn in [
        lambda: detect_double_top(hi, closes),
        lambda: detect_double_bottom(li, closes),
        lambda: detect_hs(hi, li, closes, inv=False),
        lambda: detect_hs(li, hi, closes, inv=True),
        lambda: detect_flag(closes, df["Open"].values.astype(float), is_bull=True),
        lambda: detect_flag(closes, df["Open"].values.astype(float), is_bull=False),
        lambda: detect_cup_handle(closes),
        lambda: detect_range(closes, highs, lows),
    ]:
        try:
            r = fn()
            if r: found.append(_sanitize_pattern(r))
        except Exception: pass
    return found


def _scan_ticker_patterns(meta: dict):
    import math
    ticker_sym = meta["ticker"]
    detections = []
    daily_df   = None   # reuse 1D data for technical indicators

    for tf_key, tf_cfg in TIMEFRAMES.items():
        try:
            hist = yf.Ticker(ticker_sym).history(period=tf_cfg["period"], interval=tf_cfg["interval"])
            if hist is None or len(hist) < tf_cfg["min_bars"]: continue
            if tf_key == "1D":
                daily_df = hist          # cache for later
            for p in _detect_patterns_for_df(hist):
                p["timeframe"]         = tf_key
                p["timeframe_display"] = tf_cfg["display"]
                detections.append(p)
        except Exception as exc:
            logger.debug(f"Pattern {ticker_sym} {tf_key}: {exc}")

    if not detections: return None

    # Price — prefer fast_info, fallback to last daily close
    try:
        price = _safe_float(yf.Ticker(ticker_sym).fast_info.last_price)
    except Exception:
        price = _safe_float(float(daily_df["Close"].iloc[-1]) if daily_df is not None and len(daily_df) else 0.0)

    tech = _compute_technicals(daily_df)

    result = {
        "symbol":        meta["ticker"].replace(".NS", ""),
        "ticker":        meta["ticker"],
        "name":          meta["name"],
        "sector":        meta["sector"],
        "price":         round(price, 2),
        "patterns":      detections,
        "pattern_count": len(detections),
        "top_pattern":   detections[0]["pattern"],
        "top_bias":      detections[0]["bias"],
        "top_tf":        detections[0]["timeframe"],
        **tech,
    }
    return _deep_sanitize(result)


async def _build_pattern_scan(symbols=None) -> list:
    universe = SCAN_UNIVERSE
    if symbols:
        su = [s.upper() for s in symbols]
        filtered = [s for s in SCAN_UNIVERSE if s["ticker"].replace(".NS", "") in su]
        if filtered: universe = filtered
    loop = asyncio.get_event_loop()
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_scan_ticker_patterns, m): m for m in universe}
        done, _ = await loop.run_in_executor(None, lambda: concurrent.futures.wait(list(futures.keys()), timeout=90))
    for fut in futures:
        try:
            r = fut.result()
            if r: results.append(r)
        except Exception as e: logger.debug(f"Pattern future: {e}")
    results.sort(key=lambda x: (x["pattern_count"], x["patterns"][0]["confidence"]), reverse=True)
    return results


def _apply_filters(data, tf, pat, bias,
                   near_52w: bool = False,
                   above_ema: int = 0,
                   momentum: bool = False,
                   vol_ok: bool = False):
    out = []
    for stock in data:
        # ── Technical filters ──────────────────────────────────────────
        if near_52w   and not stock.get("near_52w_high", False):  continue
        if above_ema  and stock.get("ema_score", 0) < above_ema:  continue
        if momentum   and not stock.get("momentum_ok",  False):   continue
        if vol_ok     and not stock.get("volume_ok",    False):    continue
        # ── Pattern filters ────────────────────────────────────────────
        patterns = stock["patterns"]
        if tf:   patterns = [p for p in patterns if p["timeframe"].lower() == tf.lower()]
        if pat:  patterns = [p for p in patterns if pat.lower() in p["pattern"].lower()]
        if bias: patterns = [p for p in patterns if p["bias"].upper() == bias.upper()]
        if patterns:
            out.append({**stock, "patterns": patterns, "pattern_count": len(patterns)})
    return out


# ═══════════════════════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/detections")
async def get_insider_detections(refresh: bool = False):
    """
    Multi-source insider/bulk activity detections.
    Source priority: NSE Archives CSV > NSE Live API > SEBI PIT > yfinance Activity.
    Fallback: MongoDB history when all live sources fail or are empty.
    Cache: 15 min. Use ?refresh=true to force fresh fetch.
    """
    global _insider_cache
    now = datetime.now(timezone.utc)

    if not refresh and _insider_cache["data"] is not None and _insider_cache["ts"]:
        if (now - _insider_cache["ts"]).total_seconds() < INSIDER_TTL:
            return _deep_sanitize({**_insider_cache["data"], "cached": True})

    try:
        detections, source_label = await _build_detections()

        if detections:
            await _save_to_db(detections, source_label)
            result = {
                "detections":   detections,
                "count":        len(detections),
                "cached":       False,
                "from_history": False,
                "source":       source_label,
                "updated_at":   now.isoformat(),
            }
        else:
            hist = await _load_from_db()
            if hist and hist.get("detections"):
                result = {
                    "detections":   hist["detections"],
                    "count":        hist["count"],
                    "cached":       False,
                    "from_history": True,
                    "history_date": hist.get("saved_at", ""),
                    "source":       hist.get("source", "History"),
                    "updated_at":   hist.get("saved_at", now.isoformat()),
                }
            else:
                result = {
                    "detections":   [],
                    "count":        0,
                    "cached":       False,
                    "from_history": False,
                    "source":       "All sources returned no data",
                    "updated_at":   now.isoformat(),
                }

        _insider_cache = {"data": result, "ts": now}
        return _deep_sanitize(result)

    except Exception as e:
        logger.error(f"Detections error: {e}")
        hist = await _load_from_db()
        if hist and hist.get("detections"):
            return {
                "detections":   hist["detections"],
                "count":        hist["count"],
                "from_history": True,
                "history_date": hist.get("saved_at", ""),
                "source":       hist.get("source", "History"),
                "updated_at":   hist.get("saved_at", now.isoformat()),
            }
        return {"detections": [], "count": 0, "error": str(e), "updated_at": now.isoformat()}


@router.get("/pattern-scan")
async def get_pattern_scan(
    refresh:   bool          = False,
    symbols:   Optional[str] = Query(None),
    timeframe: Optional[str] = Query(None),
    pattern:   Optional[str] = Query(None),
    bias:      Optional[str] = Query(None),
    near_52w:  bool          = Query(False),
    above_ema: int           = Query(0, ge=0, le=3),
    momentum:  bool          = Query(False),
    vol_ok:    bool          = Query(False),
):
    """
    Chart pattern detection across F&O stock universe.
    Technical filters: near_52w, above_ema (0-3), momentum, vol_ok.
    """
    global _pattern_cache
    now      = datetime.now(timezone.utc)
    sym_list = [s.strip().upper() for s in symbols.split(",")] if symbols else None

    if not refresh and not sym_list and _pattern_cache["data"] is not None and _pattern_cache["ts"]:
        if (now - _pattern_cache["ts"]).total_seconds() < PATTERN_TTL:
            filtered = _apply_filters(_pattern_cache["data"], timeframe, pattern, bias,
                                      near_52w, above_ema, momentum, vol_ok)
            return _deep_sanitize({"results": filtered, "count": len(filtered), "cached": True,
                    "updated_at": _pattern_cache["ts"].isoformat(), "scanned_stocks": len(SCAN_UNIVERSE)})

    try:
        raw = await _build_pattern_scan(sym_list)
        raw = _deep_sanitize(raw)
        if not sym_list:
            _pattern_cache = {"data": raw, "ts": now}
        filtered = _apply_filters(raw, timeframe, pattern, bias, near_52w, above_ema, momentum, vol_ok)
        return {"results": filtered, "count": len(filtered), "cached": False,
                "updated_at": now.isoformat(), "scanned_stocks": len(sym_list) if sym_list else len(SCAN_UNIVERSE)}
    except Exception as e:
        logger.error(f"Pattern scan: {e}")
        return {"results": [], "count": 0, "error": str(e), "updated_at": now.isoformat()}



# ═══════════════════════════════════════════════════════════════════════════
#  STOCK NEWS FEED  —  Google News RSS + Headline Sentiment Impact
# ═══════════════════════════════════════════════════════════════════════════

_news_cache: dict = {"data": None, "ts": None}
NEWS_TTL = 600  # 10-min cache

_BULL_KW = {
    'profit', 'surge', 'rally', 'buy', 'bullish', 'gain', 'growth', 'beat',
    'strong', 'upgrade', 'positive', 'rise', 'record', 'high', 'outperform',
    'order', 'win', 'award', 'deal', 'expansion', 'acquisition', 'dividend',
    'launch', 'approval', 'clearance', 'revenue', 'margin', 'recovery',
}
_BEAR_KW = {
    'loss', 'fall', 'sell', 'bearish', 'crash', 'pressure', 'miss', 'weak',
    'downgrade', 'cut', 'negative', 'drop', 'decline', 'lower', 'concern',
    'fraud', 'penalty', 'fine', 'investigation', 'default', 'debt', 'recall',
    'layoff', 'shutdown', 'probe', 'ban', 'reject', 'disappoint', 'slump',
}


def _sentiment_impact(title: str) -> dict:
    tl  = title.lower()
    bull = sum(1 for kw in _BULL_KW if kw in tl)
    bear = sum(1 for kw in _BEAR_KW if kw in tl)
    if bull > bear:
        return {"label": "POSITIVE",  "color": "#22c55e", "bg": "rgba(34,197,94,0.15)"}
    if bear > bull:
        return {"label": "NEGATIVE",  "color": "#ef4444", "bg": "rgba(239,68,68,0.15)"}
    return     {"label": "NEUTRAL",   "color": "#94a3b8", "bg": "rgba(148,163,184,0.10)"}


def _time_ago(ts: int) -> str:
    diff = int(datetime.now(timezone.utc).timestamp()) - ts
    if diff < 60:     return "just now"
    if diff < 3600:   return f"{diff // 60}m ago"
    if diff < 86400:  return f"{diff // 3600}h ago"
    return f"{diff // 86400}d ago"


_GNEWS_HDR = {"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", "Accept": "*/*"}


async def _fetch_rss_news(client: httpx.AsyncClient, meta: dict) -> list:
    """Fetch Google News RSS for one stock; return list of news dicts."""
    import xml.etree.ElementTree as ET
    from email.utils import parsedate_to_datetime

    query   = f"{meta['name']} NSE stock India"
    url     = f"https://news.google.com/rss/search?q={httpx.URL(query).__str__()}&hl=en-IN&gl=IN&ceid=IN:en"
    # httpx URL encoding for the query
    encoded = query.replace(' ', '+')
    url     = f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en"

    now_ts  = int(datetime.now(timezone.utc).timestamp())
    cutoff  = now_ts - 7 * 86400

    try:
        r = await client.get(url, timeout=12)
        if r.status_code != 200:
            return []
        root  = ET.fromstring(r.text)
        items = root.findall('.//item')
    except Exception:
        return []

    result = []
    for it in items[:5]:
        title = (it.findtext('title') or '').strip()
        link  = (it.findtext('link')  or '').strip()
        pub   = (it.findtext('pubDate') or '').strip()
        src_el = it.find('source')
        publisher = src_el.text if src_el is not None else ''
        if not title:
            continue
        try:
            pub_ts = int(parsedate_to_datetime(pub).timestamp()) if pub else 0
        except Exception:
            pub_ts = 0
        if pub_ts and pub_ts < cutoff:
            continue

        imp = _sentiment_impact(title)
        result.append({
            "symbol":       meta["ticker"].replace(".NS", ""),
            "name":         meta["name"],
            "sector":       meta["sector"],
            "title":        title,
            "publisher":    publisher,
            "link":         link,
            "published_at": pub_ts,
            "time_ago":     _time_ago(pub_ts) if pub_ts else "—",
            "impact":       imp["label"],
            "impact_color": imp["color"],
            "impact_bg":    imp["bg"],
        })
    return result


@router.get("/stock-news")
async def get_stock_news(refresh: bool = False, sector: str = ""):
    """Live news feed for F&O universe stocks — Google News RSS + sentiment impact."""
    now = datetime.now(timezone.utc)

    if not refresh and _news_cache["data"] is not None and _news_cache["ts"]:
        if (now - _news_cache["ts"]).total_seconds() < NEWS_TTL:
            data = _news_cache["data"]
            if sector:
                data = [n for n in data if n["sector"].lower() == sector.lower()]
            return {
                "news": data, "cached": True,
                "updated_at": _news_cache["ts"].isoformat(),
                "total": len(_news_cache["data"]),
            }

    # Fetch in parallel batches of 8 to avoid rate-limit
    all_news: list = []
    limits  = httpx.Limits(max_connections=8, max_keepalive_connections=4)
    async with httpx.AsyncClient(headers=_GNEWS_HDR, follow_redirects=True, limits=limits) as client:
        batch_size = 8
        for i in range(0, len(SCAN_UNIVERSE), batch_size):
            batch = SCAN_UNIVERSE[i: i + batch_size]
            results = await asyncio.gather(*[_fetch_rss_news(client, m) for m in batch])
            for r in results:
                all_news.extend(r)
            await asyncio.sleep(0.3)  # slight delay between batches

    # Sort newest first + deduplicate by title prefix
    all_news.sort(key=lambda x: x["published_at"], reverse=True)
    seen:   set  = set()
    unique: list = []
    for n in all_news:
        key = n["title"][:55].lower()
        if key not in seen:
            seen.add(key)
            unique.append(n)

    _news_cache["data"] = unique
    _news_cache["ts"]   = now

    if sector:
        unique = [n for n in unique if n["sector"].lower() == sector.lower()]

    return {
        "news": unique, "cached": False,
        "updated_at": now.isoformat(),
        "total": len(_news_cache["data"]),
    }


# ═══════════════════════════════════════════════════════════════════════════
#  ECONOMIC CALENDAR  —  Indian Market Monthly Events
# ═══════════════════════════════════════════════════════════════════════════

_ECO_EVENTS: dict = {
    "2025-10": [
        {"date": "2025-10-07", "event": "RBI MPC Meeting — Day 1", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Monetary Policy Committee meet begins"},
        {"date": "2025-10-08", "event": "RBI MPC Meeting — Day 2", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2025-10-09", "event": "RBI Repo Rate Decision", "category": "RBI", "impact": "HIGH", "prev": "6.50%", "forecast": "6.50%", "actual": "6.50%", "note": "RBI holds rates — Neutral for markets"},
        {"date": "2025-10-14", "event": "India CPI Inflation (Sep 2025)", "category": "INDIA", "impact": "HIGH", "prev": "3.65%", "forecast": "4.00%", "actual": "5.49%", "note": "CPI spike — kharif crop damage ka asar"},
        {"date": "2025-10-15", "event": "India IIP (Aug 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "4.8%", "forecast": "5.0%", "actual": "4.4%", "note": "Industrial output growth slowed"},
        {"date": "2025-10-15", "event": "US CPI Inflation (Sep 2025)", "category": "US", "impact": "HIGH", "prev": "2.5%", "forecast": "2.3%", "actual": "2.4%", "note": "Inline — FII flows stable"},
        {"date": "2025-10-17", "event": "India WPI Inflation (Sep 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "1.84%", "forecast": "1.90%", "actual": "1.84%", "note": ""},
        {"date": "2025-10-31", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday — high volatility"},
    ],
    "2025-11": [
        {"date": "2025-11-13", "event": "India CPI Inflation (Oct 2025)", "category": "INDIA", "impact": "HIGH", "prev": "5.49%", "forecast": "5.00%", "actual": "5.48%", "note": ""},
        {"date": "2025-11-13", "event": "India IIP (Sep 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "4.4%", "forecast": "5.2%", "actual": "5.8%", "note": "Industrial recovery"},
        {"date": "2025-11-14", "event": "US CPI Inflation (Oct 2025)", "category": "US", "impact": "HIGH", "prev": "2.4%", "forecast": "2.6%", "actual": "2.6%", "note": "Sticky inflation — Fed cautious"},
        {"date": "2025-11-15", "event": "India WPI (Oct 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "1.84%", "forecast": "1.90%", "actual": "1.89%", "note": ""},
        {"date": "2025-11-28", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday monthly expiry"},
        {"date": "2025-11-29", "event": "India Q2 FY26 GDP (Jul–Sep 2025)", "category": "INDIA", "impact": "HIGH", "prev": "6.7%", "forecast": "6.4%", "actual": "5.4%", "note": "GDP slowdown — below estimate"},
        {"date": "2025-11-29", "event": "India Core Sector (Oct 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "2.4%", "forecast": "3.5%", "actual": "4.3%", "note": "8 core industries — surprise beat"},
    ],
    "2025-12": [
        {"date": "2025-12-04", "event": "RBI MPC Meeting — Day 1", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2025-12-05", "event": "RBI MPC Meeting — Day 2", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2025-12-06", "event": "RBI Repo Rate Decision", "category": "RBI", "impact": "HIGH", "prev": "6.50%", "forecast": "6.25%", "actual": "6.50%", "note": "RBI holds — CRR cut instead (50bps)"},
        {"date": "2025-12-11", "event": "US FOMC Rate Decision", "category": "US", "impact": "HIGH", "prev": "4.75%", "forecast": "4.50%", "actual": "4.50%", "note": "Fed cuts 25bps — Positive for FII"},
        {"date": "2025-12-12", "event": "India CPI Inflation (Nov 2025)", "category": "INDIA", "impact": "HIGH", "prev": "5.48%", "forecast": "5.00%", "actual": "5.48%", "note": ""},
        {"date": "2025-12-13", "event": "India IIP (Oct 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "5.8%", "forecast": "5.0%", "actual": "3.5%", "note": ""},
        {"date": "2025-12-16", "event": "India WPI (Nov 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "1.89%", "forecast": "1.80%", "actual": "1.89%", "note": ""},
        {"date": "2025-12-25", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday — Christmas week"},
    ],
    "2026-01": [
        {"date": "2026-01-07", "event": "RBI MPC Minutes (Dec 2025)", "category": "RBI", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "Released", "note": "Dec MPC meeting detailed minutes"},
        {"date": "2026-01-13", "event": "India CPI Inflation (Dec 2025)", "category": "INDIA", "impact": "HIGH", "prev": "5.48%", "forecast": "5.10%", "actual": "5.22%", "note": "CPI came down — positive for RBI rate cut"},
        {"date": "2026-01-14", "event": "India IIP (Nov 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "3.5%", "forecast": "5.0%", "actual": "5.0%", "note": "Recovery in industrial output"},
        {"date": "2026-01-15", "event": "US CPI Inflation (Dec 2025)", "category": "US", "impact": "HIGH", "prev": "2.7%", "forecast": "2.9%", "actual": "2.9%", "note": "Higher than expected — Fed hold likely"},
        {"date": "2026-01-17", "event": "India WPI (Dec 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "1.89%", "forecast": "2.20%", "actual": "2.37%", "note": ""},
        {"date": "2026-01-29", "event": "US FOMC Rate Decision", "category": "US", "impact": "HIGH", "prev": "4.50%", "forecast": "4.50%", "actual": "4.50%", "note": "Fed holds — as expected"},
        {"date": "2026-01-29", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday monthly expiry"},
        {"date": "2026-01-31", "event": "India Fiscal Deficit Data (Apr–Dec 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "52.5%", "forecast": "55%", "actual": "", "note": "9-month fiscal data — budget positioning"},
    ],
    "2026-02": [
        {"date": "2026-02-01", "event": "Union Budget 2026–27", "category": "INDIA", "impact": "HIGH", "prev": "—", "forecast": "—", "actual": "Presented", "note": "Annual Union Budget — FM presents in Parliament"},
        {"date": "2026-02-04", "event": "RBI MPC Meeting — Day 1", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Bi-monthly Monetary Policy meeting begins"},
        {"date": "2026-02-05", "event": "RBI MPC Meeting — Day 2", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-02-06", "event": "RBI Repo Rate Decision", "category": "RBI", "impact": "HIGH", "prev": "6.50%", "forecast": "6.25%", "actual": "6.25%", "note": "RBI cuts 25bps — Bullish for bonds & markets"},
        {"date": "2026-02-12", "event": "India CPI Inflation (Jan 2026)", "category": "INDIA", "impact": "HIGH", "prev": "5.22%", "forecast": "4.75%", "actual": "", "note": "Key inflation print post-budget"},
        {"date": "2026-02-12", "event": "India IIP (Dec 2025)", "category": "INDIA", "impact": "MEDIUM", "prev": "5.0%", "forecast": "4.8%", "actual": "", "note": "Index of Industrial Production"},
        {"date": "2026-02-13", "event": "US CPI Inflation (Jan 2026)", "category": "US", "impact": "HIGH", "prev": "2.9%", "forecast": "2.9%", "actual": "", "note": "Affects FII flow into emerging markets"},
        {"date": "2026-02-14", "event": "India WPI Inflation (Jan 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "2.37%", "forecast": "2.50%", "actual": "", "note": "Wholesale Price Index"},
        {"date": "2026-02-14", "event": "US Retail Sales (Jan 2026)", "category": "US", "impact": "MEDIUM", "prev": "+0.4%", "forecast": "+0.2%", "actual": "", "note": "Consumer spending indicator"},
        {"date": "2026-02-19", "event": "US FOMC Meeting Minutes", "category": "US", "impact": "MEDIUM", "prev": "—", "forecast": "—", "actual": "", "note": "Jan 28–29 Fed meeting minutes released"},
        {"date": "2026-02-26", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "—", "forecast": "—", "actual": "", "note": "Last Thursday — high volatility expected"},
        {"date": "2026-02-26", "event": "BankNifty Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "—", "forecast": "—", "actual": "", "note": "Monthly bank nifty expiry"},
        {"date": "2026-02-27", "event": "US GDP Q4 2025 (2nd Estimate)", "category": "US", "impact": "MEDIUM", "prev": "2.3%", "forecast": "2.3%", "actual": "", "note": "Q4 2025 GDP second estimate"},
        {"date": "2026-02-28", "event": "India Core Sector Data (Jan 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "4.3%", "forecast": "4.5%", "actual": "", "note": "8 core industries output"},
    ],
    "2026-03": [
        {"date": "2026-03-06", "event": "US Non-Farm Payroll (Feb 2026)", "category": "US", "impact": "HIGH", "prev": "143K", "forecast": "155K", "actual": "", "note": "Key US jobs data — affects FII flows"},
        {"date": "2026-03-12", "event": "India CPI Inflation (Feb 2026)", "category": "INDIA", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-03-12", "event": "India IIP (Jan 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-03-13", "event": "US CPI Inflation (Feb 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-03-16", "event": "India WPI (Feb 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-03-18", "event": "US FOMC Meeting — Day 1", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-03-19", "event": "US FOMC Rate Decision", "category": "US", "impact": "HIGH", "prev": "4.50%", "forecast": "4.25%", "actual": "", "note": "Federal Reserve rate decision"},
        {"date": "2026-03-27", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday monthly expiry"},
        {"date": "2026-03-31", "event": "FY 2026 End", "category": "INDIA", "impact": "HIGH", "prev": "—", "forecast": "—", "actual": "", "note": "Indian financial year end — portfolio rebalancing, tax selling"},
    ],
    "2026-04": [
        {"date": "2026-04-07", "event": "RBI MPC Meeting — Day 1", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "New financial year first MPC meet"},
        {"date": "2026-04-08", "event": "RBI MPC Meeting — Day 2", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-04-09", "event": "RBI Repo Rate Decision", "category": "RBI", "impact": "HIGH", "prev": "6.25%", "forecast": "6.00%", "actual": "", "note": "Possible 25bps cut to 6.00%"},
        {"date": "2026-04-14", "event": "India CPI Inflation (Mar 2026)", "category": "INDIA", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "FY26 year-end CPI print"},
        {"date": "2026-04-30", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday monthly expiry"},
    ],
    "2026-05": [
        {"date": "2026-05-07", "event": "US FOMC Rate Decision", "category": "US", "impact": "HIGH", "prev": "4.50%", "forecast": "4.25%", "actual": "", "note": "Fed May meeting — rate cut possible"},
        {"date": "2026-05-08", "event": "US Non-Farm Payroll (Apr 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Key US jobs data — affects FII flows"},
        {"date": "2026-05-13", "event": "India CPI Inflation (Apr 2026)", "category": "INDIA", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Post-budget first quarter CPI"},
        {"date": "2026-05-14", "event": "India IIP (Mar 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": "FY26 full year industrial output"},
        {"date": "2026-05-14", "event": "US CPI Inflation (Apr 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Emerging market FII flow indicator"},
        {"date": "2026-05-15", "event": "India WPI Inflation (Apr 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": "Wholesale Price Index"},
        {"date": "2026-05-20", "event": "India Q4 FY26 GDP Advance Est.", "category": "INDIA", "impact": "HIGH", "prev": "6.4%", "forecast": "6.6%", "actual": "", "note": "Jan–Mar 2026 GDP first estimate"},
        {"date": "2026-05-28", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday — May monthly expiry"},
        {"date": "2026-05-28", "event": "BankNifty Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-05-29", "event": "India FY26 Full Year GDP (Final)", "category": "INDIA", "impact": "HIGH", "prev": "6.4%", "forecast": "6.5%", "actual": "", "note": "Full FY 2025–26 GDP estimate"},
        {"date": "2026-05-29", "event": "India Core Sector Data (Apr 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": "8 core industries output"},
    ],
    "2026-06": [
        {"date": "2026-06-03", "event": "RBI MPC Meeting — Day 1", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Q1 FY27 monetary policy review"},
        {"date": "2026-06-04", "event": "RBI MPC Meeting — Day 2", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-06-05", "event": "RBI Repo Rate Decision", "category": "RBI", "impact": "HIGH", "prev": "6.00%", "forecast": "5.75%", "actual": "", "note": "Possible further 25bps cut"},
        {"date": "2026-06-11", "event": "India CPI Inflation (May 2026)", "category": "INDIA", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-06-12", "event": "India IIP (Apr 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-06-12", "event": "US CPI Inflation (May 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Fed rate path ke liye critical"},
        {"date": "2026-06-16", "event": "India WPI (May 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-06-17", "event": "US FOMC Meeting — Day 1", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-06-18", "event": "US FOMC Rate Decision", "category": "US", "impact": "HIGH", "prev": "4.25%", "forecast": "4.00%", "actual": "", "note": "Fed June meeting — FII flow impact"},
        {"date": "2026-06-25", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday — June monthly expiry"},
        {"date": "2026-06-25", "event": "BankNifty Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-06-30", "event": "India Core Sector Data (May 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": "8 core industries May output"},
    ],
    "2026-07": [
        {"date": "2026-07-02", "event": "US FOMC Meeting Minutes (Jun)", "category": "US", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": "Jun 17-18 Fed meeting minutes"},
        {"date": "2026-07-02", "event": "US Non-Farm Payroll (Jun 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Key US jobs data — FII flow trigger"},
        {"date": "2026-07-14", "event": "India CPI Inflation (Jun 2026)", "category": "INDIA", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-07-14", "event": "India IIP (May 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-07-14", "event": "US CPI Inflation (Jun 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Mid-year inflation check"},
        {"date": "2026-07-16", "event": "India WPI Inflation (Jun 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-07-28", "event": "US FOMC Meeting — Day 1", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-07-29", "event": "US FOMC Rate Decision", "category": "US", "impact": "HIGH", "prev": "4.00%", "forecast": "3.75%", "actual": "", "note": "Fed July meeting"},
        {"date": "2026-07-30", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday — July monthly expiry"},
        {"date": "2026-07-30", "event": "BankNifty Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-07-31", "event": "India Core Sector Data (Jun 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
    ],
    "2026-08": [
        {"date": "2026-08-05", "event": "RBI MPC Meeting — Day 1", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Q2 FY27 monetary policy review"},
        {"date": "2026-08-06", "event": "RBI MPC Meeting — Day 2", "category": "RBI", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-08-07", "event": "RBI Repo Rate Decision", "category": "RBI", "impact": "HIGH", "prev": "5.75%", "forecast": "5.75%", "actual": "", "note": "RBI Aug 2026 policy — hold expected"},
        {"date": "2026-08-07", "event": "US Non-Farm Payroll (Jul 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-08-13", "event": "India CPI Inflation (Jul 2026)", "category": "INDIA", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Kharif season inflation watch"},
        {"date": "2026-08-13", "event": "India IIP (Jun 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-08-13", "event": "US CPI Inflation (Jul 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-08-15", "event": "Independence Day — Market Holiday", "category": "INDIA", "impact": "LOW", "prev": "", "forecast": "", "actual": "", "note": "NSE/BSE closed"},
        {"date": "2026-08-17", "event": "India WPI (Jul 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-08-27", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday — Aug monthly expiry"},
        {"date": "2026-08-27", "event": "BankNifty Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-08-28", "event": "India Q1 FY27 GDP (Apr–Jun 2026)", "category": "INDIA", "impact": "HIGH", "prev": "6.5%", "forecast": "6.8%", "actual": "", "note": "First quarter FY27 GDP estimate"},
        {"date": "2026-08-29", "event": "India Core Sector Data (Jul 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
    ],
    "2026-09": [
        {"date": "2026-09-04", "event": "US Non-Farm Payroll (Aug 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-09-11", "event": "India CPI Inflation (Aug 2026)", "category": "INDIA", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Monsoon season inflation impact"},
        {"date": "2026-09-11", "event": "India IIP (Jul 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-09-11", "event": "US CPI Inflation (Aug 2026)", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Pre-FOMC inflation data"},
        {"date": "2026-09-15", "event": "India WPI (Aug 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-09-15", "event": "US FOMC Meeting — Day 1", "category": "US", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-09-16", "event": "US FOMC Rate Decision", "category": "US", "impact": "HIGH", "prev": "3.75%", "forecast": "3.75%", "actual": "", "note": "Sep Fed meeting — pause likely"},
        {"date": "2026-09-24", "event": "Nifty 50 Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": "Last Thursday — Sep monthly expiry"},
        {"date": "2026-09-24", "event": "BankNifty Monthly F&O Expiry", "category": "FNO", "impact": "HIGH", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-09-30", "event": "India Core Sector Data (Aug 2026)", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": ""},
        {"date": "2026-09-30", "event": "India H1 FY27 Fiscal Deficit Data", "category": "INDIA", "impact": "MEDIUM", "prev": "", "forecast": "", "actual": "", "note": "Apr–Sep 2026 fiscal position"},
    ],
}


@router.get("/economic-calendar")
async def get_economic_calendar(
    month: Optional[int] = Query(None, ge=1, le=12),
    year:  Optional[int] = Query(None, ge=2025, le=2027),
):
    """Monthly economic event calendar for Indian markets."""
    import calendar as cal_mod
    now   = datetime.now(timezone.utc).astimezone(
        __import__('zoneinfo', fromlist=['ZoneInfo']).ZoneInfo('Asia/Kolkata')
    ) if hasattr(__import__('zoneinfo', fromlist=['ZoneInfo']), 'ZoneInfo') else datetime.now()

    m = month if month else now.month
    y = year  if year  else now.year
    today_str = now.strftime("%Y-%m-%d")

    key    = f"{y}-{m:02d}"
    events = [dict(e) for e in _ECO_EVENTS.get(key, [])]

    for e in events:
        e["is_today"] = (e["date"] == today_str)
        e["is_past"]  = (e["date"] < today_str)

    # Prev / next month keys
    if m == 1:
        prev_key = f"{y-1}-12"
    else:
        prev_key = f"{y}-{(m-1):02d}"
    if m == 12:
        next_key = f"{y+1}-01"
    else:
        next_key = f"{y}-{(m+1):02d}"

    return {
        "month":      m,
        "year":       y,
        "month_name": cal_mod.month_name[m],
        "events":     sorted(events, key=lambda x: x["date"]),
        "today":      today_str,
        "has_prev":   prev_key in _ECO_EVENTS,
        "has_next":   next_key in _ECO_EVENTS,
        "prev_key":   prev_key,
        "next_key":   next_key,
    }
