import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { CaretUp, CaretDown } from '@phosphor-icons/react';
import { useMultiTick } from '../hooks/useLiveTick';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// yfinance symbols for all tracked indices (Indian + US)
const INDEX_WS_SYMBOLS = ["^NSEI", "^BSESN", "^NSEBANK", "^GSPC", "^IXIC"];

// Map REST key → WS symbol
const INDEX_WS_MAP = {
  NIFTY:      "^NSEI",
  SENSEX:     "^BSESN",
  BANKNIFTY:  "^NSEBANK",
  SP500:      "^GSPC",
  NASDAQ:     "^IXIC",
};

const IndicesTickerBar = ({ onIndexClick }) => {
  const [indices, setIndices]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const intervalRef             = useRef(null);

  const { ticks: wsTicks, connected: wsConnected } = useMultiTick(INDEX_WS_SYMBOLS);

  const fetchIndices = async () => {
    try {
      const res = await axios.get(`${API}/indices/live`);
      setIndices(res.data?.indices || []);
    } catch {
      // silent — keep stale data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIndices();
    intervalRef.current = setInterval(fetchIndices, 15000);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (loading && indices.length === 0) {
    return (
      <div className="px-1 flex gap-2 overflow-x-auto scrollbar-none h-full items-center">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="min-w-[112px] h-[38px] rounded-md bg-slate-200 dark:bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }

  // Split into Indian and US groups
  const indian = indices.filter(idx => !idx.us);
  const us     = indices.filter(idx => idx.us);

  const renderPill = (idx) => {
    const wsSym     = INDEX_WS_MAP[idx.symbol];
    const wsTick    = wsSym ? wsTicks[wsSym] : null;
    const price     = wsTick?.price       ?? idx.price;
    const changePct = wsTick?.change_pct  ?? idx.change_pct;
    const changeAbs = (price > 0 && changePct != null)
      ? (price * changePct / 100)
      : (idx.change || 0);
    const isUp      = (changePct ?? 0) >= 0;
    const isLive    = !!wsTick;
    const isUs      = !!idx.us;
    const supportsOptions = ['NIFTY', 'BANKNIFTY', 'SENSEX'].includes(idx.symbol);

    // US indices show price with comma separation (US format)
    const priceStr = isUs
      ? (price > 0 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—')
      : (price > 0 ? price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');

    return (
      <button
        key={idx.key}
        onClick={() => supportsOptions && onIndexClick?.(idx.symbol, idx.name)}
        disabled={!supportsOptions}
        className={`min-w-[100px] md:min-w-[120px] flex-shrink-0 text-left rounded-md border px-2 md:px-3 py-1.5 transition-all ${
          supportsOptions
            ? 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.08] hover:border-[#007AFF]/40 active:scale-[0.98] cursor-pointer'
            : 'border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] opacity-80 cursor-default'
        } ${isUs ? 'border-blue-200/50 dark:border-blue-400/15 bg-blue-50/30 dark:bg-blue-500/[0.04]' : ''}`}
        data-testid={`index-pill-${idx.key}`}
        title={isUs ? `${idx.name} (US Market)` : idx.name}
      >
        <div className="flex items-center gap-1 mb-0.5">
          <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-wider truncate ${
            isUs ? 'text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-white/60'
          }`}>
            {idx.name}
          </span>
          {isLive && (
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Live tick" />
          )}
          {isUs && !isLive && (
            <span className="text-[7px] font-bold text-blue-400/60 shrink-0">US</span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-base md:text-xl font-black tracking-tighter tabular-nums text-slate-900 dark:text-white"
            style={{ fontFamily: "'Chivo', sans-serif" }}
          >
            {priceStr}
          </span>
          <div className="flex flex-col items-start">
            <span
              className={`text-[10px] md:text-xs font-bold font-mono flex items-center gap-0.5 ${
                isUp ? 'text-[#34C759]' : 'text-[#FF3B30]'
              }`}
            >
              {isUp ? <CaretUp size={10} weight="fill" /> : <CaretDown size={10} weight="fill" />}
              {Math.abs(changePct || 0).toFixed(2)}%
            </span>
            <span
              className={`text-[8px] font-mono leading-none ${
                isUp ? 'text-[#34C759]/80' : 'text-[#FF3B30]/80'
              }`}
            >
              {isUp ? '+' : ''}{Math.abs(changeAbs) >= 1000
                ? changeAbs.toFixed(0)
                : changeAbs.toFixed(isUs ? 2 : 1)} pts
            </span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div
      className="flex gap-1.5 md:gap-2 overflow-x-auto scrollbar-none h-full items-center px-1 transition-colors duration-200"
      data-testid="indices-ticker-bar"
    >
      {/* Live dot */}
      <div className="flex items-center self-center px-1 shrink-0" title={wsConnected ? 'Live WebSocket (2s)' : 'Polling (15s)'}>
        <span
          className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`}
          data-testid="ws-live-dot"
        />
      </div>

      {/* Indian indices */}
      {indian.map(renderPill)}

      {/* Divider before US */}
      {us.length > 0 && (
        <div className="h-6 w-px bg-slate-200 dark:bg-white/10 shrink-0 mx-0.5" />
      )}

      {/* US indices */}
      {us.map(renderPill)}
    </div>
  );
};

export default IndicesTickerBar;
