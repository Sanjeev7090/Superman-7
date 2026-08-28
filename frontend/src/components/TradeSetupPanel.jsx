import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowClockwise, Lightning, Warning, CheckCircle } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DIR_META = {
  'BUY CE': { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.30)',  text: '#4ade80', glow: 'rgba(34,197,94,0.15)'  },
  'BUY PE': { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  text: '#f87171', glow: 'rgba(239,68,68,0.15)'  },
  'NO TRADE':{ bg: 'rgba(100,116,139,0.08)',border:'rgba(100,116,139,0.25)',text: '#94a3b8', glow: 'rgba(100,116,139,0.08)' },
};

function Row({ label, value, color, mono = true }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3.5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 8.5, color: '#52525b' }}>{label}</span>
      <span style={{ fontSize: 9, fontWeight: 700, color: color || '#e4e4e7',
        fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

export default function TradeSetupPanel({ onClose }) {
  const [data, setData]   = useState(null);
  const [load, setLoad]   = useState(true);
  const [err, setErr]     = useState(null);

  const fetch_ = useCallback(async (refresh = false) => {
    setLoad(true); setErr(null);
    try {
      const r = await fetch(`${API}/trade-setup/suggest${refresh ? '?refresh=true' : ''}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const d = data || {};
  const dm = DIR_META[d.direction] || DIR_META['NO TRADE'];
  const isTradeOn = d.direction && d.direction !== 'NO TRADE';

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:1200,
        background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:12 }}
      onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}
      data-testid="trade-setup-panel"
    >
      <div style={{
        width:'100%', maxWidth:420, maxHeight:'90vh',
        background:'#0d0f17', borderRadius:14,
        border:`1px solid ${dm.border}`,
        boxShadow:`0 0 48px ${dm.glow}, 0 24px 64px rgba(0,0,0,0.7)`,
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:8,
          padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.07)',
          background:'#0d0f17', flexShrink:0 }}>
          <Lightning size={14} color="#f59e0b" weight="fill" />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:900, color:'#ffffff', letterSpacing:'0.06em' }}>TRADE SETUP</div>
            <div style={{ fontSize:8, color:'#52525b' }}>{d.generated_at || '—'} · System signal confluence</div>
          </div>
          <button onClick={()=>fetch_(true)} disabled={load}
            style={{ fontSize:8, padding:'3px 7px', borderRadius:4,
              background:'rgba(255,255,255,0.05)', color:'#64748b',
              border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer' }}>
            <ArrowClockwise size={11} />
          </button>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#52525b', cursor:'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto' }}>

          {load && (
            <div style={{ padding:'40px 14px', textAlign:'center', color:'#52525b', fontSize:9 }}>
              Signals calculate ho rahi hain…
            </div>
          )}
          {err && !load && (
            <div style={{ padding:'24px 14px', textAlign:'center' }}>
              <Warning size={20} color="#ef4444" />
              <div style={{ fontSize:9, color:'#f87171', marginTop:6 }}>{err}</div>
              <button onClick={()=>fetch_(true)} style={{ marginTop:8, fontSize:8, padding:'3px 8px',
                borderRadius:4, background:'rgba(239,68,68,0.15)', color:'#f87171',
                border:'1px solid rgba(239,68,68,0.3)', cursor:'pointer' }}>Retry</button>
            </div>
          )}

          {!load && !err && data && (
            <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>

              {/* ── Direction + Confidence ── */}
              <div style={{
                padding:'14px', borderRadius:10,
                background: dm.bg, border:`1px solid ${dm.border}`,
                textAlign:'center',
              }}>
                <div style={{ fontSize:9, color:'#64748b', fontWeight:700, letterSpacing:'0.06em', marginBottom:4 }}>
                  DIRECTION
                </div>
                <div style={{ fontSize:22, fontWeight:900, color: dm.text, letterSpacing:'0.04em', lineHeight:1 }}>
                  {d.direction}
                </div>
                <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:6, marginTop:6 }}>
                  <span style={{ fontSize:8, fontWeight:700,
                    color: d.confidence==='HIGH' ? '#4ade80' : d.confidence==='MODERATE' ? '#fbbf24' : '#64748b' }}>
                    {d.confidence} CONFIDENCE
                  </span>
                  <span style={{ fontSize:8, color:'#52525b' }}>·</span>
                  <span style={{ fontSize:8, color:'#64748b' }}>
                    Score: {d.score >= 0 ? '+' : ''}{d.score}
                  </span>
                </div>
              </div>

              {/* ── Best Strike ── */}
              {isTradeOn && (
                <div style={{
                  padding:'12px 14px', borderRadius:10,
                  background:'rgba(167,139,250,0.06)', border:'1px solid rgba(167,139,250,0.22)',
                }}>
                  <div style={{ fontSize:8, color:'#94a3b8', fontWeight:700, letterSpacing:'0.06em', marginBottom:4 }}>
                    BEST STRIKE (MAX MOVEMENT POTENTIAL)
                  </div>
                  <div style={{ fontSize:26, fontWeight:900, color:'#c4b5fd',
                    fontFamily:'monospace', letterSpacing:'0.02em', lineHeight:1, marginBottom:8 }}>
                    {d.strike}
                  </div>
                  {d.why_strike?.map((w, i) => (
                    <div key={i} style={{ fontSize:8, color:'#64748b', padding:'1.5px 0' }}>
                      › {w}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Entry / SL / Target Grid ── */}
              {isTradeOn && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
                  {/* Entry */}
                  <div style={{ padding:'10px 10px', borderRadius:8,
                    background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize:7.5, color:'#52525b', fontWeight:700, letterSpacing:'0.06em', marginBottom:4 }}>ENTRY</div>
                    <div style={{ fontSize:10, fontWeight:900, color:'#e4e4e7', fontFamily:'monospace' }}>
                      {d.entry_low?.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize:7.5, color:'#52525b', marginTop:1 }}>–</div>
                    <div style={{ fontSize:10, fontWeight:900, color:'#e4e4e7', fontFamily:'monospace' }}>
                      {d.entry_high?.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize:7, color:'#52525b', marginTop:3 }}>SPOT RANGE</div>
                  </div>

                  {/* SL */}
                  <div style={{ padding:'10px 10px', borderRadius:8,
                    background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.18)' }}>
                    <div style={{ fontSize:7.5, color:'#ef4444', fontWeight:700, letterSpacing:'0.06em', marginBottom:4 }}>STOP LOSS</div>
                    <div style={{ fontSize:11, fontWeight:900, color:'#f87171', fontFamily:'monospace' }}>
                      {d.sl_spot?.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize:7.5, color:'#ef4444', marginTop:3, fontFamily:'monospace' }}>
                      -{d.sl_pts} pts
                    </div>
                    <div style={{ fontSize:7, color:'#52525b', marginTop:1 }}>SPOT LEVEL</div>
                  </div>

                  {/* Targets */}
                  <div style={{ padding:'10px 10px', borderRadius:8,
                    background:'rgba(34,197,94,0.05)', border:'1px solid rgba(34,197,94,0.18)' }}>
                    <div style={{ fontSize:7.5, color:'#22c55e', fontWeight:700, letterSpacing:'0.06em', marginBottom:4 }}>TARGETS</div>
                    <div style={{ fontSize:8, color:'#4ade80', fontFamily:'monospace', fontWeight:800 }}>
                      T1: {d.t1?.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize:7.5, color:'#86efac', fontFamily:'monospace', marginTop:1 }}>
                      +{d.t1_pts} pts
                    </div>
                    <div style={{ fontSize:8, color:'#4ade80', fontFamily:'monospace', fontWeight:800, marginTop:4 }}>
                      T2: {d.t2?.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize:7.5, color:'#86efac', fontFamily:'monospace', marginTop:1 }}>
                      +{d.t2_pts} pts
                    </div>
                  </div>
                </div>
              )}

              {/* R:R */}
              {isTradeOn && (
                <div style={{ display:'flex', gap:6 }}>
                  <div style={{ flex:1, padding:'8px 10px', borderRadius:7,
                    background:'rgba(34,197,94,0.04)', border:'1px solid rgba(34,197,94,0.12)',
                    textAlign:'center' }}>
                    <div style={{ fontSize:7.5, color:'#52525b', marginBottom:3 }}>T1 R:R</div>
                    <div style={{ fontSize:14, fontWeight:900,
                      color: d.rr_t1 >= 2 ? '#4ade80' : d.rr_t1 >= 1.5 ? '#fbbf24' : '#f87171',
                      fontFamily:'monospace' }}>
                      1:{d.rr_t1?.toFixed(1)}
                    </div>
                  </div>
                  <div style={{ flex:1, padding:'8px 10px', borderRadius:7,
                    background:'rgba(34,197,94,0.04)', border:'1px solid rgba(34,197,94,0.12)',
                    textAlign:'center' }}>
                    <div style={{ fontSize:7.5, color:'#52525b', marginBottom:3 }}>T2 R:R</div>
                    <div style={{ fontSize:14, fontWeight:900,
                      color: d.rr_t2 >= 2.5 ? '#4ade80' : '#fbbf24',
                      fontFamily:'monospace' }}>
                      1:{d.rr_t2?.toFixed(1)}
                    </div>
                  </div>
                  <div style={{ flex:2, padding:'8px 10px', borderRadius:7,
                    background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize:7.5, color:'#52525b', marginBottom:3 }}>OPTION SL RULE</div>
                    <div style={{ fontSize:7.5, color:'#94a3b8', lineHeight:1.5 }}>
                      Option premium ka 40% loss pe exit karo
                    </div>
                  </div>
                </div>
              )}

              {/* ── Key Levels ── */}
              <div style={{ padding:'10px 12px', borderRadius:8,
                background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize:8, fontWeight:800, color:'#94a3b8', letterSpacing:'0.06em', marginBottom:6 }}>
                  KEY LEVELS
                </div>
                <Row label="Max Pain / VWAP Proxy" value={d.max_pain?.toLocaleString('en-IN')} color="#a78bfa" />
                <Row label="Call Wall (Resistance)" value={d.call_wall?.toLocaleString('en-IN')} color="#ef4444" />
                <Row label="Put Wall (Support)"     value={d.put_wall?.toLocaleString('en-IN')}  color="#22c55e" />
                <Row label="ATM Strike"              value={d.atm?.toLocaleString('en-IN')}        color="#e4e4e7" />
                <Row label="GEX Gamma Flip"         value={d.gamma_flip > 0 ? d.gamma_flip?.toLocaleString('en-IN') : '—'} color="#fbbf24" />
                <Row label="1SD Daily Range"        value={`±${d.sd1} pts`}                       color="#64748b" />
              </div>

              {/* ── Input Signals ── */}
              <div style={{ padding:'10px 12px', borderRadius:8,
                background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize:8, fontWeight:800, color:'#94a3b8', letterSpacing:'0.06em', marginBottom:6 }}>
                  SIGNAL INPUTS
                </div>
                <Row label="Spot"      value={d.spot?.toLocaleString('en-IN')} />
                <Row label="DOOM"     value={`${d.doom >= 0 ? '+' : ''}${d.doom}`}
                     color={d.doom >= 4 ? '#4ade80' : d.doom <= -4 ? '#f87171' : '#fbbf24'} />
                <Row label="GEX Regime" value={d.gex_regime}
                     color={d.gex_regime?.includes('POSITIVE') ? '#22c55e' : '#ef4444'} />
                <Row label="PCR"       value={d.pcr?.toFixed(3)}
                     color={d.pcr > 1.1 ? '#4ade80' : d.pcr < 0.9 ? '#f87171' : '#fbbf24'} />
                <Row label="RSI"       value={d.rsi?.toFixed(1)}
                     color={d.rsi > 70 ? '#ef4444' : d.rsi < 30 ? '#22c55e' : '#fbbf24'} />
                <Row label="MACD Hist" value={`${d.macd_hist >= 0 ? '+' : ''}${d.macd_hist}`}
                     color={d.macd_hist >= 0 ? '#4ade80' : '#f87171'} />
                <Row label="VIX"       value={d.vix?.toFixed(2)}
                     color={d.vix > 18 ? '#ef4444' : '#94a3b8'} />
              </div>

              {/* ── Why This Setup ── */}
              <div style={{ padding:'10px 12px', borderRadius:8,
                background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize:8, fontWeight:800, color:'#94a3b8', letterSpacing:'0.06em', marginBottom:6 }}>
                  SIGNAL REASONING
                </div>
                {d.signals?.map((s, i) => (
                  <div key={i} style={{ display:'flex', gap:5, alignItems:'flex-start', padding:'2px 0',
                    borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                    <CheckCircle size={9} color="#52525b" weight="fill" style={{ marginTop:1, flexShrink:0 }} />
                    <span style={{ fontSize:8.5, color:'#64748b', lineHeight:1.5 }}>{s}</span>
                  </div>
                ))}
              </div>

              {/* Disclaimer */}
              <div style={{ padding:'8px 10px', borderRadius:6, background:'rgba(245,158,11,0.05)',
                border:'1px solid rgba(245,158,11,0.15)' }}>
                <div style={{ fontSize:7.5, color:'#78716c', lineHeight:1.6 }}>
                  ⚠ Yeh ek algorithmic signal hai — investment advice nahi hai.
                  Market conditions change ho sakti hain. Always use SL. Position size 1-2% risk se zyada mat rakho.
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
