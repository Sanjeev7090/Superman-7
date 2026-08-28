import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Reference Matrix (static, for display only) ──────────────────
const MATRIX_COLS = ['Bias', 'Score', 'Brent', 'VIX', 'GIFT', 'Breadth', 'Exp Pts', 'Action'];
const MATRIX_ROWS = [
  { bias:'Strong Bull',  score:'+8 to +12', brent:'<84',    vix:'<11.5',   gift:'+0.4%+',    bread:'28+',   pts:'+80 to +180',  action:'Aggressive Long / Call', color:'#22c55e' },
  { bias:'Mild Bull',    score:'+4 to +7',  brent:'84–87',  vix:'11.5–13', gift:'+0.2–0.4%', bread:'22–27', pts:'+20 to +120',  action:'Small Long',              color:'#86efac' },
  { bias:'Neutral',      score:'−3 to +3',  brent:'87–91',  vix:'13–14.5', gift:'±0.2%',     bread:'17–22', pts:'−80 to +80',   action:'Range',                   color:'#fbbf24' },
  { bias:'Mild Bear',    score:'−7 to −4',  brent:'91–94',  vix:'14.5–16', gift:'−0.2–0.4%', bread:'12–17', pts:'−40 to −140',  action:'Book / small Put',        color:'#fca5a5' },
  { bias:'Strong Bear',  score:'−12 to −8', brent:'94+',    vix:'16+',     gift:'−0.4%+',    bread:'<12',   pts:'−180 to −350', action:'Hedge / Put / cash',      color:'#ef4444' },
];

export function DoomCard({ C, isDark }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await axios.get(`${API}/doom/score`);
      setData(d);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 300_000); // refresh every 5 min
    return () => clearInterval(t);
  }, [load]);

  if (!data && loading) return (
    <div className="rounded-xl px-4 py-3 text-center text-[10px] animate-pulse"
      style={{ border: `1px solid ${C.border}`, background: C.cardBg, color: C.textMuted }}>
      ⟳ Doom score calculating…
    </div>
  );

  const d        = data || {};
  const color    = d.color || '#fbbf24';
  const bias     = d.bias  || 'Neutral';
  const score    = d.score ?? 0;
  const fuel     = d.expected_close_pts || [-80, 80];
  const action   = d.action || 'WAIT';
  const expiry   = d.expiry || false;
  const mode     = d.mode  || 'NORMAL';
  const confirm  = d.confirm_950;

  const scoreLabel = score >= 0 ? `+${score}` : `${score}`;
  const fuelLabel  = `${fuel[0] >= 0 ? '+' : ''}${fuel[0]} to ${fuel[1] >= 0 ? '+' : ''}${fuel[1]} pts`;

  // Action color
  const actionColor = action === 'LONG'  ? '#22c55e'
                    : action === 'SHORT' ? '#ef4444'
                    : action === 'WAIT'  ? '#fbbf24'
                    : '#94a3b8';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `2px solid ${color}40` }}
      data-testid="doom-card"
    >
      {/* ── Header (always visible, clickable) ─────────────────── */}
      <button
        className="w-full px-3 py-2.5 flex items-center justify-between gap-2"
        style={{ background: `${color}10` }}
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
            DOOM
          </span>
          {/* Score pill */}
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full font-mono"
            style={{ color, background: `${color}20`, border: `1px solid ${color}40` }}>
            {scoreLabel}
          </span>
          {/* Bias */}
          <span className="text-[9px] font-bold" style={{ color }}>
            {bias}
          </span>
          {/* Fuel */}
          <span className="text-[8px] font-mono" style={{ color: C.textSecond }}>
            {fuelLabel}
          </span>
          {/* Mode badge */}
          {mode !== 'NORMAL' && (
            <span className="text-[7px] px-1.5 py-0.5 rounded-full"
              style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }}>
              {mode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Expiry */}
          {expiry && (
            <span className="text-[7px] px-1.5 py-0.5 rounded-sm font-bold"
              style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)' }}>
              EXPIRY
            </span>
          )}
          {/* Action */}
          <span className="text-[8px] font-bold px-2 py-0.5 rounded"
            style={{ color: actionColor, background: `${actionColor}12`, border: `1px solid ${actionColor}30` }}>
            {action}
          </span>
          <span className="text-[9px]" style={{ color: C.textMuted }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* ── Expandable body ─────────────────────────────────────── */}
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-3" style={{ background: C.panelBg }}>

          {/* Factor scores strip */}
          {d.factors && (
            <div>
              <div className="text-[7.5px] uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>
                Factor Scores
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { lbl: 'Brent',   val: d.brent,      sc: d.factors.brent   },
                  { lbl: 'VIX',     val: d.vix,        sc: d.factors.vix     },
                  { lbl: 'GIFT%',   val: d.gift_pct != null ? `${d.gift_pct >= 0 ? '+' : ''}${(d.gift_pct * 100).toFixed(2)}%` : '—', sc: d.factors.gift },
                  { lbl: 'Breadth', val: `${d.breadth_up ?? '—'} up`,   sc: d.factors.breadth  },
                  { lbl: 'FII',     val: d.fii_cr != null ? `${d.fii_cr >= 0 ? '+' : ''}${d.fii_cr.toFixed(0)} Cr` : '—', sc: d.factors.fii },
                  { lbl: 'GEX',     val: d.gex?.replace(/_/g,' '),       sc: d.factors.gex     },
                ].map(({ lbl, val, sc }) => (
                  <div key={lbl} className="rounded p-1.5 text-center"
                    style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                    <div className="text-[7px] uppercase tracking-widest mb-0.5" style={{ color: C.textMuted }}>{lbl}</div>
                    <div className="text-[8px] font-bold font-mono" style={{ color: sc > 0 ? '#22c55e' : sc < 0 ? '#ef4444' : C.textSecond }}>{val ?? '—'}</div>
                    <div className="text-[7px] font-black font-mono" style={{ color: sc > 0 ? '#22c55e' : sc < 0 ? '#ef4444' : C.textMuted }}>
                      {sc > 0 ? `+${sc}` : sc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 9:50 confirm status */}
          <div className="rounded px-3 py-2 flex items-center justify-between"
            style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <span className="text-[8px] uppercase tracking-widest" style={{ color: C.textMuted }}>9:50 Confirm</span>
            <span className="text-[8px] font-bold px-2 py-0.5 rounded-full"
              style={{
                color: confirm === true ? '#22c55e' : confirm === false ? '#ef4444' : '#fbbf24',
                background: confirm === true ? 'rgba(34,197,94,0.12)' : confirm === false ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.12)',
              }}>
              {confirm === null || confirm === undefined ? 'WAIT (pre-9:50)' : confirm ? `CONFIRMED ${d.confirm_direction}` : 'NOT CONFIRMED'}
            </span>
          </div>

          {/* Reference Matrix (sirf dikhane ke liye) */}
          <div>
            <div className="text-[7.5px] uppercase tracking-wider mb-1.5" style={{ color: C.textMuted }}>
              Row Matrix (Reference)
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              {/* Col headers */}
              <div className="grid text-[6.5px] px-2 py-1 font-black uppercase tracking-widest"
                style={{ gridTemplateColumns: '2fr 1.5fr 1.5fr 1.5fr 2fr 2fr 3fr', gap: '4px', background: C.cardBg, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
                {['Bias','Score','Brent','VIX','GIFT','Exp Pts','Action'].map(h => (
                  <span key={h}>{h}</span>
                ))}
              </div>
              {MATRIX_ROWS.map((row, i) => {
                const isActive = row.bias === bias;
                return (
                  <div key={i}
                    className="grid items-center px-2 py-1.5 text-[7px]"
                    style={{
                      gridTemplateColumns: '2fr 1.5fr 1.5fr 1.5fr 2fr 2fr 3fr',
                      gap: '4px',
                      background:   isActive ? `${row.color}14` : 'transparent',
                      borderLeft:   isActive ? `3px solid ${row.color}` : '3px solid transparent',
                      borderBottom: i < MATRIX_ROWS.length - 1 ? `1px solid ${C.borderSubtle}` : 'none',
                    }}>
                    <span className="font-bold" style={{ color: isActive ? row.color : C.textSecond }}>{row.bias}</span>
                    <span className="font-mono" style={{ color: isActive ? C.textPrimary : C.textMuted }}>{row.score}</span>
                    <span style={{ color: C.textMuted }}>{row.brent}</span>
                    <span style={{ color: C.textMuted }}>{row.vix}</span>
                    <span style={{ color: C.textMuted }}>{row.gift}</span>
                    <span className="font-bold font-mono" style={{ color: isActive ? row.color : C.textMuted }}>{row.pts}</span>
                    <span style={{ color: isActive ? C.textPrimary : C.textMuted }}>{row.action}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
