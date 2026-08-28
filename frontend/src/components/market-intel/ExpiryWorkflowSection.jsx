import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API    = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;
const LS_KEY = 'expiry_wf_last_v1';

const TIME_TABLE = [
  { time: '8:00–9:00',  kaam: 'Context lo, trade mat lo',       key: false, warn: false },
  { time: '9:00–9:15',  kaam: 'Pre-open note karo',             key: false, warn: false },
  { time: '9:15–9:50',  kaam: 'Observe only — koi trade nahi', key: false, warn: true  },
  { time: '9:50',       kaam: 'Direction confirm (3/4 checks)', key: true,  warn: false },
  { time: '9:50–2:15',  kaam: 'Confirmed side, half size',      key: false, warn: false },
  { time: '2:15–3:15',  kaam: 'Naya trade band, trail karo',    key: false, warn: false },
];

const GEX_TARGET_TABLE = [
  { mode: '+GEX + VIX <12',     pts: '±50–120',  color: '#22c55e', regimes: ['STRONG_POSITIVE'] },
  { mode: 'Normal weekly pin',  pts: '±80–180',  color: '#86efac', regimes: ['POSITIVE'] },
  { mode: 'Weak / mixed GEX',   pts: '±100–220', color: '#fbbf24', regimes: ['WEAK_POSITIVE','WEAK_NEGATIVE'] },
  { mode: '−GEX + VIX >15',    pts: '±150–300', color: '#f97316', regimes: ['NEGATIVE'] },
  { mode: 'Monthly trend hold', pts: '±150–350', color: '#ef4444', regimes: ['STRONG_NEGATIVE'] },
];

function getExpiryMode(vix, isPositiveGex) {
  if (vix > 0 && vix < 12 && isPositiveGex) return { mode: 'PIN / FADE',   color: '#22c55e', desc: 'Gap fail trade karo, walls pe fade' };
  if (vix > 15 && !isPositiveGex)           return { mode: 'FOLLOW',       color: '#f97316', desc: '9:50 hold + matrix direction lo (50%)' };
  return                                            { mode: 'WAIT + 9:50', color: '#fbbf24', desc: '9:15–9:50 watch, 9:50 pe confirm' };
}

export function ExpiryWorkflowSection({ C, isDark }) {
  const [mktData,   setMktData]   = useState(null);
  const [gexData,   setGexData]   = useState(null);
  const [oiData,    setOiData]    = useState(null);
  const [fiiData,   setFiiData]   = useState(null);
  const [gbData,    setGbData]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [checks,    setChecks]    = useState([false, false, false, false]);
  const [collapsed, setCollapsed] = useState({});
  const [lastCache, setLastCache] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mkt, gex, oi, fii, gb] = await Promise.allSettled([
        axios.get(`${API}/market-intel`),
        axios.get(`${API}/gex/nifty`),
        axios.get(`${API}/oi-indicator/nifty`),
        axios.get(`${API}/market-intel/fii`),
        axios.get(`${API}/gamma-blast/sensex-picks`),
      ]);
      const md = mkt.status === 'fulfilled' ? mkt.value.data : null;
      const gd = gex.status === 'fulfilled' ? gex.value.data : null;
      const od = oi.status  === 'fulfilled' ? oi.value.data  : null;
      const fd = fii.status === 'fulfilled' ? fii.value.data : null;
      const bd = gb.status  === 'fulfilled' ? gb.value.data  : null;
      setMktData(md); setGexData(gd); setOiData(od); setFiiData(fd); setGbData(bd);
      const nd = md?.expiry?.NIFTY?.days;
      const bk = md?.expiry?.BANKNIFTY?.days;
      if ((nd != null && nd <= 1) || (bk != null && bk <= 1)) {
        const cache = { md, gd, od, fd, ts: new Date().toISOString() };
        setLastCache(cache);
        try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch {}
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 120_000); return () => clearInterval(t); }, [load]);

  // Expiry detection
  const niftyEx = mktData?.expiry?.NIFTY;
  const bnkEx   = mktData?.expiry?.BANKNIFTY;
  let activeEx  = null, exName = '';
  if (niftyEx && niftyEx.days <= 1)      { activeEx = niftyEx;  exName = 'NIFTY'; }
  else if (bnkEx && bnkEx.days <= 1)     { activeEx = bnkEx;    exName = 'BANKNIFTY'; }
  const isLive = !!activeEx;

  const md = mktData || lastCache?.md;
  const gd = gexData || lastCache?.gd;
  const od = oiData  || lastCache?.od;
  const fd = fiiData || lastCache?.fd;

  if (loading && !md) return (
    <div className="rounded-xl px-3 py-4 text-center text-[10px] animate-pulse"
      style={{ border: `1px solid ${C.border}`, color: C.textMuted, background: C.cardBg }}>
      ⟳ Expiry Workflow load ho raha hai…
    </div>
  );

  const vix       = md?.vix ?? 0;
  const isGexPos  = gd?.is_positive ?? true;
  const gexRegime = gd?.regime || 'POSITIVE';
  const exMode    = getExpiryMode(vix, isGexPos);

  const gift     = md?.gift_premium ?? 0;
  const gapLabel = gift > 30 ? 'Gap Up' : gift < -30 ? 'Gap Down' : 'Flat';
  const gapColor = gift > 30 ? '#22c55e' : gift < -30 ? '#ef4444' : '#94a3b8';
  const fiiNet   = fd?.fii?.net ?? 0;
  const fiiLabel = fiiNet > 500 ? 'Buying' : fiiNet < -500 ? 'Selling' : 'Neutral';
  const fiiColor = fiiNet > 500 ? '#22c55e' : fiiNet < -500 ? '#ef4444' : '#94a3b8';
  const vixColor = vix < 12 ? '#22c55e' : vix < 15 ? '#fbbf24' : '#ef4444';
  const gexColor = isGexPos ? '#22c55e' : '#ef4444';
  const callWall = od?.call_wall ?? gd?.call_wall;
  const putWall  = od?.put_wall  ?? gd?.put_wall;
  const maxPain  = od?.max_pain;
  const pcr      = od?.pcr;
  const PURPLE   = '#a78bfa';
  const gb       = gbData;
  const gbColor  = '#F59E0B';
  const gbWColor = gb?.window_status === 'ACTIVE' ? '#22c55e' : gbColor;

  const tog = (i) => setChecks(p => { const n = [...p]; n[i] = !n[i]; return n; });
  const cnt = checks.filter(Boolean).length;
  const confLabel = cnt >= 3 ? (checks[0] ? 'BULLISH CONFIRMED' : 'BEARISH CONFIRMED') : cnt === 2 ? 'NO TRADE' : `WATCHING ${cnt}/4`;
  const confColor = cnt >= 3 ? (checks[0] ? '#22c55e' : '#ef4444') : '#94a3b8';

  const nextDays = niftyEx?.days;

  // Collapsible section toggle
  const tog2 = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }));
  const Section = ({ id, title, accent, children }) => (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <button onClick={() => tog2(id)}
        className="w-full flex items-center justify-between px-3 py-2"
        style={{ background: C.cardBg }}>
        <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: accent || C.textMuted }}>{title}</span>
        <span className="text-[9px]" style={{ color: C.textMuted }}>{collapsed[id] ? '▶' : '▼'}</span>
      </button>
      {!collapsed[id] && (
        <div className="px-3 pb-3 pt-2 space-y-2" style={{ background: C.panelBg }}>
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: `2px solid ${isLive ? PURPLE + '60' : C.border}` }}
      data-testid="expiry-workflow-section">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ background: isLive ? `${PURPLE}10` : C.cardBg, borderBottom: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest shrink-0" style={{ color: isLive ? PURPLE : C.textMuted }}>
            ⚡ Expiry Workflow
          </span>
          {isLive ? (
            <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full border animate-pulse truncate"
              style={{ color: PURPLE, background: `${PURPLE}15`, borderColor: `${PURPLE}40` }}>
              LIVE · {exName}{activeEx?.days === 0 ? ' TODAY' : ' TOMORROW'}
            </span>
          ) : (
            <span className="text-[7px] px-1.5 py-0.5 rounded-full border shrink-0"
              style={{ color: C.textMuted, borderColor: C.border }}>
              {nextDays != null ? `Next expiry: ${nextDays}d` : 'ARCHIVE'}
            </span>
          )}
        </div>
        <button onClick={load} disabled={loading}
          className="shrink-0 text-[8px] px-2 py-0.5 rounded transition-all"
          style={{ color: C.textMuted, border: `1px solid ${C.border}` }}>
          {loading ? '⟳' : '↻'}
        </button>
      </div>

      <div className="p-2 space-y-2" style={{ background: C.panelBg }}>

        {/* Archive banner */}
        {!isLive && (
          <div className="rounded px-2.5 py-1.5 text-[8px]"
            style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.textMuted }}>
            Expiry se 1 din pehle + expiry day pe LIVE ho jaata hai.
            {lastCache?.ts && ` Last: ${new Date(lastCache.ts).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' })}`}
          </div>
        )}

        {/* ── Current Mode Badge (always visible) ─────────── */}
        <div className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-2"
          style={{ background: `${exMode.color}12`, border: `2px solid ${exMode.color}40` }}>
          <div>
            <div className="text-[13px] font-black leading-tight" style={{ color: exMode.color }}>{exMode.mode}</div>
            <div className="text-[8px] mt-0.5" style={{ color: C.textSecond }}>{exMode.desc}</div>
          </div>
          <div className="text-right text-[8px] space-y-0.5 shrink-0">
            <div>VIX <span className="font-bold" style={{ color: vixColor }}>{vix ? vix.toFixed(1) : '—'}</span></div>
            <div>GEX <span className="font-bold" style={{ color: gexColor }}>{isGexPos ? '+' : '−'}</span></div>
          </div>
        </div>

        {/* ── Step 1: Morning Context ──────────────────────── */}
        <Section id="ctx" title="Step 1 — Morning Context">
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { lbl: 'Gap',      val: gapLabel,                             col: gapColor },
              { lbl: 'FII',      val: fiiLabel,                             col: fiiColor },
              { lbl: 'VIX',      val: vix ? vix.toFixed(1) : '—',          col: vixColor },
              { lbl: 'GEX',      val: isGexPos ? '+ve' : '−ve',            col: gexColor },
              { lbl: 'Call Wall',val: callWall ? (+callWall/1000).toFixed(1)+'K' : '—', col: '#ef4444' },
              { lbl: 'Put Wall', val: putWall  ? (+putWall /1000).toFixed(1)+'K' : '—', col: '#22c55e' },
              { lbl: 'Max Pain', val: maxPain  ? (+maxPain /1000).toFixed(1)+'K' : '—', col: '#fbbf24' },
              { lbl: 'PCR',      val: pcr      ? pcr.toFixed(2) : '—',     col: pcr > 1 ? '#22c55e' : '#ef4444' },
              { lbl: 'Γ Flip',   val: gd?.gamma_flip ? (+gd.gamma_flip/1000).toFixed(1)+'K' : '—', col: PURPLE },
            ].map(({ lbl, val, col }) => (
              <div key={lbl} className="rounded p-1.5 text-center"
                style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div className="text-[6.5px] uppercase tracking-widest mb-0.5" style={{ color: C.textMuted }}>{lbl}</div>
                <div className="text-[9px] font-bold font-mono" style={{ color: col }}>{val}</div>
              </div>
            ))}
          </div>
          <div className="text-[7.5px] px-0.5" style={{ color: C.textMuted }}>
            Yeh sirf context hai — 9:50 ke pehle koi trade nahi.
          </div>
        </Section>

        {/* ── Step 2: Mode Conditions ──────────────────────── */}
        <Section id="mode" title="Step 2 — Mode Conditions (8:40–9:10)">
          {[
            { cond: 'VIX < 12 + GEX +ve',      mode: 'PIN / FADE',  col: '#22c55e', match: exMode.mode === 'PIN / FADE' },
            { cond: 'VIX 12–15 + GEX mixed',    mode: 'WAIT + 9:50', col: '#fbbf24', match: exMode.mode === 'WAIT + 9:50' },
            { cond: 'VIX > 15 + GEX −ve',       mode: 'FOLLOW (50%)',col: '#f97316', match: exMode.mode === 'FOLLOW' },
            { cond: 'Monthly Tue + 9:50 hold',  mode: 'FOLLOW',      col: '#f97316', match: false },
            { cond: 'Sensex Thu + Nifty weak',  mode: 'FADE / DOWN', col: '#ef4444', match: false },
          ].map(({ cond, mode, col, match }, i, arr) => (
            <div key={cond} className="flex items-center justify-between text-[8px] py-1.5 px-1"
              style={{
                background:   match ? `${col}10` : 'transparent',
                borderLeft:   match ? `3px solid ${col}` : '3px solid transparent',
                borderBottom: i < arr.length - 1 ? `1px solid ${C.borderSubtle}` : 'none',
              }}>
              <span style={{ color: match ? C.textPrimary : C.textMuted }}>{cond}</span>
              <span className="font-bold shrink-0 ml-2" style={{ color: col }}>{mode}</span>
            </div>
          ))}
        </Section>

        {/* ── Step 3: 9:50 Checklist ───────────────────────── */}
        <Section id="check" title="Step 3 — 9:50 Direction Confirm" accent={PURPLE}>
          {[
            'Spot, Open ke upar hai?',
            'Gap hold hai ya fill ho gaya?',
            '9:15–9:50 high/low toota ya hold?',
            'Candle reject / accept?',
          ].map((q, i) => (
            <label key={i} className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all"
                style={{ background: checks[i] ? '#22c55e' : 'transparent', border: `2px solid ${checks[i] ? '#22c55e' : C.border}` }}
                onClick={() => tog(i)}>
                {checks[i] && <span className="text-white font-black leading-none" style={{ fontSize: 8 }}>✓</span>}
              </div>
              <span className="text-[8.5px]" style={{ color: C.textSecond }}>{q}</span>
            </label>
          ))}
          <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px dashed ${C.borderSubtle}` }}>
            <span className="text-[7.5px]" style={{ color: C.textMuted }}>3/4 same side → confirm</span>
            <span className="text-[8px] font-bold px-2 py-0.5 rounded-full"
              style={{ color: confColor, background: `${confColor}15`, border: `1px solid ${confColor}30` }}>
              {confLabel}
            </span>
          </div>
          <div className="text-[7.5px] space-y-0.5" style={{ color: C.textMuted }}>
            <div>• Bullish + gap fill + 9:50 neeche → <span style={{ color: '#ef4444' }}>DOWN confirm</span></div>
            <div>• Bearish + gap hold + 9:50 neeche → <span style={{ color: '#ef4444' }}>DOWN follow</span></div>
          </div>
        </Section>

        {/* ── Step 4: Points Target ────────────────────────── */}
        <Section id="pts" title="Step 4 — Points Target (GEX)">
          {GEX_TARGET_TABLE.map(({ mode, pts, color, regimes }, i) => {
            const active = regimes.includes(gexRegime);
            return (
              <div key={mode} className="flex items-center justify-between py-1.5 px-1 text-[8px]"
                style={{
                  background:   active ? `${color}12` : 'transparent',
                  borderLeft:   active ? `3px solid ${color}` : '3px solid transparent',
                  borderBottom: i < GEX_TARGET_TABLE.length - 1 ? `1px solid ${C.borderSubtle}` : 'none',
                }}>
                <span style={{ color: active ? C.textPrimary : C.textMuted }}>{mode}</span>
                <span className="font-bold font-mono shrink-0 ml-2" style={{ color }}>{pts} pts</span>
              </div>
            );
          })}
          <div className="text-[7.5px]" style={{ color: C.textMuted }}>
            Band ke <span style={{ color: '#fbbf24' }}>bahar target mat rakhna</span>
          </div>
        </Section>

        {/* ── Time Table ───────────────────────────────────── */}
        <Section id="time" title="Time Table">
          {TIME_TABLE.map(({ time, kaam, key: isKey, warn }, i) => (
            <div key={time} className="flex items-center gap-2 text-[8px] py-1"
              style={{
                background:   isKey ? `${PURPLE}10` : warn ? 'rgba(251,191,36,0.06)' : 'transparent',
                borderLeft:   isKey ? `3px solid ${PURPLE}` : warn ? '3px solid #fbbf24' : '3px solid transparent',
                borderBottom: i < TIME_TABLE.length - 1 ? `1px solid ${C.borderSubtle}` : 'none',
              }}>
              <span className="font-mono font-bold w-16 shrink-0 text-[7.5px]"
                style={{ color: isKey ? PURPLE : warn ? '#fbbf24' : C.textMuted }}>{time}</span>
              <span className="flex-1" style={{ color: isKey ? C.textPrimary : C.textSecond }}>{kaam}</span>
              {isKey && <span className="text-[6.5px] font-black px-1 py-0.5 rounded shrink-0" style={{ color: PURPLE, background: `${PURPLE}15` }}>KEY</span>}
              {warn  && <span className="text-[6.5px] font-bold text-amber-400 px-1 py-0.5 rounded shrink-0" style={{ background: 'rgba(251,191,36,0.10)' }}>WAIT</span>}
            </div>
          ))}
        </Section>

        {/* ── Trade Rules ──────────────────────────────────── */}
        <Section id="rules" title="Step 5 — Trade Rules">
          <div className="rounded p-2" style={{ background: C.cardBg, border: '1px solid rgba(34,197,94,0.20)' }}>
            <div className="text-[8px] font-black uppercase mb-1.5" style={{ color: '#22c55e' }}>PIN / FADE Mode</div>
            <div className="space-y-0.5 text-[7.5px]" style={{ color: C.textSecond }}>
              <div>• Gap up fail → <span style={{ color: '#ef4444' }}>Sell / Put</span></div>
              <div>• Gap down fail → <span style={{ color: '#22c55e' }}>Buy / Call</span></div>
              <div>• Walls pe fade, SL = 9:50 high/low, Size <span style={{ color: '#fbbf24' }}>50%</span></div>
            </div>
          </div>
          <div className="rounded p-2" style={{ background: C.cardBg, border: '1px solid rgba(249,115,22,0.20)' }}>
            <div className="text-[8px] font-black uppercase mb-1.5" style={{ color: '#f97316' }}>FOLLOW Mode</div>
            <div className="space-y-0.5 text-[7.5px]" style={{ color: C.textSecond }}>
              <div>• 9:50 hold + VIX/GEX allow kare</div>
              <div>• Matrix direction, Size <span style={{ color: '#fbbf24' }}>50%</span>, Trail +80–100 pts</div>
            </div>
          </div>
          <div className="rounded p-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
            <div className="text-[8px] font-black uppercase mb-1" style={{ color: '#ef4444' }}>NO TRADE Conditions</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[7.5px]" style={{ color: C.textMuted }}>
              {['9:50 mixed (2/4)', 'Both sides wick', 'News spike', '150+ pts at 9:50'].map(r => (
                <div key={r}>• {r}</div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Intraday Lock ────────────────────────────────── */}
        <Section id="lock" title="Step 6 — Intraday Lock">
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { t: '11:00',    r: 'Direction same? Nahi to exit' },
              { t: '1:30',     r: 'Pin zone mein? Book karo' },
              { t: '2:15',     r: 'Naya trade band karo' },
              { t: 'Last 15m', r: 'Sirf exit, naya trade nahi' },
            ].map(({ t, r }) => (
              <div key={t} className="rounded p-2" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div className="text-[8px] font-bold font-mono" style={{ color: PURPLE }}>{t}</div>
                <div className="text-[7px] mt-0.5" style={{ color: C.textSecond }}>{r}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Quick Card ───────────────────────────────────── */}
        <div className="rounded-lg p-2.5" style={{ background: `${PURPLE}08`, border: `1px solid ${PURPLE}25` }}>
          <div className="text-[7.5px] font-black uppercase tracking-widest mb-2" style={{ color: PURPLE }}>
            EXPIRY DAY — Quick Card
          </div>
          <div className="space-y-1">
            {[
              { line: `1. Mode = ${exMode.mode}`, col: exMode.color },
              { line: '2. 9:15–9:50 = watch only', col: C.textSecond },
              { line: '3. 9:50 = confirm (3/4)',    col: C.textSecond },
              { line: '4. Size = 50% always',       col: '#fbbf24' },
              { line: '5. Target = GEX band only',  col: C.textSecond },
              { line: '6. SL = 9:50 high/low',      col: C.textSecond },
              { line: '7. 2:15 ke baad = no trade', col: C.textSecond },
            ].map(({ line, col }, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[8px]">
                <div className="w-1 h-1 rounded-full shrink-0" style={{ background: PURPLE }} />
                <span style={{ color: col }}>{line}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 5 Aug Lesson ─────────────────────────────────── */}
        <div className="rounded px-2.5 py-2 text-[7.5px]"
          style={{ background: C.cardBg, border: `1px dashed ${C.border}` }}>
          <div className="font-bold mb-1" style={{ color: '#fbbf24' }}>5 Aug–27 Aug Lesson</div>
          <div className="space-y-0.5" style={{ color: C.textMuted }}>
            <div>• Low-VIX expiry: <span style={{ color: '#22c55e' }}>fade zyada jeeta</span></div>
            <div>• Direction = <span style={{ color: PURPLE }}>9:50 hold</span>, 8:30 matrix nahi</div>
            <div>• Matrix = <span style={{ color: '#22c55e' }}>pehla input</span>, final order nahi</div>
          </div>
        </div>

        {/* ── Gamma Blast ──────────────────────────────────── */}
        {gb && (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${gbColor}40` }}>
            <div className="px-3 py-2 flex items-center justify-between gap-2"
              style={{ background: `${gbColor}10`, borderBottom: `1px solid ${gbColor}20` }}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: gbColor }}>
                  Sensex · Gamma Blast
                </span>
                {gb.is_expiry_day && (
                  <span className="text-[6.5px] font-bold px-1.5 py-0.5 rounded-sm"
                    style={{ background: 'rgba(245,158,11,0.20)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.30)' }}>
                    EXPIRY
                  </span>
                )}
                {gb.window_status === 'ACTIVE' && (
                  <span className="text-[6.5px] font-bold px-1.5 py-0.5 rounded-sm animate-pulse"
                    style={{ background: 'rgba(34,197,94,0.20)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.30)' }}>
                    LIVE
                  </span>
                )}
              </div>
              <span className="text-[7px] font-mono shrink-0" style={{ color: C.textMuted }}>2:20–3:10 PM</span>
            </div>

            <div className="p-2 space-y-2" style={{ background: C.panelBg }}>
              {/* Window strip */}
              <div className="rounded px-2 py-1.5 flex items-center justify-between text-[8px]"
                style={{ background: `${gbWColor}10`, border: `1px solid ${gbWColor}30` }}>
                <span className="font-bold" style={{ color: gbWColor }}>
                  {gb.window_status === 'ACTIVE' ? '⚡ Window LIVE' : gb.window_status === 'PRE_WINDOW' ? '⏱ Pre-Window' : '✓ Closed'}
                </span>
                <span className="font-mono text-[7px]" style={{ color: C.textMuted }}>
                  {gb.expiry_date} · DTE {gb.dte}
                </span>
              </div>

              {gb.straddle && (
                <>
                  <div className="flex items-center justify-between text-[7.5px]" style={{ color: C.textMuted }}>
                    <span>ATM: <span className="font-bold" style={{ color: gbColor }}>{gb.atm_strike}</span></span>
                    <span>Cost: <span className="font-bold" style={{ color: gbColor }}>₹{gb.straddle_cost}</span></span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded p-2"
                      style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[8px] font-bold text-green-400">{gb.straddle.ce?.strike} CE</span>
                        <span className="text-[7px] text-green-400 font-mono">BUY</span>
                      </div>
                      <div className="text-[11px] font-bold font-mono text-zinc-200">
                        ₹{gb.straddle.ce?.last_price?.toFixed(2) ?? '—'}
                      </div>
                      <div className="flex gap-2 mt-1 text-[7px]" style={{ color: C.textMuted }}>
                        <span>Δ{gb.straddle.ce?.delta?.toFixed(2)}</span>
                        <span>IV{gb.straddle.ce?.iv}%</span>
                        <span>θ{gb.straddle.ce?.theta?.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="rounded p-2"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[8px] font-bold text-red-400">{gb.straddle.pe?.strike} PE</span>
                        <span className="text-[7px] text-red-400 font-mono">BUY</span>
                      </div>
                      <div className="text-[11px] font-bold font-mono text-zinc-200">
                        ₹{gb.straddle.pe?.last_price?.toFixed(2) ?? '—'}
                      </div>
                      <div className="flex gap-2 mt-1 text-[7px]" style={{ color: C.textMuted }}>
                        <span>Δ{gb.straddle.pe?.delta?.toFixed(2)}</span>
                        <span>IV{gb.straddle.pe?.iv}%</span>
                        <span>θ{gb.straddle.pe?.theta?.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
