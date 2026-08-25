import React, { useState, useEffect, useCallback } from 'react';
import {
  Eye, X, ArrowClockwise, Warning, TrendUp, TrendDown,
  Minus, ChartBar, Users, CaretDown, CaretRight,
  MagnifyingGlass, Funnel,
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

function ScoreDot({ score }) {
  const color = score >= 8 ? '#ef4444' : score >= 5 ? '#f59e0b' : '#64748b';
  return (
    <svg width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="none" stroke="#27272a" strokeWidth="3" />
      <circle
        cx="16" cy="16" r="14"
        fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${(score / 10) * 88} 88`}
        strokeLinecap="round"
        transform="rotate(-90 16 16)"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x="16" y="20" textAnchor="middle" fill={color} fontSize="9" fontWeight="700">{score}</text>
    </svg>
  );
}

function FactorTag({ tag }) {
  const isPositive = ['PROMOTER BUY', 'INSIDER BUY', 'BREAKOUT', 'CLUSTER'].some(k => tag.startsWith(k));
  const isVol = tag.startsWith('VOL');
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
      padding: '2px 6px', borderRadius: 3,
      background: isPositive ? 'rgba(34,197,94,0.15)' : isVol ? 'rgba(99,102,241,0.15)' : 'rgba(148,163,184,0.12)',
      color: isPositive ? '#4ade80' : isVol ? '#818cf8' : '#94a3b8',
      border: `1px solid ${isPositive ? 'rgba(34,197,94,0.3)' : isVol ? 'rgba(99,102,241,0.3)' : 'rgba(148,163,184,0.2)'}`,
    }}>{tag}</span>
  );
}

// ── Insider Detection Row ──────────────────────────────────────────────────

function InsiderRow({ item, C }) {
  const [expanded, setExpanded] = useState(false);
  const pm  = priorityMeta[item.priority] || priorityMeta.MONITOR;

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
        className="hover:bg-white/5 transition-colors"
        data-testid={`insider-row-${item.symbol}`}
      >
        {/* Score circle */}
        <ScoreDot score={item.score} />

        {/* Symbol + company */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: C.textPrimary }}>{item.symbol}</span>
            {item.cluster && (
              <span style={{ fontSize: 8, background: 'rgba(99,102,241,0.2)', color: '#818cf8', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                CLUSTER
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: C.textSecond, marginTop: 1 }} className="truncate">
            {item.company}
          </div>
        </div>

        {/* Priority badge */}
        <span style={{
          fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
          padding: '3px 7px', borderRadius: 4,
          background: pm.bg, border: `1px solid ${pm.border}`, color: pm.text,
        }}>{pm.label}</span>

        {/* Price */}
        <div style={{ textAlign: 'right', minWidth: 60 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>
            ₹{item.price > 0 ? item.price.toLocaleString('en-IN') : '—'}
          </div>
          <div style={{ fontSize: 9, color: item.vol_ratio >= 2 ? '#818cf8' : C.textSecond }}>
            Vol {item.vol_ratio}x
          </div>
        </div>

        {/* Expand chevron */}
        {expanded ? <CaretDown size={12} color={C.textSecond} /> : <CaretRight size={12} color={C.textSecond} />}
      </div>

      {/* Expanded: factors + insider list */}
      {expanded && (
        <div style={{ padding: '0 14px 12px 54px', background: C.rowBg }}>
          {/* Factor tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {item.factors?.map((f, i) => <FactorTag key={i} tag={f} />)}
            {item.price_breakout && <FactorTag tag="BREAKOUT" />}
          </div>

          {/* Insider list table */}
          <div style={{ fontSize: 10, color: C.textSecond, marginBottom: 4, fontWeight: 700, letterSpacing: '0.06em' }}>
            INSIDER TRANSACTIONS
          </div>
          <div style={{ borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {item.insiders?.map((ins, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 80px 70px',
                padding: '6px 10px', gap: 8, alignItems: 'center',
                background: i % 2 === 0 ? C.cardBg : 'transparent',
                borderBottom: i < item.insiders.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textPrimary }}>{ins.name}</div>
                  <div style={{ fontSize: 9, color: C.textSecond }}>{ins.category}</div>
                </div>
                <div style={{ fontSize: 10, color: C.textSecond }}>{ins.mode}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textPrimary, textAlign: 'right' }}>
                  {ins.shares ? ins.shares.toLocaleString('en-IN') : '—'} shs
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textAlign: 'right' }}>
                  {ins.value_lakh > 0 ? `₹${ins.value_lakh.toFixed(1)}L` : '—'}
                </div>
              </div>
            ))}
          </div>
          {item.total_value_lakh > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#4ade80', fontWeight: 700, textAlign: 'right' }}>
              Total Transaction Value: ₹{item.total_value_lakh.toFixed(1)} Lakh
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pattern Scan Row ───────────────────────────────────────────────────────

function PatternRow({ item, C }) {
  const [expanded, setExpanded] = useState(false);

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

        {/* Symbol + name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: C.textPrimary }}>{item.symbol}</span>
            <span style={{ fontSize: 9, color: C.textSecond }}>{item.sector}</span>
          </div>
          <div style={{ fontSize: 10, color: C.textSecond, marginTop: 1 }}>{item.top_pattern}</div>
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
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function InsiderTracker({ onClose }) {
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
  const [tfFilter,  setTfFilter]   = useState('');
  const [biasFilter, setBiasFilter] = useState('');
  const [patFilter,  setPatFilter] = useState('');

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
      if (forceRefresh) params.set('refresh', 'true');
      if (tfFilter)     params.set('timeframe', tfFilter);
      if (biasFilter)   params.set('bias',      biasFilter);
      if (patFilter)    params.set('pattern',   patFilter);
      const res  = await fetch(`${API}/insider/pattern-scan?${params}`);
      const json = await res.json();
      setPatternData(json);
      setUpdatedAt(json.updated_at);
    } catch (e) {
      setPatternData({ results: [], error: e.message });
    } finally {
      setLoading(false);
    }
  }, [tfFilter, biasFilter, patFilter]);

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
            { id: 'insider',  label: 'Insider Buys',    icon: Users    },
            { id: 'patterns', label: 'Pattern Scanner', icon: ChartBar },
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
            display: 'flex', gap: 6, padding: '8px 12px',
            borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            <Funnel size={12} color={C.textSecond} />
            {/* Timeframe filter */}
            <select
              value={tfFilter}
              onChange={e => setTfFilter(e.target.value)}
              data-testid="pattern-tf-filter"
              style={{
                fontSize: 10, padding: '3px 7px', borderRadius: 4,
                background: C.cardBg, color: C.textPrimary,
                border: `1px solid ${C.border}`, cursor: 'pointer',
              }}
            >
              <option value="">All TFs</option>
              {TF_OPTS.slice(1).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {/* Bias filter */}
            <select
              value={biasFilter}
              onChange={e => setBiasFilter(e.target.value)}
              data-testid="pattern-bias-filter"
              style={{
                fontSize: 10, padding: '3px 7px', borderRadius: 4,
                background: C.cardBg, color: C.textPrimary,
                border: `1px solid ${C.border}`, cursor: 'pointer',
              }}
            >
              <option value="">All Bias</option>
              {BIAS_OPTS.slice(1).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {/* Pattern filter */}
            <select
              value={patFilter}
              onChange={e => setPatFilter(e.target.value)}
              data-testid="pattern-name-filter"
              style={{
                fontSize: 10, padding: '3px 7px', borderRadius: 4,
                background: C.cardBg, color: C.textPrimary,
                border: `1px solid ${C.border}`, cursor: 'pointer',
              }}
            >
              <option value="">All Patterns</option>
              {PAT_OPTS.slice(1).map(o => <option key={o} value={o}>{o}</option>)}
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

          {/* Loading spinner */}
          {loading && (
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
              }}>
                {[
                  { label: '8+  HIGH',      color: '#ef4444' },
                  { label: '5-7 WATCHLIST', color: '#f59e0b' },
                  { label: '<5  MONITOR',   color: '#64748b' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                    <span style={{ fontSize: 9, color: C.textSecond, fontWeight: 700 }}>{s.label}</span>
                  </div>
                ))}
                {insiderData?.count !== undefined && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: C.textSecond }}>
                    {insiderData.count} detections · last 7 days
                  </span>
                )}
              </div>

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
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '8px 14px', borderTop: `1px solid ${C.border}`,
          background: C.headerBg, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 9, color: C.textSecond }}>
            Source: NSE SEBI Reg 7(2) · yfinance · 100% Legal
          </span>
          <span style={{ fontSize: 9, color: C.textSecond }}>
            {tab === 'insider' ? 'Cache: 30 min' : 'Cache: 15 min'}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
