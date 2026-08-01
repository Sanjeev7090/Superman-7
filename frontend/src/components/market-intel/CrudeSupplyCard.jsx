import React, { useState, useEffect } from 'react';
import { EIABanner } from './EIABanner';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

function CrudeSparkline({ scores }) {
  if (!scores || scores.length < 2) return null;
  const W = 56, H = 30, PAD = 3;
  const min = Math.min(-4, ...scores), max = Math.max(4, ...scores);
  const range = max - min || 1;
  const pts = scores.map((v, i) => {
    const x = PAD + (i / (scores.length - 1)) * (W - PAD * 2);
    const y = PAD + ((max - v) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = scores[scores.length - 1];
  const lineColor = last > 0 ? '#22c55e' : last < 0 ? '#ef4444' : '#94a3b8';
  const zeroY = (PAD + ((max - 0) / range) * (H - PAD * 2)).toFixed(1);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" />
      <polyline points={pts.join(' ')} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {scores.map((v, i) => {
        const [x, y] = pts[i].split(',');
        const c = v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#94a3b8';
        return <circle key={i} cx={x} cy={y} r="2" fill={c} />;
      })}
    </svg>
  );
}

export function CrudeSupplyCard({ brent, brentChgPct, usdinr, usdinrChgPct, geoRisk, C, isDark }) {
  const [expanded, setExpanded] = useState(false);
  const [eia, setEia]           = useState(null);
  const [eiaLoading, setEiaLoading] = useState(false);
  const [scoreHistory, setScoreHistory] = useState([]);

  useEffect(() => {
    setEiaLoading(true);
    fetch(`${API_BASE}/api/crude/eia-status`)
      .then(r => r.json()).then(setEia).catch(() => setEia(null))
      .finally(() => setEiaLoading(false));
    fetch(`${API_BASE}/api/crude/score-history`)
      .then(r => r.json()).then(d => setScoreHistory(d.history || [])).catch(() => {});
  }, []);

  const eiaSignal = (() => {
    if (!eia) return { score: 0, label: 'EIA: Loading…', color: '#94a3b8', detail: '' };
    const c = eia.us_change_mb || 0;
    if (c < -5)  return { score: -2, label: `EIA Big Draw ${c.toFixed(2)} mb`,   color: '#ef4444', detail: 'US crude stocks fall sharply → crude may spike' };
    if (c < 0)   return { score: -1, label: `EIA Draw ${c.toFixed(2)} mb`,       color: '#f97316', detail: 'US stocks declining → crude firm → Nifty pressure' };
    if (c > 5)   return { score: +2, label: `EIA Big Build +${c.toFixed(2)} mb`, color: '#22c55e', detail: 'Large supply surplus → crude may drop → Nifty relief' };
    if (c > 0)   return { score: +1, label: `EIA Build +${c.toFixed(2)} mb`,     color: '#4ade80', detail: 'US stocks rising → crude soft → Nifty supportive' };
    return { score: 0, label: 'EIA: Unchanged', color: '#94a3b8', detail: 'No supply change this week' };
  })();

  const crudeSignal = (() => {
    if (!brent) return { score: 0, label: 'Brent N/A', color: '#94a3b8', detail: '' };
    const chg = brentChgPct || 0;
    let score = brent >= 90 ? -2 : brent >= 85 ? -1 : brent < 78 ? +1 : 0;
    if (chg >= 2) score -= 1; else if (chg <= -2) score += 1;
    const color = score <= -2 ? '#ef4444' : score === -1 ? '#f97316' : score >= 1 ? '#22c55e' : '#94a3b8';
    return { score, label: `Brent $${brent.toFixed(1)} (${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%)`, color,
      detail: brent >= 90 ? 'Elevated → high import bill → Nifty pressure' : brent >= 85 ? 'Caution zone — watch closely' : chg <= -2 ? 'Crude falling → relief for India' : 'Manageable zone' };
  })();

  const usdinrSignal = (() => {
    if (!usdinr) return { score: 0, label: 'INR N/A', color: '#94a3b8', detail: '' };
    const chg = usdinrChgPct || 0;
    if (chg >= 0.5)   return { score: -2, label: `INR Weak +${chg.toFixed(2)}%`,    color: '#ef4444', detail: `₹${usdinr.toFixed(1)} — rupee falling → FII outflow` };
    if (chg >= 0.15)  return { score: -1, label: `INR Mild Weak +${chg.toFixed(2)}%`, color: '#f97316', detail: 'Slight rupee pressure' };
    if (chg <= -0.5)  return { score: +2, label: `INR Strong ${chg.toFixed(2)}%`,   color: '#22c55e', detail: `₹${usdinr.toFixed(1)} — rupee rising → FII inflow` };
    if (chg <= -0.15) return { score: +1, label: `INR Mild Strong ${chg.toFixed(2)}%`, color: '#4ade80', detail: 'Mild rupee support' };
    return { score: 0, label: `INR Stable ₹${usdinr?.toFixed(1)}`, color: '#94a3b8', detail: 'Rupee neutral today' };
  })();

  const geoSignal = (() => {
    if (!geoRisk) return { score: 0, label: 'Geo N/A', color: '#94a3b8', detail: '' };
    if (geoRisk.level === 'HIGH')   return { score: -2, label: 'Geo Risk HIGH',   color: '#ef4444', detail: geoRisk.triggers?.[0]?.category || 'Elevated geopolitical risk' };
    if (geoRisk.level === 'MEDIUM') return { score: -1, label: 'Geo Risk MEDIUM', color: '#f97316', detail: 'Moderate risk — monitor closely' };
    return { score: +1, label: 'Geo Risk LOW', color: '#22c55e', detail: 'Calm environment' };
  })();

  const total = eiaSignal.score + crudeSignal.score + usdinrSignal.score + geoSignal.score;
  const plan = (() => {
    if (total <= -5) return { verdict: 'STRONG SHORT',   action: 'Buy Puts · Avoid all longs',          color: '#ef4444', bg: '#ef444412', note: 'Multiple bearish signals align — crude surge risk high' };
    if (total <= -3) return { verdict: 'SHORT',          action: 'Put Buy / Hedge existing longs',       color: '#f87171', bg: '#ef444410', note: 'Crude & macro bearish — Nifty likely under pressure' };
    if (total === -2) return { verdict: 'MILDLY SHORT',  action: 'Reduce longs · Small Put hedge',       color: '#f97316', bg: '#f9731610', note: 'Slight bearish lean — wait for confirmation' };
    if (total === -1) return { verdict: 'CAUTIOUS',      action: 'Wait & Watch · No fresh longs',        color: '#f59e0b', bg: '#f59e0b10', note: 'Mixed signals — crude elevated but not alarming' };
    if (total === 0)  return { verdict: 'NEUTRAL',       action: 'Follow chart levels · No macro edge',  color: '#94a3b8', bg: '#94a3b810', note: 'No clear edge from crude — trade technicals only' };
    if (total === 1)  return { verdict: 'MILDLY BULLISH', action: 'Small Call Buy · Mild long bias',     color: '#4ade80', bg: '#22c55e10', note: 'Slight tailwind — crude soft / rupee supportive' };
    if (total <= 3)  return { verdict: 'BULLISH',        action: 'Call Buy · Long bias on dips',         color: '#22c55e', bg: '#22c55e12', note: 'Crude falling + INR strong → favorable for Nifty' };
    return             { verdict: 'STRONG BULLISH',      action: 'Aggressive Long · Calls on dips',      color: '#16a34a', bg: '#22c55e15', note: 'Strong multi-factor tailwind — crude macro supports rally' };
  })();

  useEffect(() => {
    if (!eia || eiaLoading || !brent) return;
    fetch(`${API_BASE}/api/crude/save-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: total, brent, verdict: plan.verdict }),
    }).then(r => r.json()).then(d => {
      if (d.status === 'ok') {
        fetch(`${API_BASE}/api/crude/score-history`)
          .then(r => r.json()).then(d2 => setScoreHistory(d2.history || [])).catch(() => {});
      }
    }).catch(() => {});
  }, [total, eia, brent]); // eslint-disable-line react-hooks/exhaustive-deps

  const signals = [
    { label: 'US EIA',    sig: eiaSignal },
    { label: 'Brent',     sig: crudeSignal },
    { label: 'USD/INR',   sig: usdinrSignal },
    { label: 'Geo Risk',  sig: geoSignal },
  ];

  return (
    <div className="rounded-xl overflow-hidden" data-testid="crude-supply-card"
      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>

      <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ borderBottom: `1px solid ${C.border}` }}
        onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>
          </svg>
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.textPrimary }}>Crude Oil Supply</span>
          {brent >= 88 && (
            <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full animate-pulse"
              style={{ background: '#ef444418', color: '#ef4444', border: '1px solid #ef444440' }}>
              ${brent?.toFixed(1)} HIGH ZONE
            </span>
          )}
        </div>
        <span className="text-[9px] rounded px-1 py-0.5" style={{ color: C.textMuted, background: C.panelBg }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      <EIABanner C={C} />

      <div className="px-4 py-3" style={{ borderBottom: expanded ? `1px solid ${C.borderSubtle}` : 'none', background: plan.bg }}>
        <div className="text-[8px] uppercase tracking-wider font-bold mb-2" style={{ color: C.textMuted }}>
          Today's Trading Plan
          {eiaLoading && <span className="ml-2 text-[7px] font-normal" style={{ color: '#f59e0b' }}>fetching EIA…</span>}
        </div>

        <div className="grid grid-cols-2 gap-1.5 mb-2.5">
          {signals.map(({ label, sig }) => (
            <div key={label} className="rounded-lg px-2 py-1.5"
              style={{ background: `${sig.color}0d`, border: `1px solid ${sig.color}28` }}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[7px] uppercase tracking-wider font-bold" style={{ color: C.textMuted }}>{label}</span>
                <span className="text-[8px] font-black" style={{ color: sig.color }}>{sig.score > 0 ? `+${sig.score}` : sig.score}</span>
              </div>
              <div className="text-[8px] font-bold leading-tight truncate" style={{ color: sig.color }}>{sig.label}</div>
              {sig.detail && <div className="text-[6.5px] mt-0.5 leading-tight" style={{ color: C.textMuted }}>{sig.detail}</div>}
            </div>
          ))}
        </div>

        <div className="flex items-stretch gap-2">
          <div className="flex-1 flex items-center justify-between rounded-xl px-3 py-2.5"
            style={{ background: `${plan.color}18`, border: `1.5px solid ${plan.color}50` }}>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: plan.color }}>{plan.verdict}</div>
              <div className="text-[9px] font-medium mt-0.5" style={{ color: C.textSecond }}>{plan.action}</div>
              <div className="text-[7.5px] mt-1" style={{ color: C.textMuted }}>{plan.note}</div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <div className="text-[7px] mb-0.5" style={{ color: C.textMuted }}>Score</div>
              <div className="text-[20px] font-black font-mono leading-none" style={{ color: plan.color }}>
                {total > 0 ? `+${total}` : total}
              </div>
            </div>
          </div>

          {scoreHistory.length >= 2 && (
            <div className="rounded-xl px-2.5 py-2 flex flex-col items-center justify-between shrink-0"
              style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: `1px solid ${C.borderSubtle}`, minWidth: 68 }}>
              <div className="text-[6.5px] uppercase tracking-wider font-bold mb-1" style={{ color: C.textMuted }}>5d Trend</div>
              <CrudeSparkline scores={scoreHistory.map(r => r.score)} />
              <div className="text-[6px] mt-1" style={{ color: C.textMuted }}>
                {(() => {
                  const arr = scoreHistory.map(r => r.score);
                  const diff = arr[arr.length - 1] - arr[0];
                  return diff > 0
                    ? <span style={{ color: '#22c55e' }}>Improving ↑</span>
                    : diff < 0
                    ? <span style={{ color: '#ef4444' }}>Worsening ↓</span>
                    : <span style={{ color: '#94a3b8' }}>Stable →</span>;
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3">
          <div className="text-[8px] uppercase tracking-wider font-bold mb-2" style={{ color: C.textMuted }}>
            Live Data
            {eia && !eia.available && <span className="ml-2 text-[7px] font-normal" style={{ color: '#94a3b8' }}>fallback</span>}
          </div>
          <div className="space-y-1">
            {[
              { label: 'US EIA (FRED)',     value: eia ? `${eia.us_change_mb > 0 ? '+' : ''}${eia.us_change_mb?.toFixed(3)} mb  (${eia.us_kind})` : '—', sub: eia ? `Week of ${eia.us_date} · Stocks ${eia.us_curr_mb?.toFixed(1)} mb` : '…', color: eiaSignal.color },
              { label: 'India (PPAC est.)', value: eia ? `~${eia.india_mb} mb · ${eia.india_status}` : '—', sub: eia ? `Data: ${eia.india_date}` : '', color: '#f97316' },
              { label: 'Brent Crude',       value: brent ? `$${brent.toFixed(2)}  (${brentChgPct >= 0 ? '+' : ''}${brentChgPct?.toFixed(2)}% today)` : '—', sub: brent >= 90 ? 'Above $90 — elevated zone' : brent >= 85 ? 'Caution zone $85–90' : 'Manageable zone', color: crudeSignal.color },
              { label: 'USD/INR',           value: usdinr ? `₹${usdinr.toFixed(2)}  (${usdinrChgPct >= 0 ? '+' : ''}${usdinrChgPct?.toFixed(2)}%)` : '—', sub: usdinrSignal.detail, color: usdinrSignal.color },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
                style={{ background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${C.borderSubtle}` }}>
                <span className="text-[8px]" style={{ color: C.textMuted }}>{row.label}</span>
                <div className="text-right">
                  <div className="text-[8.5px] font-bold" style={{ color: row.color }}>{row.value}</div>
                  {row.sub && <div className="text-[7px]" style={{ color: C.textMuted }}>{row.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
