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

### Session (Feb 2026 — Part 4 — GEX Workflow)
- **GEX (Gamma Exposure) Workflow Process:** (COMPLETED)
  - Backend: `GET /api/gex/nifty` — Live NSE option chain se Net GEX calculate karta hai (Call OI × Gamma × Lot × Spot²). Gamma Flip, Call Wall, Put Wall bhi return karta hai. VIX-based fallback agar NSE blocked ho. 5-min cache. 121+ strikes analysed.
  - Frontend: `GexWorkflowSection.jsx` — Decision Matrix ke bilkul neche. 4 Data Cards (Net GEX, Gamma Flip, Call Wall, Put Wall), Regime Badge (Strong Positive/Negative), Expected Move Reference Table (6 regimes), 4-Step Workflow guide (Subah Check Karo → Bias Set Karo → Levels Identify Karo → Intraday Use Karo), Quick Reference (Positive vs Negative GEX logic). Live NSE / VIX Est badge.
- **LIVE OI Badge Fix (P1):** `SensexRejOptionsSection.jsx` — `pick.is_real_oi` ki jagah `flowData.is_real_oi` use kiya. CE OI, PE OI, PCR-OI bhi `flowData` se aata hai ab (isse LIVE OI badge sahi show hoga jab BSE OI available ho).
- **Insider Tracker Feature:** (COMPLETED)
  - Backend: `GET /api/insider/detections` — NSE SEBI Reg 7(2) insider buy disclosures, last 7 days, priority score (8+=HIGH, 5-7=WATCHLIST, <5=MONITOR), 30-min cache
  - Backend: `GET /api/insider/pattern-scan` — Chart pattern detection across 36 F&O stocks across 3 timeframes (15m, 1H, 1D). Patterns: Double Top/Bottom, H&S, Inverse H&S, Bull/Bear Flag, Cup & Handle, Range. Filters: timeframe, bias, pattern name. 15-min cache.
  - Frontend: `InsiderTracker.jsx` — Slide-in modal panel with two tabs: "Insider Buys" + "Pattern Scanner"
  - Frontend: Eye icon added to header (amber color, next to Market Intel newspaper icon)
  - Bug Fix: `SensexGammaBlastSection.jsx` useEffect missing dependency warning fixed (P1 pending issue resolved)
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

### Session (Feb 2026 — Part 5 — OI Indicator + Eco Calendar + Stock News)
- **Economic Calendar:** Hardcoded events till Sep 2026 in `InsiderTracker.jsx` (new tab)
- **Live Stock News with Sentiment:** Google News RSS via `feedparser` (replaced yfinance due to 403 rate limits)
- **Technical Filters for Pattern Scanner:** 52W High, EMA 20/50/200, Momentum, Volume filters
- **OI Indicator in ChartPanel:** OIPanel component built inside ChartPanel.jsx
  - Backend: `GET /api/oi-indicator/nifty` — PCR, Max Pain, Call Wall, Put Wall, spot, signal. 3-min cache, 8s timeout
  - Frontend: OI button in toolbar, floating panel with all OI data
  - Chart Price Lines: Call Wall (red dashed), Put Wall (green dashed), Max Pain (amber dotted)
- **OI Indicator Bug Fixes (Feb 2026):**
  - Fixed screen freeze: removed `stockData` from OI useEffect deps + backend 5s/8s timeouts + stale cache fallback
  - Fixed toggle ON/OFF: proper isCurrentlyOn check in button onClick
  - Fixed z-index conflict: `relative z-50` on OI button (backdrop z-40 was intercepting second click)
  - Testing: iteration_45.json — 100% (9 backend + 6 frontend all pass)

- **12-Factor Option Buying Checklist (Feb 2026):**
  - Added 12-factor checklist to BOTH `/api/rej/option-flow` (NIFTY) and `/api/rej/sensex-option-flow` (SENSEX)
  - Factors: Future+OI+Vol, IV, Writing/Unwind, Delta Range (0.35-0.60), Vanna, Net GEX, Gap+FII Bias, PCR, OI Walls, Chart PA, Sector Breadth, Pre-open Imbalance
  - Score now [X/12], STRONG ≥8, PARTIAL ≥6, WEAK <6
  - Weight badges per criterion: MUST (amber), High (purple), Medium (grey)
  - Frontend: CriteriaRow updated with weight badge + smaller text (7.5px labels, 6.5px detail)
  - Testing: iteration_46.json — 100% (28 backend + all frontend verified)

- **Market Closed Feedback (Feb 2026):**
  - ClosingPredictionSection header: "MARKET CLOSED" red badge + verdict badge (✅ CORRECT / ❌ WRONG / 〰️ PARTIAL) after 3:30 PM IST
  - Post-Market Feedback section: 2-column Prediction card vs Actual Result card side by side
  - Shows: predicted signal/move/action vs actual pts, %, Close/Open, H/L/Range strip
  - Backend: `market_feedback` object in `/api/market-intel/closing-prediction` response when `is_market_closed=true`
  - Testing: iteration_47.json — 100% (25 backend + all frontend verified)



---

### Session (Feb 2026 — Part 9 — Insider Module v3 Full System)
- **Module Switch** — `module_on` flag: OFF if DOOM ≤-4 / expiry / promoter sell tape > 3× buys
- **Beneficial-Owner Entity Graph** — name-based merge (HUF/pvt/trust/holdings stripped), merged_buyer display
- **Pledge + SAST** — stub (NSE SAST data not freely accessible, shows N/A with note)
- **Dark vs Lit (Block/Bulk vs PIT)** — block_sell > 3× pit_buy → REJECT; block+PIT confirm → +2
- **Own-History Z-Score** — MongoDB `insider_buy_history` accumulates over time; z<1 = -2, z≥3 = +2
- **Outcome Model** — `insider_alerts_v3` collection; 20-day WIN/LOSS/FLAT labeling; adaptive threshold (30-alert sample)
- **New Endpoints**: `GET /api/insider/module_status`, `GET /api/insider/label_outcomes`
- **Frontend v3 Output Card**: merged_buyer, z, block_tape, pledge, module ON/OFF, index_score, size
- **Module Status Banner**: top of insider tab, green/red dot, MODULE ON/OFF, DOOM score, threshold

- **God Score 0-20** engine replacing old 0-10 scoring
  - 11 factors: Promoter market buy (+4), Group cluster (+2), Director/KMP (+2), value, mode, delivery/vol spike, 20DMA, bulk+block, pledge
  - Fake Signal Killers: inter-se, gift, ESOP, allotment, preferential, INSTITUTIONAL bulk
  - YF Activity fallback: capped at 12 (no L1 data)
- **Cluster Engine**: 3+ buys in 7 days, ≥₹3Cr, ≥70% market mode
- **Time Window**: T0-T2 (Fresh), T3-T8 (Absorption), T9+ (Stale, score -3)
- **Status tiers**: GOD LEVEL / RARE / POSITIONAL / SETUP / WATCH / MONITOR / REJECT
- **Alert Card UI**: Score ring 0-20 with 12 threshold, Confirm Stack, Position Rules table, L1 filing data
- **Legend updated**: 18-20 Rare, 15-17 Positional, 12-14 Setup, 8-11 Watch

- **DOOM Card** (COMPLETED)
  - Backend: `GET /api/doom/score` — 6-factor scoring (Brent, VIX, GIFT%, Breadth, FII, GEX). Score -12 to +12. Expiry/Clash overrides. 9:50 gate. MongoDB `doom_scores` storage.
  - Frontend: `DoomCard.jsx` — expandable card at bottom of Market Intel panel (full details)
  - Frontend: Mini DOOM card added inside Live Data Strip (top grid), right next to Geo Risk card (row 4: GEO RISK | DOOM). Shows: score, bias color, progress bar, action pill.
  - Mini card fetched via MarketIntelPanel's main load (doom data state added).
- **VWAP Flip Mini chart** (COMPLETED)
  - Frontend: `VWAPFlipMini.jsx` — mini strip below main chart in ChartPanel.jsx. Above/below VWAP state, SVG plot, VWAP flip diagram.
- **MiniVWAPOIChart** (COMPLETED)
  - Frontend: `MiniVWAPOIChart.jsx` — above Key Indicators in TradingDashboard. VWAP graph + OI strike bars. 5s refresh.
- **Sector Breadth Expansion** (COMPLETED)
  - Backend: 17 sector indices for Nifty impact. `GET /api/sectors/breadth` returns up/down counts + bias.
  - Frontend: `SectorBreadthCard.jsx` — Decision Matrix, expandable 17-sector list, current row auto-highlight.
- **GEX Workflow Expandability** (COMPLETED)
  - Frontend: `GexWorkflowSection.jsx` — default collapsed, clickable header, regime badge on header.
- **Post-Market Feedback** (COMPLETED)
  - Frontend: `PostMarketFeedback.jsx` — separated from ClosingPredictionSection, default collapsed.

### Session (Feb 2026 — Part 6 — Expiry Workflow)
- **Expiry Day Workflow Section** (COMPLETED)
  - Frontend: `ExpiryWorkflowSection.jsx` — Market Intel panel mein Decision Matrix ke upar embedded
  - LIVE mode (days <= 1): Full 6-step workflow, live data from GEX, OI, FII, market-intel
  - ARCHIVE mode (days > 1): Last cached expiry data shown (localStorage cache)
  - Morning Context: Gap, FII, VIX, GEX, Call/Put Wall, Max Pain, PCR, Gamma Flip (all live)
  - Expiry Mode auto-calc: PIN/FADE / WAIT+9:50 / FOLLOW
  - 9:50 Direction Checklist: 4 interactive checkboxes
  - GEX Points Target, Time Table, Trade Rules, Quick Card, 5Aug Lesson, Gamma Blast (Sensex)

---
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
