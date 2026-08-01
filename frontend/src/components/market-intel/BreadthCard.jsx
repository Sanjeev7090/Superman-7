import React, { useState } from 'react';
import { ChartBar } from '@phosphor-icons/react';

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

export function BreadthCard({ breadth, C, isDark }) {
  const [showRef, setShowRef] = useState(true);
  const [expanded, setExpanded] = useState(false);
  if (!breadth || breadth.advances == null) return null;

  const { advances = 0, declines = 0, unchanged = 0, total = 50 } = breadth;
  const advPct = total > 0 ? (advances / total) * 100 : 0;
  const decPct = total > 0 ? (declines / total) * 100 : 0;
  const unchPct = 100 - advPct - decPct;

  const sigColor = breadth.signal_color || '#94a3b8';

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
          <div className="text-[8px] mb-2" style={{ color: C.textMuted }}>{breadth.description}</div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowRef(v => !v); }}
            className="text-[8px] px-2 py-0.5 rounded transition-all mb-2"
            style={{ color: C.textMuted, border: `1px solid ${C.border}` }}
            data-testid="breadth-ref-toggle">
            {showRef ? 'Hide Reference Table' : 'Reference Table'}
          </button>
          {showRef && (
            <div className="mt-2 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
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
