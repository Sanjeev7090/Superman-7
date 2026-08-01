import React, { useState, useRef } from 'react';

const PCR_ZONES = [
  { min: 0,    max: 0.50, color: '#ef4444' },
  { min: 0.50, max: 0.70, color: '#f97316' },
  { min: 0.70, max: 0.90, color: '#eab308' },
  { min: 0.90, max: 1.20, color: '#22c55e' },
  { min: 1.20, max: 1.50, color: '#16a34a' },
  { min: 1.50, max: 2.50, color: '#f59e0b' },
];
const PCR_REF_LINES = [0.50, 0.70, 0.90, 1.20, 1.50];

function pcrColor(pcr) {
  for (const z of PCR_ZONES) if (pcr >= z.min && pcr < z.max) return z.color;
  return '#94a3b8';
}

export function PcrSparkline({ history, currentPcr, isDark }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);
  const W = 320, H = 90, PAD = { t: 6, r: 8, b: 20, l: 30 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

  const pts = history && history.length >= 2 ? history : null;

  const allVals = pts ? pts.map(p => p.pcr) : [currentPcr || 1.0];
  const minY = Math.max(0, Math.min(...allVals, 0.4) - 0.1);
  const maxY = Math.max(...allVals, 1.6) + 0.1;
  const rangeY = maxY - minY || 1;

  const toX = (i, len) => PAD.l + (i / (len - 1)) * cW;
  const toY = (v) => PAD.t + cH - ((v - minY) / rangeY) * cH;

  const bg   = isDark ? '#0f172a' : '#f8fafc';
  const grid = isDark ? '#1e293b' : '#e2e8f0';
  const txtC = isDark ? '#475569' : '#94a3b8';

  const linePts = pts
    ? pts.map((p, i) => `${toX(i, pts.length)},${toY(p.pcr)}`).join(' ')
    : null;

  const dotX = pts ? toX(pts.length - 1, pts.length) : W / 2;
  const dotY = toY(currentPcr || (pts ? pts[pts.length - 1].pcr : 1.0));
  const dotColor = pcrColor(currentPcr || 1.0);

  const handleMouseMove = (e) => {
    if (!pts || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((mx - PAD.l) / cW) * (pts.length - 1));
    const clamped = Math.max(0, Math.min(idx, pts.length - 1));
    const p = pts[clamped];
    const ts = new Date(p.ts);
    const label = `${ts.getHours().toString().padStart(2,'0')}:${ts.getMinutes().toString().padStart(2,'0')}`;
    setTooltip({ x: toX(clamped, pts.length), y: toY(p.pcr), pcr: p.pcr, label });
  };

  return (
    <div className="mt-3">
      <div className="text-[8px] uppercase tracking-wider mb-1.5 flex items-center justify-between" style={{ color: txtC }}>
        <span>PCR Trend {pts ? `(last ${pts.length} readings)` : '(accumulating...)'}</span>
        <span className="font-mono font-bold" style={{ color: dotColor }}>
          Current: {currentPcr?.toFixed(2) ?? '—'}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', cursor: pts ? 'crosshair' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <rect x={PAD.l} y={PAD.t} width={cW} height={cH} fill={grid} rx="3" />
        {PCR_ZONES.map((z) => {
          const y1 = toY(Math.min(z.max, maxY));
          const y2 = toY(Math.max(z.min, minY));
          if (y2 <= PAD.t || y1 >= PAD.t + cH) return null;
          return (
            <rect key={z.min} x={PAD.l} y={Math.max(PAD.t, y1)}
              width={cW} height={Math.min(y2, PAD.t + cH) - Math.max(PAD.t, y1)}
              fill={z.color} opacity={0.08} />
          );
        })}
        {PCR_REF_LINES.map((v) => {
          if (v < minY || v > maxY) return null;
          const y = toY(v);
          return (
            <g key={v}>
              <line x1={PAD.l} y1={y} x2={PAD.l + cW} y2={y}
                stroke={pcrColor(v + 0.01)} strokeWidth="0.5" strokeDasharray="3,3" opacity={0.5} />
              <text x={PAD.l - 2} y={y + 3} textAnchor="end" fontSize="6" fill={txtC}>{v.toFixed(2)}</text>
            </g>
          );
        })}
        {pts ? (
          <polyline points={linePts} fill="none"
            stroke={dotColor} strokeWidth="1.5" strokeLinejoin="round" opacity={0.9} />
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="8" fill={txtC}>
            Accumulating live data...
          </text>
        )}
        <circle cx={dotX} cy={dotY} r="3.5" fill={dotColor} />
        <circle cx={dotX} cy={dotY} r="6" fill={dotColor} opacity={0.2} />
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={PAD.t} x2={tooltip.x} y2={PAD.t + cH}
              stroke={pcrColor(tooltip.pcr)} strokeWidth="0.8" opacity={0.6} />
            <circle cx={tooltip.x} cy={tooltip.y} r="3" fill={pcrColor(tooltip.pcr)} />
            <rect x={Math.min(tooltip.x + 4, W - 52)} y={tooltip.y - 14}
              width={48} height={16} rx="3" fill={isDark ? '#1e293b' : '#fff'}
              stroke={pcrColor(tooltip.pcr)} strokeWidth="0.5" />
            <text x={Math.min(tooltip.x + 28, W - 28)} y={tooltip.y - 3}
              textAnchor="middle" fontSize="7" fill={pcrColor(tooltip.pcr)} fontWeight="bold">
              {tooltip.label} — {tooltip.pcr.toFixed(2)}
            </text>
          </g>
        )}
        {pts && pts.length >= 3 && [0, Math.floor(pts.length / 2), pts.length - 1].map((idx) => {
          const p = pts[idx];
          const ts = new Date(p.ts);
          const label = `${ts.getHours().toString().padStart(2,'0')}:${ts.getMinutes().toString().padStart(2,'0')}`;
          return (
            <text key={idx} x={toX(idx, pts.length)} y={H - 4} textAnchor="middle" fontSize="6" fill={txtC}>
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
