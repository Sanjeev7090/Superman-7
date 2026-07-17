# Gann Trader — PRD & Architecture

## Original Problem Statement
Clone trading app → Add dark/light mode, mobile responsiveness, MiroFish LangGraph multi-agent AI, Multi-TF Scanner, Weighted AI Signals, Phase 4 Robo-Trader UI, SENSEX options, PCR Gauge. Build an institutional-grade algorithmic trading dashboard for NSE/BSE.

## User Personas
- Retail traders using NSE/BSE (primary)
- Algo traders who want ML-based signals
- Portfolio managers wanting multi-asset optimization

## Core Stack
- **Backend**: FastAPI + MongoDB + Python RL/ML
- **Frontend**: React + Craco + lightweight-charts + Recharts + Tailwind
- **Build**: Craco (webpack aliases)
- **3rd Party**: Emergent LLM Key (GPT-4o), yFinance, NSE scraping (curl_cffi)

---

## What's Been Implemented

### Phase 1 — Foundation
- Dark/light theme toggle, mobile responsive layout, NSE stock search + live quotes
- Interactive chart (lightweight-charts), Technical indicators (RSI, MACD, BB, etc.)

### Phase 2 — AI Signals
- MiroFish LangGraph multi-agent orchestration (5 LLM nodes: Tech→Vol→Sentiment→Risk→Decision)
- Multi-Timeframe Scanner, Weighted AI Signals aggregator
- SMC Canvas Overlay (FVG, Liquidity, Order Blocks, BOS/CHoCH, Supply/Demand)

### Phase 3 — DreamerV3 Robo-Trader
- DreamerV3 world model RL agent, Kronos Forecast integration
- Adaptive Learning Engine, Paper trading mode

### Phase 4 — QUANT Module
- RL agent (PER buffer, risk-adjusted reward), Portfolio Optimizer
- Advanced Risk Panel, Sentiment Panel, Observability Panel

### Phase 5 — Linter Fixes + Background Tab Persistence
- Fixed blocking Ruff errors, RLAgentPanel always mounted (CSS), dynamic agent weights

### Phase 6 — Multi-Stock Parallel Trading
- Multi-stock watchlist management, parallel position sizing
- Settings modal with watchlist add/remove + max_parallel_trades buttons

### Phase 7 — Auto-Discover + Vertical Tabs UI
- Auto-Discover Momentum Scanner (NSE F&O universe, 50 stocks)
- Vertical Right Sidebar Tabs (SCAN/STRAT/PAPER/RL/ROBO/AI ASM/PICK/PE-CE/QNT)

### Phase 12 — New Intelligence Features + Free Crypto Stack (Jul 2026)
- **Adaptive Time Window**: trading_loop.py — confidence multipliers by IST time (9:15-10:00 = 1.5x, closing = 1.2x, lunch = 0.8x)
- **News RSS Replacement**: yfinance news replaced with Google News + ET RSS feeds (free, no API key); `news_filter.py`
- **NSE Event Calendar**: F&O expiry, budget, RBI meeting auto-detection; event_score_multiplier applied to trading confidence
- **Position Sizing Intelligence**: Kelly Criterion + ATR volatility adaptive sizing; `position_sizer.py` + `/api/position-sizer/calculate`
- **PropSafe Mode**: Drawdown protection — daily loss limit (2%) + max DD (5%) kill switch; `prop_safe.py` + `/api/propsafe/status|configure|reset`
- **Crypto Free Stack**: CoinGecko → **CoinPaprika** (prices/detail/search/market-overview) + **Kraken REST OHLC** (charts); no API key, 100x better rate limits
- New components: `PropSafePanel.jsx`, `PositionSizerPanel.jsx` (shown in ROBO tab)
- New endpoints: `/api/time-window`, `/api/events/upcoming`


- F&O Put-Call Parity Scanner: `/api/options/parity-scanner`, "Open in Chart" button
- DeltaDash Analysis Scoreboard: `/api/deltadash/scoreboard` (44+ tickers × 6 TFs)
- ChartPanel.jsx massively upgraded: Supply/Demand Zones, Wyckoff Accumulation/Distribution,
  Manipulation (Stop Hunts), Refined Entry with SL/TGT dashed lines + R:R ratios

### Phase 10 — Danger Mode + Brain Auto-Activation (Jun 2026)
- **Danger Mode (risk_tolerance = "danger")**:
  - No direct equity trades — F&O universe only
  - `danger_scanner.py`: 34 F&O tickers scored by momentum (5d return, vol spike, ATR, RSI)
    + PCR parity boost (STRONGLY_BULLISH=+22, BULLISH=+14, BEARISH=-10, STRONGLY_BEARISH=-18)
  - `GET /api/robo/danger-scan` endpoint returns top picks with pcr_signal, final_score, sector
  - Trading loop auto-overrides watchlist with danger scan picks each cycle
  - DreamerV3 gets +25% confidence boost in danger mode
  - Frontend: 2×2 risk grid, red Danger card with skull SVG icon, "F&O ONLY" badge,
    "Danger Mode Active" warning notice, "DANGER · F&O" header badge, F&O Picks panel
- **Hybrid Brain Auto-Activation** (P10 already documented above)
- **Fear Reset Fix + Brain Audit Alignment** (Jun 2026):
  - `MildSurvivalEngine.manual_reset()` — full zero-clear (fear=0.0, consecutive_fail=0, last_pnl=0)
    vs `reset_daily()` — overnight −0.35 decay only
  - `POST /api/hybrid-brain/reset-daily` now calls `manual_reset()` (manual=True) → fear clears instantly
  - Also clears `_decision_cache` so next `think_and_decide()` runs fresh
  - Brain alignment reason in trade audit: trading loop writes `brain_reason` to `strategy_meta`:
    - "Brain+Dreamer agreed → BUY | +10 boost"
    - "Brain CIRCUIT-BREAKER: fear=85% → forced HOLD"
    - "Brain disagrees (SELL vs Dreamer BUY) → −15 conf penalty"
    - "Brain neutral (HOLD) | Dreamer BUY 65%"
  - `TradeExplainability.jsx`: brain_reason badge inline in audit row (color-coded: green=agreed,
    red=override, amber=disagree, purple=neutral); full reason shown in DreamerV3 card "HSB Alignment" section
  - `POST /api/robo/start` fires `_warmup_brain()` as asyncio background task
  - Warmup: loads survival state from MongoDB → `think_and_decide()` → updates `_state` immediately
  - `_state` gets: `brain_active`, `brain_action`, `brain_confidence`, `brain_fear`, `brain_regime`
  - `GET /api/robo/status` now returns all brain fields
  - `POST /api/robo/stop` resets `brain_active=False`
  - Trading loop: each cycle calls `hybrid_brain.decide_sync()`, applies brain-dreamer alignment boost
    (+10 conf if agree) or fear circuit breaker (forced HOLD if fear > 0.70) or disagreement penalty (-15)
  - Frontend: "BRAIN ON" pulsing badge in header when active, "Brain Live Strip" below start button
    showing action/confidence/fear/regime, mini ⚡ button to re-fire manually
- **Hybrid Super Brain v2 (`hybrid_super_brain.py` fully rewritten as central brain)**:
  - `MildSurvivalEngine` — MongoDB-persisted fear/boost scalar, grace period, overnight decay
  - `PsychologicalHarvester` — FOMO, Apathy, Regime, Narrative Credibility from real market data
  - `MetaReasoner` — MiroFish LangGraph 5-node pipeline (ainvoke, NOT SSE), agreement scoring
  - `HybridSuperBrain` — Central orchestrator: DreamerV3 → StrategyCollaborator (6 agents) → 
    MiroFish LangGraph → MetaReasoner → RPM heat gate → MongoDB audit
  - `decide_sync()` + `update_daily_pnl_sync()` for DreamerV3 tight coupling
- **Hybrid Brain Visualization in RoboAdvisorDashboard.jsx**:
  - Fear Level circular gauge, Consecutive Misses, Daily Target, Last PnL cards
  - "Fire Brain" button → live decision with confidence bar, component breakdown
  - Brain State tab + Decision Log tab (scrollable audit)
- **Unified Audit Log**: Brain decisions + Paper trades merged in `/api/robo/audit`
- **Live P&L on Open Positions**: `GET /api/robo/positions` enriches each position with 
  `current_price`, `unrealized_pnl`, `pnl_pct`, `price_change` (15s cache via yfinance)
- **Watchlist Clear Fix**: `removeFromWatchlist` immediately POSTs to backend (no save-required)

### Phase 11 — Universe Scan → Robot 3.0 One-Click Load + AUTO TRADE (Jun 2026)
- **Feature**: Clicking any stock in Universe Scan results instantly loads it into Robot 3.0
- **Flow (Load)**: Click card → save ticker to DB → fire brain decision → refresh Robot 3.0 → "IN ROBOT" badge
- **Flow (AUTO TRADE button)**: Click ▶ AUTO TRADE → save ticker → stop existing auto mode if running → start auto mode with new ticker → fire brain decision → toast
- **Handlers**: `handleScanStockSelect(stock)`, `handleScanAutoTrade(e, stock)`
- **Visual**: Glow border, "IN ROBOT" pulse badge, spinner during load, play-button icon on AUTO TRADE

### Phase 12 — NSE WebSocket Real Tick Data (Jun 2026)
- **Backend**: `agents/tick_streamer.py` — `NSETickStreamer` singleton
  - Single background task polls `yfinance fast_info` every 2 seconds
  - Broadcasts to all connected WebSocket clients
  - Thread pool (8 workers) for concurrent symbol fetches
  - Auto-reconnect, dead connection cleanup
- **Endpoint**: `GET /api/ws/nse-tick` WebSocket
  - Subscribe: `{"action":"subscribe","tickers":["RELIANCE.NS","^NSEI","BANKNIFTY"]}`
  - Receives: `{"type":"tick","ticker":"RELIANCE.NS","data":{price,change_pct,direction,...}}`
- **Frontend hooks**: `hooks/useLiveTick.js`
  - `useLiveTick(symbol)` — single symbol, auto-reconnect
  - `useMultiTick(symbols[])` — multiple symbols, single WS connection
- **Components**: `components/LiveTickBadge.jsx`
  - `LiveTickBadge` — price + change% with flash animation
  - `LiveTickInline` — compact inline badge with direction arrow
- **Integrated into**:
  - `IndicesTickerBar.jsx` — NIFTY/SENSEX/BANKNIFTY now update every 2s (was 15s), live green dot
  - `RoboAdvisorDashboard.jsx` — Robot 3.0 header shows live price of active ticker

### Phase 13 — Monte Carlo Strategy Validator (Jun 2026)
- **Backend**: `agents/monte_carlo.py` — `realistic_monte_carlo_simulation()` + `build_return_histogram()`
  - 2000-path simulation, slippage 0.08%, commission 0.05%, 8% skip rate
  - Returns: summary stats, 50 equity curves, return histogram
- **API**: `POST /api/robo/monte-carlo` — fetches closed trades from `robo_orders`, runs simulation
  - Falls back to synthetic demo data when no trades available
- **Frontend**: `components/robo/MonteCarloPanel.jsx`
  - 8-stat grid: Win Prob, Mean/Median Return, P5/P95, Avg/Worst DD, Risk of Ruin
  - Fan chart: 50 sample equity curves (recharts LineChart)
  - Return distribution histogram (recharts BarChart)
  - "RUN SIM" button with loading state
- **Integrated**: Below WatchlistParallelPanel in RoboAdvisorDashboard

---

## Prioritized Backlog

### P1
- [ ] Deep regression pass on Multi-Chart "Object is disposed" crash fix (1/2/4 layout switching, rapid slot clicking) — was fixed via try/catch guards in ChartPanel.jsx, testing agent skipped deep verification twice due to timeout
- [ ] Run/test Auto-mode to evaluate live brain decisions natively in paper mode
- [ ] Visualize StrategyCollaborator 6-agent signals in ROBO tab (radar/table view)

### P2
- [ ] PCR Alert system — popup on NIFTY/SENSEX PCR threshold cross
- [ ] Auto-mode brain override — when brain fires BUY and dreamer says HOLD, show override log

### P3
- [ ] TradingDashboard.jsx refactoring (~1013 lines → extract `<DashboardModals />` for Visualize/3D/Parity/DeltaDash/HybridBrain/OptionChain/SectorSheet mounting block)
- [ ] ChartPanel.jsx refactoring (~1700 lines → split into SmcOverlay.jsx, ChartCore.jsx)
- [ ] server.py modularization (11k+ lines — route by feature into /agents/)
- [ ] Kronos fix — TATAMOTORS.NS delisted ticker cleanup in default scan universe
- [ ] "Sync Timeframe" toggle across multi-chart layout

---

## Key API Endpoints
- `POST /api/hybrid-brain/decide` — Full 5-layer decision (psych+strategy+miro+dreamer+survival)
- `GET  /api/hybrid-brain/state`  — Fear level, consecutive fails, daily target, PnL
- `GET  /api/hybrid-brain/audit`  — Decision history (MongoDB)
- `GET  /api/robo/positions`      — Open positions with live current_price + unrealized_pnl
- `GET  /api/robo/audit`          — Paper trades + brain decisions merged
- `GET  /api/deltadash/scoreboard`— 44+ tickers × 6 TF multi-indicator scorer
- `POST /api/options/put-call-parity` — PCR calculator
- `GET  /api/options/parity-scanner`  — Auto-scanner for all indices

## DB Collections
- `hybrid_brain_state` — survival fear/fail counters (MongoDB-persisted)
- `hybrid_brain_audit` — all brain decisions log
- `robo_user_preferences` — user trading settings singleton
- `robo_orders` — all paper/live trade orders

---

## Update (July 2026) — Market Intelligence Day Mode Fix + Speed Optimization

**Issues fixed:**
1. **Day/Light mode broken**: `MarketIntelPanel.jsx` was hardcoded dark — rewrote to be fully theme-aware using `useTheme()` hook. Created `C` token object (panelBg, cardBg, textPrimary, etc.) that switches between dark/light values. All inline styles now use C tokens.
2. **Brent/VIX data slow**: `_fetch_yf_prices()` was fetching 3 tickers sequentially (8-9s). Fixed with `ThreadPoolExecutor(3)` parallel fetch. Added stale-while-revalidate cache (`CACHE_TTL=900s`, `CACHE_STALE_TTL=1800s`) — returns cached data instantly, refreshes in background. Server startup pre-warms cache automatically.
3. **Duplicate functions**: Removed duplicate `_calc_vix_percentile` + `_next_expiry_info` in `market_intel.py`.

**Performance**: Cold start ~8s (yfinance limitation), warm cache ~130ms (instant).

---



### VP Button (Volume Profile Manual Toggle)
- Added "VP" toggle button in ChartPanel.jsx toolbar (after PATTERNS, before SMC)
- Orange color (`#FF6B00`) — matches POC line color
- Click ON → fetches Volume Profile (POC/VAH/VAL canvas + price lines)
- Click OFF → clears VP, hides canvas
- No longer auto-activates on stock selection (manual control like PATTERNS/EMA)


## Update (July 2026) — HybridSuperBrain Priority Improvements

### A. HybridSuperBrain as Truly Central
- Universe scanner now runs `_brain_gate_top_picks()` on top 15 results before returning
- Each scan pick gets `brain_gate: 'PASS'|'WARN'|'SKIP'`, `brain_action`, `brain_conf`, `brain_fear`
- Danger scanner feeds into trading loop → Brain validates each ticker via `decide_sync()` (already central)

### B. Diversity + Randomness
- `danger_scanner.py`: Added `_apply_diversity_and_noise()` — ±12% score noise + max 2 picks/sector
- `universe_scanner.py`: Added `_diversify_with_noise()` — ±12% confidence noise + max 3 picks/sector
- Sector mapping covers Banking, IT, Energy, Pharma, Metals, Auto, NBFC, FMCG, Infra, Power, Telecom
- Result: scanner returns diverse sectors instead of always top Banking/IT stocks

### C. Dynamic Confidence Threshold
- `trading_loop.py`: Added `_dynamic_conf_threshold(watchlist_obs)` function
- Uses average ATR% across all observed tickers as VIX proxy
- Formula: `threshold = clamp(58 + (avg_atr% - 1.5) * 4, 48, 76)`
- Normal market (VIX~15, ATR~1.5%) → threshold=58 | High vol (VIX~20, ATR~2.5%) → 62 | Extreme (ATR~6%) → 76
- Logged each cycle: `Dynamic conf threshold = {N} (from avg ATR of {M} tickers)`
- Replaces hardcoded `confidence <= 58` check in execution loop


- New endpoint `/api/option/index-intraday` — synthesizes NIFTY/BANKNIFTY/FINNIFTY/MIDCPNIFTY option intraday bars
  using yfinance spot (^NSEI, ^NSEBANK, ^CNXFIN) + India VIX + Black-Scholes (same as /option/sensex-intraday)
- Returns 120 × 5-min bars per option, is_live_derived=true
- Frontend `fetchOptionIntraday` now routes: SENSEX → /sensex-intraday, NSE-derived → /index-intraday, live NSE → /intraday
- `handleOptionSelect` fixed: `isSensex` no longer incorrectly catches NSE-derived options
- Unknown underlying returns HTTP 400 with supported list


- NSE option chain API was blocked → returned empty data → HTTP 502
- Added Black-Scholes derived fallback (`_fetch_nse_index_derived_options`) for NIFTY/BANKNIFTY/FINNIFTY/MIDCPNIFTY/NIFTYNXT50
- Uses live yfinance spot price + India VIX + Black-Scholes Greeks (delta, theta, IV)
- 8-second async timeout via `asyncio.wait_for` + `asyncio.to_thread` prevents event loop blocking
- Shows `is_live_derived=True` badge in response
- Weekly Thursday expiry schedule for NSE indices

### OrderFlow Division By Zero Bug Fix
- Clicking any NIFTY/SENSEX option row caused "float division by zero" toast
- Root cause: `_of_volume_profile` — when all bars have price=0, `price_max = 0 * 1.01 = 0` → `bin_size = 0`
- Fix 1: `_of_volume_profile` — guard: `price_max = price_min + 1.0 if price_min == 0 else price_min * 1.01` + `bin_size <= 0` fallback
- Fix 2: `_of_calc_atr` — returns `max(avg, 0.01)` (never zero)
- Fix 3: `_of_footprint_candle` — rng guard: `max(l * 0.001, 0.01)`
- All 12 pytest tests pass (test file: /app/backend/tests/test_orderflow_zero.py)


**Feature**: Indian Stock Option Chain (Kite-style) — Full 3-Column Modal + OC Button (Jul 2026)

**OC Button**: Small red circle button in ChartPanel toolbar (next to TRADE) for Indian equity stocks.
- `data-testid="option-chain-btn"`, only visible for equity stocks (not crypto, not already an option)
- Clicking triggers `onOpenOptionChain({ symbol, name })` → opens `OptionChainModal`

**OptionChainModal.jsx** (new component — `/app/frontend/src/components/OptionChainModal.jsx`):
- Kite-style 3-column layout: **Call Price | Strike Price | Put Price**
- Header: stock name + spot price + BS-Derived badge + expiry dropdown selector
- OI bars: green horizontal bars under call prices, red under put prices
- ATM Banner: highlighted dark row with current price + "ATM" label
- Auto-scrolls to ATM on open (150ms after data loads)
- Click Call/Put row → `handleOptionSelect(option)` → modal closes → option chart loads
- `data-testid="option-chain-modal"`, rows: `call-row-{strike}`, `put-row-{strike}`

**Backend endpoints**:
- `GET /api/option-chain/equity/{symbol}?expiry=` — paired chain: `{strike, call, put}` per row
  - Primary: NSE live API (`_fetch_nse_option_chain`)
  - Fallback: Black-Scholes with yfinance fast_info + historical vol
  - Returns: `{chain, underlying_price, atm_strike, all_expiries, max_call_oi, max_put_oi, is_live_derived}`
  - Cache: 90s
- `GET /api/option/equity-intraday?underlying=&strike=&option_type=&expiry=&interval_min=` — BS-synthesized intraday candles
  - Primary: NSE OPTSTK chart-databyindex
  - Fallback: yfinance stock spot bars + historical vol BS synthesis
  - Cache: 30s

**TradingDashboard.jsx changes**:
- Added `showOptionChain` state for modal
- Modified `fetchOptionIntraday` to detect `is_equity: true` → routes to `/option/equity-intraday`
- Modified `handleOptionSelect` to close both optionsSheet and showOptionChain modals
- Passes `onOpenOptionChain` to ChartPanel

**Tested**: 21/21 backend tests PASS, all frontend critical flows PASS (100%)




**New file**: `/app/backend/agents/layer_evolution.py` — `LayerEvolutionEngine` singleton
- 6 layers tracked with trust scores (EMA): dreamer, psychology, strategy, mirofish_meta, survival, risk_gate
- Learning signals: trade close (lr=0.20, real P&L), live scan cycle (lr=0.08), dreamer WM-loss trend (lr=0.02)
- Trust → adaptive coefficients for HybridSuperBrain._hybrid_engine (fomo/apathy/regime/fear multipliers + dreamer_scale/meta_scale). Trust 0.5 = original static values
- Trade close also feeds AdaptiveLearner.record_trade_outcome (strategy 6-agents)
- MongoDB persistence: `layer_evolution_state` collection (survives restarts)

**Hooks**:
- `trading_loop.py`: after push_live_experience → evolve_from_live_training; on position close → evolve_from_trade_close
- `dreamer_trainer.py` `_trigger_live_mini_train` → notify_dreamer_step
- `robo_router.py` /api/robo/status → attaches `layer_evolution` state

**New endpoints**: `GET /api/hybrid-brain/layer-evolution`, `POST /api/hybrid-brain/layer-evolution/reset`

**Frontend**: RoboAdvisorDashboard.jsx — "Robot 3.0 · Layer Evolution" panel (violet) below Live Training panel: 6 trust bars, update counts, total evolution updates, trade closes learned. data-testid: layer-evolution-panel, layer-evolution-badge, layer-row-{layer}

**Tested**: unit simulation (trust evolution verified), e2e curl (endpoints + robo/status), hybrid engine adaptive coefficients, frontend compiles clean.

---

## Update (Feb 2026) — Auto Trendline Detection (One-Click)

**Feature**: TREND button in chart toolbar — one click auto-detects all trendline types.

**Types detected** (all drawn simultaneously):
- **Uptrend Support** (green solid) — Rising pivot lows connected
- **Downtrend Resistance** (red solid) — Falling pivot highs connected  
- **Horizontal Support** (blue dashed) — Clustered pivot lows at same price level
- **Horizontal Resistance** (orange dashed) — Clustered pivot highs at same price level
- **Ascending Channel** (cyan dotted) — Parallel line above uptrend
- **Descending Channel** (pink dotted) — Parallel line below downtrend
- **Fibonacci Retracement** (violet dotted) — 23.6%, 38.2%, 50%, 61.8%, 78.6% from last 150-bar swing

**Algorithm**: Adaptive pivot window (W = n/25), slope validation, broken-line check, touch-count scoring, max 3 lines per type (5 for Fib).

**UI**: TREND + filter split button (SMC-style). Dropdown shows 7 type toggles with color swatches. "All" / "Clear" shortcuts. Count badge updates dynamically. Click-outside closes dropdown.

**File**: ChartPanel.jsx — `detectTrendlines()` function added above component.

---

## Update (Feb 2026) — Black-Scholes Option Calculator + IV Solver

**New Component**: `BlackScholesPanel.jsx` + `/api/black-scholes/calculate` + `/api/black-scholes/iv-solver`

- European Call + Put pricing with full Greeks (Delta, Gamma, Vega, Theta, Rho)
- d1, d2, T(years) intermediate values shown
- Quick presets: NIFTY ATM, BANKNIFTY, RELIANCE, INFY
- Dividend yield support
- **IV Solver**: Newton-Raphson method — input market price → get Implied Volatility (with bisection fallback)
- Accessible via Settings Drawer → B-S CALC tab
- Backend uses scipy.stats.norm (already in requirements.txt)

**Dark Mode Bug Fix**: ChartPanel.jsx TF selector button was showing white (bg-slate-100 + dark:bg-white/8 unreliable)
- Fixed: `dark:bg-zinc-800` (inactive), `dark:bg-zinc-600` (active/open)
- Yahoo data source button: `dark:bg-white` → `dark:bg-zinc-600 dark:text-white`
- Testing: 10/10 pytest + 6/6 frontend verified (iteration_27.json)

---

## Update (Feb 2026) — TimeframeLevels Custom Badge Overlay + MTF Direction Indicators

### TimeframeLevels.jsx — Complete Redesign
- Price lines now use `axisLabelVisible: false` (removed from price axis to avoid overlap)
- Custom HTML badges rendered as absolute-positioned overlays inside chart container
- Badge format: `[colored name badge] [dark price badge]` — colors match horizontal lines exactly
- Right offset: `74px` from container edge — clears the price scale completely
- Collision avoidance: when multiple levels at same price (e.g., many Lows = 555.75), badges auto-shift down
- Live position tracking: subscribes to `priceScale.subscribeVisiblePriceRangeChange` + `timeScale.subscribeVisibleTimeRangeChange` — badges move with scroll/zoom
- Auto-adjust: `axisLabelVisible: false` means LW chart scales to ONLY the candlestick data (4Y High no longer forces chart to zoom out)

### MTF Market Direction Badges (1H / 45M / 15M)
- Added `mtfDirection` state + `fetchMtfDirection()` useCallback in ChartPanel.jsx
- Fetches last bars from `/api/groww/candles/{sym}?interval={tf}` for each timeframe on stock change
- Direction: last close vs 3-bars-ago close (±0.15% threshold → UP ▲ / DOWN ▼ / SIDE ─)
- Shown as small colored badges in the toolbar immediately after the OC button
- Colors: UP=green, DOWN=red, SIDE=gray
- Not shown for crypto charts

### Chart Fixes
- `rightPriceScale: { minimumWidth: 70 }` — ensures price scale has consistent width
- TimeframeLevels moved INSIDE chart container div (was outside before) to enable absolute positioning



**User request**: "Main Dashboard Layout: Top Bar (Nifty/BankNifty/Sensex big numbers), Left Sidebar Nav (SCAN/STRAT/TRADERS/PAPER/SETTINGS), Center (Live Chart + Key Indicators), Right Panel (tab-based Signals/Positions/Risk), mobile sidebar collapse."

### New Structure (`TradingDashboard.jsx` fully restructured)
- **Top Bar**: Brand + `IndicesTickerBar` restyled with big inline NIFTY/SENSEX/BANKNIFTY numbers (`text-base md:text-xl font-black`) + global `StockSearch` + theme toggle + notifications bell (→ opens Settings/Alerts) + RL training badge (→ opens Settings/RL Agent)
- **Left Sidebar**: 5-item nav — SCAN (`AutoScanner`), STRAT (14 strategy analyzer bundle), TRADERS (`TopTraderUniverseScan`), PAPER (`PaperTradingPanel`), SETTINGS (opens drawer)
- **Center**: `MultiChartLayout` (1/2/4 charts, unchanged) + "Key Indicators" strip (OrderFlowPanel, KronosForecastPanel, GannQSCPanel, SquareOf9Calculator)
- **Right Panel** (tab-based per user's explicit choice): SIGNALS (`SignalDashboard` + `OIAnalysis`) | POSITIONS (new `OpenPositionsPanel.jsx` — merges `/api/robo/positions` + `/api/paper-trade/positions` live) | RISK (`AdvancedRiskPanel`)
- **Settings Drawer** (new `SettingsDrawer.jsx`, custom CSS-transform drawer — NOT Radix Sheet, to keep `RoboDashboard`/`RLAgentPanel` always-mounted via `display:none` toggle so background polling/training never stops even when drawer closed): pinned Robo-Trader banner + pills for Watchlist, Crypto, Groww, Portfolio, Alerts, Market Intel (Regulatory/Sector/TopMovers/SectorRotation/Moneycontrol combined), RL Agent, AI Assemble (Ensemble+MonteCarlo), PE-CE OI, Quant, Tools (Visualize/3D/Parity/DeltaDash/HybridBrain quick-launch — gives `HybridBrainPanel` its first-ever UI entry point)
- **Mobile**: 3-tab bottom bar (Menu/Chart/Panel) + hamburger toggle, hidden below `lg:` breakpoint (matches prior codebase convention)
- `StockSearch.jsx`: results dropdown changed to `absolute` overlay (was static block) so it works correctly in the narrow top bar

**Tested** (`testing_agent_v4_fork`, reduced-scope retry after 1 timeout): 100% pass — sidebar nav clicks, Settings drawer open/close + section pills, right panel 3 tabs, top-bar search→chart load, mobile 390×844 responsive toggle all verified with no console errors. Deep multi-chart "Object is disposed" regression check was skipped this round (time-constrained, previously fixed in prior session) — **still recommended for a future dedicated regression pass**.

**Minor code-review notes (not blocking)**: `TradingDashboard.jsx` now ~1013 lines (approaching 700-line split guideline — consider extracting modal-mounting block into `DashboardModals.jsx`); `StockSearch` result text lacks a separator between badge/symbol/name (cosmetic only).

---

## Bug Fix (Feb 2026) — Timeframe Change Shows Same Candles

**Root Cause**: `MultiChartLayout.jsx`'s `fetchData` function was calling the Groww candles API with wrong params (`timespan`/`multiplier` instead of `interval`/`days_back`). Backend Groww endpoint always received defaults (`interval="1d"`, `days_back=120`) → same daily candles on every TF change.

**Fix**: Added `GROWW_INTV_MAP` and `GROWW_DAYS_MAP` lookup tables in `MultiChartLayout.jsx` that correctly translate TF label (e.g. `'15M'`) → `interval='15m'`, `days_back=15` (matching the logic in `TradingDashboard.jsx`'s `fetchStockData`).

**File changed**: `/app/frontend/src/components/MultiChartLayout.jsx` (lines 150-163, fetchData function lines 165-196)

**Testing**: 7/7 TF scenarios passed (1D, 15M, 1H, 5M, 1W, 30M, 4H) including multi-slot independent TF changes.


---

## Changes (Feb 2026) — Right Panel Removed + Refresh Button + Mobile Responsive Fix

**Right Panel removed**: Completely removed from all devices (mobile + desktop). Removed aside block, state (rightPanelTab), imports (SignalDashboard, OIAnalysis, AdvancedRiskPanel, OpenPositionsPanel), icon imports (Pulse, ShieldWarning, Wallet). Center main now full width: lg:col-span-9 xl:col-span-10.

**Refresh button**: Added to each MultiChartLayout chart slot — "just now / Xm ago" timestamp, manual refresh SVG icon, auto-refresh every 5 min for intraday TFs (1MIN–4H).

**Mobile Responsive fix**: Root cause was md:grid md:grid-cols-12 activating grid at 768px with no md:col-span-X → center took 1/12 width. Fixed: lg:grid lg:grid-cols-12 (grid only at 1024px+). Aligned all breakpoints: hamburger lg:hidden, desktop search hidden lg:block, mobile search lg:hidden. Verified: 390px mobile shows full-width chart + MENU/CHART tabs correctly.

---

## Feature (Feb 2026) — HybridSuperBrain Centralization (P0 Complete)

**What changed:**

### `hybrid_super_brain.py`
- `think_and_decide` signature: added `scanner_inputs: Optional[Dict] = None`
- Layer 3 (SMC): uses `scanner_inputs["smc"]` if provided → skips internal compute
- Layer 5 (Delta): uses `scanner_inputs["delta"]` if provided → skips internal compute
- Layer 9b (NEW): Danger integration — boosts smc_score by +15 if ticker is a danger pick
- Layer 9c (NEW): ORB integration — adds ORB breakout signal as an extra consensus vote
- `_elite_decision` signature: added `orb_vote: Optional[str] = None` parameter
- ORB vote injected into consensus voting block (BUY/SELL votes)
- `scanner_inputs_used` dict attached to every decision (for audit/logging)
- `decide_sync`: added `scanner_inputs` param, passes to `think_and_decide`

### `trading_loop.py`
- Per-ticker loop (Step 8a): gathers 4 scanner inputs before brain call:
  1. SMC — `SMCAnalyzer().analyze(ctx)` pre-computed
  2. Delta — `deltadash_router._SCORE_CACHE` lookup (zero network cost)
  3. Danger — `_state["danger_picks"]` match check (only in danger mode)
  4. ORB — computed from price vs ATR-proxy opening range (valid 9:15–10:45 IST)
- `brain.decide_sync(...)` now called with `scanner_inputs=scanner_inputs`

**Testing**: Python assertions passed — smc_precomputed, delta_precomputed, danger_is_pick, orb_vote all confirmed in decision output. smc_score correctly shows 72+15=87 (danger boost applied).

---

## USER PREFERENCES (PERMANENT RULES)

> **Set by user — NEVER override these:**
> 1. **NO screenshots** — kabhi bhi screenshot mat lena
> 2. **NO testing** — testing agent ya koi bhi automated testing mat karna
> 3. Sirf code changes karo aur finish karo

