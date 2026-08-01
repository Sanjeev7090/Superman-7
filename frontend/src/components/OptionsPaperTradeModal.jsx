import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { X, ArrowsClockwise, TrendUp, TrendDown, Lightning, Warning, Info, CheckCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const INDICES = [
  { id: 'NIFTY',     label: 'NIFTY',      color: '#00E676', bg: 'bg-[#00E676]/10', border: 'border-[#00E676]/30' },
  { id: 'SENSEX',    label: 'SENSEX',     color: '#FF9800', bg: 'bg-[#FF9800]/10', border: 'border-[#FF9800]/30' },
  { id: 'BANKNIFTY', label: 'BANKNIFTY',  color: '#00BCD4', bg: 'bg-[#00BCD4]/10', border: 'border-[#00BCD4]/30' },
];

function fmtOI(n) {
  if (!n) return '—';
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function fmtPrice(n) {
  if (!n && n !== 0) return '—';
  return `₹${Number(n).toFixed(2)}`;
}

// ── Options Chain Table ──────────────────────────────────────────────────────
const ChainTable = ({ strikes, underlying, selectedStrike, onSelect }) => {
  const tbodyRef = useRef(null);

  // Scroll ATM into view on load
  useEffect(() => {
    if (!tbodyRef.current) return;
    const atmRow = tbodyRef.current.querySelector('[data-atm="true"]');
    if (atmRow) atmRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [strikes]);

  if (!strikes || strikes.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[10px] text-zinc-500">
        No option chain data available
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1" style={{ maxHeight: '280px' }}>
      <table className="w-full text-[10px] font-mono border-separate border-spacing-0">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-[#111] text-[#00E676] text-right py-1.5 px-2 font-bold tracking-wider w-[22%]">CE LTP</th>
            <th className="bg-[#111] text-zinc-500 text-right py-1.5 px-2 font-bold tracking-wider w-[18%]">OI</th>
            <th className="bg-[#111] text-white text-center py-1.5 px-2 font-black tracking-wider w-[20%]">STRIKE</th>
            <th className="bg-[#111] text-zinc-500 text-left py-1.5 px-2 font-bold tracking-wider w-[18%]">OI</th>
            <th className="bg-[#111] text-[#FF3B30] text-left py-1.5 px-2 font-bold tracking-wider w-[22%]">PE LTP</th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {strikes.map(row => {
            const isAtm = row.is_atm;
            const isSelCE = selectedStrike?.strike === row.strike && selectedStrike?.optionType === 'CE';
            const isSelPE = selectedStrike?.strike === row.strike && selectedStrike?.optionType === 'PE';
            const ceLtp = row.ce?.ltp || 0;
            const peLtp = row.pe?.ltp || 0;

            return (
              <tr
                key={row.strike}
                data-atm={isAtm ? 'true' : 'false'}
                className={`border-b transition-colors ${isAtm ? 'bg-white/[0.06] border-[#00E676]/10' : 'border-white/[0.04] hover:bg-white/[0.03]'}`}
              >
                {/* CE side */}
                <td
                  className={`py-1.5 px-2 text-right cursor-pointer rounded-l transition-all ${
                    isSelCE
                      ? 'bg-[#00E676]/25 text-[#00E676] font-black'
                      : 'text-[#00E676] hover:bg-[#00E676]/10'
                  }`}
                  onClick={() => onSelect(row.strike, 'CE', ceLtp, row.ce)}
                  title={`Buy CALL ${row.strike}`}
                >
                  {ceLtp > 0 ? fmtPrice(ceLtp) : '—'}
                  {row.ce?.change_pct !== 0 && ceLtp > 0 && (
                    <span className={`ml-1 text-[8px] ${(row.ce?.change_pct||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(row.ce?.change_pct||0) >= 0 ? '+' : ''}{(row.ce?.change_pct||0).toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right text-zinc-500">{fmtOI(row.ce?.oi)}</td>

                {/* Strike */}
                <td className={`py-1.5 px-2 text-center font-black ${isAtm ? 'text-white' : 'text-zinc-400'}`}>
                  {isAtm && <span className="text-[7px] text-[#00E676] block leading-none mb-0.5">ATM</span>}
                  {Number(row.strike).toLocaleString('en-IN')}
                </td>

                {/* PE side */}
                <td className="py-1.5 px-2 text-left text-zinc-500">{fmtOI(row.pe?.oi)}</td>
                <td
                  className={`py-1.5 px-2 text-left cursor-pointer rounded-r transition-all ${
                    isSelPE
                      ? 'bg-[#FF3B30]/25 text-[#FF3B30] font-black'
                      : 'text-[#FF3B30] hover:bg-[#FF3B30]/10'
                  }`}
                  onClick={() => onSelect(row.strike, 'PE', peLtp, row.pe)}
                  title={`Buy PUT ${row.strike}`}
                >
                  {peLtp > 0 ? fmtPrice(peLtp) : '—'}
                  {row.pe?.change_pct !== 0 && peLtp > 0 && (
                    <span className={`ml-1 text-[8px] ${(row.pe?.change_pct||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(row.pe?.change_pct||0) >= 0 ? '+' : ''}{(row.pe?.change_pct||0).toFixed(1)}%
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── Main Modal ───────────────────────────────────────────────────────────────
const OptionsPaperTradeModal = ({ onClose, onOrderPlaced }) => {
  const [selectedIndex, setSelectedIndex] = useState('NIFTY');
  const [chainData, setChainData] = useState(null);
  const [loadingChain, setLoadingChain] = useState(false);
  const [selectedExpiry, setSelectedExpiry] = useState(null);

  // Selected option
  const [selectedStrike, setSelectedStrike] = useState(null); // {strike, optionType: CE|PE, ltp, data}

  // Trade form
  const [direction, setDirection] = useState('BUY');
  const [lots, setLots] = useState(1);
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [placing, setPlacing] = useState(false);

  const indexInfo = INDICES.find(i => i.id === selectedIndex) || INDICES[0];

  // Fetch chain on index/expiry change
  const fetchChain = useCallback(async (sym, expiry) => {
    setLoadingChain(true);
    try {
      const params = { atm_range: 15 };
      if (expiry) params.expiry = expiry;
      const res = await axios.get(`${API}/paper-trade/options/chain/${sym}`, { params });
      setChainData(res.data);
      if (!expiry && res.data.nearest_expiry) setSelectedExpiry(res.data.nearest_expiry);
    } catch (e) {
      toast.error('Option chain load nahi ho saka');
    } finally {
      setLoadingChain(false);
    }
  }, []);

  useEffect(() => {
    setSelectedStrike(null);
    setEntryPrice('');
    setStopLoss('');
    setTarget('');
    setSelectedExpiry(null);
    fetchChain(selectedIndex, null);
  }, [selectedIndex, fetchChain]);

  const handleExpiryChange = (exp) => {
    setSelectedExpiry(exp);
    fetchChain(selectedIndex, exp);
  };

  const handleStrikeSelect = (strike, optionType, ltp, data) => {
    setSelectedStrike({ strike, optionType, ltp, data });
    const ep = ltp || 0;
    setEntryPrice(ep.toFixed(2));
    if (ep > 0) {
      // BUY defaults: SL = 30% below entry, Target = 50% above entry
      setStopLoss((ep * 0.70).toFixed(2));
      setTarget((ep * 1.50).toFixed(2));
    }
  };

  // Recalculate defaults when direction changes
  useEffect(() => {
    if (!selectedStrike || !entryPrice) return;
    const ep = parseFloat(entryPrice);
    if (ep <= 0) return;
    if (direction === 'BUY') {
      setStopLoss((ep * 0.70).toFixed(2));
      setTarget((ep * 1.50).toFixed(2));
    } else {
      // SELL (write): SL above, target below
      setStopLoss((ep * 1.30).toFixed(2));
      setTarget((ep * 0.50).toFixed(2));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const lotSize = chainData?.lot_size || 1;
  const totalQty = lots * lotSize;
  const marginRequired = parseFloat(entryPrice || 0) * totalQty / 5; // 5x leverage

  const risk = Math.abs(parseFloat(entryPrice || 0) - parseFloat(stopLoss || 0)) * totalQty;
  const reward = Math.abs(parseFloat(target || 0) - parseFloat(entryPrice || 0)) * totalQty;
  const rr = risk > 0 ? (reward / risk).toFixed(1) : '—';

  const handlePlaceOrder = async () => {
    if (!selectedStrike) { toast.error('Pehle strike select karo'); return; }
    if (!entryPrice || !stopLoss || !target) { toast.error('Entry, SL, aur Target set karo'); return; }
    const ep = parseFloat(entryPrice);
    const sl = parseFloat(stopLoss);
    const tgt = parseFloat(target);
    if (ep <= 0) { toast.error('Entry price ₹0 se zyada honi chahiye'); return; }
    if (direction === 'BUY' && sl >= ep) { toast.error('BUY ke liye SL entry se neeche hona chahiye'); return; }
    if (direction === 'BUY' && tgt <= ep) { toast.error('BUY ke liye Target entry se upar hona chahiye'); return; }
    if (direction === 'SELL' && sl <= ep) { toast.error('SELL ke liye SL entry se upar hona chahiye'); return; }
    if (direction === 'SELL' && tgt >= ep) { toast.error('SELL ke liye Target entry se neeche hona chahiye'); return; }

    const symbol = `${selectedIndex}${selectedStrike.strike}${selectedStrike.optionType}`;
    const name = `${selectedIndex} ${Number(selectedStrike.strike).toLocaleString('en-IN')} ${selectedStrike.optionType} ${selectedExpiry || ''}`;

    setPlacing(true);
    try {
      await axios.post(`${API}/paper-trade/order`, {
        symbol,
        name,
        direction,
        quantity: totalQty,
        entry_price: ep,
        stop_loss: sl,
        target: tgt,
        strategy: 'OPTIONS',
        source: 'MANUAL',
        option_meta: {
          underlying: selectedIndex,
          strike: selectedStrike.strike,
          option_type: selectedStrike.optionType,
          expiry: selectedExpiry || chainData?.nearest_expiry,
          lot_size: lotSize,
          lots: lots,
        },
      });
      toast.success(`✅ ${direction} ${name} @ ₹${ep} placed!`);
      if (onOrderPlaced) onOrderPlaced();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Order fail hua');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2">
      <div
        className="relative w-full max-w-lg bg-[#0D0D0D] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '96vh' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Lightning size={14} className="text-yellow-400" weight="fill" />
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Options Paper Trade</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold">5x</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-white/5">
            <X size={14} />
          </button>
        </div>

        {/* ── Index Tabs ── */}
        <div className="flex gap-1 px-4 py-2 border-b border-white/10 shrink-0">
          {INDICES.map(idx => (
            <button
              key={idx.id}
              onClick={() => setSelectedIndex(idx.id)}
              className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all border ${
                selectedIndex === idx.id
                  ? `${idx.bg} ${idx.border} text-white`
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {idx.label}
            </button>
          ))}
        </div>

        {/* ── Spot Price + Expiry + Lot ── */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-zinc-500 uppercase">Spot</span>
            {loadingChain ? (
              <span className="text-[10px] text-zinc-400 animate-pulse">Loading...</span>
            ) : (
              <span className="text-[11px] font-black font-mono text-white" style={{ color: indexInfo.color }}>
                ₹{chainData?.underlying_price?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '—'}
              </span>
            )}
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-zinc-500 uppercase">Lot</span>
            <span className="text-[10px] font-black text-yellow-400">{lotSize}</span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          {/* Expiry */}
          {chainData?.all_expiries?.length > 0 ? (
            <select
              value={selectedExpiry || ''}
              onChange={e => handleExpiryChange(e.target.value)}
              className="flex-1 bg-transparent text-[10px] font-mono text-zinc-300 border border-white/10 rounded px-2 py-1 outline-none focus:border-[#00E676]/40 cursor-pointer"
            >
              {chainData.all_expiries.map(exp => (
                <option key={exp} value={exp} className="bg-[#111]">{exp}</option>
              ))}
            </select>
          ) : (
            <span className="text-[10px] text-zinc-500 font-mono">{chainData?.nearest_expiry || '—'}</span>
          )}
          <button
            onClick={() => fetchChain(selectedIndex, selectedExpiry)}
            disabled={loadingChain}
            className="p-1 text-zinc-500 hover:text-white transition-colors"
            title="Refresh chain"
          >
            <ArrowsClockwise size={11} className={loadingChain ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── Chain Table ── */}
        <div className="flex-1 overflow-hidden px-2 py-1">
          {loadingChain ? (
            <div className="flex items-center justify-center py-8">
              <ArrowsClockwise size={20} className="animate-spin text-zinc-600" />
              <span className="ml-2 text-[10px] text-zinc-500">Loading option chain...</span>
            </div>
          ) : (
            <ChainTable
              strikes={chainData?.strikes || []}
              underlying={chainData?.underlying_price || 0}
              selectedStrike={selectedStrike}
              onSelect={handleStrikeSelect}
            />
          )}
        </div>

        {/* ── Selected Option Info ── */}
        {selectedStrike && (
          <div
            className={`mx-3 mb-2 px-3 py-2 rounded-lg border flex items-center justify-between shrink-0 ${
              selectedStrike.optionType === 'CE'
                ? 'bg-[#00E676]/8 border-[#00E676]/25'
                : 'bg-[#FF3B30]/8 border-[#FF3B30]/25'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-black"
                style={{
                  background: selectedStrike.optionType === 'CE' ? 'rgba(0,230,118,0.2)' : 'rgba(255,59,48,0.2)',
                  color: selectedStrike.optionType === 'CE' ? '#00E676' : '#FF3B30',
                }}
              >
                {selectedStrike.optionType}
              </span>
              <span className="text-[11px] font-black text-white">
                {selectedIndex} {Number(selectedStrike.strike).toLocaleString('en-IN')} {selectedStrike.optionType}
              </span>
            </div>
            <span className="text-[11px] font-black font-mono text-white">
              LTP: ₹{selectedStrike.ltp > 0 ? selectedStrike.ltp.toFixed(2) : '—'}
            </span>
          </div>
        )}

        {/* ── Trade Form ── */}
        <div className="border-t border-white/10 px-3 py-3 shrink-0 space-y-2.5">
          {/* Direction + Lots */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] text-zinc-500 uppercase tracking-wider block mb-1">Direction</label>
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                {['BUY', 'SELL'].map(d => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`flex-1 py-1.5 text-[10px] font-black transition-colors ${
                      direction === d
                        ? d === 'BUY'
                          ? 'bg-[#00E676]/20 text-[#00E676]'
                          : 'bg-[#FF3B30]/20 text-[#FF3B30]'
                        : 'text-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {d === 'BUY' ? '▲ BUY' : '▼ SELL'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[8px] text-zinc-500 uppercase tracking-wider block mb-1">
                Lots <span className="text-zinc-600">(×{lotSize} = {totalQty} qty)</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setLots(l => Math.max(1, l - 1))}
                  className="w-7 h-7 rounded bg-white/5 hover:bg-white/10 text-zinc-300 font-black text-sm transition-colors flex items-center justify-center"
                >−</button>
                <input
                  type="number"
                  value={lots}
                  onChange={e => setLots(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  min="1" max="50"
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] font-black font-mono text-white text-center outline-none"
                />
                <button
                  onClick={() => setLots(l => Math.min(50, l + 1))}
                  className="w-7 h-7 rounded bg-white/5 hover:bg-white/10 text-zinc-300 font-black text-sm transition-colors flex items-center justify-center"
                >+</button>
              </div>
            </div>
          </div>

          {/* Entry / SL / Target */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="text-[8px] text-zinc-400 uppercase tracking-wider block mb-1">Entry ₹</label>
              <input
                type="number"
                value={entryPrice}
                onChange={e => setEntryPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[10px] font-mono text-white outline-none focus:border-white/30"
                step="0.05"
              />
            </div>
            <div>
              <label className="text-[8px] text-red-500 uppercase tracking-wider block mb-1">SL ₹</label>
              <input
                type="number"
                value={stopLoss}
                onChange={e => setStopLoss(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/5 border border-red-500/25 rounded px-2 py-1.5 text-[10px] font-mono text-red-400 outline-none focus:border-red-500/50"
                step="0.05"
              />
            </div>
            <div>
              <label className="text-[8px] text-emerald-500 uppercase tracking-wider block mb-1">Target ₹</label>
              <input
                type="number"
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/5 border border-emerald-500/25 rounded px-2 py-1.5 text-[10px] font-mono text-emerald-400 outline-none focus:border-emerald-500/50"
                step="0.05"
              />
            </div>
          </div>

          {/* Risk/Reward + Margin */}
          {entryPrice && stopLoss && target && parseFloat(entryPrice) > 0 && (
            <div className="bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2 grid grid-cols-4 gap-2 text-center">
              <div>
                <span className="text-[8px] text-zinc-600 block">Margin</span>
                <span className="text-[9px] font-black text-yellow-400 font-mono">₹{marginRequired.toFixed(0)}</span>
              </div>
              <div>
                <span className="text-[8px] text-zinc-600 block">Risk</span>
                <span className="text-[9px] font-black text-red-400 font-mono">₹{risk.toFixed(0)}</span>
              </div>
              <div>
                <span className="text-[8px] text-zinc-600 block">R:R</span>
                <span className="text-[9px] font-black text-white font-mono">1:{rr}</span>
              </div>
              <div>
                <span className="text-[8px] text-zinc-600 block">Reward</span>
                <span className="text-[9px] font-black text-emerald-400 font-mono">₹{reward.toFixed(0)}</span>
              </div>
            </div>
          )}

          {/* Auto-execute notice */}
          <div className="flex items-start gap-1.5 p-2 bg-blue-500/8 border border-blue-500/15 rounded-lg">
            <Info size={10} className="text-blue-400 mt-0.5 shrink-0" />
            <p className="text-[8px] text-blue-300 leading-relaxed">
              <span className="font-bold">Auto SL/Target:</span> System har 2 second mein option price check karta hai aur automatically position close karta hai jab SL ya Target hit ho.
            </p>
          </div>

          {/* Place Button */}
          <button
            onClick={handlePlaceOrder}
            disabled={placing || !selectedStrike}
            className={`w-full py-2.5 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all border ${
              !selectedStrike
                ? 'border-white/10 text-zinc-600 bg-white/[0.02] cursor-not-allowed'
                : direction === 'BUY'
                  ? 'bg-[#00E676]/20 text-[#00E676] hover:bg-[#00E676]/30 border-[#00E676]/30'
                  : 'bg-[#FF3B30]/20 text-[#FF3B30] hover:bg-[#FF3B30]/30 border-[#FF3B30]/30'
            } disabled:opacity-50`}
          >
            {placing
              ? 'Placing...'
              : selectedStrike
                ? `${direction === 'BUY' ? '▲ BUY' : '▼ SELL'} ${selectedIndex} ${Number(selectedStrike.strike).toLocaleString('en-IN')} ${selectedStrike.optionType} — ${lots} Lot${lots > 1 ? 's' : ''} (${totalQty} qty)`
                : 'Pehle strike select karo ↑'
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default OptionsPaperTradeModal;
