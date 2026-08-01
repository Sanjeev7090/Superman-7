import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  TrendUp, TrendDown, X, ArrowsClockwise, Wallet, Trophy,
  ChartBar, Warning, Info, PlugsConnected, Plugs
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import OptionsPaperTradeModal from './OptionsPaperTradeModal';
import BrokerSettingsModal from './BrokerSettingsModal';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ---- Stat Card ----
const StatCard = ({ label, value, sub, color, testId }) => (
  <div className="bg-white/[0.03] border border-white/8 rounded-lg p-2.5 flex flex-col gap-0.5" data-testid={testId}>
    <span className="text-[8px] text-zinc-500 uppercase tracking-[0.2em] font-bold">{label}</span>
    <span
      className="text-sm font-black font-mono text-white"
      style={color ? { color } : undefined}
    >{value}</span>
    {sub && <span className="text-[9px] text-zinc-600">{sub}</span>}
  </div>
);

// ---- Position Row ----
const PositionRow = ({ pos, onClose }) => {
  const isBuy = pos.direction === 'BUY';
  const pnlColor = pos.pnl >= 0 ? '#00E676' : '#FF3B30';
  const pnlSign = pos.pnl >= 0 ? '+' : '';

  return (
    <div
      className={`border rounded-lg p-2.5 ${isBuy ? 'border-[#00E676]/20 bg-[#00E676]/3' : 'border-[#FF3B30]/20 bg-[#FF3B30]/3'}`}
      data-testid={`position-${pos.trade_id}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {isBuy
            ? <TrendUp size={11} className="text-[#00E676]" weight="bold" />
            : <TrendDown size={11} className="text-[#FF3B30]" weight="bold" />}
          <span className="text-[11px] font-black text-white">{pos.symbol.replace('.NS', '').replace('.BO', '')}</span>
          <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${isBuy ? 'bg-[#00E676]/15 text-[#00E676]' : 'bg-[#FF3B30]/15 text-[#FF3B30]'}`}>
            {pos.direction}
          </span>
          {pos.source === 'AUTO' && (
            <span className="text-[7px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold">AUTO</span>
          )}
          {pos.option_meta && (
            <span className={`text-[7px] px-1.5 py-0.5 rounded font-bold border ${
              pos.option_meta.option_type === 'CE'
                ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/20'
                : 'bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/20'
            }`}>
              {pos.option_meta.option_type} OPT
            </span>
          )}
          <span className="text-[7px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold border border-yellow-500/20">5x</span>
        </div>
        <button
          onClick={() => onClose(pos)}
          className="text-zinc-600 hover:text-[#FF3B30] transition-colors p-0.5"
          data-testid={`close-position-${pos.trade_id}`}
          title="Close Position"
        >
          <X size={12} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 text-[9px] font-mono mb-1.5">
        <div>
          <span className="text-zinc-600 block">Entry</span>
          <span className="text-zinc-300">₹{pos.entry_price}</span>
        </div>
        <div>
          <span className="text-zinc-600 block">Current</span>
          <span className="text-zinc-300">₹{pos.current_price || pos.entry_price}</span>
        </div>
        <div>
          <span className="text-zinc-600 block">Margin</span>
          <span className="text-yellow-400">₹{pos.margin_used?.toFixed(0) ?? pos.invested_amount?.toFixed(0)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[9px] font-mono">
          <span className="text-zinc-600">SL: <span className="text-red-400">₹{pos.stop_loss}</span></span>
          <span className="text-zinc-600">T: <span className="text-emerald-400">₹{pos.target}</span></span>
        </div>
        <span className="text-[10px] font-black font-mono" style={{ color: pnlColor }}>
          {pnlSign}₹{pos.pnl?.toFixed(0) ?? '—'} ({pnlSign}{pos.pnl_pct?.toFixed(1) ?? '—'}%)
        </span>
      </div>

      {pos.strategy && pos.strategy !== 'MANUAL' && (
        <div className="mt-1 text-[8px] text-zinc-600 font-mono">{pos.strategy}</div>
      )}
    </div>
  );
};

// ---- History Row ----
const HistoryRow = ({ trade }) => {
  const statusColors = {
    CLOSED: { text: '#A0A0A0', bg: 'bg-zinc-700/20' },
    SL_HIT: { text: '#FF3B30', bg: 'bg-[#FF3B30]/10' },
    TARGET_HIT: { text: '#00E676', bg: 'bg-[#00E676]/10' },
  };
  const sc = statusColors[trade.status] || statusColors.CLOSED;
  const pnlColor = trade.pnl >= 0 ? '#00E676' : '#FF3B30';
  const pnlSign = trade.pnl >= 0 ? '+' : '';
  const date = trade.exit_time ? new Date(trade.exit_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0" data-testid={`history-${trade.trade_id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-bold text-white truncate">{trade.symbol.replace('.NS', '').replace('.BO', '')}</span>
          <span className={`text-[7px] px-1 py-0.5 rounded font-bold ${sc.bg}`} style={{ color: sc.text }}>{trade.status}</span>
        </div>
        <div className="flex items-center gap-2 text-[8px] font-mono text-zinc-500">
          <span>{trade.direction}</span>
          <span>₹{trade.entry_price} → ₹{trade.exit_price}</span>
          <span>{date}</span>
        </div>
      </div>
      <span className="text-[11px] font-black font-mono whitespace-nowrap" style={{ color: pnlColor }}>
        {pnlSign}₹{trade.pnl?.toFixed(0) ?? '—'}
      </span>
    </div>
  );
};

// ---- ClosePositionModal ----
const CloseModal = ({ position, onConfirm, onCancel }) => {
  const [exitPrice, setExitPrice] = useState(position?.current_price || position?.entry_price || '');
  const [loading, setLoading] = useState(false);

  const handleClose = async () => {
    if (!exitPrice) return;
    setLoading(true);
    await onConfirm(position.trade_id, parseFloat(exitPrice));
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/15 rounded-xl p-5 w-full max-w-[320px] shadow-2xl">
        <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2">
          <Warning size={16} className="text-yellow-400" />
          Close Position
        </h3>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-500">Symbol</span>
            <span className="text-white font-bold">{position?.symbol}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-500">Direction</span>
            <span className={position?.direction === 'BUY' ? 'text-[#00E676]' : 'text-[#FF3B30]'} style={{ fontWeight: 900 }}>
              {position?.direction}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-500">Qty</span>
            <span className="text-white">{position?.quantity}</span>
          </div>
          <div>
            <label className="text-[9px] text-zinc-500 block mb-1 uppercase tracking-wider">Exit Price</label>
            <input
              type="number"
              value={exitPrice}
              onChange={e => setExitPrice(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded px-3 py-1.5 text-sm font-mono text-white outline-none focus:border-[#00E676]/50"
              step="0.05"
              data-testid="exit-price-input"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 text-[10px] font-bold text-zinc-400 hover:text-white border border-white/10 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleClose}
            disabled={loading || !exitPrice}
            className="flex-1 py-2 text-[10px] font-bold bg-[#FF3B30]/20 text-[#FF3B30] hover:bg-[#FF3B30]/30 border border-[#FF3B30]/30 rounded-lg transition-colors disabled:opacity-40"
            data-testid="confirm-close-btn"
          >
            {loading ? 'Closing...' : 'Confirm Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---- Main PaperTradingPanel ----
const PaperTradingPanel = ({ selectedStock, pendingTrade, onPendingTradeConsumed, autoExecute, onAutoExecuteChange }) => {
  const [portfolio, setPortfolio] = useState(null);
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('positions'); // positions | history | order
  const [closeModal, setCloseModal] = useState(null);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [brokerSettings, setBrokerSettings] = useState(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Order form state
  const [form, setForm] = useState({
    symbol: '',
    direction: 'BUY',
    quantity: 10,
    entry_price: '',
    stop_loss: '',
    target: '',
    strategy: 'MANUAL',
  });
  const [placing, setPlacing] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoadingPortfolio(true);
    try {
      const [portRes, posRes, histRes] = await Promise.all([
        axios.get(`${API}/paper-trade/portfolio`),
        axios.get(`${API}/paper-trade/positions`),
        axios.get(`${API}/paper-trade/history`),
      ]);
      setPortfolio(portRes.data);
      setPositions(posRes.data.positions || []);
      setHistory(histRes.data.trades || []);
    } catch (e) {
      console.error('Paper trade fetch error:', e);
    } finally {
      setLoadingPortfolio(false);
    }
  }, []);

  const fetchBrokerSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/broker/settings`);
      setBrokerSettings(res.data);
      if (res.data?.connected) {
        setIsLiveMode(true);
      }
    } catch (e) {
      // no broker connected yet
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchBrokerSettings();
    const interval = setInterval(fetchAll, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchAll, fetchBrokerSettings]);

  // Pre-fill order form when selectedStock changes
  useEffect(() => {
    if (selectedStock && !selectedStock.type?.includes('OPTION') && !selectedStock.type?.includes('CRYPTO')) {
      setForm(f => ({ ...f, symbol: selectedStock.ticker || '' }));
    }
  }, [selectedStock]);

  // Handle pending trade from AutoScanner / strategy buttons
  useEffect(() => {
    if (pendingTrade) {
      setForm({
        symbol: pendingTrade.symbol || selectedStock?.ticker || '',
        direction: pendingTrade.direction || 'BUY',
        quantity: 10,
        entry_price: pendingTrade.entry || '',
        stop_loss: pendingTrade.stoploss || '',
        target: pendingTrade.targets?.[0] || pendingTrade.target || '',
        strategy: pendingTrade.strategy || 'MANUAL',
      });
      setTab('order');
      if (onPendingTradeConsumed) onPendingTradeConsumed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTrade]);

  const handlePlaceOrder = async () => {
    if (!form.symbol || !form.entry_price || !form.stop_loss || !form.target) {
      toast.error('Sabhi fields fill karo');
      return;
    }
    setPlacing(true);
    try {
      if (isLiveMode && brokerSettings?.connected) {
        // Live trade via broker API
        await axios.post(`${API}/live-trade/order`, {
          symbol: form.symbol.trim().toUpperCase(),
          direction: form.direction,
          quantity: parseInt(form.quantity),
          price: parseFloat(form.entry_price),
          order_type: 'LIMIT',
        });
        toast.success(`LIVE order placed: ${form.direction} ${form.symbol} via ${brokerSettings?.profile?.broker || 'Broker'}`);
      } else {
        // Paper trade
        await axios.post(`${API}/paper-trade/order`, {
          symbol: form.symbol.trim().toUpperCase(),
          name: selectedStock?.name || form.symbol,
          direction: form.direction,
          quantity: parseInt(form.quantity),
          entry_price: parseFloat(form.entry_price),
          stop_loss: parseFloat(form.stop_loss),
          target: parseFloat(form.target),
          strategy: form.strategy,
          source: 'MANUAL',
        });
        toast.success(`Paper trade placed: ${form.direction} ${form.symbol}`);
      }
      await fetchAll();
      setTab('positions');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Order failed');
    } finally {
      setPlacing(false);
    }
  };

  const handleClosePosition = async (tradeId, exitPrice) => {
    try {
      await axios.put(`${API}/paper-trade/close/${tradeId}`, { exit_price: exitPrice });
      toast.success('Position closed!');
      setCloseModal(null);
      await fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Close failed');
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Portfolio ko ₹50,000 par reset karna chahte ho? Sabhi trades delete ho jayenge.')) return;
    setResetting(true);
    try {
      await axios.post(`${API}/paper-trade/reset`);
      toast.success('Portfolio reset ho gaya!');
      await fetchAll();
    } catch (e) {
      toast.error('Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const totalPnl = portfolio?.total_pnl ?? 0;
  const pnlColor = totalPnl >= 0 ? '#00E676' : '#FF3B30';
  const pnlSign = totalPnl >= 0 ? '+' : '';

  return (
    <>
      {closeModal && (
        <CloseModal
          position={closeModal}
          onConfirm={handleClosePosition}
          onCancel={() => setCloseModal(null)}
        />
      )}
      {showOptionsModal && (
        <OptionsPaperTradeModal
          onClose={() => setShowOptionsModal(false)}
          onOrderPlaced={() => { setShowOptionsModal(false); fetchAll(); }}
        />
      )}
      {showBrokerModal && (
        <BrokerSettingsModal
          onClose={() => { setShowBrokerModal(false); fetchBrokerSettings(); }}
          onConnected={(profile) => {
            setBrokerSettings({ connected: true, profile });
            setIsLiveMode(true);
            setShowBrokerModal(false);
          }}
        />
      )}

      <div className="flex flex-col h-full" data-testid="paper-trading-panel">
        {/* Portfolio Summary */}
        <div className="p-3 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wallet size={13} className={isLiveMode ? 'text-[#FF9800]' : 'text-[#00E676]'} weight="fill" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300">
                {isLiveMode ? 'Live Trading' : 'Paper Trading'}
              </span>
              {!isLiveMode && (
                <span className="text-[8px] px-1.5 py-0.5 rounded font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">5x</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* PAPER / LIVE Toggle */}
              <div className="flex items-center rounded-lg border border-white/10 overflow-hidden text-[8px] font-black uppercase">
                <button
                  onClick={() => setIsLiveMode(false)}
                  className={`px-2 py-1 transition-colors ${!isLiveMode ? 'bg-[#00E676]/20 text-[#00E676]' : 'text-zinc-600 hover:text-zinc-400'}`}
                  data-testid="paper-mode-btn"
                >
                  Paper
                </button>
                <button
                  onClick={() => {
                    if (!brokerSettings?.connected) {
                      setShowBrokerModal(true);
                    } else {
                      setIsLiveMode(true);
                    }
                  }}
                  className={`px-2 py-1 transition-colors flex items-center gap-1 ${isLiveMode ? 'bg-[#FF9800]/20 text-[#FF9800]' : 'text-zinc-600 hover:text-zinc-400'}`}
                  data-testid="live-mode-btn"
                >
                  {brokerSettings?.connected
                    ? <PlugsConnected size={9} />
                    : <Plugs size={9} />}
                  Live
                </button>
              </div>
              {/* Auto Execute Toggle */}
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] text-zinc-500 uppercase tracking-wider">Auto</span>
                <button
                  onClick={() => onAutoExecuteChange && onAutoExecuteChange(!autoExecute)}
                  className={`relative w-8 h-4 rounded-full transition-all duration-200 ${autoExecute ? 'bg-purple-500/70' : 'bg-white/10'}`}
                  data-testid="auto-execute-toggle"
                  title={autoExecute ? 'Auto Execute ON' : 'Auto Execute OFF'}
                >
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200 ${autoExecute ? 'left-4 bg-purple-300' : 'left-0.5 bg-zinc-500'}`} />
                </button>
              </div>
              <button
                onClick={fetchAll}
                disabled={loadingPortfolio}
                className="p-1 text-zinc-500 hover:text-white transition-colors"
                data-testid="refresh-portfolio"
              >
                <ArrowsClockwise size={12} className={loadingPortfolio ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="p-1 text-zinc-600 hover:text-[#FF3B30] transition-colors"
                data-testid="reset-portfolio"
                title="Reset Portfolio"
              >
                <Warning size={12} />
              </button>
            </div>
          </div>

          {/* Live Mode Banner */}
          {isLiveMode && brokerSettings?.connected && (
            <div className="flex items-center gap-2 p-2 bg-[#FF9800]/10 border border-[#FF9800]/30 rounded-lg mb-2">
              <PlugsConnected size={11} className="text-[#FF9800] shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-black text-[#FF9800]">LIVE MODE — </span>
                <span className="text-[9px] text-zinc-400">{brokerSettings.profile?.broker || 'Broker'} connected. Real orders place honge.</span>
              </div>
              <button
                onClick={() => setShowBrokerModal(true)}
                className="text-[8px] px-1.5 py-0.5 rounded border border-[#FF9800]/30 text-[#FF9800] hover:bg-[#FF9800]/10 transition-colors"
              >
                Manage
              </button>
            </div>
          )}
          {isLiveMode && !brokerSettings?.connected && (
            <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg mb-2">
              <Plugs size={11} className="text-red-400 shrink-0" />
              <span className="text-[9px] text-red-400 flex-1">Broker connected nahi hai. </span>
              <button onClick={() => setShowBrokerModal(true)} className="text-[8px] px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10">
                Connect
              </button>
            </div>
          )}

          {portfolio ? (
            <>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <StatCard
                  label="Available Balance"
                  value={`₹${(portfolio.current_balance / 1000).toFixed(1)}K`}
                  sub={`Initial: ₹${(portfolio.initial_balance / 1000).toFixed(0)}K`}
                  color="white"
                  testId="available-balance"
                />
                <StatCard
                  label="Total P&L"
                  value={`${pnlSign}₹${Math.abs(totalPnl).toFixed(0)}`}
                  sub={`Realized: ${pnlSign}₹${Math.abs(portfolio.realized_pnl).toFixed(0)}`}
                  color={pnlColor}
                  testId="total-pnl"
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <StatCard
                  label="Win Rate"
                  value={`${portfolio.win_rate}%`}
                  sub={`${portfolio.winning_trades}W / ${portfolio.losing_trades}L`}
                  color={portfolio.win_rate >= 50 ? '#00E676' : '#FF9800'}
                  testId="win-rate"
                />
                <StatCard
                  label="Open"
                  value={portfolio.open_positions_count}
                  sub="positions"
                  color="#00BCD4"
                  testId="open-count"
                />
                <StatCard
                  label="Total"
                  value={portfolio.total_trades}
                  sub="trades closed"
                  color="#A0A0A0"
                  testId="total-trades"
                />
              </div>
            </>
          ) : (
            <div className="text-center py-2">
              <span className="text-[10px] text-zinc-600 animate-pulse">Loading portfolio...</span>
            </div>
          )}
        </div>

        {/* Sub Tabs */}
        <div className="flex border-b border-white/10 shrink-0">
          {[
            { id: 'positions', label: `Positions (${positions.length})` },
            { id: 'history', label: `History (${history.length})` },
            { id: 'order', label: '+ Stock' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                tab === t.id ? 'text-white border-b-2 border-[#00E676] bg-white/5' : 'text-zinc-500'
              }`}
              data-testid={`paper-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
          {/* OPTIONS button */}
          <button
            onClick={() => setShowOptionsModal(true)}
            className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/5 transition-colors border-l border-white/10 whitespace-nowrap"
            data-testid="paper-tab-options"
          >
            ⚡ OPTIONS
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">

          {/* Open Positions */}
          {tab === 'positions' && (
            <div className="p-2 space-y-2">
              {positions.length === 0 ? (
                <div className="text-center py-8">
                  <ChartBar size={28} className="text-zinc-700 mx-auto mb-2" />
                  <p className="text-[10px] text-zinc-500">Koi open position nahi</p>
                  <p className="text-[8px] text-zinc-600 mt-1">Scanner signal pe Trade button dabao ya manually order lagao</p>
                </div>
              ) : (
                positions.map(pos => (
                  <PositionRow
                    key={pos.trade_id}
                    pos={pos}
                    onClose={(p) => setCloseModal(p)}
                  />
                ))
              )}
            </div>
          )}

          {/* Trade History */}
          {tab === 'history' && (
            <div className="p-2">
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <Trophy size={28} className="text-zinc-700 mx-auto mb-2" />
                  <p className="text-[10px] text-zinc-500">Abhi tak koi trade close nahi hua</p>
                </div>
              ) : (
                <div data-testid="trade-history-list">
                  {history.map(t => (
                    <HistoryRow key={t.trade_id} trade={t} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* New Order Form */}
          {tab === 'order' && (
            <div className="p-3 space-y-3">
              {autoExecute && (
                <div className="flex items-start gap-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <Info size={12} className="text-purple-400 mt-0.5 shrink-0" />
                  <p className="text-[9px] text-purple-300">Auto Execute ON hai — scanner ke NEW signals automatically trade ho jayenge</p>
                </div>
              )}

              <div>
                <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">Symbol</label>
                <input
                  value={form.symbol}
                  onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  placeholder="e.g. RELIANCE.NS"
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-[#00E676]/50"
                  data-testid="order-symbol"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">Direction</label>
                  <div className="flex rounded overflow-hidden border border-white/10">
                    {['BUY', 'SELL'].map(d => (
                      <button
                        key={d}
                        onClick={() => setForm(f => ({ ...f, direction: d }))}
                        className={`flex-1 py-1.5 text-[10px] font-black transition-colors ${
                          form.direction === d
                            ? d === 'BUY' ? 'bg-[#00E676]/20 text-[#00E676]' : 'bg-[#FF3B30]/20 text-[#FF3B30]'
                            : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                        data-testid={`dir-${d.toLowerCase()}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">Quantity</label>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-[#00E676]/50"
                    min="1"
                    data-testid="order-quantity"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">Entry Price (₹)</label>
                <input
                  type="number"
                  value={form.entry_price}
                  onChange={e => setForm(f => ({ ...f, entry_price: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-[#00E676]/50"
                  step="0.05"
                  data-testid="order-entry"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-red-500 uppercase tracking-wider block mb-1">Stop Loss (₹)</label>
                  <input
                    type="number"
                    value={form.stop_loss}
                    onChange={e => setForm(f => ({ ...f, stop_loss: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-red-500/20 rounded px-3 py-1.5 text-xs font-mono text-red-400 outline-none focus:border-red-500/50"
                    step="0.05"
                    data-testid="order-sl"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-emerald-500 uppercase tracking-wider block mb-1">Target (₹)</label>
                  <input
                    type="number"
                    value={form.target}
                    onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-emerald-500/20 rounded px-3 py-1.5 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-500/50"
                    step="0.05"
                    data-testid="order-target"
                  />
                </div>
              </div>

              {/* Risk/Reward preview */}
              {form.entry_price && form.stop_loss && form.target && (
                <div className="bg-white/[0.03] border border-white/8 rounded-lg p-2.5 space-y-1.5">
                  {/* Leverage margin info */}
                  {form.entry_price && form.quantity && (
                    <div className="flex items-center justify-between text-[9px] pb-1.5 border-b border-white/8">
                      <div className="flex items-center gap-1">
                        <span className="text-yellow-400 font-black">5x</span>
                        <span className="text-zinc-500">Leverage</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-zinc-500">Position: <span className="text-zinc-300">₹{(parseFloat(form.entry_price || 0) * parseInt(form.quantity || 1)).toFixed(0)}</span></span>
                        <span className="text-zinc-500">Margin: <span className="text-yellow-400 font-bold">₹{(parseFloat(form.entry_price || 0) * parseInt(form.quantity || 1) / 5).toFixed(0)}</span></span>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-[9px] font-mono text-center">
                    <div>
                      <span className="text-zinc-600 block">Risk</span>
                      <span className="text-red-400">
                        ₹{Math.abs((parseFloat(form.entry_price) - parseFloat(form.stop_loss)) * parseInt(form.quantity || 1)).toFixed(0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-600 block">R:R</span>
                      <span className="text-white font-black">
                        {(() => {
                          const risk = Math.abs(parseFloat(form.entry_price) - parseFloat(form.stop_loss));
                          const reward = Math.abs(parseFloat(form.target) - parseFloat(form.entry_price));
                          return risk > 0 ? `1:${(reward / risk).toFixed(1)}` : '—';
                        })()}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-600 block">Reward</span>
                      <span className="text-emerald-400">
                        ₹{Math.abs((parseFloat(form.target) - parseFloat(form.entry_price)) * parseInt(form.quantity || 1)).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handlePlaceOrder}
                disabled={placing}
                className={`w-full py-2.5 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  isLiveMode
                    ? form.direction === 'BUY'
                      ? 'bg-[#FF9800]/20 text-[#FF9800] hover:bg-[#FF9800]/30 border border-[#FF9800]/30'
                      : 'bg-[#FF3B30]/20 text-[#FF3B30] hover:bg-[#FF3B30]/30 border border-[#FF3B30]/30'
                    : form.direction === 'BUY'
                      ? 'bg-[#00E676]/20 text-[#00E676] hover:bg-[#00E676]/30 border border-[#00E676]/30'
                      : 'bg-[#FF3B30]/20 text-[#FF3B30] hover:bg-[#FF3B30]/30 border border-[#FF3B30]/30'
                } disabled:opacity-40`}
                data-testid="place-order-btn"
              >
                {placing ? 'Placing...' : isLiveMode ? `LIVE ${form.direction} Order` : `Paper ${form.direction} Order`}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PaperTradingPanel;
