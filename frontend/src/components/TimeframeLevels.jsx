import { useEffect, useRef, useState, useCallback } from 'react';

const TIMEFRAMES = [
  { name: '4Y High', period: 252 * 4, type: 'high', color: '#22c55e', style: 2 },
  { name: '4Y Low',  period: 252 * 4, type: 'low',  color: '#22c55e', style: 2 },
  { name: '1Y High', period: 252,     type: 'high', color: '#eab308', style: 2 },
  { name: '1Y Low',  period: 252,     type: 'low',  color: '#eab308', style: 2 },
  { name: '6M High', period: 120,     type: 'high', color: '#a855f7', style: 2 },
  { name: '6M Low',  period: 120,     type: 'low',  color: '#a855f7', style: 2 },
  { name: '30D High',period: 30,      type: 'high', color: '#f97316', style: 2 },
  { name: '30D Low', period: 30,      type: 'low',  color: '#f97316', style: 2 },
  { name: '1W High', period: 5,       type: 'high', color: '#06b6d4', style: 2 },
  { name: '1W Low',  period: 5,       type: 'low',  color: '#06b6d4', style: 2 },
  { name: '4H High', period: 16,      type: 'high', color: '#ef4444', style: 0 },
  { name: '4H Low',  period: 16,      type: 'low',  color: '#ef4444', style: 0 },
  { name: '1H High', period: 4,       type: 'high', color: '#f59e0b', style: 0 },
  { name: '1H Low',  period: 4,       type: 'low',  color: '#f59e0b', style: 0 },
  { name: '30M High',period: 2,       type: 'high', color: '#84cc16', style: 0 },
  { name: '30M Low', period: 2,       type: 'low',  color: '#84cc16', style: 0 },
];

const calcHighLow = (bars, n) => {
  if (!bars || bars.length === 0) return { high: 0, low: 0 };
  const slice = bars.slice(-Math.min(n, bars.length));
  return {
    high: Math.max(...slice.map(b => b.high)),
    low:  Math.min(...slice.map(b => b.low)),
  };
};

// ── S/R Stats: Retests / Breakouts / Held ─────────────────────────
function computeSRStats(bars, levelPrice, tol, isSupport) {
  let retests = 0, breakouts = 0;
  const n = bars.length;
  let i = 0;
  while (i < n) {
    const b = bars[i];
    const touches = b.low <= levelPrice + tol && b.high >= levelPrice - tol;
    if (touches) {
      retests++;
      let broke = false;
      for (let j = i; j < Math.min(i + 4, n); j++) {
        if (isSupport  && bars[j].close < levelPrice - tol * 0.5) { broke = true; break; }
        if (!isSupport && bars[j].close > levelPrice + tol * 0.5) { broke = true; break; }
      }
      if (broke) breakouts++;
      while (i < n && bars[i].low <= levelPrice + tol && bars[i].high >= levelPrice - tol) i++;
    } else { i++; }
  }
  const held = Math.max(0, retests - breakouts);
  const pct  = retests > 0 ? Math.round((held / retests) * 100) : 0;
  return { retests, breakouts, held, pct };
}

const BADGE_H      = 15;
const RIGHT_OFFSET = 74;

const TimeframeLevels = ({ series, chart, bars, containerRef }) => {
  const priceLinesRef  = useRef([]);
  const levelsRef      = useRef([]);
  const rafRef         = useRef(null);
  const canvasRef      = useRef(null);
  const statsRafRef    = useRef(null);
  const [badges, setBadges] = useState([]);

  /* ── clear old price lines ── */
  const clearLines = useCallback((s) => {
    priceLinesRef.current.forEach(pl => {
      try { if (s && pl) s.removePriceLine(pl); } catch (_) {}
    });
    priceLinesRef.current = [];
  }, []);

  /* ── recompute badge y-coords ── */
  const recompute = useCallback((s) => {
    if (!s || levelsRef.current.length === 0) return;
    const raw = levelsRef.current.map(lv => {
      let y = null;
      try { y = s.priceToCoordinate(lv.price); } catch (_) {}
      return { ...lv, y };
    }).filter(lv => lv.y !== null && lv.y > 5);

    raw.sort((a, b) => a.y - b.y);
    for (let i = 1; i < raw.length; i++) {
      if (raw[i].y - raw[i - 1].y < BADGE_H) raw[i].y = raw[i - 1].y + BADGE_H;
    }
    setBadges(raw);
  }, []);

  /* ── draw stats text on canvas ── */
  const drawStatsCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const s = series;
    const lvs = levelsRef.current;
    if (!canvas || !s || !lvs.length) return;

    const el   = canvas.parentElement;
    if (!el) return;
    const W    = el.clientWidth;
    const H    = el.clientHeight;
    const dpr  = window.devicePixelRatio || 1;

    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width        = Math.round(W * dpr);
      canvas.height       = Math.round(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const toY = p => { try { return s.priceToCoordinate(p); } catch { return null; } };
    const PRICE_SCALE_W = 68;
    const centerX = (W - PRICE_SCALE_W) / 2;

    ctx.font      = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.imageSmoothingEnabled = false;

    const cx = Math.round((W - PRICE_SCALE_W) / 2);

    lvs.forEach(lv => {
      if (!lv.stats) return;
      const yRaw = toY(lv.price);
      if (yRaw == null || yRaw < 8 || yRaw > H - 8) return;
      const { retests, breakouts, held, pct } = lv.stats;
      const text = `Retests: ${retests} · Breakouts: ${breakouts} · Held: ${held} (${pct}%)`;
      ctx.fillStyle = lv.color;
      ctx.fillText(text, cx, Math.round(yRaw) - 3);
    });

    ctx.restore();
  }, [series]);

  /* ── start stats rAF loop ── */
  const startStatsLoop = useCallback(() => {
    const loop = () => { drawStatsCanvas(); statsRafRef.current = requestAnimationFrame(loop); };
    statsRafRef.current = requestAnimationFrame(loop);
  }, [drawStatsCanvas]);

  /* ── create / recreate price lines when bars changes ── */
  useEffect(() => {
    const s = series;
    if (!s || !bars || bars.length === 0) {
      clearLines(s);
      levelsRef.current = [];
      setBadges([]);
      return;
    }

    clearLines(s);
    const computed = [];
    const priceRange = Math.max(...bars.map(b => b.high)) - Math.min(...bars.map(b => b.low));
    const tol = Math.max(priceRange * 0.007, 0.5);

    TIMEFRAMES.forEach(tf => {
      try {
        const { high, low } = calcHighLow(bars, tf.period);
        const price   = tf.type === 'high' ? high : low;
        const isLow   = tf.type === 'low';
        if (price > 0) {
          const pl = s.createPriceLine({
            price,
            color:            tf.color,
            lineWidth:        1.5,
            lineStyle:        tf.style,
            axisLabelVisible: false,
            title:            '',
          });
          priceLinesRef.current.push(pl);
          const stats = computeSRStats(bars, price, tol, isLow);
          computed.push({ name: tf.name, price, color: tf.color, stats });
        }
      } catch (_) {}
    });

    levelsRef.current = computed;
    const t = setTimeout(() => recompute(s), 200);
    return () => { clearTimeout(t); clearLines(s); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, bars]);

  /* ── chart scroll/zoom subscription ── */
  useEffect(() => {
    if (!chart || !series) return;
    let stopRaf = null;
    const onInteract = () => {
      if (stopRaf) stopRaf();
      let count = 0;
      const burst = () => {
        recompute(series);
        count++;
        if (count < 90) rafRef.current = requestAnimationFrame(burst);
        else stopRaf = null;
      };
      rafRef.current = requestAnimationFrame(burst);
      stopRaf = () => { cancelAnimationFrame(rafRef.current); rafRef.current = null; };
    };
    try { chart.timeScale().subscribeVisibleLogicalRangeChange(onInteract); } catch (_) {}
    try { chart.priceScale('right').subscribeVisiblePriceRangeChange(onInteract); } catch (_) {}
    return () => {
      if (stopRaf) stopRaf();
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onInteract); } catch (_) {}
      try { chart.priceScale('right').unsubscribeVisiblePriceRangeChange(onInteract); } catch (_) {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, series, recompute]);

  /* ── stats canvas rAF loop ── */
  useEffect(() => {
    if (statsRafRef.current) cancelAnimationFrame(statsRafRef.current);
    if (!series || !bars?.length) return;
    startStatsLoop();
    return () => { if (statsRafRef.current) cancelAnimationFrame(statsRafRef.current); };
  }, [series, bars, startStatsLoop]);

  /* ── render ── */
  return (
    <>
      {/* Stats text canvas — sits over chart, draws Retests/Breakouts/Held */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', left: 0, top: 0,
          zIndex: 5, pointerEvents: 'none',
        }}
      />

      {/* Right-side colored name + price badges */}
      {badges.map(b => (
        <div
          key={b.name}
          style={{
            position: 'absolute', right: RIGHT_OFFSET, top: b.y,
            transform: 'translateY(-50%)', zIndex: 6,
            pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 2,
          }}
        >
          <div style={{
            background: b.color, color: '#fff',
            fontSize: 7, fontFamily: 'monospace', fontWeight: 700,
            padding: '1px 3px', borderRadius: 2, lineHeight: '11px', whiteSpace: 'nowrap',
            opacity: 0.95,
          }}>
            {b.name}
          </div>
          <div style={{
            background: 'rgba(10,10,10,0.85)', color: b.color,
            fontSize: 7, fontFamily: 'monospace', fontWeight: 700,
            padding: '1px 3px', borderRadius: 2, lineHeight: '11px', whiteSpace: 'nowrap',
            border: `1px solid ${b.color}44`,
          }}>
            {b.price.toFixed(2)}
          </div>
        </div>
      ))}
    </>
  );
};

export default TimeframeLevels;
