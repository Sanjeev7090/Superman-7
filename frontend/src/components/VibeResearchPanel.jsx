import React, { useState, useEffect, useRef, useCallback } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

const QUICK_PROMPTS = [
  'Volume spike stocks aaj kaunse hain?',
  'Upcoming earnings ke paas wale stocks batao',
  'PCR ke hisaab se abhi kya strategy banani chahiye?',
  '52 week low ke paas wale stocks batao',
  'Breakout stocks dikhao Nifty 50 mein',
  'Momentum stocks batao jo 200 DMA ke upar hain',
];

const STRATEGY_PROMPTS = [
  'RSI 14: buy jab RSI < 30, sell jab RSI > 70',
  'EMA 9/21 crossover strategy banao',
  'Bollinger Band breakout signals do',
  'MACD histogram crossover strategy',
  'Simple moving average 20/50 crossover',
];

function getStockPrompts(stockSymbol) {
  const s = stockSymbol?.toUpperCase() || 'STOCK';
  return [
    `${s} ka current price 52-week high/low se kitna door hai?`,
    `${s} ke liye entry aur stop-loss level kya hona chahiye?`,
    `${s} aaj bullish hai ya bearish? Technical analysis batao`,
    `${s} ka support aur resistance level kya hai?`,
    `${s} mein kya koi breakout potential hai?`,
  ];
}

function MarkdownText({ text }) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-zinc-700 px-1 rounded text-[10px]">$1</code>')
    .replace(/^### (.+)$/gm, '<div class="text-[11px] font-bold text-amber-400 mt-2 mb-0.5">$1</div>')
    .replace(/^## (.+)$/gm,  '<div class="text-[12px] font-bold text-white mt-2 mb-1">$1</div>')
    .replace(/^# (.+)$/gm,   '<div class="text-[13px] font-bold text-white mt-2 mb-1">$1</div>')
    .replace(/^- (.+)$/gm,   '<div class="flex gap-1.5 items-start pl-1"><span class="text-amber-400 mt-0.5 shrink-0">•</span><span>$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="flex gap-1.5 items-start pl-1"><span class="text-amber-400 shrink-0">$1.</span><span>$2</span></div>')
    .replace(/\n\n/g, '<br/>')
    .replace(/\n/g, ' ');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── Strategy Code Block component ──────────────────────────────────────────
function StrategyCodeBlock({ code, chartBars, onStrategyMarkers }) {
  const [loadState, setLoadState] = useState('idle'); // idle | loading | loaded | error
  const [errorMsg, setErrorMsg] = useState('');
  const [stats, setStats] = useState(null);

  const handleLoad = async () => {
    if (!chartBars?.length) {
      setErrorMsg('Chart mein data nahi hai. Pehle koi stock load karo.');
      setLoadState('error');
      return;
    }
    setLoadState('loading');
    setErrorMsg('');
    try {
      const resp = await fetch(`${API}/api/vibe/strategy-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, bars: chartBars }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Execution error');
      onStrategyMarkers && onStrategyMarkers(data.markers);
      setStats({ buy: data.buy_count, sell: data.sell_count, total: data.count });
      setLoadState('loaded');
    } catch (e) {
      setErrorMsg(e.message);
      setLoadState('error');
    }
  };

  const handleClear = () => {
    onStrategyMarkers && onStrategyMarkers([]);
    setLoadState('idle');
    setStats(null);
    setErrorMsg('');
  };

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-700/60 mt-1.5" data-testid="strategy-code-block">
      {/* Code header */}
      <div className="flex items-center justify-between px-2.5 py-1 bg-zinc-800/90">
        <div className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5">
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
          <span className="text-[8px] font-mono font-bold text-amber-400">Python Strategy</span>
        </div>
        <span className="text-[7px] text-zinc-600">{code.split('\n').length} lines</span>
      </div>

      {/* Code content */}
      <pre
        className="p-2.5 text-[8.5px] font-mono text-zinc-300 bg-[#0d1117] overflow-x-auto leading-relaxed"
        style={{ maxHeight: '130px', overflowY: 'auto' }}
      >
        {code}
      </pre>

      {/* Action bar */}
      <div className="px-2.5 py-1.5 bg-zinc-800/60 flex items-center gap-2 flex-wrap">
        {loadState === 'idle' && (
          <button
            onClick={handleLoad}
            data-testid="load-on-chart-btn"
            className="flex items-center gap-1 text-[8px] px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30 transition-all"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Load on Chart
          </button>
        )}

        {loadState === 'loading' && (
          <span className="text-[8px] text-amber-400 flex items-center gap-1">
            <span className="animate-spin inline-block w-2.5 h-2.5 border border-amber-400/40 border-t-amber-400 rounded-full" />
            Executing strategy...
          </span>
        )}

        {loadState === 'loaded' && (
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-emerald-400 flex items-center gap-1">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Chart pe load ho gaya
            </span>
            {stats && (
              <span className="text-[7px] text-zinc-500">
                {stats.buy}B / {stats.sell}S signals
              </span>
            )}
            <button
              onClick={handleClear}
              className="text-[7px] text-zinc-600 hover:text-red-400 border border-zinc-700 rounded px-1.5 py-0.5 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {loadState === 'error' && (
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-red-400 flex items-center gap-1">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {errorMsg.slice(0, 60)}
            </span>
            <button
              onClick={handleLoad}
              className="text-[7px] text-amber-500 hover:text-amber-400 border border-zinc-700 rounded px-1.5 py-0.5"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VibeResearchPanel({
  selectedStock = null,
  onLoadStock = null,
  chartBars = [],
  onStrategyMarkers = null,
}) {
  const [sessions,      setSessions]      = useState([]);
  const [activeSess,    setActiveSess]    = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [streaming,     setStreaming]     = useState(false);
  const [streamBuf,     setStreamBuf]     = useState('');
  const [screenerChips, setScreenerChips] = useState(null);

  // Strategy Builder state
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [strategyPrompt,    setStrategyPrompt]    = useState('');
  const [buildingStrategy,  setBuildingStrategy]  = useState(false);

  const bottomRef     = useRef(null);
  const inputRef      = useRef(null);
  const strategyRef   = useRef(null);
  const abortRef      = useRef(null);

  const newSessionId = () => `vibe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const handleNewChat = useCallback(() => {
    const id   = newSessionId();
    const sess = { id, title: 'New Research', messages: [] };
    setSessions(prev => [sess, ...prev]);
    setActiveSess(id);
    setMessages([]);
    setShowStrategyModal(false);
  }, []);

  useEffect(() => { handleNewChat(); }, []); // eslint-disable-line

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuf]);

  // Focus strategy textarea when modal opens
  useEffect(() => {
    if (showStrategyModal) setTimeout(() => strategyRef.current?.focus(), 100);
  }, [showStrategyModal]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || streaming) return;
    const userText = text.trim();
    setInput('');

    const userMsg = { role: 'user', content: userText, id: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setStreaming(true);
    setStreamBuf('');
    setScreenerChips(null);

    if (messages.length === 0) {
      setSessions(prev => prev.map(s =>
        s.id === activeSess ? { ...s, title: userText.slice(0, 40) } : s
      ));
    }

    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const resp = await fetch(`${API}/api/vibe/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSess,
          message: userText,
          stock_context: selectedStock?.symbol || selectedStock?.ticker || null,
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = '';
      let   full   = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6);
            if (raw === '[DONE]') break;
            try {
              const chunk = JSON.parse(raw);
              if (chunk.type === 'screener_stocks') {
                setScreenerChips({ label: chunk.label, stocks: chunk.stocks });
              } else if (chunk.token) {
                full += chunk.token;
                setStreamBuf(full);
              }
            } catch (_) {}
          }
        }
      }

      const aiMsg = { role: 'assistant', content: full || '…', id: Date.now() + 1 };
      setMessages(prev => [...prev, aiMsg]);
      setSessions(prev => prev.map(s =>
        s.id === activeSess ? { ...s, messages: [...updated, aiMsg] } : s
      ));
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Error: Could not connect to Vibe agent. Please try again.',
          id: Date.now() + 1,
          isError: true,
        }]);
      }
    } finally {
      setStreaming(false);
      setStreamBuf('');
    }
  }, [messages, activeSess, streaming, selectedStock]);

  // ── Strategy Builder: generate code via LLM ─────────────────────
  const handleBuildStrategy = useCallback(async () => {
    if (!strategyPrompt.trim() || buildingStrategy) return;
    const prompt = strategyPrompt.trim();
    setStrategyPrompt('');
    setShowStrategyModal(false);
    setBuildingStrategy(true);

    // Add user message showing the strategy prompt
    const userMsg = {
      role: 'user',
      content: `[Strategy Builder] ${prompt}`,
      id: Date.now(),
      isStrategy: true,
    };
    const updated = [...messages, userMsg];
    setMessages(updated);

    // Update session title
    if (messages.length === 0) {
      setSessions(prev => prev.map(s =>
        s.id === activeSess ? { ...s, title: `Strategy: ${prompt.slice(0, 30)}` } : s
      ));
    }

    try {
      const resp = await fetch(`${API}/api/vibe/strategy-build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          ticker: selectedStock?.ticker || selectedStock?.yf_ticker || null,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Build error');

      const aiMsg = {
        role: 'assistant',
        content: `Strategy ready! Neeche code dekho aur "Load on Chart" click karo apne active chart pe signals dekhne ke liye.`,
        strategyCode: data.code,
        strategyPrompt: prompt,
        id: Date.now() + 1,
      };
      setMessages(prev => [...prev, aiMsg]);
      setSessions(prev => prev.map(s =>
        s.id === activeSess ? { ...s, messages: [...updated, aiMsg] } : s
      ));
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Strategy generate karne mein error: ${e.message}`,
        id: Date.now() + 1,
        isError: true,
      }]);
    } finally {
      setBuildingStrategy(false);
    }
  }, [strategyPrompt, buildingStrategy, messages, activeSess, selectedStock]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const stopStream = () => { abortRef.current?.abort(); };

  const allEmpty = messages.length === 0 && !streaming && !buildingStrategy;

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] text-white">

      {/* ── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <span className="text-[8px] font-bold text-amber-400">V</span>
          </div>
          <span className="text-[11px] font-bold text-white">Vibe Research</span>
          <span className="text-[8px] text-zinc-600 border border-zinc-800 rounded px-1">claude-sonnet-4-6</span>
        </div>
        <button
          onClick={handleNewChat}
          className="text-[8px] text-zinc-500 border border-zinc-800 hover:border-amber-500/40 hover:text-amber-400 rounded px-2 py-1 transition-colors"
          data-testid="vibe-new-chat-btn"
        >
          + New Chat
        </button>
      </div>

      {/* ── Stock context chip ────────────────────────── */}
      {selectedStock && (
        <div className="px-3 py-1.5 border-b border-white/10 shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
            <span className="text-[8px] text-zinc-400">Live context:</span>
            <span className="text-[8px] font-bold text-amber-400">
              {selectedStock.symbol || selectedStock.ticker || selectedStock}
            </span>
            <span className="text-[7px] text-zinc-600">price · 52W high/low injected</span>
            {chartBars?.length > 0 && (
              <span className="text-[7px] text-zinc-700 ml-auto">{chartBars.length} bars ready</span>
            )}
          </div>
        </div>
      )}

      {/* ── Sessions list ─────────────────────────────── */}
      {sessions.length > 1 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-white/10 overflow-x-auto shrink-0 scrollbar-none">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => { setActiveSess(s.id); setMessages(s.messages); }}
              className={`text-[7.5px] whitespace-nowrap px-2 py-0.5 rounded border transition-colors ${
                s.id === activeSess
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'
              }`}
            >
              {s.title.slice(0, 24)}
            </button>
          ))}
        </div>
      )}

      {/* ── Messages area ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

        {/* Welcome screen */}
        {allEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <span className="text-2xl font-black text-amber-400">V</span>
            </div>
            <div className="text-center">
              <p className="text-[13px] font-bold text-white mb-1">Vibe Research Agent</p>
              <p className="text-[10px] text-zinc-500">NSE · BSE · Options · F&amp;O · Market Intel · Strategy Builder</p>
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              {(selectedStock
                ? getStockPrompts(selectedStock?.symbol || selectedStock?.ticker || selectedStock)
                : QUICK_PROMPTS
              ).map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p)}
                  className="text-left text-[9px] text-zinc-400 border border-zinc-800 hover:border-amber-500/40 hover:text-amber-400 rounded-lg px-3 py-2 transition-all"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className={`w-5 h-5 rounded-full ${msg.strategyCode ? 'bg-amber-500/30 border-amber-500/50' : 'bg-amber-500/20 border-amber-500/30'} border flex items-center justify-center shrink-0 mr-1.5 mt-0.5`}>
                {msg.strategyCode ? (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                ) : (
                  <span className="text-[7px] font-bold text-amber-400">V</span>
                )}
              </div>
            )}
            <div
              className={`max-w-[88%] rounded-lg px-2.5 py-2 text-[10px] leading-relaxed ${
                msg.role === 'user'
                  ? msg.isStrategy
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-br-sm'
                    : 'bg-[#007AFF] text-white rounded-br-sm'
                  : msg.isError
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : 'bg-zinc-900 border border-white/8 text-zinc-200 rounded-bl-sm'
              }`}
            >
              {msg.role === 'user'
                ? msg.content
                : (
                  <div>
                    <MarkdownText text={msg.content} />
                    {msg.strategyCode && (
                      <StrategyCodeBlock
                        code={msg.strategyCode}
                        chartBars={chartBars}
                        onStrategyMarkers={onStrategyMarkers}
                      />
                    )}
                  </div>
                )
              }
            </div>
          </div>
        ))}

        {/* Building strategy indicator */}
        {buildingStrategy && (
          <div className="flex justify-start">
            <div className="w-5 h-5 rounded-full bg-amber-500/30 border border-amber-500/50 flex items-center justify-center shrink-0 mr-1.5 mt-0.5">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
            </div>
            <div className="max-w-[88%] rounded-lg rounded-bl-sm px-2.5 py-2 text-[10px] bg-zinc-900 border border-amber-500/20 text-amber-400">
              <span className="flex gap-1 items-center">
                <span className="animate-pulse">Strategy code generate ho raha hai</span>
                <span className="animate-bounce">•</span>
                <span className="animate-bounce" style={{animationDelay:'0.15s'}}>•</span>
                <span className="animate-bounce" style={{animationDelay:'0.3s'}}>•</span>
              </span>
            </div>
          </div>
        )}

        {/* Streaming bubble */}
        {streaming && (
          <div className="flex justify-start">
            <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mr-1.5 mt-0.5">
              <span className="text-[7px] font-bold text-amber-400">V</span>
            </div>
            <div className="max-w-[88%] rounded-lg rounded-bl-sm px-2.5 py-2 text-[10px] leading-relaxed bg-zinc-900 border border-white/8 text-zinc-200">
              {streamBuf
                ? <><MarkdownText text={streamBuf} /><span className="animate-pulse text-amber-400">▋</span></>
                : <span className="flex gap-1 items-center text-zinc-500">
                    <span className="animate-bounce">•</span>
                    <span className="animate-bounce" style={{animationDelay:'0.15s'}}>•</span>
                    <span className="animate-bounce" style={{animationDelay:'0.3s'}}>•</span>
                  </span>
              }
            </div>
          </div>
        )}

        {/* Screener chips */}
        {!streaming && screenerChips && screenerChips.stocks?.length > 0 && onLoadStock && (
          <div className="ml-6 mt-1 mb-1">
            <p className="text-[7.5px] text-zinc-600 mb-1.5">Chart mein load karo →</p>
            <div className="flex flex-wrap gap-1">
              {screenerChips.stocks.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onLoadStock(s.sym)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-700 hover:border-amber-500/60 bg-zinc-900 hover:bg-amber-500/10 transition-all group"
                >
                  <span className="text-[8px] font-bold text-zinc-300 group-hover:text-amber-400">{s.sym}</span>
                  <span className={`text-[7px] ${s.chg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {s.chg >= 0 ? '+' : ''}{s.chg?.toFixed(1)}%
                  </span>
                  <span className="text-[7px] text-zinc-600 group-hover:text-amber-500">↗</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Strategy Builder Modal ────────────────────── */}
      {showStrategyModal && (
        <div className="shrink-0 border-t border-amber-500/25 bg-zinc-950 px-3 pt-2 pb-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Strategy Builder</span>
            </div>
            <button
              onClick={() => setShowStrategyModal(false)}
              className="text-zinc-600 hover:text-zinc-300 text-[12px] leading-none"
            >×</button>
          </div>

          {/* Quick strategy prompts */}
          <div className="flex gap-1 overflow-x-auto mb-2 scrollbar-none">
            {STRATEGY_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => setStrategyPrompt(p)}
                className="text-[7px] whitespace-nowrap px-2 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:border-amber-500/40 hover:text-amber-400 transition-colors shrink-0"
              >
                {p.slice(0, 28)}
              </button>
            ))}
          </div>

          <textarea
            ref={strategyRef}
            value={strategyPrompt}
            onChange={e => setStrategyPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleBuildStrategy();
              if (e.key === 'Escape') setShowStrategyModal(false);
            }}
            placeholder="Strategy describe karo... e.g. RSI 14 strategy: buy < 30, sell > 70"
            rows={2}
            className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500/50 rounded-lg px-3 py-2 text-[9.5px] text-zinc-200 placeholder:text-zinc-600 resize-none outline-none transition-colors"
            data-testid="strategy-prompt-input"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[7px] text-zinc-700">Ctrl+Enter to generate</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setShowStrategyModal(false)}
                className="text-[8px] text-zinc-500 border border-zinc-800 hover:border-zinc-600 rounded px-2 py-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBuildStrategy}
                disabled={!strategyPrompt.trim() || buildingStrategy}
                className="text-[8px] bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30 rounded px-2.5 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                data-testid="strategy-generate-btn"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Generate Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Input area ────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 px-3 py-2">
        <div className="flex items-end gap-1.5">
          {/* Strategy Builder toggle button */}
          <button
            onClick={() => setShowStrategyModal(s => !s)}
            title="Strategy Builder — Python algo code generate karo"
            data-testid="strategy-builder-btn"
            className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
              showStrategyModal
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                : 'bg-zinc-900 border-zinc-800 hover:border-amber-500/40 text-zinc-500 hover:text-amber-400'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about markets, stocks, options..."
            rows={1}
            disabled={streaming}
            className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-amber-500/50 rounded-lg px-3 py-2 text-[10px] text-zinc-200 placeholder:text-zinc-600 resize-none outline-none transition-colors disabled:opacity-50 min-h-[34px] max-h-[80px]"
            style={{ fieldSizing: 'content' }}
          />
          {streaming ? (
            <button
              onClick={stopStream}
              className="shrink-0 w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] flex items-center justify-center hover:bg-red-500/30 transition-colors"
              title="Stop"
            >■</button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[12px] flex items-center justify-center hover:bg-amber-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Send (Enter)"
              data-testid="vibe-send-btn"
            >↑</button>
          )}
        </div>
        <p className="text-[7px] text-zinc-700 mt-1 text-center">
          Shift+Enter for new line · Strategy Builder for algo signals · Educational only
        </p>
      </div>
    </div>
  );
}
