# Gann Angles Trader — PRD

## Original Problem Statement
Full-stack algorithmic trading app (React + FastAPI + MongoDB) for Indian markets (Nifty 50 focus).
Gann Angles analysis, AI Vibe Chat, Market Intelligence Panel, Crypto + Metals screener.
Paper trading for equities + Nifty/Sensex Options with 2-second Auto SL/Target monitor.
Live Trading toggle with multi-broker API integration (Groww, Zerodha, Upstox, AngelOne, Dhan, Fyers).

## User Preferences
- **Language:** Hinglish/Hindi responses
- **NO screenshots** — kabhi mat lena
- **NO testing agent** — kabhi mat chalana
- **India-first logic** — all signals mapped to Nifty 50 impact

---

## Architecture

```
/app/
├── backend/
│   ├── server.py           (FastAPI main — all routes, 15k+ lines)
│   ├── database.py         (Shared MongoDB connection)
│   ├── groww_service.py    (Groww API wrapper — live data + orders)
│   ├── routes/
│   │   ├── crude.py        (EIA status, save-score, score-history)
│   │   ├── metals.py       (Gold/Silver live prices)
│   │   └── market_intel.py (Bias, FII, news-refresh)
│   ├── agents/
│   │   └── market_intel.py (Geo risk, news sentiment, macro scores)
│   └── .env
├── frontend/
│   ├── src/components/
│   │   ├── TradingDashboard.jsx
│   │   ├── MultiChartLayout.jsx  (passes externalMarkers to slot-1 ChartPanel)
│   │   ├── ChartPanel.jsx        (accepts strategyMarkers prop, merges with EMA markers)
│   │   ├── VibeResearchPanel.jsx (Strategy Builder feature added)
│   │   ├── MarketIntelPanel.jsx  (~1107 lines — refactored)
│   │   ├── market-intel/         (8 extracted components)
│   │   ├── PaperTradingPanel.jsx (Paper + Live toggle, broker integration)
│   │   ├── OptionsPaperTradeModal.jsx (Nifty/Sensex options paper trading)
│   │   ├── BrokerSettingsModal.jsx (Multi-broker connection UI)
│   │   ├── SettingsDrawer.jsx   (GROWW tab removed)
│   │   └── CryptoList.jsx
└── memory/
    └── PRD.md
```

## Key DB Collections
- `crude_score_history`: `{ date: string, score: float }`

## Key API Endpoints
- `POST /api/vibe/chat`             — Streaming Vibe Research chat (SSE)
- `POST /api/vibe/strategy-build`   — LLM generates Python strategy code
- `POST /api/vibe/strategy-execute` — Sandboxed exec of strategy code → markers
- `GET /api/market-intel/news-refresh`
- `GET /api/crude/eia-status`
- `POST /api/crude/save-score`
- `GET /api/metals/prices`          — Gold/Silver live prices (yfinance GC=F, SI=F)
- `GET /api/stock/bars/{ticker}`    — OHLCV via yfinance (supports GC=F, SI=F, etc.)

## 3rd Party Integrations
- OpenAI / Emergent LLM Key (Anthropic claude-sonnet-4-6)
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

### Session (Feb 2026 — Part 1)
- **Bug Fix:** XAUUSD/XAGUSD chart load failure (type: METAL + yf_ticker fix)
- **Silver Intraday Chart:** 15m/1H intraday view added for Silver
- **MarketIntelPanel Refactor:** 2729-line file split into 8 new components in `/components/market-intel/`
- **Backend Refactor:** server.py partially split into route modules (crude, metals, market_intel)
- **Timeframe Bug Fix:** METAL type timeframe switching fixed in MultiChartLayout

### Session (Feb 2026 — Part 2)
- **Strategy Builder Feature:** (COMPLETED)
  - Backend: `POST /api/vibe/strategy-build` — LLM generates Python strategy code from user prompt
  - Backend: `POST /api/vibe/strategy-execute` — Sandboxed Python exec with restricted builtins, blocked dangerous keywords, returns lightweight-charts markers
  - Frontend: Dedicated "Strategy" button (code icon) in Vibe Research input area
  - Frontend: Strategy Builder modal with quick prompt chips + textarea + Generate button
  - Frontend: Code block rendered in chat with "Load on Chart" button
  - Frontend: ChartPanel accepts `strategyMarkers` prop, merges with EMA markers
  - Frontend: State flows: TradingDashboard → MultiChartLayout → ChartPanel
  - Security: Blocked imports, os/sys/subprocess, eval/exec calls, 10s timeout
  - Testing: Backend 100% (6/6), Frontend 90% (minor toggle LOW priority)

---

## Refactoring Backlog (P2)
- `server.py` (~15k lines) → PARTIALLY DONE — `_vibe_router` still embedded; could extract to `/routes/vibe.py`

## Extracted Route Modules (Backend)
- `backend/database.py` — shared MongoDB connection
- `backend/routes/crude.py` — `/api/crude/*`
- `backend/routes/metals.py` — `/api/metals/*`
- `backend/routes/market_intel.py` — `/api/market-intel/*`

## Known Constraints
- FRED API times out in preview container (handled with static fallback)
- NIFTYIFTB.NS ticker shows yfinance 404 warnings (not critical)

## Strategy Builder Technical Notes
- LLM System Prompt ensures: pure Python, no imports, uses `bars` list, populates `signals` list
- Sandboxed exec: only safe builtins (abs, min, max, len, range, sum, float, int, etc.)
- Keyword blocklist: `import `, `__import__`, `exec(`, `eval(`, `open(`, `os.`, `sys.`, etc.
- Bars sanitized before execution: only open/high/low/close/volume/timestamp (float/int typed)
- Markers sorted by time before returning (lightweight-charts requirement)
