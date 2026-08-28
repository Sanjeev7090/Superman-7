import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

// ── Static full 16-row matrix for display ──────────────────────────────────
const MATRIX_ROWS = [
  { id:1,  gift:'+80 ya zyada',    fii:'Buying',        close:'Strong',        preopen:'Buy heavy',   prediction:'Strong Gap Up',       pts:'+100 to +160 pts', prob:'84-87%', color:'#22c55e' },
  { id:2,  gift:'+80 ya zyada',    fii:'Buying',        close:'Strong',        preopen:'Sell / Mixed',prediction:'Mild-Strong Gap Up',  pts:'+70 to +130 pts',  prob:'75-78%', color:'#4ade80' },
  { id:3,  gift:'+80 ya zyada',    fii:'Buying',        close:'Weak / Neutral',preopen:'Buy heavy',   prediction:'Mild-Strong Gap Up',  pts:'+70 to +120 pts',  prob:'76-80%', color:'#4ade80' },
  { id:4,  gift:'+80 ya zyada',    fii:'Selling',       close:'Strong',        preopen:'Buy heavy',   prediction:'Mild Gap Up',          pts:'+50 to +100 pts',  prob:'72-75%', color:'#86efac' },
  { id:5,  gift:'+80 ya zyada',    fii:'Selling',       close:'Weak',          preopen:'Sell heavy',  prediction:'Flat to Mild Up',      pts:'+20 to +60 pts',   prob:'68-72%', color:'#94a3b8' },
  { id:6,  gift:'+40 to +80',      fii:'Buying',        close:'Strong',        preopen:'Buy heavy',   prediction:'Mild Gap Up',          pts:'+50 to +100 pts',  prob:'75-78%', color:'#86efac' },
  { id:7,  gift:'+40 to +80',      fii:'Buying',        close:'Weak',          preopen:'Mixed / Sell',prediction:'Flat to Mild Up',     pts:'+20 to +50 pts',   prob:'70-73%', color:'#94a3b8' },
  { id:8,  gift:'+40 to +80',      fii:'Selling',       close:'Any',           preopen:'Any',         prediction:'Flat',                 pts:'-20 to +40 pts',   prob:'73-76%', color:'#64748b' },
  { id:9,  gift:'-40 to +40',      fii:'Strong Buying', close:'Strong',        preopen:'Buy heavy',   prediction:'Mild Gap Up / Flat',   pts:'+10 to +50 pts',   prob:'72-75%', color:'#86efac' },
  { id:10, gift:'-40 to +40',      fii:'Strong Selling',close:'Weak',          preopen:'Sell heavy',  prediction:'Mild Gap Down / Flat', pts:'-50 to +10 pts',   prob:'72-75%', color:'#fca5a5' },
  { id:11, gift:'-40 to +40',      fii:'Mixed',         close:'Any',           preopen:'Any',         prediction:'Flat',                 pts:'-30 to +30 pts',   prob:'75%+',   color:'#64748b' },
  { id:12, gift:'-40 to -80',      fii:'Selling',       close:'Weak',          preopen:'Sell heavy',  prediction:'Mild Gap Down',        pts:'-50 to -110 pts',  prob:'74-78%', color:'#fca5a5' },
  { id:13, gift:'-40 to -80',      fii:'Buying',        close:'Strong',        preopen:'Buy heavy',   prediction:'Flat to Mild Down',    pts:'-40 to +20 pts',   prob:'70-73%', color:'#94a3b8' },
  { id:14, gift:'-80 ya zyada kam',fii:'Selling',       close:'Weak',          preopen:'Sell heavy',  prediction:'Strong Gap Down',      pts:'-90 to -160 pts',  prob:'82-85%', color:'#ef4444' },
  { id:15, gift:'-80 ya zyada kam',fii:'Selling',       close:'Strong',        preopen:'Mixed / Buy', prediction:'Mild-Strong Gap Down', pts:'-70 to -130 pts',  prob:'75-78%', color:'#fca5a5' },
  { id:16, gift:'-80 ya zyada kam',fii:'Buying',        close:'Strong',        preopen:'Buy heavy',   prediction:'Mild Gap Down',        pts:'-40 to -90 pts',   prob:'72-75%', color:'#fca5a5' },
];

const CLOSE_CAT_LABEL = {
  strong:  { label: 'Strong',  color: '#22c55e' },
  neutral: { label: 'Neutral', color: '#94a3b8' },
  weak:    { label: 'Weak',    color: '#ef4444' },
};

const FII_CAT_LABEL = {
  strong_buying:  { label: 'Strong Buying',  color: '#22c55e' },
  buying:         { label: 'Buying',         color: '#4ade80' },
  mixed:          { label: 'Mixed',          color: '#94a3b8' },
  selling:        { label: 'Selling',        color: '#fca5a5' },
  strong_selling: { label: 'Strong Selling', color: '#ef4444' },
};

function SignalBadge({ label, color }) {
  return (
    <span className="px-2 py-0.5 rounded text-[9px] font-bold inline-block"
      style={{ background: `${color}22`, color }}>
      {label}
    </span>
  );
}

// ── Market Status Pill ──────────────────────────────────────────────────────
function MarketStatusPill({ isOpen, date, day, predFor }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[9px] font-mono" style={{ color: '#64748b' }}>
        {day} {date}
      </span>
      <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded tracking-widest"
        style={isOpen
          ? { background: 'rgba(34,197,94,0.15)',  color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)'  }
          : { background: 'rgba(239,68,68,0.12)',  color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }
        }>
        {isOpen ? 'OPEN' : 'CLOSED'}
      </span>
      {predFor !== 'Today' && (
        <span className="text-[8px]" style={{ color: '#fbbf24', fontWeight: 700 }}>
          → Next: {predFor}
        </span>
      )}
    </div>
  );
}

export function GapPredictionSection({ C, isDark }) {
  const [open,       setOpen]       = useState(false);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);

  const load = useCallback(async (force = false) => {
    if (loading) return;
    if (data && !force) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/market-intel/gap-prediction`);
      setData(res.data);
    } catch {
      setData({ error: true });
    } finally {
      setLoading(false);
    }
  }, [data, loading]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => load(true), 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [open, load]);

  const pred      = data?.prediction   || {};
  const preopen   = data?.preopen      || {};
  const matchId   = pred?.row_id;
  const isOpen    = data?.market_open  ?? false;
  const todayDate = data?.today_date   ?? '';
  const todayDay  = data?.today_day    ?? '';
  const predFor   = data?.prediction_for ?? 'Today';

  const closeInfo = CLOSE_CAT_LABEL[data?.close_cat] || { label: data?.close_cat || '—', color: '#94a3b8' };
  const fiiInfo   = FII_CAT_LABEL[pred?.fii_cat]     || { label: data?.fii_direction || '—', color: '#94a3b8' };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 transition-all"
        style={{ background: C.cardBg }}
        onClick={handleToggle}
        data-testid="gap-prediction-toggle"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px]">📊</span>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textPrimary }}>
            Gap Up / Gap Down Prediction
          </span>
          {data ? (
            <MarketStatusPill isOpen={isOpen} date={todayDate} day={todayDay} predFor={predFor} />
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
              Live System
            </span>
          )}
          {pred?.prediction && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: `${pred.color}22`, color: pred.color }}>
              {pred.prediction}
            </span>
          )}
        </div>
        <span className="text-[10px] shrink-0" style={{
          color: C.textMuted,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          display: 'inline-block', transition: 'transform 0.2s',
        }}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-4" style={{ background: C.panelBg }}>

          {loading && !data && (
            <div className="text-[9px] py-4 text-center" style={{ color: C.textMuted }}>
              Live data calculate ho raha hai...
            </div>
          )}

          {data && !data.error && (
            <>
              {/* ── MARKET CLOSED Banner ─────────────────────────────── */}
              {!isOpen && (
                <div className="rounded-lg px-3 py-2 flex items-center gap-2"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <span style={{ fontSize: 14 }}>🔴</span>
                  <div>
                    <div className="text-[10px] font-extrabold tracking-widest" style={{ color: '#f87171' }}>
                      MARKET CLOSED
                    </div>
                    <div className="text-[9px]" style={{ color: '#94a3b8' }}>
                      {todayDay} {todayDate} · Prediction for{' '}
                      <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                        {predFor === 'Today' ? 'Today' : `Next Trading Day: ${predFor}`}
                      </span>{' '}
                      based on last session's data
                    </div>
                  </div>
                </div>
              )}

              {/* ── MARKET OPEN Banner ───────────────────────────────── */}
              {isOpen && (
                <div className="rounded-lg px-3 py-2 flex items-center gap-2"
                  style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.22)' }}>
                  <span style={{ fontSize: 12 }}>🟢</span>
                  <div className="text-[9px]" style={{ color: '#86efac' }}>
                    <span className="font-bold">Market Open</span> · {todayDay} {todayDate} ·
                    Prediction live — based on last session close + GIFT Nifty
                  </div>
                </div>
              )}

              {/* ── Live Input Values Card ─────────────────────────────── */}
              <div>
                <div className="text-[9px] uppercase tracking-widest font-bold mb-2" style={{ color: C.textMuted }}>
                  Core Logic — Live Values
                </div>
                <div className="grid grid-cols-2 gap-2">

                  {/* 1. GIFT Nifty vs Prev Close */}
                  <div className="rounded-lg p-2.5" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                    <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>
                      1 · GIFT Nifty vs Prev Close
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black font-mono"
                        style={{ color: (data.gift_vs_prev || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                        {(data.gift_vs_prev || 0) >= 0 ? '+' : ''}{Math.round(data.gift_vs_prev || 0)}
                      </span>
                      <span className="text-[9px]" style={{ color: C.textMuted }}>pts</span>
                    </div>
                    <div className="text-[8px] mt-0.5" style={{ color: C.textMuted }}>
                      GIFT {Math.round(data.gift_nifty || 0)} | Prev Close {Math.round(data.prev_close || 0)}
                    </div>
                    <div className="mt-1">
                      <SignalBadge
                        label={
                          pred?.gift_cat === 'gte_80'          ? '+80 ya zyada'      :
                          pred?.gift_cat === '40_to_80'        ? '+40 to +80'        :
                          pred?.gift_cat === 'neg40_to_40'     ? '-40 to +40'        :
                          pred?.gift_cat === 'neg80_to_neg40'  ? '-40 to -80'        :
                          pred?.gift_cat === 'lte_neg80'       ? '-80 ya zyada kam'  : '—'
                        }
                        color={(data.gift_vs_prev || 0) >= 40 ? '#22c55e' : (data.gift_vs_prev || 0) <= -40 ? '#ef4444' : '#94a3b8'}
                      />
                    </div>
                  </div>

                  {/* 2. Last Day FII */}
                  <div className="rounded-lg p-2.5" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                    <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>
                      2 · Last Day FII
                    </div>
                    <div className="text-sm font-bold" style={{ color: fiiInfo.color }}>
                      {data.fii_direction || '—'}
                    </div>
                    <div className="text-[8px] mt-0.5 font-mono" style={{ color: C.textMuted }}>
                      Net: {(data.fii_net || 0) > 0 ? '+' : ''}{(data.fii_net || 0).toLocaleString('en-IN')} contracts
                    </div>
                    <div className="mt-1">
                      <SignalBadge label={fiiInfo.label} color={fiiInfo.color} />
                    </div>
                  </div>

                  {/* 3. Prev Day Close Strength */}
                  <div className="rounded-lg p-2.5" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                    <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>
                      3 · Prev Day Close Strength
                    </div>
                    <div className="text-sm font-bold" style={{ color: closeInfo.color }}>
                      {closeInfo.label}
                    </div>
                    <div className="text-[8px] mt-0.5 font-mono" style={{ color: C.textMuted }}>
                      Ratio: {((data.close_ratio || 0.5) * 100).toFixed(0)}% of range
                    </div>
                    <div className="text-[8px]" style={{ color: C.textMuted }}>
                      H:{Math.round(data.prev_high || 0)} L:{Math.round(data.prev_low || 0)} C:{Math.round(data.prev_close || 0)}
                    </div>
                    <div className="mt-1">
                      <SignalBadge label={closeInfo.label} color={closeInfo.color} />
                    </div>
                  </div>

                  {/* 4. Pre-open Imbalance */}
                  <div className="rounded-lg p-2.5" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                    <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>
                      4 · Pre-open Imbalance
                    </div>
                    <div className="text-sm font-bold"
                      style={{ color: preopen.raw === 'buy_heavy' ? '#22c55e' : preopen.raw === 'sell_heavy' ? '#ef4444' : '#94a3b8' }}>
                      {preopen.label || '—'}
                    </div>
                    <div className="text-[8px] mt-0.5" style={{ color: C.textMuted }}>{preopen.session || ''}</div>
                    <div className="text-[8px]" style={{ color: C.textMuted }}>
                      Via: {preopen.derived_from || 'GIFT Nifty Premium'}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Final Prediction Card ──────────────────────────────── */}
              <div className="rounded-xl p-4 space-y-2"
                style={{ background: `${pred.color}12`, border: `2px solid ${pred.color}40` }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: C.textMuted }}>
                      Final Prediction
                    </span>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
                      Next Trading Day · {predFor === 'Today' ? todayDate : predFor}
                    </span>
                  </div>
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(100,116,139,0.15)', color: C.textMuted }}>
                    Row #{matchId}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-xl font-black" style={{ color: pred.color }}>
                    {pred.prediction}
                  </div>
                  {!isOpen && (
                    <span className="text-[9px] px-2 py-0.5 rounded font-bold"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                      Last Close
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <div className="text-[8px] uppercase tracking-widest" style={{ color: C.textMuted }}>Expected Points</div>
                    <div className="text-base font-bold font-mono" style={{ color: pred.color }}>{pred.pts_label}</div>
                  </div>
                  <div>
                    <div className="text-[8px] uppercase tracking-widest" style={{ color: C.textMuted }}>Probability</div>
                    <div className="text-base font-bold" style={{ color: pred.color }}>{pred.prob}</div>
                  </div>
                </div>
                {pred.vix_adjusted && (
                  <div className="rounded-lg px-2.5 py-1.5 text-[9px]"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
                    ⚠️ {pred.vix_note}
                  </div>
                )}
              </div>

              {/* ── Full 16-Row Matrix (collapsible) ─────────────────── */}
              <div>
                <button
                  className="w-full flex items-center justify-between py-1.5 px-1 rounded"
                  onClick={() => setShowMatrix(v => !v)}
                  style={{ color: C.textMuted }}
                >
                  <span className="text-[9px] font-bold uppercase tracking-widest">
                    Final Decision Matrix (16 rows)
                  </span>
                  <span className="text-[9px]">{showMatrix ? '▲ Hide' : '▼ Show'}</span>
                </button>

                {showMatrix && (
                  <div className="rounded-lg overflow-hidden mt-1" style={{ border: `1px solid ${C.border}` }}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[9px]">
                        <thead>
                          <tr style={{ background: C.tableBg }}>
                            {['#','GIFT vs Prev','FII','Close Strength','Pre-open','Prediction','Points','Prob'].map(h => (
                              <th key={h} className="px-2 py-1.5 text-left font-bold uppercase tracking-widest whitespace-nowrap"
                                style={{ color: C.textMuted }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {MATRIX_ROWS.map((row) => {
                            const isActive = row.id === matchId;
                            return (
                              <tr key={row.id} style={{
                                borderTop: `1px solid ${C.borderSubtle}`,
                                background: isActive ? `${row.color}20` : 'transparent',
                                fontWeight: isActive ? 700 : 400,
                              }}>
                                <td className="px-2 py-1.5 font-mono text-center"
                                  style={{ color: isActive ? row.color : C.textMuted }}>
                                  {isActive ? '▶' : row.id}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-mono" style={{ color: C.textSecond }}>{row.gift}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: C.textSecond }}>{row.fii}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: C.textSecond }}>{row.close}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: C.textSecond }}>{row.preopen}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-semibold" style={{ color: row.color }}>{row.prediction}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-mono" style={{ color: row.color }}>{row.pts}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: C.textSecond }}>{row.prob}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Updated at */}
              {data.updated_at && (
                <div className="text-[8px] text-right" style={{ color: C.textMuted }}>
                  Updated: {new Date(data.updated_at).toLocaleTimeString('en-IN')}
                  {' '}·{' '}
                  <button className="underline" onClick={() => load(true)} style={{ color: C.textMuted }}>
                    Refresh
                  </button>
                </div>
              )}
            </>
          )}

          {data?.error && (
            <div className="text-[9px] py-3 text-center rounded-lg"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              Data load nahi hua. Refresh try karo.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
