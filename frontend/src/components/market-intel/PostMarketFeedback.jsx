import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export function PostMarketFeedback({ C, isDark }) {
  const [fb,      setFb]      = useState(null);
  const [loading, setLoading] = useState(false);
  const [showWhy, setShowWhy] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API}/market-intel/closing-prediction`);
      if (data?.is_market_closed && data?.market_feedback) {
        setFb({ ...data.market_feedback, dec: data.decision });
      } else {
        setFb(null);
      }
    } catch (_) {
      setFb(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;
  if (!fb)     return null;

  const vc      = fb.verdict_color;
  const isWrong = fb.accuracy === 'WRONG';
  const isRight = fb.accuracy === 'CORRECT';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `2px solid ${vc}40` }}
      data-testid="post-market-feedback"
    >
      {/* ── Header ── */}
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ background: `${vc}12` }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: vc }}>
            Post-Market Feedback
          </span>
          <span
            className="text-[8px] font-black px-2 py-0.5 rounded-full"
            style={{ background: `${vc}22`, color: vc, border: `1px solid ${vc}40` }}
          >
            {fb.verdict_icon} {fb.accuracy}
          </span>
        </div>
        <span className="text-[8px] font-mono" style={{ color: C.textMuted }}>
          Score: {fb.score_at_close > 0 ? '+' : ''}{fb.score_at_close}
        </span>
      </div>

      <div className="px-3 pb-3 pt-2 space-y-2.5" style={{ background: C.panelBg }}>

        {/* ── Verdict text ── */}
        <div className="text-[9px] font-semibold leading-snug" style={{ color: vc }}>
          {fb.verdict_text}
        </div>

        {/* ── Prediction vs Actual grid ── */}
        <div className="grid grid-cols-2 gap-2">
          {/* Predicted */}
          <div className="rounded-lg px-2.5 py-2" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <div className="text-[7px] uppercase tracking-widest font-bold mb-1" style={{ color: C.textMuted }}>
              Prediction
            </div>
            <div className="text-[9px] font-bold" style={{ color: isWrong ? '#f59e0b' : vc }}>
              {fb.predicted_signal}
            </div>
            <div className="text-[8px] font-mono mt-0.5" style={{ color: C.textSecond }}>
              {fb.predicted_move}
            </div>
            <div className="text-[7px] mt-0.5" style={{ color: C.textMuted }}>
              Action: {fb.predicted_action}
            </div>
          </div>

          {/* Actual */}
          <div className="rounded-lg px-2.5 py-2" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <div className="text-[7px] uppercase tracking-widest font-bold mb-1" style={{ color: C.textMuted }}>
              Actual Result
            </div>
            <div
              className="text-[9px] font-bold font-mono"
              style={{ color: fb.actual_move >= 0 ? '#22c55e' : '#ef4444' }}
            >
              {fb.actual_move >= 0 ? '+' : ''}{fb.actual_move} pts
            </div>
            <div className="text-[8px] font-mono mt-0.5" style={{ color: C.textSecond }}>
              {fb.actual_pct >= 0 ? '+' : ''}{fb.actual_pct}% | Range {fb.actual_range} pts
            </div>
            <div className="text-[7px] mt-0.5 font-mono" style={{ color: C.textMuted }}>
              Close: {fb.actual_close} | Open: {fb.actual_open}
            </div>
          </div>
        </div>

        {/* ── High / Low strip ── */}
        <div className="flex items-center gap-3 text-[8px] font-mono px-1 flex-wrap">
          <span style={{ color: '#22c55e' }}>H: {fb.day_high}</span>
          <span style={{ color: '#ef4444' }}>L: {fb.day_low}</span>
          <span style={{ color: '#fbbf24' }}>Range: {fb.actual_range} pts</span>
        </div>

        {/* ── WHY IT HAPPENED — Core Logic Explanation ── */}
        {fb.why_points && fb.why_points.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            {/* Why header (collapsible) */}
            <button
              onClick={() => setShowWhy(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2"
              style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 9 }}>🔍</span>
                <span
                  className="text-[8px] font-black uppercase tracking-widest"
                  style={{ color: isWrong ? '#f59e0b' : isRight ? '#22c55e' : C.textSecond }}
                >
                  Kyu Hua? — Core Logic
                </span>
              </div>
              <span className="text-[8px]" style={{ color: C.textMuted }}>
                {showWhy ? '▲' : '▼ Explanation dekho'}
              </span>
            </button>

            {showWhy && (
              <div className="px-3 py-2 space-y-1.5" style={{ background: C.cardBg }}>
                {fb.why_points.map((pt, i) => (
                  <div
                    key={i}
                    className="text-[8.5px] leading-snug"
                    style={{ color: C.textSecond }}
                  >
                    {pt}
                  </div>
                ))}

                {/* Factors table */}
                {fb.factors_used && fb.factors_used.length > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: `1px dashed ${C.borderSubtle}` }}>
                    <div
                      className="text-[7px] uppercase tracking-widest font-bold mb-1.5"
                      style={{ color: C.textMuted }}
                    >
                      Score Breakdown (at close)
                    </div>
                    {fb.factors_used.map((f, i) => {
                      const sc  = f.score ?? 0;
                      const col = sc > 0 ? '#22c55e' : sc < 0 ? '#ef4444' : '#94a3b8';
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between text-[7.5px] py-0.5"
                          style={{ borderBottom: i < fb.factors_used.length - 1 ? `1px solid ${C.borderSubtle}` : 'none' }}
                        >
                          <span style={{ color: C.textSecond }}>{f.label || f.name}</span>
                          <span
                            className="font-bold font-mono ml-2 shrink-0"
                            style={{ color: col }}
                          >
                            {sc > 0 ? '+' : ''}{sc}
                          </span>
                        </div>
                      );
                    })}
                    <div
                      className="flex items-center justify-between text-[8px] font-bold mt-1 pt-1"
                      style={{ borderTop: `1px solid ${C.border}` }}
                    >
                      <span style={{ color: C.textSecond }}>Total Score</span>
                      <span
                        className="font-mono"
                        style={{ color: fb.score_at_close > 0 ? '#22c55e' : fb.score_at_close < 0 ? '#ef4444' : '#94a3b8' }}
                      >
                        {fb.score_at_close > 0 ? '+' : ''}{fb.score_at_close}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
