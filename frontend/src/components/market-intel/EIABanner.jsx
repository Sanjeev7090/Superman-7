import React, { useState, useEffect } from 'react';

export function useEIACountdown() {
  const [state, setState] = useState(null);

  useEffect(() => {
    function compute() {
      const now    = new Date();
      const istMs  = now.getTime() + (5.5 * 60 * 60 * 1000);
      const ist    = new Date(istMs);
      const dayIST = ist.getUTCDay();
      const hIST   = ist.getUTCHours();
      const mIST   = ist.getUTCMinutes();

      const EIA_H = 20, EIA_M = 30;
      const nowMinIST  = hIST * 60 + mIST;
      const eiaMinIST  = EIA_H * 60 + EIA_M;
      const diffMin    = eiaMinIST - nowMinIST;

      if (dayIST !== 3) {
        const daysLeft = ((3 - dayIST + 7) % 7) || 7;
        setState({ mode: 'upcoming', daysLeft });
        return;
      }

      if (diffMin > 120)  { setState({ mode: 'today',    hrsLeft: Math.floor(diffMin/60), minLeft: diffMin % 60 }); return; }
      if (diffMin > 60)   { setState({ mode: 'soon',     hrsLeft: 1, minLeft: diffMin - 60 }); return; }
      if (diffMin > 0)    { setState({ mode: 'alert',    minLeft: diffMin }); return; }
      if (diffMin > -15)  { setState({ mode: 'live' }); return; }
      if (diffMin > -180) { setState({ mode: 'released', minsAgo: -diffMin }); return; }
      setState({ mode: 'done' });
    }

    compute();
    const id = setInterval(compute, 30_000);
    return () => clearInterval(id);
  }, []);

  return state;
}

export function EIABanner({ C }) {
  const eia = useEIACountdown();
  if (!eia || eia.mode === 'done') return null;

  const cfg = {
    upcoming: { bg: '#1e293b', border: '#334155', icon: '📅', text: `Next EIA Crude Inventory: Wednesday 8:30 PM IST (${eia.daysLeft} day${eia.daysLeft > 1 ? 's' : ''} away)`, sub: 'Mark your calendar — most important weekly crude signal', color: '#94a3b8', pulse: false },
    today:    { bg: '#1c1917', border: '#78350f', icon: '🕐', text: `EIA data TODAY at 8:30 PM IST — ${eia.hrsLeft}h ${eia.minLeft}m remaining`, sub: 'Start watching crude price & Nifty setup before release', color: '#f59e0b', pulse: false },
    soon:     { bg: '#1c1917', border: '#b45309', icon: '⏳', text: `EIA data in ~${eia.minLeft + 60} mins — Get Ready!`, sub: 'Close out risky positions. Crude can move 2-4% on surprise data', color: '#f97316', pulse: true },
    alert:    { bg: '#1a0a00', border: '#dc2626', icon: '🚨', text: `EIA Crude Inventory in ${eia.minLeft} min${eia.minLeft > 1 ? 's' : ''} — STAY READY`, sub: 'High volatility expected. Nifty may react sharply to surprise data', color: '#ef4444', pulse: true },
    live:     { bg: '#0a1a0a', border: '#16a34a', icon: '🟢', text: 'EIA Crude Inventory data LIVE NOW — Check immediately!', sub: 'Go to eia.gov or check Reuters for the numbers right now', color: '#22c55e', pulse: true },
    released: { bg: '#0d1a10', border: '#15803d', icon: '✅', text: `EIA data released ${eia.minsAgo}m ago — Check crude impact on Nifty`, sub: 'Compare actual vs estimate. Big surprise = 2-4% crude move → Nifty reaction', color: '#4ade80', pulse: false },
  }[eia.mode];

  if (!cfg) return null;

  return (
    <div className={`px-4 py-2.5 flex items-start gap-2.5 ${cfg.pulse ? 'animate-pulse' : ''}`}
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, margin: '12px 16px 0' }}>
      <span className="text-base shrink-0 mt-0.5" style={{ filter: 'none' }}>{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[9.5px] font-bold leading-tight" style={{ color: cfg.color }}>{cfg.text}</div>
        <div className="text-[8px] mt-0.5 leading-snug" style={{ color: C.textMuted }}>{cfg.sub}</div>
      </div>
      {(eia.mode === 'alert' || eia.mode === 'live') && (
        <a href="https://www.eia.gov/petroleum/supply/weekly/" target="_blank" rel="noopener noreferrer"
          className="text-[7.5px] font-black px-2 py-1 rounded-lg shrink-0"
          style={{ background: cfg.color, color: '#000' }}>
          OPEN EIA
        </a>
      )}
    </div>
  );
}
