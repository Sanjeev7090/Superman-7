import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Globe, ChartLine, ChartBar, Gauge, ArrowClockwise, X, Warning, Timer } from '@phosphor-icons/react';
import { useTheme } from '../context/ThemeContext';
import { PcrSparkline } from './market-intel/PcrSparkline';
import { MarketNewsCard } from './market-intel/MarketNewsCard';
import { GeoRiskCard } from './market-intel/GeoRiskCard';
import { CrudeSupplyCard } from './market-intel/CrudeSupplyCard';
import { DoomCard } from './market-intel/DoomCard';
import { SectorBreadthCard } from './market-intel/SectorBreadthCard';
import { BreadthCard } from './market-intel/BreadthCard';
import { FiiSection } from './market-intel/FiiSection';
import { GapPredictionSection } from './market-intel/GapPredictionSection';
import { ClosingPredictionSection } from './market-intel/ClosingPredictionSection';
import { GexWorkflowSection } from './market-intel/GexWorkflowSection';
import { PostMarketFeedback } from './market-intel/PostMarketFeedback';

const API    = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;
const fmt    = (v, d = 2)   => v == null || isNaN(v) ? '—' : Number(v).toFixed(d);
const fmtPct = (v, pct = 2) => v == null || isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(pct)}%`;

const ROWS = [
  { label: 'Strong Bullish', brent: '< $84',    vix: '< 11.5',      regulatory: 'Positive', gift: '+0.4% or more',   breadth: '28+ stocks',    move: '+300 to +600 pts', prob: '93%+', action: 'Aggressive Long (Banking + Energy)',          color: '#22c55e', bg: 'rgba(34,197,94,0.10)' },
  { label: 'Mild Bullish',   brent: '$84 – 87', vix: '11.5 – 13.0', regulatory: 'Neutral',  gift: '+0.2% to +0.4%',  breadth: '22 – 27 stocks',move: '+150 to +350 pts', prob: '90%',  action: 'Selective Long',                               color: '#86efac', bg: 'rgba(134,239,172,0.10)' },
  { label: 'Neutral',        brent: '$87 – 91', vix: '13.0 – 14.5', regulatory: 'Neutral',  gift: '-0.2% to +0.2%',  breadth: '17 – 22 stocks',move: '-150 to +150 pts', prob: '92%',  action: 'Range trading / Small positions',              color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
  { label: 'Mild Bearish',   brent: '$91 – 94', vix: '14.5 – 16.0', regulatory: 'Neutral',  gift: '-0.2% to -0.4%',  breadth: '12 – 17 stocks',move: '-150 to -350 pts', prob: '91%',  action: 'Selective Energy Long + Profit booking',       color: '#fca5a5', bg: 'rgba(252,165,165,0.10)' },
  { label: 'Strong Bearish', brent: '$94+',     vix: '16.0+',        regulatory: 'Negative', gift: '-0.4% or less',   breadth: '< 12 stocks',   move: '-400 to -800 pts', prob: '94%',  action: 'Hedging / Increase Cash',                      color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
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
  const [doomData,      setDoomData]      = useState(null);

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
      const [marketRes, sbRes, doomRes] = await Promise.allSettled([
        axios.get(`${API}/market-intel`),
        axios.get(`${API}/sectors/breadth`),
        axios.get(`${API}/doom/score`),
      ]);
      if (marketRes.status === 'fulfilled') {
        setData(marketRes.value.data);
        setTs(new Date());
      } else {
        setError('Failed to load market intelligence data');
      }
      if (sbRes.status   === 'fulfilled') setSectorBreadth(sbRes.value.data);
      if (doomRes.status === 'fulfilled') setDoomData(doomRes.value.data);
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

              {/* ── DOOM mini card in data strip — right next to Geo Risk ── */}
              {doomData && (
                <div
                  className="rounded-xl p-3"
                  style={{ background: C.cardBg, border: `1px solid ${doomData.color || '#fbbf24'}40` }}
                  data-testid="card-doom-mini"
                >
                  <div className="flex items-center gap-1.5 text-[9px] mb-1.5" style={{ color: C.textMuted }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={doomData.color || '#fbbf24'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span className="uppercase tracking-widest">DOOM</span>
                  </div>
                  <div className="text-sm font-bold font-mono" style={{ color: doomData.color || '#fbbf24' }}>
                    {doomData.score >= 0 ? `+${doomData.score}` : `${doomData.score}`}
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden my-1" style={{ background: C.panelBg }}>
                    <div style={{
                      width: `${Math.min(100, ((doomData.score + 12) / 24) * 100)}%`,
                      background: doomData.color || '#fbbf24',
                      transition: 'width 0.4s',
                    }} />
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: doomData.color || '#fbbf24' }}>
                    {doomData.bias}
                  </div>
                  <div
                    className="mt-1 text-[8px] font-bold px-1 py-0.5 rounded text-center"
                    style={{
                      color: doomData.action === 'LONG' ? '#22c55e'
                           : doomData.action === 'SHORT' ? '#ef4444'
                           : '#fbbf24',
                      background: doomData.action === 'LONG' ? 'rgba(34,197,94,0.12)'
                                : doomData.action === 'SHORT' ? 'rgba(239,68,68,0.12)'
                                : 'rgba(251,191,36,0.12)',
                    }}
                  >
                    {(doomData.action || 'WAIT').split('/')[0].trim()}
                  </div>
                </div>
              )}
            </div>

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

            {/* ── Post-Market Feedback (after market close, below Bias Card) ── */}
            <PostMarketFeedback C={C} isDark={isDark} />

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

            {/* ── Decision Matrix Table ──────────────────────────────────── */}
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

            {/* ── GEX (Gamma Exposure) Workflow Process ─────────────────── */}
            <GexWorkflowSection C={C} isDark={isDark} />

            {/* ── Gap Up / Gap Down Prediction ─────────────────────────── */}
            <GapPredictionSection C={C} isDark={isDark} />

            {/* ── Last 15-min Closing Prediction (3:15–3:30) ───────────── */}
            <ClosingPredictionSection C={C} isDark={isDark} />

            {/* ── Market News Intelligence Card ───────────────────────── */}
            {data.market_news?.available && (
              <MarketNewsCard news={data.market_news} C={C} onRefresh={refreshNews} />
            )}

            {/* ── Geopolitical Risk + DOOM — side by side ─────────────── */}
            <div className="grid grid-cols-2 gap-2">
              <GeoRiskCard geoRisk={data.geo_risk} C={C} isDark={isDark} />
              <DoomCard C={C} isDark={isDark} />
            </div>

            {/* ── Crude Oil Supply ─────────────────────────────────────── */}
            <CrudeSupplyCard
              brent={data.brent}
              brentChgPct={data.brent_chg_pct}
              usdinr={data.usdinr}
              usdinrChgPct={data.usdinr_chg_pct}
              geoRisk={data.geo_risk}
              C={C}
              isDark={isDark}
            />

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

export default MarketIntelPanel;
