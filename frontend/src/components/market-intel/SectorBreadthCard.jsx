import React, { useState } from 'react';
import { ChartBar } from '@phosphor-icons/react';

const SECTOR_ICONS_LABEL = {
  bank:    'BANK',
  finserv: 'FIN SVC',
  it:      'IT',
  energy:  'ENERGY',
  fmcg:    'FMCG',
  auto:    'AUTO',
  pharma:  'PHARMA',
  metal:   'METAL',
  infra:   'INFRA',
  psubank: 'PSU BK',
  pse:     'PSE',
  consump: 'CONSUM',
  service: 'SERVICE',
  mnc:     'MNC',
  realty:  'REALTY',
  media:   'MEDIA',
  midcap:  'MIDCAP',
};

export function SectorBreadthCard({ sb, C, isDark, giftPremium }) {
  const [expanded, setExpanded] = useState(false);
  if (!sb || sb.total === 0) return null;

  const { up_count, down_count, total, bias, move, action, color,
          high_prob, power_sectors, power_green, power_red, power_aligned,
          hw_up, hw_down, hw_total = 6, sectors } = sb;

  const giftBull = giftPremium > 0;
  const giftBear = giftPremium < 0;
  const strongThr  = Math.max(4, Math.floor(total * 0.67));
  const combinedBull = up_count >= strongThr && giftBull;
  const combinedBear = down_count >= strongThr && giftBear;
  const showSetup    = combinedBull || combinedBear;
  const mixedLow     = Math.floor(total * 0.33);
  const mixedHigh    = Math.ceil(total * 0.60);
  const isMixed      = !showSetup && up_count >= mixedLow && up_count <= mixedHigh && down_count >= mixedLow;

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
              <div>✓ {up_count >= strongThr ? `${up_count}` : `${down_count}`}/{total} sectors aligned</div>
              <div>✓ GIFT Nifty {combinedBull ? 'positive' : 'negative'} ({giftPremium > 0 ? '+' : ''}{giftPremium} pts)</div>
              <div>→ {combinedBull ? 'Long / Call Buy after 15m Rejection + 1m Green confirm' : 'Short / Put Buy after 15m Rejection + 1m Red confirm'}</div>
            </div>
          </div>
        )}

        {isMixed && (
          <div className="mt-2 rounded-lg px-3 py-1.5"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
            <div className="text-[8px] font-bold" style={{ color: '#fbbf24' }}>
              Mixed — Wait for clarity
            </div>
            <div className="text-[7.5px]" style={{ color: C.textMuted }}>
              Sectors split evenly → small range trades only
            </div>
          </div>
        )}

        {/* ── Sector Breadth Decision Matrix ─────────────────── */}
        <div className="mt-3">
          <div className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: C.textMuted }}>
            Sector Breadth Decision Matrix
          </div>
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            {/* Header row */}
            <div className="grid text-[6.5px] font-black uppercase tracking-widest px-2 py-1.5"
              style={{
                gridTemplateColumns: '2.2rem 2.2rem 1fr 2.4rem 1.8rem 2.8rem',
                gap: '4px',
                background: C.cardBg,
                color: C.textMuted,
                borderBottom: `1px solid ${C.border}`,
              }}>
              <span>UP</span>
              <span>DOWN</span>
              <span>BIAS</span>
              <span>EXP PTS</span>
              <span>PROB</span>
              <span>ACTION</span>
            </div>

            {[
              {
                upR: '10–12', dnR: '0–2',   bias: 'Strong Bullish', pts: '+400 to +650',
                prob: 'High', action: 'Aggressive Long / Call',
                color: '#22c55e', matchBias: ['Strong Bullish'],
              },
              {
                upR: '8–9',  dnR: '3–4',   bias: 'Bullish',         pts: '+250 to +400',
                prob: 'High', action: 'Selective Long',
                color: '#86efac', matchBias: ['Mild Bullish'],
              },
              {
                upR: '6–7',  dnR: '5–6',   bias: 'Mild Bullish',    pts: '+150 to +250',
                prob: 'Med',  action: 'Small Long / wait 9:50',
                color: '#bef264', matchBias: ['Weak Bullish','Neutral-Mild'],
              },
              {
                upR: '5–7',  dnR: '5–7',   bias: 'Neutral',         pts: '−120 to +120',
                prob: 'High', action: 'Range / pin / no chase',
                color: '#fbbf24', matchBias: ['Neutral-Mild','Weak Bullish','Weak Bearish'],
              },
              {
                upR: '3–4',  dnR: '8–9',   bias: 'Bearish',         pts: '−250 to −400',
                prob: 'High', action: 'Selective Short / Put',
                color: '#fca5a5', matchBias: ['Mild Bearish'],
              },
              {
                upR: '0–2',  dnR: '10–12', bias: 'Strong Bearish',  pts: '−400 to −700',
                prob: 'High', action: 'Hedge / Put / cash',
                color: '#ef4444', matchBias: ['Strong Bearish'],
              },
            ].map((row, i, arr) => {
              const isActive = row.matchBias.includes(bias);
              return (
                <div key={i}
                  className="grid items-center px-2 py-1.5"
                  style={{
                    gridTemplateColumns: '2.2rem 2.2rem 1fr 2.4rem 1.8rem 2.8rem',
                    gap: '4px',
                    background: isActive ? `${row.color}14` : 'transparent',
                    borderLeft: isActive ? `3px solid ${row.color}` : '3px solid transparent',
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.borderSubtle}` : 'none',
                  }}>
                  <span className="text-[7.5px] font-bold font-mono" style={{ color: isActive ? '#22c55e' : C.textMuted }}>
                    {row.upR}
                  </span>
                  <span className="text-[7.5px] font-bold font-mono" style={{ color: isActive ? '#ef4444' : C.textMuted }}>
                    {row.dnR}
                  </span>
                  <span className="text-[7.5px] font-bold" style={{ color: isActive ? row.color : C.textSecond }}>
                    {row.bias}
                  </span>
                  <span className="text-[7px] font-mono" style={{ color: isActive ? C.textPrimary : C.textMuted }}>
                    {row.pts}
                  </span>
                  <span className="text-[7px]" style={{ color: row.prob === 'High' ? (isActive ? '#22c55e' : C.textMuted) : '#fbbf24' }}>
                    {row.prob}
                  </span>
                  <span className="text-[7px]" style={{ color: isActive ? C.textPrimary : C.textMuted }}>
                    {row.action}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-2 h-2 rounded-sm" style={{ background: color, opacity: 0.7 }} />
            <span className="text-[7.5px]" style={{ color: C.textMuted }}>
              Current: <span style={{ color }}>{up_count}↑ {down_count}↓</span> of {total} → <span style={{ color }}>{bias}</span>
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4" style={{ borderTop: `1px solid ${C.border}` }}>
          {/* High-weight sectors summary */}
          {hw_total > 0 && (
            <div className="pt-2 pb-2 mb-1" style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
              <div className="text-[7.5px] uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>
                High-Weight Sectors (Bank·FinSvc·IT·Oil&Gas·FMCG·Auto)
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold font-mono" style={{ color: '#22c55e' }}>▲{hw_up ?? '—'}</span>
                <span className="text-[9px] font-bold font-mono" style={{ color: '#ef4444' }}>▼{hw_down ?? '—'}</span>
                <span className="text-[7.5px]" style={{ color: C.textMuted }}>of {hw_total}</span>
                <span className="text-[7.5px] ml-auto" style={{ color: C.textMuted }}>
                  {(hw_up ?? 0) > (hw_down ?? 0) ? '→ Bullish bias amplified' : (hw_down ?? 0) > (hw_up ?? 0) ? '→ Bearish bias amplified' : '→ Mixed'}
                </span>
              </div>
            </div>
          )}
          <div className="pt-2 mb-2">
            <div className="text-[8px] uppercase tracking-wider mb-2 flex items-center justify-between"
              style={{ color: C.textMuted }}>
              <span>All {total} Sectors</span>
              <span>Check: {CHECK_TIMES}</span>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-1">
              {(sectors || []).map(s => {
                const up = s.change_pct > 0;
                const pc = s.change_pct >= 0 ? `+${s.change_pct}%` : `${s.change_pct}%`;
                const isHW = ['bank','finserv','it','oilgas','fmcg','auto'].includes(s.icon);
                return (
                  <div key={s.icon} className="flex items-center justify-between">
                    <span className="text-[7.5px] font-mono truncate"
                      style={{ color: isHW ? C.textPrimary : C.textSecond }}>
                      {SECTOR_ICONS_LABEL[s.icon] || s.name.replace('NIFTY ', '')}
                    </span>
                    <span className="text-[7.5px] font-bold font-mono ml-1 shrink-0"
                      style={{ color: up ? '#22c55e' : s.change_pct < 0 ? '#ef4444' : C.textMuted }}>
                      {up ? '▲' : s.change_pct < 0 ? '▼' : '→'}{pc}
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
              <div>{strongThr}+ sectors same direction → High probability big move</div>
              <div>Add Price Action confirmation for best results</div>
              <div className="font-bold" style={{ color: '#06b6d4' }}>Bank + IT + FinSvc + Oil&Gas strong → bias amplified</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
