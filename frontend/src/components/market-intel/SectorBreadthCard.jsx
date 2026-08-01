import React, { useState } from 'react';
import { ChartBar } from '@phosphor-icons/react';

const SECTOR_ICONS_LABEL = {
  bank: 'BANK', it: 'IT', auto: 'AUTO', pharma: 'PHARMA', fmcg: 'FMCG',
  metal: 'METAL', realty: 'REALTY', energy: 'ENERGY', infra: 'INFRA',
  media: 'MEDIA', psubank: 'PSU BK', midcap: 'MIDCAP',
};

export function SectorBreadthCard({ sb, C, isDark, giftPremium }) {
  const [expanded, setExpanded] = useState(false);
  if (!sb || sb.total === 0) return null;

  const { up_count, down_count, total, bias, move, action, color,
          high_prob, power_sectors, power_green, power_red, power_aligned, sectors } = sb;

  const giftBull = giftPremium > 0;
  const giftBear = giftPremium < 0;
  const combinedBull = up_count >= 8 && giftBull;
  const combinedBear = down_count >= 8 && giftBear;
  const showSetup    = combinedBull || combinedBear;

  const CHECK_TIMES = '9:30 · 11:00 · 2:00 PM';

  return (
    <div className="rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
      data-testid="sector-breadth-card">

      <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ borderBottom: expanded ? `1px solid ${C.border}` : 'none' }}
        onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-2">
          <ChartBar size={13} className="text-cyan-400" />
          <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.textMuted }}>
            Sector Breadth
          </span>
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

      <div className="px-4 pb-3 pt-1.5">
        <div className="flex h-2 rounded-full overflow-hidden mb-2">
          <div style={{ width: `${(up_count / total) * 100}%`, background: '#22c55e', transition: 'width 0.4s' }} />
          <div style={{ width: `${(down_count / total) * 100}%`, background: '#ef4444', transition: 'width 0.4s' }} />
        </div>
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
        <div className="text-[9px] mt-1 font-mono font-bold" style={{ color }}>
          Expected: {move}
        </div>
        <div className="text-[8px] mt-0.5" style={{ color: C.textSecond }}>
          → {action}
        </div>

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

        {!showSetup && (up_count >= 5 && up_count <= 7 && down_count >= 5 && down_count <= 7) && (
          <div className="mt-2 rounded-lg px-3 py-1.5"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
            <div className="text-[8px] font-bold" style={{ color: '#fbbf24' }}>
              Mixed — Wait for clarity
            </div>
            <div className="text-[7.5px]" style={{ color: C.textMuted }}>
              5–7 sectors mixed → small range trades only
            </div>
          </div>
        )}
      </div>

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
