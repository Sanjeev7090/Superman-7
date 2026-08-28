import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { createChart } from 'lightweight-charts';
import { ChartLine, TrendUp, TrendDown, PencilLine, Trash, Lightning, ArrowsOut, ArrowsIn, ArrowClockwise, ArrowUp, ArrowDown, Minus as MinusIco } from '@phosphor-icons/react';
import GrowwTradeModal from './GrowwTradeModal';
import StrategyOverlay from './StrategyOverlay';
import TimeframeLevels from './TimeframeLevels';
import VWAPFlipMini from './VWAPFlipMini';
import { useTheme } from '../context/ThemeContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── OI Panel — rendered inside ChartPanel toolbar popup ──────────────
function fmtOI(n) {
  if (!n || n === 0) return '—';
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  return n.toLocaleString('en-IN');
}

function OIPanel({ data, loading, isDark, onRefresh, oiLinesOn, onToggleLines }) {
  const C = {
    bg:     isDark ? '#111117' : '#fff',
    card:   isDark ? '#18181e' : '#f8fafc',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:   isDark ? '#f1f5f9' : '#0f172a',
    muted:  isDark ? '#64748b' : '#94a3b8',
    sub:    isDark ? '#94a3b8' : '#64748b',
  };
  const SigIco = !data ? MinusIco : (
    data.signal?.includes('BULLISH') || data.signal?.includes('COVERING') ? ArrowUp
    : data.signal?.includes('BEARISH') || data.signal?.includes('UNWINDING') ? ArrowDown
    : MinusIco
  );

  return (
    <div style={{ fontSize: 11, color: C.text }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
        background: isDark ? '#141418' : '#f1f5f9',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SigIco size={13} color={data?.signal_color || '#94a3b8'} weight="bold" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em' }}>OI INDICATOR</span>
          <span style={{
            fontSize: 8, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
            background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
          }}>NIFTY 50</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onToggleLines && (
            <button
              onClick={onToggleLines}
              title="Toggle chart lines"
              style={{
                fontSize: 8, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                background: oiLinesOn ? 'rgba(167,139,250,0.2)' : 'transparent',
                color:  oiLinesOn ? '#a78bfa' : C.muted,
                border: `1px solid ${oiLinesOn ? '#a78bfa50' : C.border}`,
                cursor: 'pointer',
              }}
              data-testid="oi-toggle-lines"
            >
              {oiLinesOn ? 'Lines ON' : 'Lines OFF'}
            </button>
          )}
          <button onClick={onRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: loading ? 0.4 : 0.7, padding: 2 }}>
            <ArrowClockwise size={12} color={C.sub} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid #27272a', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : !data ? (
        <div style={{ padding: 20, textAlign: 'center', color: C.muted }}>Data unavailable</div>
      ) : (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Signal */}
          <div style={{
            padding: '8px 10px', borderRadius: 8,
            background: `${data.signal_color}12`, border: `1px solid ${data.signal_color}35`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: data.signal_color }}>{data.signal}</div>
                <div style={{ fontSize: 9, color: C.sub, marginTop: 2 }}>{data.signal_desc}</div>
              </div>
              {data.spot_price > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: C.text }}>
                    {data.spot_price.toLocaleString('en-IN')}
                  </div>
                  {data.price_pct !== 0 && (
                    <div style={{ fontSize: 9, fontFamily: 'monospace', color: data.price_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                      {data.price_pct >= 0 ? '+' : ''}{data.price_pct}%
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* PCR + Max Pain + Put OI row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {[
              { label: 'PCR',      val: data.pcr?.toFixed(3), sub: data.pcr_zone, subColor: data.pcr_zone_color },
              { label: 'Max Pain', val: data.max_pain?.toLocaleString('en-IN'), sub: 'Expiry target' },
              { label: 'Put OI',   val: fmtOI(data.total_put_oi), sub: 'Total', subColor: '#22c55e' },
            ].map(({ label, val, sub, subColor }) => (
              <div key={label} style={{ padding: '6px 8px', borderRadius: 7, background: C.card, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace', color: C.text }}>{val || '—'}</div>
                {sub && <div style={{ fontSize: 7, fontWeight: 700, marginTop: 2, color: subColor || C.muted }}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* Call Wall / Put Wall */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Call Wall',  val: data.call_wall, note: 'Resistance', color: '#ef4444' },
              { label: 'Put Wall',   val: data.put_wall,  note: 'Support',    color: '#22c55e' },
            ].map(({ label, val, note, color }) => (
              <div key={label} style={{
                padding: '8px 10px', borderRadius: 7, textAlign: 'center',
                background: `${color}08`, border: `1px solid ${color}25`,
              }}>
                <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color }}>{val ? val.toLocaleString('en-IN') : '—'}</div>
                <div style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{note}</div>
              </div>
            ))}
          </div>

          {/* Strike OI mini bars */}
          {data.top_strikes?.length > 0 && (
            <div>
              <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 5, fontWeight: 700 }}>
                Strike-wise OI
              </div>
              {data.top_strikes.sort((a, b) => a.strike - b.strike).map(row => {
                const maxV = Math.max(...data.top_strikes.map(r => Math.max(r.call_oi, r.put_oi)));
                const cPct = maxV > 0 ? (row.call_oi / maxV * 100) : 0;
                const pPct = maxV > 0 ? (row.put_oi  / maxV * 100) : 0;
                const isSpot = data.spot_price > 0 && Math.abs(row.strike - data.spot_price) < 75;
                return (
                  <div key={row.strike} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 44, fontSize: 8, fontFamily: 'monospace', textAlign: 'right', color: isSpot ? '#a78bfa' : C.sub, fontWeight: isSpot ? 800 : 400 }}>
                      {row.strike.toLocaleString('en-IN')}{isSpot ? '●' : ''}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                        <div style={{ width: `${Math.max(cPct, 2)}%`, height: 4, background: '#ef4444', borderRadius: 2, minWidth: 4 }} />
                        <span style={{ fontSize: 7, color: '#ef4444', fontFamily: 'monospace' }}>{fmtOI(row.call_oi)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: `${Math.max(pPct, 2)}%`, height: 4, background: '#22c55e', borderRadius: 2, minWidth: 4 }} />
                        <span style={{ fontSize: 7, color: '#22c55e', fontFamily: 'monospace' }}>{fmtOI(row.put_oi)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {[['#ef4444','Call OI (Resistance)'],['#22c55e','Put OI (Support)']].map(([c,l]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 4, background: c, borderRadius: 2 }} />
                    <span style={{ fontSize: 8, color: C.sub }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PCR guide */}
          <div style={{ fontSize: 8, color: C.muted, padding: '4px 8px', borderRadius: 6, background: C.card, border: `1px solid ${C.border}` }}>
            PCR &lt;0.7 = Overbought · PCR &gt;1.3 = Oversold · {data.pcr_zone && <span style={{ color: data.pcr_zone_color, fontWeight: 700 }}>{data.pcr_zone}</span>}
          </div>

          {data.updated_at && (
            <div style={{ fontSize: 8, color: C.muted, textAlign: 'right' }}>
              {new Date(data.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
            </div>
          )}
        </div>
      )}
    </div>
  );
}
const VP_WIDTH  = 100;   // 84px bars + 6px gap + 10px heatmap
const VP_BARS_W = 84;    // actual bar area width
const HEAT_X    = 90;    // heatmap column start
const HEAT_W    = 10;    // heatmap column width

const fmtVol = n => {
  if (!n && n !== 0) return '0';
  const v = Math.abs(n);
  if (v > 1e7) return `${(n/1e7).toFixed(1)}Cr`;
  if (v > 1e5) return `${(n/1e5).toFixed(1)}L`;
  if (v > 1e3) return `${(n/1e3).toFixed(1)}K`;
  return Number(n).toFixed(0);
};

// ── SMC Timeframe: resample bars to a higher target timeframe ─────
// If current bars are coarser than target, returns bars as-is.
function resampleBars(bars, targetMinutes) {
  if (!bars || !bars.length || !targetMinutes) return bars || [];
  const ms = targetMinutes * 60 * 1000;
  const out = [];
  let bucket = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const bStart = Math.floor(b.timestamp / ms) * ms;
    if (!bucket || bucket.timestamp !== bStart) {
      if (bucket) out.push(bucket);
      bucket = {
        timestamp: bStart,
        open:  b.open,
        high:  b.high,
        low:   b.low,
        close: b.close,
        volume: b.volume || 0,
      };
    } else {
      bucket.high   = Math.max(bucket.high, b.high);
      bucket.low    = Math.min(bucket.low,  b.low);
      bucket.close  = b.close;
      bucket.volume = (bucket.volume || 0) + (b.volume || 0);
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

// SMC Timeframe options (label → minutes; null = AUTO/current chart TF)
const SMC_TF_OPTIONS = [
  { label: 'AUTO', minutes: null },
  { label: '1D',   minutes: 1440 },
  { label: '4H',   minutes: 240  },
  { label: '1H',   minutes: 60   },
  { label: '15M',  minutes: 15   },
  { label: '5M',   minutes: 5    },
  { label: '3M',   minutes: 3    },
];

// ── SMC Role-based feature map per timeframe ──────────────────────
// Defines which SMC features are surfaced from each TF layer.
//   4H  → direction (BOS/CHOCH), key levels (PD zone), supply, demand
//   1H  → BOS, order blocks, FVG, liquidity (swings)
//   15M → reversal (manipulations) + confirmation (refinedEntries + wyckoff phases)
// Layers not listed (AUTO/1D/5M/3M) show every feature (manual user picks).
const SMC_TF_FEATURE_MAP = {
  '4H':  new Set(['supplyZones', 'demandZones', 'bosChoch', 'pdZone']),
  '1H':  new Set(['bosChoch', 'obs', 'fvgs', 'swings']),
  '15M': new Set(['manipulations', 'refinedEntries', 'wyckoffPhases']),
};

// ── Candlestick Pattern Detection ─────────────────────────────────
// Detects classical Japanese candlestick patterns and tags each bar so the
// chart can color-code candles:
//   YELLOW → Bullish reversal (Hammer / Inverted Hammer / Bull Engulfing / Morning Star / Piercing Line)
//   ORANGE → Bearish reversal (Bearish Engulfing / Evening Star / Dark Cloud Cover)
//   BLUE   → Continuation    (Marubozu / Three White Soldiers / Three Black Crows)
const PATTERN_COLORS = {
  'bullish-reversal': '#FBBF24', // yellow-400
  'bearish-reversal': '#EC4899', // pink-500
  'continuation':     '#3B82F6', // blue-500
};
function detectCandlePatterns(bars) {
  const n = bars ? bars.length : 0;
  const tags = new Array(n).fill(null);
  if (n < 3) return tags;

  const body   = b => Math.abs(b.close - b.open);
  const upW    = b => b.high - Math.max(b.open, b.close);
  const lowW   = b => Math.min(b.open, b.close) - b.low;
  const range  = b => b.high - b.low;
  const isBull = b => b.close > b.open;
  const isBear = b => b.close < b.open;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const r = range(b);
    if (r <= 0) continue;
    const bod = body(b);
    const uw  = upW(b);
    const lw  = lowW(b);

    // ── Single-candle patterns ──
    // Marubozu — very small wicks on both sides, huge body (continuation)
    if (bod >= 0.9 * r) {
      tags[i] = { name: isBull(b) ? 'Marubozu (Bull)' : 'Marubozu (Bear)', category: 'continuation' };
    }

    // Small-body candles with directional wicks
    if (bod > 0 && bod <= r * 0.4) {
      // Hammer — long lower wick, tiny upper wick → bullish reversal
      if (lw >= 2 * bod && uw <= bod) {
        tags[i] = { name: 'Hammer', category: 'bullish-reversal' };
      }
      // Inverted Hammer — long upper wick, tiny lower wick (downtrend context only)
      if (uw >= 2 * bod && lw <= bod) {
        const uptrend = i >= 3 && bars[i - 1].close > bars[i - 3].close;
        if (!uptrend) {
          tags[i] = { name: 'Inverted Hammer', category: 'bullish-reversal' };
        }
      }
    }

    // ── Two-candle patterns ──
    if (i >= 1) {
      const p = bars[i - 1];
      const pBod = body(p);

      // Bullish Engulfing
      if (isBear(p) && isBull(b) && b.close >= p.open && b.open <= p.close && bod > pBod) {
        tags[i] = { name: 'Bullish Engulfing', category: 'bullish-reversal' };
      }
      // Bearish Engulfing
      if (isBull(p) && isBear(b) && b.open >= p.close && b.close <= p.open && bod > pBod) {
        tags[i] = { name: 'Bearish Engulfing', category: 'bearish-reversal' };
      }
      // Piercing Line — prev bear, cur bull opens below prev.close, closes above prev midpoint (below prev.open)
      if (isBear(p) && isBull(b) && b.open < p.close && b.close > (p.open + p.close) / 2 && b.close < p.open) {
        tags[i] = { name: 'Piercing Line', category: 'bullish-reversal' };
      }
      // Dark Cloud Cover — prev bull, cur bear opens above prev.close, closes below prev midpoint (above prev.open)
      if (isBull(p) && isBear(b) && b.open > p.close && b.close < (p.open + p.close) / 2 && b.close > p.open) {
        tags[i] = { name: 'Dark Cloud Cover', category: 'bearish-reversal' };
      }
    }

    // ── Three-candle patterns ──
    if (i >= 2) {
      const c1 = bars[i - 2], c2 = bars[i - 1], c3 = b;
      const c1Bod = body(c1), c2Bod = body(c2);
      const c1Range = range(c1);

      // Morning Star — bear long, small body, bull closing above midpoint of c1
      if (isBear(c1) && c1Range > 0 && c1Bod > c1Range * 0.5 &&
          c2Bod < c1Bod * 0.5 && isBull(c3) &&
          c3.close > (c1.open + c1.close) / 2) {
        tags[i] = { name: 'Morning Star', category: 'bullish-reversal' };
      }
      // Evening Star — bull long, small body, bear closing below midpoint of c1
      if (isBull(c1) && c1Range > 0 && c1Bod > c1Range * 0.5 &&
          c2Bod < c1Bod * 0.5 && isBear(c3) &&
          c3.close < (c1.open + c1.close) / 2) {
        tags[i] = { name: 'Evening Star', category: 'bearish-reversal' };
      }
      // Three White Soldiers — 3 consecutive bulls, each opening in prev body, each closing higher
      if (isBull(c1) && isBull(c2) && isBull(c3) &&
          c2.close > c1.close && c3.close > c2.close &&
          c2.open > c1.open && c2.open < c1.close &&
          c3.open > c2.open && c3.open < c2.close) {
        tags[i] = { name: 'Three White Soldiers', category: 'continuation' };
      }
      // Three Black Crows — 3 consecutive bears, each opening in prev body, each closing lower
      if (isBear(c1) && isBear(c2) && isBear(c3) &&
          c2.close < c1.close && c3.close < c2.close &&
          c2.open < c1.open && c2.open > c1.close &&
          c3.open < c2.open && c3.open > c2.close) {
        tags[i] = { name: 'Three Black Crows', category: 'continuation' };
      }
    }
  }

  return tags;
}

// Default auto-marked layers when a new stock is selected.
const SMC_AUTO_DEFAULT_LAYERS = ['4H', '1H', '15M'];

// ── EMA helpers ────────────────────────────────────────────────────
// EMA = Exponential Moving Average. Period 9 = fast (lower-TF candle avg),
// Period 21 = slow (higher-TF candle avg). Crossovers generate BUY/SELL signals.
const EMA_FAST_COLOR = '#22D3EE'; // cyan — 9 EMA
const EMA_SLOW_COLOR = '#F59E0B'; // amber — 21 EMA
function computeEMA(values, period) {
  if (!values || values.length < period) return new Array(values?.length || 0).fill(null);
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * k + ema;
    out[i] = ema;
  }
  return out;
}
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
// Find the most recent EMA crossover within the last `lookback` bars.
// Returns { type:'BUY'|'SELL', time, price, barsAgo } or null.
function detectEmaCross(bars, ema9, ema21, lookback = 5) {
  const n = bars.length;
  for (let i = n - 1; i > Math.max(0, n - lookback - 1); i--) {
    const prev9 = ema9[i - 1], prev21 = ema21[i - 1];
    const cur9 = ema9[i], cur21 = ema21[i];
    if (prev9 == null || prev21 == null || cur9 == null || cur21 == null) continue;
    if (prev9 <= prev21 && cur9 > cur21) {
      return { type: 'BUY', time: bars[i].timestamp / 1000, price: bars[i].close, barsAgo: n - 1 - i };
    }
    if (prev9 >= prev21 && cur9 < cur21) {
      return { type: 'SELL', time: bars[i].timestamp / 1000, price: bars[i].close, barsAgo: n - 1 - i };
    }
  }
  return null;
}

// ── Auto Trendline Detection ─────────────────────────────────────────────────
// Types: Uptrend Support, Downtrend Resistance, H-Support, H-Resistance,
//        Ascending/Descending Channel, Fibonacci Retracement
function detectTrendlines(bars) {
  if (!bars || bars.length < 20) return [];
  const n = bars.length;
  const W = Math.max(3, Math.floor(n / 25));   // adaptive pivot window
  const allHighs = [], allLows = [];

  for (let i = W; i < n - W; i++) {
    let ph = true, pl = true;
    for (let j = i - W; j <= i + W; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) ph = false;
      if (bars[j].low  <= bars[i].low)  pl = false;
    }
    if (ph) allHighs.push({ i, price: bars[i].high, ts: bars[i].timestamp / 1000 });
    if (pl) allLows.push({  i, price: bars[i].low,  ts: bars[i].timestamp / 1000 });
  }
  if (allHighs.length < 2 && allLows.length < 2) return [];

  const priceRange = Math.max(...bars.map(b => b.high)) - Math.min(...bars.map(b => b.low));
  if (priceRange <= 0) return [];
  const touchTol = priceRange * 0.007;
  const lastTs   = bars[n - 1].timestamp / 1000;
  const firstTs  = bars[0].timestamp / 1000;

  function countTouches(startI, startP, slope, useHigh) {
    let cnt = 0;
    for (let k = startI; k < n; k++) {
      const proj = startP + slope * (k - startI);
      const barP = useHigh ? bars[k].high : bars[k].low;
      if (Math.abs(barP - proj) <= touchTol) cnt++;
    }
    return cnt;
  }
  function extEnd(si, sp, slope) { return sp + slope * (n - 1 - si); }

  const result = [];

  // ── 1. Uptrend Support (rising lows) ──
  for (let a = 0; a < allLows.length - 1; a++) {
    let best = null, bestScore = 1;
    for (let b = a + 1; b < allLows.length; b++) {
      const p1 = allLows[a], p2 = allLows[b];
      if (p2.price <= p1.price * 1.001) continue;
      if (p2.i - p1.i < 4) continue;
      const slope = (p2.price - p1.price) / (p2.i - p1.i);
      if (Math.abs(slope) > priceRange / n * 5) continue;
      let broken = false;
      for (let k = p1.i + 1; k < p2.i; k++) {
        if (bars[k].low < p1.price + slope * (k - p1.i) - touchTol * 2) { broken = true; break; }
      }
      if (broken) continue;
      const t = countTouches(p1.i, p1.price, slope, false);
      if (t > bestScore) { bestScore = t; best = { p1, slope }; }
    }
    if (best) {
      result.push({ type: 'uptrend', label: 'Uptrend Support', color: '#00E676',
        lineStyle: 0, lineWidth: 2,
        startTs: best.p1.ts, startPrice: best.p1.price,
        endTs: lastTs, endPrice: Math.max(0.01, extEnd(best.p1.i, best.p1.price, best.slope)),
        touches: bestScore });
    }
  }

  // ── 2. Downtrend Resistance (falling highs) ──
  for (let a = 0; a < allHighs.length - 1; a++) {
    let best = null, bestScore = 1;
    for (let b = a + 1; b < allHighs.length; b++) {
      const p1 = allHighs[a], p2 = allHighs[b];
      if (p2.price >= p1.price * 0.999) continue;
      if (p2.i - p1.i < 4) continue;
      const slope = (p2.price - p1.price) / (p2.i - p1.i);
      if (Math.abs(slope) > priceRange / n * 5) continue;
      let broken = false;
      for (let k = p1.i + 1; k < p2.i; k++) {
        if (bars[k].high > p1.price + slope * (k - p1.i) + touchTol * 2) { broken = true; break; }
      }
      if (broken) continue;
      const t = countTouches(p1.i, p1.price, slope, true);
      if (t > bestScore) { bestScore = t; best = { p1, slope }; }
    }
    if (best) {
      result.push({ type: 'downtrend', label: 'Downtrend Resistance', color: '#FF4757',
        lineStyle: 0, lineWidth: 2,
        startTs: best.p1.ts, startPrice: best.p1.price,
        endTs: lastTs, endPrice: Math.max(0.01, extEnd(best.p1.i, best.p1.price, best.slope)),
        touches: bestScore });
    }
  }

  // ── 3. Horizontal Support (clustered pivot lows) ──
  const lowBuckets = new Map();
  allLows.forEach(p => {
    const key = Math.round(p.price / (priceRange * 0.008));
    if (!lowBuckets.has(key)) lowBuckets.set(key, []);
    lowBuckets.get(key).push(p);
  });
  lowBuckets.forEach(group => {
    if (group.length < 2) return;
    const avg = group.reduce((s, p) => s + p.price, 0) / group.length;
    const stats = computeSRStats(bars, avg, touchTol, true);
    result.push({ type: 'h_support', label: `Support ×${group.length}`, color: '#3B82F6',
      lineStyle: 2, lineWidth: 1, startTs: firstTs, startPrice: avg,
      endTs: lastTs, endPrice: avg, touches: group.length, stats });
  });

  // ── 4. Horizontal Resistance (clustered pivot highs) ──
  const highBuckets = new Map();
  allHighs.forEach(p => {
    const key = Math.round(p.price / (priceRange * 0.008));
    if (!highBuckets.has(key)) highBuckets.set(key, []);
    highBuckets.get(key).push(p);
  });
  highBuckets.forEach(group => {
    if (group.length < 2) return;
    const avg = group.reduce((s, p) => s + p.price, 0) / group.length;
    const stats = computeSRStats(bars, avg, touchTol, false);
    result.push({ type: 'h_resistance', label: `Resistance ×${group.length}`, color: '#FF6B00',
      lineStyle: 2, lineWidth: 1, startTs: firstTs, startPrice: avg,
      endTs: lastTs, endPrice: avg, touches: group.length, stats });
  });

  // ── 5. Channel Lines (parallel to uptrend/downtrend) ──
  result.filter(l => l.type === 'uptrend').slice(0, 2).forEach(tl => {
    const si = bars.findIndex(b => b.timestamp / 1000 >= tl.startTs);
    if (si === -1) return;
    const slope = (n - 1 - si) > 0 ? (tl.endPrice - tl.startPrice) / (n - 1 - si) : 0;
    let maxOff = 0;
    for (let k = si; k < n; k++) {
      const off = bars[k].high - (tl.startPrice + slope * (k - si));
      if (off > maxOff) maxOff = off;
    }
    if (maxOff > touchTol) {
      result.push({ type: 'channel_up', label: 'Channel High', color: '#06B6D4',
        lineStyle: 3, lineWidth: 1,
        startTs: tl.startTs, startPrice: tl.startPrice + maxOff,
        endTs: tl.endTs,     endPrice: tl.endPrice + maxOff, touches: 1 });
    }
  });
  result.filter(l => l.type === 'downtrend').slice(0, 2).forEach(tl => {
    const si = bars.findIndex(b => b.timestamp / 1000 >= tl.startTs);
    if (si === -1) return;
    const slope = (n - 1 - si) > 0 ? (tl.endPrice - tl.startPrice) / (n - 1 - si) : 0;
    let maxOff = 0;
    for (let k = si; k < n; k++) {
      const off = (tl.startPrice + slope * (k - si)) - bars[k].low;
      if (off > maxOff) maxOff = off;
    }
    if (maxOff > touchTol) {
      result.push({ type: 'channel_down', label: 'Channel Low', color: '#EC4899',
        lineStyle: 3, lineWidth: 1,
        startTs: tl.startTs, startPrice: tl.startPrice - maxOff,
        endTs: tl.endTs,     endPrice: tl.endPrice - maxOff, touches: 1 });
    }
  });

  // ── 6. Fibonacci Retracement (last 150 bars swing) ──
  const recentBars = bars.slice(Math.max(0, n - 150));
  const swH = Math.max(...recentBars.map(b => b.high));
  const swL = Math.min(...recentBars.map(b => b.low));
  const fibR = swH - swL;
  if (fibR > priceRange * 0.05) {
    [
      { level: 0.236, color: '#C084FC', label: 'Fib 23.6%' },
      { level: 0.382, color: '#A78BFA', label: 'Fib 38.2%' },
      { level: 0.500, color: '#818CF8', label: 'Fib 50.0%' },
      { level: 0.618, color: '#6366F1', label: 'Fib 61.8%' },
      { level: 0.786, color: '#4F46E5', label: 'Fib 78.6%' },
    ].forEach(f => {
      const price = swL + fibR * (1 - f.level);
      const stats = computeSRStats(bars, price, touchTol, price < (swH + swL) / 2);
      result.push({ type: 'fibonacci', label: f.label, color: f.color,
        lineStyle: 1, lineWidth: 1, startTs: firstTs, startPrice: price,
        endTs: lastTs, endPrice: price, touches: 0, stats });
    });
  }

  // Limit per type (avoid chart clutter)
  const typeCount = {};
  const MAX_PER_TYPE = { h_support: 3, h_resistance: 3, uptrend: 3, downtrend: 3,
    fibonacci: 5, channel_up: 2, channel_down: 2 };
  return result.filter(l => {
    typeCount[l.type] = (typeCount[l.type] ?? 0) + 1;
    return typeCount[l.type] <= (MAX_PER_TYPE[l.type] ?? 3);
  });
}

// ── S/R Level Statistics: Retests / Breakouts / Held ────────────────────────
// isSupportLevel=true  → breakout = close below level
// isSupportLevel=false → breakout = close above level
function computeSRStats(bars, levelPrice, tol, isSupportLevel) {
  let retests = 0, breakouts = 0;
  const n = bars.length;
  let i = 0;
  while (i < n) {
    const b = bars[i];
    const touches = b.low <= levelPrice + tol && b.high >= levelPrice - tol;
    if (touches) {
      retests++;
      // Confirm break: look ahead 1-3 bars for close beyond level
      let broke = false;
      for (let j = i; j < Math.min(i + 4, n); j++) {
        if (isSupportLevel  && bars[j].close < levelPrice - tol * 0.5) { broke = true; break; }
        if (!isSupportLevel && bars[j].close > levelPrice + tol * 0.5) { broke = true; break; }
      }
      if (broke) breakouts++;
      // Skip consecutive touching bars
      while (i < n && bars[i].low <= levelPrice + tol && bars[i].high >= levelPrice - tol) i++;
    } else {
      i++;
    }
  }
  const held = Math.max(0, retests - breakouts);
  const pct  = retests > 0 ? Math.round((held / retests) * 100) : 0;
  return { retests, breakouts, held, pct };
}

// ── SMC Auto Mark: compute FVG / Liquidity / Order Blocks ─────────
function computeSMCData(bars) {
  const n = bars.length;
  const empty = { fvgs: [], swings: [], obs: [], bosChoch: [], pdZone: null,
    supplyZones: [], demandZones: [], wyckoffPhases: [], manipulations: [], refinedEntries: [] };
  if (n < 15) return empty;

  // ── ATR-14 (needed for all pattern strength checks) ───────────
  const atrArr = [];
  for (let i = 1; i < n; i++) {
    atrArr.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close)
    ));
  }
  const atr14 = atrArr.length >= 14
    ? atrArr.slice(-14).reduce((a, b) => a + b, 0) / 14
    : (atrArr.reduce((a, b) => a + b, 0) / (atrArr.length || 1));

  // ── FVG detection ─────────────────────────────────────────────
  const fvgs = [];
  const obs  = [];
  for (let i = 2; i < n; i++) {
    // ── BULLISH FVG: gap up — bars[i].low > bars[i-2].high ──────
    if (bars[i].low > bars[i - 2].high) {
      const endIdx = Math.min(i + 20, n - 1);
      let mit = false;
      for (let j = i + 1; j <= endIdx; j++) {
        if (bars[j].low < bars[i].low && bars[j].high > bars[i - 2].high) { mit = true; break; }
      }
      fvgs.push({ type: 'bull', top: bars[i].low, bottom: bars[i - 2].high, mitigated: mit,
        startTime: bars[i - 1].timestamp / 1000, endTime: bars[endIdx].timestamp / 1000 });

      // ── BULLISH OB VALIDATION (images rules) ──────────────────
      // Rule 1: OB candle (bars[i-1]) must be BEARISH (last down candle)
      const obIsBearish = bars[i - 1].close < bars[i - 1].open;
      // Rule 2: LIQUIDITY SWEEP — OB candle must sweep previous candle's LOW
      const liqSweep = i >= 2 && bars[i - 1].low < bars[i - 2].low;
      // Rule 3: FVG already confirmed above (bars[i].low > bars[i-2].high)
      // Additional: strong bullish response (next candle closes above OB high)
      const bullResponse = bars[i].close > bars[i - 1].open;

      if (obIsBearish && liqSweep) {
        // Mitigation: price re-enters OB zone from above
        let obMit = false;
        for (let j = i + 1; j < n; j++) {
          if (bars[j].low < bars[i - 1].high) { obMit = true; break; }
        }
        const obHigh = bars[i - 1].open;  // top of OB body (bearish: open > close)
        const obLow  = bars[i - 1].low;   // wick bottom
        const obBody = bars[i - 1].close; // bottom of OB body
        obs.push({
          type:       'bull',
          high:       obHigh,
          low:        obLow,
          bodyHigh:   obHigh,
          bodyLow:    obBody,
          entry50:    (obHigh + obLow) / 2,
          entryWick:  obLow,
          entryBody:  obBody,
          sl:         obLow - atr14 * 0.5,
          hasLiqSweep: true,
          hasFVG:     true,
          strong:     bullResponse,
          mitigated:  obMit,
          startTime:  bars[i - 1].timestamp / 1000,
          endTime:    bars[Math.min(i + 30, n - 1)].timestamp / 1000,
        });
      }
    }

    // ── BEARISH FVG: gap down — bars[i].high < bars[i-2].low ────
    if (bars[i].high < bars[i - 2].low) {
      const endIdx = Math.min(i + 20, n - 1);
      let mit = false;
      for (let j = i + 1; j <= endIdx; j++) {
        if (bars[j].high > bars[i].high && bars[j].low < bars[i - 2].low) { mit = true; break; }
      }
      fvgs.push({ type: 'bear', top: bars[i - 2].low, bottom: bars[i].high, mitigated: mit,
        startTime: bars[i - 1].timestamp / 1000, endTime: bars[endIdx].timestamp / 1000 });

      // ── BEARISH OB VALIDATION (images rules) ──────────────────
      // Rule 1: OB candle (bars[i-1]) must be BULLISH (last up candle)
      const obIsBullish = bars[i - 1].close > bars[i - 1].open;
      // Rule 2: LIQUIDITY SWEEP — OB candle must sweep previous candle's HIGH
      const liqSweep = i >= 2 && bars[i - 1].high > bars[i - 2].high;
      // Rule 3: FVG confirmed above
      const bearResponse = bars[i].close < bars[i - 1].open;

      if (obIsBullish && liqSweep) {
        let obMit = false;
        for (let j = i + 1; j < n; j++) {
          if (bars[j].high > bars[i - 1].low) { obMit = true; break; }
        }
        const obLow   = bars[i - 1].open;  // bottom of OB body (bullish: close > open)
        const obHigh  = bars[i - 1].high;  // wick top
        const obBodyH = bars[i - 1].close; // top of OB body
        obs.push({
          type:       'bear',
          high:       obHigh,
          low:        obLow,
          bodyHigh:   obBodyH,
          bodyLow:    obLow,
          entry50:    (obHigh + obLow) / 2,
          entryWick:  obHigh,
          entryBody:  obBodyH,
          sl:         obHigh + atr14 * 0.5,
          hasLiqSweep: true,
          hasFVG:     true,
          strong:     bearResponse,
          mitigated:  obMit,
          startTime:  bars[i - 1].timestamp / 1000,
          endTime:    bars[Math.min(i + 30, n - 1)].timestamp / 1000,
        });
      }
    }
  }

  // ── Swing H/L — pivot 5,5 ─────────────────────────────────────
  const swings = [];
  for (let i = 5; i < n - 5; i++) {
    let isH = true, isL = true;
    for (let j = i - 5; j <= i + 5; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isH = false;
      if (bars[j].low  <= bars[i].low)  isL = false;
    }
    const eIdx = Math.min(i + 50, n - 1);
    if (isH) swings.push({ type: 'high', price: bars[i].high,
      startTime: bars[i].timestamp / 1000, endTime: bars[eIdx].timestamp / 1000, barIdx: i });
    if (isL) swings.push({ type: 'low',  price: bars[i].low,
      startTime: bars[i].timestamp / 1000, endTime: bars[eIdx].timestamp / 1000, barIdx: i });
  }

  // ── BOS / CHoCH ───────────────────────────────────────────────
  const sortedSwings = swings.slice().sort((a, b) => a.startTime - b.startTime);
  const bosChoch = [];
  if (sortedSwings.length >= 3) {
    let trend = null;
    const fHigh = sortedSwings.filter(s => s.type === 'high');
    if (fHigh.length >= 2) trend = fHigh[1].price > fHigh[0].price ? 'up' : 'down';
    for (let i = 1; i < sortedSwings.length; i++) {
      const curr = sortedSwings[i];
      if (curr.type === 'high') {
        const ph = sortedSwings.slice(0, i).filter(s => s.type === 'high');
        if (!ph.length) continue;
        const prev = ph[ph.length - 1];
        if (curr.price > prev.price) {
          bosChoch.push({ kind: trend === 'up' ? 'bos_bull' : 'choch_bull', price: prev.price, eventTime: curr.startTime });
          if (trend !== 'up') trend = 'up';
        }
      } else {
        const pl = sortedSwings.slice(0, i).filter(s => s.type === 'low');
        if (!pl.length) continue;
        const prev = pl[pl.length - 1];
        if (curr.price < prev.price) {
          bosChoch.push({ kind: trend === 'down' ? 'bos_bear' : 'choch_bear', price: prev.price, eventTime: curr.startTime });
          if (trend !== 'down') trend = 'down';
        }
      }
    }
  }

  // ── Premium / Discount zone ───────────────────────────────────
  const pdZone = (() => {
    const recentH = [...swings].reverse().find(s => s.type === 'high');
    const recentL = [...swings].reverse().find(s => s.type === 'low');
    if (!recentH || !recentL) return null;
    const hi = recentH.price, lo = recentL.price;
    if (hi <= lo) return null;
    return { hi, lo, eq: (hi + lo) / 2,
      startTime: Math.min(recentH.startTime, recentL.startTime),
      endTime:   Math.max(recentH.endTime,   recentL.endTime) };
  })();

  // ── Supply & Demand Zones (Drop-Base-Rally / Rally-Base-Drop) ──
  const supplyZones = [], demandZones = [];
  for (let i = 3; i < n - 1; i++) {
    const bar      = bars[i];
    const bodySize = Math.abs(bar.close - bar.open);
    if (bodySize < atr14 * 1.0) continue; // filter weak candles

    const baseStart = Math.max(0, i - 5);
    const baseBars  = bars.slice(baseStart, i);
    if (baseBars.length < 1) continue;

    const baseHigh  = Math.max(...baseBars.map(b => b.high));
    const baseLow   = Math.min(...baseBars.map(b => b.low));
    const baseRange = baseHigh - baseLow;
    if (baseRange > bodySize * 1.0) continue; // must be tight base

    const endTime = bars[n - 1].timestamp / 1000;
    const startTime = baseBars[0].timestamp / 1000;

    if (bar.close > bar.open) { // Bullish impulse → Demand Zone
      let mit = false;
      for (let j = i + 1; j < n; j++) { if (bars[j].low < baseLow) { mit = true; break; } }
      if (!mit) demandZones.push({ top: baseHigh, bottom: baseLow, startTime, endTime,
        strength: Math.min(3, bodySize / atr14) });
    } else { // Bearish impulse → Supply Zone
      let mit = false;
      for (let j = i + 1; j < n; j++) { if (bars[j].high > baseHigh) { mit = true; break; } }
      if (!mit) supplyZones.push({ top: baseHigh, bottom: baseLow, startTime, endTime,
        strength: Math.min(3, bodySize / atr14) });
    }
  }

  // ── Wyckoff: Accumulation & Distribution ─────────────────────
  const wyckoffPhases = [];
  const winSize = Math.max(12, Math.min(20, Math.floor(n / 5)));
  for (let s = 5; s < n - winSize; s += Math.max(3, Math.floor(winSize / 3))) {
    const e    = Math.min(s + winSize, n - 1);
    const win  = bars.slice(s, e + 1);
    const wHi  = Math.max(...win.map(b => b.high));
    const wLo  = Math.min(...win.map(b => b.low));
    const wRng = wHi - wLo;
    const avgR = win.reduce((acc, b) => acc + (b.high - b.low), 0) / win.length;
    if (wRng > avgR * 7) continue; // not a tight range

    const priorBars = bars.slice(Math.max(0, s - winSize), s);
    if (priorBars.length < 4) continue;
    const priorMove = priorBars[priorBars.length - 1].close - priorBars[0].close;

    const afterBars = bars.slice(e + 1, Math.min(n, e + winSize));
    const afterMove = afterBars.length > 2
      ? afterBars[afterBars.length - 1].close - afterBars[0].close : 0;

    const phase =
      priorMove < -atr14 * 3 && (afterMove > atr14 * 2 || e >= n - 6) ? 'ACC' :
      priorMove >  atr14 * 3 && (afterMove < -atr14 * 2 || e >= n - 6) ? 'DIST' : null;

    if (phase) wyckoffPhases.push({ phase, top: wHi, bottom: wLo,
      startTime: win[0].timestamp / 1000, endTime: win[win.length - 1].timestamp / 1000,
      active: e >= n - 8 });
  }
  // Deduplicate
  const dedupedWy = wyckoffPhases.filter((p, i) =>
    !wyckoffPhases.some((q, j) => j < i && p.phase === q.phase &&
      Math.abs(p.bottom - q.bottom) < (p.top - p.bottom) * 0.6)
  ).slice(-4);

  // ── Manipulation / Stop Hunt Detection ───────────────────────
  const manipulations = [];
  const swingLows   = swings.filter(s => s.type === 'low');
  const swingHighs  = swings.filter(s => s.type === 'high');

  const nearestBarIdx = (targetTime) => {
    let best = -1, bestD = Infinity;
    bars.forEach((b, i) => {
      const d = Math.abs(b.timestamp / 1000 - targetTime);
      if (d < bestD) { bestD = d; best = i; }
    });
    return bestD < 7200 ? best : -1; // within 2h
  };

  // Bullish hunt: sweep of swing low with close above
  swingLows.slice(-10).forEach(sw => {
    const swIdx = sw.barIdx ?? nearestBarIdx(sw.startTime);
    if (swIdx < 0) return;
    for (let i = swIdx + 1; i < Math.min(swIdx + 20, n); i++) {
      if (bars[i].low < sw.price) {
        if (bars[i].close > sw.price) {
          const nextClose = bars[Math.min(i + 1, n - 1)].close;
          const nearTgt   = swingHighs.length
            ? Math.max(...swingHighs.slice(-3).map(s => s.price)) : bars[i].close * 1.015;
          manipulations.push({ type: 'bull_hunt', sweepLevel: sw.price,
            wickExtreme: bars[i].low, closeLevel: bars[i].close,
            sl: bars[i].low, entryPrice: nextClose, targetPrice: nearTgt,
            eventTime: bars[i].timestamp / 1000 });
        }
        break;
      }
    }
  });

  // Bearish hunt: sweep of swing high with close below
  swingHighs.slice(-10).forEach(sw => {
    const swIdx = sw.barIdx ?? nearestBarIdx(sw.startTime);
    if (swIdx < 0) return;
    for (let i = swIdx + 1; i < Math.min(swIdx + 20, n); i++) {
      if (bars[i].high > sw.price) {
        if (bars[i].close < sw.price) {
          const nearTgt = swingLows.length
            ? Math.min(...swingLows.slice(-3).map(s => s.price)) : bars[i].close * 0.985;
          manipulations.push({ type: 'bear_hunt', sweepLevel: sw.price,
            wickExtreme: bars[i].high, closeLevel: bars[i].close,
            sl: bars[i].high, entryPrice: bars[Math.min(i + 1, n - 1)].close,
            targetPrice: nearTgt, eventTime: bars[i].timestamp / 1000 });
        }
        break;
      }
    }
  });

  // ── Refined Entry Zones (from CHoCH + nearest OB) ────────────
  const refinedEntries = [];
  (bosChoch || []).filter(ev => ev.kind.includes('choch')).slice(-3).forEach(ev => {
    const isBull = ev.kind.includes('bull');
    const relOBs = obs.filter(ob => ob.type === (isBull ? 'bull' : 'bear'));
    const nearOB = relOBs[relOBs.length - 1];
    const entryHigh = nearOB ? nearOB.high : ev.price * 1.001;
    const entryLow  = nearOB ? nearOB.low  : ev.price * 0.999;
    const relSwings = isBull
      ? swingLows.filter(s => s.startTime < ev.eventTime)
      : swingHighs.filter(s => s.startTime < ev.eventTime);
    const lastSw = relSwings[relSwings.length - 1];
    const slLevel = lastSw
      ? (isBull ? lastSw.price * 0.9985 : lastSw.price * 1.0015)
      : (isBull ? ev.price * 0.990 : ev.price * 1.010);
    const tgtSwings = isBull
      ? swingHighs.filter(s => s.price > entryHigh)
      : swingLows.filter(s => s.price < entryLow);
    refinedEntries.push({ direction: isBull ? 'bull' : 'bear',
      entryHigh, entryLow, slLevel,
      target: tgtSwings[0]?.price ?? null,
      eventTime: ev.eventTime, level: ev.price });
  });

  return {
    fvgs:           fvgs.filter(f => !f.mitigated).slice(-40),
    swings:         swings.slice(-40),
    obs:            obs.filter(ob => !ob.mitigated).slice(-15).concat(obs.filter(ob => ob.mitigated).slice(-5)),
    bosChoch:       bosChoch.slice(-20),
    pdZone,
    supplyZones:    supplyZones.slice(-6),
    demandZones:    demandZones.slice(-6),
    wyckoffPhases:  dedupedWy,
    manipulations:  manipulations.slice(-6),
    refinedEntries: refinedEntries.slice(-3),
  };
}

// ═══════════════════════════════════════════════════════════════════
// BLACK BOX INDICATOR
// Strategy (image-accurate):
//  BULL Black Box = HL (Higher Low) → HH/BOS level (full consolidation zone)
//  BEAR Black Box = LH (Lower High) → LL/BOS level (full consolidation zone)
//  Extends to right edge of chart — represents "Previous Structure Zone"
// ═══════════════════════════════════════════════════════════════════
function computeBlackBox(bars) {
  if (!bars || bars.length < 15) return null;
  const n  = bars.length;
  const lb = Math.max(2, Math.min(3, Math.floor(n / 30)));

  // ── Detect pivots ──────────────────────────────────────────────
  const pivotHighs = [];
  const pivotLows  = [];

  for (let i = lb; i < n - lb; i++) {
    let isPH = true, isPL = true;
    for (let k = 1; k <= lb; k++) {
      if (bars[i].high < bars[i - k].high || bars[i].high < bars[i + k].high) isPH = false;
      if (bars[i].low  > bars[i - k].low  || bars[i].low  > bars[i + k].low)  isPL = false;
    }
    if (isPH) pivotHighs.push({ price: bars[i].high, idx: i, ts: bars[i].timestamp / 1000,
                                 open: bars[i].open, close: bars[i].close, low: bars[i].low });
    if (isPL) pivotLows.push ({ price: bars[i].low,  idx: i, ts: bars[i].timestamp / 1000,
                                 open: bars[i].open, close: bars[i].close, high: bars[i].high });
  }

  if (pivotHighs.length < 2 || pivotLows.length < 2) return null;

  // ── Label HH/LH and HL/LL ──────────────────────────────────────
  for (let i = 1; i < pivotHighs.length; i++)
    pivotHighs[i].label = pivotHighs[i].price > pivotHighs[i - 1].price ? 'HH' : 'LH';
  pivotHighs[0].label = 'H';

  for (let i = 1; i < pivotLows.length; i++)
    pivotLows[i].label = pivotLows[i].price > pivotLows[i - 1].price ? 'HL' : 'LL';
  pivotLows[0].label = 'L';

  // ── Trend ──────────────────────────────────────────────────────
  const rH = pivotHighs.slice(-4), rL = pivotLows.slice(-4);
  const hhC = rH.filter(h => h.label === 'HH').length;
  const hlC = rL.filter(l => l.label === 'HL').length;
  const lhC = rH.filter(h => h.label === 'LH').length;
  const llC = rL.filter(l => l.label === 'LL').length;
  let trend = 'NEUTRAL';
  if (hhC >= 1 && hlC >= 1) trend = 'UPTREND';
  else if (lhC >= 1 && llC >= 1) trend = 'DOWNTREND';

  const boxes = [];

  // ──────────────────────────────────────────────────────────────
  // BULL Black Box — Demand Zone
  // Formula: boxLow = last HL price | boxHigh = highest high in
  //          range from HL to next pivot high (BOS candidate)
  // ──────────────────────────────────────────────────────────────
  const recentHLs = pivotLows.filter(l => l.label === 'HL');
  const lastHL    = recentHLs.length > 0 ? recentHLs[recentHLs.length - 1] : null;

  if (lastHL) {
    // BOS candidate = first pivot high after this HL
    const bosCandidate = pivotHighs.find(h => h.idx > lastHL.idx);

    // Box boundaries
    let boxHigh, boxLow;
    boxLow = lastHL.price;  // HL level = bottom of Black Box

    if (bosCandidate) {
      // Top of box = highest high in the consolidation range (HL → BOS candidate)
      let rangeHigh = bosCandidate.price;
      for (let i = lastHL.idx; i <= bosCandidate.idx; i++)
        rangeHigh = Math.max(rangeHigh, bars[i].high);
      boxHigh = rangeHigh;
    } else {
      // No pivot high after HL — scan to the end for highest high
      let rangeHigh = lastHL.high;
      for (let i = lastHL.idx; i < n; i++)
        rangeHigh = Math.max(rangeHigh, bars[i].high);
      boxHigh = rangeHigh;
    }

    // BOS: did price close above bosCandidate?
    let bos = false, bosLevel = null;
    if (bosCandidate) {
      bosLevel = bosCandidate.price;
      for (let j = bosCandidate.idx + 1; j < n; j++) {
        if (bars[j].close > bosCandidate.price) { bos = true; break; }
      }
    }

    const curr   = bars[n - 1];
    const inBox  = curr.low <= boxHigh * 1.003 && curr.close >= boxLow * 0.997;

    // Price action confirmation in box area (last 5 bars)
    let confirm = null;
    for (let j = Math.max(0, n - 5); j < n; j++) {
      const b = bars[j];
      if (b.low > boxHigh * 1.02) continue;
      const body  = Math.abs(b.close - b.open);
      const lWick = Math.min(b.open, b.close) - b.low;
      if (b.close > b.open && lWick > body * 1.5) { confirm = 'Pin Bar'; break; }
      if (j > 0) {
        const p = bars[j - 1];
        if (p.close < p.open && b.close > b.open && b.close > p.open && b.open < p.close)
          { confirm = 'Engulfing'; break; }
      }
    }

    // Target = next significant pivot high above the box
    const targetPH = pivotHighs.filter(h => h.idx > (bosCandidate?.idx || lastHL.idx) && h.price > boxHigh);
    const target   = targetPH.length > 0 ? targetPH[0].price
                   : bosCandidate ? bosCandidate.price * 1.015 : null;

    boxes.push({
      type: 'bull', label: 'Black Box (Demand)',
      boxHigh, boxLow, boxMid: (boxHigh + boxLow) / 2,
      bos, bosLevel, confirm, inBox,
      target,
      sl: boxLow * 0.998,
      startTs: bars[Math.max(0, lastHL.idx - 3)].timestamp / 1000,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // BEAR Black Box — Supply Zone
  // Formula: boxHigh = last LH price | boxLow = lowest low in
  //          range from LH to next pivot low (BOS candidate)
  // ──────────────────────────────────────────────────────────────
  const recentLHs = pivotHighs.filter(h => h.label === 'LH');
  const lastLH    = recentLHs.length > 0 ? recentLHs[recentLHs.length - 1] : null;

  if (lastLH) {
    const bosCandidate = pivotLows.find(l => l.idx > lastLH.idx);

    let boxHigh, boxLow;
    boxHigh = lastLH.price;  // LH level = top of Black Box

    if (bosCandidate) {
      let rangeLow = bosCandidate.price;
      for (let i = lastLH.idx; i <= bosCandidate.idx; i++)
        rangeLow = Math.min(rangeLow, bars[i].low);
      boxLow = rangeLow;
    } else {
      let rangeLow = lastLH.low;
      for (let i = lastLH.idx; i < n; i++)
        rangeLow = Math.min(rangeLow, bars[i].low);
      boxLow = rangeLow;
    }

    let bos = false, bosLevel = null;
    if (bosCandidate) {
      bosLevel = bosCandidate.price;
      for (let j = bosCandidate.idx + 1; j < n; j++) {
        if (bars[j].close < bosCandidate.price) { bos = true; break; }
      }
    }

    const curr  = bars[n - 1];
    const inBox = curr.high >= boxLow * 0.997 && curr.close <= boxHigh * 1.003;

    let confirm = null;
    for (let j = Math.max(0, n - 5); j < n; j++) {
      const b = bars[j];
      if (b.high < boxLow * 0.98) continue;
      const body  = Math.abs(b.close - b.open);
      const uWick = b.high - Math.max(b.open, b.close);
      if (b.close < b.open && uWick > body * 1.5) { confirm = 'Pin Bar'; break; }
      if (j > 0) {
        const p = bars[j - 1];
        if (p.close > p.open && b.close < b.open && b.close < p.open && b.open > p.close)
          { confirm = 'Engulfing'; break; }
      }
    }

    const targetPL = pivotLows.filter(l => l.idx > (bosCandidate?.idx || lastLH.idx) && l.price < boxLow);
    const target   = targetPL.length > 0 ? targetPL[0].price
                   : bosCandidate ? bosCandidate.price * 0.985 : null;

    boxes.push({
      type: 'bear', label: 'Black Box (Supply)',
      boxHigh, boxLow, boxMid: (boxHigh + boxLow) / 2,
      bos, bosLevel, confirm, inBox,
      target,
      sl: boxHigh * 1.002,
      startTs: bars[Math.max(0, lastLH.idx - 3)].timestamp / 1000,
    });
  }

  // ── Swing labels (show all recent pivots) ──────────────────────
  const swingLabels = [
    ...pivotHighs.slice(-10).map(h => ({ ...h, swType: 'high' })),
    ...pivotLows.slice(-10).map(l  => ({ ...l, swType: 'low'  })),
  ].sort((a, b) => a.idx - b.idx);

  return { trend, boxes, swingLabels };
}


// ═══════════════════════════════════════════════════════════════════
// REJ — 15-Min Rejection + 1-Min Confirmation Strategy
//   BUY  : 15m Hammer / long lower wick  → 1m strong green confirm
//   SELL : 15m Shooting Star / long upper wick → 1m strong red confirm
//   Entry  = close of confirmation candle (or rejection close if PENDING)
//   SL     = just beyond 15m rejection extreme
//   Target = minimum 1:2 risk-reward
// ═══════════════════════════════════════════════════════════════════
function _rejBody(b) { return Math.abs(b.close - b.open); }
function _rejRange(b) { return b.high - b.low; }
function _rejUpperWick(b) { return b.high - Math.max(b.open, b.close); }
function _rejLowerWick(b) { return Math.min(b.open, b.close) - b.low; }
function _rejIsBull(b) { return b.close > b.open; }
function _rejIsBear(b) { return b.close < b.open; }

function detect15mRejection(bars15) {
  if (!bars15 || bars15.length < 3) return null;
  const start = Math.max(1, bars15.length - 8);
  for (let i = bars15.length - 1; i >= start; i--) {
    const b = bars15[i];
    const r = _rejRange(b);
    if (r <= 0) continue;
    const bod = _rejBody(b);
    const uw  = _rejUpperWick(b);
    const lw  = _rejLowerWick(b);
    const strongWickRatio = 1.5;
    // BUY: Hammer — long lower wick
    if (lw >= strongWickRatio * bod && lw >= 0.55 * r && uw <= bod * 1.1) {
      return { type: 'BUY', bar: b, idx: i, extreme: b.low,
        rejectionHigh: b.high, rejectionLow: b.low,
        time: b.timestamp / 1000, name: '15m Hammer / Lower Wick Rejection' };
    }
    // SELL: Shooting Star — long upper wick
    if (uw >= strongWickRatio * bod && uw >= 0.55 * r && lw <= bod * 1.1) {
      return { type: 'SELL', bar: b, idx: i, extreme: b.high,
        rejectionHigh: b.high, rejectionLow: b.low,
        time: b.timestamp / 1000, name: '15m Shooting Star / Upper Wick Rejection' };
    }
  }
  return null;
}

function _findStrongConfirmInWindow(windowBars, type) {
  const limit = Math.min(windowBars.length, 20);
  for (let i = 0; i < limit; i++) {
    const b = windowBars[i];
    const r = _rejRange(b);
    if (r <= 0) continue;
    const bod = _rejBody(b);
    const bodyRatio = bod / r;
    if (bodyRatio < 0.55) continue;
    if (type === 'BUY') {
      if (!_rejIsBull(b)) continue;
      if (_rejUpperWick(b) > bod * 0.6) continue;
      const prevVol = i > 0 ? windowBars[i - 1].volume || 0 : 0;
      const volOk = !prevVol || (b.volume || 0) >= prevVol * 0.9;
      if (!volOk && bodyRatio < 0.7) continue;
      return { bar: b, time: b.timestamp / 1000, entry: b.close, name: '1m Strong Green Confirmation' };
    }
    if (type === 'SELL') {
      if (!_rejIsBear(b)) continue;
      if (_rejLowerWick(b) > bod * 0.6) continue;
      const prevVol = i > 0 ? windowBars[i - 1].volume || 0 : 0;
      const volOk = !prevVol || (b.volume || 0) >= prevVol * 0.9;
      if (!volOk && bodyRatio < 0.7) continue;
      return { bar: b, time: b.timestamp / 1000, entry: b.close, name: '1m Strong Red Confirmation' };
    }
  }
  return null;
}

function find1mConfirmation(bars1m, rejection) {
  if (!bars1m || !bars1m.length || !rejection) return null;
  const rejEndTs = rejection.bar.timestamp + 15 * 60 * 1000;
  const after = bars1m.filter(b => b.timestamp >= rejEndTs);
  if (after.length < 1) {
    const afterStart = bars1m.filter(b => b.timestamp > rejection.bar.timestamp);
    if (!afterStart.length) return null;
    return _findStrongConfirmInWindow(afterStart, rejection.type);
  }
  return _findStrongConfirmInWindow(after, rejection.type);
}

function detectRejectionConfirmSetup(bars) {
  if (!bars || bars.length < 10) return null;
  const bars15 = resampleBars(bars, 15);
  const rejection = detect15mRejection(bars15);
  if (!rejection) return null;
  const confirm = find1mConfirmation(bars, rejection);
  if (!confirm) {
    const entry = rejection.bar.close;
    const sl = rejection.type === 'BUY' ? rejection.extreme * 0.9995 : rejection.extreme * 1.0005;
    const riskPts = Math.abs(entry - sl);
    const target = rejection.type === 'BUY' ? entry + riskPts * 2 : entry - riskPts * 2;
    return { status: 'PENDING', type: rejection.type, rejection, confirm: null,
      entry, sl, target, rr: 2, label: `${rejection.type} · 15m Rejection (await 1m confirm)` };
  }
  const entry = confirm.entry;
  const sl = rejection.type === 'BUY' ? rejection.extreme * 0.9995 : rejection.extreme * 1.0005;
  const riskPts = Math.abs(entry - sl);
  if (riskPts <= 0) return null;
  const target = rejection.type === 'BUY' ? entry + riskPts * 2 : entry - riskPts * 2;
  return { status: 'CONFIRMED', type: rejection.type, rejection, confirm,
    entry, sl, target, rr: 2,
    label: rejection.type === 'BUY' ? 'BUY · 15m Rejection + 1m Confirm' : 'SELL · 15m Rejection + 1m Confirm' };
}


const ChartPanel = ({
  stockData, loading, selectedStock, onPivotSelect, pivotPoint, gannFan,
  semiLogScale, setSemiLogScale, timeframe, onTimeframeChange, isCrypto,
  dataSource, onDataSourceChange, activeStrategy, strategyData, tradeSignal,
  onOpenOptionChain, strategyMarkers,
}) => {
  const chartContainerRef = useRef();
  const chartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const gannLineSeriesRef = useRef([]);
  // Volume Profile refs
  const vpCanvasRef = useRef(null);
  const vpDataRef = useRef(null);
  const vpAnimRef = useRef(null);
  const vpPriceLinesRef = useRef([]);
  const vpHoverYRef = useRef(null);
  // SMC Auto Mark refs
  const smcCanvasRef = useRef(null);
  const smcDataRef   = useRef(null);
  const smcAnimRef   = useRef(null);
  // EMA Cross refs
  const ema9SeriesRef  = useRef(null);
  const ema21SeriesRef = useRef(null);
  // Trade Signal (Parity Scanner) price lines
  const tradeSignalLinesRef = useRef([]);
  const [smcActive, setSmcActive] = useState(true);
  const [smcLayers, setSmcLayers] = useState(() => new Set(SMC_AUTO_DEFAULT_LAYERS));
  const [smcTfOpen, setSmcTfOpen] = useState(false);
  const smcTfDropdownRef = useRef(null);
  const smcTfBtnRef = useRef(null);
  const [smcTfDropdownPos, setSmcTfDropdownPos] = useState({ top: 0, left: 0 });
  const smcLayerCacheRef = useRef({});
  // EMA Cross indicator — 9 EMA vs 21 EMA
  const [emaActive, setEmaActive] = useState(true);
  const [emaSignal, setEmaSignal] = useState(null);
  // Candlestick Pattern highlighting (Y/O/Blue color coding)
  const [patternsActive, setPatternsActive] = useState(true);
  const [lastPattern, setLastPattern] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectMode, setSelectMode] = useState(null);
  const [showGannLines, setShowGannLines] = useState(true);
  const [lineExtension, setLineExtension] = useState(50);
  const [isMovingMode, setIsMovingMode] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const tfDropdownRef = useRef(null);
  const tfBtnRef = useRef(null);
  const [tfDropdownPos, setTfDropdownPos] = useState({ top: 0, left: 0 });
  const [showTrade, setShowTrade] = useState(false);
  const [vpEnabled, setVpEnabled] = useState(false);
  const [vpActive, setVpActive] = useState(false);
  const [vpTooltip, setVpTooltip] = useState(null);
  // Black Box indicator
  const [bbActive, setBbActive] = useState(false);
  const bbCanvasRef = useRef(null);
  const bbAnimRef   = useRef(null);
  const bbDataRef   = useRef(null);
  // REJ — 15m Rejection + 1m Confirmation
  const [rejActive, setRejActive] = useState(false);
  const [oiPanelOpen, setOiPanelOpen] = useState(false);
  const [oiData,      setOiData]      = useState(null);
  const [oiLoading,   setOiLoading]   = useState(false);
  const [oiLinesOn,   setOiLinesOn]   = useState(false);   // chart lines toggle
  const oiBtnRef      = useRef(null);
  const oiPriceLinesRef = useRef([]);
  const rejCanvasRef = useRef(null);
  const rejAnimRef   = useRef(null);
  const rejDataRef   = useRef(null);
  // S/R Stats canvas overlay
  const srStatsCanvasRef = useRef(null);
  const srStatsAnimRef   = useRef(null);
  const srStatsDataRef   = useRef([]);
  // Strategy markers + EMA markers merge refs
  const emaMarkerRef             = useRef([]);
  const strategyMarkersLocalRef  = useRef([]);
  // MTF Market Direction — 1H / 45M / 15M
  const [mtfDirection, setMtfDirection] = useState({ '1H': null, '45M': null, '15M': null });
  const { theme } = useTheme();
  const isDark = theme !== 'light';

  const TF_GROUPS = [
    { group: 'MINUTES', items: [
      { multiplier: 1,  timespan: 'minute', label: '1MIN', displayName: '1 minute'   },
      { multiplier: 2,  timespan: 'minute', label: '2M',   displayName: '2 minutes'  },
      { multiplier: 3,  timespan: 'minute', label: '3M',   displayName: '3 minutes'  },
      { multiplier: 5,  timespan: 'minute', label: '5M',   displayName: '5 minutes'  },
      { multiplier: 10, timespan: 'minute', label: '10M',  displayName: '10 minutes' },
      { multiplier: 15, timespan: 'minute', label: '15M',  displayName: '15 minutes' },
      { multiplier: 30, timespan: 'minute', label: '30M',  displayName: '30 minutes' },
      { multiplier: 45, timespan: 'minute', label: '45M',  displayName: '45 minutes' },
    ]},
    { group: 'HOURS', items: [
      { multiplier: 1, timespan: 'hour', label: '1H',  displayName: '1 hour'  },
      { multiplier: 2, timespan: 'hour', label: '2H',  displayName: '2 hours' },
      { multiplier: 4, timespan: 'hour', label: '4H',  displayName: '4 hours' },
    ]},
    { group: 'DAYS', items: [
      { multiplier: 1, timespan: 'day', label: '1D', displayName: '1 day', days: 730 },
    ]},
    { group: 'WEEKS', items: [
      { multiplier: 1, timespan: 'week', label: '1W', displayName: '1 week', days: 1825 },
    ]},
    { group: 'MONTHS', items: [
      { multiplier: 1, timespan: 'day', label: '1MO', displayName: '1 month',  days: 30  },
      { multiplier: 3, timespan: 'day', label: '3MO', displayName: '3 months', days: 90  },
      { multiplier: 6, timespan: 'day', label: '6MO', displayName: '6 months', days: 180 },
    ]},
    { group: 'YEARS', items: [
      { multiplier: 1, timespan: 'week', label: '1Y', displayName: '1 year', days: 1825 },
    ]},
  ];

  const clearGannLines = () => {
    if (chartRef.current && gannLineSeriesRef.current.length > 0) {
      gannLineSeriesRef.current.forEach(series => {
        try { chartRef.current.removeSeries(series); } catch (e) {}
      });
      gannLineSeriesRef.current = [];
    }
  };

  // ── Trendline refs + clear ──────────────────────────────────────
  const trendLineSeriesRef = useRef([]);
  const [trendlinesActive, setTrendlinesActive] = useState(false);
  const [trendlineCount, setTrendlineCount] = useState(0);
  // Trendline type filter (all enabled by default)
  const TREND_TYPES = [
    { id: 'uptrend',      label: 'Uptrend',    color: '#00E676' },
    { id: 'downtrend',    label: 'Downtrend',  color: '#FF4757' },
    { id: 'h_support',    label: 'H-Support',  color: '#3B82F6' },
    { id: 'h_resistance', label: 'H-Resist.',  color: '#FF6B00' },
    { id: 'channel_up',   label: 'Ch. High',   color: '#06B6D4' },
    { id: 'channel_down', label: 'Ch. Low',    color: '#EC4899' },
    { id: 'fibonacci',    label: 'Fibonacci',  color: '#818CF8' },
  ];
  const [trendFilter, setTrendFilter] = useState(() => new Set(TREND_TYPES.map(t => t.id)));
  const [trendFilterOpen, setTrendFilterOpen] = useState(false);
  const trendFilterBtnRef = useRef(null);
  const trendFilterDropdownRef = useRef(null);
  const [trendFilterPos, setTrendFilterPos] = useState({ top: 0, left: 0 });

  const clearTrendLines = () => {
    if (chartRef.current && trendLineSeriesRef.current.length > 0) {
      trendLineSeriesRef.current.forEach(s => {
        try { chartRef.current.removeSeries(s); } catch (e) {}
      });
    }
    trendLineSeriesRef.current = [];
  };

  // ── MTF Direction fetch (1H / 45M / 15M) ──────────────────────
  const fetchMtfDirection = useCallback(async (ticker) => {
    if (!ticker || isCrypto) { setMtfDirection({ '1H': null, '45M': null, '15M': null }); return; }
    const sym = ticker.replace('.NS','').replace('.BO','').replace(/^\^/,'');
    const TFS = [
      { label: '1H',  interval: '1h',  days_back: 3 },
      { label: '45M', interval: '45m', days_back: 7 },
      { label: '15M', interval: '15m', days_back: 2 },
    ];
    const results = { '1H': null, '45M': null, '15M': null };
    await Promise.allSettled(TFS.map(async ({ label, interval, days_back }) => {
      try {
        const r = await fetch(`${API}/groww/candles/${sym}?interval=${interval}&days_back=${days_back}`);
        if (!r.ok) return;
        const d = await r.json();
        const bars = d.bars || [];
        if (bars.length < 3) return;
        const last  = bars[bars.length - 1].close;
        const prev3 = bars[Math.max(0, bars.length - 4)].close;
        const pct   = ((last - prev3) / prev3 * 100).toFixed(2);
        if (last > prev3 * 1.0015)      results[label] = { dir: 'up',   pct: `+${pct}%` };
        else if (last < prev3 * 0.9985) results[label] = { dir: 'down', pct: `${pct}%`  };
        else                             results[label] = { dir: 'side', pct: `${pct}%`  };
      } catch (_) {}
    }));
    setMtfDirection(results);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrypto]);

  // ── Volume Profile helpers ───────────────────────────────────────
  const clearVPLines = useCallback(() => {
    vpPriceLinesRef.current.forEach(pl => {
      try { candlestickSeriesRef.current?.removePriceLine(pl); } catch (e) {}
    });
    vpPriceLinesRef.current = [];
  }, []);

  const drawVPCanvas = useCallback(() => {
    const canvas = vpCanvasRef.current;
    const series = candlestickSeriesRef.current;
    const d = vpDataRef.current;
    if (!canvas || !series || !d?.vp_bins?.length) return;
    const container = chartContainerRef.current;
    if (!container) return;
    const dpr = window.devicePixelRatio || 1;
    const H = container.clientHeight;
    if (canvas.style.height !== `${H}px`) {
      canvas.width = VP_WIDTH * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${VP_WIDTH}px`;
      canvas.style.height = `${H}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, VP_WIDTH, H);

    const bins    = d.vp_bins;
    const maxVol  = Math.max(...bins.map(b => b.total_vol)) || 1;
    const rowH    = Math.max(3, (H / bins.length) * 0.72);
    const pocPrice = bins.find(b => b.is_poc)?.price_mid ?? bins[Math.floor(bins.length / 2)].price_mid;
    const maxDist  = Math.max(...bins.map(b => Math.abs(b.price_mid - pocPrice))) || 1;

    // ── 1. Buy / Sell bars ─────────────────────────────────────────
    bins.forEach(bin => {
      const y = series.priceToCoordinate(bin.price_mid);
      if (y == null || y < -rowH || y > H + rowH) return;
      const buyW  = (bin.buy_vol  / maxVol) * VP_BARS_W;
      const sellW = (bin.sell_vol / maxVol) * VP_BARS_W;
      const half  = rowH / 2;

      if (bin.in_value_area) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(0, y - rowH, VP_BARS_W + 4, rowH * 2);
      }
      if (buyW > 0) {
        ctx.fillStyle = bin.in_value_area ? 'rgba(0,230,118,0.82)' : 'rgba(0,230,118,0.38)';
        ctx.fillRect(1, y - half, buyW, half);
      }
      if (sellW > 0) {
        ctx.fillStyle = bin.in_value_area ? 'rgba(255,59,48,0.82)' : 'rgba(255,59,48,0.38)';
        ctx.fillRect(1, y, sellW, half);
      }
      if (bin.is_poc) {
        ctx.strokeStyle = 'rgba(255,107,0,0.95)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VP_BARS_W + 4, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#FF6B00';
        ctx.font = 'bold 7px monospace';
        ctx.fillText('◆', VP_BARS_W - 10, y - 2);
      }
    });

    // ── 2. VAH / VAL edge labels ───────────────────────────────────
    const markEdgeLabel = (price, label, color) => {
      if (!price) return;
      const y = series.priceToCoordinate(price);
      if (y == null || y < 4 || y > H - 4) return;
      ctx.fillStyle = color;
      ctx.font = 'bold 7px monospace';
      ctx.fillText(label, 2, y - 2);
    };
    markEdgeLabel(d.vah_price, 'VAH', '#A855F7');
    markEdgeLabel(d.val_price, 'VAL', '#06B6D4');

    // ── 3. Heatmap column — per-level Buy/Sell split ──────────────
    // Thin vertical separator
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(HEAT_X - 2, 0); ctx.lineTo(HEAT_X - 2, H); ctx.stroke();

    bins.forEach(bin => {
      const y = series.priceToCoordinate(bin.price_mid);
      if (y == null || y < -rowH || y > H + rowH) return;

      const totalVol    = (bin.buy_vol || 0) + (bin.sell_vol || 0) || 1;
      const buyRatio    = bin.buy_vol  / totalVol;   // 0-1
      const sellRatio   = bin.sell_vol / totalVol;   // 0-1
      // Brightness: louder levels = more opaque
      const intensity   = 0.30 + (bin.total_vol / maxVol) * 0.70;
      // POC zone gets full brightness
      const alpha       = bin.is_poc ? 1.0 : intensity;

      const half = rowH;   // each cell spans rowH above + rowH below y

      // TOP half → Buy (green), width proportional to buy ratio
      const buyPixW  = Math.max(1, HEAT_W * buyRatio);
      const sellPixW = Math.max(1, HEAT_W * sellRatio);

      // Background fill (dark base)
      ctx.fillStyle = 'rgba(10,10,20,0.55)';
      ctx.fillRect(HEAT_X, y - half, HEAT_W, half * 2);

      // Buy bar — top half of cell
      ctx.fillStyle = `rgba(0,230,118,${alpha})`;
      ctx.fillRect(HEAT_X, y - half, buyPixW, half);

      // Sell bar — bottom half of cell
      ctx.fillStyle = `rgba(255,59,48,${alpha})`;
      ctx.fillRect(HEAT_X, y, sellPixW, half);

      // Thin mid-line separator between buy/sell
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(HEAT_X, y - 0.5, HEAT_W, 1);

      // Dominant side indicator: bright edge glow
      const dominant = buyRatio > sellRatio ? 'buy' : sellRatio > buyRatio ? 'sell' : null;
      if (dominant && bin.total_vol / maxVol > 0.3) {
        ctx.fillStyle = dominant === 'buy'
          ? `rgba(0,230,118,${alpha * 0.6})`
          : `rgba(255,59,48,${alpha * 0.6})`;
        // Right-edge glow strip (1px)
        ctx.fillRect(HEAT_X + HEAT_W - 1, y - half, 1, half * 2);
      }

      // POC band — white-hot line + label
      if (bin.is_poc) {
        ctx.fillStyle = 'rgba(255,230,150,0.95)';
        ctx.fillRect(HEAT_X, y - 1, HEAT_W, 2);
        ctx.fillStyle = '#FF6B00';
        ctx.font = 'bold 6px monospace';
        ctx.fillText('H', HEAT_X + 2, y - 3);
      }
    });

    // ── 4. Hover highlight ────────────────────────────────────────
    const hoverY = vpHoverYRef.current;
    if (hoverY !== null) {
      let hBin = null, hMin = Infinity;
      bins.forEach(bin => {
        const y = series.priceToCoordinate(bin.price_mid);
        if (y == null) return;
        const dist = Math.abs(y - hoverY);
        if (dist < hMin) { hMin = dist; hBin = bin; }
      });
      if (hBin && hMin < rowH * 1.5) {
        const hy = series.priceToCoordinate(hBin.price_mid);
        if (hy != null) {
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(0, hy - rowH, VP_WIDTH, rowH * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(VP_WIDTH, hy); ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, []);

  // ── S/R Stats Canvas Draw ──────────────────────────────────────
  const drawSRStatsCanvas = useCallback(() => {
    const canvas  = srStatsCanvasRef.current;
    const chart   = chartRef.current;
    const series  = candlestickSeriesRef.current;
    const levels  = srStatsDataRef.current;
    if (!canvas || !chart || !series) return;
    const container = chartContainerRef.current;
    if (!container) return;

    const W   = container.clientWidth;
    const H   = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width  !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width        = Math.round(W * dpr);
      canvas.height       = Math.round(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const toY = p => { try { return series.priceToCoordinate(p); } catch { return null; } };
    const PRICE_SCALE_W = 62;
    const drawableW     = W - PRICE_SCALE_W;

    ctx.font      = 'bold 8.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.imageSmoothingEnabled = false;

    const cx = Math.round((W - PRICE_SCALE_W) / 2);

    levels.forEach(lv => {
      if (!lv.stats) return;
      const yRaw = toY(lv.startPrice);
      if (yRaw == null || yRaw < 10 || yRaw > H - 10) return;

      const { retests, breakouts, held, pct } = lv.stats;
      const text = `Retests: ${retests} · Breakouts: ${breakouts} · Held: ${held} (${pct}%)`;

      // Plain text centered on the line, just above it — no background
      ctx.fillStyle = lv.color;
      ctx.fillText(text, cx, Math.round(yRaw) - 4);
    });

    ctx.restore();
  }, []);

  // ── SMC Canvas Draw ────────────────────────────────────────────
  const drawSMCCanvas = useCallback(() => {
    const canvas  = smcCanvasRef.current;
    const chart   = chartRef.current;
    const series  = candlestickSeriesRef.current;
    const smc     = smcDataRef.current;
    if (!canvas || !chart || !series || !smc) return;
    const container = chartContainerRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    let ts;
    try { ts = chart.timeScale(); } catch (e) { ctx.restore(); chartRef.current = null; return; }
    const toX = t  => { try { return ts.timeToCoordinate(t); } catch { return null; } };
    const toY = p  => { try { return series.priceToCoordinate(p); } catch { return null; } };

    // ── 0a. Wyckoff Phases (ACC / DIST) — deepest background ──────
    (smc.wyckoffPhases || []).forEach(phase => {
      const x1  = toX(phase.startTime);
      const x2  = toX(phase.endTime);
      const yT  = toY(phase.top);
      const yB  = toY(phase.bottom);
      if (x1 == null || x2 == null || yT == null || yB == null) return;
      const left = Math.min(x1, x2);
      const top  = Math.min(yT, yB);
      const w    = Math.max(20, Math.abs(x2 - x1));
      const h    = Math.max(4, Math.abs(yT - yB));
      const isAcc = phase.phase === 'ACC';
      ctx.save();
      ctx.fillStyle   = isAcc ? 'rgba(0,150,255,0.06)'   : 'rgba(200,50,200,0.06)';
      ctx.strokeStyle = isAcc ? 'rgba(0,150,255,0.55)'   : 'rgba(200,50,200,0.55)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = isAcc ? 'rgba(0,190,255,0.90)' : 'rgba(220,100,220,0.90)';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(isAcc ? '▲ ACCUM' : '▼ DIST', left + 4, top + 12);
      if (phase.active) {
        ctx.font = 'bold 7px monospace';
        ctx.fillText('ACTIVE', left + 4, top + 23);
      }
      ctx.restore();
    });

    // ── 0b. Demand Zones (Support — green hatched boxes) ──────────
    (smc.demandZones || []).forEach(zone => {
      const x1 = toX(zone.startTime); const x2 = toX(zone.endTime);
      const yT = toY(zone.top);       const yB = toY(zone.bottom);
      if (x1 == null || yT == null || yB == null) return;
      const left = Math.min(x1 ?? 0, x2 ?? W);
      const top  = Math.min(yT, yB);
      const w    = x2 != null ? Math.abs(x2 - x1) : W - left;
      const h    = Math.max(3, Math.abs(yT - yB));
      ctx.save();
      ctx.fillStyle = 'rgba(0,230,118,0.08)';
      ctx.fillRect(left, top, w, h);
      ctx.strokeStyle = 'rgba(0,230,118,0.75)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(left, top);     ctx.lineTo(left + w, top);     ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, top + h); ctx.lineTo(left + w, top + h); ctx.stroke();
      // diagonal hatch
      ctx.strokeStyle = 'rgba(0,230,118,0.15)'; ctx.lineWidth = 0.7;
      for (let hx = left - h; hx < left + w; hx += 7) {
        ctx.beginPath(); ctx.moveTo(hx, top + h); ctx.lineTo(hx + h, top); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,230,118,0.95)'; ctx.font = 'bold 8px monospace';
      ctx.fillText((zone.strength >= 2 ? '★ DZ' : 'DZ') + (zone._tf && zone._tf !== 'AUTO' ? ` ${zone._tf}` : ''), left + 3, top + h - 3);
      ctx.restore();
    });

    // ── 0c. Supply Zones (Resistance — red hatched boxes) ─────────
    (smc.supplyZones || []).forEach(zone => {
      const x1 = toX(zone.startTime); const x2 = toX(zone.endTime);
      const yT = toY(zone.top);       const yB = toY(zone.bottom);
      if (x1 == null || yT == null || yB == null) return;
      const left = Math.min(x1 ?? 0, x2 ?? W);
      const top  = Math.min(yT, yB);
      const w    = x2 != null ? Math.abs(x2 - x1) : W - left;
      const h    = Math.max(3, Math.abs(yT - yB));
      ctx.save();
      ctx.fillStyle = 'rgba(255,59,48,0.08)';
      ctx.fillRect(left, top, w, h);
      ctx.strokeStyle = 'rgba(255,80,50,0.75)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(left, top);     ctx.lineTo(left + w, top);     ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, top + h); ctx.lineTo(left + w, top + h); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,80,50,0.15)'; ctx.lineWidth = 0.7;
      for (let hx = left - h; hx < left + w; hx += 7) {
        ctx.beginPath(); ctx.moveTo(hx, top); ctx.lineTo(hx + h, top + h); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,100,50,0.95)'; ctx.font = 'bold 8px monospace';
      ctx.fillText((zone.strength >= 2 ? '★ SZ' : 'SZ') + (zone._tf && zone._tf !== 'AUTO' ? ` ${zone._tf}` : ''), left + 3, top + 9);
      ctx.restore();
    });

    // ── 1. Liquidity lines (Swing High / Low) ─────────────────
    smc.swings.forEach(sw => {
      const x1 = toX(sw.startTime);
      const x2 = toX(sw.endTime);
      const y  = toY(sw.price);
      if (x1 == null || x2 == null || y == null) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,185,0,0.72)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,185,0,0.85)';
      ctx.font = 'bold 7px monospace';
      const lbl = (sw.type === 'high' ? 'LH' : 'LL') + (sw._tf && sw._tf !== 'AUTO' ? ` ${sw._tf}` : '');
      ctx.fillText(lbl, Math.max(8, x1 - 14), y - 2);
      ctx.restore();
    });

    // ── 2. FVG Boxes ──────────────────────────────────────────
    smc.fvgs.forEach(fvg => {
      const x1   = toX(fvg.startTime);
      const x2   = toX(fvg.endTime);
      const yTop = toY(fvg.top);
      const yBot = toY(fvg.bottom);
      if (x1 == null || x2 == null || yTop == null || yBot == null) return;
      const left = Math.min(x1, x2);
      const top  = Math.min(yTop, yBot);
      const w    = Math.abs(x2 - x1);
      const h    = Math.max(2, Math.abs(yBot - yTop));
      ctx.save();
      if (fvg.type === 'bull') {
        ctx.fillStyle   = 'rgba(0,230,118,0.11)';
        ctx.strokeStyle = 'rgba(0,230,118,0.85)';
      } else {
        ctx.fillStyle   = 'rgba(255,59,48,0.11)';
        ctx.strokeStyle = 'rgba(255,59,48,0.85)';
      }
      ctx.lineWidth = 1;
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      ctx.fillStyle = fvg.type === 'bull' ? 'rgba(0,230,118,0.92)' : 'rgba(255,59,48,0.92)';
      ctx.font = 'bold 8px monospace';
      ctx.fillText((fvg.type === 'bull' ? 'FVG+' : 'FVG-') + (fvg._tf && fvg._tf !== 'AUTO' ? ` ${fvg._tf}` : ''), left + 3, top + 9);
      ctx.restore();
    });

    // ── 3. Order Blocks ────────────────────────────────────────
    smc.obs.forEach(ob => {
      const x1 = toX(ob.startTime);
      const x2 = toX(ob.endTime);
      const yH = toY(ob.high);
      const yL = toY(ob.low);
      if (x1 == null || x2 == null || yH == null || yL == null) return;
      const left = Math.min(x1, x2);
      const top  = Math.min(yH, yL);
      const w    = Math.max(6, Math.abs(x2 - x1));
      const h    = Math.max(2, Math.abs(yL - yH));

      const isBull = ob.type === 'bull';
      const isMit  = ob.mitigated;

      ctx.save();

      // ── OB Box ───────────────────────────────────────────────
      if (isBull) {
        ctx.fillStyle   = isMit ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.15)';
        ctx.strokeStyle = isMit ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.95)';
      } else {
        ctx.fillStyle   = isMit ? 'rgba(255,100,0,0.05)'  : 'rgba(255,100,0,0.15)';
        ctx.strokeStyle = isMit ? 'rgba(255,100,0,0.35)'  : 'rgba(255,100,0,0.95)';
      }
      ctx.lineWidth = isMit ? 1 : 1.5;
      if (isMit) ctx.setLineDash([4, 3]);
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      ctx.setLineDash([]);

      // ── Entry zone dashed lines (Wick / 50% / Body) ──────────
      if (!isMit) {
        const levels = isBull
          ? [
              { price: ob.entryWick,  label: 'Wick',  clr: 'rgba(59,130,246,0.9)' },
              { price: ob.entry50,    label: '50%',   clr: 'rgba(139,92,246,0.9)' },
              { price: ob.entryBody,  label: 'Body',  clr: 'rgba(34,197,94,0.9)'  },
            ]
          : [
              { price: ob.entryWick,  label: 'Wick',  clr: 'rgba(255,100,0,0.9)'  },
              { price: ob.entry50,    label: '50%',   clr: 'rgba(139,92,246,0.9)' },
              { price: ob.entryBody,  label: 'Body',  clr: 'rgba(248,113,113,0.9)'},
            ];

        levels.forEach(lv => {
          const yE = toY(lv.price);
          if (yE == null) return;
          ctx.save();
          ctx.strokeStyle = lv.clr;
          ctx.lineWidth   = 1;
          ctx.setLineDash([3, 3]);
          ctx.globalAlpha = 0.80;
          ctx.beginPath();
          ctx.moveTo(left, yE);
          ctx.lineTo(left + w, yE);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.fillStyle = lv.clr;
          ctx.font      = 'bold 6px monospace';
          ctx.fillText(lv.label, left + w + 2, yE + 2);
          ctx.restore();
        });
      }

      // ── OB Label ─────────────────────────────────────────────
      ctx.fillStyle = isBull
        ? (isMit ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.95)')
        : (isMit ? 'rgba(255,100,0,0.45)'  : 'rgba(255,100,0,0.95)');
      ctx.font = `bold ${isMit ? 6 : 7}px monospace`;
      const tfSuffix = ob._tf && ob._tf !== 'AUTO' ? ` ${ob._tf}` : '';
      const mitSuffix = isMit ? ' ✕' : '';
      ctx.fillText(
        (isBull ? 'Bull OB' : 'Bear OB') + tfSuffix + mitSuffix,
        left + 2, top + 8
      );

      // ── Liquidity Sweep indicator dot ─────────────────────────
      if (!isMit && ob.hasLiqSweep) {
        const dotY = isBull ? yL + 3 : yH - 3;
        ctx.beginPath();
        ctx.arc(left + w / 2, dotY, 3, 0, Math.PI * 2);
        ctx.fillStyle = isBull ? '#22c55e' : '#ef4444';
        ctx.fill();
      }

      ctx.restore();
    });

    // ── 4. BOS / CHoCH ────────────────────────────────────────────
    (smc.bosChoch || []).forEach(ev => {
      const xEv = toX(ev.eventTime);
      const y   = toY(ev.price);
      if (xEv == null || y == null) return;

      const isBull  = ev.kind.includes('bull');
      const isChoch = ev.kind.includes('choch');
      const label   = isChoch ? 'CHoCH' : 'BOS';

      // Color scheme
      const clr =
        ev.kind === 'bos_bull'   ? '#00E676' :
        ev.kind === 'bos_bear'   ? '#FF3B30' :
        ev.kind === 'choch_bull' ? '#00BFFF' :
                                   '#FF6B00';

      ctx.save();
      ctx.strokeStyle = clr;
      ctx.lineWidth   = isChoch ? 1.5 : 1;
      ctx.setLineDash(isChoch ? [6, 3] : []);
      ctx.globalAlpha = 0.80;

      // Horizontal broken-level line (extends ±60px around break)
      const x1 = Math.max(0, xEv - 80);
      const x2 = xEv + 30;
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Label pill
      ctx.font = 'bold 8px monospace';
      const tw = ctx.measureText(label).width + 8;
      const th = 13;
      const lx = xEv - tw - 4;
      const ly = y - th / 2;

      ctx.fillStyle = clr;
      ctx.globalAlpha = 0.20;
      ctx.fillRect(lx, ly, tw, th);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.strokeRect(lx, ly, tw, th);
      ctx.fillStyle = clr;
      ctx.fillText(label, lx + 4, ly + 9);

      // Arrow at break point
      ctx.beginPath();
      if (isBull) {
        ctx.moveTo(xEv, y + 4); ctx.lineTo(xEv - 4, y + 11); ctx.lineTo(xEv + 4, y + 11);
      } else {
        ctx.moveTo(xEv, y - 4); ctx.lineTo(xEv - 4, y - 11); ctx.lineTo(xEv + 4, y - 11);
      }
      ctx.closePath();
      ctx.fillStyle = clr;
      ctx.fill();

      ctx.restore();
    });

    // ── 5. Premium / Discount Zones ───────────────────────────────
    if (smc.pdZone) {
      const pd  = smc.pdZone;
      const x1  = toX(pd.startTime);
      const x2  = toX(pd.endTime);
      const yHi = toY(pd.hi);
      const yEq = toY(pd.eq);
      const yLo = toY(pd.lo);
      if (x1 != null && x2 != null && yHi != null && yEq != null && yLo != null) {
        const left = Math.min(x1, x2);
        const wid  = Math.abs(x2 - x1);

        // Premium zone (hi → eq): soft red
        ctx.save();
        ctx.fillStyle = 'rgba(255,59,48,0.07)';
        ctx.fillRect(left, yHi, wid, Math.abs(yEq - yHi));

        // Discount zone (eq → lo): soft green
        ctx.fillStyle = 'rgba(0,230,118,0.07)';
        ctx.fillRect(left, yEq, wid, Math.abs(yLo - yEq));

        // EQ midline
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(left, yEq); ctx.lineTo(left + wid, yEq); ctx.stroke();
        ctx.setLineDash([]);

        // Top/bottom borders
        ctx.strokeStyle = 'rgba(255,59,48,0.45)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(left, yHi); ctx.lineTo(left + wid, yHi); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,230,118,0.45)';
        ctx.beginPath(); ctx.moveTo(left, yLo); ctx.lineTo(left + wid, yLo); ctx.stroke();

        // Labels on right edge
        const labelX = left + wid - 60;
        ctx.font = 'bold 8px monospace';

        ctx.fillStyle = 'rgba(255,100,100,0.80)';
        ctx.fillText('PREMIUM', labelX, yHi + 10);

        ctx.fillStyle = 'rgba(255,255,255,0.60)';
        ctx.fillText('EQ', labelX, yEq - 3);

        ctx.fillStyle = 'rgba(0,220,100,0.80)';
        ctx.fillText('DISCOUNT', labelX, yLo - 3);
        ctx.restore();
      }
    }

    // ── 6. Manipulation / Stop Hunt markers ──────────────────────
    (smc.manipulations || []).forEach(hunt => {
      const xEv   = toX(hunt.eventTime);
      const yWick = toY(hunt.wickExtreme);
      const ySwp  = toY(hunt.sweepLevel);
      const yCls  = toY(hunt.closeLevel);
      if (xEv == null || yWick == null) return;
      const isBull = hunt.type === 'bull_hunt';
      ctx.save();

      // Vertical strike line through the manipulation candle
      ctx.strokeStyle = 'rgba(255,140,0,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xEv, Math.min(yWick, yCls ?? yWick));
      ctx.lineTo(xEv, Math.max(yWick, yCls ?? yWick));
      ctx.stroke();

      // Wick dot (where SL sits)
      ctx.fillStyle = '#FF3B30';
      ctx.beginPath(); ctx.arc(xEv, yWick, 4, 0, Math.PI * 2); ctx.fill();

      // Sweep level dashed line
      if (ySwp != null) {
        ctx.strokeStyle = 'rgba(255,140,0,0.45)';
        ctx.lineWidth = 1; ctx.setLineDash([5, 3]);
        ctx.beginPath(); ctx.moveTo(xEv - 25, ySwp); ctx.lineTo(xEv + 25, ySwp); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label pill
      ctx.font = 'bold 8px monospace';
      const lbl = isBull ? 'HUNT↓' : 'HUNT↑';
      const tw  = ctx.measureText(lbl).width + 8;
      const ly  = isBull ? yWick + 5 : yWick - 18;
      ctx.fillStyle = 'rgba(255,140,0,0.22)';
      ctx.fillRect(xEv - tw / 2, ly, tw, 13);
      ctx.fillStyle = '#FFA500';
      ctx.fillText(lbl, xEv - tw / 2 + 4, ly + 9);

      // SL label
      if (ySwp != null) {
        ctx.fillStyle = 'rgba(255,59,48,0.85)';
        ctx.font = '7px monospace';
        ctx.fillText('SL', xEv + 6, yWick + (isBull ? -2 : 4));
      }
      ctx.restore();
    });

    // ── 7. Refined Entry Zones (CHoCH-based) ─────────────────────
    (smc.refinedEntries || []).forEach(entry => {
      const yEH  = toY(entry.entryHigh);
      const yEL  = toY(entry.entryLow);
      const ySL  = toY(entry.slLevel);
      const yTgt = entry.target ? toY(entry.target) : null;
      const xEv  = toX(entry.eventTime);
      if (yEH == null || yEL == null || ySL == null) return;
      const isBull   = entry.direction === 'bull';
      const eClr     = isBull ? '#00E676' : '#FF3B30';
      const xLeft    = xEv != null ? xEv : 0;
      const xRight   = W - 6;
      ctx.save();

      // Entry zone shaded box
      const ezTop = Math.min(yEH, yEL);
      const ezH   = Math.max(2, Math.abs(yEH - yEL));
      ctx.fillStyle = isBull ? 'rgba(0,230,118,0.14)' : 'rgba(255,59,48,0.14)';
      ctx.fillRect(xLeft, ezTop, xRight - xLeft, ezH);
      ctx.strokeStyle = eClr; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(xLeft, ezTop);      ctx.lineTo(xRight, ezTop);      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xLeft, ezTop + ezH); ctx.lineTo(xRight, ezTop + ezH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = eClr; ctx.font = 'bold 8px monospace';
      ctx.fillText(isBull ? '▲ ENTRY' : '▼ ENTRY', xRight - 52, ezTop - 3);

      // SL line
      ctx.strokeStyle = '#FF3B30'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xLeft, ySL); ctx.lineTo(xRight, ySL); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#FF3B30'; ctx.font = 'bold 7px monospace';
      ctx.fillText('SL', xRight - 14, ySL - 2);

      // Target line
      if (yTgt != null) {
        ctx.strokeStyle = eClr; ctx.lineWidth = 1; ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.moveTo(xLeft, yTgt); ctx.lineTo(xRight, yTgt); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = eClr; ctx.font = 'bold 7px monospace';
        ctx.fillText('TGT', xRight - 20, yTgt - 2);

        // R:R ratio
        const risk   = Math.abs(ySL - (yEH + yEL) / 2);
        const reward = Math.abs(yTgt - (yEH + yEL) / 2);
        const rr     = risk > 0 ? (reward / risk).toFixed(1) : '?';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = 'bold 7px monospace';
        ctx.fillText(`R:R ${rr}x`, xLeft + 4, (yEH + yEL) / 2 + 4);
      }
      ctx.restore();
    });

    ctx.restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchVolumeProfile = useCallback(async (bars, ticker) => {
    if (!bars || bars.length < 30) return;
    try {
      const resp = await axios.post(`${API}/orderflow/analyze`, {
        ticker,
        bars,
        n_vp_bins: 30,
        n_fp_levels: 8,
        vp_lookback: Math.min(60, bars.length),
      });
      vpDataRef.current = resp.data;
      clearVPLines();
      const d = resp.data;
      if (candlestickSeriesRef.current) {
        [
          [d.poc_price, 'POC', '#FF6B00', 1],
          [d.vah_price, 'VAH', '#A855F7', 2],
          [d.val_price, 'VAL', '#06B6D4', 2],
        ].forEach(([price, title, color, lineStyle]) => {
          if (!price) return;
          try {
            const pl = candlestickSeriesRef.current.createPriceLine({
              price, color, lineWidth: 1, lineStyle, axisLabelVisible: true, title,
            });
            vpPriceLinesRef.current.push(pl);
          } catch (e) {}
        });
      }
      setVpActive(true);
    } catch (e) {
      console.warn('VP fetch:', e.message);
    }
  }, [clearVPLines]);

  // VP interaction handlers
  const handleVPMouseMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    vpHoverYRef.current = e.clientY - rect.top;
  }, []);

  const handleVPMouseLeave = useCallback(() => {
    vpHoverYRef.current = null;
  }, []);

  const handleVPClick = useCallback((e) => {
    e.stopPropagation();
    const series = candlestickSeriesRef.current;
    const d = vpDataRef.current;
    if (!series || !d?.vp_bins?.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const maxVol = Math.max(...d.vp_bins.map(b => b.total_vol)) || 1;
    const H = chartContainerRef.current?.clientHeight || 300;
    const rowH = Math.max(3, (H / d.vp_bins.length) * 0.72);
    let closestBin = null, minDist = Infinity;
    d.vp_bins.forEach(bin => {
      const y = series.priceToCoordinate(bin.price_mid);
      if (y == null) return;
      const dist = Math.abs(y - clickY);
      if (dist < minDist) { minDist = dist; closestBin = bin; }
    });
    if (closestBin && minDist < rowH * 1.5) {
      if (vpTooltip?.bin?.price_mid === closestBin.price_mid) {
        setVpTooltip(null);
        return;
      }
      setVpTooltip({
        y: Math.max(8, Math.min(clickY, H - 200)),
        bin: closestBin,
        maxVol,
        poc: d.poc_price,
        vah: d.vah_price,
        val: d.val_price,
      });
    } else {
      setVpTooltip(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vpTooltip]);

  const drawGannLines = (pivot, extension) => {
    if (!chartRef.current || !pivot || !stockData || !showGannLines) return;
    clearGannLines();
    const bars = stockData.bars;
    const pivotIndex = bars.findIndex(b => Math.abs(b.timestamp - pivot.timestamp) < 86400000);
    if (pivotIndex === -1) return;
    const pivotPrice = pivot.price;
    const isBullish = pivot.type === 'low';
    const priceRange = Math.max(...bars.map(b => b.high)) - Math.min(...bars.map(b => b.low));
    const avgPricePerBar = priceRange / bars.length;
    const angles = [
      { name: '1x1', ratio: 1.0, color: '#3B82F6', width: 3 },
      { name: '2x1', ratio: 2.0, color: '#A855F7', width: 2 },
      { name: '1x2', ratio: 0.5, color: '#FF0055', width: 2 },
      { name: '3x1', ratio: 3.0, color: '#F5A623', width: 1 },
      { name: '1x3', ratio: 0.333, color: '#00E676', width: 1 },
    ];
    const direction = isBullish ? 1 : -1;
    const barsToProject = Math.min(extension, bars.length - pivotIndex);

    angles.forEach(angle => {
      try {
        const lineSeries = chartRef.current.addLineSeries({
          color: angle.color, lineWidth: angle.width, lineStyle: 0,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: angle.name,
        });
        const lineData = [{ time: bars[pivotIndex].timestamp / 1000, value: pivotPrice }];
        for (let i = 1; i <= barsToProject; i++) {
          const barIndex = pivotIndex + i;
          if (barIndex >= bars.length) break;
          lineData.push({
            time: bars[barIndex].timestamp / 1000,
            value: pivotPrice + (i * avgPricePerBar * angle.ratio * direction)
          });
        }
        if (lineData.length >= 2) {
          lineSeries.setData(lineData);
          gannLineSeriesRef.current.push(lineSeries);
        }
      } catch (e) {}
    });
  };

  useEffect(() => {
    // Use refs so cleanup always has access to the latest instances
    let retryTimer;
    let chartInst = null;
    let handleResize = null;
    let roInst = null;

    const initChart = () => {
      if (!chartContainerRef.current) return;
      const h = chartContainerRef.current.clientHeight;
      if (h < 10) {
        retryTimer = setTimeout(initChart, 40);   // retry until layout settles
        return;
      }
      const isDark = document.documentElement.classList.contains('dark');
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: h,
        layout: {
          background: { color: isDark ? '#0A0A0A' : '#FFFFFF' },
          textColor: isDark ? '#52525B' : '#64748B',
        },
        grid: {
          vertLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
          horzLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
        },
        rightPriceScale: { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)', mode: semiLogScale ? 2 : 0, minimumWidth: 70 },
        timeScale: { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)', timeVisible: true, rightOffset: 10, barSpacing: 6, minBarSpacing: 0.5 },
        crosshair: { mode: 1 },
        localization: { locale: 'en-US' },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      });
      chartInst = chart;
      chartRef.current = chart;

      const cs = chart.addCandlestickSeries({
        upColor: '#00E676', downColor: '#FF3B30', borderVisible: false,
        wickUpColor: '#00E676', wickDownColor: '#FF3B30',
      });
      candlestickSeriesRef.current = cs;

      // EMA 9 (fast) + EMA 21 (slow) line series — always-on indicator
      ema9SeriesRef.current = chart.addLineSeries({
        color: hexToRgba(EMA_FAST_COLOR, 0.85),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: 'EMA 9',
        crosshairMarkerVisible: false,
      });
      ema21SeriesRef.current = chart.addLineSeries({
        color: hexToRgba(EMA_SLOW_COLOR, 0.85),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: 'EMA 21',
        crosshairMarkerVisible: false,
      });

      chart.timeScale().fitContent();

      handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          try {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
              height: chartContainerRef.current.clientHeight,
            });
          } catch (e) { /* chart may have been disposed */ }
        }
      };
      window.addEventListener('resize', handleResize);

      // ResizeObserver — fires when container height changes (OrderFlow expand/collapse)
      roInst = new ResizeObserver(handleResize);
      roInst.observe(chartContainerRef.current);
    };

    initChart();

    // useEffect cleanup — always runs, even if chart was never created
    return () => {
      clearTimeout(retryTimer);
      if (handleResize) window.removeEventListener('resize', handleResize);
      if (roInst) roInst.disconnect();
      clearGannLines();
      clearTrendLines();
      if (chartInst) chartInst.remove();
      // Null out refs so animation loops & other effects don't call into a disposed chart
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      ema9SeriesRef.current = null;
      ema21SeriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chartRef.current) try { chartRef.current.applyOptions({ rightPriceScale: { mode: semiLogScale ? 2 : 0 } }); } catch (e) {}
  }, [semiLogScale]);

  // Update chart colors when theme changes
  useEffect(() => {
    if (!chartRef.current) return;
    const isDark = theme === 'dark';
    try {
      chartRef.current.applyOptions({
        layout: {
          background: { color: isDark ? '#0A0A0A' : '#FFFFFF' },
          textColor: isDark ? '#52525B' : '#64748B',
        },
        grid: {
          vertLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
          horzLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' },
        },
        rightPriceScale: { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)' },
        timeScale: { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)' },
      });
    } catch (e) { /* chart may be disposed */ }
  }, [theme]);

  useEffect(() => {
    if (!stockData || !candlestickSeriesRef.current) return;
    const bars = stockData.bars;
    const patterns = patternsActive ? detectCandlePatterns(bars) : new Array(bars.length).fill(null);
    const chartData = bars.map((bar, i) => {
      const base = { time: bar.timestamp / 1000, open: bar.open, high: bar.high, low: bar.low, close: bar.close };
      const t = patterns[i];
      if (t && PATTERN_COLORS[t.category]) {
        const c = PATTERN_COLORS[t.category];
        return { ...base, color: c, borderColor: c, wickColor: c };
      }
      return base;
    });
    candlestickSeriesRef.current.setData(chartData);
    try { chartRef.current.timeScale().fitContent(); } catch (e) { /* chart may be disposed */ }

    // Track most recent pattern hit for on-chart badge
    let recent = null;
    for (let i = patterns.length - 1; i >= Math.max(0, patterns.length - 5); i--) {
      if (patterns[i]) { recent = { ...patterns[i], barsAgo: (patterns.length - 1) - i }; break; }
    }
    setLastPattern(recent);
  }, [stockData, patternsActive]);

  // ── EMA 9 / 21 update + crossover detection ────────────────────
  useEffect(() => {
    if (!stockData?.bars?.length || !ema9SeriesRef.current || !ema21SeriesRef.current) return;
    const bars = stockData.bars;
    const closes = bars.map(b => b.close);
    const ema9  = computeEMA(closes, 9);
    const ema21 = computeEMA(closes, 21);

    const ema9Data = [];
    const ema21Data = [];
    for (let i = 0; i < bars.length; i++) {
      const t = bars[i].timestamp / 1000;
      if (ema9[i]  != null) ema9Data.push({  time: t, value: ema9[i]  });
      if (ema21[i] != null) ema21Data.push({ time: t, value: ema21[i] });
    }
    ema9SeriesRef.current.setData(ema9Data);
    ema21SeriesRef.current.setData(ema21Data);

    // Crossover detection — pick most recent cross within last 5 bars
    const sig = detectEmaCross(bars, ema9, ema21, 5);
    setEmaSignal(sig);

    // Update EMA marker ref and re-merge with strategy markers
    emaMarkerRef.current = sig ? [{
      time: sig.time,
      position: sig.type === 'BUY' ? 'belowBar' : 'aboveBar',
      color: sig.type === 'BUY' ? '#10B981' : '#EF4444',
      shape: sig.type === 'BUY' ? 'arrowUp' : 'arrowDown',
      text: sig.type === 'BUY' ? 'BUY 9/21' : 'SELL 9/21',
    }] : [];
    if (candlestickSeriesRef.current) {
      const merged = [...emaMarkerRef.current, ...strategyMarkersLocalRef.current]
        .sort((a, b) => a.time - b.time);
      try { candlestickSeriesRef.current.setMarkers(merged); } catch (e) { /* ignore */ }
    }
  }, [stockData]);

  // ── EMA: toggle visibility ─────────────────────────────────────
  useEffect(() => {
    try {
      if (ema9SeriesRef.current)  ema9SeriesRef.current.applyOptions({  visible: emaActive });
      if (ema21SeriesRef.current) ema21SeriesRef.current.applyOptions({ visible: emaActive });
    } catch (e) { /* series may be disposed */ }
  }, [emaActive]);

  // ── Strategy Markers from Vibe Research ────────────────────────
  // Merge with EMA markers and apply to candlestick series
  useEffect(() => {
    strategyMarkersLocalRef.current = strategyMarkers || [];
    if (!candlestickSeriesRef.current) return;
    const merged = [...emaMarkerRef.current, ...strategyMarkersLocalRef.current]
      .sort((a, b) => a.time - b.time);
    try { candlestickSeriesRef.current.setMarkers(merged); } catch (e) { /* ignore */ }
  }, [strategyMarkers]);

  // ── Auto Trendlines — draw / clear on toggle, filter, or stock change ─
  useEffect(() => {
    clearTrendLines();
    if (!trendlinesActive || !chartRef.current || !stockData?.bars?.length) {
      setTrendlineCount(0);
      return;
    }
    const allLines = detectTrendlines(stockData.bars);
    const lines = allLines.filter(l => trendFilter.has(l.type));
    setTrendlineCount(lines.length);
    lines.forEach(line => {
      try {
        const s = chartRef.current.addLineSeries({
          color: line.color,
          lineWidth: line.lineWidth,
          lineStyle: line.lineStyle,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: line.label,
        });
        s.setData([
          { time: line.startTs, value: line.startPrice },
          { time: line.endTs,   value: line.endPrice   },
        ]);
        trendLineSeriesRef.current.push(s);
      } catch (e) {}
    });
    // Store ALL horizontal lines (with stats) for SR Stats canvas
    srStatsDataRef.current = lines.filter(l =>
      (l.type === 'h_support' || l.type === 'h_resistance' || l.type === 'fibonacci') && l.stats
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockData, trendlinesActive, trendFilter]);

  // ── MTF Direction fetch — triggers when stock changes ─────────
  useEffect(() => {
    const ticker = selectedStock?.ticker || selectedStock?.symbol;
    if (ticker) fetchMtfDirection(ticker);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStock]);

  // ── Parity Trade Signal Lines (Buy/Sell/SL/Target) ────────────
  useEffect(() => {
    const series = candlestickSeriesRef.current;
    // Clear old lines
    tradeSignalLinesRef.current.forEach(pl => { try { series?.removePriceLine(pl); } catch(e) {} });
    tradeSignalLinesRef.current = [];
    if (!tradeSignal || !series) return;
    const { direction, entry, sl, target } = tradeSignal;
    const isBuy = direction === 'BUY';
    const defs = [
      { price: entry,  color: isBuy ? '#3B82F6' : '#F59E0B', title: `${direction} ENTRY`, lineStyle: 0, lineWidth: 2 },
      { price: sl,     color: '#FF3B30',                      title: 'SL',                lineStyle: 2, lineWidth: 1 },
      { price: target, color: '#00E676',                      title: 'TARGET',             lineStyle: 2, lineWidth: 1 },
    ];
    tradeSignalLinesRef.current = defs.map(d => {
      try {
        return series.createPriceLine({ price: d.price, color: d.color, lineWidth: d.lineWidth, lineStyle: d.lineStyle, axisLabelVisible: true, title: d.title });
      } catch(e) { return null; }
    }).filter(Boolean);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeSignal, stockData]);

  // ── Volume Profile: fetch only when user enables VP (or stock changes while VP is on) ──
  useEffect(() => {
    clearVPLines();
    vpDataRef.current = null;
    setVpActive(false);
    setVpTooltip(null);
    if (!vpEnabled || !stockData?.bars?.length) return;
    const ticker = selectedStock?.ticker || selectedStock?.symbol || 'STOCK';
    const t = setTimeout(() => fetchVolumeProfile(stockData.bars, ticker), 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockData, selectedStock, vpEnabled]);

  // ── Volume Profile: animation loop ────────────────────────────
  useEffect(() => {
    if (!vpActive) {
      if (vpAnimRef.current) cancelAnimationFrame(vpAnimRef.current);
      return;
    }
    const loop = () => {
      drawVPCanvas();
      vpAnimRef.current = requestAnimationFrame(loop);
    };
    vpAnimRef.current = requestAnimationFrame(loop);
    return () => { if (vpAnimRef.current) cancelAnimationFrame(vpAnimRef.current); };
  }, [vpActive, drawVPCanvas]);

  // ── SMC: helper to merge multiple TF layers into one draw set ──
  const mergeSmcLayers = (cache) => {
    const merged = {
      fvgs: [], swings: [], obs: [], bosChoch: [],
      supplyZones: [], demandZones: [], wyckoffPhases: [],
      manipulations: [], refinedEntries: [], pdZone: null,
    };
    Object.values(cache).forEach(layer => {
      if (!layer) return;
      ['fvgs','swings','obs','bosChoch','supplyZones','demandZones',
       'wyckoffPhases','manipulations','refinedEntries'].forEach(k => {
        if (Array.isArray(layer[k])) merged[k].push(...layer[k]);
      });
      if (!merged.pdZone && layer.pdZone) merged.pdZone = layer.pdZone;
    });
    return merged;
  };

  // ── SMC: toggle / clear helpers ────────────────────────────────
  const toggleSmcLayer = (label) => {
    setSmcLayers(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
    if (!smcActive) setSmcActive(true);
  };
  const clearAllSmcLayers = () => {
    setSmcLayers(new Set());
    smcLayerCacheRef.current = {};
    smcDataRef.current = null;
  };

  // ── SMC: when a new stock is selected, auto-mark default TF layers ─
  // 4H direction/levels/supply-demand · 1H BOS/OB/FVG/liquidity · 15M reversal/confirmation
  useEffect(() => {
    if (!selectedStock) return;
    setSmcLayers(new Set(SMC_AUTO_DEFAULT_LAYERS));
    setSmcActive(true);
  }, [selectedStock]);

  // ── SMC: compute each active layer when bars or layer-set change ─
  useEffect(() => {
    if (!stockData?.bars?.length || smcLayers.size === 0) {
      smcDataRef.current = null;
      smcLayerCacheRef.current = {};
      return;
    }
    const cache = {};
    smcLayers.forEach(label => {
      const opt = SMC_TF_OPTIONS.find(o => o.label === label);
      const bars = (opt && opt.minutes)
        ? resampleBars(stockData.bars, opt.minutes)
        : stockData.bars;
      const smc = computeSMCData(bars);
      // Tag every item with its source TF for badge rendering
      ['fvgs','swings','obs','bosChoch','supplyZones','demandZones',
       'wyckoffPhases','manipulations','refinedEntries'].forEach(k => {
        if (Array.isArray(smc[k])) smc[k] = smc[k].map(x => ({ ...x, _tf: label }));
      });
      if (smc.pdZone) smc.pdZone = { ...smc.pdZone, _tf: label };

      // Per-TF feature whitelist: only keep features that belong to this TF's role.
      const allow = SMC_TF_FEATURE_MAP[label];
      if (allow) {
        ['fvgs','swings','obs','bosChoch','supplyZones','demandZones',
         'wyckoffPhases','manipulations','refinedEntries'].forEach(k => {
          if (!allow.has(k)) smc[k] = [];
        });
        if (!allow.has('pdZone')) smc.pdZone = null;
      }
      cache[label] = smc;
    });
    smcLayerCacheRef.current = cache;
    smcDataRef.current = mergeSmcLayers(cache);
  }, [stockData, smcLayers]);

  // ── SMC: animation loop ────────────────────────────────────────
  useEffect(() => {
    if (!smcActive) {
      if (smcAnimRef.current) cancelAnimationFrame(smcAnimRef.current);
      const c = smcCanvasRef.current;
      if (c) { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
      return;
    }
    const loop = () => { drawSMCCanvas(); smcAnimRef.current = requestAnimationFrame(loop); };
    smcAnimRef.current = requestAnimationFrame(loop);
    return () => { if (smcAnimRef.current) cancelAnimationFrame(smcAnimRef.current); };
  }, [smcActive, drawSMCCanvas]);

  // ── Black Box: compute ──────────────────────────────────────────
  useEffect(() => {
    if (!bbActive || !stockData?.bars?.length) { bbDataRef.current = null; return; }
    bbDataRef.current = computeBlackBox(stockData.bars);
  }, [stockData, bbActive]);

  // ── REJ: compute signal on data/toggle change ───────────────────
  useEffect(() => {
    if (!rejActive || !stockData?.bars?.length) { rejDataRef.current = null; return; }
    rejDataRef.current = detectRejectionConfirmSetup(stockData.bars);
  }, [stockData, rejActive]);

  // ── OI Indicator: fetch data ─────────────────────────────────────
  const fetchOIData = useCallback(async () => {
    setOiLoading(true);
    try {
      const res  = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/oi-indicator/nifty`);
      const json = await res.json();
      setOiData(json);
    } catch { setOiData(null); }
    finally  { setOiLoading(false); }
  }, []);

  useEffect(() => {
    if (oiPanelOpen && !oiData) fetchOIData();
  }, [oiPanelOpen, oiData, fetchOIData]);

  // ── OI: clear & draw price lines on chart ────────────────────────
  const clearOILines = useCallback(() => {
    oiPriceLinesRef.current.forEach(pl => {
      try { candlestickSeriesRef.current?.removePriceLine(pl); } catch(e) {}
    });
    oiPriceLinesRef.current = [];
  }, []);

  // Only re-run when toggle state or data changes — NOT on every stockData update
  useEffect(() => {
    clearOILines();
    if (!oiLinesOn || !oiData || !candlestickSeriesRef.current) return;

    // Draw Call Wall, Put Wall, Max Pain as horizontal price lines
    const lineDefs = [
      { price: oiData.call_wall, color: '#ef4444', title: 'Call Wall ▼', style: 2, width: 1 },
      { price: oiData.put_wall,  color: '#22c55e', title: 'Put Wall  ▲', style: 2, width: 1 },
      { price: oiData.max_pain,  color: '#f59e0b', title: 'Max Pain  ●', style: 3, width: 1 },
    ];
    lineDefs.forEach(({ price, color, title, style, width }) => {
      if (!price) return;
      try {
        const pl = candlestickSeriesRef.current.createPriceLine({
          price, color, lineWidth: width, lineStyle: style,
          axisLabelVisible: true, title,
        });
        oiPriceLinesRef.current.push(pl);
      } catch(e) {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oiLinesOn, oiData, clearOILines]);

  // ── Black Box: draw canvas ──────────────────────────────────────
  const drawBBCanvas = useCallback(() => {
    const canvas = bbCanvasRef.current;
    const chart  = chartRef.current;
    const series = candlestickSeriesRef.current;
    const bbData = bbDataRef.current;
    if (!canvas || !chart || !series) return;
    const container = chartContainerRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (!bbData) { ctx.restore(); return; }

    let ts;
    try { ts = chart.timeScale(); } catch (e) { ctx.restore(); return; }
    const toX = t => { try { return ts.timeToCoordinate(t);  } catch { return null; } };
    const toY = p => { try { return series.priceToCoordinate(p); } catch { return null; } };

    const { trend, boxes = [], swingLabels } = bbData;

    // ── Draw swing labels (HH / HL / LH / LL) ─────────────────
    (swingLabels || []).forEach(sw => {
      const x = toX(sw.ts);
      const y = sw.swType === 'high' ? toY(sw.price) : toY(sw.price);
      if (x == null || y == null) return;
      const lbl = sw.label || '';
      if (!['HH','HL','LH','LL'].includes(lbl)) return;
      const isBull = lbl === 'HH' || lbl === 'HL';
      ctx.save();
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = isBull ? 'rgba(34,197,94,0.95)' : 'rgba(248,113,113,0.95)';
      ctx.fillText(lbl, x - 8, y + (sw.swType === 'high' ? -10 : 12));
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = isBull ? 'rgba(34,197,94,0.7)' : 'rgba(248,113,113,0.7)';
      ctx.fill();
      ctx.restore();
    });

    // ── Draw each Black Box ────────────────────────────────────
    // Collect all right-side labels first to avoid overlap
    const rightLabels = [];  // {y, text, color, bg}
    const LABEL_H = 13;

    const claimY = (yRaw) => {
      if (yRaw == null) return null;
      let y = yRaw;
      for (const lbl of rightLabels) {
        if (Math.abs(y - lbl.y) < LABEL_H + 2) y = lbl.y + LABEL_H + 3;
      }
      return y;
    };

    boxes.forEach(box => {
      const isBull = box.type === 'bull';
      const xStart = toX(box.startTs);
      const yHigh  = toY(box.boxHigh);
      const yLow   = toY(box.boxLow);
      const yMid   = box.boxMid ? toY(box.boxMid) : null;

      if (yHigh == null || yLow == null) return;

      const PRICE_SCALE_W = 82; // right price axis width — keep box from overlapping it
      const left  = (xStart != null && xStart > 0) ? xStart : 0;
      const right = W - PRICE_SCALE_W;
      const boxW  = Math.max(4, right - left);
      const top   = Math.min(yHigh, yLow);
      const boxH  = Math.max(4, Math.abs(yHigh - yLow));

      ctx.save();
      // Tinted fill — low opacity so candles stay visible
      ctx.fillStyle   = isBull ? 'rgba(34,197,94,0.10)' : 'rgba(248,113,113,0.10)';
      ctx.strokeStyle = isBull ? 'rgba(34,197,94,0.90)' : 'rgba(248,113,113,0.90)';
      ctx.lineWidth   = 1.8;
      ctx.fillRect(left, top, boxW, boxH);
      ctx.strokeRect(left, top, boxW, boxH);

      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('BLACK BOX', left + 5, top + 13);
      ctx.fillStyle = isBull ? 'rgba(34,197,94,0.85)' : 'rgba(248,113,113,0.85)';
      ctx.font = '7px monospace';
      ctx.fillText(box.label, left + 5, top + 23);
      if (box.confirm) {
        ctx.fillStyle = 'rgba(250,204,21,0.95)';
        ctx.font = 'bold 7px monospace';
        ctx.fillText(`✓ ${box.confirm}`, left + 5, top + 33);
      }
      if (yMid != null) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.30)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath(); ctx.moveTo(left, yMid); ctx.lineTo(right, yMid); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      // ── Helper: draw dashed line + right label pill ──────────
      const drawLevel = (price, lineColor, lblText, lblBg, lblTxt) => {
        const yRaw = toY(price);
        if (yRaw == null || yRaw < 0 || yRaw > H) return;
        // Line stops before price scale
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, yRaw); ctx.lineTo(right, yRaw); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // Label queued for collision-safe draw later
        const y = claimY(yRaw);
        if (y != null) rightLabels.push({ y, text: lblText, bg: lblBg, txt: lblTxt, yLine: yRaw });
      };

      if (box.bosLevel) drawLevel(box.bosLevel, 'rgba(251,191,36,0.75)',
        box.bos ? `BOS ✓` : `BOS`, 'rgba(251,191,36,0.85)', '#000');
      if (box.target)   drawLevel(box.target,   'rgba(34,197,94,0.65)',
        `${isBull ? '▲' : '▼'} Target ${box.target.toFixed(0)}`, 'rgba(34,197,94,0.85)', '#fff');
      if (box.sl)       drawLevel(box.sl,        'rgba(239,68,68,0.65)',
        `✕ SL ${box.sl.toFixed(0)}`, 'rgba(239,68,68,0.85)', '#fff');

      if (box.inBox) {
        const eY = isBull ? toY(box.boxLow) : toY(box.boxHigh);
        if (eY != null) {
          ctx.save();
          ctx.fillStyle = isBull ? 'rgba(34,197,94,0.95)' : 'rgba(248,113,113,0.95)';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(isBull ? '▲ ENTRY' : '▼ ENTRY', right - 55, eY + 3);
          ctx.restore();
        }
      }
    });

    // ── Render all right-side labels (collision-safe, inside chart area) ──────────
    const PRICE_SCALE_W_OUTER = 82;
    ctx.save();
    ctx.font = 'bold 7.5px monospace';
    rightLabels.forEach(({ y, text, bg, txt }) => {
      const tw  = ctx.measureText(text).width;
      // Keep pills inside chart — don't overflow into price scale
      const rx  = W - PRICE_SCALE_W_OUTER - tw - 6;
      const ry  = y - 9;
      // Pill background
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(rx - 2, ry, tw + 8, LABEL_H, 2);
      else ctx.rect(rx - 2, ry, tw + 8, LABEL_H);
      ctx.fill();
      // Text
      ctx.fillStyle = txt;
      ctx.fillText(text, rx + 1, ry + 9.5);
    });
    ctx.restore();

    // ── Trend label top-left ───────────────────────────────────
    ctx.save();
    ctx.font      = 'bold 9px monospace';
    const trendColor = trend === 'UPTREND' ? 'rgba(34,197,94,0.9)'
                     : trend === 'DOWNTREND' ? 'rgba(248,113,113,0.9)'
                     : 'rgba(148,163,184,0.7)';
    ctx.fillStyle = trendColor;
    ctx.fillText(`BB: ${trend}`, 8, 18);
    ctx.restore();

    ctx.restore();
  }, []);

  // ── Black Box: animation loop ───────────────────────────────────
  useEffect(() => {
    if (!bbActive) {
      if (bbAnimRef.current) cancelAnimationFrame(bbAnimRef.current);
      const c = bbCanvasRef.current;
      if (c) { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
      return;
    }
    const loop = () => { drawBBCanvas(); bbAnimRef.current = requestAnimationFrame(loop); };
    bbAnimRef.current = requestAnimationFrame(loop);
    return () => { if (bbAnimRef.current) cancelAnimationFrame(bbAnimRef.current); };
  }, [bbActive, drawBBCanvas]);

  // ── REJ: draw canvas ─────────────────────────────────────────────
  const drawREJCanvas = useCallback(() => {
    const canvas  = rejCanvasRef.current;
    const chart   = chartRef.current;
    const series  = candlestickSeriesRef.current;
    const signal  = rejDataRef.current;
    if (!canvas || !chart || !series) return;
    const container = chartContainerRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (!signal) {
      // No signal — show "No REJ setup found" badge top-left
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.fillText('REJ: No setup found', 8, 18);
      ctx.restore();
      return;
    }

    let ts;
    try { ts = chart.timeScale(); } catch (e) { ctx.restore(); return; }
    const toX = t => { try { return ts.timeToCoordinate(t); } catch { return null; } };
    const toY = p => { try { return series.priceToCoordinate(p); } catch { return null; } };

    const PRICE_SCALE_W = 82;
    const isBuy    = signal.type === 'BUY';
    const mainCol  = isBuy ? '#22c55e' : '#ef4444';
    const pendCol  = '#eab308';
    const statusCol = signal.status === 'CONFIRMED' ? mainCol : pendCol;
    const rej = signal.rejection;

    // ── Draw 15m rejection candle box ────────────────────────────
    const rejX = toX(rej.time);
    const rejYHigh = toY(rej.rejectionHigh);
    const rejYLow  = toY(rej.rejectionLow);
    if (rejX != null && rejYHigh != null && rejYLow != null) {
      const boxTop = Math.min(rejYHigh, rejYLow);
      const boxH   = Math.max(4, Math.abs(rejYHigh - rejYLow));
      // Estimated candle width ≈ 12px
      const candleW = 12;
      ctx.save();
      ctx.strokeStyle = `${mainCol}cc`;
      ctx.fillStyle   = `${mainCol}18`;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.fillRect(rejX - candleW, boxTop, candleW * 2, boxH);
      ctx.strokeRect(rejX - candleW, boxTop, candleW * 2, boxH);
      ctx.setLineDash([]);
      // Label inside box
      ctx.fillStyle = `${mainCol}ee`;
      ctx.font = 'bold 7px monospace';
      ctx.fillText(isBuy ? '15m ▼Wick' : '15m ▲Wick', rejX - candleW + 2, boxTop + 10);
      ctx.restore();
    }

    // ── Draw 1m confirmation candle highlight ─────────────────────
    if (signal.confirm) {
      const confX = toX(signal.confirm.time);
      const confBar = signal.confirm.bar;
      if (confX != null && confBar) {
        const confYH = toY(confBar.high);
        const confYL = toY(confBar.low);
        if (confYH != null && confYL != null) {
          const cTop = Math.min(confYH, confYL);
          const cH   = Math.max(3, Math.abs(confYH - confYL));
          ctx.save();
          ctx.strokeStyle = '#fde68a';
          ctx.fillStyle   = 'rgba(253,230,138,0.15)';
          ctx.lineWidth   = 1.5;
          ctx.fillRect(confX - 5, cTop, 10, cH);
          ctx.strokeRect(confX - 5, cTop, 10, cH);
          ctx.fillStyle = '#fde68a';
          ctx.font = 'bold 7px monospace';
          ctx.fillText('1m✓', confX - 8, cTop - 3);
          ctx.restore();
        }
      }
    }

    // ── Helper: draw dashed horizontal line + right-side pill ────
    const rightLabels = [];
    const LABEL_H = 13;
    const claimY = (yRaw) => {
      if (yRaw == null) return null;
      let y = yRaw;
      for (const l of rightLabels) {
        if (Math.abs(y - l.y) < LABEL_H + 2) y = l.y + LABEL_H + 3;
      }
      return y;
    };

    const drawLevel = (price, lineColor, pillText, pillBg, pillTxt, fromX) => {
      const yRaw = toY(price);
      if (yRaw == null || yRaw < 0 || yRaw > H) return;
      const xStart = fromX != null ? Math.max(0, fromX) : 0;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(xStart, yRaw);
      ctx.lineTo(W - PRICE_SCALE_W, yRaw);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      const y = claimY(yRaw);
      if (y != null) rightLabels.push({ y, text: pillText, bg: pillBg, txt: pillTxt, yLine: yRaw });
    };

    const entryFromX = signal.confirm ? toX(signal.confirm.time) : (rejX != null ? rejX : null);

    // Entry line
    drawLevel(signal.entry, `${mainCol}cc`,
      `${isBuy ? '▲' : '▼'} ENTRY ${signal.entry.toFixed(1)}`,
      mainCol, '#000', entryFromX);

    // Target line
    drawLevel(signal.target, 'rgba(34,197,94,0.7)',
      `✦ TGT ${signal.target.toFixed(1)} (1:2)`,
      'rgba(34,197,94,0.85)', '#fff', entryFromX);

    // SL line
    drawLevel(signal.sl, 'rgba(239,68,68,0.7)',
      `✕ SL  ${signal.sl.toFixed(1)}`,
      'rgba(239,68,68,0.85)', '#fff', entryFromX);

    // ── Render right-side pills (collision-safe) ────────────────
    ctx.save();
    ctx.font = 'bold 7.5px monospace';
    rightLabels.forEach(({ y, text, bg, txt }) => {
      const tw = ctx.measureText(text).width;
      const rx = W - PRICE_SCALE_W - tw - 8;
      const ry = y - 9;
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(rx - 2, ry, tw + 8, LABEL_H, 2);
      else ctx.rect(rx - 2, ry, tw + 8, LABEL_H);
      ctx.fill();
      ctx.fillStyle = txt;
      ctx.fillText(text, rx + 1, ry + 9.5);
    });
    ctx.restore();

    // ── Status badge top-left ────────────────────────────────────
    ctx.save();
    ctx.font = 'bold 9px monospace';
    const badge1 = `REJ: ${signal.type}  ${signal.status}`;
    const badge2 = signal.status === 'CONFIRMED'
      ? `Entry ${signal.entry.toFixed(1)}  SL ${signal.sl.toFixed(1)}  TGT ${signal.target.toFixed(1)}`
      : `${rej.name} — awaiting 1m confirm`;
    ctx.fillStyle = statusCol;
    ctx.fillText(badge1, 8, 18);
    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    ctx.font = '7.5px monospace';
    ctx.fillText(badge2, 8, 30);
    ctx.restore();

    ctx.restore();
  }, []);

  // ── REJ: animation loop ──────────────────────────────────────────
  useEffect(() => {
    if (!rejActive) {
      if (rejAnimRef.current) cancelAnimationFrame(rejAnimRef.current);
      const c = rejCanvasRef.current;
      if (c) { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
      return;
    }
    const loop = () => { drawREJCanvas(); rejAnimRef.current = requestAnimationFrame(loop); };
    rejAnimRef.current = requestAnimationFrame(loop);
    return () => { if (rejAnimRef.current) cancelAnimationFrame(rejAnimRef.current); };
  }, [rejActive, drawREJCanvas]);

  // ── S/R Stats canvas: animate when trendlines are on ──────────
  useEffect(() => {
    if (srStatsAnimRef.current) cancelAnimationFrame(srStatsAnimRef.current);
    if (!trendlinesActive) {
      const c = srStatsCanvasRef.current;
      if (c) { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
      return;
    }
    const loop = () => { drawSRStatsCanvas(); srStatsAnimRef.current = requestAnimationFrame(loop); };
    srStatsAnimRef.current = requestAnimationFrame(loop);
    return () => { if (srStatsAnimRef.current) cancelAnimationFrame(srStatsAnimRef.current); };
  }, [trendlinesActive, drawSRStatsCanvas]);

  useEffect(() => {
    if (showGannLines && pivotPoint && stockData) {
      setTimeout(() => drawGannLines(pivotPoint, lineExtension), 50);
    } else { clearGannLines(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotPoint, showGannLines, stockData, lineExtension]);

  const handleChartClick = (param) => {
    if (!stockData || !param.time) return;
    const clickedTime = param.time * 1000;
    const bar = stockData.bars.find(b => Math.abs(b.timestamp - clickedTime) < 86400000);
    if (!bar) return;
    if (isMovingMode && pivotPoint) {
      const price = pivotPoint.type === 'high' ? bar.high : bar.low;
      onPivotSelect({ price, timestamp: bar.timestamp, type: pivotPoint.type });
      return;
    }
    if (selectMode) {
      const price = selectMode === 'high' ? bar.high : bar.low;
      onPivotSelect({ price, timestamp: bar.timestamp, type: selectMode });
      setSelectMode(null);
      setIsMovingMode(true);
    }
  };

  useEffect(() => {
    if (!chartRef.current) return;
    try { chartRef.current.subscribeClick(handleChartClick); } catch (e) {}
    return () => { if (chartRef.current) { try { chartRef.current.unsubscribeClick(handleChartClick); } catch (e) {} } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode, stockData, isMovingMode, pivotPoint]);

  const handleDeleteGann = () => { onPivotSelect(null); clearGannLines(); setIsMovingMode(false); };

  // Fullscreen: ESC to exit + chart resize trigger
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setIsFullscreen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // TF dropdown: close on outside click (works on mobile touch too)
  useEffect(() => {
    const handler = (e) => {
      if (
        !(tfBtnRef.current && tfBtnRef.current.contains(e.target)) &&
        !(tfDropdownRef.current && tfDropdownRef.current.contains(e.target))
      ) setTfOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // SMC Timeframe dropdown: close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        !(smcTfBtnRef.current && smcTfBtnRef.current.contains(e.target)) &&
        !(smcTfDropdownRef.current && smcTfDropdownRef.current.contains(e.target))
      ) setSmcTfOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Trend filter dropdown: close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        !(trendFilterBtnRef.current && trendFilterBtnRef.current.contains(e.target)) &&
        !(trendFilterDropdownRef.current && trendFilterDropdownRef.current.contains(e.target))
      ) setTrendFilterOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (chartRef.current && chartContainerRef.current) {
        try {
          chartRef.current.applyOptions({
            width:  chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        } catch (e) { /* chart may be disposed */ }
      }
    }, 60);
    return () => clearTimeout(t);
  }, [isFullscreen]);

  return (
    <div
      className={`flex flex-col ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] bg-white dark:bg-[#0A0A0A]'
          : 'h-full'
      }`}
      data-testid="chart-panel"
    >
      {/* Chart Toolbar — scrollable row on mobile */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A] shrink-0 gap-1 overflow-x-auto scrollbar-none transition-colors duration-200">
        <div className="flex items-center gap-1 flex-nowrap shrink-0">
          {/* TF Selector — TradingView style grouped dropdown */}
          <div className="shrink-0">
            <button
              ref={tfBtnRef}
              onClick={() => {
                if (!tfOpen && tfBtnRef.current) {
                  const rect = tfBtnRef.current.getBoundingClientRect();
                  const dropW = 170;
                  const left = Math.min(rect.left, window.innerWidth - dropW - 8);
                  setTfDropdownPos({ top: rect.bottom + 4, left: Math.max(8, left) });
                }
                setTfOpen(p => !p);
              }}
              className={`px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all border shrink-0 ${
                tfOpen
                  ? 'bg-slate-700 dark:bg-zinc-600 text-white border-slate-500 dark:border-white/30'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 border-slate-300 dark:border-white/15 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
              data-testid="tf-trigger"
            >
              {timeframe.label}
              <span className={`text-[8px] transition-transform duration-200 ${tfOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {tfOpen && (
              <div
                ref={tfDropdownRef}
                className="bg-white dark:bg-[#1C1C1C] border border-slate-200 dark:border-white/10 shadow-2xl"
                style={{
                  position: 'fixed',
                  top: tfDropdownPos.top,
                  left: tfDropdownPos.left,
                  zIndex: 9999,
                  minWidth: 170,
                  maxHeight: 420,
                  overflowY: 'auto',
                }}
              >
                {TF_GROUPS.map(grp => (
                  <div key={grp.group}>
                    <div className="px-3 pt-2.5 pb-0.5 text-[9px] font-bold tracking-widest text-slate-400 dark:text-zinc-500 uppercase select-none">
                      {grp.group}
                    </div>
                    {grp.items.map(tf => (
                      <button
                        key={tf.label}
                        onClick={() => { onTimeframeChange(tf); setTfOpen(false); }}
                        className={`w-full text-left px-3 py-[7px] text-[13px] font-medium transition-colors ${
                          timeframe.label === tf.label
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/8'
                        }`}
                        data-testid={`tf-${tf.label}`}
                      >
                        {tf.displayName}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1 shrink-0" />
          {/* Gann toggle */}
          <button
            onClick={() => setShowGannLines(!showGannLines)}
            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
              showGannLines ? 'text-[#3B82F6]' : 'text-zinc-500'
            }`}
            data-testid="gann-toggle"
          >
            <ChartLine size={12} weight="bold" />
            <span className="hidden sm:inline">GANN</span>
          </button>
          {/* EMA 9/21 toggle (fixed opacity 0.85) */}
          <button
            onClick={() => setEmaActive(!emaActive)}
            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 border ${
              emaActive
                ? 'text-[#22D3EE] border-[#22D3EE]/40 bg-[#22D3EE]/8'
                : 'text-zinc-500 border-transparent'
            }`}
            data-testid="ema-toggle"
            title="EMA 9 (fast) vs EMA 21 (slow) crossover — BUY/SELL live signal"
          >
            EMA 9/21
          </button>
          {/* Candlestick Pattern color highlighting */}
          <button
            onClick={() => setPatternsActive(!patternsActive)}
            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 border ${
              patternsActive
                ? 'text-[#FBBF24] border-[#FBBF24]/40 bg-[#FBBF24]/8'
                : 'text-zinc-500 border-transparent'
            }`}
            data-testid="patterns-toggle"
            title="Candlestick patterns — Yellow: Bullish reversal · Orange: Bearish reversal · Blue: Continuation"
          >
            PATTERNS
          </button>
          {/* Auto Trendlines — split button: toggle + type filter dropdown */}
          <div className="flex items-stretch shrink-0 relative">
            <button
              onClick={() => setTrendlinesActive(v => !v)}
              className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${
                trendlinesActive
                  ? 'text-[#06B6D4] border-[#06B6D4]/40 bg-[#06B6D4]/10'
                  : 'text-zinc-500 border-transparent'
              }`}
              data-testid="trendlines-toggle"
              title="Auto Trendlines — one click draws all trendline types"
            >
              TREND{trendlinesActive && trendlineCount > 0 ? ` ·${trendlineCount}` : ''}
            </button>
            <button
              ref={trendFilterBtnRef}
              onClick={() => {
                if (!trendFilterOpen && trendFilterBtnRef.current) {
                  const rect = trendFilterBtnRef.current.getBoundingClientRect();
                  const dropW = 160;
                  const left = Math.min(rect.left, window.innerWidth - dropW - 8);
                  setTrendFilterPos({ top: rect.bottom + 4, left: Math.max(8, left) });
                }
                setTrendFilterOpen(o => !o);
              }}
              className={`px-1.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border border-l-0 flex items-center gap-0.5 ${
                trendlinesActive && trendFilter.size < TREND_TYPES.length
                  ? 'text-[#06B6D4] border-[#06B6D4]/40 bg-[#06B6D4]/10'
                  : 'text-zinc-400 border-[#06B6D4]/30 bg-[#06B6D4]/4'
              }`}
              data-testid="trend-filter-btn"
              title="Filter trendline types"
            >
              {trendFilter.size === TREND_TYPES.length ? 'ALL' : `${trendFilter.size}`}
              <span className="text-[8px] leading-none">▾</span>
            </button>
            {trendFilterOpen && (
              <div
                ref={trendFilterDropdownRef}
                className="bg-black/95 border border-[#06B6D4]/40 rounded shadow-2xl py-1"
                style={{
                  position: 'fixed',
                  top: trendFilterPos.top,
                  left: trendFilterPos.left,
                  zIndex: 9999,
                  minWidth: 160,
                }}
                data-testid="trend-filter-dropdown"
              >
                <div className="px-2 py-1 text-[8px] text-zinc-500 uppercase tracking-wider border-b border-white/5">
                  Toggle types
                </div>
                {TREND_TYPES.map(t => {
                  const on = trendFilter.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTrendFilter(prev => {
                          const next = new Set(prev);
                          on ? next.delete(t.id) : next.add(t.id);
                          return next;
                        });
                      }}
                      className="w-full text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-white/5 flex items-center gap-2"
                      data-testid={`trend-type-${t.id}`}
                    >
                      <span className="w-3 h-0.5 rounded-full inline-block shrink-0" style={{ background: t.color }} />
                      <span style={{ color: on ? t.color : '#52525b' }}>{t.label}</span>
                      <span className="ml-auto text-[10px]">{on ? '✓' : ''}</span>
                    </button>
                  );
                })}
                <div className="border-t border-white/5 my-1" />
                <div className="flex gap-1 px-2 pb-1">
                  <button
                    onClick={() => setTrendFilter(new Set(TREND_TYPES.map(t => t.id)))}
                    className="flex-1 py-1 text-[9px] font-bold text-zinc-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                    data-testid="trend-filter-all"
                  >All</button>
                  <button
                    onClick={() => setTrendFilter(new Set())}
                    className="flex-1 py-1 text-[9px] font-bold text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    data-testid="trend-filter-clear"
                  >Clear</button>
                </div>
              </div>
            )}
          </div>
          {/* Black Box indicator toggle */}
          <button
            onClick={() => setBbActive(v => !v)}
            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 border ${
              bbActive
                ? 'text-[#a78bfa] border-[#a78bfa]/40 bg-[#a78bfa]/8'
                : 'text-zinc-500 border-transparent'
            }`}
            data-testid="bb-toggle"
            title="Black Box — HH/HL/LH/LL structure + BOS + Entry/SL/Target"
          >
            BB
          </button>
          {/* Volume Profile toggle — POC, VAH, VAL auto-mark */}
          <button
            onClick={() => setVpEnabled(v => !v)}
            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 border ${
              vpEnabled
                ? 'text-[#FF6B00] border-[#FF6B00]/40 bg-[#FF6B00]/8'
                : 'text-zinc-500 border-transparent'
            }`}
            data-testid="vp-toggle"
            title="Volume Profile — POC (orange), VAH (purple), VAL (cyan) auto-mark"
          >
            VP
          </button>
          {/* REJ — 15m Rejection + 1m Confirmation strategy */}
          <button
            onClick={() => setRejActive(v => !v)}
            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 border ${
              rejActive
                ? 'text-[#06b6d4] border-[#06b6d4]/40 bg-[#06b6d4]/8'
                : 'text-zinc-500 border-transparent'
            }`}
            data-testid="rej-toggle"
            title="REJ — 15m Rejection + 1m Confirmation: Hammer/Shooting Star wick rejection with confirmation"
          >
            REJ
          </button>

          {/* OI Indicator — Nifty Open Interest Dashboard */}
          <div className="relative shrink-0" ref={oiBtnRef}>
            <button
              onClick={() => {
                const isCurrentlyOn = oiLinesOn || oiPanelOpen;
                if (isCurrentlyOn) {
                  // Toggle OFF — hide panel + remove chart lines
                  setOiPanelOpen(false);
                  setOiLinesOn(false);
                } else {
                  // Toggle ON — open panel + draw chart lines
                  setOiPanelOpen(true);
                  setOiLinesOn(true);
                  if (!oiData) fetchOIData();
                }
              }}
              className={`relative z-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${
                oiPanelOpen || oiLinesOn
                  ? 'text-[#a78bfa] border-[#a78bfa]/40 bg-[#a78bfa]/10'
                  : 'text-zinc-500 border-transparent'
              }`}
              data-testid="oi-indicator-btn"
              title="OI Indicator — Nifty 50 PCR, Max Pain, Call/Put Wall"
            >
              OI
            </button>

            {/* ── OI Floating Panel ── */}
            {oiPanelOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setOiPanelOpen(false)}
                />
                {/* Panel — right-aligned to prevent viewport overflow */}
                <div
                  className="absolute z-50 mt-1 rounded-xl shadow-2xl overflow-hidden"
                  style={{
                    top: '100%',
                    right: 0,
                    width: 300,
                    background: isDark ? '#111117' : '#ffffff',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'}`,
                    maxHeight: '80vh',
                    overflowY: 'auto',
                  }}
                  onClick={e => e.stopPropagation()}
                  data-testid="oi-panel"
                >
                  <OIPanel data={oiData} loading={oiLoading} isDark={isDark}
                    onRefresh={() => { fetchOIData(); }}
                    oiLinesOn={oiLinesOn}
                    onToggleLines={() => setOiLinesOn(v => !v)}
                  />
                </div>
              </>
            )}
          </div>
          {/* SMC toggle + Multi-Timeframe layers dropdown */}
          <div className="flex items-stretch shrink-0 relative">
            <button
              onClick={() => setSmcActive(!smcActive)}
              className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${
                smcActive
                  ? 'text-[#F5A623] border-[#F5A623]/40 bg-[#F5A623]/8'
                  : 'text-zinc-500 border-transparent'
              }`}
              data-testid="smc-toggle"
              title="SMC Auto Mark — FVG + Liquidity + Order Blocks"
            >
              SMC
            </button>
            <button
              ref={smcTfBtnRef}
              onClick={() => {
                if (!smcTfOpen && smcTfBtnRef.current) {
                  const rect = smcTfBtnRef.current.getBoundingClientRect();
                  const dropW = 130;
                  const left = Math.min(rect.left, window.innerWidth - dropW - 8);
                  setSmcTfDropdownPos({ top: rect.bottom + 4, left: Math.max(8, left) });
                }
                setSmcTfOpen(o => !o);
              }}
              className={`px-1.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border border-l-0 flex items-center gap-0.5 ${
                smcActive && smcLayers.size > 0
                  ? 'text-[#F5A623] border-[#F5A623]/40 bg-[#F5A623]/8'
                  : 'text-zinc-400 border-[#F5A623]/30 bg-[#F5A623]/4'
              }`}
              data-testid="smc-tf-toggle"
              title="SMC Timeframes — click to add/remove TF layers"
            >
              {smcLayers.size === 0
                ? 'TF'
                : smcLayers.size === 1
                ? Array.from(smcLayers)[0]
                : `${smcLayers.size} TFs`}
              <span className="text-[8px] leading-none">▾</span>
            </button>
            {smcTfOpen && (
              <div
                ref={smcTfDropdownRef}
                className="bg-black/95 border border-[#F5A623]/40 rounded shadow-2xl py-1"
                style={{
                  position: 'fixed',
                  top: smcTfDropdownPos.top,
                  left: smcTfDropdownPos.left,
                  zIndex: 9999,
                  minWidth: 130,
                  maxHeight: 360,
                  overflowY: 'auto',
                }}
                data-testid="smc-tf-dropdown"
              >
                <div className="px-2 py-1 text-[8px] text-zinc-500 uppercase tracking-wider border-b border-white/5">
                  Click to add / remove
                </div>
                {SMC_TF_OPTIONS.map(opt => {
                  const active = smcLayers.has(opt.label);
                  return (
                    <button
                      key={opt.label}
                      onClick={() => toggleSmcLayer(opt.label)}
                      className={`w-full text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-[#F5A623]/15 flex items-center justify-between ${
                        active ? 'text-[#F5A623] bg-[#F5A623]/10' : 'text-zinc-300'
                      }`}
                      data-testid={`smc-tf-option-${opt.label}`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-[10px]">{active ? '✓' : ''}</span>
                    </button>
                  );
                })}
                {smcLayers.size > 0 && (
                  <>
                    <div className="border-t border-white/5 my-1" />
                    <button
                      onClick={() => { clearAllSmcLayers(); setSmcTfOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/15 transition-colors"
                      data-testid="smc-tf-clear-all"
                    >
                      ✕ Clear All
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Log toggle */}
          <button
            onClick={() => setSemiLogScale(!semiLogScale)}
            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
              semiLogScale ? 'text-[#F5A623]' : 'text-zinc-500'
            }`}
            data-testid="log-toggle"
          >
            LOG
          </button>
          {/* Data source toggle — Yahoo / Groww (Indian stocks only) */}
          {!isCrypto && onDataSourceChange && (
            <>
              <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1 shrink-0" />
              <div className="flex items-center gap-0 shrink-0 border border-slate-200 dark:border-white/10">
                <button
                  onClick={() => onDataSourceChange('yahoo')}
                  className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-all ${
                    dataSource === 'yahoo' ? 'bg-slate-700 dark:bg-zinc-600 text-white dark:text-white' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                  data-testid="src-yahoo"
                  title="Yahoo Finance"
                >Y</button>
                <button
                  onClick={() => onDataSourceChange('groww')}
                  className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-all ${
                    dataSource === 'groww' ? 'bg-[#00E676] text-black' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                  data-testid="src-groww"
                  title="Groww live data"
                >G</button>
              </div>
            </>
          )}
          {/* Trade button (Indian stocks) — opens Groww order modal */}
          {!isCrypto && selectedStock && (
            <>
          <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1 shrink-0" />
              <button
                onClick={() => setShowTrade(true)}
                className="px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-[#00E676] text-black hover:opacity-90 active:opacity-80 flex items-center gap-1 whitespace-nowrap shrink-0"
                data-testid="trade-btn"
              >
                <Lightning size={11} weight="fill" />
                TRADE
              </button>
              {/* Option Chain button — small red circle */}
              {selectedStock?.type !== 'OPTION' && onOpenOptionChain && (
                <button
                  onClick={() => onOpenOptionChain({ symbol: (selectedStock?.ticker || '').replace('.NS','').replace('.BO','').replace(/^\^/,''), name: selectedStock?.name })}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-[#FF3B30] hover:bg-[#FF5B53] active:bg-[#CC2F25] shadow-md shadow-red-900/50 transition-all shrink-0 ml-1"
                  data-testid="option-chain-btn"
                  title="Open Option Chain"
                >
                  <span className="text-[8px] font-black text-white leading-none">OC</span>
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-white shrink-0"
            data-testid="fullscreen-btn"
            title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Fullscreen'}
          >
            {isFullscreen ? <ArrowsIn size={13} weight="bold" /> : <ArrowsOut size={13} weight="bold" />}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-white/10 shrink-0" />
          {!pivotPoint && (
            <>
              <button
                onClick={() => setSelectMode('high')}
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-0.5 whitespace-nowrap ${
                  selectMode === 'high' ? 'bg-[#FF3B30] text-white' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-white'
                }`}
                data-testid="select-high-btn"
              >
                <TrendUp size={11} weight="bold" />
                <span className="hidden xs:inline">HIGH</span>
              </button>
              <button
                onClick={() => setSelectMode('low')}
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-0.5 whitespace-nowrap ${
                  selectMode === 'low' ? 'bg-[#00E676] text-black' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-white'
                }`}
                data-testid="select-low-btn"
              >
                <TrendDown size={11} weight="bold" />
                <span className="hidden xs:inline">LOW</span>
              </button>
            </>
          )}
          {pivotPoint && (
            <>
              <span className="text-[9px] font-mono text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                P: {pivotPoint.price.toFixed(0)}
              </span>
              <button
                onClick={() => setIsMovingMode(!isMovingMode)}
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                  isMovingMode ? 'bg-[#F5A623] text-black' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-white'
                }`}
                data-testid="move-pivot-btn"
              >
                {isMovingMode ? 'MOVE' : 'MOVE'}
              </button>
              <button onClick={handleDeleteGann} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 hover:text-[#FF3B30]" data-testid="clear-gann-btn">
                <Trash size={12} weight="bold" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Extension slider */}
      {pivotPoint && showGannLines && (
        <div className="flex items-center gap-3 px-3 py-1 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A] shrink-0">
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono whitespace-nowrap">Ext: {lineExtension}</span>
          <input
            type="range"
            min={10} max={100} step={5}
            value={lineExtension}
            onChange={(e) => setLineExtension(Number(e.target.value))}
            className="flex-1 h-1 accent-[#3B82F6]"
            data-testid="line-extension-slider"
          />
          <div className="flex items-center gap-2 text-[9px] font-mono">
            <span className="text-[#3B82F6]">1x1</span>
            <span className="text-[#A855F7]">2x1</span>
            <span className="text-[#FF0055]">1x2</span>
            <span className="text-[#F5A623]">3x1</span>
            <span className="text-[#00E676]">1x3</span>
          </div>
        </div>
      )}

      {/* Chart area */}
      <div className="flex-1 relative" ref={chartContainerRef}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-[#0A0A0A]/80 z-10">
            <p className="text-xs font-mono text-slate-400 dark:text-zinc-400 animate-pulse">Loading chart data...</p>
          </div>
        )}
        {!loading && !stockData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <ChartLine size={48} className="text-slate-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-slate-400 dark:text-zinc-500">Select a stock or crypto to view chart</p>
            <p className="text-[10px] text-slate-300 dark:text-zinc-600 mt-1 font-mono">Scroll to zoom / Drag to pan</p>
          </div>
        )}

        {/* Parity Trade Signal Pill — top left overlay */}
        {tradeSignal && (
          <div className={`absolute top-2 left-2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg border backdrop-blur-sm
            ${tradeSignal.direction === 'BUY'
              ? 'bg-emerald-900/80 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-900/80 border-rose-500/50 text-rose-300'}`}
            data-testid="trade-signal-pill"
          >
            <span>{tradeSignal.direction === 'BUY' ? '▲' : '▼'} {tradeSignal.symbol} {tradeSignal.direction}</span>
            <span className="text-white/60">|</span>
            <span className="text-slate-300">E: {tradeSignal.entry}</span>
            <span className="text-red-400">SL: {tradeSignal.sl}</span>
            <span className="text-emerald-400">T: {tradeSignal.target}</span>
          </div>
        )}

        {/* MTF Market Direction — 1H / 45M / 15M — top-left chart overlay */}
        {!tradeSignal && (mtfDirection['1H'] || mtfDirection['45M'] || mtfDirection['15M']) && (
          <div
            className="absolute top-2 left-2 z-20 flex items-center gap-1 pointer-events-none"
            data-testid="mtf-direction-overlay"
          >
            {[['1H', '#06b6d4'], ['45M', '#a855f7'], ['15M', '#f59e0b']].map(([tf]) => {
              const d = mtfDirection[tf];
              if (!d) return null;
              const dir    = d.dir || d;
              const pct    = d.pct || '';
              const arrow  = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '─';
              const bg     = dir === 'up' ? '#15803d' : dir === 'down' ? '#b91c1c' : '#3f3f46';
              const border = dir === 'up' ? '#22c55e60' : dir === 'down' ? '#ef444460' : '#71717a60';
              return (
                <div
                  key={tf}
                  style={{
                    background:     bg,
                    border:         `1px solid ${border}`,
                    color:          '#fff',
                    fontSize:       10,
                    fontFamily:     'monospace',
                    fontWeight:     800,
                    padding:        '2px 6px',
                    borderRadius:   4,
                    lineHeight:     '15px',
                    whiteSpace:     'nowrap',
                    backdropFilter: 'blur(4px)',
                  }}
                  data-testid={`mtf-dir-${tf.toLowerCase()}`}
                >
                  {tf} {arrow}{pct ? ` ${pct}` : ''}
                </div>
              );
            })}
          </div>
        )}

        {/* EMA 9/21 Live Cross Signal Pill — top center overlay */}
        {emaActive && emaSignal && (
          <div
            className={`absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg border backdrop-blur-sm animate-pulse
              ${emaSignal.type === 'BUY'
                ? 'bg-emerald-900/85 border-emerald-400/60 text-emerald-200'
                : 'bg-rose-900/85 border-rose-400/60 text-rose-200'}`}
            data-testid="ema-cross-signal"
          >
            <span className="text-base leading-none">
              {emaSignal.type === 'BUY' ? '▲' : '▼'}
            </span>
            <span>{emaSignal.type === 'BUY' ? 'BUY' : 'SELL'} · 9/21 EMA</span>
            <span className="text-white/60">|</span>
            <span className="text-slate-200">@ {Number(emaSignal.price).toFixed(2)}</span>
            {emaSignal.barsAgo > 0 && (
              <span className="text-white/50 text-[10px]">({emaSignal.barsAgo} bar{emaSignal.barsAgo > 1 ? 's' : ''} ago)</span>
            )}
          </div>
        )}

        {/* Candlestick Pattern Badge — top right */}
        {patternsActive && lastPattern && (
          <div
            className="absolute top-2 right-2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg border backdrop-blur-sm"
            style={{
              background: `${PATTERN_COLORS[lastPattern.category]}22`,
              borderColor: `${PATTERN_COLORS[lastPattern.category]}80`,
              color: PATTERN_COLORS[lastPattern.category],
            }}
            data-testid="pattern-badge"
          >
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: PATTERN_COLORS[lastPattern.category] }} />
            <span>{lastPattern.name}</span>
            <span className="text-white/50 text-[10px]">
              ({lastPattern.category === 'bullish-reversal' ? 'BUY' :
                lastPattern.category === 'bearish-reversal' ? 'SELL' : 'CONT'}{lastPattern.barsAgo > 0 ? ` · ${lastPattern.barsAgo} ago` : ''})
            </span>
          </div>
        )}

        {/* Trendline Legend Badge removed per user request — keep chart clean */}

        {/* Volume Profile Canvas Overlay — left side, clickable for price-level detail */}
        <canvas
          ref={vpCanvasRef}
          onClick={handleVPClick}
          onMouseMove={handleVPMouseMove}
          onMouseLeave={handleVPMouseLeave}
          style={{
            position: 'absolute', left: 0, top: 0,
            zIndex: 5,
            cursor: vpActive ? 'crosshair' : 'default',
            display: vpActive ? 'block' : 'none',
          }}
        />

        {/* SMC Auto Mark Canvas — full chart overlay, pointer-events none */}
        <canvas
          ref={smcCanvasRef}
          style={{
            position: 'absolute', left: 0, top: 0,
            zIndex: 4,
            pointerEvents: 'none',
            display: smcActive ? 'block' : 'none',
          }}
        />

        {/* Black Box Canvas — overlaid above SMC */}
        <canvas
          ref={bbCanvasRef}
          style={{
            position: 'absolute', left: 0, top: 0,
            zIndex: 5,
            pointerEvents: 'none',
            display: bbActive ? 'block' : 'none',
          }}
        />

        {/* REJ Canvas — 15m Rejection + 1m Confirmation overlay */}
        <canvas
          ref={rejCanvasRef}
          style={{
            position: 'absolute', left: 0, top: 0,
            zIndex: 6,
            pointerEvents: 'none',
            display: rejActive ? 'block' : 'none',
          }}
        />

        {/* S/R Stats Canvas — Retests/Breakouts/Held badges on horizontal levels */}
        <canvas
          ref={srStatsCanvasRef}
          style={{
            position: 'absolute', left: 0, top: 0,
            zIndex: 7,
            pointerEvents: 'none',
            display: trendlinesActive ? 'block' : 'none',
          }}
        />

        {/* VP Tooltip — price level detail popup */}
        {vpTooltip && (
          <div
            style={{ position: 'absolute', left: VP_WIDTH + 6, top: vpTooltip.y, zIndex: 25, minWidth: 168 }}
            className="bg-[#0D0D0D] border border-white/20 shadow-2xl text-[9px] font-mono"
            data-testid="vp-tooltip"
          >
            {/* Header */}
            <div className="px-2.5 py-1.5 border-b border-white/10 flex items-center justify-between gap-2">
              <span className="text-white font-bold text-[11px]">₹{vpTooltip.bin.price_mid.toFixed(2)}</span>
              <div className="flex gap-1 items-center flex-wrap justify-end">
                {vpTooltip.bin.is_poc && (
                  <span className="text-[#FF6B00] text-[7px] font-bold px-1 border border-[#FF6B00]/50">◆ POC</span>
                )}
                {Math.abs(vpTooltip.bin.price_mid - vpTooltip.vah) < vpTooltip.vah * 0.005 && (
                  <span className="text-[#A855F7] text-[7px] px-1 border border-[#A855F7]/50">VAH</span>
                )}
                {Math.abs(vpTooltip.bin.price_mid - vpTooltip.val) < vpTooltip.val * 0.005 && (
                  <span className="text-[#06B6D4] text-[7px] px-1 border border-[#06B6D4]/50">VAL</span>
                )}
                {vpTooltip.bin.in_value_area && !vpTooltip.bin.is_poc && (
                  <span className="text-zinc-600 text-[7px]">VA</span>
                )}
                <button
                  onClick={() => setVpTooltip(null)}
                  className="text-zinc-600 hover:text-white ml-1 text-[9px] leading-none"
                  data-testid="vp-tooltip-close"
                >✕</button>
              </div>
            </div>
            {/* Volume bars */}
            <div className="px-2.5 py-2 space-y-2">
              {[
                { label: 'Buy', vol: vpTooltip.bin.buy_vol, color: '#00E676' },
                { label: 'Sell', vol: vpTooltip.bin.sell_vol, color: '#FF3B30' },
              ].map(({ label, vol, color }) => (
                <div key={label}>
                  <div className="flex justify-between mb-0.5">
                    <span style={{ color }}>{label}</span>
                    <span style={{ color }} className="font-bold">{fmtVol(vol)}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-sm overflow-hidden">
                    <div
                      style={{ width: `${(vol / vpTooltip.maxVol) * 100}%`, backgroundColor: color }}
                      className="h-full rounded-sm"
                    />
                  </div>
                </div>
              ))}
              {/* Stats */}
              <div className="pt-1 border-t border-white/5 space-y-1">
                {[
                  {
                    label: 'Delta',
                    val: fmtVol(vpTooltip.bin.buy_vol - vpTooltip.bin.sell_vol),
                    color: vpTooltip.bin.buy_vol >= vpTooltip.bin.sell_vol ? '#00E676' : '#FF3B30',
                    prefix: vpTooltip.bin.buy_vol >= vpTooltip.bin.sell_vol ? '+' : '',
                  },
                  { label: 'Total Vol', val: fmtVol(vpTooltip.bin.total_vol), color: '#D4D4D8' },
                  { label: '% of Peak', val: `${((vpTooltip.bin.total_vol / vpTooltip.maxVol) * 100).toFixed(1)}%`, color: '#A1A1AA' },
                ].map(({ label, val, color, prefix = '' }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-zinc-500">{label}</span>
                    <span style={{ color }}>{prefix}{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Strategy Overlay Component */}
        <StrategyOverlay 
          chart={chartRef.current}
          bars={stockData?.bars}
          strategyData={strategyData}
          strategyType={activeStrategy}
          isActive={!!activeStrategy && !!strategyData}
        />

        {/* Timeframe Levels — custom HTML badges inside chart area */}
        <TimeframeLevels
          chart={chartRef.current}
          series={candlestickSeriesRef.current}
          bars={stockData?.bars}
        />
      </div>

      {/* VWAP Flip Mini Chart — below the main chart */}
      <VWAPFlipMini bars={stockData?.bars} isDark={isDark} />

      {/* Status bar */}
      {selectMode && (
        <div className="px-3 py-1 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141414] text-[10px] font-mono text-[#F5A623] shrink-0">
          Click on chart to select {selectMode === 'high' ? 'swing high' : 'swing low'} point
        </div>
      )}
      {isMovingMode && pivotPoint && (
        <div className="px-3 py-1 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141414] text-[10px] font-mono text-[#F5A623] shrink-0">
          Click anywhere on chart to move pivot
        </div>
      )}

      {/* Groww Trade modal */}
      {showTrade && selectedStock && (
        <GrowwTradeModal
          ticker={selectedStock.ticker}
          currentPrice={stockData?.bars?.length ? stockData.bars[stockData.bars.length - 1].close : null}
          onClose={() => setShowTrade(false)}
        />
      )}
    </div>
  );
};

export default ChartPanel;
