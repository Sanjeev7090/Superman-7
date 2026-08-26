import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { ArrowClockwise } from '@phosphor-icons/react';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

// Factor scoring reference (for display table at the bottom)
const FACTOR_REF = [
  {
    name: 'Distance from Day Low',
    rows: [
      { cond: 'Day Low se 70+ pts upar',   pts: '+3', color: '#22c55e' },
      { cond: 'Day Low se 40–70 pts upar', pts: '+2', color: '#4ade80' },
      { cond: 'Day Low se 20–40 pts upar', pts: '+1', color: '#86efac' },
      { cond: 'Day Low ke 20 pts ke andar',pts: '–3', color: '#ef4444' },
    ],
  },
  {
    name: 'Last 45-min Structure',
    rows: [
      { cond: 'Higher Low + bounce',         pts: '+2', color: '#22c55e' },
      { cond: 'Sideways',                    pts: '0',  color: '#94a3b8' },
      { cond: 'Lower High + Lower Low',      pts: '–2', color: '#ef4444' },
    ],
  },
  {
    name: 'India VIX',
    rows: [
      { cond: '< 11.5',         pts: '+2', color: '#22c55e' },
      { cond: '11.5 – 13.0',   pts: '+1', color: '#86efac' },
      { cond: '> 14.0',         pts: '–1', color: '#ef4444' },
    ],
  },
  {
    name: 'Matrix Bias',
    rows: [
      { cond: 'Strong / Mild Bullish', pts: '+2', color: '#22c55e' },
      { cond: 'Neutral',               pts: '+1', color: '#94a3b8' },
      { cond: 'Mild Bearish',          pts: '0',  color: '#fca5a5' },
      { cond: 'Strong Bearish',        pts: '–2', color: '#ef4444' },
    ],
  },
  {
    name: 'GIFT / Closing Cue',
    rows: [
      { cond: 'Flat to Positive',   pts: '+1', color: '#22c55e' },
      { cond: 'Clearly Negative',   pts: '–1', color: '#ef4444' },
    ],
  },
];

const DECISION_RULES = [
  { score: '+6 aur upar',   signal: 'Strong Recovery',       move: '+25 to +50 pts', action: 'Aggressive Long',         color: '#22c55e' },
  { score: '+3 to +5',      signal: 'Mild–Good Recovery',    move: '+12 to +35 pts', action: 'Selective Long',           color: '#4ade80' },
  { score: '+1 to +2',      signal: 'Small Recovery / Mixed',move: '+5 to +20 pts',  action: 'Small size only',          color: '#86efac' },
  { score: '0 to –1',       signal: 'No Clear Edge',         move: '–10 to +10 pts', action: 'Avoid',                   color: '#94a3b8' },
  { score: '–2 to –4',      signal: 'Mild Selling',          move: '–10 to –30 pts', action: 'Avoid Long / Small Short', color: '#fca5a5' },
  { score: '–5 aur neeche', signal: 'Selling till Close',    move: '–20 to –50 pts', action: 'Short bias',               color: '#ef4444' },
];

function ScorePill({ score }) {
  const isPos = score > 0, isNeg = score < 0;
  const color  = isPos ? '#22c55e' : isNeg ? '#ef4444' : '#94a3b8';
  return (
    <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded"
      style={{ background: `${color}20`, color, border: `1px solid ${color}35` }}>
      {score > 0 ? `+${score}` : score}
    </span>
  );
}

export function ClosingPredictionSection({ C, isDark }) {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [showRef,   setShowRef]   = useState(false);

  const load = useCallback(async (force = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/market-intel/closing-prediction`);
      setData(res.data);
    } catch {
      setData({ available: false, error: true });
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data) load();
  };

  // Auto-refresh every 2 min while open
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => load(true), 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [open, load]);

  const dec = data?.decision;
  const totalScore = data?.total_score ?? null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 transition-all"
        style={{ background: C.cardBg }}
        onClick={handleToggle}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px]">🕒</span>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textPrimary }}>
            Last 15-min Prediction (3:15–3:30)
          </span>
          {/* MARKET CLOSED badge */}
          {data?.is_market_closed && (
            <span className="text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
              MARKET CLOSED
            </span>
          )}
          {/* ACTIVE WINDOW badge (live) */}
          {data?.is_closing_window && (
            <span className="text-[7px] px-1.5 py-0.5 rounded font-bold animate-pulse"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
              ● LIVE
            </span>
          )}
          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
            style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
            Closing Logic
          </span>
          {totalScore !== null && (
            <ScorePill score={totalScore} />
          )}
          {dec && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: `${dec.color}20`, color: dec.color }}>
              {dec.signal}
            </span>
          )}
          {/* Feedback verdict in header when closed */}
          {data?.market_feedback && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: `${data.market_feedback.verdict_color}18`, color: data.market_feedback.verdict_color, border: `1px solid ${data.market_feedback.verdict_color}35` }}>
              {data.market_feedback.verdict_icon} {data.market_feedback.accuracy}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {open && (
            <button
              onClick={(e) => { e.stopPropagation(); load(true); }}
              disabled={loading}
              className="rounded p-1 hover:opacity-70"
              style={{ color: C.textMuted, background: C.panelBg }}
              title="Refresh live data">
              <ArrowClockwise size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          )}
          <span className="text-[10px] shrink-0 transition-transform" style={{
            color: C.textMuted,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}>▼</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3" style={{ background: C.panelBg }}>

          {loading && !data && (
            <div className="text-[9px] py-4 text-center" style={{ color: C.textMuted }}>
              Live data fetch ho raha hai...
            </div>
          )}

          {data && !data.available && (
            <div className="text-[9px] py-3 px-3 rounded-lg text-center"
              style={{ background: 'rgba(148,163,184,0.1)', color: C.textMuted, border: `1px solid ${C.border}` }}>
              {data.message || 'Data unavailable'}
            </div>
          )}

          {data?.available && (
            <>
              {/* Session + Market Stats Bar */}
              <div className="rounded-lg px-3 py-2 flex flex-wrap items-center gap-3 justify-between"
                style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[8px] font-mono" style={{ color: C.textMuted }}>
                    {data.session_note}
                  </span>
                  {data.is_closing_window && (
                    <span className="text-[7px] px-1.5 py-0.5 rounded font-bold animate-pulse"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                      ● ACTIVE WINDOW
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[8px] font-mono flex-wrap">
                  <span style={{ color: C.textMuted }}>
                    LTP: <span className="font-bold" style={{ color: C.textPrimary }}>{data.curr_price}</span>
                  </span>
                  <span style={{ color: '#22c55e' }}>
                    H: {data.day_high}
                  </span>
                  <span style={{ color: '#ef4444' }}>
                    L: {data.day_low}
                  </span>
                  <span style={{ color: C.textMuted }}>
                    O: {data.day_open}
                  </span>
                  <span style={{ color: '#fbbf24' }}>
                    ↑ Low: +{data.dist_from_low}
                  </span>
                </div>
              </div>

              {/* ── 5 Factor Score Cards ────────────────────────────── */}
              <div className="space-y-1.5">
                {(data.factors || []).map((f, i) => {
                  const sc    = f.score;
                  const color = sc > 0 ? '#22c55e' : sc < 0 ? '#ef4444' : '#94a3b8';
                  return (
                    <div key={i} className="rounded-lg px-3 py-2 flex items-center justify-between"
                      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[8px] uppercase tracking-widest font-semibold mb-0.5"
                          style={{ color: C.textMuted }}>
                          {f.name}
                        </div>
                        <div className="text-[9px] font-medium" style={{ color: C.textSecond }}>
                          {f.label}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[8px] font-mono" style={{ color: C.textMuted }}>
                          {f.value}
                        </span>
                        <ScorePill score={sc} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Total Score ──────────────────────────────────────── */}
              <div className="rounded-lg px-3 py-2 flex items-center justify-between"
                style={{
                  background: `${dec?.color}10`,
                  border: `1.5px solid ${dec?.color}40`,
                }}>
                <span className="text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: C.textMuted }}>
                  Total Score
                </span>
                <ScorePill score={totalScore} />
              </div>

              {/* ── Decision Banner ──────────────────────────────────── */}
              {dec && (
                <div className="rounded-xl p-3 space-y-2"
                  style={{ background: `${dec.color}12`, border: `2px solid ${dec.color}40` }}>
                  <div className="text-[8px] uppercase tracking-widest font-semibold"
                    style={{ color: C.textMuted }}>
                    Signal
                  </div>
                  <div className="text-xl font-black" style={{ color: dec.color }}>
                    {dec.signal}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <div className="text-[7px] uppercase tracking-widest" style={{ color: C.textMuted }}>Expected Move</div>
                      <div className="text-sm font-bold font-mono" style={{ color: dec.color }}>{dec.move}</div>
                    </div>
                    <div>
                      <div className="text-[7px] uppercase tracking-widest" style={{ color: C.textMuted }}>Action</div>
                      <div className="text-sm font-bold" style={{ color: dec.color }}>{dec.action}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Updated at + refresh */}
              {data.updated_at && (
                <div className="flex items-center justify-between">
                  <span className="text-[7px]" style={{ color: C.textMuted }}>
                    Updated: {new Date(data.updated_at).toLocaleTimeString('en-IN')} IST
                  </span>
                  <button
                    onClick={() => load(true)} disabled={loading}
                    className="text-[8px] underline hover:opacity-70"
                    style={{ color: C.textMuted }}>
                    Refresh
                  </button>
                </div>
              )}

              {/* ── Post-Market Feedback ─────────────────────────────── */}
              {data.is_market_closed && data.market_feedback && (() => {
                const fb = data.market_feedback;
                const vc = fb.verdict_color;
                return (
                  <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${vc}40` }}>
                    {/* Feedback header */}
                    <div className="px-3 py-2 flex items-center justify-between"
                      style={{ background: `${vc}12` }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: vc }}>
                          Post-Market Feedback
                        </span>
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `${vc}20`, color: vc }}>
                          {fb.verdict_icon} {fb.accuracy}
                        </span>
                      </div>
                      <span className="text-[8px] font-mono" style={{ color: C.textMuted }}>
                        Score: {fb.score_at_close > 0 ? '+' : ''}{fb.score_at_close}
                      </span>
                    </div>

                    <div className="px-3 pb-3 pt-2 space-y-2" style={{ background: C.panelBg }}>
                      {/* Verdict text */}
                      <div className="text-[9px] font-semibold leading-snug" style={{ color: vc }}>
                        {fb.verdict_text}
                      </div>

                      {/* Actual vs Predicted cards */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* Predicted */}
                        <div className="rounded-lg px-2.5 py-2" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                          <div className="text-[7px] uppercase tracking-widest font-bold mb-1" style={{ color: C.textMuted }}>
                            Prediction
                          </div>
                          <div className="text-[9px] font-bold" style={{ color: dec?.color || C.textPrimary }}>
                            {fb.predicted_signal}
                          </div>
                          <div className="text-[8px] font-mono mt-0.5" style={{ color: C.textSecond }}>
                            {fb.predicted_move}
                          </div>
                          <div className="text-[7px] mt-0.5" style={{ color: C.textMuted }}>
                            Action: {fb.predicted_action}
                          </div>
                        </div>

                        {/* Actual */}
                        <div className="rounded-lg px-2.5 py-2" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                          <div className="text-[7px] uppercase tracking-widest font-bold mb-1" style={{ color: C.textMuted }}>
                            Actual Result
                          </div>
                          <div className="text-[9px] font-bold font-mono"
                            style={{ color: fb.actual_move >= 0 ? '#22c55e' : '#ef4444' }}>
                            {fb.actual_move >= 0 ? '+' : ''}{fb.actual_move} pts
                          </div>
                          <div className="text-[8px] font-mono mt-0.5" style={{ color: C.textSecond }}>
                            {fb.actual_pct >= 0 ? '+' : ''}{fb.actual_pct}% | Range {fb.actual_range} pts
                          </div>
                          <div className="text-[7px] mt-0.5 font-mono" style={{ color: C.textMuted }}>
                            Close: {fb.actual_close} | Open: {fb.actual_open}
                          </div>
                        </div>
                      </div>

                      {/* High / Low strip */}
                      <div className="flex items-center gap-3 text-[8px] font-mono px-1">
                        <span style={{ color: '#22c55e' }}>H: {fb.day_high}</span>
                        <span style={{ color: '#ef4444' }}>L: {fb.day_low}</span>
                        <span style={{ color: '#fbbf24' }}>Range: {fb.actual_range} pts</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Reference Tables (collapsible) ──────────────────── */}
              <div>
                <button
                  className="w-full flex items-center justify-between py-1.5 px-1 rounded"
                  onClick={() => setShowRef(v => !v)}
                  style={{ color: C.textMuted }}>
                  <span className="text-[8px] font-bold uppercase tracking-widest">
                    Scoring Reference + Decision Rules
                  </span>
                  <span className="text-[8px]">{showRef ? '▲ Hide' : '▼ Show'}</span>
                </button>

                {showRef && (
                  <div className="space-y-3 mt-1">
                    {/* Factor reference */}
                    {FACTOR_REF.map((fac, fi) => (
                      <div key={fi}>
                        <div className="text-[8px] font-semibold uppercase tracking-widest mb-1"
                          style={{ color: '#a855f7' }}>
                          {fac.name}
                        </div>
                        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                          <table className="w-full text-[8px]">
                            <tbody>
                              {fac.rows.map((r, ri) => (
                                <tr key={ri} style={{ borderTop: ri > 0 ? `1px solid ${C.borderSubtle}` : 'none' }}>
                                  <td className="px-2 py-1.5" style={{ color: C.textSecond }}>{r.cond}</td>
                                  <td className="px-2 py-1.5 text-right font-bold font-mono whitespace-nowrap"
                                    style={{ color: r.color }}>{r.pts}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}

                    {/* Decision rules */}
                    <div>
                      <div className="text-[8px] font-semibold uppercase tracking-widest mb-1"
                        style={{ color: '#a855f7' }}>
                        Decision Rules
                      </div>
                      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                        <table className="w-full text-[8px]">
                          <thead>
                            <tr style={{ background: C.tableBg }}>
                              {['Score', 'Signal', 'Expected Move', 'Action'].map(h => (
                                <th key={h} className="px-2 py-1.5 text-left font-bold uppercase tracking-widest whitespace-nowrap"
                                  style={{ color: C.textMuted }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {DECISION_RULES.map((r, ri) => (
                              <tr key={ri} style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
                                <td className="px-2 py-1.5 font-mono font-bold whitespace-nowrap"
                                  style={{ color: r.color }}>{r.score}</td>
                                <td className="px-2 py-1.5 font-semibold whitespace-nowrap"
                                  style={{ color: r.color }}>{r.signal}</td>
                                <td className="px-2 py-1.5 font-mono whitespace-nowrap"
                                  style={{ color: C.textSecond }}>{r.move}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap"
                                  style={{ color: C.textSecond }}>{r.action}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
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
