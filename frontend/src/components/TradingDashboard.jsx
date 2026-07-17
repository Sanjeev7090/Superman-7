import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import StockSearch from './StockSearch';
import MultiChartLayout from './MultiChartLayout';
import SquareOf9Calculator from './SquareOf9Calculator';
import AITradeAnalysis from './AITradeAnalysis';
import FallingKnifeAnalysis from './FallingKnifeAnalysis';
import ReversePriceSwings from './ReversePriceSwings';
import ExplosiveVolumeAnalysis from './ExplosiveVolumeAnalysis';
import GoldenSetupAnalysis from './GoldenSetupAnalysis';
import AIIndicatorScore from './AIIndicatorScore';
import GodzillaSetupAnalysis from './GodzillaSetupAnalysis';
import GPTAnalysis from './GPTAnalysis';
import CryptoDashboard from './CryptoDashboard';
import AutoScanner from './AutoScanner';
import SMCAnalysis from './SMCAnalysis';
import AMDSAnalysis from './AMDSAnalysis';
import MiroFishAnalysis from './MiroFishAnalysis';
import PACSOAnalysis from './PACSOAnalysis';
import MarketIntelPanel from './MarketIntelPanel';
import RegulatoryWatchdogPanel from './RegulatoryWatchdogPanel';
import SectorTrending from './SectorTrending';
import TopMoversWidget from './TopMoversWidget';
import SectorRotationPicker from './SectorRotationPicker';
import MoneycontrolMovers from './MoneycontrolMovers';
import HybridDashboard from './hybrid/HybridDashboard';
import GannQSCPanel from './GannQSCPanel';
import AdvanceDeclineTicker from './AdvanceDeclineTicker';
import NarrativeSwingAnalysis from './NarrativeSwingAnalysis';
import HybridVWAPAnalysis from './HybridVWAPAnalysis';
import VisualizeModal from './VisualizeModal';
import Gann3DPanel from './Gann3DPanel';
import VoiceCommandSystem from './VoiceCommandSystem';
import OrderFlowPanel from './OrderFlowPanel';
import KronosForecastPanel from './KronosForecastPanel';
import IndicesTickerBar from './IndicesTickerBar';
import TopOptionsSheet from './TopOptionsSheet';
import OptionChainModal from './OptionChainModal';
import PutCallParityScanner from './PutCallParityScanner';
import DeltaDashScoreboard from './DeltaDashScoreboard';
import HybridBrainPanel from './HybridBrainPanel';
import PaperTradingPanel from './PaperTradingPanel';
import SectorStocksSheet from './SectorStocksSheet';
import TopTraderUniverseScan from './TopTraderUniverseScan';
import SettingsDrawer from './SettingsDrawer';
import { Toaster, toast } from 'sonner';
import CryptoList from './CryptoList';
import {
  Bell, ChartLineUp, List, Newspaper, Sun, Moon, X,
  MagnifyingGlass, UsersThree, Notebook, GearSix, CurrencyBtc, Globe,
} from '@phosphor-icons/react';
import { useTheme } from '../context/ThemeContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Map yfinance tickers → Groww trading symbols (avoids stale-state issue)
const YF_TO_GROWW = {
  '^NSEI':    { symbol: 'NIFTY',     exchange: 'NSE' },
  '^NSEBANK': { symbol: 'BANKNIFTY', exchange: 'NSE' },
  '^BSESN':   { symbol: 'SENSEX',    exchange: 'BSE' },
  '^CNXFIN':  { symbol: 'FINNIFTY',  exchange: 'NSE' },
  '^CNXIT':   { symbol: 'NIFTYIT',   exchange: 'NSE' },
  '^CNXAUTO': { symbol: 'NIFTYAUTO', exchange: 'NSE' },
  '^INDIAVIX':{ symbol: 'INDIAVIX',  exchange: 'NSE' },
};

const TradingDashboard = () => {
  const [hybridMode, setHybridMode] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pivotPoint, setPivotPoint] = useState(null);
  const [gannFan, setGannFan] = useState(null);
  const [signal, setSignal] = useState(null);
  const [semiLogScale, setSemiLogScale] = useState(false);
  const [timeframe, setTimeframe] = useState({ multiplier: 1, timespan: 'day', label: '1D' });
  const [activeTab, setActiveTab] = useState('scan'); // scan | strategies | traders | paper (left nav)
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState('robo');
  const [mobilePanel, setMobilePanel] = useState('chart'); // left | chart | right
  const [cryptoChartDays, setCryptoChartDays] = useState(7);
  const [showNews, setShowNews] = useState(false);
  const [dataSource, setDataSource] = useState('groww'); // 'yahoo' | 'groww'
  const [optionsSheet, setOptionsSheet] = useState(null); // { symbol, name } | null
  const [showOptionChain, setShowOptionChain] = useState(null); // { symbol, name } | null
  const [activeStrategy, setActiveStrategy] = useState(null); // Strategy type for overlay
  const [strategyData, setStrategyData] = useState(null); // Strategy analysis data
  const [pendingPaperTrade, setPendingPaperTrade] = useState(null); // Paper trade from scanner/strategy
  const [paperAutoExecute, setPaperAutoExecute] = useState(false); // Auto-execute paper trades
  const [sectorSheet, setSectorSheet] = useState(null); // sector obj for stocks sheet
  const [showVisualize, setShowVisualize] = useState(false); // Heatmaps/Network modal
  const [show3D, setShow3D] = useState(false); // 3D Gann chart
  const [showParityScanner, setShowParityScanner] = useState(false); // Put-Call Parity F&O Scanner
  const [showDeltaDash, setShowDeltaDash] = useState(false); // DeltaDash Scoreboard
  const [parityTradeSignal, setParityTradeSignal] = useState(null); // Trade signal from Parity Scanner
  const [showHybridBrain, setShowHybridBrain] = useState(false); // Hybrid Super Brain
  const [rlStatus, setRlStatus] = useState(null); // RL Agent background status
  const { theme, toggleTheme } = useTheme();
  const wsRef = useRef(null);
  const rlPollRef = useRef(null);

  // Poll RL Agent status every 5s for background indicator
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/rl-agent/status`);
        setRlStatus(res.data);
      } catch { /* silent */ }
    };
    poll();
    rlPollRef.current = setInterval(poll, 5000);
    return () => clearInterval(rlPollRef.current);
  }, []);

  // Handler for strategy analysis completion - updates chart overlays
  const handleStrategyAnalysis = (strategyType, data) => {
    setActiveStrategy(strategyType);
    setStrategyData(data);
  };

  // Handler for paper trade from scanner signal button
  const handlePaperTradeFromSignal = (signal) => {
    setPendingPaperTrade({ ...signal, symbol: selectedStock?.ticker });
    setActiveTab('paper');
    setMobilePanel('left');
  };

  // Auto-execute paper trade handler (called when auto-execute is ON and new signal fires)
  const handleAutoExecuteTrade = useCallback(async (signal) => {
    if (!selectedStock) return;
    try {
      await axios.post(`${API}/paper-trade/order`, {
        symbol: selectedStock.ticker,
        name: selectedStock.name || selectedStock.ticker,
        direction: signal.direction,
        quantity: 10,
        entry_price: signal.entry,
        stop_loss: signal.stoploss,
        target: signal.targets?.[0] || signal.day_target || signal.entry,
        strategy: signal.strategy,
        source: 'AUTO',
      });
      toast.success(`Auto Paper Trade: ${signal.direction} ${selectedStock.ticker} via ${signal.strategy}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Auto trade failed');
    }
  }, [selectedStock]);
  useEffect(() => {
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/prices';
    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => { wsRef.current = ws; };
      ws.onclose = () => { wsRef.current = null; };
      ws.onerror = () => {};
      return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
    } catch { /* WebSocket not critical */ }
  }, []);

  const subscribeWS = (ticker) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe', tickers: [ticker] }));
    }
  };

  const fetchStockData = async (ticker, tf, sourceOverride) => {
    setLoading(true);
    try {
      const src = sourceOverride || dataSource;
      if (src === 'groww') {
        // Skip Groww for options — option intraday is always from NSE
        if (ticker?.startsWith('OPT_')) {
          setLoading(false);
          return;
        }
        const intvMap = {
          '1MIN':'1m',
          '5M':'5m','10M':'10m','15M':'15m','30M':'30m',
          '1H':'1h','4H':'4h','1D':'1d','1W':'1w',
          '1M':'1d','6M':'1d','1Y':'1w',
        };
        const daysMap = {
          '1MIN':7,
          '5M':10,'10M':15,'15M':15,'30M':25,'2M':7,'3M':7,'45M':25,
          '1H':60,'2H':90,'4H':150,
          '1D':365,'1W':730,
          '1M':30,'6M':180,'1Y':730,'1MO':30,'3MO':90,'6MO':180,
        };
        const interval = intvMap[tf.label] || '1d';
        const days = daysMap[tf.label] || 120;
        // Use ticker-based mapping first (avoids stale React state issue for indices)
        const growwMap = YF_TO_GROWW[ticker];
        const groww_symbol = growwMap?.symbol
          || selectedStock?.groww_symbol
          || (ticker || '').replace('.NS','').replace('.BO','').replace(/^\^/,'');
        const exchange = growwMap?.exchange
          || selectedStock?.exchange
          || (ticker.endsWith('.BO') ? 'BSE' : 'NSE');
        try {
          const response = await axios.get(`${API}/groww/candles/${groww_symbol}`, {
            params: { interval, days_back: days, exchange }
          });
          const growwBars = response.data.bars || [];
          if (growwBars.length === 0) {
            // Groww returned empty (e.g., for indices) — fall back to yfinance
            throw new Error('Groww returned no bars');
          }
          setStockData({ ticker, bars: growwBars });
          const src_label = response.data.source === 'yfinance_fallback' ? 'yfinance' : 'Groww';
          toast.success(`Loaded ${tf.label} (${src_label}) for ${groww_symbol}`);
        } catch (growwErr) {
          // Groww failed or empty → silent fallback to yfinance
          const params = { timespan: tf.timespan, multiplier: tf.multiplier, limit: 120 };
          if (tf.days) {
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - tf.days);
            params.from_date = fromDate.toISOString().split('T')[0];
            params.to_date = new Date().toISOString().split('T')[0];
          }
          const response = await axios.get(`${API}/stock/bars/${ticker}`, { params });
          setStockData(response.data);
          toast.success(`Loaded ${tf.label} (yfinance) for ${ticker}`);
        }
        return;
      }
      const params = { timespan: tf.timespan, multiplier: tf.multiplier, limit: 120 };
      if (tf.days) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - tf.days);
        params.from_date = fromDate.toISOString().split('T')[0];
        params.to_date = new Date().toISOString().split('T')[0];
      }
      const response = await axios.get(`${API}/stock/bars/${ticker}`, { params });
      setStockData(response.data);
      toast.success(`Loaded ${tf.label} data for ${ticker}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load stock data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch crypto chart data and convert to stockData format
  const fetchCryptoData = async (coinId, days) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/crypto/chart/${coinId}?days=${days}`);
      const bars = (response.data.bars || []).map(b => ({
        timestamp: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: 0,
      }));
      setStockData({ ticker: coinId.toUpperCase(), bars });
    } catch (error) {
      if (error?.response?.status !== 429) {
        toast.error('Failed to load crypto chart');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStockSelect = (stock) => {
    setStockData(null);
    setPivotPoint(null);
    setGannFan(null);
    setSignal(null);
    setSelectedStock(stock);
    const defaultTf = { multiplier: 1, timespan: 'day', label: '1D' };
    setTimeframe(defaultTf);
    fetchStockData(stock.ticker, defaultTf);
    subscribeWS(stock.ticker);
    setMobilePanel('chart');
  };

  // Top Trader Concepts — load stock into Chart + Robot 3.0
  const handleTopTraderStockLoad = async (stock) => {
    handleStockSelect(stock);
    try {
      await axios.post(`${API}/robo/settings`, { ticker: stock.ticker });
      toast.success(`${stock.name || stock.ticker} → Chart + Robot 3.0 loaded`, { duration: 2500, icon: '🤖' });
    } catch (_) {
      // chart still loads even if robo fails
    }
  };

  // Map index symbol → underlying chart ticker
  const INDEX_TICKER_MAP = {
    NIFTY: { ticker: '^NSEI', name: 'NIFTY 50' },
    BANKNIFTY: { ticker: '^NSEBANK', name: 'BANK NIFTY' },
    FINNIFTY: { ticker: '^CNXFIN', name: 'FIN NIFTY' },
    SENSEX: { ticker: '^BSESN', name: 'SENSEX' },
  };

  // Parity Scanner — ticker mapping & chart load handler
  const PARITY_TICKER_MAP = {
    NIFTY:      { ticker: '^NSEI',    name: 'NIFTY 50'   },
    BANKNIFTY:  { ticker: '^NSEBANK', name: 'BANK NIFTY' },
    FINNIFTY:   { ticker: '^CNXFIN',  name: 'FIN NIFTY'  },
    MIDCPNIFTY: { ticker: '^CNXMID',  name: 'MIDCAP NIFTY'},
    SENSEX:     { ticker: '^BSESN',   name: 'SENSEX'     },
  };

  const handleLoadParityChart = (row) => {
    const map = PARITY_TICKER_MAP[row.underlying] || { ticker: row.underlying + '.NS', name: row.underlying };
    const stockObj = { ticker: map.ticker, name: map.name, type: 'INDEX' };
    setStockData(null);
    setPivotPoint(null);
    setGannFan(null);
    setSignal(null);
    setSelectedStock(stockObj);
    const defaultTf = { multiplier: 5, timespan: 'minute', label: '5M' };
    setTimeframe(defaultTf);
    fetchStockData(map.ticker, defaultTf);
    setMobilePanel('chart');

    // Derive Buy/Sell/SL/Target from parity data
    const spot = row.spot;
    const sig  = row.parity.signal;
    const misPct = Math.min(Math.max(Math.abs(row.parity.mispricing_pct || 0) / 100, 0.005), 0.03);
    const slPct  = misPct * 1.0;
    const tgtPct = misPct * 2.0;

    if (sig === 'CONVERSION') {
      setParityTradeSignal({
        direction: 'SELL',
        entry:  +spot.toFixed(2),
        sl:     +(spot * (1 + slPct)).toFixed(2),
        target: +(spot * (1 - tgtPct)).toFixed(2),
        symbol: row.underlying, strike: row.strike, expiry: row.expiry,
      });
    } else if (sig === 'REVERSE_CONVERSION') {
      setParityTradeSignal({
        direction: 'BUY',
        entry:  +spot.toFixed(2),
        sl:     +(spot * (1 - slPct)).toFixed(2),
        target: +(spot * (1 + tgtPct)).toFixed(2),
        symbol: row.underlying, strike: row.strike, expiry: row.expiry,
      });
    } else {
      setParityTradeSignal(null);
    }
    setShowParityScanner(false);
  };

  const handleIndexClick = (symbol, name) => {
    // Load index intraday chart in the main chart panel
    const indexInfo = INDEX_TICKER_MAP[symbol];
    if (indexInfo) {
      const stockObj = {
        ticker: indexInfo.ticker,
        name: indexInfo.name,
        type: 'INDEX',
        exchange: symbol === 'SENSEX' ? 'BSE' : 'NSE',
        groww_symbol: symbol,
      };
      setStockData(null);
      setPivotPoint(null);
      setGannFan(null);
      setSignal(null);
      setSelectedStock(stockObj);
      const intradayTf = { multiplier: 5, timespan: 'minute', label: '5M' };
      setTimeframe(intradayTf);
      fetchStockData(indexInfo.ticker, intradayTf);
      setMobilePanel('chart');
    }
    // Also open options sheet (Call/Put options)
    setOptionsSheet({ symbol, name });
  };

  // Fetch intraday OHLC bars for an option (NSE chart-databyindex)
  const fetchOptionIntraday = async (option, intervalMin = 1) => {
    setLoading(true);
    try {
      const expiry = option.expiry_display || option.expiry;
      const isSensex = option.underlying === 'SENSEX' || option.is_indicative;
      const isNseIndexDerived = option.is_live_derived && !isSensex && !option.is_equity;
      const isEquity = option.is_equity === true;

      let url, params;
      if (isSensex) {
        url = `${API}/option/sensex-intraday`;
        params = {
          strike: option.strike,
          option_type: option.type,
          expiry,
          interval_min: Math.max(intervalMin, 5),
        };
      } else if (isEquity) {
        url = `${API}/option/equity-intraday`;
        params = {
          underlying: option.underlying,
          strike: option.strike,
          option_type: option.type,
          expiry,
          interval_min: Math.max(intervalMin, 5),
        };
      } else if (isNseIndexDerived) {
        url = `${API}/option/index-intraday`;
        params = {
          underlying: option.underlying,
          strike: option.strike,
          option_type: option.type,
          expiry,
          interval_min: Math.max(intervalMin, 5),
        };
      } else {
        url = `${API}/option/intraday`;
        params = {
          underlying: option.underlying,
          strike: option.strike,
          option_type: option.type,
          expiry,
          interval_min: intervalMin,
        };
      }

      const response = await axios.get(url, { params });
      setStockData({
        ticker: response.data.ticker,
        bars: response.data.bars || [],
      });
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load option chart');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (option) => {
    const expiryNorm = option.expiry_display || option.expiry || '';
    const isSensex = option.underlying === 'SENSEX' || option.is_indicative;
    const isNseIndexDerived = option.is_live_derived && !isSensex && !option.is_equity;

    const stock = {
      ticker: isSensex
        ? `SENSEX${option.strike}${option.type}_${expiryNorm}`
        : `OPT_${option.underlying}_${option.strike}_${option.type}_${expiryNorm}`,
      name: option.instrument,
      type: 'OPTION',
      underlying: option.underlying,
      strike: option.strike,
      optionType: option.type,
      expiry: expiryNorm,
      last_price: option.last_price,
      change_pct: option.change_pct,
      selectedOption: option,
      is_live_derived: option.is_live_derived || false,
      is_equity: option.is_equity || false,
    };
    setStockData(null);
    setPivotPoint(null);
    setGannFan(null);
    setSignal(null);
    setSelectedStock(stock);
    setOptionsSheet(null);
    setShowOptionChain(null);
    const optTf = { multiplier: 5, timespan: 'minute', label: '5M' };
    setTimeframe(optTf);
    fetchOptionIntraday(option, 5);
    setMobilePanel('chart');
    const derivedTag = (isSensex || isNseIndexDerived || option.is_equity) ? ' · BS-Derived' : '';
    const desc = `₹${option.last_price.toFixed(2)} (${option.change_pct >= 0 ? '+' : ''}${option.change_pct.toFixed(2)}%) · Exp ${expiryNorm}${derivedTag}`;
    toast.success(`${option.instrument} chart loaded`, { description: desc });
  };

  const handleCryptoSelect = (crypto) => {
    setStockData(null);
    setPivotPoint(null);
    setGannFan(null);
    setSignal(null);
    setSelectedStock(crypto);
    setCryptoChartDays(7);
    fetchCryptoData(crypto.coin_id, 7);
    setMobilePanel('chart');
  };

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf);
    if (selectedStock) {
      setPivotPoint(null);
      setGannFan(null);
      setSignal(null);
      if (selectedStock.type === 'CRYPTO') {
        // Map timeframe to crypto days
        const daysMap = {
          '1MIN': 1, '2M': 1, '3M': 1, '5M': 1, '10M': 1, '15M': 1, '30M': 1, '45M': 1,
          '1H': 1, '2H': 1, '4H': 1,
          '1D': 7, '1W': 30,
          '1MO': 30, '3MO': 90, '6MO': 180,
          '1Y': 365,
          // legacy
          '1M': 30, '6M': 180,
        };
        const days = daysMap[tf.label] || 7;
        setCryptoChartDays(days);
        fetchCryptoData(selectedStock.coin_id, days);
      } else if (selectedStock.type === 'OPTION' && selectedStock.selectedOption) {
        // Options support 1m / 5m / 15m intraday only (NSE chart-databyindex tick data)
        const optIntervalMap = { '1MIN': 1, '2M': 2, '3M': 3, '5M': 5, '10M': 10, '15M': 15, '30M': 30, '45M': 45 };
        const ivm = optIntervalMap[tf.label] || 1;
        fetchOptionIntraday(selectedStock.selectedOption, ivm);
      } else {
        fetchStockData(selectedStock.ticker, tf);
      }
    }
  };

  const handlePivotSelect = async (pivot) => {
    setPivotPoint(pivot);
    if (!pivot) return;
    try {
      const response = await axios.post(`${API}/gann/fan`, {
        ticker: selectedStock.ticker,
        pivot_price: pivot.price,
        pivot_timestamp: pivot.timestamp,
        bars_count: 50
      });
      setGannFan(response.data);
      toast.success('Gann Fan calculated');
      fetchSignal(pivot);
    } catch (error) {
      toast.error('Failed to calculate Gann Fan');
    }
  };

  const fetchSignal = async (pivot) => {
    if (!selectedStock || !pivot || selectedStock.type === 'CRYPTO' || selectedStock.type === 'OPTION') return;
    try {
      const response = await axios.get(`${API}/signal/${selectedStock.ticker}`, {
        params: { pivot_price: pivot.price, pivot_timestamp: pivot.timestamp }
      });
      setSignal(response.data);
    } catch (error) { /* silent */ }
  };

  // fetchSignal is a plain function (not memoized) so excluded from deps intentionally
  useEffect(() => {
    if (!pivotPoint) return;
    const interval = setInterval(() => fetchSignal(pivotPoint), 60000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotPoint, selectedStock]);

  const isCrypto = selectedStock?.type === 'CRYPTO';
  const isOption = selectedStock?.type === 'OPTION';

  // Primary Left-Nav (SCAN / STRAT / TRADERS / PAPER) — SETTINGS opens the drawer
  const sidebarNav = [
    { id: 'scan',       label: 'SCAN',    icon: MagnifyingGlass },
    { id: 'strategies', label: 'STRAT',   icon: ChartLineUp     },
    { id: 'traders',    label: 'TRADERS', icon: UsersThree      },
    { id: 'paper',      label: 'PAPER',   icon: Notebook        },
    { id: 'crypto',     label: 'CRYPTO',  icon: CurrencyBtc     },
    { id: 'market',     label: 'INTEL',   icon: Globe           },
  ];

  const mobilePanels = [
    { id: 'left',  label: 'Menu',  icon: List        },
    { id: 'chart', label: 'Chart', icon: ChartLineUp },
  ];

  return (
    <div className="h-screen overflow-hidden bg-slate-100 dark:bg-[#0A0A0A] text-slate-900 dark:text-white flex flex-col transition-colors duration-200" data-testid="trading-dashboard">
      <Toaster theme={theme} position="top-right" richColors />

      {/* HYBRID MODE OVERLAY */}
      {hybridMode && (
        <HybridDashboard onBack={() => setHybridMode(false)} />
      )}

      {/* Normal Gann Trader UI (hidden when hybrid mode is on) */}
      {!hybridMode && (<>

      {/* ══════════════════ TOP BAR ══════════════════ */}
      <header className="h-14 md:h-16 border-b border-slate-200 dark:border-white/10 flex items-center gap-2 md:gap-4 px-2 md:px-4 bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-md z-50 shrink-0 transition-colors duration-200" data-testid="dashboard-header">
        {/* Mobile hamburger — toggles left nav drawer */}
        <button
          onClick={() => setMobilePanel(mobilePanel === 'left' ? 'chart' : 'left')}
          className="lg:hidden p-2 rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0"
          data-testid="mobile-sidebar-toggle"
        >
          <List size={16} weight="bold" />
        </button>

        {/* Brand */}
        <div
          className="liquid-glass-brand flex flex-col cursor-pointer leading-none shrink-0"
          onClick={() => window.location.href = '/'}
          data-testid="brand-logo"
          title="Go to Home"
        >
          <h1
            className="text-sm md:text-lg font-black tracking-tighter uppercase leading-none"
            style={{ fontFamily: "'Chivo', sans-serif" }}
          >
            <span className="text-slate-900 dark:text-white">Dreamer</span>
            <span className="ml-1" style={{ fontFamily: 'serif', textTransform: 'none' }}>💤</span>
          </h1>
          <span className="text-[8px] font-medium tracking-[0.22em] uppercase text-[#00E676]/70 leading-none mt-0.5 hidden xl:block">
            KRONOS AI TRADING
          </span>
        </div>

        {/* Big Live Index Tickers — NIFTY / BANKNIFTY / SENSEX (tap → top options) */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <IndicesTickerBar onIndexClick={handleIndexClick} />
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {/* Global Stock/Crypto Search — desktop only (mobile has its own bar below) */}
          <div className="hidden lg:block lg:w-64" data-testid="topbar-search">
            <StockSearch onStockSelect={handleStockSelect} selectedStock={selectedStock} />
          </div>

          {/* Market Intelligence button — always visible */}
          <button
            onClick={() => setShowNews(true)}
            className="p-1.5 rounded-md border border-slate-200 dark:border-white/10 text-sky-500 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
            title="Market Intelligence"
            data-testid="news-btn"
          >
            <Newspaper size={15} />
          </button>

          {/* RL AGENT BACKGROUND TRAINING INDICATOR — jumps into Settings drawer */}
          {rlStatus?.status === 'training' && (
            <button
              onClick={() => { setShowSettings(true); setSettingsSection('rlagent'); }}
              data-testid="rl-training-indicator"
              title={`DreamerV3 Training — Ep ${rlStatus.episode} · ${(rlStatus.timesteps_done/1000).toFixed(1)}K/${(rlStatus.timesteps_total/1000).toFixed(0)}K steps`}
              className="flex items-center gap-1 px-1.5 py-1 rounded border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 transition-all cursor-pointer"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
              </span>
              <span className="text-[8px] font-bold text-amber-400 uppercase tracking-widest hidden lg:inline whitespace-nowrap">
                DV3 · {Math.round((rlStatus.timesteps_done / rlStatus.timesteps_total) * 100)}%
              </span>
            </button>
          )}

          {/* THEME TOGGLE */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md border border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-all duration-200"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <Sun size={15} weight="bold" /> : <Moon size={15} weight="bold" />}
          </button>

          {/* NOTIFICATIONS / ALERTS — opens Settings drawer at Alerts section */}
          <button
            onClick={() => { setShowSettings(true); setSettingsSection('alerts'); }}
            className="p-1.5 rounded-md border border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-all duration-200"
            title="Alerts"
            data-testid="notifications-btn"
          >
            <Bell size={15} weight="bold" />
          </button>
        </div>
      </header>

      {/* Mobile Search Bar — visible below desktop (lg) */}
      <div className="lg:hidden border-b border-slate-200 dark:border-white/10 p-2 shrink-0 bg-white dark:bg-[#0A0A0A]" data-testid="mobile-search-bar">
        <StockSearch onStockSelect={handleStockSelect} selectedStock={selectedStock} />
      </div>

      {/* NIFTY 50 Advance / Decline Ticker — animated bull/bear + live 50-stock modal */}
      <AdvanceDeclineTicker />

      {/* Mobile Tab Bar — full-width 3-panel nav · hidden on lg+ (desktop shows full grid) */}
      <div className="flex lg:hidden border-b border-slate-200 dark:border-white/10 shrink-0 bg-white dark:bg-[#0D0D0D] transition-colors duration-200">
        {mobilePanels.map(p => (
          <button key={p.id} onClick={() => setMobilePanel(p.id)}
            className={`flex-1 py-2.5 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 relative ${
              mobilePanel === p.id
                ? 'text-[#007AFF]'
                : 'text-slate-400 dark:text-zinc-500'
            }`}
            data-testid={`mobile-panel-${p.id}`}>
            {mobilePanel === p.id && (
              <span className="absolute top-0 inset-x-4 h-0.5 bg-[#007AFF] rounded-b-full" />
            )}
            <p.icon size={18} weight={mobilePanel === p.id ? 'fill' : 'regular'} />
            <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">{p.label}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════ MAIN GRID ══════════════════ */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden min-h-0">

        {/* Left Sidebar — Nav (SCAN/STRAT/TRADERS/PAPER/SETTINGS) + section content */}
        <aside className={`lg:col-span-3 xl:col-span-2 border-r border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A] flex flex-col overflow-hidden transition-colors duration-200 ${mobilePanel !== 'left' ? 'hidden lg:flex' : 'flex'}`} data-testid="left-sidebar">
          {/* Primary Nav row */}
          <div className="flex border-b border-slate-200 dark:border-white/10 shrink-0 bg-white dark:bg-[#0A0A0A]">
            {sidebarNav.map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setMobilePanel('left'); }}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-0.5 border-b-2 transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'border-[#007AFF] text-[#007AFF] bg-[#007AFF]/5'
                    : 'border-transparent text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200'
                }`}
                data-testid={`sidebar-nav-${tab.id}`}>
                <tab.icon size={15} weight={activeTab === tab.id ? 'fill' : 'regular'} />
                <span className="text-[7.5px] font-bold uppercase tracking-[0.08em]">{tab.label}</span>
              </button>
            ))}
            <button onClick={() => setShowSettings(true)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 px-0.5 border-b-2 border-transparent text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 transition-all duration-150"
              data-testid="sidebar-nav-settings">
              <GearSix size={15} />
              <span className="text-[7.5px] font-bold uppercase tracking-[0.08em]">SETTINGS</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'scan' && (
              <AutoScanner
                selectedStock={selectedStock}
                onPaperTrade={handlePaperTradeFromSignal}
                autoExecute={paperAutoExecute}
                onAutoExecuteTrade={handleAutoExecuteTrade}
                onStockSelect={handleStockSelect}
              />
            )}

            {activeTab === 'strategies' && (
              <div className="divide-y divide-white/10">
                {selectedStock && stockData && (
                  <>
                    {isCrypto && <CryptoDashboard preSelectedCoin={selectedStock} />}
                    <SMCAnalysis stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <AMDSAnalysis stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <MiroFishAnalysis stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <PACSOAnalysis stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <GPTAnalysis stockData={stockData} selectedStock={selectedStock} timeframe={timeframe} onAnalysisComplete={handleStrategyAnalysis} />
                    <AITradeAnalysis stockData={stockData} selectedStock={selectedStock} timeframe={timeframe} onAnalysisComplete={handleStrategyAnalysis} />
                    <FallingKnifeAnalysis stockData={stockData} selectedStock={selectedStock} timeframe={timeframe} onAnalysisComplete={handleStrategyAnalysis} />
                    <ReversePriceSwings stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <ExplosiveVolumeAnalysis stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <GoldenSetupAnalysis stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <AIIndicatorScore stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <GodzillaSetupAnalysis stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <NarrativeSwingAnalysis stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                    <HybridVWAPAnalysis stockData={stockData} selectedStock={selectedStock} onAnalysisComplete={handleStrategyAnalysis} />
                  </>
                )}
                {!selectedStock && (
                  <div className="p-6 text-center">
                    <p className="text-slate-400 dark:text-zinc-500 text-sm">Select a stock or crypto to view strategies</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'traders' && (
              <TopTraderUniverseScan
                selectedStock={selectedStock}
                onStockLoad={handleTopTraderStockLoad}
              />
            )}

            {activeTab === 'paper' && (
              <PaperTradingPanel
                selectedStock={selectedStock}
                pendingTrade={pendingPaperTrade}
                onPendingTradeConsumed={() => setPendingPaperTrade(null)}
                autoExecute={paperAutoExecute}
                onAutoExecuteChange={setPaperAutoExecute}
              />
            )}

            {activeTab === 'crypto' && (
              <CryptoList
                onCryptoSelect={handleCryptoSelect}
                selectedCrypto={isCrypto ? selectedStock : null}
              />
            )}

            {activeTab === 'market' && (
              <div className="divide-y divide-white/10">
                <RegulatoryWatchdogPanel />
                <SectorTrending onSectorSelect={(sector) => setSectorSheet(sector)} />
                <TopMoversWidget onStockSelect={(stock) => {
                  setSelectedStock({ ticker: stock.ticker, name: stock.name, type: 'stock' });
                  const tf = { multiplier: 1, timespan: 'day', label: '1D' };
                  setTimeframe(tf);
                  fetchStockData(stock.ticker, tf);
                  setMobilePanel('chart');
                }} />
                <SectorRotationPicker onStockSelect={handleStockSelect} />
                <MoneycontrolMovers onPaperTrade={(sig) => {
                  setPendingPaperTrade({ ...sig, symbol: sig.symbol });
                  setActiveTab('paper');
                  setMobilePanel('left');
                }} />
              </div>
            )}
          </div>
        </aside>

        {/* Center — Live Chart + Key Indicators */}
        <main className={`flex-1 lg:col-span-9 xl:col-span-10 flex flex-col relative min-h-0 overflow-y-auto ${mobilePanel !== 'chart' ? 'hidden lg:flex' : 'flex'}`} data-testid="center-chart">
          {/* Multi-chart panel — height grows with viewport */}
          <div className="shrink-0" style={{ height: 'min(68vh, 680px)', minHeight: '420px' }}>
            <MultiChartLayout
              initialStock={selectedStock}
              initialStockData={stockData}
              initialLoading={loading}
              initialTimeframe={timeframe}
              initialDataSource={dataSource}
              onPrimaryStockChange={(stock) => {
                // When user picks a stock in chart slot-1, sync it to sidebar state too
                if (stock && stock.ticker !== selectedStock?.ticker) {
                  handleStockSelect(stock);
                }
              }}
              onOpenOptionChain={(payload) => setShowOptionChain(payload)}
            />
          </div>
          {/* Key Indicators — Order Flow, Kronos Forecast, GannQSC, Square of 9 */}
          <div className="shrink-0 border-t border-slate-200 dark:border-white/10 px-2 py-2 space-y-2" data-testid="key-indicators-strip">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-zinc-500 px-1">Key Indicators</p>
            {stockData?.bars?.length >= 30 && (
              <OrderFlowPanel stockData={stockData} selectedStock={selectedStock} />
            )}
            <KronosForecastPanel selectedStock={selectedStock} timeframe={timeframe} />
            {stockData?.bars?.length > 0 && selectedStock && (
              <GannQSCPanel
                bars={stockData.bars}
                ticker={isCrypto ? selectedStock.symbol : selectedStock.ticker}
              />
            )}
            {stockData && !isCrypto && (
              <SquareOf9Calculator currentPrice={stockData.bars[stockData.bars.length - 1]?.close} />
            )}
          </div>
        </main>

      </div>

      {/* Settings Drawer — always mounted so Robo/RL background loops never stop */}
      <SettingsDrawer
        open={showSettings}
        onClose={() => setShowSettings(false)}
        section={settingsSection}
        setSection={setSettingsSection}
        selectedStock={selectedStock}
        isCrypto={isCrypto}
        onStockSelect={handleStockSelect}
        onCryptoSelect={handleCryptoSelect}
        onSectorSelect={(sector) => { setSectorSheet(sector); setShowSettings(false); }}
        onTopMoverSelect={(stock) => {
          setSelectedStock({ ticker: stock.ticker, name: stock.name, type: 'stock' });
          const tf = { multiplier: 1, timespan: 'day', label: '1D' };
          setTimeframe(tf);
          fetchStockData(stock.ticker, tf);
          setMobilePanel('chart');
          setShowSettings(false);
        }}
        onMoneycontrolPaperTrade={(sig) => {
          setPendingPaperTrade({ ...sig, symbol: sig.symbol });
          setActiveTab('paper');
          setMobilePanel('left');
          setShowSettings(false);
        }}
        onOpenTool={(tool) => {
          setShowSettings(false);
          if (tool === 'visualize') setShowVisualize(true);
          else if (tool === '3d') setShow3D(true);
          else if (tool === 'parity') setShowParityScanner(true);
          else if (tool === 'deltadash') setShowDeltaDash(true);
          else if (tool === 'hybridbrain') setShowHybridBrain(true);
        }}
      />

      {/* Visualize Modal */}
      {showVisualize && (
        <VisualizeModal
          onClose={() => setShowVisualize(false)}
          selectedStock={selectedStock}
        />
      )}

      {/* 3D Gann Panel */}
      {show3D && (
        <Gann3DPanel
          onClose={() => setShow3D(false)}
          stockData={stockData}
          selectedStock={selectedStock}
        />
      )}

      {/* Put-Call Parity F&O Scanner */}
      {showParityScanner && (
        <PutCallParityScanner
          onClose={() => setShowParityScanner(false)}
          onLoadChart={handleLoadParityChart}
        />
      )}

      {/* DeltaDash Scoreboard */}
      {showDeltaDash && (
        <DeltaDashScoreboard
          onClose={() => setShowDeltaDash(false)}
          onSelectStock={(stock) => {
            handleStockSelect(stock);
            setShowDeltaDash(false);
          }}
        />
      )}

      {/* Hybrid Super Brain */}
      {showHybridBrain && (
        <HybridBrainPanel onClose={() => setShowHybridBrain(false)} />
      )}

      {/* Voice Command System */}
      <VoiceCommandSystem
        onLoadStock={(symbol) => {
          const stock = { ticker: symbol, name: symbol.replace('.NS',''), type: 'stock' };
          handleStockSelect(stock);
        }}
        onNavigate={(tabId) => {
          const LEFT_IDS = ['scan', 'strategies', 'traders', 'paper'];
          const idMap = { scanner: 'scan' };
          const mapped = idMap[tabId] || tabId;
          if (LEFT_IDS.includes(mapped)) {
            setActiveTab(mapped);
            setMobilePanel('left');
          } else {
            setShowSettings(true);
            setSettingsSection(mapped === 'monte' ? 'ensemble' : mapped);
          }
        }}
        onSetAlert={(price) => {
          setActiveTab('scan');
          setMobilePanel('left');
        }}
        onRunStrategy={(strat) => {
          setActiveTab('strategies');
          setMobilePanel('left');
        }}
        onScanMarket={() => {
          setActiveTab('scan');
          setMobilePanel('left');
        }}
      />

      {/* Market Intelligence Panel */}
      {showNews && (
        <MarketIntelPanel
          onClose={() => setShowNews(false)}
        />
      )}

      {/* Top Options Sheet (opens when an index pill is tapped) */}
      {optionsSheet && (
        <TopOptionsSheet
          symbol={optionsSheet.symbol}
          name={optionsSheet.name}
          onClose={() => setOptionsSheet(null)}
          onOptionSelect={handleOptionSelect}
        />
      )}

      {/* Equity Option Chain Modal (opens via red OC button on chart) */}
      {showOptionChain && (
        <OptionChainModal
          symbol={showOptionChain.symbol}
          name={showOptionChain.name}
          onClose={() => setShowOptionChain(null)}
          onOptionSelect={handleOptionSelect}
        />
      )}

      {/* Sector Stocks Sheet (opens when a sector is clicked) */}
      {sectorSheet && (
        <SectorStocksSheet
          sector={sectorSheet}
          onClose={() => setSectorSheet(null)}
          onStockSelect={(stock) => {
            setSelectedStock({ ticker: stock.ticker, name: stock.name, type: 'stock' });
            const tf = { multiplier: 1, timespan: 'day', label: '1D' };
            setTimeframe(tf);
            fetchStockData(stock.ticker, tf);
            setMobilePanel('chart');
          }}
        />
      )}
    </>)}
    </div>
  );
};

export default TradingDashboard;
