import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Activity, BarChart2, Gauge, Plus, X, Grid3X3, FileText } from 'lucide-react';
import { api } from '../api/client';
import type { MarketIndex, SectorPerf, FearGreed, GainersLosers, CorrelationResult, OptionFlow } from '../types';
import { useAppStore } from '../store';

function formatPrice(p: number): string { return p >= 1 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.toFixed(4); }

function getHeatColor(pct: number): string {
  if (pct >= 2) return 'bg-green-500'; if (pct >= 1) return 'bg-green-600'; if (pct >= 0.25) return 'bg-green-800';
  if (pct >= -0.25) return 'bg-navy-600'; if (pct >= -1) return 'bg-red-800'; if (pct >= -2) return 'bg-red-600'; return 'bg-red-500';
}
function getFGColor(s: number): string {
  if (s >= 75) return 'text-green-400'; if (s >= 55) return 'text-green-500'; if (s >= 45) return 'text-yellow-400'; if (s >= 25) return 'text-orange-400'; return 'text-red-400';
}
function corrColor(v: number): string {
  if (v >= 0.7) return 'bg-green-500'; if (v >= 0.4) return 'bg-green-700'; if (v >= 0.1) return 'bg-green-900';
  if (v >= -0.1) return 'bg-navy-600'; if (v >= -0.4) return 'bg-red-900'; if (v >= -0.7) return 'bg-red-700'; return 'bg-red-500';
}

type Tab = 'overview' | 'correlation' | 'options';

function FearGreedGauge({ data }: { data: FearGreed | null }) {
  if (!data) return <div className="card animate-pulse h-48" />;
  const rot = -90 + (data.score / 100) * 180;
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4"><Gauge size={14} className="text-accent-yellow" /><span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Fear & Greed</span></div>
      <div className="flex items-center justify-center"><div className="relative w-40 h-24 overflow-hidden"><div className="absolute inset-0 rounded-t-full border-[6px] border-b-0 border-navy-600" /><div className="absolute bottom-0 left-1/2 origin-bottom w-0.5 h-[70px] -translate-x-1/2" style={{ transform: `translateX(-50%) rotate(${rot}deg)`, background: 'linear-gradient(to top, #fff, transparent)' }} /><div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white" /></div></div>
      <div className="text-center mt-3"><div className={`text-3xl font-mono font-bold ${getFGColor(data.score)}`}>{data.score}</div><div className={`text-sm font-mono ${getFGColor(data.score)}`}>{data.label}</div></div>
      <div className="flex justify-between mt-3 text-[10px] font-mono text-slate-600"><span>VIX: {data.vix.toFixed(2)}</span><span>SPY: {data.spyChange >= 0 ? '+' : ''}{data.spyChange.toFixed(2)}%</span></div>
    </div>
  );
}

export default function Markets() {
  const { selectedTicker } = useAppStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [sectors, setSectors] = useState<SectorPerf[]>([]);
  const [fearGreed, setFearGreed] = useState<FearGreed | null>(null);
  const [gainersLosers, setGainersLosers] = useState<GainersLosers | null>(null);
  const [loading, setLoading] = useState(true);

  // Correlation
  const [corrTickers, setCorrTickers] = useState<string[]>(['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA']);
  const [corrInput, setCorrInput] = useState('');
  const [corrResult, setCorrResult] = useState<CorrelationResult | null>(null);
  const [corrLoading, setCorrLoading] = useState(false);

  // Options
  const [optTicker, setOptTicker] = useState(selectedTicker);
  const [options, setOptions] = useState<OptionFlow[]>([]);
  const [optLoading, setOptLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      api.getMarketOverview().then(setIndices), api.getSectorPerformance().then(setSectors),
      api.getFearGreed().then(setFearGreed), api.getGainersLosers().then(setGainersLosers),
    ]).finally(() => setLoading(false));
  }, []);

  const fetchCorr = useCallback(() => {
    if (corrTickers.length < 2) return;
    setCorrLoading(true);
    api.getCorrelation(corrTickers).then(setCorrResult).catch(() => {}).finally(() => setCorrLoading(false));
  }, [corrTickers]);

  useEffect(() => { if (tab === 'correlation') fetchCorr(); }, [tab, fetchCorr]);

  const fetchOpt = useCallback(() => {
    if (!optTicker) return;
    setOptLoading(true);
    api.getOptions(optTicker).then(setOptions).catch(() => {}).finally(() => setOptLoading(false));
  }, [optTicker]);

  useEffect(() => { if (tab === 'options') fetchOpt(); }, [tab, fetchOpt]);

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-xl font-bold text-white">Markets</h1><p className="text-slate-500 text-sm mt-0.5">Macro overview, sectors & analysis</p></div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-navy-600 pb-2">
        {([
          { key: 'overview', label: 'Overview', Icon: BarChart2 },
          { key: 'correlation', label: 'Correlation Matrix', Icon: Grid3X3 },
          { key: 'options', label: 'Options Flow', Icon: FileText },
        ] as { key: Tab; label: string; Icon: any }[]).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-medium transition-all ${
              tab === key ? 'bg-accent-cyan/10 text-accent-cyan border-b-2 border-accent-cyan' : 'text-slate-500 hover:text-slate-300'
            }`}
          ><Icon size={13} />{label}</button>
        ))}
      </div>

      {/* ─── Overview tab ────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {loading && !indices.length ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="card animate-pulse h-28" />) :
              indices.map((idx) => { const up = idx.changePercent >= 0; return (
                <div key={idx.symbol} className="card">
                  <div className="flex items-start justify-between mb-2"><div><div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{idx.symbol}</div><div className="text-slate-300 font-medium text-sm">{idx.label}</div></div><span className={up ? 'badge-up' : 'badge-down'}>{up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{up ? '+' : ''}{idx.changePercent.toFixed(2)}%</span></div>
                  <div className="text-xl font-mono font-bold text-white">{formatPrice(idx.price)}</div>
                  <div className={`text-xs font-mono mt-0.5 ${up ? 'text-accent-green' : 'text-accent-red'}`}>{up ? '+' : ''}{idx.change.toFixed(2)}</div>
                </div>);
              })
            }
          </div>
          <div className="grid grid-cols-[1fr_300px] gap-6">
            <div className="space-y-6">
              <div className="card"><div className="flex items-center gap-2 mb-4"><BarChart2 size={14} className="text-accent-cyan" /><span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Sector Performance</span></div>
                <div className="grid grid-cols-3 gap-2">{sectors.map((s) => { const up = s.changePercent >= 0; return (<div key={s.symbol} className={`rounded-lg p-3 ${getHeatColor(s.changePercent)} bg-opacity-30 border border-navy-600`}><div className="text-xs font-mono font-medium text-white mb-0.5">{s.name}</div><div className="text-[10px] font-mono text-slate-400">{s.symbol}</div><div className={`text-sm font-mono font-bold mt-1 ${up ? 'text-accent-green' : 'text-accent-red'}`}>{up ? '+' : ''}{s.changePercent.toFixed(2)}%</div></div>); })}</div>
              </div>
              {gainersLosers && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="card"><div className="flex items-center gap-2 mb-3"><TrendingUp size={12} className="text-accent-green" /><span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Top Gainers</span></div><div className="space-y-2">{gainersLosers.gainers.map((s) => (<div key={s.symbol} className="flex items-center justify-between"><div><span className="font-mono font-bold text-xs text-accent-cyan">{s.symbol}</span><span className="text-[10px] text-slate-500 ml-2">{formatPrice(s.price)}</span></div><span className="badge-up">+{s.changePercent.toFixed(2)}%</span></div>))}</div></div>
                  <div className="card"><div className="flex items-center gap-2 mb-3"><TrendingDown size={12} className="text-accent-red" /><span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Top Losers</span></div><div className="space-y-2">{gainersLosers.losers.map((s) => (<div key={s.symbol} className="flex items-center justify-between"><div><span className="font-mono font-bold text-xs text-accent-cyan">{s.symbol}</span><span className="text-[10px] text-slate-500 ml-2">{formatPrice(s.price)}</span></div><span className="badge-down">{s.changePercent.toFixed(2)}%</span></div>))}</div></div>
                </div>
              )}
            </div>
            <div className="space-y-4"><FearGreedGauge data={fearGreed} />
              {fearGreed && (<div className="card"><div className="flex items-center gap-2 mb-2"><Activity size={12} className="text-accent-yellow" /><span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">VIX</span></div><div className="text-2xl font-mono font-bold text-white">{fearGreed.vix.toFixed(2)}</div><div className="text-xs font-mono text-slate-500 mt-1">{fearGreed.vix < 15 ? 'Low' : fearGreed.vix < 25 ? 'Moderate' : 'High'} volatility</div><div className="mt-3 h-2 rounded-full bg-navy-600 overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (fearGreed.vix / 40) * 100)}%`, background: fearGreed.vix < 15 ? '#00D4AA' : fearGreed.vix < 25 ? '#FFD700' : '#FF4757' }} /></div></div>)}
            </div>
          </div>
        </>
      )}

      {/* ─── Correlation tab ─────────────────────────────────────────────── */}
      {tab === 'correlation' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <span className="text-xs font-mono text-slate-400 uppercase">Tickers:</span>
              {corrTickers.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-navy-700 border border-navy-600 text-xs font-mono text-accent-cyan">
                  {t}<button onClick={() => setCorrTickers((p) => p.filter((x) => x !== t))} className="text-slate-600 hover:text-accent-red"><X size={10} /></button>
                </span>
              ))}
              {corrTickers.length < 10 && (
                <div className="flex items-center gap-1">
                  <input className="input-field w-24 text-xs py-1" placeholder="Add…" value={corrInput}
                    onChange={(e) => setCorrInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter' && corrInput.trim()) { setCorrTickers((p) => [...new Set([...p, corrInput.trim()])]); setCorrInput(''); } }}
                  />
                  <button onClick={() => { if (corrInput.trim()) { setCorrTickers((p) => [...new Set([...p, corrInput.trim()])]); setCorrInput(''); } }} className="btn-ghost p-1"><Plus size={14} /></button>
                </div>
              )}
              <button onClick={fetchCorr} disabled={corrLoading} className="btn-primary text-xs ml-auto">
                {corrLoading ? 'Computing…' : 'Calculate'}
              </button>
            </div>
          </div>

          {corrResult && (
            <div className="card overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr><th className="p-2" />{corrResult.tickers.map((t) => <th key={t} className="p-2 text-accent-cyan font-bold">{t}</th>)}</tr>
                </thead>
                <tbody>
                  {corrResult.tickers.map((t1, i) => (
                    <tr key={t1}>
                      <td className="p-2 text-accent-cyan font-bold">{t1}</td>
                      {corrResult.matrix[i].map((v, j) => (
                        <td key={j} className="p-1">
                          <div className={`${corrColor(v)} rounded px-2 py-1.5 text-center text-white font-medium ${i === j ? 'opacity-50' : ''}`}>
                            {v.toFixed(2)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-center gap-4 mt-4 text-[10px] font-mono text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> -1 (Inverse)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-navy-600 inline-block" /> 0 (Uncorrelated)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> +1 (Correlated)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Options Flow tab ────────────────────────────────────────────── */}
      {tab === 'options' && (
        <div className="space-y-4">
          <div className="card flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400 uppercase">Ticker:</span>
            <input className="input-field w-32 text-xs py-1.5" value={optTicker} onChange={(e) => setOptTicker(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && fetchOpt()} />
            <button onClick={fetchOpt} disabled={optLoading} className="btn-primary text-xs">{optLoading ? 'Loading…' : 'Load Options'}</button>
            <span className="text-[10px] text-slate-600 font-mono ml-auto">Simulated unusual activity</span>
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-navy-600">
                {['Ticker', 'Strike', 'Expiry', 'Type', 'Volume', 'Open Interest', 'IV', 'Signal'].map((h) => (
                  <th key={h} className={`py-2.5 px-3 text-xs text-slate-500 font-medium ${h === 'Ticker' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {options.map((o, i) => (
                  <tr key={i} className={`border-b border-navy-700 hover:bg-navy-700/40 transition-colors ${o.unusual ? 'bg-accent-yellow/5' : ''}`}>
                    <td className="py-2.5 px-3 font-mono font-bold text-accent-cyan text-xs">{o.ticker}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-white">${o.strike}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-xs">{o.expiry}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${o.type === 'CALL' ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'}`}>{o.type}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-white text-xs">{o.volume.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-xs">{o.openInterest.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300 text-xs">{(o.impliedVolatility * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-right">
                      {o.unusual && <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-accent-yellow/15 text-accent-yellow border border-accent-yellow/30">UNUSUAL</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
