import React, { useState } from 'react';
import Watchlist from './Watchlist';
import GrowwPortfolio from './GrowwPortfolio';
import PortfolioTracker from './PortfolioTracker';
import AlertSystem from './AlertSystem';
import RLAgentPanel from './RLAgentPanel';
import RoboDashboard from './robo/RoboAdvisorDashboard';
import EnsembleCockpitPanel from './EnsembleCockpitPanel';
import MonteCarloPanel from './robo/MonteCarloPanel';
import PECETracker from './PECETracker';
import PortfolioOptimizerPanel from './PortfolioOptimizerPanel';
import AdvancedRiskPanel from './AdvancedRiskPanel';
import SentimentPanel from './SentimentPanel';
import ObservabilityPanel from './ObservabilityPanel';
import { X, Robot, MagicWand } from '@phosphor-icons/react';
import BlackScholesPanel from './BlackScholesPanel';

// ── Quant sub-panel (Portfolio Optimizer / Risk / Sentiment / Observability) ──
function QuantPanel({ selectedStock }) {
  const [sub, setSub] = useState('portfolio');
  const SUBS = [
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'risk', label: 'Risk' },
    { id: 'sentiment', label: 'Sentiment' },
    { id: 'observability', label: 'Observ.' },
  ];
  return (
    <div>
      <div className="flex gap-0 border-b border-white/10 bg-white/[0.02] sticky top-0 z-10">
        {SUBS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
              sub === s.id ? 'border-[#007AFF] text-[#007AFF]' : 'border-transparent text-zinc-500 hover:text-white'
            }`}
            data-testid={`quant-sub-${s.id}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sub === 'portfolio' && <PortfolioOptimizerPanel />}
      {sub === 'risk' && <AdvancedRiskPanel />}
      {sub === 'sentiment' && <SentimentPanel selectedStock={selectedStock} />}
      {sub === 'observability' && <ObservabilityPanel selectedStock={selectedStock} />}
    </div>
  );
}

const SECTIONS = [
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'groww', label: 'Groww' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'rlagent', label: 'RL Agent' },
  { id: 'ensemble', label: 'AI Assemble' },
  { id: 'pece', label: 'PE-CE OI' },
  { id: 'quant', label: 'Quant' },
  { id: 'tools', label: 'Tools' },
  { id: 'bscalc', label: 'B-S Calc' },
];

/**
 * Settings Drawer — houses every feature that isn't one of the 5 primary
 * left-nav items (SCAN / STRAT / TRADERS / PAPER). Always mounted (never
 * conditionally unmounted) so RLAgentPanel + RoboDashboard keep polling /
 * training in the background even when the drawer is closed.
 */
const SettingsDrawer = ({
  open,
  onClose,
  section,
  setSection,
  selectedStock,
  isCrypto,
  onStockSelect,
  onCryptoSelect,
  onSectorSelect,
  onTopMoverSelect,
  onMoneycontrolPaperTrade,
  onOpenTool,
}) => {
  return (
    <div
      className={`fixed inset-0 z-[60] transition-opacity duration-300 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      data-testid="settings-drawer-overlay"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`absolute inset-y-0 left-0 w-full sm:w-[420px] lg:w-[500px] bg-[#0A0A0A] border-r border-white/10 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        data-testid="settings-drawer"
      >
        {/* Header */}
        <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-white/10">
          <h2 className="text-sm font-black uppercase tracking-[0.15em] text-white">Settings &amp; Tools</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            data-testid="settings-drawer-close"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Pinned Robo-Trader banner */}
        <button
          onClick={() => setSection('robo')}
          className={`shrink-0 m-3 rounded-lg border p-3 flex items-center gap-3 transition-all text-left ${
            section === 'robo'
              ? 'border-[#007AFF] bg-[#007AFF]/10'
              : 'border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/15'
          }`}
          data-testid="settings-section-robo"
        >
          <Robot size={22} weight="fill" className="text-violet-400 shrink-0" />
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-white">Dreamer V3 Robo-Trader</p>
            <p className="text-[10px] text-zinc-400">Autonomous RL agent · Live paper trading</p>
          </div>
        </button>

        {/* Section pills */}
        <div className="shrink-0 flex gap-1.5 px-3 pb-3 overflow-x-auto scrollbar-none">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex-shrink-0 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors border ${
                section === s.id
                  ? 'border-[#007AFF] text-[#007AFF] bg-[#007AFF]/10'
                  : 'border-white/10 text-zinc-500 hover:text-white hover:border-white/20'
              }`}
              data-testid={`settings-section-${s.id}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto border-t border-white/10">
          {/* Robo + RL Agent are ALWAYS mounted (display toggle only) so their
              background polling / training loops never stop. */}
          <div style={{ display: section === 'robo' ? 'block' : 'none' }}>
            <RoboDashboard selectedStock={selectedStock} onSelectStock={onStockSelect} />
          </div>
          <div style={{ display: section === 'rlagent' ? 'block' : 'none' }}>
            <RLAgentPanel selectedStock={selectedStock} />
          </div>

          {section === 'watchlist' && <Watchlist onStockSelect={onStockSelect} selectedStock={selectedStock} />}
          {section === 'groww' && <GrowwPortfolio />}
          {section === 'portfolio' && <PortfolioTracker selectedStock={selectedStock} />}
          {section === 'alerts' && <AlertSystem selectedStock={selectedStock} />}

          {section === 'ensemble' && (
            <div className="space-y-3 p-2">
              <EnsembleCockpitPanel selectedStock={selectedStock} />
              <MonteCarloPanel initialCapital={100000} />
            </div>
          )}

          {section === 'pece' && <PECETracker />}
          {section === 'quant' && <QuantPanel selectedStock={selectedStock} />}

          {section === 'tools' && (
            <div className="p-4 grid grid-cols-2 gap-3">
              {[
                { id: 'visualize', label: 'Visualize', desc: 'Heatmaps · Correlation · Flow' },
                { id: '3d', label: '3D Gann', desc: 'Price Surface · Astro Cycles' },
                { id: 'parity', label: 'Parity Scan', desc: 'F&O arbitrage scanner' },
                { id: 'deltadash', label: 'DeltaDash', desc: 'Multi-TF scoreboard' },
                { id: 'hybridbrain', label: 'Hybrid Brain', desc: 'Super Brain visualization' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpenTool(t.id)}
                  className="p-3 rounded-lg border border-white/10 hover:border-[#007AFF]/50 hover:bg-[#007AFF]/10 text-left transition-all"
                  data-testid={`settings-tool-${t.id}`}
                >
                  <MagicWand size={16} className="text-[#007AFF] mb-1.5" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white">{t.label}</p>
                  <p className="text-[9px] text-zinc-500 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          )}

          {section === 'bscalc' && (
            <div>
              <div className="px-4 pt-4 pb-2 border-b border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Black-Scholes Calculator</p>
                <p className="text-[9px] text-zinc-500 mt-0.5">European Option Pricing · Greeks · Put-Call Parity</p>
              </div>
              <BlackScholesPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsDrawer;
