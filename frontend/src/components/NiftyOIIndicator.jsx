import React, { useState, useEffect, useCallback } from 'react';
import { ArrowClockwise, ArrowUp, ArrowDown, Minus } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

// Format OI number (lakhs / crores)
function fmtOI(n) {
  if (!n || n === 0) return '—';
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  return n.toLocaleString('en-IN');
}

const SIGNAL_ICONS = {
  'STRONG BULLISH': ArrowUp,
  'SHORT COVERING': ArrowUp,
  'STRONG BEARISH': ArrowDown,
  'LONG UNWINDING': ArrowDown,
};

export default function NiftyOIIndicator({ isDark = true }) {
  const [open,    setOpen]    = useState(true);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);

  const C = {
    panelBg:     isDark ? '#111117' : '#ffffff',
    cardBg:      isDark ? '#18181e' : '#f8fafc',
    headerBg:    isDark ? '#141418' : '#f1f5f9',
    tableBg:     isDark ? '#0d0d12' : '#f8fafc',
    border:      isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    textPrimary: isDark ? '#f1f5f9' : '#0f172a',
    textSecond:  isDark ? '#94a3b8' : '#64748b',
    textMuted:   isDark ? '#64748b' : '#94a3b8',
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/oi-indicator/nifty`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const SigIco = data ? (SIGNAL_ICONS[data.signal] || Minus) : Minus;

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }} data-testid="oi-indicator-panel">

      {/* ── Toggle Header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 transition-all gap-2"
        style={{ background: C.headerBg }}
        data-testid="oi-indicator-toggle"
      >
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <SigIco size={12} color={data?.signal_color || '#94a3b8'} weight="bold" className="shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
            style={{ color: C.textPrimary }}>
            OI Indicator
          </span>
          <span className="text-[8px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap"
            style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}>
            NIFTY 50
          </span>
          {data?.signal && (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold whitespace-nowrap"
              style={{ background: `${data.signal_color}20`, color: data.signal_color }}>
              {data.signal}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); load(); }}
            disabled={loading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: loading ? 0.4 : 1 }}
            data-testid="oi-indicator-refresh"
          >
            <ArrowClockwise size={11} color={C.textMuted} className={loading ? 'animate-spin' : ''} />
          </button>
          <span className="text-[10px] transition-transform" style={{
            color: C.textMuted,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}>▼</span>
        </div>
      </button>

      {/* ── Expanded Body ── */}
      {open && (
        <div className="px-3 pb-3 pt-2 sm:px-4 sm:pb-4 space-y-3" style={{ background: C.panelBg }}>

          {loading && !data ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                border: '3px solid #27272a', borderTopColor: '#06b6d4',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: 16, color: C.textMuted, fontSize: 11 }}>
              Data unavailable
            </div>
          ) : (
            <>
              {/* ── Signal Card ── */}
              <div className="rounded-lg p-3" style={{
                background: `${data.signal_color}12`,
                border: `1px solid ${data.signal_color}35`,
              }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold" style={{ color: data.signal_color }}>
                      {data.signal}
                    </div>
                    <div className="text-[9px] mt-0.5" style={{ color: C.textSecond }}>
                      {data.signal_desc}
                    </div>
                  </div>
                  {data.spot_price > 0 && (
                    <div className="text-right">
                      <div className="text-[12px] font-bold font-mono" style={{ color: C.textPrimary }}>
                        {data.spot_price.toLocaleString('en-IN')}
                      </div>
                      {data.price_pct !== 0 && (
                        <div className="text-[9px] font-mono" style={{
                          color: data.price_pct >= 0 ? '#22c55e' : '#ef4444',
                        }}>
                          {data.price_pct >= 0 ? '+' : ''}{data.price_pct}%
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── PCR + Max Pain ── */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'PCR',       val: data.pcr?.toFixed(3) || '—',
                    badge: data.pcr_zone, badgeColor: data.pcr_zone_color,
                    note: data.pcr < 0.7 ? 'Overbought' : data.pcr > 1.3 ? 'Oversold' : 'Balanced' },
                  { label: 'Max Pain',  val: data.max_pain?.toLocaleString('en-IN') || '—',
                    note: 'Expiry ke near' },
                  { label: 'Call OI',   val: fmtOI(data.total_call_oi),
                    note: 'Total', badgeColor: '#ef4444', badge: 'CALL' },
                ].map(({ label, val, badge, badgeColor, note }) => (
                  <div key={label} className="rounded-lg p-2 text-center"
                    style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                    <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>
                      {label}
                    </div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: C.textPrimary }}>
                      {val}
                    </div>
                    {badge && (
                      <div className="text-[7px] font-bold mt-0.5"
                        style={{ color: badgeColor || C.textMuted }}>
                        {badge}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* ── Call Wall (Resistance) & Put Wall (Support) ── */}
              <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-2 divide-x" style={{ borderColor: C.border }}>
                  {[
                    { label: 'Call Wall (Resistance)', val: data.call_wall, color: '#ef4444', desc: 'Max Call OI' },
                    { label: 'Put Wall (Support)',      val: data.put_wall,  color: '#22c55e', desc: 'Max Put OI'  },
                  ].map(({ label, val, color, desc }) => (
                    <div key={label} className="p-2.5 text-center"
                      style={{ borderColor: C.border, background: `${color}08` }}>
                      <div className="text-[7px] uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>
                        {label}
                      </div>
                      <div className="text-[14px] font-bold font-mono" style={{ color }}>
                        {val ? val.toLocaleString('en-IN') : '—'}
                      </div>
                      <div className="text-[8px] mt-0.5" style={{ color: C.textSecond }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Top 7 OI Strikes Mini Bar Chart ── */}
              {data.top_strikes?.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest mb-1.5 font-bold"
                    style={{ color: C.textMuted }}>
                    Strike-wise OI (Near Spot)
                  </div>
                  <div className="space-y-1">
                    {data.top_strikes
                      .sort((a, b) => a.strike - b.strike)
                      .map(row => {
                        const maxOI = Math.max(...data.top_strikes.map(r => Math.max(r.call_oi, r.put_oi)));
                        const cPct  = maxOI > 0 ? (row.call_oi / maxOI * 100) : 0;
                        const pPct  = maxOI > 0 ? (row.put_oi  / maxOI * 100) : 0;
                        const isSpot = data.spot_price > 0 && Math.abs(row.strike - data.spot_price) < 75;
                        return (
                          <div key={row.strike} className="flex items-center gap-2"
                            data-testid={`oi-strike-${row.strike}`}>
                            {/* Strike label */}
                            <div className="text-[9px] font-mono text-right shrink-0"
                              style={{ width: 46, color: isSpot ? '#06b6d4' : C.textSecond, fontWeight: isSpot ? 800 : 400 }}>
                              {row.strike.toLocaleString('en-IN')}
                              {isSpot && <span className="text-[7px] ml-0.5">●</span>}
                            </div>
                            {/* Bars */}
                            <div className="flex-1 flex flex-col gap-0.5">
                              {/* Call bar */}
                              <div className="flex items-center gap-1">
                                <div style={{ width: `${Math.max(cPct, 2)}%`, height: 5, background: '#ef4444', borderRadius: 2, transition: 'width 0.3s', minWidth: 4 }} />
                                <span className="text-[7px] font-mono" style={{ color: '#ef4444' }}>
                                  {fmtOI(row.call_oi)}
                                </span>
                              </div>
                              {/* Put bar */}
                              <div className="flex items-center gap-1">
                                <div style={{ width: `${Math.max(pPct, 2)}%`, height: 5, background: '#22c55e', borderRadius: 2, transition: 'width 0.3s', minWidth: 4 }} />
                                <span className="text-[7px] font-mono" style={{ color: '#22c55e' }}>
                                  {fmtOI(row.put_oi)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1">
                      <div style={{ width: 10, height: 5, background: '#ef4444', borderRadius: 2 }} />
                      <span className="text-[8px]" style={{ color: C.textSecond }}>Call OI (Resistance)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div style={{ width: 10, height: 5, background: '#22c55e', borderRadius: 2 }} />
                      <span className="text-[8px]" style={{ color: C.textSecond }}>Put OI (Support)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── OI Reading Guide ── */}
              <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                <table className="w-full text-[8px]">
                  <thead>
                    <tr style={{ background: C.tableBg }}>
                      {['Price', 'OI', 'Signal'].map(h => (
                        <th key={h} className="px-2 py-1 text-left font-bold uppercase tracking-widest"
                          style={{ color: C.textMuted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['↑ Up', '↑ Up',   'Strong Bullish', '#22c55e'],
                      ['↑ Up', '↓ Down',  'Short Covering', '#86efac'],
                      ['↓ Down','↑ Up',  'Strong Bearish', '#ef4444'],
                      ['↓ Down','↓ Down', 'Long Unwinding', '#f59e0b'],
                    ].map(([price, oi, sig, col]) => (
                      <tr key={sig} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="px-2 py-1 font-mono" style={{ color: C.textSecond }}>{price}</td>
                        <td className="px-2 py-1 font-mono" style={{ color: C.textSecond }}>{oi}</td>
                        <td className="px-2 py-1 font-bold" style={{ color: col }}>{sig}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PCR guide */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[8px]" style={{ color: C.textMuted }}>
                  PCR &lt; 0.7 = Overbought · PCR &gt; 1.3 = Oversold
                </span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${data.pcr_zone_color}20`, color: data.pcr_zone_color }}>
                  PCR: {data.pcr_zone}
                </span>
              </div>

              {/* Updated at */}
              {data.updated_at && (
                <div className="text-[8px] text-right" style={{ color: C.textMuted }}>
                  Updated: {new Date(data.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
