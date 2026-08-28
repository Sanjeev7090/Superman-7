import React, { useMemo } from 'react';

/**
 * VWAPFlipMini — mini chart below the main chart
 * Shows:
 *  - Live recent price vs VWAP (SVG line chart, last 60 bars)
 *  - VWAP Flip concept: ABOVE=Support | BELOW=Resistance
 *  - Conceptual diagram matching the reference image
 */
export default function VWAPFlipMini({ bars, isDark }) {
  const bg     = isDark ? '#0a0a0a' : '#f8fafc';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const muted  = isDark ? '#52525b' : '#94a3b8';
  const text2  = isDark ? '#94a3b8' : '#64748b';

  // ── VWAP Calculation ──────────────────────────────────────────
  const { vwap, recentBars, currentPrice, aboveVwap, distancePct } = useMemo(() => {
    if (!bars || bars.length < 5) return {};
    // For VWAP: use last 390 bars max (intraday-like session window)
    // On daily charts this keeps it ~1.5 years max; on 5m it's ~1 day
    const sessionBars = bars.slice(-390);
    let cumTV = 0, cumV = 0;
    for (const b of sessionBars) {
      const tp = (b.high + b.low + b.close) / 3;
      const v  = b.volume || 1;
      cumTV += tp * v;
      cumV  += v;
    }
    const vwap = cumV > 0 ? cumTV / cumV : bars[bars.length - 1].close;
    const last  = bars[bars.length - 1].close;
    const pct   = ((last - vwap) / vwap) * 100;
    const slice = bars.slice(-60);
    return {
      vwap,
      recentBars:   slice,
      currentPrice: last,
      aboveVwap:    last >= vwap,
      distancePct:  pct,
    };
  }, [bars]);

  if (!bars || bars.length < 5) return null;

  // ── SVG Price + VWAP Line ─────────────────────────────────────
  const W = 260, H = 56;
  const prices = recentBars.map(b => b.close);
  const allPts = [...prices, vwap];
  const minP   = Math.min(...allPts) * 0.9998;
  const maxP   = Math.max(...allPts) * 1.0002;
  const range  = maxP - minP || 1;
  const px     = (i)  => (i / (prices.length - 1)) * W;
  const py     = (v)  => H - ((v - minP) / range) * H;
  const vwapY  = py(vwap);

  // Build price path segments (color by above/below VWAP)
  const segments = [];
  let seg = [{ x: px(0), y: py(prices[0]), above: prices[0] >= vwap }];
  for (let i = 1; i < prices.length; i++) {
    const cur   = prices[i];
    const prev  = prices[i - 1];
    const isAb  = cur >= vwap;
    const wasAb = prev >= vwap;
    if (isAb !== wasAb) {
      // Interpolate crossing point
      const xCross = px(i - 1) + (px(1) * Math.abs(prev - vwap)) / (Math.abs(prev - vwap) + Math.abs(cur - vwap));
      seg.push({ x: xCross, y: vwapY, above: wasAb });
      segments.push(seg);
      seg = [{ x: xCross, y: vwapY, above: isAb }];
    }
    seg.push({ x: px(i), y: py(cur), above: isAb });
  }
  segments.push(seg);

  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // ── Flip Concept Diagram (SVG) ────────────────────────────────
  // DW=150, DH=56 — compact diagram matching the image
  const DW = 148, DH = 56;
  const DY = DH / 2; // VWAP line Y

  // Left half: RESISTANCE — red arch above VWAP that gets rejected back
  const redPath = `M8,${DY + 18} Q30,${DY - 24} ${DW / 2 - 6},${DY + 2} Q${DW / 2 - 2},${DY + 4} ${DW / 2 - 1},${DY + 6}`;
  // Right half: SUPPORT — green dip to VWAP then bounce
  const greenPath = `M${DW / 2 + 1},${DY - 20} Q${DW / 2 + 14},${DY + 4} ${DW / 2 + 30},${DY + 2} Q${DW - 10},${DY + 1} ${DW - 8},${DY - 20}`;

  const ac  = aboveVwap ? '#22c55e' : '#ef4444';
  const acL = aboveVwap ? 'ABOVE VWAP' : 'BELOW VWAP';
  const acS = aboveVwap ? 'Support — bounce expected' : 'Resistance — rejection expected';

  return (
    <div
      className="shrink-0 flex items-stretch gap-0"
      style={{
        borderTop: `1px solid ${border}`,
        background: bg,
        height: 76,
        overflow: 'hidden',
      }}
      data-testid="vwap-flip-mini"
    >

      {/* ── State Badge (left column) ──────────────────────────── */}
      <div className="flex flex-col justify-center px-3 shrink-0"
        style={{ width: 100, borderRight: `1px solid ${border}` }}>
        <div className="text-[7px] font-black uppercase tracking-widest mb-0.5" style={{ color: muted }}>
          VWAP FLIP
        </div>
        <div className="text-[11px] font-black leading-tight" style={{ color: ac }}>
          {acL}
        </div>
        <div className="text-[7px] mt-0.5 leading-tight" style={{ color: text2 }}>
          {acS}
        </div>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-[7px]" style={{ color: muted }}>Dist</span>
          <span className="text-[9px] font-bold font-mono" style={{ color: ac }}>
            {distancePct >= 0 ? '+' : ''}{distancePct?.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* ── Live Price vs VWAP SVG ─────────────────────────────── */}
      <div className="flex flex-col justify-center shrink-0"
        style={{ width: 270, borderRight: `1px solid ${border}`, padding: '4px 6px 2px' }}>
        <div className="flex items-center justify-between mb-0.5 px-0.5">
          <span className="text-[7px] font-black uppercase tracking-widest" style={{ color: muted }}>Live Price vs VWAP</span>
          <div className="flex items-center gap-2">
            <span className="text-[7px]" style={{ color: '#94a3b8' }}>
              VWAP <span className="font-bold font-mono text-[8px]" style={{ color: '#fbbf24' }}>
                {vwap?.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
              </span>
            </span>
            <span className="text-[7px]" style={{ color: '#94a3b8' }}>
              Price <span className="font-bold font-mono text-[8px]" style={{ color: ac }}>
                {currentPrice?.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
              </span>
            </span>
          </div>
        </div>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
          {/* VWAP dashed line */}
          <line x1={0} y1={vwapY} x2={W} y2={vwapY}
            stroke="#fbbf24" strokeWidth={0.8} strokeDasharray="3,3" opacity={0.8} />

          {/* Price segments coloured above/below */}
          {segments.map((seg, i) => (
            <path key={i} d={toPath(seg)}
              fill="none"
              stroke={seg[0].above ? '#22c55e' : '#ef4444'}
              strokeWidth={1.2}
              opacity={0.85}
            />
          ))}

          {/* Current price dot */}
          <circle
            cx={px(prices.length - 1)}
            cy={py(currentPrice)}
            r={2.5}
            fill={ac}
          />
          {/* VWAP label */}
          <text x={2} y={vwapY - 2} fontSize={7} fill="#fbbf24" opacity={0.8} fontFamily="monospace">VWAP</text>
        </svg>
      </div>

      {/* ── Concept Diagram ────────────────────────────────────── */}
      <div className="flex flex-col justify-center flex-1 px-3" style={{ minWidth: 140 }}>
        <div className="text-[7px] font-black uppercase tracking-widest mb-0.5 text-center" style={{ color: muted }}>
          VWAP FLIP
        </div>
        <svg width={DW} height={DH} viewBox={`0 0 ${DW} ${DH}`} style={{ overflow: 'visible', width: '100%' }}>
          {/* VWAP dashed line */}
          <line x1={2} y1={DY} x2={DW - 2} y2={DY}
            stroke="#fbbf24" strokeWidth={0.9} strokeDasharray="4,3" opacity={0.7} />
          <text x={2} y={DY - 2} fontSize={6} fill="#fbbf24" opacity={0.7} fontFamily="monospace">VWAP</text>

          {/* Resistance (left) — red arch */}
          <path d={redPath} fill="none" stroke="#ef4444" strokeWidth={1.4}
            opacity={aboveVwap ? 0.35 : 1} />
          {/* Dot at peak of resistance */}
          <circle cx={DW / 2 - 1} cy={DY} r={2} fill={aboveVwap ? '#52525b' : '#ef4444'} />
          <text x={DW / 4 - 12} y={DH - 3} fontSize={6} fill="#ef4444" fontWeight="bold"
            opacity={aboveVwap ? 0.4 : 1}>RESISTANCE</text>

          {/* Support (right) — green bounce */}
          <path d={greenPath} fill="none" stroke="#22c55e" strokeWidth={1.4}
            opacity={aboveVwap ? 1 : 0.35} />
          {/* Dot at VWAP touch of support */}
          <circle cx={DW / 2 + 30} cy={DY} r={2} fill={aboveVwap ? '#22c55e' : '#52525b'} />
          <text x={DW * 0.6} y={12} fontSize={6} fill="#22c55e" fontWeight="bold"
            opacity={aboveVwap ? 1 : 0.4}>SUPPORT</text>

          {/* Active side highlight */}
          {!aboveVwap && (
            <rect x={2} y={DY - 28} width={DW / 2 - 8} height={26}
              fill="#ef4444" opacity={0.04} rx={2} />
          )}
          {aboveVwap && (
            <rect x={DW / 2 + 2} y={DY - 28} width={DW / 2 - 4} height={26}
              fill="#22c55e" opacity={0.04} rx={2} />
          )}
        </svg>
        <div className="text-center text-[6.5px] mt-0.5" style={{ color: muted }}>
          {aboveVwap ? 'above it rejects down' : 'below it rejects up'}
        </div>
      </div>

    </div>
  );
}
