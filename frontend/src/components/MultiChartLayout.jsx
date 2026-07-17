import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import ChartPanel from './ChartPanel';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DEFAULT_TF = { multiplier: 1, timespan: 'day', label: '1D' };

// ── localStorage helpers (only for slots 2, 3, 4 — slot 1 is always fresh) ──
const SLOT_KEY   = (id) => `dreamer_chart_slot_${id}`;
const LAYOUT_KEY = 'dreamer_chart_layout';

function loadSlotPrefs(id) {
  if (id === 1) return null;
  try {
    const raw = localStorage.getItem(SLOT_KEY(id));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveSlotPrefs(id, { selectedStock, timeframe, dataSource }) {
  if (id === 1) return; // Never persist slot 1
  try {
    localStorage.setItem(SLOT_KEY(id), JSON.stringify({ selectedStock, timeframe, dataSource }));
  } catch (e) { /* storage unavailable */ }
}

// Layout icon helpers
const Icon1 = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="14" height="14" rx="1.5" opacity="0.9"/>
  </svg>
);
const Icon2 = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6.5" height="14" rx="1.5"/>
    <rect x="8.5" y="1" width="6.5" height="14" rx="1.5"/>
  </svg>
);
const Icon4 = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6.5" height="6.5" rx="1"/>
    <rect x="8.5" y="1" width="6.5" height="6.5" rx="1"/>
    <rect x="1" y="8.5" width="6.5" height="6.5" rx="1"/>
    <rect x="8.5" y="8.5" width="6.5" height="6.5" rx="1"/>
  </svg>
);

// Fullscreen icon
const IconFullscreen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);
const IconExitFullscreen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
    <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
  </svg>
);
function StockSearchBar({ slot, onSelect }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen]         = useState(false);
  const inputRef  = useRef(null);
  const dropRef   = useRef(null);
  const debounceRef = useRef(null);

  // Click outside → close
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInput = (e) => {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    clearTimeout(debounceRef.current);
    if (!v.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(`${API}/stock/search`, { params: { q: v } });
        setResults(res.data?.results?.slice(0, 8) || []);
      } catch { setResults([]); }
      setSearching(false);
    }, 280);
  };

  const choose = (stock) => {
    setQuery(stock.name || stock.ticker);
    setOpen(false);
    onSelect(stock);
  };

  const displayName = slot.selectedStock
    ? `${slot.selectedStock.name || slot.selectedStock.ticker}`
    : 'Select stock…';

  return (
    <div className="relative flex items-center gap-1.5 flex-1 min-w-0">
      {/* Current ticker badge */}
      {slot.selectedStock && (
        <span className="shrink-0 text-[10px] font-black text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 px-1.5 py-0.5 rounded font-mono">
          {slot.selectedStock.ticker?.replace('.NS','').replace('.BO','')}
        </span>
      )}

      {/* Search input */}
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => { setOpen(true); setQuery(''); }}
          placeholder={displayName}
          className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 text-slate-800 dark:text-zinc-200 text-[11px] rounded px-2 py-1 placeholder-slate-400 dark:placeholder-zinc-500 outline-none focus:border-violet-500/60 transition-colors min-w-0"
          style={{ maxWidth: '100%' }}
        />
        {searching && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px]">…</span>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div
          ref={dropRef}
          className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 rounded-lg shadow-2xl z-50 w-72 max-h-56 overflow-y-auto"
        >
          {results.map((r, i) => (
            <button
              key={r.ticker || i}
              onMouseDown={() => choose(r)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center justify-between gap-2 group transition-colors"
            >
              <span className="text-[11px] font-mono font-bold text-emerald-400 shrink-0 group-hover:text-emerald-300">
                {(r.ticker || '').replace('.NS','').replace('.BO','')}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400 truncate flex-1">{r.name}</span>
              {r.exchange && (
                <span className="text-[9px] text-slate-400 dark:text-zinc-600 shrink-0">{r.exchange}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Single chart slot ---
// Maps TF label → Groww interval string and days_back (same as TradingDashboard.jsx)
const GROWW_INTV_MAP = {
  '1MIN':'1m','2M':'2m','3M':'3m','5M':'5m','10M':'10m','15M':'15m',
  '30M':'30m','45M':'45m','1H':'1h','2H':'2h','4H':'4h',
  '1D':'1d','1W':'1w','1MO':'1mo',
  // legacy labels
  '1M':'1d','6M':'1d','1Y':'1w',
};
const GROWW_DAYS_MAP = {
  '1MIN':7,'2M':7,'3M':7,'5M':10,'10M':15,'15M':15,'30M':25,'45M':25,
  '1H':60,'2H':90,'4H':150,
  '1D':365,'1W':730,'1MO':30,'3MO':90,'6MO':180,
  '1M':30,'6M':180,'1Y':730,
};

// Crypto TF label → days map (same as TradingDashboard.jsx)
const CRYPTO_DAYS_MAP = {
  '1MIN':1,'2M':1,'3M':1,'5M':1,'10M':1,'15M':1,'30M':1,'45M':1,
  '1H':1,'2H':1,'4H':1,
  '1D':7,'1W':30,
  '1MO':30,'3MO':90,'6MO':180,'1Y':365,
  '1M':30,'6M':180,
};

function ChartSlot({ slot, onUpdate, isCompact, onOpenOptionChain }) {
  const isCrypto = slot.selectedStock?.type === 'CRYPTO';

  const fetchData = useCallback(async (ticker, tf, dsOverride) => {
    onUpdate(slot.id, { loading: true });
    try {
      let data;

      // ── Crypto: use CoinPaprika/Kraken chart endpoint ──────────
      const stock = slot.selectedStock;
      if (stock?.type === 'CRYPTO') {
        const coinId = stock.coin_id || ticker.toLowerCase().replace('-usd','').replace('usd','');
        const days = CRYPTO_DAYS_MAP[tf?.label] || 7;
        const res = await axios.get(`${API}/crypto/chart/${coinId}?days=${days}`);
        const bars = (res.data.bars || []).map(b => ({
          timestamp: b.timestamp, open: b.open, high: b.high,
          low: b.low, close: b.close, volume: 0,
        }));
        data = { ticker: coinId.toUpperCase(), bars };
      } else {
        // ── Indian stocks: Groww or Yahoo ──────────────────────
        const ds = dsOverride !== undefined ? dsOverride : slot.dataSource;
        if (ds === 'groww') {
          const sym = ticker.replace('.NS','').replace('.BO','').replace(/^\^/,'');
          const interval  = GROWW_INTV_MAP[tf.label] || '1d';
          const days_back = GROWW_DAYS_MAP[tf.label] || 120;
          let growwBars = [];
          try {
            const res = await axios.get(`${API}/groww/candles/${sym}`, {
              params: { interval, days_back }
            });
            growwBars = res.data.bars || [];
          } catch {
            growwBars = [];
          }
          if (growwBars.length > 0) {
            data = { ticker, bars: growwBars };
          } else {
            // Groww returned empty (e.g., indices) — fall back to yfinance
            const res = await axios.get(`${API}/stock/bars/${ticker}`, {
              params: { timespan: tf.timespan, multiplier: tf.multiplier, ...(tf.days ? { days: tf.days } : {}), limit: 200 }
            });
            data = res.data;
          }
        } else {
          const res = await axios.get(`${API}/stock/bars/${ticker}`, {
            params: { timespan: tf.timespan, multiplier: tf.multiplier, ...(tf.days ? { days: tf.days } : {}), limit: 200 }
          });
          data = res.data;
        }
      }

      onUpdate(slot.id, { stockData: data, loading: false, timeframe: tf, lastFetched: Date.now() });
    } catch (err) {
      onUpdate(slot.id, { loading: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.id, slot.dataSource, slot.selectedStock, onUpdate]);

  const handleStockSelect = useCallback((stock) => {
    onUpdate(slot.id, { selectedStock: stock, stockData: null });
    fetchData(stock.ticker, slot.timeframe);
  }, [slot.id, slot.timeframe, fetchData, onUpdate]);

  const handleTfChange = useCallback((tf) => {
    onUpdate(slot.id, { timeframe: tf });
    if (slot.selectedStock) fetchData(slot.selectedStock.ticker, tf);
  }, [slot.id, slot.selectedStock, fetchData, onUpdate]);

  const handleDsChange = useCallback((ds) => {
    onUpdate(slot.id, { dataSource: ds });
    if (slot.selectedStock) fetchData(slot.selectedStock.ticker, slot.timeframe, ds);
  }, [slot.id, slot.selectedStock, slot.timeframe, fetchData, onUpdate]);

  const handleSemiLog = useCallback((v) => onUpdate(slot.id, { semiLogScale: v }), [slot.id, onUpdate]);
  const handlePivot   = useCallback((p) => onUpdate(slot.id, { pivotPoint: p }),  [slot.id, onUpdate]);

    // Auto-fetch on mount for slots 2-4 restored from localStorage
    // (stock metadata is saved but chart data is never stored — need a fresh fetch)
    useEffect(() => {
      if (slot.id !== 1 && slot.selectedStock && !slot.stockData && !slot.loading) {
        fetchData(slot.selectedStock.ticker, slot.timeframe);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slot.id]);

  // Auto-refresh every 5 min for intraday timeframes
  const INTRADAY_TFS = new Set(['1MIN','2M','3M','5M','10M','15M','30M','45M','1H','2H','4H']);
  const isIntraday = INTRADAY_TFS.has(slot.timeframe?.label);
  useEffect(() => {
    if (!isIntraday || !slot.selectedStock) return;
    const id = setInterval(() => {
      fetchData(slot.selectedStock.ticker, slot.timeframe);
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntraday, slot.selectedStock?.ticker, slot.timeframe?.label]);

  // Tick every 30s to keep "Xm ago" text fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const ageLabel = useMemo(() => {
    if (!slot.lastFetched) return null;
    const diffSec = Math.floor((Date.now() - slot.lastFetched) / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    return `${diffMin}m ago`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.lastFetched, Math.floor((Date.now() - (slot.lastFetched || 0)) / 30000)]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#090909] border border-slate-200 dark:border-zinc-800/60 rounded-lg overflow-hidden">
      {/* Slot header */}
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800/60">
        <StockSearchBar slot={slot} onSelect={handleStockSelect} />
        {slot.selectedStock && (
          <div className="shrink-0 flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 dark:text-zinc-500">{slot.timeframe?.label || '1D'}</span>
            {ageLabel && !slot.loading && (
              <span className="text-[9px] text-slate-400 dark:text-zinc-600" title="Last data refresh">{ageLabel}</span>
            )}
            {slot.loading ? (
              <span className="text-[9px] text-violet-400 animate-pulse" title="Loading…">●</span>
            ) : (
              <button
                onClick={() => slot.selectedStock && fetchData(slot.selectedStock.ticker, slot.timeframe)}
                title="Refresh chart data"
                data-testid={`refresh-slot-${slot.id}`}
                className="text-slate-400 dark:text-zinc-600 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ChartPanel */}
      <div className="flex-1 min-h-0">
        {slot.selectedStock ? (
          <ChartPanel
            stockData={slot.stockData}
            loading={slot.loading}
            selectedStock={slot.selectedStock}
            onPivotSelect={handlePivot}
            pivotPoint={slot.pivotPoint}
            gannFan={slot.gannFan}
            semiLogScale={slot.semiLogScale}
            setSemiLogScale={handleSemiLog}
            timeframe={slot.timeframe}
            onTimeframeChange={handleTfChange}
            isCrypto={isCrypto}
            dataSource={slot.dataSource}
            onDataSourceChange={isCrypto ? undefined : handleDsChange}
            activeStrategy={slot.activeStrategy}
            strategyData={slot.strategyData}
            tradeSignal={null}
            onOpenOptionChain={onOpenOptionChain}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-zinc-700 gap-2 select-none">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3v18h18" strokeLinecap="round"/>
              <path d="M7 16l4-4 4 4 4-7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-[11px] text-slate-400 dark:text-zinc-600">Search and select a stock above</p>
          </div>
        )}
      </div>
    </div>
  );
}

function makeSlot(id, overrides = {}) {
  return {
    id,
    selectedStock: null,
    stockData: null,
    loading: false,
    timeframe: { ...DEFAULT_TF },
    dataSource: 'groww',
    semiLogScale: false,
    pivotPoint: null,
    gannFan: null,
    activeStrategy: null,
    strategyData: null,
    lastFetched: null,
    ...overrides,
  };
}

// -------------------------------------------------------------------
// MultiChartLayout
// -------------------------------------------------------------------
export default function MultiChartLayout({
  initialStock,
  initialStockData,
  initialLoading,
  initialTimeframe,
  initialDataSource,
  onPrimaryStockChange,   // callback when slot-1 stock changes (updates left sidebar)
  onOpenOptionChain,      // callback to open OptionChainModal from any slot
}) {
  // Persist layout preference
  const [layout, setLayout] = useState(() => {
    try { return parseInt(localStorage.getItem(LAYOUT_KEY) || '1', 10) || 1; } catch { return 1; }
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ESC key exits fullscreen
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setIsFullscreen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleLayoutChange = useCallback((n) => {
    setLayout(n);
    try { localStorage.setItem(LAYOUT_KEY, String(n)); } catch (e) { /* ignore */ }
  }, []);

  // Slots: slot 1 always fresh, slots 2-4 restored from localStorage
  const [slots, setSlots] = useState(() => {
    const prefs2 = loadSlotPrefs(2);
    const prefs3 = loadSlotPrefs(3);
    const prefs4 = loadSlotPrefs(4);
    return [
      makeSlot(1),
      makeSlot(2, prefs2 ? { selectedStock: prefs2.selectedStock, timeframe: prefs2.timeframe || DEFAULT_TF, dataSource: prefs2.dataSource || 'groww' } : {}),
      makeSlot(3, prefs3 ? { selectedStock: prefs3.selectedStock, timeframe: prefs3.timeframe || DEFAULT_TF, dataSource: prefs3.dataSource || 'groww' } : {}),
      makeSlot(4, prefs4 ? { selectedStock: prefs4.selectedStock, timeframe: prefs4.timeframe || DEFAULT_TF, dataSource: prefs4.dataSource || 'groww' } : {}),
    ];
  });

  // Sync slot-1 when left sidebar stock changes
  useEffect(() => {
    if (!initialStock) return;
    setSlots(prev => {
      const s = prev[0];
      // Only update if stock actually changed
      if (s.selectedStock?.ticker === initialStock.ticker &&
          s.stockData === initialStockData) return prev;
      const next = [...prev];
      next[0] = {
        ...s,
        selectedStock: initialStock,
        stockData: initialStockData,
        loading: initialLoading || false,
        timeframe: initialTimeframe || DEFAULT_TF,
        dataSource: initialDataSource || 'groww',
      };
      return next;
    });
  }, [initialStock, initialStockData, initialLoading, initialTimeframe, initialDataSource]);

  const updateSlot = useCallback((id, patch) => {
    setSlots(prev => {
      const next = [...prev];
      const idx = next.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const updated = { ...next[idx], ...patch };
      next[idx] = updated;

      // Persist slot 2/3/4 stock+tf+ds whenever they change
      if (id !== 1 && (patch.selectedStock !== undefined || patch.timeframe !== undefined || patch.dataSource !== undefined)) {
        saveSlotPrefs(id, {
          selectedStock: updated.selectedStock,
          timeframe:     updated.timeframe,
          dataSource:    updated.dataSource,
        });
      }

      // If slot 1's stock changes, notify parent (left sidebar sync)
      if (id === 1 && patch.selectedStock && onPrimaryStockChange) {
        onPrimaryStockChange(patch.selectedStock);
      }
      return next;
    });
  }, [onPrimaryStockChange]);

  // Number of visible slots
  const visibleCount = layout;
  const visibleSlots = slots.slice(0, visibleCount);

  // Grid class
  const gridClass = layout === 4
    ? 'grid grid-cols-2 grid-rows-2 gap-1'
    : layout === 2
    ? 'grid grid-cols-2 gap-1'
    : 'flex flex-col';

  // Per-slot height
  const slotHeight = layout === 4
    ? 'calc(50% - 2px)'
    : layout === 2
    ? '100%'
    : '100%';

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-[200] bg-[#090909]' : 'h-full min-h-0'}`}>
      {/* Layout switcher toolbar */}
      <div className="shrink-0 flex items-center px-2 py-1 bg-white dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800/60">
        {[
          { n: 1, Icon: Icon1, label: '1 Chart'  },
          { n: 2, Icon: Icon2, label: '2 Charts' },
          { n: 4, Icon: Icon4, label: '4 Charts' },
        ].map(({ n, Icon, label }, idx) => (
          <React.Fragment key={n}>
            {idx > 0 && (
              <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700/60 mx-1.5 shrink-0" />
            )}
            <button
              onClick={() => handleLayoutChange(n)}
              title={label}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                layout === n
                  ? 'text-violet-500 dark:text-violet-400'
                  : 'text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300'
              }`}
            >
              <Icon />
              <span>{label}</span>
            </button>
          </React.Fragment>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Fullscreen toggle */}
        <button
          onClick={() => setIsFullscreen(f => !f)}
          title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen Charts'}
          data-testid="chart-fullscreen-btn"
          className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-semibold transition-all border ${
            isFullscreen
              ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
              : 'border-slate-200 dark:border-zinc-700/60 text-slate-500 dark:text-zinc-400 hover:text-violet-500 dark:hover:text-violet-400 hover:border-violet-400/50'
          }`}
        >
          {isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
          <span>{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
        </button>
      </div>

      {/* Charts grid */}
      <div
        className={`flex-1 min-h-0 ${layout !== 1 ? gridClass : 'flex flex-col'}`}
        style={{
          display: layout === 4 ? 'grid' : layout === 2 ? 'grid' : 'flex',
          gridTemplateColumns: layout === 4 ? '1fr 1fr' : layout === 2 ? '1fr 1fr' : undefined,
          gridTemplateRows: layout === 4 ? '1fr 1fr' : undefined,
          gap: layout > 1 ? '4px' : undefined,
          padding: layout > 1 ? '4px' : undefined,
          flexDirection: layout === 1 ? 'column' : undefined,
        }}
      >
        {visibleSlots.map((slot) => (
          <ChartSlot
            key={slot.id}
            slot={slot}
            onUpdate={updateSlot}
            isCompact={layout > 1}
            onOpenOptionChain={onOpenOptionChain}
          />
        ))}
      </div>
    </div>
  );
}
