import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── REJ detection helpers (same logic as ChartPanel) ────────────────────────
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
      bucket.high = Math.max(bucket.high, b.high);
      bucket.low  = Math.min(bucket.low,  b.low);
      bucket.close = b.close;
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
function find1mConfirm(bars1m, rej) {
  if (!bars1m?.length || !rej) return null;
  const rejEnd = rej.bar.timestamp + 15 * 60 * 1000;
  const after = bars1m.filter(b => b.timestamp >= rejEnd);
  return _confirmWin(after.length ? after : bars1m.filter(b => b.timestamp > rej.bar.timestamp), rej.type);
}
function detectREJSignal(bars) {
  if (!bars || bars.length < 10) return null;
  const bars15 = resampleBars(bars, 15);
  const rej = detect15mRej(bars15);
  if (!rej) return null;
  const confirm = find1mConfirm(bars, rej);
  if (!confirm) {
    const entry = rej.bar.close;
    const sl = rej.type === 'BUY' ? rej.extreme * 0.9995 : rej.extreme * 1.0005;
    const risk = Math.abs(entry - sl);
    return { status: 'PENDING', type: rej.type, rejection: rej, confirm: null, entry, sl, target: rej.type === 'BUY' ? entry + risk * 2 : entry - risk * 2, rr: 2 };
  }
  const entry = confirm.entry;
  const sl = rej.type === 'BUY' ? rej.extreme * 0.9995 : rej.extreme * 1.0005;
  const risk = Math.abs(entry - sl);
  if (risk <= 0) return null;
  return { status: 'CONFIRMED', type: rej.type, rejection: rej, confirm, entry, sl, target: rej.type === 'BUY' ? entry + risk * 2 : entry - risk * 2, rr: 2 };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function NiftyRejOptionsSection() {
  const [collapsed, setCollapsed]   = useState(false);
  const [signal,    setSignal]      = useState(null);   // REJ signal from NIFTY bars
  const [pick,      setPick]        = useState(null);   // option pick from API
  const [loading,   setLoading]     = useState(false);
  const [error,     setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [manualSig, setManualSig]   = useState(null);   // 'BUY' | 'SELL' | null (user override)
  const timerRef = useRef(null);

  // ── Fetch NIFTY bars + run REJ detection ────────────────────────
  const fetchSignalAndPick = useCallback(async (override = null) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch NIFTY 1-min bars
      const barsRes = await fetch(`${API}/stock/bars/%5ENSEI?timespan=minute&multiplier=1&limit=200`);
      const barsData = await barsRes.json();
      const bars = barsData?.bars || [];

      // 2. Detect REJ signal (or use manual override)
      let sig = null;
      if (override) {
        // Manual: use last close as entry
        const lastBar = bars[bars.length - 1];
        const spot    = lastBar?.close || 24000;
        const slDist  = spot * 0.003;  // 0.3% SL
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

      // 3. Fetch option pick
      const pickRes = await fetch(`${API}/rej/nifty-option-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: sig.type,
          entry:  sig.entry,
          sl:     sig.sl,
          target: sig.target,
          symbol: 'NIFTY',
        }),
      });
      const pickData = await pickRes.json();
      setPick(pickData);
      setLastUpdated(new Date());
    } catch (e) {
      setError('Fetch failed — NSE ya data error');
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

  // ── Render ───────────────────────────────────────────────────────
  const sigType  = signal?.type || pick?.signal_type;
  const isBuy    = sigType === 'BUY';
  const accentCol = isBuy ? '#22c55e' : '#ef4444';
  const sideLbl   = isBuy ? 'CALL' : 'PUT';
  const top  = pick?.top_picks || [];
  const rr   = pick?.rr_info;
  const best = top[0];

  return (
    <div className="border-b border-white/10">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            Nifty 50 · REJ Option Picks
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
          {/* Manual signal override buttons */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[8px] text-zinc-600 uppercase tracking-wider">Manual Override:</span>
            <button
              onClick={() => handleManual('BUY')}
              className={`px-2 py-0.5 text-[8px] font-bold rounded transition-all border ${manualSig === 'BUY' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'text-zinc-500 border-zinc-700 hover:border-green-500/30'}`}
            >▲ BUY</button>
            <button
              onClick={() => handleManual('SELL')}
              className={`px-2 py-0.5 text-[8px] font-bold rounded transition-all border ${manualSig === 'SELL' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'text-zinc-500 border-zinc-700 hover:border-red-500/30'}`}
            >▼ SELL</button>
            <button
              onClick={() => fetchSignalAndPick(manualSig)}
              disabled={loading}
              className="ml-auto px-2 py-0.5 text-[8px] text-zinc-400 border border-zinc-700 hover:border-cyan-500/40 hover:text-cyan-400 rounded transition-all disabled:opacity-40"
            >{loading ? '⟳' : '↻ Refresh'}</button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-[10px] text-zinc-500 py-2 text-center animate-pulse">
              ⟳ Fetching NIFTY bars + option chain…
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="text-[10px] text-yellow-400 bg-yellow-500/10 rounded px-2 py-1.5">{error}</div>
          )}

          {/* No signal */}
          {!loading && !error && !signal && (
            <div className="text-[10px] text-zinc-500 py-2">
              No REJ setup detected on NIFTY 1m chart.
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
                  <span className="text-zinc-500">
                    {signal.rejection?.name || '15m Rejection'}
                  </span>
                </div>
                <div className="flex gap-3 mt-1 text-[8px]">
                  <span className="text-zinc-400">Entry <span style={{ color: accentCol }}>₹{signal.entry?.toFixed(1)}</span></span>
                  <span className="text-zinc-400">SL <span className="text-red-400">₹{signal.sl?.toFixed(1)}</span></span>
                  <span className="text-zinc-400">TGT <span className="text-green-400">₹{signal.target?.toFixed(1)}</span></span>
                </div>
              </div>

              {/* Option pick card */}
              {pick && (
                <div className="rounded border" style={{ borderColor: `${accentCol}33` }}>
                  {/* Header row */}
                  <div className="flex items-center justify-between px-2 py-1.5 border-b" style={{ borderColor: `${accentCol}22` }}>
                    <span className="text-[9px] font-bold" style={{ color: accentCol }}>
                      NIFTY {sideLbl} PICKS
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
                      <div className="rounded p-2" style={{ background: `${accentCol}12`, border: `1px solid ${accentCol}30` }}>
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
                            <div key={i} className="flex justify-between text-[8px] text-zinc-500 py-0.5 border-b border-zinc-800/60 last:border-0">
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

                    {/* Filter summary */}
                    <div className="text-[7.5px] text-zinc-700 pt-1 leading-relaxed">
                      Priority: OI▼ → Δ → γ · Filter: {isBuy ? 'Δ≥0.80' : 'Δ≤−0.80'} · γ≥0.0005 · OI≥1L · θ>−12
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
