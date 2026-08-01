import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, CheckCircle, Warning, ArrowsClockwise, Plugs, PlugsConnected } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BROKERS = [
  {
    id: 'groww',
    name: 'Groww',
    color: '#00D09C',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Enter Groww API Key' },
      { key: 'api_secret', label: 'API Secret', placeholder: 'Enter Groww API Secret', type: 'password' },
    ],
    help: 'Groww Pro → Settings → API → Generate Key',
    status: 'live',
  },
  {
    id: 'zerodha',
    name: 'Zerodha (Kite)',
    color: '#387ED1',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Enter Kite API Key' },
      { key: 'api_secret', label: 'API Secret', placeholder: 'Enter Kite API Secret', type: 'password' },
      { key: 'access_token', label: 'Access Token', placeholder: 'Daily access token', type: 'password' },
    ],
    help: 'kite.zerodha.com/settings/api → Create App',
    status: 'live',
  },
  {
    id: 'upstox',
    name: 'Upstox',
    color: '#7B2FF7',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Enter Upstox API Key' },
      { key: 'api_secret', label: 'API Secret', placeholder: 'Enter API Secret', type: 'password' },
      { key: 'access_token', label: 'Access Token', placeholder: 'OAuth Access Token', type: 'password' },
    ],
    help: 'upstox.com/developer/apps → Create App',
    status: 'live',
  },
  {
    id: 'angelone',
    name: 'AngelOne (Smart API)',
    color: '#E8472A',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Enter SmartAPI Key' },
      { key: 'client_id', label: 'Client ID', placeholder: 'Your AngelOne Client ID' },
      { key: 'api_secret', label: 'PIN / Password', placeholder: 'Trading PIN', type: 'password' },
    ],
    help: 'smartapi.angelbroking.com → Generate API Key',
    status: 'live',
  },
  {
    id: 'dhan',
    name: 'Dhan',
    color: '#2E5BFF',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'Your Dhan Client ID' },
      { key: 'access_token', label: 'Access Token', placeholder: 'Dhan Access Token', type: 'password' },
    ],
    help: 'dhanhq.co/developers → Generate Token',
    status: 'live',
  },
  {
    id: 'fyers',
    name: 'Fyers',
    color: '#1A73E8',
    fields: [
      { key: 'api_key', label: 'App ID', placeholder: 'Enter Fyers App ID' },
      { key: 'api_secret', label: 'Secret Key', placeholder: 'Enter Secret Key', type: 'password' },
      { key: 'access_token', label: 'Access Token', placeholder: 'OAuth Access Token', type: 'password' },
    ],
    help: 'myaccount.fyers.in/apps → Create App',
    status: 'live',
  },
];

export default function BrokerSettingsModal({ onClose, onConnected }) {
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [credentials, setCredentials] = useState({});
  const [testing, setTesting] = useState(false);
  const [currentSettings, setCurrentSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/broker/settings`);
      setCurrentSettings(res.data);
      if (res.data?.broker) {
        setSelectedBroker(res.data.broker);
      }
    } catch (e) {
      // no settings yet
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!selectedBroker) return;
    const broker = BROKERS.find(b => b.id === selectedBroker);
    if (!broker) return;

    // Validate required fields
    for (const field of broker.fields) {
      if (!credentials[field.key] && field.key !== 'access_token') {
        toast.error(`${field.label} required hai`);
        return;
      }
    }

    setTesting(true);
    try {
      // Save settings first
      await axios.post(`${API}/broker/settings`, {
        broker: selectedBroker,
        ...credentials,
      });

      // Test connection
      const res = await axios.post(`${API}/broker/test`, {
        broker: selectedBroker,
        ...credentials,
      });

      if (res.data.connected) {
        toast.success(`${broker.name} connected! Live trading ready.`);
        await fetchSettings();
        if (onConnected) onConnected(res.data.profile);
      } else {
        toast.error(res.data.error || 'Connection failed');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await axios.delete(`${API}/broker/settings`);
      setCurrentSettings(null);
      setSelectedBroker(null);
      setCredentials({});
      toast.success('Broker disconnected');
    } catch (e) {
      toast.error('Disconnect failed');
    }
  };

  const activeBroker = BROKERS.find(b => b.id === selectedBroker);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#0D0D0D] border border-white/15 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-[440px] max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#0D0D0D] border-b border-white/10 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Plugs size={16} className="text-[#00E676]" weight="fill" />
            <span className="text-sm font-black uppercase tracking-widest text-white">Broker Connect</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Currently Connected */}
          {currentSettings?.connected && currentSettings?.profile && (
            <div className="flex items-center gap-3 p-3 bg-[#00E676]/10 border border-[#00E676]/30 rounded-xl">
              <PlugsConnected size={18} className="text-[#00E676]" weight="fill" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-[#00E676] uppercase tracking-wider">Connected</p>
                <p className="text-xs text-white font-bold truncate">{currentSettings.profile?.name}</p>
                <p className="text-[9px] text-zinc-500">{currentSettings.profile?.broker}</p>
              </div>
              <button
                onClick={handleDisconnect}
                className="text-[9px] px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors font-bold uppercase"
              >
                Disconnect
              </button>
            </div>
          )}

          {/* Broker Selection */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">Broker Select Karo</p>
            <div className="grid grid-cols-3 gap-2">
              {BROKERS.map(b => (
                <button
                  key={b.id}
                  onClick={() => { setSelectedBroker(b.id); setCredentials({}); }}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    selectedBroker === b.id
                      ? 'border-white/30 bg-white/10'
                      : 'border-white/8 hover:border-white/20 hover:bg-white/5'
                  }`}
                  style={selectedBroker === b.id ? { borderColor: b.color + '60', background: b.color + '15' } : {}}
                  data-testid={`broker-option-${b.id}`}
                >
                  <div
                    className="w-5 h-5 rounded-full mb-1.5 flex items-center justify-center text-[8px] font-black text-white"
                    style={{ background: b.color }}
                  >
                    {b.name[0]}
                  </div>
                  <p className="text-[9px] font-bold text-white leading-tight">{b.name.split(' ')[0]}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Credentials Form */}
          {activeBroker && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2.5 bg-white/[0.03] rounded-lg border border-white/8">
                <p className="text-[9px] text-zinc-500 flex-1">{activeBroker.help}</p>
              </div>

              {activeBroker.fields.map(field => (
                <div key={field.key}>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">{field.label}</label>
                  <input
                    type={field.type || 'text'}
                    value={credentials[field.key] || ''}
                    onChange={e => setCredentials(c => ({ ...c, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none focus:border-white/30 transition-colors"
                    data-testid={`broker-field-${field.key}`}
                  />
                </div>
              ))}

              <button
                onClick={handleTest}
                disabled={testing}
                className="w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{
                  background: activeBroker.color + '25',
                  border: `1px solid ${activeBroker.color}50`,
                  color: activeBroker.color,
                }}
                data-testid="broker-connect-btn"
              >
                {testing ? (
                  <><ArrowsClockwise size={12} className="animate-spin" /> Connecting...</>
                ) : (
                  <><PlugsConnected size={12} /> Connect {activeBroker.name}</>
                )}
              </button>
            </div>
          )}

          {/* Info Box */}
          <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
            <p className="text-[9px] text-yellow-400/80 leading-relaxed">
              <span className="font-black text-yellow-400">Live Trading:</span> Real money se order place hoga. 
              Credentials securely store kiye jayenge. API key kisi ke saath share mat karo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
