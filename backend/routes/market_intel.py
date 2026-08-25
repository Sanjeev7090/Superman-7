import logging
import asyncio
from fastapi import APIRouter

from database import db

router = APIRouter(prefix="/api/market-intel")


@router.get("")
async def get_market_intel():
    """
    Market Intelligence — Live macro data + Nifty bias decision matrix.
    Fetches: Brent Crude, India VIX, Nifty, GIFT Nifty, Regulatory sentiment.
    Returns: Bias, Expected Move, Probability, Action + full decision matrix.
    Cache: 15 minutes.
    """
    try:
        from agents.market_intel import fetch_market_intel
        data = await fetch_market_intel()
        return data
    except Exception as e:
        logging.error(f"Market intel fetch error: {e}")
        return {
            "brent": 0, "vix": 0, "nifty": 0, "gift_nifty": 0,
            "gift_premium": 0, "regulatory": "Neutral",
            "bias": "Neutral", "bias_color": "#94a3b8",
            "move_label": "Data unavailable", "probability": "—",
            "action": "—", "error": str(e),
        }


@router.get("/fii")
async def get_fii_intel():
    """
    FII/DII live data from NSE website.
    - Before 6 PM IST: shows previous trading day's data
    - After 6 PM IST: tries to fetch today's data, falls back to previous day
    - Persists to MongoDB so data survives server restarts
    """
    try:
        from agents.market_intel import fetch_fii_intel
        return await fetch_fii_intel(db=db)
    except Exception as e:
        logging.error(f"FII intel fetch error: {e}")
        return {"source": "error", "message": str(e)}


@router.get("/gap-prediction")
async def get_gap_prediction():
    """
    Gap Up / Gap Down Prediction System.
    Combines GIFT Nifty vs Prev Close, FII direction, Close Strength,
    Pre-open Imbalance → matches 16-row decision matrix → Final Prediction.
    Cached 3 minutes.
    """
    try:
        from agents.market_intel import fetch_gap_prediction
        return await fetch_gap_prediction()
    except Exception as e:
        logging.error(f"Gap prediction error: {e}")
        return {"error": str(e)}


@router.post("/news-refresh")
async def refresh_market_news():
    """
    Force-refresh market news cache — bypasses 15-min TTL.
    Fetches latest Nifty 50 relevant news from all sources.
    """
    try:
        from agents.market_intel import _fetch_nifty_market_news_sync
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, lambda: _fetch_nifty_market_news_sync(force=True))
        return data
    except Exception as e:
        logging.error(f"Market news refresh error: {e}")
        return {"available": False, "error": str(e)}
