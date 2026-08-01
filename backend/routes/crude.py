import time
import logging
from datetime import datetime, timezone
from fastapi import APIRouter

from database import db

router = APIRouter(prefix="/api/crude")

_eia_cache: dict = {"data": None, "ts": 0.0}
_EIA_TTL = 3600  # 1 hour — EIA data is weekly anyway


@router.get("/eia-status")
async def get_crude_eia_status():
    """
    Fetch latest US EIA crude inventory data from FRED (free, no API key).
    Falls back to last-known values on error.
    """
    import aiohttp as _aio

    now_ts = time.time()
    if _eia_cache["data"] and (now_ts - _eia_cache["ts"]) < _EIA_TTL:
        return _eia_cache["data"]

    try:
        url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=WCRSTUS1"
        async with _aio.ClientSession() as sess:
            async with sess.get(url, timeout=_aio.ClientTimeout(total=12)) as r:
                text = await r.text()

        rows = [ln for ln in text.strip().splitlines() if ln and not ln.startswith("DATE")]
        if len(rows) < 2:
            raise ValueError("Insufficient rows")

        def _parse(line: str):
            d, v = line.strip().split(",")
            return d.strip(), round(float(v) / 1_000, 3)

        prev_date, prev_mb = _parse(rows[-2])
        curr_date, curr_mb = _parse(rows[-1])
        change_mb = round(curr_mb - prev_mb, 3)

        result = {
            "available":    True,
            "us_curr_mb":   curr_mb,
            "us_prev_mb":   prev_mb,
            "us_change_mb": change_mb,
            "us_date":      curr_date,
            "us_kind":      "DRAW" if change_mb < 0 else "BUILD",
            "india_mb":     104.0,
            "india_status": "Near 1-yr High",
            "india_date":   "end of June",
        }
        _eia_cache["data"] = result
        _eia_cache["ts"]   = now_ts
        return result

    except Exception as exc:
        fallback = {
            "available":    False,
            "error":        str(exc),
            "us_curr_mb":   430.7,
            "us_prev_mb":   437.9,
            "us_change_mb": -7.167,
            "us_date":      "2025-07-25",
            "us_kind":      "DRAW",
            "india_mb":     104.0,
            "india_status": "Near 1-yr High",
            "india_date":   "end of June",
        }
        _eia_cache["data"] = fallback
        _eia_cache["ts"]   = now_ts
        return fallback


@router.post("/save-score")
async def save_crude_score(payload: dict):
    """Frontend posts today's computed score for sparkline history."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.crude_score_history.update_one(
        {"date": today},
        {"$set": {
            "date":    today,
            "score":   int(payload.get("score", 0)),
            "brent":   float(payload.get("brent", 0)),
            "verdict": payload.get("verdict", ""),
            "ts":      datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"status": "ok", "date": today}


@router.get("/score-history")
async def get_crude_score_history():
    """Return last 7 days of crude supply macro scores for sparkline."""
    cursor = db.crude_score_history.find({}, {"_id": 0}).sort("date", -1).limit(7)
    docs = await cursor.to_list(7)
    docs.reverse()  # oldest first for sparkline left→right
    return {"history": docs}
