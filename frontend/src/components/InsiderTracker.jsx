import React, { useState, useEffect, useCallback } from 'react';
import {
  Eye, X, ArrowClockwise, Warning, TrendUp, TrendDown,
  Minus, ChartBar, Users, CaretDown, CaretRight,
  MagnifyingGlass, Funnel, CalendarBlank, CaretLeft,
  CaretRight as CaretRightIcon, Newspaper, ArrowUp, ArrowDown,
} from '@phosphor-icons/react';
import { useTheme } from '../context/ThemeContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Helpers ────────────────────────────────────────────────────────────────

const priorityMeta = {
  HIGH:      { label: 'HIGH',      bg: 'rgba(239,68,68,0.15)',    border: '#ef4444', text: '#f87171' },
  WATCHLIST: { label: 'WATCHLIST', bg: 'rgba(245,158,11,0.15)',   border: '#f59e0b', text: '#fbbf24' },
  MONITOR:   { label: 'MONITOR',   bg: 'rgba(148,163,184,0.12)',  border: '#64748b', text: '#94a3b8' },
};

const biasMeta = {
  BULLISH: { color: '#22c55e', icon: TrendUp,   label: 'Bullish' },
  BEARISH: { color: '#ef4444', icon: TrendDown, label: 'Bearish' },
  NEUTRAL: { color: '#94a3b8', icon: Minus,     label: 'Neutral'  },
};

const TF_COLORS = { '15m': '#6366f1', '1H': '#f59e0b', '1D': '#06b6d4' };

const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

// ═══════════════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// ── Score Ring 0-20 with 12 threshold ──────────────────────────────────────

function ScoreDot({ score, adjScore, maxScore = 20, threshold = 12 }) {
  const s       = adjScore ?? score;
  const pct     = Math.min(s / maxScore, 1);
  const tPct    = threshold / maxScore;
  const r       = 14;
  const circ    = 2 * Math.PI * r;
  const color   = s >= 18 ? '#a78bfa'
                : s >= 15 ? '#22c55e'
                : s >= 12 ? '#4ade80'
                : s >= 8  ? '#fbbf24'
                :            '#64748b';
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
      {/* Threshold marker */}
      <circle cx="18" cy="18" r={r} fill="none"
        stroke="rgba(251,191,36,0.30)" strokeWidth="3"
        strokeDasharray={`1 ${circ - 1}`}
        strokeDashoffset={-(tPct * circ - circ / 4)}
        strokeLinecap="round" transform="rotate(-90 18 18)"
      />
      {/* Score arc */}
      <circle cx="18" cy="18" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${pct * circ} ${circ}`}
        strokeLinecap="round" transform="rotate(-90 18 18)"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x="18" y="21" textAnchor="middle" fill={color} fontSize="8.5" fontWeight="800"
        fontFamily="monospace">{s}</text>
    </svg>
  );
}

// ── Insider Alert Card ─────────────────────────────────────────────────────

const STATUS_META = {
  'GOD LEVEL':   { bg: 'rgba(245,158,11,0.15)',  border: '#f59e0b', text: '#fbbf24'  },
  'RARE':        { bg: 'rgba(167,139,250,0.15)', border: '#a78bfa', text: '#c4b5fd'  },
  'POSITIONAL':  { bg: 'rgba(34,197,94,0.15)',   border: '#22c55e', text: '#4ade80'  },
  'SETUP':       { bg: 'rgba(74,222,128,0.12)',   border: '#4ade80', text: '#86efac'  },
  'WATCH':       { bg: 'rgba(251,191,36,0.12)',   border: '#fbbf24', text: '#fde68a'  },
  'MONITOR':     { bg: 'rgba(148,163,184,0.08)', border: '#64748b', text: '#94a3b8'  },
  'REJECT':      { bg: 'rgba(71,85,105,0.08)',   border: '#334155', text: '#64748b'  },
};

function GodFactor({ tag, C }) {
  const isPos = tag.includes('+') && !tag.includes('+0');
  const isNeg = tag.includes('-') || tag.includes('AUTO-REJECT') || tag.includes('non-market');
  const isNeu = tag.includes('+0') || tag.includes('N/A');
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '0.04em',
      padding: '2px 6px', borderRadius: 3,
      background: isPos ? 'rgba(34,197,94,0.12)'
                : isNeg ? 'rgba(239,68,68,0.12)'
                :         'rgba(148,163,184,0.08)',
      color: isPos ? '#4ade80' : isNeg ? '#f87171' : C.textSecond,
      border: `1px solid ${isPos ? 'rgba(34,197,94,0.25)' : isNeg ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.15)'}`,
    }}>{tag}</span>
  );
}

function InsiderRow({ item, C }) {
  const [expanded, setExpanded] = useState(false);
  const sm = STATUS_META[item.status] || STATUS_META['MONITOR'];
  const s  = item.adj_score ?? item.score;

  const scoreColor = s >= 18 ? '#a78bfa'
                   : s >= 15 ? '#22c55e'
                   : s >= 12 ? '#4ade80'
                   : s >= 8  ? '#fbbf24'
                   :            '#64748b';

  // Position size label
  const posNote = s >= 15 ? '2%' : s >= 12 ? '1–2%' : s >= 8 ? '1%' : '—';

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      {/* ── Collapsed row ── */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}
        className="hover:bg-white/5 transition-colors"
        data-testid={`insider-row-${item.symbol}`}
      >
        <ScoreDot score={item.score} adjScore={s} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: Symbol + Status + Window */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: C.textPrimary }}>{item.symbol}</span>
            {/* Status badge */}
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: '0.07em',
              padding: '2px 7px', borderRadius: 4,
              background: sm.bg, border: `1px solid ${sm.border}`, color: sm.text,
            }}>{item.status}</span>
            {/* Window badge */}
            {item.window && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                background: `${item.window_color || '#94a3b8'}15`,
                color: item.window_color || '#94a3b8',
                border: `1px solid ${item.window_color || '#94a3b8'}30`,
              }}>{item.window} · {item.window_label}</span>
            )}
            {/* Cluster badge */}
            {item.cluster && (
              <span style={{
                fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
                border: '1px solid rgba(245,158,11,0.35)',
              }}>
                CLUSTER {item.cluster_info?.count}x / {item.cluster_info?.value_cr}Cr
              </span>
            )}
          </div>

          {/* Row 2: Key metrics inline */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Score */}
            <span style={{ fontSize: 10, fontWeight: 800, color: scoreColor, fontFamily: 'monospace' }}>
              {s}/{item.score_max ?? 20}
            </span>
            {/* Vol ratio */}
            {item.vol_ratio > 0 && (
              <span style={{ fontSize: 9, color: item.vol_ratio >= 1.8 ? '#4ade80' : C.textSecond }}>
                Del {item.vol_ratio}×
              </span>
            )}
            {/* Breakout */}
            {item.price_breakout && (
              <span style={{ fontSize: 8, color: '#22c55e', fontWeight: 700 }}>▲20DMA</span>
            )}
            {/* Value */}
            {item.total_value_cr > 0 && (
              <span style={{ fontSize: 9, color: C.textSecond }}>
                ₹{item.total_value_cr >= 1 ? `${item.total_value_cr.toFixed(1)}Cr` : `${item.total_value_lakh?.toFixed(0)}L`}
              </span>
            )}
            {/* Price */}
            {item.price > 0 && (
              <span style={{ fontSize: 9, fontWeight: 700, color: C.textPrimary, fontFamily: 'monospace' }}>
                ₹{item.price.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {/* Row 3: Company + Mode + Position hint */}
          <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, color: C.textSecond }} className="truncate">
              {item.merged_buyer && item.merged_buyer !== item.insiders?.[0]?.name
                ? `${item.merged_buyer}${item.entity_count > 1 ? ` (+${item.entity_count - 1} entities)` : ''}`
                : item.company}
            </span>
            {item.insiders?.[0]?.mode && (
              <span style={{
                fontSize: 8, color: '#06b6d4', fontWeight: 700,
                background: 'rgba(6,182,212,0.10)', padding: '1px 5px', borderRadius: 3,
              }}>{item.insiders[0].mode}</span>
            )}
            {/* v3 badges */}
            {item.z && item.z !== 1 && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                color: item.z >= 3 ? '#4ade80' : item.z < 1 ? '#f87171' : '#94a3b8',
                background: item.z >= 3 ? 'rgba(34,197,94,0.12)' : item.z < 1 ? 'rgba(239,68,68,0.10)' : 'transparent',
              }}>z={item.z}</span>
            )}
            {item.block_tape && item.block_tape !== 'NONE' && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                color: item.block_tape === 'BUY' ? '#4ade80' : '#f87171',
                background: item.block_tape === 'BUY' ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
              }}>Block: {item.block_tape}</span>
            )}
            {!item.rejected && (item.adj_score ?? item.score) >= 8 && item.module_on !== false && (
              <span style={{ fontSize: 8, color: '#a78bfa', fontWeight: 700 }}>
                Size: {item.position_size || posNote}
              </span>
            )}
            {item.module_on === false && (
              <span style={{ fontSize: 8, color: '#f87171', fontWeight: 700 }}>
                Module OFF
              </span>
            )}
          </div>
        </div>

        <div style={{ flexShrink: 0, marginTop: 2 }}>
          {expanded ? <CaretDown size={12} color={C.textSecond} /> : <CaretRight size={12} color={C.textSecond} />}
        </div>
      </div>

      {/* ── Expanded section ── */}
      {expanded && (
        <div style={{ padding: '4px 14px 14px 14px', background: C.rowBg }}>

          {/* Reject reason */}
          {item.rejected && item.reject_reason && (
            <div style={{
              padding: '7px 10px', borderRadius: 6, marginBottom: 8,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              fontSize: 10, color: '#f87171',
            }}>
              Auto-Rejected — {item.reject_reason}
            </div>
          )}

          {/* v3 Output Card */}
          {!item.rejected && (
            <div style={{
              padding: '7px 10px', borderRadius: 6, marginBottom: 8,
              background: C.cardBg, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.textSecond, letterSpacing: '0.06em', marginBottom: 5 }}>
                v3 OUTPUT CARD
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '3px 10px' }}>
                {[
                  ['STOCK',         item.symbol],
                  ['MERGED BUYER',  item.merged_buyer || '—'],
                  ['SCORE',         `${item.adj_score ?? item.score}/${item.score_max ?? 20}`],
                  ['z',             item.z != null ? item.z : '1.0'],
                  ['CLUSTER',       item.cluster ? `Yes — ${item.cluster_info?.count}× / ₹${item.cluster_info?.value_cr}Cr` : 'No'],
                  ['PLEDGE 7D',     item.pledge_7d || 'N/A'],
                  ['BLOCK TAPE',    item.block_tape || 'NONE'],
                  ['MODULE',        item.module_on !== false ? 'ON' : `OFF — ${item.module_reason}`],
                  ['STATUS',        item.status],
                  ['INDEX SCORE',   `${item.index_score >= 0 ? '+' : ''}${item.index_score ?? 0} DOOM`],
                  ['SIZE',          item.position_size || '—'],
                ].map(([lbl, val]) => (
                  <React.Fragment key={lbl}>
                    <span style={{ fontSize: 8, color: C.textSecond, fontWeight: 700, textTransform: 'uppercase' }}>{lbl}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: C.textPrimary }}>{String(val)}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* God Score breakdown */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: C.textSecond, letterSpacing: '0.07em', marginBottom: 4 }}>
              GOD SCORE FACTORS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {item.factors?.map((f, i) => <GodFactor key={i} tag={f} C={C} />)}
            </div>
          </div>

          {/* Confirm stack */}
          {!item.rejected && (
            <div style={{
              padding: '7px 10px', borderRadius: 6, marginBottom: 8,
              background: C.cardBg, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.textSecond, letterSpacing: '0.06em', marginBottom: 5 }}>
                CONFIRM STACK (2 of 3 needed to trade)
              </div>
              {[
                { label: '2-day delivery > 1.5×', ok: item.vol_ratio >= 1.5, val: `${item.vol_ratio}×` },
                { label: 'Higher low + 20DMA hold', ok: item.price_breakout,  val: item.price_breakout ? 'YES' : 'WATCH' },
                { label: 'OI ↑ + Price ↑ (F&O stocks)', ok: null, val: 'N/A' },
              ].map(({ label, ok, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: C.textSecond }}>{label}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    color: ok === true ? '#4ade80' : ok === false ? '#f87171' : '#94a3b8',
                  }}>{val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Position rules */}
          {!item.rejected && s >= 8 && (
            <div style={{
              padding: '7px 10px', borderRadius: 6, marginBottom: 8,
              background: C.cardBg, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.textSecond, letterSpacing: '0.06em', marginBottom: 5 }}>
                POSITION RULES
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}>
                {[
                  ['Capital limit', '5% total (module)'],
                  ['Per stock',     posNote + ' of book'],
                  ['SL',            item.sl_note || 'Filing-week low'],
                  ['T1 target',     '+8–12%'],
                  ['T2 target',     '+18–25% trail'],
                  ['Time stop',     '20 sessions'],
                ].map(([lbl, val]) => (
                  <React.Fragment key={lbl}>
                    <span style={{ fontSize: 8, color: C.textSecond }}>{lbl}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: C.textPrimary }}>{val}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Insider transactions */}
          <div style={{ fontSize: 9, fontWeight: 800, color: C.textSecond, letterSpacing: '0.06em', marginBottom: 4 }}>
            L1 FILING DATA
          </div>
          <div style={{ borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {item.insiders?.map((ins, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 80px 65px',
                padding: '6px 10px', gap: 6, alignItems: 'center',
                background: i % 2 === 0 ? C.cardBg : 'transparent',
                borderBottom: i < item.insiders.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textPrimary }}>{ins.name}</div>
                  <div style={{ fontSize: 8, color: ins.category === 'PROMOTER' ? '#f59e0b' : '#94a3b8' }}>
                    {ins.category} · {ins.date || ''}
                  </div>
                </div>
                <div style={{ fontSize: 9, color: C.textSecond, textAlign: 'center' }}>{ins.mode}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textPrimary, textAlign: 'right' }}>
                  {ins.shares ? ins.shares.toLocaleString('en-IN') : '—'}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', textAlign: 'right' }}>
                  {ins.value_lakh > 0 ? `₹${ins.value_lakh.toFixed(1)}L` : '—'}
                </div>
              </div>
            ))}
          </div>

          {item.total_value_cr > 0 && (
            <div style={{ marginTop: 5, fontSize: 10, color: '#4ade80', fontWeight: 700, textAlign: 'right' }}>
              Total: ₹{item.total_value_cr.toFixed(2)} Cr · {item.days_since}d ago
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pattern Scan Row ───────────────────────────────────────────────────────

function TechBadge({ ok, label, color }) {
  if (ok == null) return null;
  return (
    <span style={{
      fontSize: 7, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
      background: ok ? `${color}20` : 'rgba(100,116,139,0.12)',
      color:      ok ? color         : '#64748b',
      border:    `1px solid ${ok ? color + '40' : '#64748b30'}`,
      letterSpacing: '0.04em',
    }}>{label}</span>
  );
}

function PatternRow({ item, C }) {
  const [expanded, setExpanded] = useState(false);
  const emaOk = item.ema_score >= 2;

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
        className="hover:bg-white/5 transition-colors"
        data-testid={`pattern-row-${item.symbol}`}
      >
        {/* Bias icon */}
        {(() => {
          const bm  = biasMeta[item.top_bias] || biasMeta.NEUTRAL;
          const Ico = bm.icon;
          return (
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${bm.color}20`, border: `1px solid ${bm.color}50`, flexShrink: 0,
            }}>
              <Ico size={16} color={bm.color} weight="bold" />
            </div>
          );
        })()}

        {/* Symbol + name + indicator badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: C.textPrimary }}>{item.symbol}</span>
            <span style={{ fontSize: 9, color: C.textSecond }}>{item.sector}</span>
          </div>
          <div style={{ fontSize: 10, color: C.textSecond, marginTop: 1 }}>{item.top_pattern}</div>
          {/* Indicator badges row */}
          <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
            <TechBadge ok={item.near_52w_high} label="52W HIGH" color="#f59e0b" />
            <TechBadge
              ok={emaOk}
              label={`EMA ${item.ema_score ?? '?'}/3`}
              color={item.ema_score >= 3 ? '#22c55e' : item.ema_score >= 2 ? '#86efac' : '#f87171'}
            />
            <TechBadge
              ok={item.momentum_ok}
              label={item.rsi != null ? `RSI ${item.rsi}` : 'MOMENTUM'}
              color="#818cf8"
            />
            <TechBadge
              ok={item.volume_ok}
              label={item.vol_ratio != null ? `VOL ${item.vol_ratio}x` : 'VOLUME'}
              color="#06b6d4"
            />
          </div>
        </div>

        {/* Timeframe badge + count */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
            padding: '2px 6px', borderRadius: 3,
            background: `${TF_COLORS[item.top_tf] || '#94a3b8'}20`,
            border: `1px solid ${TF_COLORS[item.top_tf] || '#94a3b8'}50`,
            color: TF_COLORS[item.top_tf] || '#94a3b8',
          }}>{item.top_tf}</span>
          {item.pattern_count > 1 && (
            <span style={{ fontSize: 9, color: C.textSecond }}>+{item.pattern_count - 1} more</span>
          )}
        </div>

        {/* Price */}
        <div style={{ textAlign: 'right', minWidth: 55 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>
            ₹{item.price > 0 ? item.price.toLocaleString('en-IN') : '—'}
          </div>
        </div>

        {expanded ? <CaretDown size={12} color={C.textSecond} /> : <CaretRight size={12} color={C.textSecond} />}
      </div>

      {/* Expanded: all patterns across TFs */}
      {expanded && (
        <div style={{ padding: '0 14px 12px 54px', background: C.rowBg }}>
          <div style={{ fontSize: 10, color: C.textSecond, marginBottom: 6, fontWeight: 700, letterSpacing: '0.06em' }}>
            DETECTED PATTERNS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {item.patterns?.map((p, i) => {
              const bm  = biasMeta[p.bias] || biasMeta.NEUTRAL;
              return (
                <div key={i} style={{
                  padding: '8px 10px', borderRadius: 6,
                  background: C.cardBg, border: `1px solid ${C.border}`,
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  {/* TF + bias */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 50 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3,
                      background: `${TF_COLORS[p.timeframe] || '#94a3b8'}20`,
                      color: TF_COLORS[p.timeframe] || '#94a3b8',
                      border: `1px solid ${TF_COLORS[p.timeframe] || '#94a3b8'}40`,
                      textAlign: 'center',
                    }}>{p.timeframe_display}</span>
                    <span style={{ fontSize: 9, color: bm.color, fontWeight: 700, textAlign: 'center' }}>{bm.label}</span>
                  </div>

                  {/* Pattern name + description */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, marginBottom: 3 }}>
                      {p.pattern}
                    </div>
                    <div style={{ fontSize: 10, color: C.textSecond, lineHeight: 1.4 }}>{p.description}</div>
                  </div>

                  {/* Confidence */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: bm.color }}>{p.confidence}%</div>
                    <div style={{ fontSize: 8, color: C.textSecond }}>Confidence</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  STOCK NEWS FEED
// ═══════════════════════════════════════════════════════════════════════════

const SECTOR_COLORS = {
  Banking:     '#818cf8', IT:          '#06b6d4', NBFC:        '#f59e0b',
  Auto:        '#22c55e', Pharma:      '#ec4899', Energy:      '#f97316',
  Metals:      '#94a3b8', FMCG:        '#a78bfa', Telecom:     '#34d399',
  Power:       '#fbbf24', Infra:       '#60a5fa', Ports:       '#fb923c',
  Realty:      '#e879f9', Retail:      '#4ade80', Internet:    '#38bdf8',
  Electronics: '#facc15', Cables:      '#c084fc', Electricals: '#86efac',
  'Agro Chem': '#6ee7b7', Chemicals:   '#fca5a5',
};

const ALL_SECTORS = ['All', ...Object.keys(SECTOR_COLORS)];

function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StockNewsFeed({ C, isDark }) {
  const [newsData,    setNewsData]    = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [sectorFilter, setSectorFilter] = useState('All');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (force) params.set('refresh', 'true');
      const res  = await fetch(`${API}/insider/stock-news?${params}`);
      const json = await res.json();
      setNewsData(json);
    } catch {
      setNewsData({ news: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const t = setInterval(() => load(), 10 * 60 * 1000); // auto-refresh 10 min
    return () => clearInterval(t);
  }, [load, autoRefresh]);

  const news = newsData?.news || [];
  const filtered = sectorFilter === 'All'
    ? news
    : news.filter(n => n.sector === sectorFilter);

  const uniqueSectors = ['All', ...new Set(news.map(n => n.sector).filter(Boolean))];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderBottom: `1px solid ${C.border}`,
        background: C.headerBg, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <Newspaper size={13} color="#06b6d4" weight="bold" />
        <span style={{ fontSize: 10, fontWeight: 800, color: C.textPrimary, letterSpacing: '0.04em' }}>
          LIVE STOCK NEWS
        </span>
        {newsData?.updated_at && (
          <span style={{ fontSize: 8, color: C.textSecond, marginLeft: 2 }}>
            {newsData.cached ? 'Cached' : 'Live'} · {new Date(newsData.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 8, color: C.textSecond }}>
            {filtered.length} stories
          </span>
          <button
            onClick={() => load(true)}
            disabled={loading}
            data-testid="news-refresh-btn"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, opacity: loading ? 0.4 : 1 }}
          >
            <ArrowClockwise size={13} color={C.textSecond} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Sector filter chips ── */}
      <div style={{
        display: 'flex', gap: 5, padding: '6px 14px',
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        overflowX: 'auto', whiteSpace: 'nowrap',
      }}>
        {uniqueSectors.map(sec => {
          const active = sectorFilter === sec;
          const col = SECTOR_COLORS[sec] || '#06b6d4';
          return (
            <button
              key={sec}
              onClick={() => setSectorFilter(sec)}
              data-testid={`news-sector-${sec.toLowerCase()}`}
              style={{
                fontSize: 8, fontWeight: 800, padding: '3px 8px', borderRadius: 20,
                border: `1px solid ${active ? col : C.border}`,
                background: active ? `${col}22` : 'transparent',
                color: active ? col : C.textSecond,
                cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
              }}
            >{sec}</button>
          );
        })}
      </div>

      {/* ── News list ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && !newsData ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '3px solid #27272a', borderTopColor: '#06b6d4',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 10, color: C.textSecond }}>
              Fetching news for {35} F&O stocks…
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textSecond }}>
            <Newspaper size={28} color={C.textSecond} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 12 }}>No recent news found</div>
            <button
              onClick={() => load(true)}
              style={{
                marginTop: 12, padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(6,182,212,0.15)', color: '#06b6d4',
                border: '1px solid rgba(6,182,212,0.35)', fontSize: 11, fontWeight: 700,
              }}
            >Refresh Now</button>
          </div>
        ) : (
          filtered.map((item, i) => {
            const secColor = SECTOR_COLORS[item.sector] || '#94a3b8';
            const pct      = item.price_change ?? 0;
            const isPos    = pct > 0;
            const isNeg    = pct < 0;
            const PriceIco = isPos ? ArrowUp : isNeg ? ArrowDown : Minus;

            return (
              <div
                key={`${item.symbol}-${item.published_at}-${i}`}
                data-testid={`news-item-${i}`}
                style={{
                  padding: '10px 14px',
                  borderBottom: `1px solid ${C.border}`,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Row 1: symbol + time + price */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Symbol badge */}
                    <span style={{
                      fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 4,
                      background: `${secColor}20`, color: secColor, border: `1px solid ${secColor}40`,
                      letterSpacing: '0.05em',
                    }}>{item.symbol}</span>
                    {/* Sector tag */}
                    <span style={{ fontSize: 8, color: C.textSecond }}>{item.sector}</span>
                  </div>

                  {/* Price impact */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {item.current_price > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.textSecond, fontFamily: 'monospace' }}>
                        ₹{item.current_price.toLocaleString('en-IN')}
                      </span>
                    )}
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 2,
                      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                      background: item.impact_bg,
                      color: item.impact_color,
                      border: `1px solid ${item.impact_color}40`,
                    }}>
                      <PriceIco size={8} weight="bold" />
                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Row 2: headline */}
                {item.link ? (
                  <a
                    href={item.link} target="_blank" rel="noopener noreferrer"
                    style={{
                      fontSize: 11, fontWeight: 600, color: C.textPrimary,
                      lineHeight: 1.4, display: 'block', textDecoration: 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#06b6d4'}
                    onMouseLeave={e => e.currentTarget.style.color = C.textPrimary}
                  >
                    {item.title}
                  </a>
                ) : (
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textPrimary, lineHeight: 1.4 }}>
                    {item.title}
                  </div>
                )}

                {/* Row 3: publisher + time + impact label */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                  <span style={{ fontSize: 9, color: C.textSecond }}>
                    {item.publisher}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 7, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                      background: item.impact_bg, color: item.impact_color,
                    }}>{item.impact}</span>
                    <span style={{ fontSize: 8, color: C.textSecond }}>
                      {timeAgo(item.published_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 14px', borderTop: `1px solid ${C.border}`,
        background: C.headerBg, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 8, color: C.textSecond }}>
          Source: yfinance · {35} F&O stocks · Cache: 10 min
        </span>
        <span style={{ fontSize: 8, color: C.textSecond }}>
          {newsData?.total || 0} total stories
        </span>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  ECONOMIC CALENDAR
// ═══════════════════════════════════════════════════════════════════════════

const IMPACT_STYLE = {
  HIGH:   { bg: 'rgba(239,68,68,0.15)',   border: '#ef4444', text: '#f87171'  },
  MEDIUM: { bg: 'rgba(245,158,11,0.12)',  border: '#f59e0b', text: '#fbbf24'  },
  LOW:    { bg: 'rgba(148,163,184,0.10)', border: '#64748b', text: '#94a3b8'  },
};

const CAT_META = {
  RBI:   { color: '#818cf8', label: 'RBI'   },
  INDIA: { color: '#22c55e', label: 'INDIA' },
  US:    { color: '#f97316', label: 'US'    },
  FNO:   { color: '#06b6d4', label: 'F&O'  },
};

const SEASONAL_MONTHS = [
  { month: 'April',    rating: 'Strongest',    color: '#22c55e', behavior: 'New FY fund deployment'         },
  { month: 'November', rating: 'Very Strong',  color: '#4ade80', behavior: 'Festival + year-end positioning' },
  { month: 'December', rating: 'Strong',       color: '#06b6d4', behavior: 'Year-end rally'                  },
  { month: 'July',     rating: 'Mildly Strong',color: '#facc15', behavior: 'Earnings + rural demand'         },
  { month: 'February', rating: 'Weakest',      color: '#ef4444', behavior: 'Budget uncertainty'              },
  { month: 'August',   rating: 'Weak',         color: '#f97316', behavior: 'Monsoon + global weakness'       },
  { month: 'March',    rating: 'Weak',         color: '#f97316', behavior: 'FY-end selling'                  },
];

const SECTOR_SEASONAL = [
  { sector: 'Auto',           icon: '🚗', best: 'April, Oct–Nov',        worst: 'January'           },
  { sector: 'Metal',          icon: '⚙️', best: 'April, Dec',            worst: 'January'           },
  { sector: 'Pharma',         icon: '💊', best: 'April, Jul–Sep',        worst: 'January'           },
  { sector: 'IT',             icon: '💻', best: 'July–Sep',              worst: 'Feb / April'       },
  { sector: 'Bank / PSU Bank',icon: '🏦', best: 'Oct–Nov',               worst: 'February'          },
  { sector: 'Realty',         icon: '🏗️', best: 'Dec, Oct–Nov',          worst: 'February'          },
  { sector: 'Oil & Gas',      icon: '⛽', best: 'April',                 worst: 'February'          },
  { sector: 'FMCG',           icon: '🛒', best: 'Oct–Dec',               worst: 'Monsoon variable'  },
  { sector: 'Energy / Power', icon: '⚡', best: 'May–Jun',               worst: '—'                 },
  { sector: 'Infra / Cap Goods',icon:'🏛️',best: 'Feb (Budget), Aug–Sep', worst: '—'                 },
];

function EconomicCalendar({ C }) {
  const now = new Date();
  const [viewMonth,    setViewMonth]    = useState(now.getMonth() + 1);
  const [viewYear,     setViewYear]     = useState(now.getFullYear());
  const [ecoData,      setEcoData]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [showSeasonal, setShowSeasonal] = useState(true);
  const [showSector,   setShowSector]   = useState(true);

  const load = useCallback(async (m, y) => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/insider/economic-calendar?month=${m}&year=${y}`);
      const json = await res.json();
      setEcoData(json);
    } catch {
      setEcoData({ events: [], month_name: '' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(viewMonth, viewYear); }, [viewMonth, viewYear, load]);

  const goPrev = () => {
    if (!ecoData?.has_prev) return;
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const goNext = () => {
    if (!ecoData?.has_next) return;
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const events  = ecoData?.events || [];
  const today   = ecoData?.today  || '';

  // Group by date
  const grouped = events.reduce((acc, e) => {
    acc[e.date] = acc[e.date] || [];
    acc[e.date].push(e);
    return acc;
  }, {});

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Month navigator ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
        background: C.headerBg, flexShrink: 0,
      }}>
        <button
          onClick={goPrev}
          disabled={!ecoData?.has_prev}
          style={{ background: 'none', border: 'none', cursor: ecoData?.has_prev ? 'pointer' : 'default',
            opacity: ecoData?.has_prev ? 1 : 0.3, color: C.textSecond, padding: '2px 6px' }}
          data-testid="eco-prev-month"
        >
          <CaretLeft size={14} weight="bold" />
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary, letterSpacing: '0.04em' }}>
            {ecoData?.month_name || '—'} {viewYear}
          </div>
          <div style={{ fontSize: 9, color: C.textSecond, marginTop: 1 }}>
            Indian Market Economic Events
          </div>
        </div>

        <button
          onClick={goNext}
          disabled={!ecoData?.has_next}
          style={{ background: 'none', border: 'none', cursor: ecoData?.has_next ? 'pointer' : 'default',
            opacity: ecoData?.has_next ? 1 : 0.3, color: C.textSecond, padding: '2px 6px' }}
          data-testid="eco-next-month"
        >
          <CaretRightIcon size={14} weight="bold" />
        </button>
      </div>

      {/* ── Category + Impact legend ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
        borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap',
      }}>
        {Object.entries(CAT_META).map(([cat, m]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: 2, background: m.color }} />
            <span style={{ fontSize: 8, color: C.textSecond, fontWeight: 700 }}>{m.label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
          {[['HIGH', '#ef4444'], ['MED', '#f59e0b'], ['LOW', '#64748b']].map(([l, c]) => (
            <span key={l} style={{
              fontSize: 7, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
              background: `${c}20`, color: c, border: `1px solid ${c}40`,
            }}>{l}</span>
          ))}
        </div>
      </div>

      {/* ── Events list ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              border: '3px solid #27272a', borderTopColor: '#06b6d4',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textSecond }}>
            <CalendarBlank size={28} color={C.textSecond} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 12 }}>Is month ke events available nahi hain</div>
          </div>
        ) : (
          Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dayEvents]) => {
              const isPast  = date < today;
              const isToday = date === today;
              const d = new Date(date + 'T00:00:00');
              const dayLabel = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

              return (
                <div key={date} style={{
                  padding: '8px 14px',
                  borderBottom: `1px solid ${C.border}`,
                  opacity: isPast ? 0.62 : 1,
                }}>
                  {/* Date pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '2px 9px', borderRadius: 20,
                      background: isToday ? 'rgba(6,182,212,0.18)' : (isPast ? 'rgba(148,163,184,0.08)' : 'rgba(255,255,255,0.05)'),
                      color:  isToday ? '#06b6d4' : C.textSecond,
                      border: isToday ? '1px solid rgba(6,182,212,0.40)' : `1px solid ${C.border}`,
                    }}>{dayLabel}</span>
                    {isToday && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: '#06b6d4', letterSpacing: '0.12em' }}>
                        TODAY
                      </span>
                    )}
                    {isPast && (
                      <span style={{ fontSize: 7, color: C.textSecond, letterSpacing: '0.06em' }}>PAST</span>
                    )}
                  </div>

                  {/* Events for this day */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 2 }}>
                    {dayEvents.map((ev, i) => {
                      const imp  = IMPACT_STYLE[ev.impact] || IMPACT_STYLE.LOW;
                      const catC = CAT_META[ev.category]?.color || '#94a3b8';
                      const hasNum = ev.prev || ev.forecast || (ev.actual && ev.actual !== 'Released' && ev.actual !== 'Presented');

                      return (
                        <div
                          key={i}
                          data-testid={`eco-event-${date}-${i}`}
                          style={{
                            padding: '8px 10px', borderRadius: 7,
                            background: C.cardBg,
                            border: `1px solid ${C.border}`,
                            borderLeft: `3px solid ${catC}`,
                          }}
                        >
                          {/* Event name + badges */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: C.textPrimary, lineHeight: 1.35 }}>
                                {ev.event}
                              </div>
                              {ev.note && (
                                <div style={{ fontSize: 9, color: C.textSecond, marginTop: 2, lineHeight: 1.3 }}>
                                  {ev.note}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, alignItems: 'flex-end' }}>
                              <span style={{
                                fontSize: 7, fontWeight: 800, padding: '2px 5px', borderRadius: 3,
                                background: `${catC}20`, color: catC, border: `1px solid ${catC}40`,
                              }}>{CAT_META[ev.category]?.label || ev.category}</span>
                              <span style={{
                                fontSize: 7, fontWeight: 800, padding: '2px 5px', borderRadius: 3,
                                background: imp.bg, color: imp.text, border: `1px solid ${imp.border}50`,
                              }}>{ev.impact}</span>
                            </div>
                          </div>

                          {/* Prev / Forecast / Actual */}
                          {(hasNum || ev.actual === 'Released' || ev.actual === 'Presented') && (
                            <div style={{
                              display: 'flex', gap: 14, marginTop: 7, paddingTop: 6,
                              borderTop: `1px solid ${C.border}`,
                            }}>
                              {[
                                ['Prev',     ev.prev,     C.textSecond],
                                ['Forecast', ev.forecast, '#60a5fa'   ],
                                ['Actual',   ev.actual,   ev.actual && ev.actual !== '' && ev.actual !== '—' ? '#4ade80' : C.textSecond],
                              ].map(([label, val, color]) => val && val !== '' ? (
                                <div key={label}>
                                  <div style={{ fontSize: 7, color: C.textSecond, letterSpacing: '0.06em', marginBottom: 1 }}>
                                    {label.toUpperCase()}
                                  </div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color, fontFamily: 'monospace' }}>
                                    {val}
                                  </div>
                                </div>
                              ) : null)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* ── Seasonal Monthly Behaviour ── */}
      <div style={{
        borderTop: `1px solid ${C.border}`,
        background: C.headerBg,
        flexShrink: 0,
      }}>
        {/* Header toggle */}
        <div
          onClick={() => setShowSeasonal(s => !s)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 14px', cursor: 'pointer',
            borderBottom: showSeasonal ? `1px solid ${C.border}` : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 8, letterSpacing: '0.05em', color: '#06b6d4', fontWeight: 800 }}>
              ★
            </span>
            <span style={{ fontSize: 9, fontWeight: 800, color: C.textPrimary, letterSpacing: '0.05em' }}>
              OVERALL BEST &amp; WORST MONTHS
            </span>
            <span style={{
              fontSize: 7, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
              background: 'rgba(6,182,212,0.12)', color: '#06b6d4',
              border: '1px solid rgba(6,182,212,0.30)',
            }}>NIFTY 50</span>
          </div>
          <span style={{ fontSize: 9, color: C.textSecond, lineHeight: 1 }}>
            {showSeasonal ? '▲' : '▼'}
          </span>
        </div>

        {showSeasonal && (
          <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '72px 88px 1fr',
              gap: 6, padding: '3px 10px 5px',
              borderBottom: `1px solid ${C.border}`,
            }}>
              {['Month', 'Generally', 'Average Behaviour'].map(h => (
                <span key={h} style={{ fontSize: 7, fontWeight: 800, color: C.textSecond, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {h}
                </span>
              ))}
            </div>
            {/* Rows */}
            {SEASONAL_MONTHS.map(item => (
              <div
                key={item.month}
                style={{
                  display: 'grid', gridTemplateColumns: '72px 88px 1fr',
                  alignItems: 'center', gap: 6,
                  padding: '5px 8px', borderRadius: 6,
                  background: C.cardBg,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${item.color}`,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 800, color: C.textPrimary }}>{item.month}</span>
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                  background: `${item.color}20`, color: item.color,
                  border: `1px solid ${item.color}40`,
                  textAlign: 'center', whiteSpace: 'nowrap',
                }}>{item.rating}</span>
                <span style={{ fontSize: 9, color: C.textSecond, lineHeight: 1.35 }}>{item.behavior}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sector-wise Seasonal Table ── */}
      <div style={{
        borderTop: `1px solid ${C.border}`,
        background: C.headerBg,
        flexShrink: 0,
      }}>
        {/* Header toggle */}
        <div
          onClick={() => setShowSector(s => !s)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 14px', cursor: 'pointer',
            borderBottom: showSector ? `1px solid ${C.border}` : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 8, color: '#a78bfa', fontWeight: 800 }}>◈</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: C.textPrimary, letterSpacing: '0.05em' }}>
              SECTOR-WISE BEST / WORST MONTH
            </span>
          </div>
          <span style={{ fontSize: 9, color: C.textSecond, lineHeight: 1 }}>
            {showSector ? '▲' : '▼'}
          </span>
        </div>

        {showSector && (
          <div style={{ padding: '8px 10px 10px' }}>
            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '100px 1fr 1fr',
              gap: 4, padding: '3px 8px 5px',
              borderBottom: `1px solid ${C.border}`,
              marginBottom: 4,
            }}>
              {['Sector', 'Best Month', 'Worst Month'].map(h => (
                <span key={h} style={{ fontSize: 7, fontWeight: 800, color: C.textSecond, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {h}
                </span>
              ))}
            </div>
            {/* Rows */}
            {SECTOR_SEASONAL.map(item => (
              <div
                key={item.sector}
                style={{
                  display: 'grid', gridTemplateColumns: '100px 1fr 1fr',
                  alignItems: 'center', gap: 4,
                  padding: '5px 8px', borderRadius: 6,
                  marginBottom: 3,
                  background: C.cardBg,
                  border: `1px solid ${C.border}`,
                }}
              >
                {/* Sector */}
                <span style={{ fontSize: 9, fontWeight: 700, color: C.textPrimary, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10 }}>{item.icon}</span>
                  {item.sector}
                </span>
                {/* Best */}
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(34,197,94,0.12)', color: '#4ade80',
                  border: '1px solid rgba(34,197,94,0.25)',
                  textAlign: 'center',
                }}>{item.best}</span>
                {/* Worst */}
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: item.worst === '—' ? 'transparent' : 'rgba(239,68,68,0.10)',
                  color: item.worst === '—' ? C.textSecond : '#f87171',
                  border: item.worst === '—' ? 'none' : '1px solid rgba(239,68,68,0.25)',
                  textAlign: 'center',
                }}>{item.worst}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div style={{
        padding: '6px 14px', borderTop: `1px solid ${C.border}`,
        background: C.headerBg, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 8, color: C.textSecond }}>
          Source: RBI, NSE, MoSPI, US BLS · Curated for Indian traders
        </span>
        <span style={{ fontSize: 8, color: C.textSecond }}>IST</span>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function InsiderTracker({ onClose, onPatternLoad }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const C = {
    panelBg:    isDark ? '#0f1117'               : '#ffffff',
    headerBg:   isDark ? '#0a0d14'               : '#f8fafc',
    cardBg:     isDark ? '#181c27'               : '#f1f5f9',
    rowBg:      isDark ? '#13161f'               : '#f8fafc',
    border:     isDark ? 'rgba(255,255,255,0.08)': 'rgba(0,0,0,0.10)',
    textPrimary: isDark ? '#ffffff'              : '#0f172a',
    textSecond:  isDark ? '#94a3b8'              : '#475569',
    tabActive:   '#06b6d4',
  };

  const [tab, setTab]               = useState('insider');     // 'insider' | 'patterns'
  const [insiderData, setInsiderData] = useState(null);
  const [patternData, setPatternData] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [updatedAt, setUpdatedAt]   = useState(null);

  // Pattern filters
  const [tfFilter,    setTfFilter]    = useState('');
  const [biasFilter,  setBiasFilter]  = useState('');
  const [patFilter,   setPatFilter]   = useState('');
  // Technical filters
  const [f52w,        setF52w]        = useState(false);
  const [fEma,        setFEma]        = useState(0);    // 0=off, 1=1+, 2=2+, 3=all3
  const [fMomentum,   setFMomentum]   = useState(false);
  const [fVolume,     setFVolume]     = useState(false);

  const fetchInsider = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/insider/detections${forceRefresh ? '?refresh=true' : ''}`);
      const json = await res.json();
      setInsiderData(json);
      setUpdatedAt(json.updated_at);
    } catch (e) {
      setInsiderData({ detections: [], error: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPatterns = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (forceRefresh) params.set('refresh',   'true');
      if (tfFilter)     params.set('timeframe',  tfFilter);
      if (biasFilter)   params.set('bias',        biasFilter);
      if (patFilter)    params.set('pattern',     patFilter);
      if (f52w)         params.set('near_52w',   'true');
      if (fEma > 0)     params.set('above_ema',  String(fEma));
      if (fMomentum)    params.set('momentum',   'true');
      if (fVolume)      params.set('vol_ok',     'true');
      const res  = await fetch(`${API}/insider/pattern-scan?${params}`);
      const json = await res.json();
      setPatternData(json);
      setUpdatedAt(json.updated_at);
    } catch (e) {
      setPatternData({ results: [], error: e.message });
    } finally {
      setLoading(false);
    }
  }, [tfFilter, biasFilter, patFilter, f52w, fEma, fMomentum, fVolume]);

  // Notify parent when pattern count loads
  useEffect(() => {
    if (patternData?.count != null && onPatternLoad) {
      onPatternLoad(patternData.count);
    }
  }, [patternData, onPatternLoad]);

  // Fetch on tab switch
  useEffect(() => {
    if (tab === 'insider' && !insiderData) fetchInsider();
    if (tab === 'patterns' && !patternData) fetchPatterns();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    if (tab === 'insider') fetchInsider(true);
    else fetchPatterns(true);
  };

  // Filter chips for pattern tab
  const TF_OPTS   = ['', '15m', '1H', '1D'];
  const BIAS_OPTS = ['', 'BULLISH', 'BEARISH', 'NEUTRAL'];
  const PAT_OPTS  = ['', 'Double Top', 'Double Bottom', 'H&S', 'Inverse H&S', 'Bull Flag', 'Bear Flag', 'Cup & Handle', 'Range'];

  const insiders   = insiderData?.detections || [];
  const patterns   = patternData?.results    || [];
  const hasError   = tab === 'insider' ? insiderData?.error : patternData?.error;
  const fromHistory = insiderData?.from_history;
  const historyDate = insiderData?.history_date;
  const sourceLabel = insiderData?.source || '';

  return (
    <div
      data-testid="insider-tracker-panel"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
        padding: 12,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: '100%', maxWidth: 560, height: '100%', maxHeight: 'calc(100vh - 24px)',
          background: C.panelBg, borderRadius: 12,
          border: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
          background: C.headerBg, flexShrink: 0,
        }}>
          <Eye size={18} color="#06b6d4" weight="bold" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.textPrimary, letterSpacing: '0.02em' }}>
              INSIDER TRACKER
            </div>
            {updatedAt && (
              <div style={{ fontSize: 9, color: C.textSecond, marginTop: 1 }}>
                Updated {fmtTime(updatedAt)} IST
              </div>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, opacity: loading ? 0.5 : 1 }}
            title="Refresh"
            data-testid="insider-refresh-btn"
          >
            <ArrowClockwise size={16} color={C.textSecond} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            data-testid="insider-close-btn"
          >
            <X size={16} color={C.textSecond} />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: 'flex', borderBottom: `1px solid ${C.border}`,
          background: C.headerBg, flexShrink: 0,
        }}>
          {[
            { id: 'insider',  label: 'Insider Buys',    icon: Users         },
            { id: 'patterns', label: 'Pattern Scanner', icon: ChartBar      },
            { id: 'eco',      label: 'Eco Calendar',    icon: CalendarBlank },
            { id: 'news',     label: 'Stock News',      icon: Newspaper     },
          ].map(t => {
            const Ico = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                data-testid={`insider-tab-${t.id}`}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '10px 12px', border: 'none', cursor: 'pointer',
                  background: tab === t.id ? `${C.tabActive}15` : 'transparent',
                  borderBottom: tab === t.id ? `2px solid ${C.tabActive}` : '2px solid transparent',
                  color: tab === t.id ? C.tabActive : C.textSecond,
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', transition: 'all 0.15s',
                }}
              >
                <Ico size={13} weight="bold" />
                {t.label.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* ── Pattern filters (only shown on patterns tab) ── */}
        {tab === 'patterns' && (
          <div style={{
            display: 'flex', gap: 5, padding: '7px 12px',
            borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            <Funnel size={12} color={C.textSecond} />

            {/* ── Row 1: existing dropdowns ── */}
            <select value={tfFilter} onChange={e => setTfFilter(e.target.value)} data-testid="pattern-tf-filter"
              style={{ fontSize: 10, padding: '3px 7px', borderRadius: 4, background: C.cardBg, color: C.textPrimary, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
              <option value="">All TFs</option>
              {TF_OPTS.slice(1).map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            <select value={biasFilter} onChange={e => setBiasFilter(e.target.value)} data-testid="pattern-bias-filter"
              style={{ fontSize: 10, padding: '3px 7px', borderRadius: 4, background: C.cardBg, color: C.textPrimary, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
              <option value="">All Bias</option>
              {BIAS_OPTS.slice(1).map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            <select value={patFilter} onChange={e => setPatFilter(e.target.value)} data-testid="pattern-name-filter"
              style={{ fontSize: 10, padding: '3px 7px', borderRadius: 4, background: C.cardBg, color: C.textPrimary, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
              <option value="">All Patterns</option>
              {PAT_OPTS.slice(1).map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            {/* ── Technical filter toggles ── */}
            {[
              { label: '52W High',  active: f52w,      toggle: () => setF52w(v => !v),       color: '#f59e0b', testid: 'filter-52w'      },
              { label: 'Momentum', active: fMomentum,  toggle: () => setFMomentum(v => !v),  color: '#818cf8', testid: 'filter-momentum' },
              { label: 'Volume',   active: fVolume,    toggle: () => setFVolume(v => !v),    color: '#06b6d4', testid: 'filter-volume'   },
            ].map(({ label, active, toggle, color, testid }) => (
              <button
                key={label}
                onClick={toggle}
                data-testid={testid}
                style={{
                  fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 4,
                  background:  active ? `${color}22`     : 'transparent',
                  color:       active ? color             : C.textSecond,
                  border:     `1px solid ${active ? color + '50' : C.border}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >{label}</button>
            ))}

            {/* EMA select */}
            <select
              value={fEma}
              onChange={e => setFEma(Number(e.target.value))}
              data-testid="filter-ema"
              style={{
                fontSize: 9, padding: '3px 7px', borderRadius: 4,
                background: fEma > 0 ? 'rgba(34,197,94,0.12)' : C.cardBg,
                color:      fEma > 0 ? '#22c55e'               : C.textSecond,
                border:    `1px solid ${fEma > 0 ? '#22c55e50' : C.border}`,
                cursor: 'pointer', fontWeight: 800,
              }}
            >
              <option value={0}>EMA: Any</option>
              <option value={1}>EMA: 1+ above</option>
              <option value={2}>EMA: 2+ above</option>
              <option value={3}>EMA: All 3</option>
            </select>

            <button
              onClick={() => fetchPatterns(false)}
              style={{
                fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                background: `${C.tabActive}20`, color: C.tabActive,
                border: `1px solid ${C.tabActive}40`, cursor: 'pointer',
              }}
              data-testid="pattern-apply-filter"
            >
              Apply
            </button>
          </div>
        )}

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Loading spinner — only for insider/patterns tabs (eco has its own) */}
          {loading && tab !== 'eco' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                border: '3px solid #27272a', borderTopColor: '#06b6d4',
                animation: 'spin 0.8s linear infinite',
              }} />
              <div style={{ fontSize: 11, color: C.textSecond }}>
                {tab === 'patterns' ? `Scanning ${36} stocks across 3 timeframes…` : 'Fetching NSE disclosures…'}
              </div>
            </div>
          )}

          {/* Error */}
          {!loading && hasError && (
            <div style={{
              margin: 16, padding: '12px 14px', borderRadius: 8,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <Warning size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171' }}>
                  {tab === 'insider' ? 'NSE API Unavailable' : 'Scan Error'}
                </div>
                <div style={{ fontSize: 10, color: C.textSecond, marginTop: 3 }}>
                  {tab === 'insider'
                    ? 'NSE insider disclosures API is unreachable from cloud. Try again later.'
                    : hasError}
                </div>
              </div>
            </div>
          )}

          {/* ── INSIDER TAB ── */}
          {!loading && tab === 'insider' && !hasError && (
            <>
              {/* Score legend */}
              <div style={{
                display: 'flex', gap: 8, padding: '8px 14px',
                borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: 'wrap',
                alignItems: 'center',
              }}>
                {[
                  { label: '18–20 Rare',         color: '#a78bfa' },
                  { label: '15–17 Positional',   color: '#22c55e' },
                  { label: '12–14 Setup',        color: '#4ade80' },
                  { label: '8–11 Watch',         color: '#fbbf24' },
                  { label: '<8  Monitor',        color: '#64748b' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
                    <span style={{ fontSize: 8, color: C.textSecond, fontWeight: 700 }}>{s.label}</span>
                  </div>
                ))}
                <span style={{ fontSize: 8, color: '#fbbf24', fontWeight: 700 }}>│ Threshold: 12</span>
                {insiderData?.count !== undefined && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: C.textSecond }}>
                    {insiderData.count} · {sourceLabel}
                  </span>
                )}
                {insiderData?.count === undefined && insiders.length > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: C.textSecond }}>
                    {insiders.length} stocks · {sourceLabel}
                  </span>
                )}
              </div>

              {/* ── Module Status Banner ─────────────────────────────────── */}
              {insiders.length > 0 && (() => {
                const first = insiders[0];
                const modOn = first?.module_on !== false;
                const modReason = first?.module_reason || 'Active';
                const indexScore = first?.index_score ?? 0;
                const indexColor = indexScore >= 8 ? '#22c55e' : indexScore <= -4 ? '#ef4444' : '#fbbf24';
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    padding: '7px 14px',
                    borderBottom: `1px solid ${C.border}`,
                    background: modOn ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.06)',
                  }} data-testid="module-status-banner">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: modOn ? '#22c55e' : '#ef4444',
                        boxShadow: modOn ? '0 0 0 3px rgba(34,197,94,0.25)' : '0 0 0 3px rgba(239,68,68,0.25)',
                      }} />
                      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.07em',
                        color: modOn ? '#4ade80' : '#f87171' }}>
                        MODULE {modOn ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    {!modOn && (
                      <span style={{ fontSize: 8, color: '#f87171' }}>{modReason}</span>
                    )}
                    <span style={{ fontSize: 8, color: indexColor, fontWeight: 700 }}>
                      Index: {indexScore >= 0 ? '+' : ''}{indexScore} DOOM
                    </span>
                    <span style={{ fontSize: 8, color: C.textSecond, marginLeft: 'auto' }}>
                      Threshold: {first?.score_threshold ?? 15}+ · {insiders.length} stocks
                    </span>
                  </div>
                );
              })()}

              {/* ── Cluster Alert Banner ─────────────────────────────────── */}
              {(() => {
                const clusters = insiders.filter(i => i.cluster);
                if (!clusters.length) return null;
                const totalCr  = clusters.reduce((a, b) => a + (b.cluster_info?.value_cr || 0), 0);
                const totalBuys= clusters.reduce((a, b) => a + (b.cluster_info?.count || 0), 0);
                const buyers   = clusters.reduce((a, b) => a + (b.cluster_info?.buyers || 0), 0);
                return (
                  <div style={{
                    margin: '8px 14px 0',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(234,88,12,0.10) 100%)',
                    border: '1px solid rgba(245,158,11,0.50)',
                  }} data-testid="cluster-alert-banner">
                    {/* Title row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%', background: '#f59e0b',
                          boxShadow: '0 0 0 3px rgba(245,158,11,0.30)',
                          animation: 'pulse 1.5s infinite',
                        }} />
                        <span style={{ fontSize: 11, fontWeight: 900, color: '#fbbf24', letterSpacing: '0.08em' }}>
                          CLUSTER ALERT
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 800,
                          background: 'rgba(245,158,11,0.20)', color: '#fbbf24',
                          border: '1px solid rgba(245,158,11,0.40)',
                          padding: '2px 7px', borderRadius: 4,
                        }}>{totalBuys} buys / 7d</span>
                        <span style={{
                          fontSize: 9, fontWeight: 800,
                          background: 'rgba(34,197,94,0.12)', color: '#4ade80',
                          border: '1px solid rgba(34,197,94,0.30)',
                          padding: '2px 7px', borderRadius: 4,
                        }}>₹{totalCr.toFixed(1)} Cr total</span>
                        <span style={{
                          fontSize: 9, fontWeight: 800,
                          background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                          border: '1px solid rgba(99,102,241,0.25)',
                          padding: '2px 7px', borderRadius: 4,
                        }}>{buyers} buyers</span>
                      </div>
                    </div>
                    {/* Cluster stocks */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {clusters.map((c, i) => (
                        <div key={i} style={{
                          padding: '5px 10px', borderRadius: 6,
                          background: 'rgba(245,158,11,0.10)',
                          border: '1px solid rgba(245,158,11,0.25)',
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24' }}>{c.symbol}</div>
                          <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 1 }}>
                            {c.cluster_info?.count}× · ₹{c.cluster_info?.value_cr?.toFixed(1)}Cr · {c.cluster_info?.buyers} buyer{c.cluster_info?.buyers > 1 ? 's' : ''}
                          </div>
                          <div style={{
                            marginTop: 3, fontSize: 8, fontWeight: 800,
                            color: c.status === 'GOD LEVEL' ? '#f59e0b' : '#4ade80',
                          }}>
                            {c.status} {c.adj_score}/{c.score_max}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 8, color: '#94a3b8', fontStyle: 'italic' }}>
                      Cluster: 3+ promoter/director buys in 7d · ≥₹3Cr · ≥70% market mode. Verify confirm stack before sizing.
                    </div>
                  </div>
                );
              })()}

              {/* History banner */}
              {fromHistory && historyDate && (
                <div style={{
                  margin: '0 14px 0 14px', padding: '8px 12px', borderRadius: 6,
                  background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.3)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Warning size={13} color="#fbbf24" />
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24' }}>Last Saved History </span>
                    <span style={{ fontSize: 9, color: '#94a3b8' }}>
                      — Live sources unavailable. Showing data saved on{' '}
                      {new Date(historyDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>
              )}

              {insiders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.textSecond }}>
                  <Eye size={32} color={C.textSecond} style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 12 }}>No insider buy transactions found in last 7 days</div>
                  <div style={{ fontSize: 10, marginTop: 4 }}>Check back on market trading days</div>
                </div>
              ) : (
                insiders.map((item, i) => <InsiderRow key={`${item.symbol}-${i}`} item={item} C={C} />)
              )}
            </>
          )}

          {/* ── PATTERNS TAB ── */}
          {!loading && tab === 'patterns' && !hasError && (
            <>
              {/* Header stats */}
              <div style={{
                display: 'flex', gap: 12, padding: '8px 14px',
                borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: 'wrap',
                alignItems: 'center',
              }}>
                {[
                  { label: '15 Min', color: TF_COLORS['15m'] },
                  { label: '1 Hour', color: TF_COLORS['1H'] },
                  { label: 'Daily',  color: TF_COLORS['1D'] },
                ].map(t => (
                  <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: t.color }} />
                    <span style={{ fontSize: 9, color: C.textSecond, fontWeight: 700 }}>{t.label}</span>
                  </div>
                ))}
                {patternData?.scanned_stocks && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: C.textSecond }}>
                    {patterns.length} stocks with patterns · {patternData.scanned_stocks} scanned
                  </span>
                )}
              </div>

              {patterns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.textSecond }}>
                  <ChartBar size={32} color={C.textSecond} style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 12 }}>No patterns detected with current filters</div>
                  <button
                    onClick={() => fetchPatterns(true)}
                    style={{
                      marginTop: 12, padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
                      background: `${C.tabActive}20`, color: C.tabActive,
                      border: `1px solid ${C.tabActive}40`, fontSize: 11, fontWeight: 700,
                    }}
                  >
                    Run Scan
                  </button>
                </div>
              ) : (
                patterns.map((item, i) => <PatternRow key={`${item.symbol}-${i}`} item={item} C={C} />)
              )}
            </>
          )}

          {/* ── ECO CALENDAR TAB ── */}
          {!loading && tab === 'eco' && <EconomicCalendar C={C} />}

          {/* ── STOCK NEWS TAB ── */}
          {tab === 'news' && <StockNewsFeed C={C} isDark={isDark} />}

        </div>

        {/* ── Footer (hide for eco/news tab — they have their own) ── */}
        {tab !== 'eco' && tab !== 'news' && (
        <div style={{
          padding: '8px 14px', borderTop: `1px solid ${C.border}`,
          background: C.headerBg, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 9, color: C.textSecond }}>
            Source: NSE SEBI Reg 7(2) · yfinance · 100% Legal
          </span>
          <span style={{ fontSize: 9, color: C.textSecond }}>
            {tab === 'insider' ? 'Cache: 15 min' : 'Cache: 15 min'}
          </span>
        </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
