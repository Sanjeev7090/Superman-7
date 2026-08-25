import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { TrendUp } from '@phosphor-icons/react';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

const PARTICIPANT_ORDER = ['FII', 'PRO', 'DII', 'RETAIL'];
const PARTICIPANT_COLORS = {
  FII:    '#818cf8',   // indigo
  PRO:    '#f59e0b',   // amber
  DII:    '#22c55e',   // green
  RETAIL: '#94a3b8',   // slate
};

const FII_LOGIC_ROWS = [
  { action: 'Heavy Buying (₹2000 Cr+)',         nifty: 'Strong Bullish', move: '+150 to +400 pts', reason: 'Liquidity badhti hai, sentiment positive', color: '#22c55e' },
  { action: 'Moderate Buying (₹500–2000 Cr)',   nifty: 'Mild Bullish',   move: '+50 to +150 pts',  reason: 'Normal up move',                           color: '#86efac' },
  { action: 'Neutral',                          nifty: 'Sideways',       move: '-100 to +100 pts', reason: 'Market apne technicals pe chalega',         color: '#94a3b8' },
  { action: 'Selling (₹1000 Cr+)',              nifty: 'Bearish',        move: '-150 to -400 pts', reason: 'Pressure badhta hai',                       color: '#ef4444' },
];

const PRACTICAL_RULES = [
  'Roz subah FII/DII data check karo (NSE website pe 6 PM ke baad aata hai)',
  'Agar FII 3 din se buying kar rahe hain → Long bias strong',
  'Agar FII selling kar rahe hain → Position chhoti rakho ya hedge',
];

function fmtContracts(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000)   return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${abs.toLocaleString('en-IN')}`;
}

export function FiiSection({ C, isDark }) {
  const [open,    setOpen]    = useState(false);
  const [fiiData, setFiiData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadFii = useCallback(async (force = false) => {
    if ((fiiData && !force) || loading) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/api/market-intel/fii`);
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

  useEffect(() => {
    if (!open) return;
    const ist = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istDate = new Date(ist);
    if (istDate.getHours() < 18) return;
    const timer = setInterval(() => loadFii(true), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [open, loadFii]);

  const live  = fiiData && fiiData.fii;
  const cls   = fiiData?.classification;

  // Latest day participants table data
  const participants = fiiData?.participants || {};
  const niftyImpact  = fiiData?.nifty_impact || null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      {/* Header / Toggle */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 transition-all"
        style={{ background: C.cardBg }}
        onClick={handleToggle}
        data-testid="fii-section-toggle"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <TrendUp size={13} className="text-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.textPrimary }}>
            FII / DII Activity
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
            style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            NSE F&amp;O
          </span>
          {live && cls && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
              style={{ background: `${cls.color}20`, color: cls.color }}>
              FII: {cls.action}
            </span>
          )}
          {fiiData?.data_for_date && (
            <span className="text-[8px] px-1.5 py-0.5 rounded font-mono"
              style={{ color: C.textMuted, background: 'rgba(100,116,139,0.15)' }}>
              {fiiData.data_for_date}
            </span>
          )}
        </div>
        <span className="text-[10px] transition-transform shrink-0" style={{
          color: C.textMuted,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3" style={{ background: C.panelBg }}>

          {loading && !fiiData && (
            <div className="text-[9px] py-3 text-center" style={{ color: C.textMuted }}>
              Loading NSE F&amp;O data...
            </div>
          )}

          {/* Availability banner */}
          {fiiData && fiiData.source !== 'error' && fiiData.availability && (
            <div className="rounded-lg p-2.5" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#60a5fa' }}>
                  Data Status
                </span>
                {fiiData.source && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded font-mono"
                    style={{ background: 'rgba(96,165,250,0.10)', color: '#60a5fa' }}>
                    {fiiData.source === 'NSE F&O Archive' ? 'NSE Live' : fiiData.source}
                  </span>
                )}
              </div>
              <div className="text-[8px]" style={{ color: C.textMuted }}>
                {fiiData.availability.message}
              </div>
              {fiiData.cache_note && (
                <div className="text-[8px] p-1.5 rounded mt-1" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                  {fiiData.cache_note}
                </div>
              )}
              {fiiData.nse_url && (
                <a href={fiiData.nse_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 mt-1 text-[8px] underline"
                  style={{ color: '#60a5fa' }}>
                  View on NSE →
                </a>
              )}
            </div>
          )}

          {/* ── Main Participant × Instrument Table (like image) ── */}
          {Object.keys(participants).length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest mb-1.5 font-bold"
                style={{ color: C.textMuted }}>
                NSE F&amp;O Participant Activity — {fiiData?.data_for_date || 'Latest'}
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ background: C.tableBg }}>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-widest whitespace-nowrap"
                        style={{ color: C.textMuted, width: '70px' }}>Participant</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-widest whitespace-nowrap"
                        style={{ color: C.textMuted }}>Instrument</th>
                      <th className="px-3 py-2 text-right font-bold uppercase tracking-widest whitespace-nowrap"
                        style={{ color: C.textMuted }}>Change</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-widest whitespace-nowrap"
                        style={{ color: C.textMuted }}>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PARTICIPANT_ORDER.map((pKey) => {
                      const pData = participants[pKey];
                      if (!pData) return null;
                      const instruments = pData.instruments || [];
                      const pColor = PARTICIPANT_COLORS[pKey] || '#94a3b8';
                      return instruments.map((row, idx) => (
                        <tr key={`${pKey}-${row.instrument}`} style={{
                          borderTop: `1px solid ${C.borderSubtle}`,
                          background: idx === 0
                            ? (isDark ? `${pColor}08` : `${pColor}06`)
                            : 'transparent',
                        }}>
                          {/* Participant label — only on first row (Future) */}
                          {idx === 0 ? (
                            <td className="px-3 py-2 font-bold align-top" rowSpan={3}
                              style={{
                                color: pColor,
                                borderRight: `2px solid ${pColor}30`,
                                fontSize: '11px',
                                verticalAlign: 'middle',
                              }}>
                              {pKey}
                            </td>
                          ) : null}
                          <td className="px-3 py-2 font-mono whitespace-nowrap"
                            style={{ color: C.textSecond }}>
                            {row.instrument}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap"
                            style={{ color: row.color }}>
                            {fmtContracts(row.change)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[9px] font-semibold"
                              style={{
                                background: `${row.color}18`,
                                color: row.color,
                              }}>
                              {row.activity}
                            </span>
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-1 text-[8px] px-1" style={{ color: C.textMuted }}>
                * Contracts = Index F&amp;O positions. Change = Net (Long − Short). Source: NSE F&amp;O Archives
              </div>
            </div>
          )}

          {/* ── Nifty 50 Impact Card ── */}
          {niftyImpact && niftyImpact.direction && (
            <div className="rounded-xl p-3 space-y-2"
              style={{
                background: isDark ? `${niftyImpact.color}10` : `${niftyImpact.color}08`,
                border: `1px solid ${niftyImpact.color}30`,
              }}>
              <div className="flex items-center justify-between">
                <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: C.textMuted }}>
                  Nifty 50 pe Impact (F&amp;O se)
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded"
                  style={{ background: `${niftyImpact.color}22`, color: niftyImpact.color }}>
                  {niftyImpact.direction}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold" style={{ color: niftyImpact.color }}>
                    {niftyImpact.pts_label}
                  </div>
                  <div className="text-[8px] mt-0.5" style={{ color: C.textMuted }}>
                    Expected Nifty 50 move based on F&amp;O positioning
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[8px]" style={{ color: C.textMuted }}>Score</div>
                  <div className="text-[11px] font-mono font-bold" style={{ color: niftyImpact.color }}>
                    {niftyImpact.score > 0 ? '+' : ''}{niftyImpact.score}
                  </div>
                </div>
              </div>

              {/* Signal breakdown */}
              {niftyImpact.signals?.length > 0 && (
                <div className="space-y-1 pt-1" style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
                  <div className="text-[8px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>
                    Signal Breakdown
                  </div>
                  {niftyImpact.signals.map((sig, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sig.color }} />
                        <span className="text-[9px]" style={{ color: C.textSecond }}>{sig.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-mono" style={{ color: sig.color }}>
                          {fmtContracts(sig.change)}
                        </span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded"
                          style={{ background: `${sig.color}18`, color: sig.color }}>
                          {sig.impact}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Historical 3-Day Table ── */}
          {fiiData?.history?.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: C.textMuted }}>
                Last 3 Days — FII / DII Index Futures (Contracts)
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[9px]">
                    <thead>
                      <tr style={{ background: C.tableBg }}>
                        {['Date', 'FII Long', 'FII Short', 'FII Net', 'DII Long', 'DII Short', 'DII Net', 'Signal'].map(h => (
                          <th key={h} className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest whitespace-nowrap"
                            style={{ color: C.textMuted }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fiiData.history.map((row, i) => {
                        const isLatest = i === 0;
                        const fiiNet   = row.fii?.net ?? 0;
                        const diiNet   = row.dii?.net ?? 0;
                        const fmtN     = (v) => v == null ? '—' : Number(v).toLocaleString('en-IN');
                        return (
                          <tr key={i} style={{
                            borderTop: `1px solid ${C.borderSubtle}`,
                            background: isLatest
                              ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                              : 'transparent',
                          }}>
                            <td className="px-2 py-2 font-mono font-semibold whitespace-nowrap" style={{ color: C.textPrimary }}>
                              {row.date}
                              {isLatest && <span className="ml-1 text-[8px] text-sky-400">Latest</span>}
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
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold"
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

          {/* ── FII Logic Reference ── */}
          <div>
            <div className="text-[9px] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: C.textMuted }}>FII Buying ka Basic Logic</div>
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <table className="w-full text-[9px]">
                <thead>
                  <tr style={{ background: C.tableBg }}>
                    {['FII Action', 'Nifty pe Asar', 'Kitna Move', 'Kyun?'].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest whitespace-nowrap"
                        style={{ color: C.textMuted }}>{h}</th>
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

          {/* Practical Rules */}
          <div className="rounded-lg p-2.5"
            style={{ background: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.20)' }}>
            <div className="text-[9px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: '#818cf8' }}>Practical Rules</div>
            {PRACTICAL_RULES.map((r, i) => (
              <div key={i} className="flex gap-1.5 text-[9px] mb-1">
                <span style={{ color: '#818cf8' }}>→</span>
                <span style={{ color: C.textSecond }}>{r}</span>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
