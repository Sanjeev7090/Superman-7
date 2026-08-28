import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowClockwise, CaretDown, CaretRight, Warning } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ALERT_META = {
  ALERT:  { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  dot: '#ef4444', label: 'ALERT',  text: '#f87171' },
  WATCH:  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)', dot: '#f59e0b', label: 'WATCH',  text: '#fbbf24' },
  NORMAL: { bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.20)',  dot: '#22c55e', label: 'NORMAL', text: '#4ade80' },
};

const NOISE_META = {
  HIGH:   { color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
  MEDIUM: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  LOW:    { color: '#22c55e', bg: 'rgba(34,197,94,0.06)'  },
};

function AlertBadge({ level }) {
  const m = ALERT_META[level] || ALERT_META.NORMAL;
  return (
    <span style={{
      fontSize: 7, fontWeight: 800, padding: '2px 6px', borderRadius: 3,
      background: m.bg, border: `1px solid ${m.border}`, color: m.text,
      letterSpacing: '0.06em',
    }}>{m.label}</span>
  );
}

function Section({ title, alert, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const m = ALERT_META[alert] || ALERT_META.NORMAL;
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', background: 'transparent', cursor: 'pointer',
          border: 'none',
        }}
      >
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left', fontSize: 9, fontWeight: 800,
          color: '#e4e4e7', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {title}
        </span>
        <AlertBadge level={alert} />
        {open
          ? <CaretDown size={10} color="#52525b" />
          : <CaretRight size={10} color="#52525b" />}
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', fontSize: 9, color: '#94a3b8', lineHeight: 1.6 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Tag({ text, color = '#94a3b8' }) {
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
      background: `${color}12`, color, border: `1px solid ${color}25`,
      whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 8.5, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 8.5, fontWeight: 700, color: color || '#e4e4e7', fontFamily: 'monospace' }}>
        {value}
      </span>
    </div>
  );
}

export default function InstitutionalFlowPanel({ onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/institutional/flow${refresh ? '?refresh=true' : ''}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overall = data?.overall_alert || 'NORMAL';
  const om = ALERT_META[overall];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
        padding: 10,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="institutional-flow-panel"
    >
      <div style={{
        width: '100%', maxWidth: 520, height: '100%', maxHeight: 'calc(100vh - 20px)',
        background: '#0d0f17', borderRadius: 12,
        border: `1px solid ${om?.border || 'rgba(255,255,255,0.08)'}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#0d0f17', flexShrink: 0,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: om?.dot || '#22c55e' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#ffffff', letterSpacing: '0.06em' }}>
              INSTITUTIONAL FLOW
            </div>
            <div style={{ fontSize: 8, color: '#52525b' }}>
              {data?.generated_at || '—'} · Volume Profile · Order Flow · Inter-Market
            </div>
          </div>
          {data && <AlertBadge level={overall} />}
          <button onClick={() => load(true)} disabled={loading}
            style={{ fontSize: 8, padding: '3px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.06)',
              color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
            <ArrowClockwise size={11} />
          </button>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {loading && (
            <div style={{ padding: '40px 14px', textAlign: 'center', color: '#52525b', fontSize: 9 }}>
              Loading institutional flow data…
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '20px 14px', textAlign: 'center' }}>
              <Warning size={20} color="#ef4444" />
              <div style={{ fontSize: 9, color: '#f87171', marginTop: 6 }}>Error: {error}</div>
              <button onClick={() => load(true)} style={{ marginTop: 8, fontSize: 8, padding: '3px 8px',
                borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#f87171',
                border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* ── Noise Filter (top — most important) ── */}
              <div style={{
                margin: '10px 12px', padding: '8px 12px', borderRadius: 7,
                background: NOISE_META[data.noise?.noise_level]?.bg || 'rgba(148,163,184,0.06)',
                border: `1px solid ${NOISE_META[data.noise?.noise_level]?.color || '#64748b'}25`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.06em',
                    color: NOISE_META[data.noise?.noise_level]?.color || '#94a3b8' }}>
                    NOISE: {data.noise?.noise_level}
                  </span>
                  <span style={{ fontSize: 8, color: '#22c55e', fontWeight: 700 }}>
                    {data.noise?.active_alerts} ALERT{data.noise?.active_alerts !== 1 ? 'S' : ''} · {data.noise?.watches} WATCH
                  </span>
                </div>
                <div style={{ fontSize: 8.5, color: '#94a3b8' }}>{data.noise?.noise_msg}</div>
              </div>

              {/* ── 1. VWAP / Volume Profile ── */}
              <Section title="1 · VWAP & Volume Profile" alert={data.vwap?.alert} defaultOpen={data.vwap?.alert === 'ALERT'}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 8.5, color: data.vwap?.alert === 'ALERT' ? '#f87171' : data.vwap?.alert === 'WATCH' ? '#fbbf24' : '#4ade80', fontWeight: 700, marginBottom: 6 }}>
                    {data.vwap?.msg}
                  </div>
                  <Row label="Spot" value={data.vwap?.spot?.toLocaleString('en-IN') || '—'} />
                  <Row label="Max Pain / VWAP Proxy" value={data.vwap?.max_pain > 0 ? data.vwap.max_pain.toLocaleString('en-IN') : 'N/A'} color="#a78bfa" />
                  <Row label="1SD Band" value={`${data.vwap?.sd1_low?.toLocaleString('en-IN')} – ${data.vwap?.sd1_high?.toLocaleString('en-IN')}`} color="#fbbf24" />
                  <Row label="2SD Band" value={`${data.vwap?.sd2_low?.toLocaleString('en-IN')} – ${data.vwap?.sd2_high?.toLocaleString('en-IN')}`} color="#f97316" />
                  <Row label="Call Wall" value={data.vwap?.call_wall > 0 ? data.vwap.call_wall.toLocaleString('en-IN') : '—'} color="#ef4444" />
                  <Row label="Put Wall"  value={data.vwap?.put_wall  > 0 ? data.vwap.put_wall.toLocaleString('en-IN')  : '—'} color="#22c55e" />
                </div>
                <div style={{ fontSize: 7.5, color: '#52525b', marginTop: 4 }}>
                  Alert logic: Price breaks major level with high volume spike → force measurement
                </div>
              </Section>

              {/* ── 2. Order Book Imbalance ── */}
              <Section title="2 · Order Book Imbalance" alert={data.order_book?.alert}>
                <div style={{ marginBottom: 6, fontSize: 8.5, color: data.order_book?.alert === 'WATCH' ? '#fbbf24' : '#94a3b8', fontWeight: 600 }}>
                  {data.order_book?.msg}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Tag text={`PCR ${data.order_book?.pcr?.toFixed(2) || '—'}`}
                       color={data.order_book?.pcr > 1.2 ? '#22c55e' : data.order_book?.pcr < 0.8 ? '#ef4444' : '#94a3b8'} />
                  <Tag text={`Delta: ${data.order_book?.delta_bias}`}
                       color={data.order_book?.delta_bias === 'BULLISH' ? '#22c55e' : data.order_book?.delta_bias === 'BEARISH' ? '#ef4444' : '#94a3b8'} />
                  <Tag text={data.order_book?.wall_imbalance} color="#a78bfa" />
                  <Tag text={`OI: ${data.order_book?.oi_signal}`} color="#64748b" />
                </div>
                <div style={{ fontSize: 7.5, color: '#52525b' }}>
                  Skewness: Large OI at level but low actual volume = potential fake support/resistance
                </div>
              </Section>

              {/* ── 3. Inter-Market Correlation ── */}
              <Section title="3 · Inter-Market Correlation" alert={data.intermarket?.alert} defaultOpen={data.intermarket?.alert === 'ALERT'}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Tag text={`VIX ${data.intermarket?.vix?.toFixed(1)}`}
                       color={data.intermarket?.vix > 18 ? '#ef4444' : data.intermarket?.vix > 14 ? '#f59e0b' : '#22c55e'} />
                  <Tag text={`GIFT ${data.intermarket?.gift >= 0 ? '+' : ''}${Math.round(data.intermarket?.gift || 0)}`}
                       color={data.intermarket?.gift > 50 ? '#22c55e' : data.intermarket?.gift < -50 ? '#ef4444' : '#94a3b8'} />
                  <Tag text={`FII ${data.intermarket?.fii_net >= 0 ? '+' : ''}₹${Math.round((data.intermarket?.fii_net || 0) / 100) * 100}Cr`}
                       color={data.intermarket?.fii_net > 500 ? '#22c55e' : data.intermarket?.fii_net < -500 ? '#ef4444' : '#94a3b8'} />
                  <Tag text={`DOOM ${data.intermarket?.doom >= 0 ? '+' : ''}${data.intermarket?.doom}`}
                       color={data.intermarket?.doom_color || '#94a3b8'} />
                </div>
                {data.intermarket?.signals?.map((s, i) => (
                  <div key={i} style={{ fontSize: 8.5, color: '#94a3b8', padding: '2px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    › {s}
                  </div>
                ))}
              </Section>

              {/* ── 4. Momentum Divergence ── */}
              <Section title="4 · Momentum Divergence" alert={data.momentum?.alert} defaultOpen={data.momentum?.alert === 'ALERT'}>
                {!data.momentum?.data_available && (
                  <div style={{ fontSize: 8, color: '#52525b', marginBottom: 6 }}>Live NIFTY data fetch failed — signals may be stale</div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Tag text={`RSI ${data.momentum?.rsi?.toFixed(0)}`}
                       color={data.momentum?.rsi >= 70 ? '#ef4444' : data.momentum?.rsi <= 30 ? '#22c55e' : '#94a3b8'} />
                  <Tag text={`MACD ${data.momentum?.macd?.hist >= 0 ? '+' : ''}${data.momentum?.macd?.hist?.toFixed(1)}`}
                       color={data.momentum?.macd?.hist > 0 ? '#22c55e' : '#ef4444'} />
                  {data.momentum?.macd?.divergence !== 'NONE' && (
                    <Tag text={data.momentum?.macd?.divergence} color="#f59e0b" />
                  )}
                </div>
                {data.momentum?.signals?.map((s, i) => (
                  <div key={i} style={{ fontSize: 8.5, color: '#94a3b8', padding: '2px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    › {s}
                  </div>
                ))}
              </Section>

              {/* ── 5. Session Bias ── */}
              <Section title="5 · Session Bias" alert="NORMAL">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%',
                    background: data.session?.color || '#94a3b8' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: data.session?.color || '#94a3b8' }}>
                    {data.session?.session}
                  </span>
                  <span style={{ fontSize: 8, color: '#52525b', marginLeft: 'auto' }}>
                    {data.session?.current_time_ist}
                  </span>
                </div>
                <div style={{ fontSize: 8.5, color: '#94a3b8', marginBottom: 6 }}>
                  {data.session?.tendency}
                </div>
                {data.session?.vol_expectation && (
                  <Tag text={`Volume Expectation: ${data.session.vol_expectation}`}
                       color={data.session.vol_expectation === 'HIGH' ? '#22c55e' : '#f59e0b'} />
                )}
                <div style={{ marginTop: 8, fontSize: 7.5, color: '#52525b' }}>
                  Weighted Profile: 10:00–12:00 = max institutional buy pressure historically
                </div>
              </Section>

              {/* ── 6. Block Trade Activity ── */}
              <Section title="6 · Block / Bulk Trade Activity" alert={data.block_trade?.alert}>
                <div style={{ fontSize: 8.5, color: '#94a3b8', marginBottom: 8 }}>
                  {data.block_trade?.msg}
                </div>
                {data.block_trade?.trades?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {data.block_trade.trades.slice(0, 6).map((t, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                        borderRadius: 5, background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                          background: t.kind === 'BLOCK' ? 'rgba(167,139,250,0.12)' : 'rgba(245,158,11,0.12)',
                          color: t.kind === 'BLOCK' ? '#c4b5fd' : '#fbbf24',
                          border: `1px solid ${t.kind === 'BLOCK' ? 'rgba(167,139,250,0.25)' : 'rgba(245,158,11,0.25)'}`,
                        }}>{t.kind}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#e4e4e7', flex: 1 }}>{t.symbol}</span>
                        <span style={{ fontSize: 8, color: t.trade?.includes('BUY') || t.trade?.includes('Buy') ? '#4ade80' : '#f87171' }}>
                          {t.trade || '—'}
                        </span>
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#a78bfa', fontFamily: 'monospace' }}>
                          ₹{t.value_cr?.toFixed(1)}Cr
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 8, color: '#52525b', textAlign: 'center', padding: '8px 0' }}>
                    No large block trades in last 3 days
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 7.5, color: '#52525b' }}>
                  Front-Run Alert: Block trade at outlier price vs VWAP = pre-positioning signal
                </div>
              </Section>

              {/* ── 7. Noise Filter ── */}
              <Section title="7 · Algorithmic Noise Filter" alert="NORMAL">
                <Row label="Noise Level" value={data.noise?.noise_level}
                     color={NOISE_META[data.noise?.noise_level]?.color || '#94a3b8'} />
                <Row label="Active Alerts" value={`${data.noise?.active_alerts} / 5 sections`}
                     color={data.noise?.active_alerts >= 3 ? '#22c55e' : '#f59e0b'} />
                <div style={{ marginTop: 8, fontSize: 8, color: '#64748b', lineHeight: 1.7 }}>
                  <div>⏱ <b style={{ color: '#94a3b8' }}>Time Decay:</b> {data.noise?.time_decay_note}</div>
                  <div style={{ marginTop: 3 }}>📊 <b style={{ color: '#94a3b8' }}>Volume Decay:</b> {data.noise?.vol_decay_note}</div>
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
