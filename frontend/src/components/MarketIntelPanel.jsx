import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { X, TrendUp, TrendDown, Minus, ArrowClockwise, Gauge, Globe, ChartLine, Timer, Warning, ChartBar } from '@phosphor-icons/react';
import { useTheme } from '../context/ThemeContext';

// ── PCR Sparkline ─────────────────────────────────────────────────────────────
const PCR_ZONES = [
  { min: 0,    max: 0.50, color: '#ef4444' },
  { min: 0.50, max: 0.70, color: '#f97316' },
  { min: 0.70, max: 0.90, color: '#eab308' },
  { min: 0.90, max: 1.20, color: '#22c55e' },
  { min: 1.20, max: 1.50, color: '#16a34a' },
  { min: 1.50, max: 2.50, color: '#f59e0b' },
];
const PCR_REF_LINES = [0.50, 0.70, 0.90, 1.20, 1.50];

function pcrColor(pcr) {
  for (const z of PCR_ZONES) if (pcr >= z.min && pcr < z.max) return z.color;
  return '#94a3b8';
}

function PcrSparkline({ history, currentPcr, isDark }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);
  const W = 320, H = 90, PAD = { t: 6, r: 8, b: 20, l: 30 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

  // Decide data source
  const pts = history && history.length >= 2 ? history : null;

  // PCR value range with padding
  const allVals = pts ? pts.map(p => p.pcr) : [currentPcr || 1.0];
  const minY = Math.max(0, Math.min(...allVals, 0.4) - 0.1);
  const maxY = Math.max(...allVals, 1.6) + 0.1;
  const rangeY = maxY - minY || 1;

  const toX = (i, len) => PAD.l + (i / (len - 1)) * cW;
  const toY = (v) => PAD.t + cH - ((v - minY) / rangeY) * cH;

  const bg   = isDark ? '#0f172a' : '#f8fafc';
  const grid = isDark ? '#1e293b' : '#e2e8f0';
  const txtC = isDark ? '#475569' : '#94a3b8';

  // Build polyline points
  const linePts = pts
    ? pts.map((p, i) => `${toX(i, pts.length)},${toY(p.pcr)}`).join(' ')
    : null;

  // Current PCR dot position
  const dotX = pts ? toX(pts.length - 1, pts.length) : W / 2;
  const dotY = toY(currentPcr || (pts ? pts[pts.length - 1].pcr : 1.0));
  const dotColor = pcrColor(currentPcr || 1.0);

  const handleMouseMove = (e) => {
    if (!pts || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((mx - PAD.l) / cW) * (pts.length - 1));
    const clamped = Math.max(0, Math.min(idx, pts.length - 1));
    const p = pts[clamped];
    const ts = new Date(p.ts);
    const label = `${ts.getHours().toString().padStart(2,'0')}:${ts.getMinutes().toString().padStart(2,'0')}`;
    setTooltip({ x: toX(clamped, pts.length), y: toY(p.pcr), pcr: p.pcr, label });
  };

  return (
    <div className="mt-3">
      <div className="text-[8px] uppercase tracking-wider mb-1.5 flex items-center justify-between" style={{ color: txtC }}>
        <span>PCR Trend {pts ? `(last ${pts.length} readings)` : '(accumulating...)'}</span>
        <span className="font-mono font-bold" style={{ color: dotColor }}>
          Current: {currentPcr?.toFixed(2) ?? '—'}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', cursor: pts ? 'crosshair' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Background */}
        <rect x={PAD.l} y={PAD.t} width={cW} height={cH} fill={grid} rx="3" />

        {/* Zone bands */}
        {PCR_ZONES.map((z) => {
          const y1 = toY(Math.min(z.max, maxY));
          const y2 = toY(Math.max(z.min, minY));
          if (y2 <= PAD.t || y1 >= PAD.t + cH) return null;
          return (
            <rect key={z.min} x={PAD.l} y={Math.max(PAD.t, y1)}
              width={cW} height={Math.min(y2, PAD.t + cH) - Math.max(PAD.t, y1)}
              fill={z.color} opacity={0.08} />
          );
        })}

        {/* Reference dashed lines */}
        {PCR_REF_LINES.map((v) => {
          if (v < minY || v > maxY) return null;
          const y = toY(v);
          return (
            <g key={v}>
              <line x1={PAD.l} y1={y} x2={PAD.l + cW} y2={y}
                stroke={pcrColor(v + 0.01)} strokeWidth="0.5" strokeDasharray="3,3" opacity={0.5} />
              <text x={PAD.l - 2} y={y + 3} textAnchor="end" fontSize="6" fill={txtC}>{v.toFixed(2)}</text>
            </g>
          );
        })}

        {/* PCR line */}
        {pts ? (
          <polyline points={linePts} fill="none"
            stroke={dotColor} strokeWidth="1.5" strokeLinejoin="round" opacity={0.9} />
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="8" fill={txtC}>
            Accumulating live data...
          </text>
        )}

        {/* Current value dot */}
        <circle cx={dotX} cy={dotY} r="3.5" fill={dotColor} />
        <circle cx={dotX} cy={dotY} r="6" fill={dotColor} opacity={0.2} />

        {/* Tooltip */}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={PAD.t} x2={tooltip.x} y2={PAD.t + cH}
              stroke={pcrColor(tooltip.pcr)} strokeWidth="0.8" opacity={0.6} />
            <circle cx={tooltip.x} cy={tooltip.y} r="3" fill={pcrColor(tooltip.pcr)} />
            <rect x={Math.min(tooltip.x + 4, W - 52)} y={tooltip.y - 14}
              width={48} height={16} rx="3" fill={isDark ? '#1e293b' : '#fff'}
              stroke={pcrColor(tooltip.pcr)} strokeWidth="0.5" />
            <text x={Math.min(tooltip.x + 28, W - 28)} y={tooltip.y - 3}
              textAnchor="middle" fontSize="7" fill={pcrColor(tooltip.pcr)} fontWeight="bold">
              {tooltip.label} — {tooltip.pcr.toFixed(2)}
            </text>
          </g>
        )}

        {/* X-axis time ticks */}
        {pts && pts.length >= 3 && [0, Math.floor(pts.length / 2), pts.length - 1].map((idx) => {
          const p = pts[idx];
          const ts = new Date(p.ts);
          const label = `${ts.getHours().toString().padStart(2,'0')}:${ts.getMinutes().toString().padStart(2,'0')}`;
          return (
            <text key={idx} x={toX(idx, pts.length)} y={H - 4} textAnchor="middle" fontSize="6" fill={txtC}>
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (v, dec = 2) => (v == null ? '—' : Number(v).toFixed(dec));
const fmtPct = (v) => {
  if (v == null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(2)}%`;
};

// ── Market News Intelligence Card ─────────────────────────────────────────────
const SOURCE_COLORS = {
  'ET Markets':        '#e8192c',
  'Moneycontrol':      '#2563eb',
  'Business Standard': '#1e40af',
  'LiveMint':          '#16a34a',
  'Google News':       '#4285F4',
};

const IMPACT_FACTORS = [
  'FII/DII', 'India VIX', 'RBI', 'GIFT Nifty', 'Crude Oil', 'Rupee/USD',
  'F&O Expiry', 'US Fed', 'Nifty 50', 'Budget', 'Sensex'
];

function relativeTime(isoStr) {
  if (!isoStr) return '';
  try {
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ''; }
}

function MarketNewsCard({ news, C, onRefresh }) {
  const [expanded, setExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  if (!news || !news.available) return null;

  const {
    items = [], outlook, outlook_color, outlook_label,
    bull_count = 0, bear_count = 0, total = 0,
    high_count = 0,
  } = news;

  const handleRefresh = async (e) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" data-testid="market-news-card"
      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ borderBottom: `1px solid ${C.border}` }}
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2">
          <Globe size={13} style={{ color: outlook_color }} />
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.textPrimary }}>
            Nifty 50 News Intelligence
          </span>
          {high_count > 0 && (
            <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider"
              style={{ color: '#f97316', background: '#f9731618', border: '1px solid #f9731640' }}>
              {high_count} HIGH
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Sentiment badge */}
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ color: outlook_color, background: `${outlook_color}18`, border: `1px solid ${outlook_color}40` }}>
            {outlook}
          </span>
          <span className="text-[8px] font-semibold" style={{ color: '#22c55e' }}>{bull_count}↑</span>
          <span className="text-[8px] font-semibold" style={{ color: '#ef4444' }}>{bear_count}↓</span>
          {/* Refresh button */}
          <button
            data-testid="news-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh news"
            className="rounded p-1 transition-opacity hover:opacity-70"
            style={{ color: C.textMuted, background: C.panelBg }}>
            <ArrowClockwise size={11} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <span className="text-[9px] rounded px-1 py-0.5" style={{ color: C.textMuted, background: C.panelBg }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {expanded && (
        <>
          {/* Factors being tracked */}
          <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap"
            style={{ borderBottom: `1px solid ${C.borderSubtle}`, background: C.panelBg }}>
            <span className="text-[7px] uppercase tracking-wider font-semibold mr-1" style={{ color: C.textMuted }}>
              Tracking:
            </span>
            {IMPACT_FACTORS.map(f => (
              <span key={f} className="text-[7px] px-1.5 py-0.5 rounded"
                style={{ color: C.textMuted, background: C.cardBg, border: `1px solid ${C.borderSubtle}` }}>
                {f}
              </span>
            ))}
          </div>

          {/* Outlook summary bar */}
          <div className="px-4 py-2.5 flex items-center gap-3"
            style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
            {total > 0 && (
              <div className="flex-1 h-1.5 rounded-full overflow-hidden flex" style={{ background: C.panelBg }}>
                <div style={{ width: `${(bull_count / total) * 100}%`, background: '#22c55e', transition: 'width 0.3s' }} />
                <div style={{ width: `${(bear_count / total) * 100}%`, background: '#ef4444', transition: 'width 0.3s' }} />
                <div style={{ flex: 1, background: '#94a3b815' }} />
              </div>
            )}
            <span className="text-[8px] whitespace-nowrap font-medium" style={{ color: C.textMuted }}>
              {outlook_label}
            </span>
          </div>

          {/* News items */}
          <div className="divide-y" style={{ borderColor: C.borderSubtle }}>
            {items.map((item, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-2.5" data-testid={`news-item-${i}`}>
                {/* Sentiment dot */}
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
                  style={{ background: item.sentiment_color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    {/* Source badge */}
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color: SOURCE_COLORS[item.source] || '#94a3b8',
                        background: `${SOURCE_COLORS[item.source] || '#94a3b8'}18`,
                      }}>
                      {item.source}
                    </span>
                    {/* Impact level badge */}
                    {item.impact_level === 'HIGH' && (
                      <span className="text-[6px] font-black px-1 py-0.5 rounded uppercase tracking-wider"
                        style={{ color: '#f97316', background: '#f9731618' }}>
                        HIGH IMPACT
                      </span>
                    )}
                    {/* Time */}
                    <span className="text-[8px]" style={{ color: C.textMuted }}>
                      {relativeTime(item.published)}
                    </span>
                    {/* Sentiment */}
                    <span className="text-[7px] font-bold px-1 py-0.5 rounded"
                      style={{ color: item.sentiment_color, background: `${item.sentiment_color}15` }}>
                      {item.sentiment}
                    </span>
                  </div>
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] leading-snug font-medium hover:underline block"
                    style={{ color: C.textSecond }}>
                    {item.title}
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 flex items-center justify-between"
            style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
            <span className="text-[8px]" style={{ color: C.textMuted }}>
              Sources: ET Markets · Moneycontrol · LiveMint · Google News
            </span>
            {news.fetched_at && (
              <span className="text-[8px]" style={{ color: C.textMuted }}>
                {relativeTime(news.fetched_at)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Geopolitical Risk Card ────────────────────────────────────────────────────
const GEO_WEIGHT_COLORS = { 4: '#ef4444', 3: '#f97316', 2: '#eab308', 1: '#94a3b8' };

function GeoRiskCard({ geoRisk, C, isDark }) {
  const [expanded, setExpanded] = useState(true);

  if (!geoRisk || !geoRisk.available) return null;

  const { score, score_max = 15, level, level_color, nifty_impact,
          sectors_note, triggers = [], affected_sectors = [] } = geoRisk;

  const scorePct = Math.min(100, (score / score_max) * 100);

  // Level badge background
  const levelBg = level === 'HIGH'   ? 'rgba(239,68,68,0.12)'
                : level === 'MEDIUM' ? 'rgba(249,115,22,0.12)'
                :                      'rgba(34,197,94,0.12)';

  const levelBorder = level === 'HIGH'   ? 'rgba(239,68,68,0.35)'
                    : level === 'MEDIUM' ? 'rgba(249,115,22,0.35)'
                    :                      'rgba(34,197,94,0.35)';

  // Score bar color gradient: green→yellow→red
  const barColor = level === 'HIGH' ? '#ef4444' : level === 'MEDIUM' ? '#f97316' : '#22c55e';

  return (
    <div className="rounded-xl overflow-hidden" data-testid="geo-risk-card"
      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ borderBottom: expanded ? `1px solid ${C.border}` : 'none' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={level_color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.textPrimary }}>
            Geopolitical Risk
          </span>
          <span
            className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ color: level_color, background: levelBg, border: `1px solid ${levelBorder}` }}
          >
            {level}
          </span>
          {level === 'HIGH' && (
            <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full animate-pulse"
              style={{ background: '#ef444418', color: '#ef4444', border: '1px solid #ef444440' }}>
              ALERT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold" style={{ color: level_color }}>
            {score}/{score_max}
          </span>
          <span className="text-[9px] rounded px-1 py-0.5" style={{ color: C.textMuted, background: C.panelBg }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Always-visible score bar */}
      <div className="px-4 py-2.5" style={{ borderBottom: expanded ? `1px solid ${C.borderSubtle}` : 'none' }}>
        {/* Score bar */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: C.panelBg }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${scorePct}%`, background: barColor }}
            />
          </div>
        </div>
        {/* Scale labels */}
        <div className="flex justify-between text-[7px]" style={{ color: C.textMuted }}>
          <span style={{ color: '#22c55e' }}>LOW</span>
          <span style={{ color: '#eab308' }}>MEDIUM</span>
          <span style={{ color: '#ef4444' }}>HIGH</span>
        </div>
      </div>

      {expanded && (
        <>
          {/* Nifty Impact */}
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
            <div className="text-[8px] uppercase tracking-wider mb-1.5 font-bold" style={{ color: C.textMuted }}>
              Nifty 50 Impact
            </div>
            <div className="text-[10px] leading-relaxed" style={{ color: C.textSecond }}>
              {nifty_impact}
            </div>
            {sectors_note && (
              <div className="mt-1.5 text-[9px] font-medium" style={{ color: level_color }}>
                {sectors_note}
              </div>
            )}
          </div>

          {/* Triggers */}
          {triggers.length > 0 && (
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
              <div className="text-[8px] uppercase tracking-wider mb-2 font-bold" style={{ color: C.textMuted }}>
                Risk Triggers Detected ({triggers.length})
              </div>
              <div className="space-y-1.5">
                {triggers.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg px-2.5 py-1.5"
                    style={{ background: `${GEO_WEIGHT_COLORS[t.weight] || '#94a3b8'}0d`, border: `1px solid ${GEO_WEIGHT_COLORS[t.weight] || '#94a3b8'}25` }}>
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="text-[7px] font-black px-1.5 py-0.5 rounded"
                        style={{ color: GEO_WEIGHT_COLORS[t.weight] || '#94a3b8', background: `${GEO_WEIGHT_COLORS[t.weight] || '#94a3b8'}20` }}>
                        +{t.weight}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-bold" style={{ color: GEO_WEIGHT_COLORS[t.weight] || '#94a3b8' }}>
                        {t.category}
                      </div>
                      <div className="text-[8px] truncate" style={{ color: C.textSecond }}>
                        {t.news_title}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Affected sectors */}
          {affected_sectors.length > 0 && (
            <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
              <div className="text-[8px] uppercase tracking-wider mb-1.5 font-bold" style={{ color: C.textMuted }}>
                Sectors Under Pressure
              </div>
              <div className="flex flex-wrap gap-1.5">
                {affected_sectors.map(s => (
                  <span key={s} className="text-[8px] px-2 py-0.5 rounded-full font-medium"
                    style={{ color: level_color, background: `${level_color}12`, border: `1px solid ${level_color}30` }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* No triggers found */}
          {triggers.length === 0 && (
            <div className="px-4 py-3 text-[9px]" style={{ color: C.textMuted }}>
              No active geopolitical risk triggers in current headlines.
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2 flex items-center justify-between"
            style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
            <span className="text-[8px]" style={{ color: C.textMuted }}>
              Derived from {geoRisk.headline_count || 0} Nifty 50 headlines
            </span>
            <span className="text-[8px]" style={{ color: C.textMuted }}>
              Score scale: 0 (safe) → 15 (extreme)
            </span>
          </div>
        </>
      )}
    </div>
  );
}




const SECTOR_ICONS_LABEL = {
  bank: 'BANK', it: 'IT', auto: 'AUTO', pharma: 'PHARMA', fmcg: 'FMCG',
  metal: 'METAL', realty: 'REALTY', energy: 'ENERGY', infra: 'INFRA',
  media: 'MEDIA', psubank: 'PSU BK', midcap: 'MIDCAP',
};

function SectorBreadthCard({ sb, C, isDark, giftPremium }) {
  const [expanded, setExpanded] = useState(false);
  if (!sb || sb.total === 0) return null;

  const { up_count, down_count, total, bias, move, action, color,
          high_prob, power_sectors, power_green, power_red, power_aligned, sectors } = sb;

  // Combined setup: 8+ sectors + gift aligns
  const giftBull = giftPremium > 0;
  const giftBear = giftPremium < 0;
  const combinedBull = up_count >= 8 && giftBull;
  const combinedBear = down_count >= 8 && giftBear;
  const showSetup    = combinedBull || combinedBear;

  // Check times string
  const CHECK_TIMES = '9:30 · 11:00 · 2:00 PM';

  return (
    <div className="rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
      data-testid="sector-breadth-card">

      {/* ── Header row (always visible) ── */}
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ borderBottom: expanded ? `1px solid ${C.border}` : 'none' }}
        onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-2">
          <ChartBar size={13} className="text-cyan-400" />
          <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.textMuted }}>
            Sector Breadth
          </span>
          {/* High-prob flash badge */}
          {high_prob && (
            <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: `${color}22`, color, border: `1px solid ${color}50` }}>
              HIGH PROB
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold font-mono" style={{ color: '#22c55e' }}>▲{up_count}</span>
          <span className="text-[9px] font-bold font-mono" style={{ color: '#ef4444' }}>▼{down_count}</span>
          <span className="text-[8px] px-1 rounded" style={{ color: C.textMuted, background: C.panelBg }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* ── Always-visible summary strip ── */}
      <div className="px-4 pb-3 pt-1.5">
        {/* Green / Red sector bar */}
        <div className="flex h-2 rounded-full overflow-hidden mb-2">
          <div style={{ width: `${(up_count / total) * 100}%`, background: '#22c55e', transition: 'width 0.4s' }} />
          <div style={{ width: `${(down_count / total) * 100}%`, background: '#ef4444', transition: 'width 0.4s' }} />
        </div>
        {/* Count + move + bias row */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-bold font-mono" style={{ color }}>
              {up_count} UP / {down_count} DN
            </span>
            <span className="text-[8px] ml-1.5" style={{ color: C.textMuted }}>of {total}</span>
          </div>
          <span className="text-[8px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
            {bias}
          </span>
        </div>
        {/* Expected move */}
        <div className="text-[9px] mt-1 font-mono font-bold" style={{ color }}>
          Expected: {move}
        </div>
        {/* Action */}
        <div className="text-[8px] mt-0.5" style={{ color: C.textSecond }}>
          → {action}
        </div>

        {/* Power sectors pill row — Bank / IT / Auto */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[7px] uppercase tracking-wider" style={{ color: C.textMuted }}>Power:</span>
          {(power_sectors || []).map(s => {
            const up = s.change_pct > 0;
            const pc = s.change_pct >= 0 ? `+${s.change_pct}%` : `${s.change_pct}%`;
            return (
              <span key={s.icon} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: up ? '#22c55e' : '#ef4444',
                  border: `1px solid ${up ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                {SECTOR_ICONS_LABEL[s.icon] || s.icon.toUpperCase()} {up ? '▲' : '▼'} {pc}
              </span>
            );
          })}
          {power_aligned && (
            <span className="text-[7px] font-black px-1 py-0.5 rounded"
              style={{ background: `${color}15`, color }}>
              ★ Aligned
            </span>
          )}
        </div>

        {/* Combined Setup Banner */}
        {showSetup && (
          <div className="mt-2 rounded-lg px-3 py-2"
            style={{ background: `${color}12`, border: `1px solid ${color}40` }}>
            <div className="text-[8px] font-black uppercase tracking-wider mb-0.5" style={{ color }}>
              {combinedBull ? '★ STRONG BULLISH SETUP' : '★ STRONG BEARISH SETUP'}
            </div>
            <div className="text-[7.5px] space-y-0.5" style={{ color: C.textSecond }}>
              <div>✓ {up_count >= 8 ? `${up_count}` : `${down_count}`}/12 sectors aligned</div>
              <div>✓ GIFT Nifty {combinedBull ? 'positive' : 'negative'} ({giftPremium > 0 ? '+' : ''}{giftPremium} pts)</div>
              <div>→ {combinedBull ? 'Long / Call Buy after 15m Rejection + 1m Green confirm' : 'Short / Put Buy after 15m Rejection + 1m Red confirm'}</div>
            </div>
          </div>
        )}

        {/* Neutral / Avoid banner */}
        {!showSetup && (up_count >= 5 && up_count <= 7 && down_count >= 5 && down_count <= 7) && (
          <div className="mt-2 rounded-lg px-3 py-1.5"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
            <div className="text-[8px] font-bold" style={{ color: '#fbbf24' }}>
              ⚠ Mixed — Wait for clarity
            </div>
            <div className="text-[7.5px]" style={{ color: C.textMuted }}>
              5–7 sectors mixed → small range trades only
            </div>
          </div>
        )}
      </div>

      {/* ── Expanded: all 12 sector mini list ── */}
      {expanded && (
        <div className="px-4 pb-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="pt-3 mb-2">
            <div className="text-[8px] uppercase tracking-wider mb-1.5 flex items-center justify-between"
              style={{ color: C.textMuted }}>
              <span>All 12 Sectors</span>
              <span>Check: {CHECK_TIMES}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {(sectors || []).map(s => {
                const up = s.change_pct > 0;
                const pc = s.change_pct >= 0 ? `+${s.change_pct}%` : `${s.change_pct}%`;
                return (
                  <div key={s.icon} className="flex items-center justify-between">
                    <span className="text-[8px] font-mono" style={{ color: C.textSecond }}>
                      {SECTOR_ICONS_LABEL[s.icon] || s.name.replace('NIFTY ', '')}
                    </span>
                    <span className="text-[8px] font-bold font-mono"
                      style={{ color: up ? '#22c55e' : s.change_pct < 0 ? '#ef4444' : C.textMuted }}>
                      {up ? '▲' : s.change_pct < 0 ? '▼' : '→'} {pc}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Short rule */}
          <div className="rounded-lg px-3 py-2 mt-1"
            style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: `1px solid ${C.border}` }}>
            <div className="text-[7.5px] space-y-0.5" style={{ color: C.textMuted }}>
              <div className="font-bold text-[8px]" style={{ color: C.textSecond }}>Short Rule</div>
              <div>8+ sectors same direction → High probability big move</div>
              <div>Add Price Action confirmation for best results</div>
              <div className="font-bold" style={{ color: '#06b6d4' }}>Banking + IT + Auto strong → bias amplified</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nifty 50 Breadth Section Card ─────────────────────────────────────────────
const DOWN_ROWS = [
  { range: '35+',   pts: '-180 to -350 pts', freq: '~18% days', note: 'Strong correction', color: '#ef4444' },
  { range: '25-34', pts: '-80 to -180 pts',  freq: '~32% days', note: 'Normal down day',   color: '#fca5a5' },
  { range: '15-24', pts: '-30 to +30 pts',   freq: '~28% days', note: 'Sideways/balanced', color: '#94a3b8' },
  { range: '10-14', pts: '+80 to +180 pts',  freq: '~15% days', note: 'Recovery day',      color: '#86efac' },
  { range: '<10',   pts: '+200 to +400 pts', freq: '~7% days',  note: 'Strong rally',      color: '#22c55e' },
];
const UP_ROWS = [
  { range: '35+',   pts: '+220 to +420 pts', note: 'Strong Bull day',    color: '#22c55e' },
  { range: '25-34', pts: '+90 to +200 pts',  note: 'Normal up day',      color: '#86efac' },
  { range: '15-24', pts: '+20 to +80 pts',   note: 'Weak rally / flat',  color: '#94a3b8' },
  { range: '<15',   pts: 'Weak / Flat',       note: 'Bearish breadth',    color: '#fca5a5' },
];

function BreadthCard({ breadth, C, isDark }) {
  const [showRef, setShowRef] = useState(true);
  const [expanded, setExpanded] = useState(false);
  if (!breadth || breadth.advances == null) return null;

  const { advances = 0, declines = 0, unchanged = 0, total = 50 } = breadth;
  const advPct = total > 0 ? (advances / total) * 100 : 0;
  const decPct = total > 0 ? (declines / total) * 100 : 0;
  const unchPct = 100 - advPct - decPct;

  const sigColor = breadth.signal_color || '#94a3b8';

  // Current row highlight for Down reference table
  const currentDeclines = declines;
  const isActiveDown = (range) => {
    if (range === '35+')   return currentDeclines >= 35;
    if (range === '25-34') return currentDeclines >= 25 && currentDeclines <= 34;
    if (range === '15-24') return currentDeclines >= 15 && currentDeclines <= 24;
    if (range === '10-14') return currentDeclines >= 10 && currentDeclines <= 14;
    if (range === '<10')   return currentDeclines < 10;
    return false;
  };
  const isActiveUp = (range) => {
    if (range === '35+')   return advances >= 35;
    if (range === '25-34') return advances >= 25 && advances <= 34;
    if (range === '15-24') return advances >= 15 && advances <= 24;
    if (range === '<15')   return advances < 15;
    return false;
  };

  return (
    <div className="rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
      data-testid="breadth-card">
      {/* Header — always visible, click to expand */}
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ borderBottom: expanded ? `1px solid ${C.border}` : 'none' }}
        onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-2">
          <ChartBar size={13} className="text-violet-400" />
          <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.textMuted }}>
            Nifty 50 Market Breadth
          </span>
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: `${sigColor}20`, color: sigColor, border: `1px solid ${sigColor}40` }}>
            {breadth.signal_label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-bold" style={{ color: '#22c55e' }}>▲{advances}</span>
          <span className="text-[8px] font-bold" style={{ color: '#ef4444' }}>▼{declines}</span>
          <span className="text-[9px] rounded px-1.5 py-0.5" style={{ color: C.textMuted, background: C.panelBg }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3">
          {/* Advance/Decline bar + stats */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-5 rounded-full overflow-hidden flex">
              <div style={{ width: `${advPct}%`, background: '#22c55e', transition: 'width 0.4s' }} />
              <div style={{ width: `${unchPct > 0 ? unchPct : 0}%`, background: isDark ? '#334155' : '#cbd5e1' }} />
              <div style={{ width: `${decPct}%`, background: '#ef4444', transition: 'width 0.4s' }} />
            </div>
            <span className="text-[8px] whitespace-nowrap shrink-0" style={{ color: C.textMuted }}>
              ~8-12 pts/stock
            </span>
          </div>

          {/* Count row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold" style={{ color: '#22c55e' }}>▲ {advances}</span>
                <span className="text-[8px]" style={{ color: C.textMuted }}>up</span>
              </div>
              {unchanged > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold" style={{ color: C.textMuted }}>→ {unchanged}</span>
                  <span className="text-[8px]" style={{ color: C.textMuted }}>flat</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold" style={{ color: '#ef4444' }}>▼ {declines}</span>
                <span className="text-[8px]" style={{ color: C.textMuted }}>down</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-bold font-mono" style={{ color: sigColor }}>
                {breadth.impact_label}
              </div>
              <div className="text-[7px]" style={{ color: C.textMuted }}>{breadth.freq}</div>
            </div>
          </div>

          {/* Description */}
          <div className="text-[8px] mb-2" style={{ color: C.textMuted }}>{breadth.description}</div>

          {/* Reference table toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowRef(v => !v); }}
            className="text-[8px] px-2 py-0.5 rounded transition-all mb-2"
            style={{ color: C.textMuted, border: `1px solid ${C.border}` }}
            data-testid="breadth-ref-toggle">
            {showRef ? 'Hide Reference Table' : 'Reference Table'}
          </button>

          {/* Collapsible reference tables */}
          {showRef && (
            <div className="mt-2 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
              {/* Stocks DOWN table */}
              <div>
                <div className="text-[8px] uppercase tracking-wider mb-1.5 font-bold" style={{ color: '#ef4444' }}>
                  Stocks Down → Nifty Impact
                </div>
                <div className="space-y-0.5">
                  {DOWN_ROWS.map(r => {
                    const active = isActiveDown(r.range);
                    return (
                      <div key={r.range} className="flex items-center justify-between rounded px-2 py-1"
                        style={{ background: active ? `${r.color}20` : 'transparent', border: `1px solid ${active ? r.color : C.borderSubtle}` }}>
                        <div>
                          <span className="text-[8px] font-bold" style={{ color: active ? r.color : C.textMuted }}>{r.range} down</span>
                          <span className="text-[7px] ml-1.5" style={{ color: C.textMuted }}>{r.freq}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[8px] font-mono font-bold" style={{ color: active ? r.color : C.textSecond }}>{r.pts}</div>
                          <div className="text-[7px]" style={{ color: C.textMuted }}>{r.note}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Stocks UP table */}
              <div>
                <div className="text-[8px] uppercase tracking-wider mb-1.5 font-bold" style={{ color: '#22c55e' }}>
                  Stocks Up → Nifty Impact
                </div>
                <div className="space-y-0.5">
                  {UP_ROWS.map(r => {
                    const active = isActiveUp(r.range);
                    return (
                      <div key={r.range} className="flex items-center justify-between rounded px-2 py-1"
                        style={{ background: active ? `${r.color}20` : 'transparent', border: `1px solid ${active ? r.color : C.borderSubtle}` }}>
                        <div>
                          <span className="text-[8px] font-bold" style={{ color: active ? r.color : C.textMuted }}>{r.range} up</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[8px] font-mono font-bold" style={{ color: active ? r.color : C.textSecond }}>{r.pts}</div>
                          <div className="text-[7px]" style={{ color: C.textMuted }}>{r.note}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-1 text-[7px] rounded px-1.5 py-1" style={{ color: C.textMuted, background: C.panelBg || C.cardBg }}>
                    Each declining stock ≈ 8-12 Nifty pts impact
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



const ROWS = [
  { label: 'Strong Bullish', brent: '< $82',  vix: '< 13.5', regulatory: 'Positive', gift: '+0.4%+',           breadth: '28+',  move: '+350 to +650 pts', prob: '95%+', action: 'Aggressive Long (Energy + Banking)', color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
  { label: 'Mild Bullish',   brent: '$80-83', vix: '13.5-15', regulatory: 'Neutral',  gift: '+0.2% to +0.4%',  breadth: '22-27',move: '+180 to +380 pts', prob: '92%',  action: 'Selective Long',                       color: '#86efac', bg: 'rgba(134,239,172,0.10)' },
  { label: 'Neutral',        brent: '$82-85', vix: '14-16',   regulatory: 'Neutral',  gift: '-0.2% to +0.2%',  breadth: '18-22',move: '-120 to +120 pts', prob: '94%',  action: 'Range trading, small positions',        color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
  { label: 'Mild Bearish',   brent: '$85+',   vix: '15+',     regulatory: 'Neutral',  gift: '-0.2% to -0.4%',  breadth: '12-17',move: '-160 to -380 pts', prob: '93%',  action: 'Selective Energy Long, Profit booking', color: '#fca5a5', bg: 'rgba(252,165,165,0.10)' },
  { label: 'Strong Bearish', brent: '$87+',   vix: '16+',     regulatory: 'Negative', gift: '-0.4% or less',   breadth: '<12',  move: '-450 to -850 pts', prob: '95%',  action: 'Hedging, Cash increase',                color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
];

const MarketIntelPanel = ({ onClose }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // ── Theme tokens ─────────────────────────────────────────────────
  const C = {
    panelBg:      isDark ? '#0f1117'               : '#ffffff',
    headerBg:     isDark ? '#0f1117'               : '#f8fafc',
    cardBg:       isDark ? '#181c27'               : '#f1f5f9',
    tableBg:      isDark ? '#12151f'               : '#e2e8f0',
    border:       isDark ? 'rgba(255,255,255,0.08)': 'rgba(0,0,0,0.10)',
    borderSubtle: isDark ? 'rgba(255,255,255,0.05)': 'rgba(0,0,0,0.06)',
    textPrimary:  isDark ? '#ffffff'               : '#0f172a',
    textSecond:   isDark ? '#94a3b8'               : '#475569',
    textMuted:    isDark ? '#52525b'               : '#94a3b8',
    textCell:     isDark ? '#e4e4e7'               : '#1e293b',
    scoreTrack:   isDark ? '#27272a'               : '#e2e8f0',
    pillActive:   isDark ? 'rgba(255,255,255,0.18)': 'rgba(0,0,0,0.12)',
    pillBorder:   isDark ? 'rgba(255,255,255,0.20)': 'rgba(0,0,0,0.18)',
    pillText:     isDark ? '#ffffff'               : '#0f172a',
    pillInactive: isDark ? '#52525b'               : '#64748b',
  };

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [ts,      setTs]      = useState(null);
  const [brentTf,    setBrentTf]    = useState('D');
  const [vixTf,      setVixTf]      = useState('D');
  const [nasdaqTf,   setNasdaqTf]   = useState('D');
  const [hangSengTf, setHangSengTf] = useState('D');
  const [giftTf,     setGiftTf]     = useState('D');
  const [nowIST,     setNowIST]     = useState(() => new Date());
  const [sectorBreadth, setSectorBreadth] = useState(null);

  // Update clock every minute
  useEffect(() => {
    const t = setInterval(() => setNowIST(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // IST formatted: "06 Jun, 09:45 PM"
  const istStr = nowIST.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  // NASDAQ open time in IST (accounts for EDT/EST)
  // EDT (Mar-Oct, UTC-4): 9:30 AM ET = 7:00 PM IST
  // EST (Nov-Feb, UTC-5): 9:30 AM ET = 8:00 PM IST
  const nasdaqOpenIST = (() => {
    const m = nowIST.getMonth(); // 0=Jan
    return (m >= 2 && m <= 9) ? '7:00 PM' : '8:00 PM';
  })();

  // Hang Seng open time in IST: HKT = IST + 2:30h → 9:30 AM HKT = 7:00 AM IST
  const hangSengOpenIST = '7:00 AM';
  const hangSengReopenIST = '10:30 AM'; // after lunch break

  // NASDAQ market status (America/New_York) — computed once
  const nasdaqStatus = (() => {
    const etStr = nowIST.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
    const et = new Date(etStr);
    const day  = et.getDay();
    const mins = et.getHours() * 60 + et.getMinutes();
    if (day === 0 || day === 6)      return { label: 'Closed (Weekend)', color: '#64748b', live: false };
    if (mins >= 570  && mins < 960)  return { label: 'Open',             color: '#22c55e', live: true  };
    if (mins >= 240  && mins < 570)  return { label: 'Pre-Market',       color: '#f59e0b', live: false };
    if (mins >= 960  && mins < 1200) return { label: 'After-Hours',      color: '#f59e0b', live: false };
    return                                  { label: 'Closed',           color: '#64748b', live: false };
  })();

  // Hang Seng market status (Asia/Hong_Kong) — computed once
  const hangSengStatus = (() => {
    const hkStr = nowIST.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', hour12: false });
    const hk   = new Date(hkStr);
    const day  = hk.getDay();
    const mins = hk.getHours() * 60 + hk.getMinutes();
    if (day === 0 || day === 6)                               return { label: 'Closed (Weekend)', color: '#64748b', live: false };
    if ((mins >= 570 && mins < 720) || (mins >= 780 && mins < 960))
                                                              return { label: 'Open',             color: '#22c55e', live: true  };
    if (mins >= 720 && mins < 780)                            return { label: 'Lunch Break',      color: '#f59e0b', live: false };
    return                                                           { label: 'Closed',           color: '#64748b', live: false };
  })();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [marketRes, sbRes] = await Promise.allSettled([
        axios.get(`${API}/market-intel`),
        axios.get(`${API}/sectors/breadth`),
      ]);
      if (marketRes.status === 'fulfilled') {
        setData(marketRes.value.data);
        setTs(new Date());
      } else {
        setError('Failed to load market intelligence data');
      }
      if (sbRes.status === 'fulfilled') setSectorBreadth(sbRes.value.data);
    } catch (e) {
      setError('Failed to load market intelligence data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Force-refresh news only (bypasses 15-min cache) then reloads market-intel
  const refreshNews = useCallback(async () => {
    try {
      await axios.post(`${API}/market-intel/news-refresh`);
      const { data: d } = await axios.get(`${API}/market-intel`);
      setData(d);
      setTs(new Date());
    } catch (e) {
      // silently ignore
    }
  }, []);

  // Initial load + auto-refresh every 2 minutes so Brent/VIX stay live
  useEffect(() => {
    load();
    const interval = setInterval(load, 120000); // 2 min matches backend cache TTL
    return () => clearInterval(interval);
  }, [load]);

  const activeRow = data ? ROWS.findIndex(r => r.label === data.bias) : -1;

  const brentChg = brentTf === 'W' ? data?.brent_chg_week
                 : brentTf === 'M' ? data?.brent_chg_month
                 : data?.brent_chg_pct;
  const vixChg   = vixTf === 'W' ? data?.vix_chg_week
                 : vixTf === 'M' ? data?.vix_chg_month
                 : data?.vix_chg_pct;
  const nasdaqChg   = nasdaqTf === 'W' ? data?.nasdaq_chg_week
                    : nasdaqTf === 'M' ? data?.nasdaq_chg_month
                    : data?.nasdaq_chg_pct;
  const hangSengChg = hangSengTf === 'W' ? data?.hang_seng_chg_week
                    : hangSengTf === 'M' ? data?.hang_seng_chg_month
                    : data?.hang_seng_chg_pct;
  const giftChg     = giftTf === 'W' ? data?.gift_chg_week
                    : giftTf === 'M' ? data?.gift_chg_month
                    : null; // Day = just show premium

  const chgColor = (v) =>
    v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : C.textMuted;

  const TfPill = ({ value, active, onClick }) => (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 rounded text-[9px] font-bold transition-all"
      style={{
        background: active ? C.pillActive   : 'transparent',
        color:      active ? C.pillText     : C.pillInactive,
        border:     active ? `1px solid ${C.pillBorder}` : '1px solid transparent',
      }}
    >
      {value}
    </button>
  );

  const ScoreBar = ({ label, score, max = 2.5 }) => {
    const norm  = Math.max(0, (score + Math.abs(max)) / (2 * Math.abs(max)));
    const color = score > 0.3 ? '#22c55e' : score < -0.3 ? '#ef4444' : C.textSecond;
    return (
      <div className="flex items-center gap-2 text-[10px]">
        <span style={{ color: C.textMuted }} className="w-16 shrink-0">{label}</span>
        <div className="flex-1 h-1 rounded overflow-hidden" style={{ background: C.scoreTrack }}>
          <div style={{ width: `${norm * 100}%`, backgroundColor: color }} className="h-full rounded" />
        </div>
        <span style={{ color }} className="font-mono w-8 text-right">{score > 0 ? '+' : ''}{score}</span>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="market-intel-panel"
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl"
        style={{ background: C.panelBg, boxShadow: '0 0 60px rgba(0,0,0,0.5)', border: `1px solid ${C.border}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 sticky top-0 z-10"
          style={{ background: C.headerBg, borderBottom: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2.5">
            <Globe size={18} weight="duotone" className="text-sky-500" />
            <span className="text-sm font-bold tracking-wide" style={{ color: C.textPrimary }}>Market Intelligence</span>
            {ts && (
              <span className="text-[10px] ml-1" style={{ color: C.textMuted }}>
                Updated {ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all"
              style={{ color: C.textSecond, border: `1px solid ${C.border}` }}
              data-testid="market-intel-refresh"
            >
              <ArrowClockwise size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md transition-all"
              style={{ color: C.textMuted }}
              data-testid="market-intel-close"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <ArrowClockwise size={28} className="text-sky-500 animate-spin" />
              <span className="text-xs" style={{ color: C.textSecond }}>Fetching live macro data...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="m-5 p-3 rounded-lg text-red-400 text-xs"
            style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}>
            {error}
          </div>
        )}

        {data && (
          <div className="p-5 space-y-5">

            {/* Live Data Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">

              {/* Brent Crude */}
              <div className="rounded-xl p-3" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-[9px]" style={{ color: C.textMuted }}>
                    <ChartLine size={12} />
                    <span className="uppercase tracking-widest">Brent Crude</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {['D','W','M'].map(t => (
                      <TfPill key={t} value={t} active={brentTf === t} onClick={() => setBrentTf(t)} />
                    ))}
                  </div>
                </div>
                <div className="text-sm font-bold font-mono" style={{ color: C.textPrimary }}>
                  {data.brent > 0 ? `$${fmt(data.brent)}` : '—'}
                </div>
                <div className="text-[10px] mt-0.5 font-mono" style={{ color: chgColor(brentChg) }}>
                  {data.brent > 0 ? `${fmtPct(brentChg)} ${brentTf === 'D' ? '(Day)' : brentTf === 'W' ? '(Week)' : '(Month)'}` : 'Fetching...'}
                </div>
              </div>

              {/* India VIX */}
              <div className="rounded-xl p-3" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-[9px]" style={{ color: C.textMuted }}>
                    <Gauge size={12} />
                    <span className="uppercase tracking-widest">India VIX</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {['D','W','M'].map(t => (
                      <TfPill key={t} value={t} active={vixTf === t} onClick={() => setVixTf(t)} />
                    ))}
                  </div>
                </div>
                <div className="text-sm font-bold font-mono" style={{ color: C.textPrimary }}>{fmt(data.vix)}</div>
                <div className="text-[10px] mt-0.5 font-mono" style={{ color: chgColor(vixChg) }}>
                  {fmtPct(vixChg)} {vixTf === 'D' ? '(Day)' : vixTf === 'W' ? '(Week)' : '(Month)'}
                </div>
              </div>

              {/* Nasdaq */}
              <div className="rounded-xl p-3" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-[9px]" style={{ color: C.textMuted }}>
                    <ChartLine size={12} />
                    <span className="uppercase tracking-widest">Nasdaq</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {['D','W','M'].map(t => (
                      <TfPill key={t} value={t} active={nasdaqTf === t} onClick={() => setNasdaqTf(t)} />
                    ))}
                  </div>
                </div>
                <div className="text-sm font-bold font-mono" style={{ color: C.textPrimary }}>
                  {data.nasdaq > 0 ? data.nasdaq.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                </div>
                <div className="text-[10px] mt-0.5 font-mono" style={{ color: chgColor(nasdaqChg) }}>
                  {fmtPct(nasdaqChg)} {nasdaqTf === 'D' ? '(Day)' : nasdaqTf === 'W' ? '(Week)' : '(Month)'}
                </div>
                <div className="flex items-center justify-between mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
                  {nasdaqStatus.live ? (
                    <span className="flex items-center gap-1 text-[8px] font-bold" style={{ color: '#22c55e' }}>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: 'pulse 1.5s infinite' }} />
                      LIVE
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono" style={{ color: C.textMuted }}>
                      Opens {nasdaqOpenIST} IST
                    </span>
                  )}
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: nasdaqStatus.color, background: `${nasdaqStatus.color}18` }}>
                    {nasdaqStatus.label}
                  </span>
                </div>
              </div>

              {/* Other cards — Hang Seng, PCR, GIFT Nifty, Regulatory, Bias */}
              {[
                {
                  label: 'Hang Seng',
                  value: data.hang_seng > 0 ? data.hang_seng.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—',
                  sub: fmtPct(hangSengChg),
                  subColor: chgColor(hangSengChg),
                  icon: <Globe size={14} />,
                  tf: hangSengTf, setTf: setHangSengTf,
                  tfSub: hangSengTf === 'D' ? fmtPct(hangSengChg) + ' (Day)'
                       : hangSengTf === 'W' ? fmtPct(hangSengChg) + ' (Week)'
                       : fmtPct(hangSengChg) + ' (Month)',
                  tfSubColor: chgColor(hangSengChg),
                  marketStatus: hangSengStatus,
                  showClock: true,
                  openTimeIST: hangSengStatus.label === 'Lunch Break' ? hangSengReopenIST : hangSengOpenIST,
                },
                // ── PCR Card ──────────────────────────────────────────────────
                {
                  label: 'Nifty PCR',
                  isPcr: true,
                  value: data.pcr?.pcr > 0 ? data.pcr.pcr.toFixed(2) : '—',
                  valueColor: data.pcr?.signal_color || C.textPrimary,
                  sub: data.pcr?.source === 'vix_derived'
                    ? `${data.pcr.signal_label} (VIX ${data.pcr.vix?.toFixed(1)})`
                    : (data.pcr?.signal_label || 'Unavailable'),
                  subColor: data.pcr?.source === 'vix_derived'
                    ? '#f59e0b'
                    : (data.pcr?.signal_color || C.textMuted),
                  icon: <ChartBar size={14} />,
                },
                {
                  label: 'GIFT Nifty',
                  value: fmt(data.gift_nifty, 0),
                  sub: giftTf === 'D'
                    ? `Premium: ${data.gift_premium > 0 ? '+' : ''}${fmt(data.gift_premium, 0)}`
                    : fmtPct(giftChg) + (giftTf === 'W' ? ' (Week)' : ' (Month)'),
                  subColor: giftTf === 'D'
                    ? (data.gift_premium >= 0 ? '#22c55e' : '#ef4444')
                    : chgColor(giftChg),
                  icon: <Globe size={14} />,
                  tf: giftTf, setTf: setGiftTf,
                },
                {
                  label: 'Regulatory',
                  value: data.regulatory,
                  sub: 'SEBI/NSE',
                  subColor: C.textMuted,
                  icon: <Gauge size={14} />,
                  valueColor: data.regulatory === 'Positive' ? '#22c55e' : data.regulatory === 'Negative' ? '#ef4444' : C.textSecond,
                },
                {
                  label: 'N50 Breadth',
                  isBreadth: true,
                  value: data.breadth?.advances != null
                    ? `${data.breadth.advances} / 50`
                    : '—',
                  valueColor: data.breadth?.signal_color || C.textPrimary,
                  sub: data.breadth?.signal_label || 'Loading...',
                  subColor: data.breadth?.signal_color || C.textMuted,
                  icon: <ChartBar size={14} />,
                },
                {
                  label: 'Bias',
                  value: data.bias,
                  sub: `Score: ${data.scores?.total}`,
                  subColor: C.textMuted,
                  icon: <Gauge size={14} />,
                  valueColor: data.bias_color,
                },
              ].map(({ label, value, sub, subColor, icon, valueColor, tf, setTf, marketStatus, showClock, openTimeIST, isPcr, isBreadth }) => (
                <div key={label} className="rounded-xl p-3" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
                  data-testid={`card-${label.toLowerCase().replace(/\s+/g, '-')}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-[9px]" style={{ color: C.textMuted }}>
                      {icon}
                      <span className="uppercase tracking-widest">{label}</span>
                    </div>
                    {tf !== undefined && (
                      <div className="flex items-center gap-0.5">
                        {['D','W','M'].map(t => (
                          <TfPill key={t} value={t} active={tf === t} onClick={() => setTf(t)} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-bold font-mono" style={{ color: valueColor || C.textPrimary }}>{value}</div>
                  {/* Breadth mini bar */}
                  {isBreadth && data.breadth?.advances != null && (
                    <div className="flex h-1.5 rounded-full overflow-hidden my-1">
                      <div style={{ width: `${(data.breadth.advances / (data.breadth.total || 50)) * 100}%`, background: '#22c55e' }} />
                      <div style={{ width: `${(data.breadth.unchanged / (data.breadth.total || 50)) * 100}%`, background: isDark ? '#334155' : '#cbd5e1' }} />
                      <div style={{ width: `${(data.breadth.declines / (data.breadth.total || 50)) * 100}%`, background: '#ef4444' }} />
                    </div>
                  )}
                  <div className="text-[10px] mt-0.5 font-mono" style={{ color: subColor }}>{sub}</div>
                  {/* PCR trend badge */}
                  {isPcr && (() => {
                    const hist = data.pcr_history || [];
                    if (hist.length < 5) return null;
                    const last5 = hist.slice(-5).map(p => p.pcr);
                    const diff = last5[4] - last5[0];
                    if (diff > 0.02) return (
                      <div className="mt-1 text-[8px] font-black" style={{ color: '#22c55e' }}>PCR Rising ▲</div>
                    );
                    if (diff < -0.02) return (
                      <div className="mt-1 text-[8px] font-black" style={{ color: '#ef4444' }}>PCR Falling ▼</div>
                    );
                    return (
                      <div className="mt-1 text-[8px] font-bold" style={{ color: '#94a3b8' }}>PCR Stable →</div>
                    );
                  })()}
                  {showClock && marketStatus && (
                    <div className="flex items-center justify-between mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
                      {marketStatus.live ? (
                        <span className="flex items-center gap-1 text-[8px] font-bold" style={{ color: '#22c55e' }}>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: 'pulse 1.5s infinite' }} />
                          LIVE
                        </span>
                      ) : (
                        <span className="text-[8px] font-mono" style={{ color: C.textMuted }}>
                          {marketStatus.label === 'Lunch Break' ? 'Reopens' : 'Opens'} {openTimeIST} IST
                        </span>
                      )}
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: marketStatus.color, background: `${marketStatus.color}18` }}>
                        {marketStatus.label}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* ── Geo Risk mini card in data strip ── */}
              {data.geo_risk && (
                <div className="rounded-xl p-3" style={{ background: C.cardBg, border: `1px solid ${data.geo_risk.level_color}40` }}
                  data-testid="card-geo-risk">
                  <div className="flex items-center gap-1.5 text-[9px] mb-1.5" style={{ color: C.textMuted }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={data.geo_risk.level_color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                    <span className="uppercase tracking-widest">Geo Risk</span>
                  </div>
                  <div className="text-sm font-bold font-mono" style={{ color: data.geo_risk.level_color }}>
                    {data.geo_risk.level}
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden my-1" style={{ background: C.panelBg }}>
                    <div style={{ width: `${Math.min(100, (data.geo_risk.score / (data.geo_risk.score_max || 15)) * 100)}%`, background: data.geo_risk.level_color, transition: 'width 0.4s' }} />
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: C.textMuted }}>
                    Score: {data.geo_risk.score}/{data.geo_risk.score_max || 15}
                  </div>
                </div>
              )}
            </div>

            {/* Current Bias Card */}
            {(() => {
              // IST date helpers — computed once for the whole bias card
              const nowIST  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
              const DAY_SH  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
              const MON_SH  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const todayDay  = nowIST.getDay();                               // 0=Sun 6=Sat
              const isWeekend = todayDay === 0 || todayDay === 6;
              const todayStr  = `${DAY_SH[todayDay]}, ${nowIST.getDate()} ${MON_SH[nowIST.getMonth()]}`;
              const tmrIST    = new Date(nowIST); tmrIST.setDate(tmrIST.getDate() + 1);
              const tmrDay    = tmrIST.getDay();
              const tmrStr    = `${DAY_SH[tmrDay]}, ${tmrIST.getDate()} ${MON_SH[tmrIST.getMonth()]}`;
              const isTmrWeekend = tmrDay === 0 || tmrDay === 6;

              return (
            <div
              className="rounded-xl p-4"
              style={{ background: `${data.bias_color}18`, border: `1px solid ${data.bias_color}40` }}
              data-testid="market-intel-bias-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: C.textSecond }}>Current Market Bias</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-2xl font-black" style={{ color: data.bias_color }}>{data.bias}</div>
                    {isWeekend && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: '#64748b25', color: '#94a3b8', border: '1px solid #64748b40' }}>
                        🏖 Weekend
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1" style={{ color: C.textSecond }}>{data.action}</div>
                </div>
                <div className="flex gap-4 flex-wrap">
                  {/* Today's Possibility */}
                  <div className="text-center min-w-[110px]">
                    <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: C.textMuted }}>Today&#39;s Possibility</div>
                    <div className="text-[8px] font-bold mb-1" style={{ color: '#60a5fa' }}>{todayStr}{isWeekend ? ' · Market Closed' : ''}</div>
                    <div
                      className="text-[11px] font-black font-mono px-2 py-0.5 rounded"
                      style={{
                        color: isWeekend ? '#64748b' : (data.today_move?.color || C.textPrimary),
                        background: isWeekend ? '#64748b18' : `${data.today_move?.color || '#94a3b8'}18`,
                        border: `1px solid ${isWeekend ? '#64748b40' : (data.today_move?.color || '#94a3b8') + '40'}`,
                      }}
                    >
                      {isWeekend ? '— Market Holiday' : (
                        <>
                          {data.today_move?.icon === 'UP' ? '▲ ' : data.today_move?.icon === 'DOWN' ? '▼ ' : '→ '}
                          {data.today_move?.label || '—'}
                        </>
                      )}
                    </div>
                    <div className="text-[8px] mt-0.5 font-medium" style={{ color: isWeekend ? '#64748b' : (data.today_move?.color || C.textMuted) }}>
                      {isWeekend ? 'No trading' : (data.today_move?.probability || '—')}
                    </div>
                    {/* ── Actual Achieved Points (shown after 3:30 PM IST) ── */}
                    {!isWeekend && data.today_actual?.available && (
                      <div className="mt-1 pt-1" style={{ borderTop: `1px dashed ${C.borderSubtle}` }}>
                        <div className="text-[6px] uppercase tracking-wider mb-0.5" style={{ color: C.textMuted }}>
                          {data.today_actual.market_closed ? 'Actual Achieved' : 'Live Move'}
                        </div>
                        <div
                          className="text-[8px] font-bold font-mono px-1 py-0.5 rounded"
                          style={{
                            color: data.today_actual.color,
                            background: `${data.today_actual.color}12`,
                            border: `1px solid ${data.today_actual.color}30`,
                          }}
                          data-testid="today-actual-move"
                        >
                          {data.today_actual.label}
                        </div>
                        {data.today_actual.market_closed && (
                          <div className="text-[6px] mt-0.5 leading-tight" style={{ color: C.textMuted }}>
                            {data.today_actual.open_price?.toLocaleString('en-IN')} → {data.today_actual.close_price?.toLocaleString('en-IN')}
                          </div>
                        )}
                        {/* ── Accuracy Badge: Predicted vs Actual ── */}
                        {data.today_actual.market_closed && data.today_move && (() => {
                          const label  = data.today_move.label || '';
                          const dir    = data.today_move.direction;
                          const actual = data.today_actual.actual_pts || 0;
                          let accuracy = '', color = '';
                          if (dir === 'SIDEWAYS') {
                            const m = label.match(/±(\d+) to ±(\d+)/);
                            const max = m ? parseInt(m[2]) : 0;
                            const abs = Math.abs(actual);
                            if (max && abs <= max)           { accuracy = 'Within Range'; color = '#22c55e'; }
                            else if (max && abs <= max*1.3)  { accuracy = 'Near Range';   color = '#eab308'; }
                            else                             { accuracy = 'Exceeded';      color = '#f97316'; }
                          } else if (dir === 'BULLISH') {
                            const m = label.match(/\+(\d+) to \+(\d+)/);
                            const [mn, mx] = m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0];
                            if (actual >= mn && actual <= mx)      { accuracy = 'On Target'; color = '#22c55e'; }
                            else if (actual > mx)                  { accuracy = 'Exceeded';  color = '#22c55e'; }
                            else if (actual > 0)                   { accuracy = 'Partial';   color = '#eab308'; }
                            else                                   { accuracy = 'Missed';    color = '#ef4444'; }
                          } else {
                            const m = label.match(/-(\d+) to -(\d+)/);
                            const [mn, mx] = m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0];
                            const abs = Math.abs(actual);
                            if (actual < 0 && abs >= mn && abs <= mx) { accuracy = 'On Target'; color = '#22c55e'; }
                            else if (actual < 0 && abs > mx)          { accuracy = 'Exceeded';  color = '#22c55e'; }
                            else if (actual < 0)                      { accuracy = 'Partial';   color = '#eab308'; }
                            else                                      { accuracy = 'Missed';    color = '#ef4444'; }
                          }
                          return accuracy ? (
                            <div className="mt-0.5 text-[6px] font-semibold px-1 py-0.5 rounded-full text-center"
                                 style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}
                                 data-testid="prediction-accuracy-badge">
                              {accuracy}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Vertical divider */}
                  <div className="w-px self-stretch" style={{ background: C.border }} />

                  {/* Tomorrow's Possibility */}
                  <div className="text-center min-w-[110px]">
                    <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: C.textMuted }}>Tomorrow&#39;s Possibility</div>
                    <div className="text-[8px] font-bold mb-1" style={{ color: '#60a5fa' }}>{tmrStr}{isTmrWeekend ? ' · Market Closed' : ''}</div>
                    <div
                      className="text-[11px] font-black font-mono px-2 py-0.5 rounded"
                      style={{
                        color: isTmrWeekend ? '#64748b' : (data.tomorrow_move?.color || C.textPrimary),
                        background: isTmrWeekend ? '#64748b18' : `${data.tomorrow_move?.color || '#94a3b8'}18`,
                        border: `1px solid ${isTmrWeekend ? '#64748b40' : (data.tomorrow_move?.color || '#94a3b8') + '40'}`,
                      }}
                    >
                      {isTmrWeekend ? '— Market Holiday' : (
                        <>
                          {data.tomorrow_move?.icon === 'UP' ? '▲ ' : data.tomorrow_move?.icon === 'DOWN' ? '▼ ' : '→ '}
                          {data.tomorrow_move?.label || '—'}
                        </>
                      )}
                    </div>
                    <div className="text-[8px] mt-0.5 font-medium" style={{ color: isTmrWeekend ? '#64748b' : (data.tomorrow_move?.color || C.textMuted) }}>
                      {isTmrWeekend ? 'No trading' : (data.tomorrow_move?.probability || '—')}
                    </div>
                  </div>
                  {data.nasdaq_pts !== 0 && (
                    <div className="text-center">
                      <div className="text-[9px] uppercase tracking-widest" style={{ color: C.textMuted }}>Nasdaq → Nifty Impact</div>
                      <div className="text-base font-bold font-mono mt-0.5" style={{ color: data.nasdaq_nifty_color }}>
                        {data.nasdaq_nifty_label}
                      </div>
                      <div className="text-[9px] mt-0.5" style={{ color: data.nasdaq_nifty_color }}>{data.nasdaq_nifty_signal}</div>
                    </div>
                  )}
                  {data.hang_seng > 0 && data.hang_seng_chg_pct !== 0 && (
                    <div className="text-center">
                      <div className="text-[9px] uppercase tracking-widest" style={{ color: C.textMuted }}>Hang Seng → Nifty</div>
                      <div className="text-base font-bold font-mono mt-0.5" style={{ color: data.hs_nifty_color }}>
                        {data.hs_nifty_label}
                      </div>
                      <div className="text-[9px] mt-0.5" style={{ color: data.hs_nifty_color }}>{data.hs_nifty_signal}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
              ); // end return
            })()} {/* end IIFE */}

            {/* ── Nifty 50 Market Breadth (right after Bias) ──────────── */}
            <BreadthCard breadth={data.breadth} C={C} isDark={isDark} />

            {/* ── Sector Breadth (12 sectors → Nifty move predictor) ─── */}
            <SectorBreadthCard
              sb={sectorBreadth}
              C={C}
              isDark={isDark}
              giftPremium={data.gift_premium ?? 0}
            />

            {/* Nasdaq ↔ Nifty Correlation Info Strip */}
            {data.nasdaq > 0 && (
              <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2"
                style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
                data-testid="nasdaq-nifty-correlation">
                <div className="flex items-center gap-2 shrink-0">
                  <ChartLine size={13} className="text-blue-400" />
                  <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.textMuted }}>Nasdaq ↔ Nifty Correlation</span>
                </div>
                <div className="flex gap-4 flex-wrap text-[9px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: '#22c55e' }}>Nasdaq +100 pts</span>
                    <span style={{ color: C.textMuted }}>→</span>
                    <span style={{ color: C.textSecond }}>Nifty avg <span className="font-bold text-emerald-400">+80 to +150 pts</span></span>
                  </div>
                  <div className="h-3 w-px self-center" style={{ background: C.border }} />
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: '#ef4444' }}>Nasdaq -100 pts</span>
                    <span style={{ color: C.textMuted }}>→</span>
                    <span style={{ color: C.textSecond }}>Nifty avg <span className="font-bold text-red-400">-100 to -200 pts</span></span>
                  </div>
                  {data.nasdaq_pts !== 0 && (
                    <>
                      <div className="h-3 w-px self-center" style={{ background: C.border }} />
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold" style={{ color: C.textSecond }}>Today Nasdaq</span>
                        <span className="font-bold font-mono" style={{ color: data.nasdaq_nifty_color }}>
                          {data.nasdaq_pts > 0 ? '+' : ''}{data.nasdaq_pts.toLocaleString()} pts
                        </span>
                        <span style={{ color: C.textMuted }}>→</span>
                        <span className="font-bold font-mono" style={{ color: data.nasdaq_nifty_color }}>{data.nasdaq_nifty_label}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Hang Seng ↔ Nifty Correlation Strip */}
            {data.hang_seng > 0 && (
              <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2"
                style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
                data-testid="hangseng-nifty-correlation">
                <div className="flex items-center gap-2 shrink-0">
                  <Globe size={13} className="text-orange-400" />
                  <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.textMuted }}>Hang Seng ↔ Nifty Correlation</span>
                </div>
                <div className="flex gap-4 flex-wrap text-[9px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: '#22c55e' }}>HS +1%</span>
                    <span style={{ color: C.textMuted }}>→</span>
                    <span style={{ color: C.textSecond }}>Nifty avg <span className="font-bold text-emerald-400">+50 to +100 pts</span></span>
                  </div>
                  <div className="h-3 w-px self-center" style={{ background: C.border }} />
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: '#ef4444' }}>HS -1%</span>
                    <span style={{ color: C.textMuted }}>→</span>
                    <span style={{ color: C.textSecond }}>Nifty avg <span className="font-bold text-red-400">-70 to -150 pts</span></span>
                  </div>
                  {data.hang_seng_chg_pct !== 0 && (
                    <>
                      <div className="h-3 w-px self-center" style={{ background: C.border }} />
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold" style={{ color: C.textSecond }}>Today HS</span>
                        <span className="font-bold font-mono" style={{ color: data.hs_nifty_color }}>
                          {data.hang_seng_chg_pct > 0 ? '+' : ''}{data.hang_seng_chg_pct?.toFixed(2)}%
                        </span>
                        <span style={{ color: C.textMuted }}>→</span>
                        <span className="font-bold font-mono" style={{ color: data.hs_nifty_color }}>{data.hs_nifty_label}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Nifty PCR Signal Card ────────────────────────────────────── */}
            {data.pcr && data.pcr.signal !== 'UNAVAILABLE' && (
              <div className="rounded-xl p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
                data-testid="pcr-signal-card">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ChartBar size={13} className="text-purple-400" />
                    <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.textMuted }}>
                      Nifty PCR Signal
                    </span>
                    {/* VIX-Derived badge */}
                    {data.pcr.source === 'vix_derived' && (
                      <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40' }}>
                        VIX-Derived
                      </span>
                    )}
                    {/* PCR Trend badge from last 5 readings */}
                    {(() => {
                      const hist = data.pcr_history || [];
                      if (hist.length < 5) return null;
                      const last5 = hist.slice(-5).map(p => p.pcr);
                      const diff = last5[4] - last5[0];
                      if (diff > 0.02) return (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40' }}>
                          PCR Rising ▲
                        </span>
                      );
                      if (diff < -0.02) return (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}>
                          PCR Falling ▼
                        </span>
                      );
                      return (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: '#94a3b820', color: '#94a3b8', border: '1px solid #94a3b840' }}>
                          PCR Stable →
                        </span>
                      );
                    })()}
                  </div>
                  <span className="text-[9px] font-mono" style={{ color: C.textMuted }}>
                    {data.pcr.source === 'vix_derived'
                      ? <span>VIX <span className="font-bold" style={{ color: '#f59e0b' }}>{data.pcr.vix?.toFixed(1)}</span></span>
                      : <span>OI PCR: <span className="font-bold" style={{ color: data.pcr.signal_color }}>{data.pcr.pcr}</span></span>
                    }
                  </span>
                </div>

                {/* Main PCR signal chip */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="flex-1 px-3 py-2 rounded-lg text-center"
                    style={{
                      background: data.pcr.signal_bg || `${data.pcr.signal_color}18`,
                      border: `1px solid ${data.pcr.signal_color}50`,
                    }}
                  >
                    <div className="text-[11px] font-black tracking-wide" style={{ color: data.pcr.signal_color }}>
                      {data.pcr.signal_label}
                    </div>
                    {data.pcr.caution && (
                      <div className="text-[8px] font-bold mt-0.5" style={{ color: '#f59e0b' }}>
                        ⚠ {data.pcr.caution_label}
                      </div>
                    )}
                    <div className="text-[8px] mt-1" style={{ color: C.textMuted }}>{data.pcr.description}</div>
                  </div>
                </div>

                {/* PCR level reference guide */}
                <div className="grid grid-cols-3 gap-1 mb-3">
                  {[
                    { range: '< 0.50', label: 'OVER-BEARISH', color: '#ef4444' },
                    { range: '0.50–0.70', label: 'BEARISH', color: '#f97316' },
                    { range: '0.70–0.90', label: 'NEUTRAL-BEAR', color: '#eab308' },
                    { range: '0.90–1.20', label: 'HEALTHY BULL', color: '#22c55e' },
                    { range: '1.20–1.50', label: 'STRONG BULL', color: '#16a34a' },
                    { range: '> 1.50',   label: 'OVER-BULLISH', color: '#f59e0b' },
                  ].map((item) => {
                    const isActive = (
                      (item.range === '< 0.50'    && data.pcr.pcr < 0.50) ||
                      (item.range === '0.50–0.70' && data.pcr.pcr >= 0.50 && data.pcr.pcr < 0.70) ||
                      (item.range === '0.70–0.90' && data.pcr.pcr >= 0.70 && data.pcr.pcr < 0.90) ||
                      (item.range === '0.90–1.20' && data.pcr.pcr >= 0.90 && data.pcr.pcr < 1.20) ||
                      (item.range === '1.20–1.50' && data.pcr.pcr >= 1.20 && data.pcr.pcr < 1.50) ||
                      (item.range === '> 1.50'    && data.pcr.pcr >= 1.50)
                    );
                    return (
                      <div key={item.range}
                        className="rounded px-1 py-0.5 text-center"
                        style={{
                          background: isActive ? `${item.color}28` : 'transparent',
                          border: `1px solid ${isActive ? item.color : C.borderSubtle}`,
                        }}
                      >
                        <div className="text-[7px] font-mono" style={{ color: isActive ? item.color : C.textMuted }}>{item.range}</div>
                        <div className="text-[7px] font-bold leading-tight" style={{ color: isActive ? item.color : C.textMuted }}>{item.label}</div>
                      </div>
                    );
                  })}
                </div>

                {/* PCR Trend Sparkline */}
                <PcrSparkline
                  history={data.pcr_history || []}
                  currentPcr={data.pcr?.pcr}
                  isDark={isDark}
                />

                {/* PCR + Price Action combined signal */}
                {data.pcr_price_action && data.pcr_price_action.signal !== 'UNAVAILABLE' && (
                  <div>
                    <div className="text-[8px] uppercase tracking-wider mb-1.5" style={{ color: C.textMuted }}>PCR + Price Action</div>
                    <div
                      className="rounded-lg px-3 py-2 flex items-center gap-2"
                      style={{
                        background: `${data.pcr_price_action.color}15`,
                        border: `1px solid ${data.pcr_price_action.color}40`,
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: data.pcr_price_action.color }}
                      />
                      <div>
                        <div className="text-[10px] font-black" style={{ color: data.pcr_price_action.color }}>
                          {data.pcr_price_action.label}
                        </div>
                        <div className="text-[8px]" style={{ color: C.textMuted }}>{data.pcr_price_action.detail}</div>
                      </div>
                    </div>
                    {/* 4 rule reference */}
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {[
                        { cond: 'Price UP + PCR UP', result: 'BULLISH CONFIRMATION', color: '#22c55e' },
                        { cond: 'Price DOWN + PCR DOWN', result: 'BEARISH CONFIRMATION', color: '#ef4444' },
                        { cond: 'Price UP + PCR DOWN', result: 'WEAK RALLY (CAUTION)', color: '#f59e0b' },
                        { cond: 'Price DOWN + PCR UP', result: 'BOUNCE POSSIBLE', color: '#06b6d4' },
                      ].map((rule) => (
                        <div key={rule.cond} className="rounded px-1.5 py-1"
                          style={{ background: C.panelBg, border: `1px solid ${C.borderSubtle}` }}>
                          <div className="text-[7px]" style={{ color: C.textMuted }}>{rule.cond}</div>
                          <div className="text-[7px] font-bold" style={{ color: rule.color }}>{rule.result}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VIX Percentile + Expiry row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {data.vix_52w_high > 0 && (
                <div className="rounded-xl p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
                  data-testid="vix-percentile-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Gauge size={13} className="text-amber-500" />
                    <span className="text-[9px] uppercase tracking-widest" style={{ color: C.textMuted }}>India VIX — 52-Week Percentile</span>
                  </div>
                  <div className="relative mb-2">
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #22c55e 0%, #eab308 40%, #f97316 70%, #ef4444 100%)' }}>
                      <div
                        className="absolute top-0 w-2 h-3 rounded-sm border-2 border-white shadow-lg"
                        style={{ left: `calc(${data.vix_percentile}% - 4px)`, background: data.vix_zone_color }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-[9px] mb-3" style={{ color: C.textMuted }}>
                    <span>Low {fmt(data.vix_52w_low)}</span>
                    <span>High {fmt(data.vix_52w_high)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xl font-black font-mono" style={{ color: data.vix_zone_color }}>
                        {fmt(data.vix_percentile, 1)}%ile
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: data.vix_zone_color }}>
                        {data.vix_zone}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px]" style={{ color: C.textMuted }}>Current VIX</div>
                      <div className="text-base font-bold font-mono" style={{ color: C.textPrimary }}>{fmt(data.vix)}</div>
                    </div>
                  </div>
                  {data.vix_percentile >= 75 && (
                    <div className="mt-2 flex items-center gap-1.5 text-[9px] text-red-400 rounded px-2 py-1"
                      style={{ background: 'rgba(239,68,68,0.10)' }}>
                      <Warning size={10} weight="fill" />
                      VIX at historical highs — expect high volatility
                    </div>
                  )}
                  {data.vix_percentile <= 20 && (
                    <div className="mt-2 flex items-center gap-1.5 text-[9px] text-emerald-500 rounded px-2 py-1"
                      style={{ background: 'rgba(34,197,94,0.10)' }}>
                      <Gauge size={10} weight="fill" />
                      VIX at historical lows — calm market conditions
                    </div>
                  )}
                </div>
              )}

              {data.expiry && (
                <div className="rounded-xl p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
                  data-testid="expiry-countdown-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Timer size={13} className="text-violet-500" />
                    <span className="text-[9px] uppercase tracking-widest" style={{ color: C.textMuted }}>Weekly Options Expiry</span>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(data.expiry).map(([name, info]) => {
                      const urgent      = info.days === 0;
                      const urgentColor = urgent ? '#f97316' : '#a78bfa';
                      return (
                        <div key={name} className="flex items-center justify-between"
                          data-testid={`expiry-${name.toLowerCase()}`}>
                          <div>
                            <div className="text-[9px] uppercase tracking-widest" style={{ color: C.textMuted }}>{name} Weekly</div>
                            <div className="text-[10px] mt-0.5" style={{ color: C.textSecond }}>{info.expiry_date}</div>
                          </div>
                          <div className="text-right">
                            {urgent ? (
                              <div className="text-xs font-bold text-orange-500 animate-pulse">
                                TODAY — {info.hours}h {info.minutes}m
                              </div>
                            ) : (
                              <div className="font-mono text-sm font-bold" style={{ color: urgentColor }}>
                                {info.days}d {info.hours}h {info.minutes}m
                              </div>
                            )}
                            <div className="text-[9px] mt-0.5" style={{ color: C.textMuted }}>to expiry</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 text-[9px]" style={{ borderTop: `1px solid ${C.borderSubtle}`, color: C.textMuted }}>
                    NIFTY: every Thursday · BANKNIFTY: every Wednesday · 3:30 PM IST
                  </div>
                </div>
              )}
            </div>

            {/* Decision Matrix Table */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="px-4 py-2.5" style={{ background: C.cardBg, borderBottom: `1px solid ${C.border}` }}>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: C.textMuted }}>Decision Matrix</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ background: C.tableBg, borderBottom: `1px solid ${C.border}` }}>
                      {['Bias', 'Brent Level', 'VIX', 'Regulatory', 'GIFT Nifty', 'Breadth (Up)', 'Today Move', 'Probability', 'Example Action'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-widest whitespace-nowrap"
                          style={{ color: C.textMuted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row, i) => {
                      const isActive = i === activeRow;
                      return (
                        <tr
                          key={row.label}
                          data-testid={`matrix-row-${row.label.toLowerCase().replace(/ /g,'-')}`}
                          style={{
                            background:  isActive ? row.bg : 'transparent',
                            borderLeft:  isActive ? `3px solid ${row.color}` : '3px solid transparent',
                            borderBottom: `1px solid ${C.borderSubtle}`,
                          }}
                        >
                          <td className="px-3 py-2.5 font-bold whitespace-nowrap" style={{ color: row.color }}>
                            {isActive && <span className="mr-1">▶</span>}{row.label}
                          </td>
                          <td className="px-3 py-2.5 font-mono" style={{ color: C.textCell }}>{row.brent}</td>
                          <td className="px-3 py-2.5 font-mono" style={{ color: C.textCell }}>{row.vix}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{
                                color: row.regulatory === 'Positive' ? '#22c55e' : row.regulatory === 'Negative' ? '#ef4444' : C.textSecond,
                                background: row.regulatory === 'Positive' ? 'rgba(34,197,94,0.12)' : row.regulatory === 'Negative' ? 'rgba(239,68,68,0.12)' : isDark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.12)',
                              }}
                            >
                              {row.regulatory}
                            </span>
                          </td>
                          <td className="px-3 py-2.5" style={{ color: C.textCell }}>{row.gift}</td>
                          <td className="px-3 py-2.5">
                            <span className="font-mono font-bold text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap"
                              style={{ color: row.color, background: `${row.color}15` }}>
                              {row.breadth} stocks
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: C.textPrimary }}>{row.move}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400">
                              {row.prob}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: C.textSecond }}>{row.action}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Market News Intelligence Card ───────────────────────── */}
            {data.market_news?.available && (
              <MarketNewsCard news={data.market_news} C={C} onRefresh={refreshNews} />
            )}

            {/* ── Geopolitical Risk Card ───────────────────────────────── */}
            <GeoRiskCard geoRisk={data.geo_risk} C={C} isDark={isDark} />

            {/* ── FII Activity Section (Collapsible) ─────────────────────── */}
            <FiiSection C={C} isDark={isDark} />

            {/* Footer */}
            <p className="text-[9px] text-center" style={{ color: C.textMuted }}>
              Data: Brent Crude (ICE Futures via Yahoo Finance) · India VIX (NSE) · Regulatory (SEBI/NSE RSS) · GIFT Nifty (NSE IFSC / estimated) · For informational purposes only. Not investment advice.
            </p>

          </div>
        )}
      </div>
    </div>
  );
};

// ── FII STATIC DATA ────────────────────────────────────────────────────────────
const FII_LOGIC_ROWS = [
  { action: 'Heavy Buying (₹2000 Cr+)',    nifty: 'Strong Bullish', move: '+150 to +400 pts', reason: 'Liquidity badhti hai, sentiment positive', color: '#22c55e' },
  { action: 'Moderate Buying (₹500-2000 Cr)', nifty: 'Mild Bullish', move: '+50 to +150 pts',  reason: 'Normal up move',                           color: '#86efac' },
  { action: 'Neutral',                     nifty: 'Sideways',        move: '-100 to +100 pts', reason: 'Market apne technicals pe chalega',         color: '#94a3b8' },
  { action: 'Selling (₹1000 Cr+)',         nifty: 'Bearish',         move: '-150 to -400 pts', reason: 'Pressure badhta hai',                      color: '#ef4444' },
];

const MOMENTUM_RULES = [
  'FII continuous 3-4 din buying kare → Strong upward momentum',
  'Banking, IT, Auto mein heavy buying → Nifty mein bada move',
  'Crude stable + FII buying → Sabse powerful combination',
];

const BUY_SIGNALS = [
  'FII net buying + GIFT Nifty green',
  'Previous day FII buying + Banking strong',
  'Crude stable/gir raha ho',
];

const SELL_SIGNALS = [
  'FII selling + Crude badh raha ho',
  'FII selling + VIX badh raha ho',
];

const PRACTICAL_RULES = [
  'Roz subah FII/DII data check karo (NSE website pe 6 PM ke baad aata hai)',
  'Agar FII 3 din se buying kar rahe hain → Long bias strong',
  'Agar FII selling kar rahe hain → Position chhoti rakho ya hedge',
];

// ── FII SECTION COMPONENT ──────────────────────────────────────────────────────
function FiiSection({ C, isDark }) {
  const [open,    setOpen]    = useState(false);
  const [fiiData, setFiiData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadFii = useCallback(async (force = false) => {
    if ((fiiData && !force) || loading) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/market-intel/fii`);
      setFiiData(data);
    } catch {
      setFiiData({ source: 'error' });
    } finally {
      setLoading(false);
    }
  }, [fiiData, loading]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadFii();
  };

  // Auto-refresh FII data after 6 PM IST (every 10 min when panel is open)
  useEffect(() => {
    if (!open) return;
    const ist = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istDate = new Date(ist);
    const afterSix = istDate.getHours() >= 18;
    if (!afterSix) return; // Only auto-refresh if after 6 PM IST
    const timer = setInterval(() => loadFii(true), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [open, loadFii]);

  const live  = fiiData && fiiData.fii;
  const cls   = fiiData?.classification;
  const trend = fiiData?.trend || [];

  // Contracts formatter (no ₹ sign — these are F&O lots, not crores)
  const fmtC = (v) => {
    if (v == null) return '—';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : (v > 0 && abs > 0) ? '+' : '';
    if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(2)}L`;
    if (abs >= 1000)   return `${sign}${(abs / 1000).toFixed(1)}K`;
    return `${sign}${abs}`;
  };
  // Raw header net display (no sign flip for zero)
  const fmtCHead = (v) => {
    if (v == null) return '—';
    return `${v >= 0 ? '+' : ''}${Math.abs(v) >= 1000 ? (v/1000).toFixed(1)+'K' : v} lots`;
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      {/* Header toggle row */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 transition-all"
        style={{ background: C.cardBg }}
        onClick={handleToggle}
        data-testid="fii-section-toggle"
      >
        <div className="flex items-center gap-2">
          <TrendUp size={13} className="text-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textPrimary }}>
            FII / DII Activity
          </span>
          {live && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-bold ml-1"
              style={{ background: `${cls?.color}20`, color: cls?.color }}
            >
              {fmtCHead(live.net)}
            </span>
          )}
          {fiiData?.data_for_date && (
            <span className="text-[8px] px-1.5 py-0.5 rounded font-mono ml-1"
              style={{ color: C.textMuted, background: C.borderSubtle ? `${C.borderSubtle}50` : 'rgba(100,116,139,0.15)' }}>
              {fiiData.data_for_date}
            </span>
          )}
          <span className="text-[9px] ml-1" style={{ color: C.textMuted }}>
            NSE F&amp;O
          </span>
        </div>
        <span className="text-[10px] transition-transform" style={{ color: C.textMuted, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3" style={{ background: C.panelBg }}>

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <ArrowClockwise size={12} className="animate-spin text-sky-500" />
              <span className="text-[10px]" style={{ color: C.textSecond }}>NSE se data fetch ho raha hai...</span>
            </div>
          )}

          {/* Refresh button (visible when data loaded and after 6 PM) */}
          {fiiData && !loading && (
            <div className="flex items-center justify-between">
              <div className="text-[8px]" style={{ color: C.textMuted }}>
                {fiiData.source === 'NSE F&O Archive' ? 'Source: NSE F&O Archive' :
                 fiiData.source === 'mongodb_cache' ? 'Source: Saved (MongoDB)' :
                 fiiData.source === 'unavailable' ? 'Source: Unavailable' : 'Source: NSE'}
              </div>
              <button
                onClick={() => loadFii(true)}
                className="flex items-center gap-1 text-[8px] px-2 py-0.5 rounded transition-all hover:opacity-80"
                style={{ color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}
                data-testid="fii-refresh-btn">
                <ArrowClockwise size={9} /> Refresh
              </button>
            </div>
          )}

          {live && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.textMuted }}>
                  F&amp;O Positions (Index Futures, Lots)
                </span>
                <div className="flex items-center gap-1.5">
                  {fiiData.source === 'mongodb_cache' && (
                    <span className="text-[7px] px-1 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>Cached</span>
                  )}
                  <span className="text-[9px] font-mono font-semibold" style={{ color: C.textSecond }}>{fiiData.data_for_date || fiiData.date}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'FII Long',  val: fmtC(live.buy),  color: '#22c55e' },
                  { label: 'FII Short', val: fmtC(live.sell), color: '#ef4444' },
                  { label: 'FII Net',   val: fmtC(live.net),  color: cls?.color || '#94a3b8' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center">
                    <div className="text-[9px]" style={{ color: C.textMuted }}>{label}</div>
                    <div className="text-xs font-bold font-mono" style={{ color }}>{val}</div>
                  </div>
                ))}
              </div>
              {fiiData.dii && (
                <div className="grid grid-cols-3 gap-2 pt-1.5" style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
                  {[
                    { label: 'DII Long',  val: fmtC(fiiData.dii.buy),  color: '#22c55e' },
                    { label: 'DII Short', val: fmtC(fiiData.dii.sell), color: '#ef4444' },
                    { label: 'DII Net',   val: fmtC(fiiData.dii.net),  color: fiiData.dii.net >= 0 ? '#22c55e' : '#ef4444' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="text-center">
                      <div className="text-[9px]" style={{ color: C.textMuted }}>{label}</div>
                      <div className="text-xs font-bold font-mono" style={{ color }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}
              {cls && (
                <div className="flex items-center gap-2 pt-1.5" style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: `${cls.color}20`, color: cls.color }}>{cls.action}</span>
                  <span className="text-[9px]" style={{ color: C.textSecond }}>→ {cls.nifty} · {cls.move}</span>
                </div>
              )}
              {fiiData.momentum && fiiData.momentum !== 'Neutral' && (
                <div className="text-[9px] font-semibold" style={{ color: fiiData.momentum.includes('Bull') ? '#22c55e' : '#ef4444' }}>
                  Momentum: {fiiData.momentum}
                </div>
              )}
              {trend.length > 0 && (
                <div className="flex gap-1 pt-1 flex-wrap">
                  {trend.map((t, i) => (
                    <span key={i} className="px-1 py-0.5 rounded text-[8px] font-mono" style={{ background: t.net >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: t.net >= 0 ? '#22c55e' : '#ef4444' }}>
                      {t.date ? t.date.slice(0, 6) : `D-${i+1}`}: {fmtCHead(t.net)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {fiiData && !live && fiiData.source !== 'error' && (
            <div className="space-y-2">
              {/* Availability status */}
              {fiiData.availability && (
                <div className="rounded-lg p-3" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: C.textMuted }}>
                        Data Status
                      </div>
                      <span className="text-[8px] px-1.5 py-0.5 rounded font-bold"
                        style={{
                          background: fiiData.availability.status === 'released'
                            ? 'rgba(34,197,94,0.15)' : fiiData.availability.status === 'weekend'
                            ? 'rgba(148,163,184,0.15)' : 'rgba(251,191,36,0.15)',
                          color: fiiData.availability.status === 'released'
                            ? '#22c55e' : fiiData.availability.status === 'weekend'
                            ? '#94a3b8' : '#fbbf24',
                        }}>
                        {fiiData.availability.status === 'released' ? 'Released' :
                         fiiData.availability.status === 'weekend' ? 'Weekend' : 'Pending'}
                      </span>
                    </div>
                    <span className="text-[8px] font-mono" style={{ color: C.textMuted }}>
                      {fiiData.data_for_date}
                    </span>
                  </div>
                  <div className="text-[8px] mb-2" style={{ color: C.textSecond }}>
                    {fiiData.availability.message}
                  </div>
                  {/* Countdown bar for pre-release */}
                  {fiiData.availability.show_timer && fiiData.availability.mins_to_release && (
                    <div className="mb-2">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
                        <div className="h-full rounded-full bg-amber-400"
                          style={{ width: `${Math.max(0, 100 - (fiiData.availability.mins_to_release / 720) * 100)}%`, transition: 'width 0.3s' }} />
                      </div>
                      <div className="flex justify-between mt-0.5 text-[7px]" style={{ color: C.textMuted }}>
                        <span>Market open</span>
                        <span>6 PM IST</span>
                      </div>
                    </div>
                  )}
                  {/* Cache note */}
                  {fiiData.cache_note && (
                    <div className="text-[8px] p-1.5 rounded" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                      {fiiData.cache_note}
                    </div>
                  )}
                  {/* NSE link */}
                  {fiiData.nse_url && (
                    <a href={fiiData.nse_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 mt-2 text-[8px] underline"
                      style={{ color: '#60a5fa' }}>
                      View on NSE →
                    </a>
                  )}
                </div>
              )}
              {/* Fallback: old-style message if availability not present */}
              {!fiiData.availability && (
                <div className="text-[9px] py-1.5 px-2 rounded" style={{ background: isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                  {fiiData.message || 'NSE FII data available after 6 PM IST'}
                </div>
              )}
            </div>
          )}

          {/* ── Last 3 Days History Table ──────────────────────────────── */}
          {fiiData?.history?.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: C.textMuted }}>
                  Last 3 Days FII / DII Activity (F&amp;O Contracts)
                </div>
                {fiiData.note && (
                  <span className="text-[8px]" style={{ color: C.textMuted }}>{fiiData.note}</span>
                )}
              </div>
              <div className="rounded-lg" style={{ border: `1px solid ${C.border}` }}>
                <div className="overflow-x-auto">
                <table className="w-full text-[9px]">
                  <thead>
                    <tr style={{ background: C.tableBg }}>
                      {['Date', 'FII Long', 'FII Short', 'FII Net Idx', 'DII Long', 'DII Short', 'DII Net Idx', 'Signal'].map(h => (
                        <th key={h} className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest whitespace-nowrap" style={{ color: C.textMuted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fiiData.history.map((row, i) => {
                      const isToday = i === 0;
                      const fiiNet  = row.fii?.net ?? 0;
                      const diiNet  = row.dii?.net ?? 0;
                      const fmtN = (v) => v == null ? '—' : Number(v).toLocaleString('en-IN');
                      return (
                        <tr key={i} style={{
                          borderTop: `1px solid ${C.borderSubtle}`,
                          background: isToday ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent',
                        }}>
                          <td className="px-2 py-2 font-mono font-semibold whitespace-nowrap" style={{ color: C.textPrimary }}>
                            {row.date}
                            {isToday && <span className="ml-1 text-[8px] text-sky-400">Latest</span>}
                          </td>
                          <td className="px-2 py-2 font-mono" style={{ color: '#22c55e' }}>{fmtN(row.fii?.buy)}</td>
                          <td className="px-2 py-2 font-mono" style={{ color: '#ef4444' }}>{fmtN(row.fii?.sell)}</td>
                          <td className="px-2 py-2 font-mono font-bold" style={{ color: fiiNet >= 0 ? '#22c55e' : '#ef4444' }}>
                            {fiiNet >= 0 ? '+' : ''}{fmtN(fiiNet)}
                          </td>
                          <td className="px-2 py-2 font-mono" style={{ color: '#22c55e' }}>{fmtN(row.dii?.buy)}</td>
                          <td className="px-2 py-2 font-mono" style={{ color: '#ef4444' }}>{fmtN(row.dii?.sell)}</td>
                          <td className="px-2 py-2 font-mono font-bold" style={{ color: diiNet >= 0 ? '#22c55e' : '#ef4444' }}>
                            {row.dii ? (diiNet >= 0 ? '+' : '') + fmtN(diiNet) : '—'}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <span className="px-1 py-0.5 rounded text-[8px] font-bold"
                              style={{ background: `${row.classification?.color}18`, color: row.classification?.color }}>
                              {row.classification?.action || '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* FII Logic Table */}
          <div>
            <div className="text-[9px] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: C.textMuted }}>FII Buying ka Basic Logic</div>
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <table className="w-full text-[9px]">
                <thead>
                  <tr style={{ background: C.tableBg }}>
                    {['FII Action', 'Nifty pe Asar', 'Kitna Move', 'Kyun?'].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest whitespace-nowrap" style={{ color: C.textMuted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FII_LOGIC_ROWS.map((row, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
                      <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ color: row.color }}>{row.action}</td>
                      <td className="px-2 py-1.5" style={{ color: C.textPrimary }}>{row.nifty}</td>
                      <td className="px-2 py-1.5 font-mono" style={{ color: C.textCell }}>{row.move}</td>
                      <td className="px-2 py-1.5" style={{ color: C.textSecond }}>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Momentum + Signals in 2 col */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Momentum Rules */}
            <div className="rounded-lg p-2.5 space-y-1" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <div className="text-[9px] uppercase tracking-widest font-semibold mb-1" style={{ color: C.textMuted }}>Momentum Kab Aata Hai?</div>
              {MOMENTUM_RULES.map((r, i) => (
                <div key={i} className="flex gap-1.5 text-[9px]">
                  <span style={{ color: '#22c55e' }}>•</span>
                  <span style={{ color: C.textSecond }}>{r}</span>
                </div>
              ))}
            </div>

            {/* Daily Signals */}
            <div className="rounded-lg p-2.5 space-y-2" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <div>
                <div className="text-[9px] font-bold mb-1" style={{ color: '#22c55e' }}>Buy Signal:</div>
                {BUY_SIGNALS.map((s, i) => (
                  <div key={i} className="flex gap-1.5 text-[9px]">
                    <span style={{ color: '#22c55e' }}>▲</span>
                    <span style={{ color: C.textSecond }}>{s}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[9px] font-bold mb-1" style={{ color: '#ef4444' }}>Sell / Cautious:</div>
                {SELL_SIGNALS.map((s, i) => (
                  <div key={i} className="flex gap-1.5 text-[9px]">
                    <span style={{ color: '#ef4444' }}>▼</span>
                    <span style={{ color: C.textSecond }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Practical Rules */}
          <div className="rounded-lg p-2.5" style={{ background: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)', border: `1px solid rgba(99,102,241,0.20)` }}>
            <div className="text-[9px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: '#818cf8' }}>Practical Rules</div>
            {PRACTICAL_RULES.map((r, i) => (
              <div key={i} className="flex gap-1.5 text-[9px] mb-1">
                <span style={{ color: '#818cf8' }}>→</span>
                <span style={{ color: C.textSecond }}>{r}</span>
              </div>
            ))}
          </div>

          {/* Context */}
          <div className="text-[9px] px-2 py-1.5 rounded" style={{ background: C.cardBg, color: C.textSecond, border: `1px solid ${C.border}` }}>
            <span className="font-semibold" style={{ color: C.textPrimary }}>Current Context (Jul 2026):</span>
            {' '}FII buying agar continue kiya to Nifty ko support milega · Warna oil pressure dominate karega
          </div>

        </div>
      )}
    </div>
  );
}



export default MarketIntelPanel;
