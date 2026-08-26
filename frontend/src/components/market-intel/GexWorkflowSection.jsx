import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ArrowClockwise } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

// ── Expected Move Reference Table ────────────────────────────────────────
const GEX_MOVE_TABLE = [
  { regime: 'STRONG_POSITIVE', label: 'Strong Positive GEX',  pts: '±50 – 120 pts',  bias: 'Pinning / Range-bound',     color: '#22c55e', bg: 'rgba(34,197,94,0.08)'  },
  { regime: 'POSITIVE',        label: 'Positive GEX',         pts: '±80 – 180 pts',  bias: 'Mild Range / Mean Revert',  color: '#86efac', bg: 'rgba(134,239,172,0.06)' },
  { regime: 'WEAK_POSITIVE',   label: 'Weak Positive GEX',    pts: '±100 – 250 pts', bias: 'Transition Zone',           color: '#fbbf24', bg: 'rgba(251,191,36,0.06)'  },
  { regime: 'WEAK_NEGATIVE',   label: 'Weak Negative GEX',    pts: '±100 – 200 pts', bias: 'Low Trending',              color: '#f97316', bg: 'rgba(249,115,22,0.06)'  },
  { regime: 'NEGATIVE',        label: 'Negative GEX',         pts: '±150 – 300 pts', bias: 'Trending / Directional',    color: '#ef4444', bg: 'rgba(239,68,68,0.06)'  },
  { regime: 'STRONG_NEGATIVE', label: 'Strong Negative GEX',  pts: '±250 – 500 pts', bias: 'High Volatile / Breakout',  color: '#dc2626', bg: 'rgba(220,38,38,0.10)'  },
];

export function GexWorkflowSection({ C, isDark }) {
  const [gexData, setGexData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ts, setTs]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/gex/nifty`);
      setGexData(res.data);
      setTs(new Date());
    } catch {
      setGexData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 300_000); // refresh every 5 min
    return () => clearInterval(t);
  }, [load]);

  const activeRegime = gexData?.regime || 'UNKNOWN';
  const regimeColor  = gexData?.regime_color || '#64748b';
  const isPositive   = gexData?.is_positive;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${C.border}` }}
      data-testid="gex-workflow-section"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ background: C.cardBg, borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2">
          {/* Gamma icon (Γ) */}
          <span className="text-[13px] font-black" style={{ color: '#a78bfa', fontFamily: 'Georgia, serif' }}>Γ</span>
          <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.textMuted }}>
            GEX (Gamma Exposure) — Workflow Process
          </span>
          {gexData?.source === 'live_nse' && (
            <span
              className="text-[7px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.30)' }}
            >
              LIVE NSE
            </span>
          )}
          {gexData?.source === 'vix_estimate' && (
            <span
              className="text-[7px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.30)' }}
            >
              VIX EST
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {ts && (
            <span className="text-[9px] font-mono" style={{ color: C.textMuted }}>
              {ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{' '}
              {ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="p-1 rounded transition-all"
            style={{ color: C.textMuted }}
            data-testid="gex-refresh-btn"
          >
            <ArrowClockwise size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Top Data Cards: Net GEX, Gamma Flip, Call Wall, Put Wall ── */}
        {loading && !gexData ? (
          <div className="flex items-center justify-center py-6">
            <ArrowClockwise size={20} className="animate-spin" style={{ color: '#a78bfa' }} />
          </div>
        ) : (
          <>
            {/* Main GEX Regime Badge */}
            <div
              className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              style={{
                background: `${regimeColor}12`,
                border: `1px solid ${regimeColor}35`,
              }}
              data-testid="gex-regime-badge"
            >
              <div>
                <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: C.textMuted }}>
                  Today's GEX Regime
                </div>
                <div className="text-base font-black tracking-wide" style={{ color: regimeColor }}>
                  {isPositive === true  && '▲ '}
                  {isPositive === false && '▼ '}
                  {gexData?.regime_label || '—'}
                </div>
                <div className="text-[9px] mt-0.5" style={{ color: C.textSecond }}>
                  {isPositive === true  && 'Market Maker = Long Gamma → Range-bound day expected'}
                  {isPositive === false && 'Market Maker = Short Gamma → Trending / Volatile day expected'}
                  {isPositive === null  && 'Data loading...'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: C.textMuted }}>
                  Expected Day Move
                </div>
                <div className="text-sm font-black font-mono" style={{ color: regimeColor }}>
                  {gexData?.expected_move || '—'}
                </div>
                <div className="text-[8px] mt-0.5" style={{ color: C.textMuted }}>
                  Nifty intraday range (approx)
                </div>
              </div>
            </div>

            {/* 4 Data Cards: Net GEX, Gamma Flip, Call Wall, Put Wall */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="gex-data-cards">
              {[
                {
                  label: 'Net GEX',
                  value: gexData?.net_gex_display || '—',
                  sub: isPositive === true ? 'Bullish Bias' : isPositive === false ? 'Bearish Bias' : '—',
                  color: regimeColor,
                  testid: 'gex-net-value',
                },
                {
                  label: 'Gamma Flip',
                  value: gexData?.gamma_flip ? gexData.gamma_flip.toLocaleString('en-IN') : '—',
                  sub: 'Pivot Level',
                  color: '#a78bfa',
                  testid: 'gex-gamma-flip',
                },
                {
                  label: 'Call Wall',
                  value: gexData?.call_wall ? gexData.call_wall.toLocaleString('en-IN') : '—',
                  sub: 'CE Resistance',
                  color: '#f97316',
                  testid: 'gex-call-wall',
                },
                {
                  label: 'Put Wall',
                  value: gexData?.put_wall ? gexData.put_wall.toLocaleString('en-IN') : '—',
                  sub: 'PE Support',
                  color: '#22c55e',
                  testid: 'gex-put-wall',
                },
              ].map(({ label, value, sub, color, testid }) => (
                <div
                  key={label}
                  className="rounded-xl p-3"
                  style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
                  data-testid={testid}
                >
                  <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: C.textMuted }}>{label}</div>
                  <div className="text-sm font-black font-mono" style={{ color }}>{value}</div>
                  <div className="text-[8px] mt-0.5" style={{ color: C.textMuted }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* ── GEX Regime Guide (Expected Points Reference) ──────── */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.borderSubtle}` }}>
              <div
                className="px-3 py-1.5 text-[8px] uppercase tracking-widest font-bold"
                style={{ background: C.tableBg, color: C.textMuted, borderBottom: `1px solid ${C.borderSubtle}` }}
              >
                Expected Day Point Moves — GEX Reference
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: C.borderSubtle }}>
                {/* Positive GEX column */}
                <div className="p-2 space-y-1">
                  <div className="text-[8px] font-bold mb-1.5 uppercase tracking-wider" style={{ color: '#22c55e' }}>
                    Positive GEX — Range Days
                  </div>
                  {GEX_MOVE_TABLE.filter(r => r.regime.includes('POSITIVE')).map(row => (
                    <div
                      key={row.regime}
                      className="flex items-center justify-between rounded px-2 py-1"
                      style={{
                        background: activeRegime === row.regime ? row.bg : 'transparent',
                        border: `1px solid ${activeRegime === row.regime ? row.color : C.borderSubtle}`,
                      }}
                      data-testid={`gex-table-${row.regime.toLowerCase()}`}
                    >
                      <div>
                        <div className="text-[8px] font-bold" style={{ color: activeRegime === row.regime ? row.color : C.textSecond }}>
                          {activeRegime === row.regime && '▶ '}{row.label}
                        </div>
                        <div className="text-[7px]" style={{ color: C.textMuted }}>{row.bias}</div>
                      </div>
                      <div className="font-mono text-[9px] font-bold" style={{ color: activeRegime === row.regime ? row.color : C.textMuted }}>
                        {row.pts}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Negative GEX column */}
                <div className="p-2 space-y-1">
                  <div className="text-[8px] font-bold mb-1.5 uppercase tracking-wider" style={{ color: '#ef4444' }}>
                    Negative GEX — Trending Days
                  </div>
                  {GEX_MOVE_TABLE.filter(r => r.regime.includes('NEGATIVE')).map(row => (
                    <div
                      key={row.regime}
                      className="flex items-center justify-between rounded px-2 py-1"
                      style={{
                        background: activeRegime === row.regime ? row.bg : 'transparent',
                        border: `1px solid ${activeRegime === row.regime ? row.color : C.borderSubtle}`,
                      }}
                      data-testid={`gex-table-${row.regime.toLowerCase()}`}
                    >
                      <div>
                        <div className="text-[8px] font-bold" style={{ color: activeRegime === row.regime ? row.color : C.textSecond }}>
                          {activeRegime === row.regime && '▶ '}{row.label}
                        </div>
                        <div className="text-[7px]" style={{ color: C.textMuted }}>{row.bias}</div>
                      </div>
                      <div className="font-mono text-[9px] font-bold" style={{ color: activeRegime === row.regime ? row.color : C.textMuted }}>
                        {row.pts}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Data attribution */}
        {gexData && (
          <div className="text-[7px] text-center" style={{ color: C.textMuted }}>
            {gexData.source === 'live_nse'
              ? `NSE Option Chain | Spot ₹${gexData.spot?.toLocaleString('en-IN')} | ${gexData.strikes_analyzed} strikes analysed | Expiry: ${gexData.expiry || '—'}`
              : gexData.source === 'vix_estimate'
              ? `VIX-Estimated GEX (NSE option chain unavailable) | Spot ₹${gexData.spot?.toLocaleString('en-IN')}`
              : 'GEX data unavailable'
            }
          </div>
        )}
      </div>
    </div>
  );
}
