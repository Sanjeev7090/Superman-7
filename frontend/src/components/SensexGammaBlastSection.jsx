import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Format seconds → HH:MM:SS
function fmtCountdown(sec) {
  if (sec <= 0) return '00:00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export default function SensexGammaBlastSection({ onStrikeSelect }) {
  const [collapsed,   setCollapsed]   = useState(false);
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [rcOpen,      setRcOpen]      = useState(false);   // Reality Check toggle
  const [countdown,   setCountdown]   = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef   = useRef(null);
  const fetchRef   = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/gamma-blast/sensex-picks`);
      const json = await res.json();
      setData(json);
      setCountdown(json.time_to_start_sec || 0);
      setLastUpdated(new Date());
    } catch (_) {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount + every 3 min
  useEffect(() => {
    fetchData();
    fetchRef.current = setInterval(fetchData, 3 * 60 * 1000);
    return () => clearInterval(fetchRef.current);
  }, [fetchData]);

  // Countdown tick every second
  useEffect(() => {
    if (!data || data.window_status !== 'PRE_WINDOW') return;
    timerRef.current = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [data?.window_status]);

  const handleStrikeTap = (option) => {
    if (!onStrikeSelect || !option) return;
    onStrikeSelect({
      underlying:    'SENSEX',
      strike:        option.strike,
      type:          option.type,          // 'CE' or 'PE'
      expiry:        option.expiry || '',
      expiry_display: option.expiry_display || option.expiry || '',
      last_price:    option.last_price,
      change_pct:    0,
      instrument:    option.instrument || `SENSEX ${option.strike} ${option.type}`,
      is_live_derived: true,
      is_indicative: true,                 // marks it as SENSEX derived
      is_equity:     false,
    });
  };

  // ── Status colors ────────────────────────────────────────────────
  const ws      = data?.window_status;
  const GOLD    = '#F59E0B';
  const ACTIVE  = '#22c55e';
  const wColor  = ws === 'ACTIVE' ? ACTIVE : GOLD;

  const ce = data?.straddle?.ce;
  const pe = data?.straddle?.pe;

  return (
    <div className="border-b border-white/10">
      {/* ── Header ───────────────────────────────────────────────── */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD }}>
            Sensex · Gamma Blast
          </span>
          {data?.is_expiry_day && (
            <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-sm bg-amber-500/20 text-amber-400 border border-amber-500/30">
              EXPIRY DAY
            </span>
          )}
          {ws === 'ACTIVE' && (
            <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-sm bg-green-500/20 text-green-400 border border-green-500/30 animate-pulse">
              WINDOW ACTIVE
            </span>
          )}
          {ws === 'PRE_WINDOW' && (
            <span className="text-[7px] px-1 text-zinc-500 border border-zinc-700 rounded-sm">
              PRE-WINDOW
            </span>
          )}
          {ws === 'POST_WINDOW' && (
            <span className="text-[7px] px-1 text-zinc-600 border border-zinc-800 rounded-sm">
              CLOSED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[8px] text-zinc-600">
              {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <span className="text-zinc-600 text-[10px]">{collapsed ? '▶' : '▼'}</span>
        </div>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2.5">

          {/* Loading */}
          {loading && !data && (
            <div className="text-[10px] text-zinc-500 py-2 text-center animate-pulse">
              ⟳ Loading Gamma Blast data…
            </div>
          )}

          {data && (
            <>
              {/* ── Window timer strip ──────────────────────────── */}
              <div className="rounded px-2.5 py-2 flex items-center justify-between text-[9px]"
                style={{ background: `${wColor}0f`, border: `1px solid ${wColor}30` }}>
                <div className="flex items-center gap-2">
                  <span style={{ color: wColor }} className="font-bold">
                    {ws === 'ACTIVE'      ? '⚡ WINDOW LIVE'
                     : ws === 'PRE_WINDOW' ? '⏱ Window Opens'
                     :                      '✓ Window Closed'}
                  </span>
                  <span className="text-zinc-500">2:20 PM – 3:10 PM IST</span>
                </div>
                <div className="font-mono" style={{ color: wColor }}>
                  {ws === 'PRE_WINDOW' ? fmtCountdown(countdown)
                   : ws === 'ACTIVE'   ? `Closes ${data.window_end_ist}`
                   :                    data.ist_now}
                </div>
              </div>

              {/* ── Stats table ─────────────────────────────────── */}
              <div>
                <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 mb-1 px-0.5">
                  Movement Stats · Last {data.strategy_stats.sample_days} Expiry Days · {data.strategy_stats.period}
                </div>
                <div className="rounded border border-zinc-800 overflow-hidden text-[8px]">
                  {/* Table head */}
                  <div className="grid grid-cols-4 bg-zinc-800/60 text-zinc-500 px-2 py-1">
                    <span>Type</span>
                    <span>Movement</span>
                    <span>Frequency</span>
                    <span className="text-right">1-Lot Profit</span>
                  </div>
                  {/* MAX */}
                  <div className="grid grid-cols-4 px-2 py-1.5 border-t border-zinc-800/60 items-center">
                    <span className="font-bold text-green-400">MAX</span>
                    <span className="text-zinc-300">{data.strategy_stats.max_move.range}</span>
                    <span className="text-zinc-400">{data.strategy_stats.max_move.times}×</span>
                    <span className="text-right font-mono text-green-400">
                      ₹{data.strategy_stats.max_move.lot_profit.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {/* AVG */}
                  <div className="grid grid-cols-4 px-2 py-1.5 border-t border-zinc-800/60 items-center">
                    <span className="font-bold" style={{ color: GOLD }}>AVG</span>
                    <span className="text-zinc-300">{data.strategy_stats.avg_move.range}</span>
                    <span className="text-zinc-400">{data.strategy_stats.avg_move.times}×</span>
                    <span className="text-right font-mono" style={{ color: GOLD }}>
                      ₹{data.strategy_stats.avg_move.lot_profit.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {/* MIN */}
                  <div className="grid grid-cols-4 px-2 py-1.5 border-t border-zinc-800/60 items-center">
                    <span className="font-bold text-zinc-400">MIN</span>
                    <span className="text-zinc-300">{data.strategy_stats.min_move.range}</span>
                    <span className="text-zinc-400">{data.strategy_stats.min_move.times}×</span>
                    <span className="text-right font-mono text-zinc-300">
                      ₹{data.strategy_stats.min_move.lot_profit.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {/* Total */}
                  <div className="flex justify-between px-2 py-1.5 border-t border-zinc-700/60 bg-zinc-800/40">
                    <span className="text-zinc-500">Total (25 days sample)</span>
                    <span className="font-bold font-mono text-green-400">
                      ₹{data.strategy_stats.total_sample_profit.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[7.5px] text-zinc-600 px-0.5">
                  <span>Lot size: {data.strategy_stats.lot_size} units</span>
                  <span>·</span>
                  <span>Spot ₹{data.spot.toLocaleString('en-IN')}</span>
                  <span>·</span>
                  <span>VIX {data.india_vix_pct}%</span>
                  <span>·</span>
                  <span>DTE {data.dte}d</span>
                </div>
              </div>

              {/* ── Straddle Picks ──────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">
                    ATM Straddle · {data.atm_strike}
                  </span>
                  <span className="text-[8px] font-mono text-zinc-500">
                    Cost: <span style={{ color: GOLD }}>₹{data.straddle_cost}</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {/* CE Card */}
                  <div
                    className="rounded p-2 cursor-pointer active:scale-[0.98] transition-transform border border-green-500/25 bg-green-500/8"
                    onClick={() => handleStrikeTap(ce)}
                    title="Tap to load CE chart"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold text-green-400">
                        {ce ? `${ce.strike} CE` : '— CE'}
                      </span>
                      <span className="text-[8px] text-[#22C55E] font-mono">BUY</span>
                    </div>
                    <div className="text-[11px] font-bold font-mono text-zinc-200 mb-1.5">
                      ₹{ce?.last_price?.toFixed(2) ?? '—'}
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[7px]">
                      <span className="text-zinc-600">Δ Delta</span>
                      <span className="text-zinc-300 text-right">{ce?.delta?.toFixed(3) ?? '—'}</span>
                      <span className="text-zinc-600">θ Theta</span>
                      <span className="text-zinc-300 text-right">{ce?.theta?.toFixed(2) ?? '—'}</span>
                      <span className="text-zinc-600">IV</span>
                      <span className="text-zinc-300 text-right">{ce?.iv ?? '—'}%</span>
                    </div>
                  </div>

                  {/* PE Card */}
                  <div
                    className="rounded p-2 cursor-pointer active:scale-[0.98] transition-transform border border-red-500/25 bg-red-500/8"
                    onClick={() => handleStrikeTap(pe)}
                    title="Tap to load PE chart"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold text-red-400">
                        {pe ? `${pe.strike} PE` : '— PE'}
                      </span>
                      <span className="text-[8px] text-red-400 font-mono">BUY</span>
                    </div>
                    <div className="text-[11px] font-bold font-mono text-zinc-200 mb-1.5">
                      ₹{pe?.last_price?.toFixed(2) ?? '—'}
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[7px]">
                      <span className="text-zinc-600">Δ Delta</span>
                      <span className="text-zinc-300 text-right">{pe?.delta?.toFixed(3) ?? '—'}</span>
                      <span className="text-zinc-600">θ Theta</span>
                      <span className="text-zinc-300 text-right">{pe?.theta?.toFixed(2) ?? '—'}</span>
                      <span className="text-zinc-600">IV</span>
                      <span className="text-zinc-300 text-right">{pe?.iv ?? '—'}%</span>
                    </div>
                  </div>
                </div>

                {/* Expiry info */}
                <div className="flex items-center justify-between mt-1 text-[7.5px] text-zinc-600 px-0.5">
                  <span>Expiry: {data.expiry_date}</span>
                  <button
                    onClick={fetchData}
                    disabled={loading}
                    className="text-zinc-600 hover:text-amber-400 transition-colors disabled:opacity-40"
                  >
                    {loading ? '⟳' : '↻ Refresh'}
                  </button>
                </div>
              </div>

              {/* ── Reality Check (collapsible) ──────────────────── */}
              <div className="rounded border border-yellow-500/20 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[8px] text-yellow-500/80 hover:bg-yellow-500/5 transition-colors"
                  onClick={() => setRcOpen(v => !v)}
                >
                  <span className="font-bold uppercase tracking-wider">Reality Check</span>
                  <span>{rcOpen ? '▲' : '▼'}</span>
                </button>
                {rcOpen && (
                  <div className="px-2 pb-2 text-[8px] text-zinc-500 space-y-1">
                    <p>✓ Expiry day last 1 hour mein volatility badhti hai — yeh sahi hai.</p>
                    <p className="text-yellow-500/70">✗ ₹800 capital aur 1:150 RR claim bahut unrealistic hai.</p>
                    <p className="text-yellow-500/70">✗ Actual mein brokerage, slippage aur gap risk hota hai.</p>
                    <p>✓ Gamma blast hota hai, lekin har expiry pe itna clean nahi milta.</p>
                    <p className="text-zinc-600 pt-0.5 border-t border-zinc-800">
                      Summary: Sensex Expiry day ke last 50 min ka high-volatility option buying setup hai. Trade with caution.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
