import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── VWAP calculation (last 390 bars) ────────────────────────────
function calcVWAP(bars) {
  if (!bars || bars.length < 5) return null;
  const session = bars.slice(-390);
  let cumTV = 0, cumV = 0;
  for (const b of session) {
    const tp = (b.high + b.low + b.close) / 3;
    const v  = b.volume || 1;
    cumTV += tp * v;
    cumV  += v;
  }
  return cumV > 0 ? cumTV / cumV : bars[bars.length - 1].close;
}

// ── Compact number formatter ─────────────────────────────────────
function fmtN(n) {
  if (!n) return '—';
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

export default function MiniVWAPOIChart({ stockData, isDark }) {
  const [oiData,  setOiData]  = useState(null);
  const [oiLoad,  setOiLoad]  = useState(false);

  const fetchOI = useCallback(async () => {
    setOiLoad(true);
    try {
      const { data } = await axios.get(`${API}/oi-indicator/nifty`);
      setOiData(data);
    } catch {}
    setOiLoad(false);
  }, []);

  useEffect(() => {
    fetchOI();
    const t = setInterval(fetchOI, 5_000);
    return () => clearInterval(t);
  }, [fetchOI]);

  const bars  = stockData?.bars;
  const vwap  = useMemo(() => calcVWAP(bars), [bars]);

  // ── Colors ────────────────────────────────────────────────────
  const bg     = isDark ? '#0a0a0a' : '#f8fafc';
  const cardBg = isDark ? '#111117' : '#fff';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
  const muted  = isDark ? '#52525b' : '#9ca3af';
  const text2  = isDark ? '#94a3b8' : '#64748b';
  const textP  = isDark ? '#e4e4e7' : '#111827';

  // ── VWAP SVG data ─────────────────────────────────────────────
  const { segments, vwapY, W, H, last, aboveVwap, distPct } = useMemo(() => {
    if (!bars || bars.length < 5 || !vwap) return {};
    const slice  = bars.slice(-80);
    const prices = slice.map(b => b.close);
    const W = 260, H = 72;
    const allPts = [...prices, vwap];
    const minP   = Math.min(...allPts) * 0.9998;
    const maxP   = Math.max(...allPts) * 1.0002;
    const rng    = maxP - minP || 1;
    const px     = (i) => (i / (prices.length - 1)) * W;
    const py     = (v) => H - ((v - minP) / rng) * H;
    const vwapY  = py(vwap);
    const bw     = px(1);

    // Build colored segments
    const segs = [];
    let seg = [{ x: px(0), y: py(prices[0]), above: prices[0] >= vwap }];
    for (let i = 1; i < prices.length; i++) {
      const cur = prices[i], prev = prices[i - 1];
      const isAb = cur >= vwap, wasAb = prev >= vwap;
      if (isAb !== wasAb) {
        const xC = px(i - 1) + bw * Math.abs(prev - vwap) / (Math.abs(prev - vwap) + Math.abs(cur - vwap));
        seg.push({ x: xC, y: vwapY, above: wasAb });
        segs.push(seg);
        seg = [{ x: xC, y: vwapY, above: isAb }];
      }
      seg.push({ x: px(i), y: py(cur), above: isAb });
    }
    segs.push(seg);

    const last = prices[prices.length - 1];
    return {
      segments: segs, vwapY, W, H,
      last, aboveVwap: last >= vwap,
      distPct: ((last - vwap) / vwap) * 100,
    };
  }, [bars, vwap]);

  const toPath = (pts) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const ac     = aboveVwap ? '#22c55e' : '#ef4444';
  const PURPLE = '#a78bfa';

  // ── OI Chart data ──────────────────────────────────────────────
  const strikes = oiData?.top_strikes?.slice(0, 7) || [];
  const maxOI   = strikes.length
    ? Math.max(...strikes.flatMap(s => [s.call_oi, s.put_oi]))
    : 1;
  const spot    = oiData?.spot_price;

  return (
    <div
      className="shrink-0"
      style={{ background: bg, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}
      data-testid="mini-vwap-oi-chart"
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: muted }}>
            VWAP
          </span>
          {vwap != null && (
            <span className="text-[8px] font-bold font-mono" style={{ color: '#fbbf24' }}>
              {vwap.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
            </span>
          )}
          {distPct != null && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ color: ac, background: `${ac}15`, border: `1px solid ${ac}25` }}>
              {distPct >= 0 ? '+' : ''}{distPct.toFixed(2)}%&nbsp;{aboveVwap ? 'Support' : 'Resistance'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: muted }}>
            OI Levels
          </span>
          {oiData && (
            <>
              <span className="text-[8px]" style={{ color: text2 }}>
                PCR <span className="font-bold" style={{ color: oiData.pcr < 0.8 ? '#ef4444' : oiData.pcr > 1.2 ? '#22c55e' : '#fbbf24' }}>
                  {oiData.pcr?.toFixed(2)}
                </span>
              </span>
              <span className="text-[8px] px-1.5 py-0.5 rounded"
                style={{ color: oiData.signal_color, background: `${oiData.signal_color}15`, border: `1px solid ${oiData.signal_color}25` }}>
                {oiData.signal}
              </span>
            </>
          )}
          <button onClick={fetchOI} disabled={oiLoad}
            className="text-[8px] px-1.5 py-0.5 rounded transition-all"
            style={{ color: muted, border: `1px solid ${border}` }}>
            {oiLoad ? '⟳' : '↻'}
          </button>
        </div>
      </div>

      {/* ── Two panels ──────────────────────────────────────────── */}
      <div className="flex gap-0" style={{ height: 92 }}>

        {/* ─ VWAP Chart ─────────────────────────────────────────── */}
        <div className="flex items-center px-3 shrink-0"
          style={{ width: '42%', borderRight: `1px solid ${border}` }}>
          {bars && bars.length >= 5 && vwap != null ? (
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none" style={{ display: 'block' }}>
              {/* VWAP dashed line */}
              <line x1={0} y1={vwapY} x2={W} y2={vwapY}
                stroke="#fbbf24" strokeWidth={0.9} strokeDasharray="4,3" opacity={0.75} />
              {/* Area fill under price */}
              {segments.map((seg, i) => {
                if (seg.length < 2) return null;
                const areaD = toPath(seg) +
                  ` L${seg[seg.length - 1].x.toFixed(1)},${vwapY} L${seg[0].x.toFixed(1)},${vwapY} Z`;
                return (
                  <path key={`a${i}`} d={areaD} fill={seg[0].above ? '#22c55e' : '#ef4444'} opacity={0.07} />
                );
              })}
              {/* Price line segments */}
              {segments.map((seg, i) => (
                <path key={`l${i}`} d={toPath(seg)}
                  fill="none"
                  stroke={seg[0].above ? '#22c55e' : '#ef4444'}
                  strokeWidth={1.3} opacity={0.9} />
              ))}
              {/* Current price dot */}
              {segments.length > 0 && (() => {
                const lastSeg = segments[segments.length - 1];
                const lp = lastSeg[lastSeg.length - 1];
                return <circle cx={lp.x} cy={lp.y} r={2.5} fill={ac} />;
              })()}
              {/* VWAP label */}
              <text x={3} y={vwapY - 2} fontSize={6.5} fill="#fbbf24"
                opacity={0.8} fontFamily="monospace">
                VWAP {vwap.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </text>
              {/* Price label at right */}
              {last != null && (() => {
                const lastSeg = segments[segments.length - 1];
                const lp = lastSeg[lastSeg.length - 1];
                return (
                  <text x={W - 2} y={lp.y - 2} fontSize={6.5} fill={ac}
                    fontFamily="monospace" textAnchor="end">
                    {last.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </text>
                );
              })()}
            </svg>
          ) : (
            <div className="w-full text-center text-[9px] animate-pulse" style={{ color: muted }}>
              Stock select karo VWAP dekhne ke liye
            </div>
          )}
        </div>

        {/* ─ OI Strike Chart ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col justify-center px-3 overflow-hidden">
          {strikes.length > 0 ? (
            <div className="space-y-1">
              {/* Key levels strip */}
              <div className="flex items-center gap-3 mb-1.5">
                {[
                  { lbl: 'Call Wall', val: oiData?.call_wall, col: '#ef4444' },
                  { lbl: 'Put Wall',  val: oiData?.put_wall,  col: '#22c55e' },
                  { lbl: 'Max Pain',  val: oiData?.max_pain,  col: '#fbbf24' },
                  { lbl: 'Spot',      val: spot,              col: PURPLE },
                ].map(({ lbl, val, col }) => (
                  <div key={lbl} className="text-center">
                    <div className="text-[6.5px] uppercase" style={{ color: muted }}>{lbl}</div>
                    <div className="text-[8px] font-bold font-mono" style={{ color: col }}>
                      {val ? val.toLocaleString('en-IN') : '—'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bar chart — top 5 strikes */}
              {strikes.slice(0, 5).map((s) => {
                const ceW  = (s.call_oi / maxOI) * 100;
                const peW  = (s.put_oi  / maxOI) * 100;
                const isAt = spot && Math.abs(s.strike - spot) < 75;
                return (
                  <div key={s.strike} className="flex items-center gap-1.5">
                    {/* Put OI (left, mirrored) */}
                    <div className="flex-1 flex justify-end">
                      <div className="h-2.5 rounded-sm transition-all"
                        style={{ width: `${peW}%`, background: '#22c55e', opacity: 0.75 }} />
                    </div>
                    {/* Strike label */}
                    <div className="shrink-0 text-center"
                      style={{ width: 38 }}>
                      <span className="text-[7px] font-bold font-mono"
                        style={{ color: isAt ? PURPLE : text2 }}>
                        {isAt ? '▸ ' : ''}{(s.strike / 1000).toFixed(1)}K
                      </span>
                    </div>
                    {/* Call OI (right) */}
                    <div className="flex-1">
                      <div className="h-2.5 rounded-sm transition-all"
                        style={{ width: `${ceW}%`, background: '#ef4444', opacity: 0.75 }} />
                    </div>
                  </div>
                );
              })}

              {/* Legend */}
              <div className="flex items-center gap-3 pt-0.5">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-1 rounded-sm bg-green-500 opacity-75" />
                  <span className="text-[6.5px]" style={{ color: muted }}>Put OI</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-1 rounded-sm bg-red-500 opacity-75" />
                  <span className="text-[6.5px]" style={{ color: muted }}>Call OI</span>
                </div>
                <span className="text-[6.5px] ml-auto" style={{ color: muted }}>
                  Total CE: {fmtN(oiData.total_call_oi)} · PE: {fmtN(oiData.total_put_oi)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center text-[9px] animate-pulse" style={{ color: muted }}>
              {oiLoad ? '⟳ OI data load ho raha hai…' : 'OI data unavailable'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
