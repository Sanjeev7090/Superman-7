import React, { useState } from 'react';

const GEO_WEIGHT_COLORS = { 4: '#ef4444', 3: '#f97316', 2: '#eab308', 1: '#94a3b8' };

export function GeoRiskCard({ geoRisk, C, isDark }) {
  const [expanded, setExpanded] = useState(true);

  if (!geoRisk || !geoRisk.available) return null;

  const { score, score_max = 15, level, level_color, nifty_impact,
          sectors_note, triggers = [], affected_sectors = [] } = geoRisk;

  const scorePct = Math.min(100, (score / score_max) * 100);

  const levelBg = level === 'HIGH'   ? 'rgba(239,68,68,0.12)'
                : level === 'MEDIUM' ? 'rgba(249,115,22,0.12)'
                :                      'rgba(34,197,94,0.12)';

  const levelBorder = level === 'HIGH'   ? 'rgba(239,68,68,0.35)'
                    : level === 'MEDIUM' ? 'rgba(249,115,22,0.35)'
                    :                      'rgba(34,197,94,0.35)';

  const barColor = level === 'HIGH' ? '#ef4444' : level === 'MEDIUM' ? '#f97316' : '#22c55e';

  return (
    <div className="rounded-xl overflow-hidden" data-testid="geo-risk-card"
      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>

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

      <div className="px-4 py-2.5" style={{ borderBottom: expanded ? `1px solid ${C.borderSubtle}` : 'none' }}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: C.panelBg }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${scorePct}%`, background: barColor }}
            />
          </div>
        </div>
        <div className="flex justify-between text-[7px]" style={{ color: C.textMuted }}>
          <span style={{ color: '#22c55e' }}>LOW</span>
          <span style={{ color: '#eab308' }}>MEDIUM</span>
          <span style={{ color: '#ef4444' }}>HIGH</span>
        </div>
      </div>

      {expanded && (
        <>
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

          {triggers.length === 0 && (
            <div className="px-4 py-3 text-[9px]" style={{ color: C.textMuted }}>
              No active geopolitical risk triggers in current headlines.
            </div>
          )}

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
