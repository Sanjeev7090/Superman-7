import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X, TrendUp, TrendDown, Minus, ArrowClockwise, Gauge, Globe, ChartLine, Timer, Warning } from '@phosphor-icons/react';
import { useTheme } from '../context/ThemeContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (v, dec = 2) => (v == null ? '—' : Number(v).toFixed(dec));
const fmtPct = (v) => {
  if (v == null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(2)}%`;
};

const ROWS = [
  { label: 'Strong Bullish', brent: '< $82',  vix: '< 14', regulatory: 'Positive', gift: 'Green',        move: '+300 to +600 pts', prob: 'High',        action: 'Aggressive Long (Energy + Banking)', color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
  { label: 'Mild Bullish',   brent: '$80-83', vix: '13-15', regulatory: 'Neutral',  gift: 'Mild Green',  move: '+150 to +350 pts', prob: 'Medium-High', action: 'Selective Long',                       color: '#86efac', bg: 'rgba(134,239,172,0.10)' },
  { label: 'Neutral',        brent: '$82-85', vix: '14-16', regulatory: 'Neutral',  gift: 'Flat',        move: '-150 to +150 pts', prob: 'High',        action: 'Range trading, small positions',        color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
  { label: 'Mild Bearish',   brent: '$85+',   vix: '15+',  regulatory: 'Neutral',  gift: 'Red/Mild Red',move: '-150 to -350 pts', prob: 'High',        action: 'Selective Energy Long, Profit booking', color: '#fca5a5', bg: 'rgba(252,165,165,0.10)' },
  { label: 'Strong Bearish', brent: '$87+',   vix: '16+',  regulatory: 'Negative', gift: 'Strong Red',  move: '-400 to -800 pts', prob: 'Medium',      action: 'Hedging, Cash increase',                color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
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
  const [brentTf,  setBrentTf]  = useState('D');
  const [vixTf,    setVixTf]    = useState('D');
  const [nasdaqTf, setNasdaqTf] = useState('D');
  const [niftyTf,  setNiftyTf]  = useState('D');
  const [giftTf,   setGiftTf]   = useState('D');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: d } = await axios.get(`${API}/market-intel`);
      setData(d);
      setTs(new Date());
    } catch (e) {
      setError('Failed to load market intelligence data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeRow = data ? ROWS.findIndex(r => r.label === data.bias) : -1;

  const brentChg = brentTf === 'W' ? data?.brent_chg_week
                 : brentTf === 'M' ? data?.brent_chg_month
                 : data?.brent_chg_pct;
  const vixChg   = vixTf === 'W' ? data?.vix_chg_week
                 : vixTf === 'M' ? data?.vix_chg_month
                 : data?.vix_chg_pct;
  const nasdaqChg = nasdaqTf === 'W' ? data?.nasdaq_chg_week
                  : nasdaqTf === 'M' ? data?.nasdaq_chg_month
                  : data?.nasdaq_chg_pct;
  const niftyChg  = niftyTf === 'W' ? data?.nifty_chg_week
                  : niftyTf === 'M' ? data?.nifty_chg_month
                  : data?.nifty_chg_pct;
  const giftChg   = giftTf === 'W' ? data?.gift_chg_week
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
                <div className="text-sm font-bold font-mono" style={{ color: C.textPrimary }}>${fmt(data.brent)}</div>
                <div className="text-[10px] mt-0.5 font-mono" style={{ color: chgColor(brentChg) }}>
                  {fmtPct(brentChg)} {brentTf === 'D' ? '(Day)' : brentTf === 'W' ? '(Week)' : '(Month)'}
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
              </div>

              {/* Other cards — Nifty 50, Nasdaq, GIFT, Regulatory, Bias */}
              {[
                {
                  label: 'Nifty 50',
                  value: fmt(data.nifty, 0),
                  sub: fmtPct(data.nifty_chg_pct),
                  subColor: chgColor(data.nifty_chg_pct),
                  icon: <TrendUp size={14} />,
                  tf: niftyTf, setTf: setNiftyTf,
                  tfSub: niftyTf === 'D' ? fmtPct(niftyChg) + ' (Day)'
                       : niftyTf === 'W' ? fmtPct(niftyChg) + ' (Week)'
                       : fmtPct(niftyChg) + ' (Month)',
                  tfSubColor: chgColor(niftyChg),
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
                  label: 'Bias',
                  value: data.bias,
                  sub: `Score: ${data.scores?.total}`,
                  subColor: C.textMuted,
                  icon: <Gauge size={14} />,
                  valueColor: data.bias_color,
                },
              ].map(({ label, value, sub, subColor, icon, valueColor, tf, setTf }) => (
                <div key={label} className="rounded-xl p-3" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
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
                  <div className="text-[10px] mt-0.5 font-mono" style={{ color: subColor }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Current Bias Card */}
            <div
              className="rounded-xl p-4"
              style={{ background: `${data.bias_color}18`, border: `1px solid ${data.bias_color}40` }}
              data-testid="market-intel-bias-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: C.textSecond }}>Current Market Bias</div>
                  <div className="text-2xl font-black" style={{ color: data.bias_color }}>{data.bias}</div>
                  <div className="text-xs mt-1" style={{ color: C.textSecond }}>{data.action}</div>
                </div>
                <div className="flex gap-4 flex-wrap">
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-widest" style={{ color: C.textMuted }}>Expected Move (1-3 Days)</div>
                    <div className="text-base font-bold font-mono mt-0.5" style={{ color: C.textPrimary }}>{data.move_label}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-widest" style={{ color: C.textMuted }}>Probability</div>
                    <div className="text-base font-bold mt-0.5 text-amber-500">{data.probability}</div>
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
                </div>
              </div>
            </div>

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

            {/* Factor Scores */}
            {data.scores && (
              <div className="rounded-xl p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div className="text-[9px] uppercase tracking-widest mb-3" style={{ color: C.textMuted }}>Factor Scores</div>
                <div className="space-y-2">
                  <ScoreBar label="Brent"      score={data.scores.brent} />
                  <ScoreBar label="India VIX"  score={data.scores.vix} />
                  <ScoreBar label="Regulatory" score={data.scores.regulatory} />
                  <ScoreBar label="GIFT Nifty" score={data.scores.gift} />
                  <div className="h-px my-1" style={{ background: C.borderSubtle }} />
                  <ScoreBar label="Total"      score={data.scores.total} max={6} />
                </div>
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
                      {['Bias', 'Brent Level', 'VIX', 'Regulatory', 'GIFT Nifty', 'Expected Move (1-3D)', 'Probability', 'Example Action'].map(h => (
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
                          <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: C.textPrimary }}>{row.move}</td>
                          <td className="px-3 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              row.prob === 'High'        ? 'bg-emerald-500/15 text-emerald-500' :
                              row.prob === 'Medium-High' ? 'bg-sky-500/15 text-sky-500'        :
                              'bg-amber-500/15 text-amber-500'
                            }`}>{row.prob}</span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: C.textSecond }}>{row.action}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

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

  const loadFii = useCallback(async () => {
    if (fiiData || loading) return;
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
          <span className="text-[9px] ml-1" style={{ color: C.textMuted }}>
            NSE F&amp;O
          </span>
        </div>
        <span className="text-[10px] transition-transform" style={{ color: C.textMuted, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3" style={{ background: C.panelBg }}>

          {/* Live FII/DII Data */}
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <ArrowClockwise size={12} className="animate-spin text-sky-500" />
              <span className="text-[10px]" style={{ color: C.textSecond }}>NSE se data fetch ho raha hai...</span>
            </div>
          )}

          {live && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: C.textMuted }}>
                  Latest F&amp;O Positions (Lots/Contracts)
                </span>
                <span className="text-[9px]" style={{ color: C.textMuted }}>{fiiData.date}</span>
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
            <div className="text-[9px] py-1.5 px-2 rounded" style={{ background: isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
              {fiiData.message || 'NSE FII data available after 6 PM IST'}
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
