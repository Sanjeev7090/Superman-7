import React, { useState } from 'react';
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
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ''; }
}

export function MarketNewsCard({ news, C, onRefresh }) {
  const [expanded, setExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  if (!news || !news.available) return null;

  const {
    items = [], outlook, outlook_color, outlook_label,
    bull_count = 0, bear_count = 0, total = 0,
    high_count = 0,
  } = news;

  const handleRefresh = async (e) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" data-testid="market-news-card"
      style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ borderBottom: `1px solid ${C.border}` }}
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2">
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
          <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap"
            style={{ borderBottom: `1px solid ${C.borderSubtle}`, background: C.panelBg }}>
            <span className="text-[7px] uppercase tracking-wider font-semibold mr-1" style={{ color: C.textMuted }}>
              Tracking:
            </span>
            {IMPACT_FACTORS.map(f => (
              <span key={f} className="text-[7px] px-1.5 py-0.5 rounded"
                style={{ color: C.textMuted, background: C.cardBg, border: `1px solid ${C.borderSubtle}` }}>
                {f}
              </span>
            ))}
          </div>
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
          <div className="divide-y" style={{ borderColor: C.borderSubtle }}>
            {items.map((item, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-2.5" data-testid={`news-item-${i}`}>
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
                  style={{ background: item.sentiment_color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color: SOURCE_COLORS[item.source] || '#94a3b8',
                        background: `${SOURCE_COLORS[item.source] || '#94a3b8'}18`,
                      }}>
                      {item.source}
                    </span>
                    {item.impact_level === 'HIGH' && (
                      <span className="text-[6px] font-black px-1 py-0.5 rounded uppercase tracking-wider"
                        style={{ color: '#f97316', background: '#f9731618' }}>
                        HIGH IMPACT
                      </span>
                    )}
                    <span className="text-[8px]" style={{ color: C.textMuted }}>
                      {relativeTime(item.published)}
                    </span>
                    <span className="text-[7px] font-bold px-1 py-0.5 rounded"
                      style={{ color: item.sentiment_color, background: `${item.sentiment_color}15` }}>
                      {item.sentiment}
                    </span>
                  </div>
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] leading-snug font-medium hover:underline block"
                    style={{ color: C.textSecond }}>
                    {item.title}
                  </a>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 flex items-center justify-between"
            style={{ borderTop: `1px solid ${C.borderSubtle}` }}>
            <span className="text-[8px]" style={{ color: C.textMuted }}>
              Sources: ET Markets · Moneycontrol · LiveMint · Google News
            </span>
            {news.fetched_at && (
              <span className="text-[8px]" style={{ color: C.textMuted }}>
                {relativeTime(news.fetched_at)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
