# Gann Angles Trader — PRD

## Original Problem Statement
Full-stack algorithmic trading app (React + FastAPI + MongoDB) for Indian markets (Nifty 50 focus).
Gann Angles analysis, AI Vibe Chat, Market Intelligence Panel, Crypto + Metals screener.

## User Preferences
- **Language:** Hinglish/Hindi responses
- **NO screenshots during dev**
- **NO testing agent** (except hard crashes)
- **India-first logic** — all signals mapped to Nifty 50 impact

---

## Architecture

```
/app/
├── backend/
│   ├── server.py           (FastAPI main — all routes, 15k+ lines)
│   ├── agents/
│   │   └── market_intel.py (Geo risk, news sentiment, macro scores)
│   └── .env
├── frontend/
│   ├── src/components/
│   │   ├── TradingDashboard.jsx
│   │   ├── MarketIntelPanel.jsx  (~2700 lines — refactor needed)
│   │   ├── CryptoList.jsx        (Crypto + Metals sidebar)
│   │   └── ChartPanel.jsx
└── memory/
    └── PRD.md
```

## Key DB Collections
- `crude_score_history`: `{ date: string, score: float }`

## Key API Endpoints
- `POST /api/vibe/chat`
- `GET /api/market-intel/news-refresh`
- `GET /api/crude/eia-status`
- `POST /api/crude/save-score`
- `GET /api/metals/prices` — Gold/Silver live prices (yfinance GC=F, SI=F)
- `GET /api/stock/bars/{ticker}` — OHLCV via yfinance (supports GC=F, SI=F, etc.)

## 3rd Party Integrations
- OpenAI / Emergent LLM Key
- yfinance (no key needed)
- FRED API (EIA data, static fallback in container)

---

## What's Been Implemented

### Session (Previous)
- GeoRisk Card — keyword-based Low/Medium/High geopolitical score
- Crude Supply Card — USDINR + Brent → Final Trading Decision
- EIA Banner — Wednesday IST countdown auto-detect
- Score Sparkline — last 5 days macro trend (SVG, MongoDB backed)
- Metals in Crypto List — Gold (GC=F) + Silver (SI=F) added to sidebar

### Session (Current — Feb 2026)
- **Bug Fix:** XAUUSD/XAGUSD chart load failure
  - Root cause: MetalRow passed `type:'STOCK'` with no `coin_id` → `fetchCryptoData(undefined)` → `/api/crypto/chart/undefined` → 404
  - Fix: Changed to `type:'METAL'` + `yf_ticker` field; `handleCryptoSelect` and `handleTimeframeChange` now route METAL type through `fetchStockData(yf_ticker)` using `/api/stock/bars/GC=F` (yfinance)
  - Testing: Verified via testing agent (iteration_39.json — 100% pass)

---

## Refactoring Backlog (P2)
- `MarketIntelPanel.jsx` (~2700 lines) → split GeoRiskCard, CrudeSupplyCard, EIABanner into separate files
- `server.py` (~15k lines) → split routes into `/routes` directory

## Known Constraints
- FRED API times out in preview container (handled with static fallback — works in production)
