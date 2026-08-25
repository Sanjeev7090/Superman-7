import React, { useState, useEffect, useCallback } from 'react';
import { Globe, ArrowClockwise } from '@phosphor-icons/react';

const SOURCE_COLORS = {
  'ET Markets':        '#e8192c',
  'Moneycontrol':      '#2563eb',
  'Business Standard': '#1e40af',
  'LiveMint':          '#16a34a',
  'Google News':       '#4285F4',
};

const IMPACT_FACTORS = [
  'FII/DII', 'India VIX', 'RBI', 'GIFT Nifty', 'Crude Oil', 'Rupee/USD',
  'F&O Expiry', 'US Fed', 'Nifty 50', 'Budget', 'Sensex'
];

function relativeTime(isoStr) {
  if (!isoStr) return '';
  try {
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60)     return 'just now';
    if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ''; }
}

function freshnessColor(isoStr) {
  if (!isoStr) return '#94a3b8';
  try {
    const hrs = (Date.now() - new Date(isoStr).getTime()) / 3600000;
    if (hrs < 1)  return '#22c55e';   // < 1h  → green
    if (hrs < 4)  return '#86efac';   // < 4h  → light green
    if (hrs < 8)  return '#fbbf24';   // < 8h  → amber
    if (hrs < 16) return '#f97316';   // < 16h → orange
    return '#ef4444';                  // old   → red
  } catch { return '#94a3b8'; }
}

export function MarketNewsCard({ news, C, onRefresh }) {
  const [expanded,   setExpanded]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh,setLastRefresh]= useState(null);

  // Auto-refresh every 5 minutes while visible
  const triggerRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh?.();
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, onRefresh]);

  useEffect(() => {
    if (!expanded) return;
    const t = setInterval(triggerRefresh, 5 * 60 * 1000);   // 5-min auto-refresh
    return () => clearInterval(t);
  }, [expanded, triggerRefresh]);

  if (!news || !news.available) return null;

  const {
    items = [], outlook, outlook_color, outlook_label,
    bull_count = 0, bear_count = 0, total = 0,
    high_count = 0, oldest_shown_hrs = 0, cutoff_hours = 24,
    fetched_at,
  } = news;

  const handleRefresh = async (e) => {
    e.stopPropagation();
    await triggerRefresh();
  };

  const staleWarning = oldest_shown_hrs > cutoff_hours;

  return (
    <div className="rounded-xl overflow-hidden" data-testid="market-news-card"
      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ borderBottom: `1px solid ${C.border}` }}
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2 flex-wrap">
          <Globe size={13} style={{ color: outlook_color }} />
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.textPrimary }}>
            Nifty 50 News Intelligence
          </span>
          {high_count > 0 && (
            <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider"
              style={{ color: '#f97316', background: '#f9731618', border: '1px solid #f9731640' }}>
              {high_count} HIGH
            </span>
          )}
          {/* Freshness badge */}
          {fetched_at && (
            <span className="text-[7px] px-1.5 py-0.5 rounded font-semibold"
              style={{ color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)' }}>
              ⟳ {relativeTime(fetched_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ color: outlook_color, background: `${outlook_color}18`, border: `1px solid ${outlook_color}40` }}>
            {outlook}
          </span>
          <span className="text-[8px] font-semibold" style={{ color: '#22c55e' }}>{bull_count}↑</span>
          <span className="text-[8px] font-semibold" style={{ color: '#ef4444' }}>{bear_count}↓</span>
          <button
            data-testid="news-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded p-1 transition-opacity hover:opacity-70"
            style={{ color: C.textMuted, background: C.panelBg }}>
            <ArrowClockwise size={11} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <span className="text-[9px] rounded px-1 py-0.5" style={{ color: C.textMuted, background: C.panelBg }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {expanded && (
        <>
          {/* Staleness warning */}
          {staleWarning && (
            <div className="px-4 py-2 text-[8px] font-semibold flex items-center gap-1.5"
              style={{ background: 'rgba(251,191,36,0.08)', borderBottom: `1px solid rgba(251,191,36,0.2)`, color: '#fbbf24' }}>
              ⚠️ Oldest news shown: {oldest_shown_hrs.toFixed(0)}h ago — RSS feeds may be slow. Refresh to try again.
            </div>
          )}

          {/* Tracking factors */}
          <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap"
            style={{ borderBottom: `1px solid ${C.borderSubtle}`, background: C.panelBg }}>
            <span className="text-[7px] uppercase tracking-wider font-semibold mr-1" style={{ color: C.textMuted }}>
              Day Trading Factors:
            </span>
            {IMPACT_FACTORS.map(f => (
              <span key={f} className="text-[7px] px-1.5 py-0.5 rounded"
                style={{ color: C.textMuted, background: C.cardBg, border: `1px solid ${C.borderSubtle}` }}>
                {f}
              </span>
            ))}
          </div>

          {/* Sentiment bar */}
          <div className="px-4 py-2.5 flex items-center gap-3"
            style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
            {total > 0 && (
              <div className="flex-1 h-1.5 rounded-full overflow-hidden flex" style={{ background: C.panelBg }}>
                <div style={{ width: `${(bull_count / total) * 100}%`, background: '#22c55e', transition: 'width 0.3s' }} />
                <div style={{ width: `${(bear_count / total) * 100}%`, background: '#ef4444', transition: 'width 0.3s' }} />
                <div style={{ flex: 1, background: '#94a3b815' }} />
              </div>
            )}
            <span className="text-[8px] whitespace-nowrap font-medium" style={{ color: C.textMuted }}>
              {outlook_label}
            </span>
          </div>

          {/* News items */}
          <div className="divide-y" style={{ borderColor: C.borderSubtle }}>
            {items.map((item, i) => {
              const timeColor = freshnessColor(item.published);
              const timeLabel = relativeTime(item.published);
              return (
                <div key={i} className="px-4 py-3 flex items-start gap-2.5" data-testid={`news-item-${i}`}>
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2"
                    style={{ background: item.sentiment_color }} />
                  <div className="flex-1 min-w-0 space-y-1">

                    {/* Row 1: source + badges + time */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          color: SOURCE_COLORS[item.source] || '#94a3b8',
                          background: `${SOURCE_COLORS[item.source] || '#94a3b8'}18`,
                        }}>
                        {item.source}
                      </span>

                      {/* HIGH IMPACT badge */}
                      {item.impact_level === 'HIGH' && (
                        <span className="text-[6px] font-black px-1 py-0.5 rounded uppercase tracking-wider"
                          style={{ color: '#f97316', background: '#f9731618', border: '1px solid #f9731630' }}>
                          HIGH IMPACT
                        </span>
                      )}

                      {/* Intraday tag */}
                      {item.intraday_tag && (
                        <span className="text-[7px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            color: item.intraday_tag_color,
                            background: `${item.intraday_tag_color}18`,
                            border: `1px solid ${item.intraday_tag_color}30`,
                          }}>
                          {item.intraday_tag}
                        </span>
                      )}

                      {/* Sentiment */}
                      <span className="text-[7px] font-bold px-1 py-0.5 rounded"
                        style={{ color: item.sentiment_color, background: `${item.sentiment_color}15` }}>
                        {item.sentiment}
                      </span>

                      {/* Time ago — color-coded for freshness */}
                      {timeLabel && (
                        <span className="text-[8px] font-mono font-semibold" style={{ color: timeColor }}>
                          {timeLabel}
                        </span>
                      )}
                    </div>

                    {/* Row 2: Headline */}
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] leading-snug font-medium hover:underline block"
                      style={{ color: C.textSecond }}>
                      {item.title}
                    </a>

                    {/* Row 3: Nifty expected impact */}
                    {item.nifty_pts_label && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[7px] uppercase tracking-widest font-semibold"
                          style={{ color: C.textMuted }}>
                          Nifty Impact:
                        </span>
                        <span className="text-[8px] font-bold font-mono"
                          style={{ color: item.nifty_pts_color }}>
                          {item.nifty_pts_label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 flex items-center justify-between"
            style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
            <span className="text-[8px]" style={{ color: C.textMuted }}>
              Sources: ET Markets · Moneycontrol · LiveMint · Google News
            </span>
            <div className="flex items-center gap-2">
              {oldest_shown_hrs > 0 && (
                <span className="text-[7px]" style={{ color: oldest_shown_hrs > 12 ? '#f97316' : C.textMuted }}>
                  Oldest: {oldest_shown_hrs.toFixed(0)}h
                </span>
              )}
              {fetched_at && (
                <span className="text-[8px]" style={{ color: C.textMuted }}>
                  Updated {relativeTime(fetched_at)}
                </span>
              )}
              {lastRefresh && (
                <span className="text-[7px]" style={{ color: '#22c55e' }}>
                  • refreshed {relativeTime(lastRefresh.toISOString())}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
