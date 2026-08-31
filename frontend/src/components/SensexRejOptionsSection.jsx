import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── REJ detection helpers — identical to NiftyRejOptionsSection ──────────────
function resampleBars(bars, targetMinutes) {
  if (!bars || !bars.length || !targetMinutes) return bars || [];
  const ms = targetMinutes * 60 * 1000;
  const out = [];
  let bucket = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const bStart = Math.floor(b.timestamp / ms) * ms;
    if (!bucket || bucket.timestamp !== bStart) {
      if (bucket) out.push(bucket);
      bucket = { timestamp: bStart, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
    } else {
      bucket.high   = Math.max(bucket.high, b.high);
      bucket.low    = Math.min(bucket.low,  b.low);
      bucket.close  = b.close;
      bucket.volume = (bucket.volume || 0) + (b.volume || 0);
    }
  }
  if (bucket) out.push(bucket);
  return out;
}
const _bod = b => Math.abs(b.close - b.open);
const _rng = b => b.high - b.low;
const _uw  = b => b.high - Math.max(b.open, b.close);
const _lw  = b => Math.min(b.open, b.close) - b.low;

function detect15mRej(bars15) {
  if (!bars15 || bars15.length < 3) return null;
  const start = Math.max(1, bars15.length - 8);
  for (let i = bars15.length - 1; i >= start; i--) {
    const b = bars15[i]; const r = _rng(b); if (r <= 0) continue;
    const bod = _bod(b); const uw = _uw(b); const lw = _lw(b); const sw = 1.5;
    if (lw >= sw * bod && lw >= 0.55 * r && uw <= bod * 1.1)
      return { type: 'BUY',  bar: b, idx: i, extreme: b.low,  rejectionHigh: b.high, rejectionLow: b.low,  time: b.timestamp / 1000, name: '15m Hammer / Lower Wick Rejection' };
    if (uw >= sw * bod && uw >= 0.55 * r && lw <= bod * 1.1)
      return { type: 'SELL', bar: b, idx: i, extreme: b.high, rejectionHigh: b.high, rejectionLow: b.low,  time: b.timestamp / 1000, name: '15m Shooting Star / Upper Wick Rejection' };
  }
  return null;
}
function _confirmWin(wb, type) {
  const lim = Math.min(wb.length, 20);
  for (let i = 0; i < lim; i++) {
    const b = wb[i]; const r = _rng(b); if (r <= 0) continue;
    const bod = _bod(b); const br = bod / r; if (br < 0.55) continue;
    if (type === 'BUY'  && b.close > b.open && _uw(b) <= bod * 0.6) return { bar: b, time: b.timestamp / 1000, entry: b.close };
    if (type === 'SELL' && b.close < b.open && _lw(b) <= bod * 0.6) return { bar: b, time: b.timestamp / 1000, entry: b.close };
  }
  return null;
}
// ── Same find1mConfirm as Nifty ───────────────────────────────────────────────
function find1mConfirm(bars1m, rej) {
  if (!bars1m?.length || !rej) return null;
  const rejEnd = rej.bar.timestamp + 15 * 60 * 1000;
  const after  = bars1m.filter(b => b.timestamp >= rejEnd);
  return _confirmWin(after.length ? after : bars1m.filter(b => b.timestamp > rej.bar.timestamp), rej.type);
}
// ── Same detectREJSignal as Nifty (identical parameters) ─────────────────────
function detectREJSignal(bars) {
  if (!bars || bars.length < 10) return null;
  const bars15  = resampleBars(bars, 15);
  const rej     = detect15mRej(bars15);
  if (!rej) return null;
  const confirm = find1mConfirm(bars, rej);
  if (!confirm) {
    const entry = rej.bar.close;
    const sl    = rej.type === 'BUY' ? rej.extreme * 0.9995 : rej.extreme * 1.0005;
    const risk  = Math.abs(entry - sl);
    return { status: 'PENDING', type: rej.type, rejection: rej, confirm: null, entry, sl, target: rej.type === 'BUY' ? entry + risk * 2 : entry - risk * 2, rr: 2 };
  }
  const entry = confirm.entry;
  const sl    = rej.type === 'BUY' ? rej.extreme * 0.9995 : rej.extreme * 1.0005;
  const risk  = Math.abs(entry - sl);
  if (risk <= 0) return null;
  return { status: 'CONFIRMED', type: rej.type, rejection: rej, confirm, entry, sl, target: rej.type === 'BUY' ? entry + risk * 2 : entry - risk * 2, rr: 2 };
}

// ── Flow Criteria — same display style as Nifty (no strict mode) ─────────────
const SIG_COL = s => s === 'STRONG' ? '#22c55e' : s === 'PARTIAL' ? '#fbbf24' : '#94a3b8';

const WEIGHT_COLOR = w => w === 'Mandatory' ? '#f59e0b' : w === 'High' ? '#a78bfa' : '#64748b';

function CriteriaRow({ item }) {
  const { pass, label, detail, weight } = item;
  return (
    <div className="flex items-start gap-1 py-[2px]">
      <span className="text-[8px] font-bold shrink-0 mt-px w-2.5 text-center" style={{ color: pass ? '#22c55e' : '#ef4444' }}>
        {pass ? '✓' : '✗'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <div className="text-[7.5px] font-semibold leading-tight truncate" style={{ color: pass ? '#d1fae5' : '#fca5a5' }}>
            {label}
          </div>
          {weight && (
            <span className="text-[5.5px] font-bold uppercase shrink-0 px-[3px] py-px rounded"
              style={{ background: `${WEIGHT_COLOR(weight)}18`, color: WEIGHT_COLOR(weight), letterSpacing: '0.04em' }}>
              {weight === 'Mandatory' ? 'MUST' : weight}
            </span>
          )}
        </div>
        <div className="text-[6.5px] leading-tight text-zinc-600 truncate" title={detail}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function FlowSidePanel({ data, side, isRec }) {
  const col   = side === 'CALL' ? '#22c55e' : '#ef4444';
  const crit  = Object.values(data.criteria);
  const total = crit.length;
  return (
    <div className="flex-1 rounded border px-2 py-1.5 min-w-0"
      style={{
        borderColor: isRec ? `${col}50` : 'rgba(255,255,255,0.07)',
        background:  isRec ? `${col}08`  : 'transparent',
      }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: col }}>
          {side} BUY
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-bold" style={{ color: SIG_COL(data.signal) }}>
            [{data.score}/{total}]
          </span>
          <span className="text-[6.5px] font-bold px-1 rounded"
            style={{ background: `${SIG_COL(data.signal)}20`, color: SIG_COL(data.signal) }}>
            {data.signal}
          </span>
        </div>
      </div>
      <div className="divide-y divide-zinc-800/30">
        {crit.map((item, i) => <CriteriaRow key={i} item={item} />)}
      </div>
    </div>
  );
}

function FlowCriteria({ flowData }) {
  if (!flowData) return null;
  const { call_buy, put_buy, recommended, avg_iv, iv_status, total_ce_vol, total_pe_vol } = flowData;
  const recBull = recommended === 'CALL_BUY';
  const recBear = recommended === 'PUT_BUY';
  return (
    <div className="space-y-1.5">
      {/* IV + Vol strip — same as Nifty */}
      <div className="flex items-center gap-3 px-1 text-[8px]">
        <span className="text-zinc-600 uppercase tracking-wider">Flow:</span>
        <span className="text-zinc-400">ATM IV <span className="font-bold text-zinc-200">{avg_iv}%</span> <span className="text-zinc-500">{iv_status}</span></span>
        <span className="text-zinc-400">CE Vol <span style={{ color: '#22c55e' }}>{(total_ce_vol / 1000).toFixed(0)}K</span></span>
        <span className="text-zinc-400">PE Vol <span style={{ color: '#ef4444' }}>{(total_pe_vol / 1000).toFixed(0)}K</span></span>
      </div>
      {/* Recommended banner */}
      {recommended !== 'NEUTRAL' && (
        <div className="rounded px-2 py-1 text-[8px] font-bold flex items-center gap-1.5"
          style={{
            background: recBull ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
            border: recBull ? '1px solid rgba(34,197,94,0.30)' : '1px solid rgba(239,68,68,0.30)',
            color: recBull ? '#22c55e' : '#ef4444',
          }}>
          ★ Recommended: {recBull ? 'CALL BUY' : 'PUT BUY'}
        </div>
      )}
      {/* Two-column criteria */}
      <div className="flex gap-1.5">
        <FlowSidePanel data={call_buy} side="CALL" isRec={recBull} />
        <FlowSidePanel data={put_buy}  side="PUT"  isRec={recBear} />
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function SensexRejOptionsSection({ onStrikeSelect }) {
  const [collapsed,   setCollapsed]   = useState(false);
  const [signal,      setSignal]      = useState(null);
  const [pick,        setPick]        = useState(null);
  const [flowData,    setFlowData]    = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [manualSig,   setManualSig]   = useState(null);
  const timerRef = useRef(null);

  const fetchSignalAndPick = useCallback(async (override = null) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch SENSEX 1-min bars + flow data in parallel
      const [barsRes, flowRes] = await Promise.allSettled([
        fetch(`${API}/stock/bars/%5EBSESN?timespan=minute&multiplier=1&limit=200`),
        fetch(`${API}/rej/sensex-option-flow`),
      ]);

      const bars = barsRes.status === 'fulfilled'
        ? ((await barsRes.value.json())?.bars || [])
        : [];

      if (flowRes.status === 'fulfilled' && flowRes.value.ok) {
        const fd = await flowRes.value.json();
        setFlowData(fd);
      }

      // 2. Detect REJ signal (or use manual override) — same as Nifty
      let sig = null;
      if (override) {
        const lastBar = bars[bars.length - 1];
        const spot    = lastBar?.close || 82000;
        const slDist  = spot * 0.003;
        sig = {
          type: override, status: 'MANUAL',
          entry:  spot,
          sl:     override === 'BUY' ? spot - slDist : spot + slDist,
          target: override === 'BUY' ? spot + slDist * 2 : spot - slDist * 2,
          rejection: { name: 'Manual Override', rejectionHigh: spot, rejectionLow: spot - slDist },
        };
      } else {
        sig = detectREJSignal(bars);
      }

      setSignal(sig);
      if (!sig) { setPick(null); setLoading(false); setLastUpdated(new Date()); return; }

      // 3. Fetch option pick — same flow as Nifty
      const pickRes = await fetch(`${API}/rej/sensex-option-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: sig.type,
          entry:  sig.entry,
          sl:     sig.sl,
          target: sig.target,
          symbol: 'SENSEX',
        }),
      });
      const pickData = await pickRes.json();
      setPick(pickData);
      setLastUpdated(new Date());
    } catch (e) {
      setError('Fetch failed — SENSEX data error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 3 minutes
  useEffect(() => {
    fetchSignalAndPick(manualSig);
    timerRef.current = setInterval(() => fetchSignalAndPick(manualSig), 3 * 60 * 1000);
    return () => clearInterval(timerRef.current);
  }, [fetchSignalAndPick, manualSig]);

  const handleManual = (type) => {
    const next = manualSig === type ? null : type;
    setManualSig(next);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const sigType   = signal?.type || pick?.signal_type;
  const isBuy     = sigType === 'BUY';
  const accentCol = isBuy ? '#22c55e' : '#ef4444';
  const sideLbl   = isBuy ? 'CE' : 'PE';
  const top       = pick?.top_picks || [];
  const rr        = pick?.rr_info;
  const best      = top[0];

  const handleStrikeTap = (t) => {
    if (!onStrikeSelect || !pick) return;
    onStrikeSelect({
      underlying:      pick.symbol || 'SENSEX',
      strike:          t.strike,
      type:            t.type,
      expiry:          pick.expiry || '',
      expiry_display:  pick.expiry || '',
      last_price:      t.last_price,
      change_pct:      0,
      instrument:      `${pick.symbol || 'SENSEX'} ${t.strike} ${t.type === 'CE' ? 'Call' : 'Put'}`,
      is_live_derived: true,
      is_equity:       false,
    });
  };

  return (
    <div className="border-t border-zinc-800/60">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            Sensex · REJ Option Picks
          </span>
          {sigType && !loading && (
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm ${isBuy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {sigType}
            </span>
          )}
          {signal?.status === 'CONFIRMED' && (
            <span className="text-[8px] px-1 bg-cyan-500/20 text-cyan-400 rounded-sm">CONFIRMED</span>
          )}
          {signal?.status === 'PENDING' && (
            <span className="text-[8px] px-1 bg-yellow-500/20 text-yellow-400 rounded-sm">PENDING</span>
          )}
          {signal?.status === 'MANUAL' && (
            <span className="text-[8px] px-1 bg-purple-500/20 text-purple-400 rounded-sm">MANUAL</span>
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
        <div className="px-3 pb-3 space-y-2">
          {/* Manual signal override — same as Nifty */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[8px] text-zinc-600 uppercase tracking-wider">Manual Override:</span>
            <button
              onClick={() => handleManual('BUY')}
              className={`px-2 py-0.5 text-[8px] font-bold rounded transition-all border ${manualSig === 'BUY' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'text-zinc-500 border-zinc-700 hover:border-green-500/30'}`}
            >▲ CALL</button>
            <button
              onClick={() => handleManual('SELL')}
              className={`px-2 py-0.5 text-[8px] font-bold rounded transition-all border ${manualSig === 'SELL' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'text-zinc-500 border-zinc-700 hover:border-red-500/30'}`}
            >▼ PUT</button>
            <button
              onClick={() => fetchSignalAndPick(manualSig)}
              disabled={loading}
              className="ml-auto px-2 py-0.5 text-[8px] text-zinc-400 border border-zinc-700 hover:border-cyan-500/40 hover:text-cyan-400 rounded transition-all disabled:opacity-40"
            >{loading ? '⟳' : '↻ Refresh'}</button>
          </div>

          {flowData?.is_real_oi && pick && (
            <div className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-[8px]"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <span className="font-bold text-green-400">LIVE OI</span>
              <span className="text-zinc-400">CE OI: <span className="text-white font-mono font-semibold">{((flowData.total_ce_oi||0)/1e5).toFixed(1)}L</span></span>
              <span className="text-zinc-400">PE OI: <span className="text-white font-mono font-semibold">{((flowData.total_pe_oi||0)/1e5).toFixed(1)}L</span></span>
              <span className="text-zinc-400">PCR-OI: <span className={`font-bold ${flowData.pcr_oi < 1 ? 'text-green-400' : 'text-red-400'}`}>{flowData.pcr_oi}</span></span>
            </div>
          )}
          {!flowData?.is_real_oi && pick && (
            <div className="text-[8px] text-zinc-600 px-1">
              OI: BS-derived (BSE API unavailable)
            </div>
          )}
          {loading && (
            <div className="text-[10px] text-zinc-500 py-2 text-center animate-pulse">
              ⟳ Fetching SENSEX bars + option chain…
            </div>
          )}

          {/* Flow Criteria — always show when available */}
          {!loading && flowData && (
            <FlowCriteria flowData={flowData} />
          )}

          {/* Error */}
          {!loading && error && (
            <div className="text-[10px] text-yellow-400 bg-yellow-500/10 rounded px-2 py-1.5">{error}</div>
          )}

          {/* No signal */}
          {!loading && !error && !signal && (
            <div className="text-[10px] text-zinc-500 py-2">
              No REJ setup detected on SENSEX 1m chart.
              <br />
              <span className="text-zinc-600">Use Manual Override above to get option picks for BUY or SELL.</span>
            </div>
          )}

          {/* Signal found */}
          {!loading && signal && (
            <>
              {/* Signal info bar */}
              <div className="rounded border px-2 py-1.5 text-[9px] font-mono"
                style={{ borderColor: `${accentCol}40`, background: `${accentCol}0d` }}>
                <div className="flex justify-between items-center">
                  <span style={{ color: accentCol }} className="font-bold">
                    {signal.type} · {signal.status}
                  </span>
                </div>
                <div className="flex gap-3 mt-1 text-[8px]">
                  <span className="text-zinc-400">Entry <span style={{ color: accentCol }}>₹{signal.entry?.toFixed(0)}</span></span>
                  <span className="text-zinc-400">SL <span className="text-red-400">₹{signal.sl?.toFixed(0)}</span></span>
                  <span className="text-zinc-400">TGT <span className="text-green-400">₹{signal.target?.toFixed(0)}</span></span>
                </div>
              </div>

              {/* Option pick card — always shown (no strict gate) */}
              {pick && (
                <div className="rounded border" style={{ borderColor: `${accentCol}33` }}>
                  {/* Header row */}
                  <div className="flex items-center justify-between px-2 py-1.5 border-b" style={{ borderColor: `${accentCol}22` }}>
                    <span className="text-[9px] font-bold" style={{ color: accentCol }}>
                      SENSEX {sideLbl} PICKS
                    </span>
                    <span className="text-[8px] text-zinc-500">
                      Spot ₹{pick.spot} · {pick.expiry} · DTE {pick.T_days}d
                    </span>
                  </div>

                  <div className="p-2 space-y-1.5">
                    {top.length === 0 && (
                      <div className="text-[9px] text-yellow-400 py-1">
                        ⚠ No {sideLbl} strikes passed filter (Δ/γ/OI/θ criteria)
                      </div>
                    )}

                    {/* Best pick */}
                    {best && (
                      <div
                        className="rounded p-2 cursor-pointer active:scale-[0.98] transition-transform"
                        style={{ background: `${accentCol}12`, border: `1px solid ${accentCol}30` }}
                        onClick={() => handleStrikeTap(best)}
                        title="Tap to load chart"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold" style={{ color: accentCol }}>
                            ★ {best.strike} {sideLbl}
                          </span>
                          <span className="text-[10px] text-zinc-300 font-mono">₹{best.last_price}</span>
                        </div>

                        {/* Greeks grid */}
                        <div className="grid grid-cols-4 gap-1 mb-1.5">
                          {[['Δ Delta', best.delta], ['γ Gamma', best.gamma], ['ν Vega', best.vega], ['θ Theta', best.theta]].map(([lbl, val]) => (
                            <div key={lbl} className="text-center">
                              <div className="text-[7px] text-zinc-600 leading-tight">{lbl}</div>
                              <div className="text-[9px] font-bold text-zinc-200">{val}</div>
                            </div>
                          ))}
                        </div>

                        {/* OI + IV */}
                        <div className="flex gap-3 text-[8px] text-zinc-500 mb-2">
                          <span>OI <span className="text-zinc-300">{best.oi_lakh}L</span></span>
                          <span>IV <span className="text-zinc-300">{best.iv_pct}%</span></span>
                        </div>

                        {/* Entry / SL / Target on option */}
                        {rr && (
                          <div className="grid grid-cols-3 gap-1 text-center text-[8px] pt-1.5 border-t border-zinc-700/50">
                            <div>
                              <div className="text-zinc-600 text-[7px]">Entry</div>
                              <div style={{ color: accentCol }} className="font-bold">₹{rr.opt_entry}</div>
                            </div>
                            <div>
                              <div className="text-zinc-600 text-[7px]">SL</div>
                              <div className="text-red-400 font-bold">₹{rr.opt_sl}</div>
                            </div>
                            <div>
                              <div className="text-zinc-600 text-[7px]">Target</div>
                              <div className="text-green-400 font-bold">₹{rr.opt_target}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Other picks compact table */}
                    {top.length > 1 && (
                      <div>
                        <div className="text-[7.5px] text-zinc-600 uppercase tracking-wider mb-1 px-0.5">
                          Other Qualifying Strikes
                        </div>
                        <div className="space-y-0.5">
                          {top.slice(1).map((t, i) => (
                            <div
                              key={i}
                              className="flex justify-between text-[8px] text-zinc-500 py-0.5 border-b border-zinc-800/60 last:border-0 cursor-pointer hover:bg-white/5 px-1 rounded transition-colors"
                              onClick={() => handleStrikeTap(t)}
                              title="Tap to load chart"
                            >
                              <span className="text-zinc-300 font-mono w-20">{t.strike} {sideLbl}</span>
                              <span className="font-mono">₹{t.last_price}</span>
                              <span className="text-zinc-400">Δ{t.delta}</span>
                              <span className="text-zinc-400">γ{t.gamma}</span>
                              <span className="text-zinc-400">{t.oi_lakh}L</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Filter summary — same format as Nifty */}
                    <div className="text-[7.5px] text-zinc-700 pt-1 leading-relaxed">
                      Priority: OI▼ → Δ → γ · Filter: {isBuy ? 'Δ≥0.80' : 'Δ≤−0.80'} · γ≥0.0005 · OI≥1L · θ{">"}-12
                      {' · '}{pick.candidates_count} candidates
                      {pick.tier && pick.tier !== 'strict' && (
                        <span className="text-yellow-500 ml-1">[{pick.tier}]</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
