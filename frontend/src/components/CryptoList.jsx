import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { MagnifyingGlass, ArrowsClockwise, TrendUp, TrendDown, CurrencyBtc, WifiHigh } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtPrice = (v) => {
  if (v == null) return '-';
  if (v >= 1) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${v.toFixed(6)}`;
};

// ── Metals row component ──────────────────────────────────────────────────────
function MetalRow({ label, ticker, price, changePct, weekChg, icon, onSelect }) {
  const isUp = changePct >= 0;
  return (
    <button
      onClick={() => onSelect && onSelect({ ticker, name: label, type: 'METAL', yf_ticker: ticker === 'XAUUSD' ? 'GC=F' : 'SI=F', symbol: ticker, current_price: price, price_change_pct_24h: changePct })}
      className="w-full flex items-center justify-between px-2.5 py-2 text-left border-b border-white/5 hover:bg-white/5 transition-all"
      data-testid={`metal-item-${ticker}`}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] shrink-0">{icon}</span>
        <div>
          <div className="text-[10px] font-bold text-white">{ticker}</div>
          <div className="text-[8px] text-zinc-500">{label}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] font-mono text-white">{fmtPrice(price)}</div>
        <div className={`text-[9px] font-mono flex items-center justify-end gap-0.5 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
          {isUp ? <TrendUp size={8} /> : <TrendDown size={8} />}
          {Math.abs(changePct || 0).toFixed(2)}%
        </div>
      </div>
    </button>
  );
}

const CryptoList = ({ onCryptoSelect, selectedCrypto }) => {
  const [coins, setCoins] = useState([]);
  const [metals, setMetals] = useState(null);
  const [liveOverlay, setLiveOverlay] = useState({});   // coin_id → {price, change_pct}
  const [flashSet, setFlashSet] = useState(new Set());  // coin_ids flashing
  const [wsStatus, setWsStatus] = useState('connecting'); // connecting | live | offline
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const prevPricesRef = useRef({});

  // ---- Metals live prices ----
  const fetchMetals = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/metals/prices`);
      setMetals(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchMetals();
    const id = setInterval(fetchMetals, 60_000); // refresh every 60s
    return () => clearInterval(id);
  }, [fetchMetals]);

  // ---- Initial data from CoinPaprika (metadata + baseline prices) ----
  const fetchCoins = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/crypto/prices`);
      setCoins(data.coins || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchCoins();
    // Refresh metadata every 5 minutes
    const iv = setInterval(fetchCoins, 300000);
    return () => clearInterval(iv);
  }, [fetchCoins]);

  // ---- Kraken live prices via REST polling (every 3s) ----
  useEffect(() => {
    let alive = true;
    let timer = null;

    const fetchLive = async () => {
      try {
        const { data } = await axios.get(`${API}/crypto/binance-prices`);
        if (!alive) return;

        if (data.source === 'binance' && data.coins?.length > 0) {
          setWsStatus('live');
          const overlay = {};
          const toFlash = [];

          data.coins.forEach(({ coin_id, price, change_pct }) => {
            overlay[coin_id] = { price, change_pct };
            const prev = prevPricesRef.current[coin_id];
            if (prev !== undefined && prev !== price) {
              toFlash.push(coin_id);
            }
            prevPricesRef.current[coin_id] = price;
          });

          setLiveOverlay(overlay);
          if (toFlash.length > 0) {
            setFlashSet(new Set(toFlash));
            setTimeout(() => setFlashSet(new Set()), 600);
          }
        } else {
          setWsStatus('connecting');
        }
      } catch {
        if (alive) setWsStatus('offline');
      }
      if (alive) timer = setTimeout(fetchLive, 3000);
    };

    setWsStatus('connecting');
    fetchLive();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  // ---- Merge CoinPaprika metadata with Kraken live prices ----
  const mergedCoins = coins.map(coin => {
    const live = liveOverlay[coin.id];
    if (!live) return coin;
    return { ...coin, current_price: live.price, price_change_pct_24h: live.change_pct };
  });

  const filtered = searchQ
    ? mergedCoins.filter(c => c.symbol?.includes(searchQ.toUpperCase()) || c.name?.toLowerCase().includes(searchQ.toLowerCase()))
    : mergedCoins;

  const statusColor = wsStatus === 'live' ? '#00E676' : wsStatus === 'connecting' ? '#FFD600' : '#FF3B30';
  const statusLabel = wsStatus === 'live' ? 'LIVE' : wsStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE';

  return (
    <div className="flex flex-col h-full" data-testid="crypto-list">
      {/* Header + WS status */}
      <div className="p-2 border-b border-white/10 space-y-1.5">
        {/* Live status badge */}
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">Crypto</span>
          <div className="flex items-center gap-1" data-testid="ws-status">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor, boxShadow: wsStatus === 'live' ? `0 0 6px ${statusColor}` : 'none', animation: wsStatus === 'live' ? 'pulse 2s infinite' : 'none' }} />
            <span className="text-[8px] font-bold" style={{ color: statusColor }}>{statusLabel}</span>
            {wsStatus === 'live' && <WifiHigh size={9} color="#00E676" weight="fill" />}
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <MagnifyingGlass size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search crypto..."
            className="w-full bg-white/5 border border-white/10 rounded pl-6 pr-2 py-1.5 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20"
            data-testid="crypto-list-search" />
        </div>
      </div>

      {/* ── Metals Section ─────────────────────────────────────────────── */}
      {metals && (
        <div>
          <div className="px-2.5 py-1.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[7px] font-black uppercase tracking-widest" style={{ color: '#f59e0b' }}>Metals</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(245,158,11,0.2)' }} />
          </div>
          {metals.gold && (
            <MetalRow
              label="Gold" ticker="XAUUSD" icon="🥇"
              price={metals.gold.price} changePct={metals.gold.change_pct} weekChg={metals.gold.week_chg}
              onSelect={onCryptoSelect} />
          )}
          {metals.silver && (
            <MetalRow
              label="Silver" ticker="XAGUSD" icon="🥈"
              price={metals.silver.price} changePct={metals.silver.change_pct} weekChg={metals.silver.week_chg}
              onSelect={onCryptoSelect} />
          )}
          <div className="px-2.5 py-1.5 flex items-center gap-2 mt-0.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[7px] font-black uppercase tracking-widest" style={{ color: '#a78bfa' }}>Crypto</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(167,139,250,0.2)' }} />
          </div>
        </div>
      )}

      {/* Coin List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center">
            <ArrowsClockwise size={14} className="animate-spin text-[#00E676] mx-auto" />
          </div>
        ) : (
          filtered.map(coin => {
            const isSelected = selectedCrypto?.id === coin.id;
            const pct = coin.price_change_pct_24h || 0;
            const isFlashing = flashSet.has(coin.id);
            const hasLive = !!liveOverlay[coin.id];

            return (
              <button key={coin.id}
                onClick={() => onCryptoSelect({
                  ticker: coin.id,
                  name: coin.name,
                  type: 'CRYPTO',
                  coin_id: coin.id,
                  symbol: coin.symbol,
                  image: coin.image,
                  current_price: coin.current_price,
                  price_change_pct_24h: coin.price_change_pct_24h,
                  market_cap: coin.market_cap,
                  high_24h: coin.high_24h,
                  low_24h: coin.low_24h,
                  ath: coin.ath,
                  ath_change_pct: coin.ath_change_pct,
                  price_change_pct_7d: coin.price_change_pct_7d,
                  total_volume: coin.total_volume,
                  sparkline_7d: coin.sparkline_7d,
                })}
                className={`w-full flex items-center justify-between px-2.5 py-2 text-left border-b border-white/5 transition-all duration-200 ${
                  isSelected ? 'bg-white/10' : 'hover:bg-white/5'
                } ${isFlashing ? 'bg-[#00E676]/8' : ''}`}
                data-testid={`crypto-item-${coin.symbol}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {coin.image ? (
                    <img src={coin.image} alt="" className="w-4 h-4 rounded-full shrink-0" />
                  ) : (
                    <CurrencyBtc size={14} className="text-orange-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-white">{coin.symbol}</span>
                      {hasLive && (
                        <span className="text-[6px] font-black text-[#00E676] opacity-70">LIVE</span>
                      )}
                    </div>
                    <span className="text-[8px] text-zinc-600 block truncate">{coin.name}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[10px] font-mono block transition-colors duration-300 ${isFlashing ? 'text-[#00E676]' : 'text-white'}`}
                    data-testid={`crypto-price-${coin.symbol}`}>
                    {fmtPrice(coin.current_price)}
                  </span>
                  <span className={`text-[9px] font-mono flex items-center justify-end gap-0.5 ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pct >= 0 ? <TrendUp size={8} /> : <TrendDown size={8} />}
                    {Math.abs(pct).toFixed(2)}%
                  </span>
                </div>
              </button>
            );
          })
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-4 px-3">
            <p className="text-[10px] text-zinc-500 mb-2">Coins loading...</p>
            <button onClick={fetchCoins} className="text-[10px] text-[#00E676] hover:underline font-bold" data-testid="crypto-retry-btn">
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CryptoList;
