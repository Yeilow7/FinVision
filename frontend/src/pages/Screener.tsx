import { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowUpDown, Filter, RefreshCw, Download, Zap } from 'lucide-react';
import { api } from '../api/client';
import type { ScreenerStock } from '../types';

const SECTORS = ['All', 'Technology', 'Finance', 'Healthcare', 'Energy', 'Consumer', 'Industrials'];
const MCAP_FILTERS = [
  { label: 'All', min: 0, max: Infinity },
  { label: 'Mega (>200B)', min: 200e9, max: Infinity },
  { label: 'Large (10-200B)', min: 10e9, max: 200e9 },
  { label: 'Mid (2-10B)', min: 2e9, max: 10e9 },
  { label: 'Small (<2B)', min: 0, max: 2e9 },
];
const CHANGE_FILTERS = ['All', 'Gainers', 'Losers'];

const PRESETS: { label: string; icon: string; apply: (s: ScreenerStock[]) => ScreenerStock[] }[] = [
  { label: 'Momentum', icon: '🚀', apply: (s) => s.filter((x) => x.changePercent > 1).sort((a, b) => b.changePercent - a.changePercent) },
  { label: 'Value', icon: '💎', apply: (s) => s.filter((x) => x.changePercent < 0 && (x.marketCap ?? 0) > 50e9).sort((a, b) => a.changePercent - b.changePercent) },
  { label: 'Mega Caps', icon: '🏛️', apply: (s) => s.filter((x) => (x.marketCap ?? 0) > 200e9).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)) },
  { label: 'High Volume', icon: '📊', apply: (s) => [...s].sort((a, b) => b.volume - a.volume).slice(0, 15) },
];

type SortKey = 'symbol' | 'name' | 'price' | 'changePercent' | 'volume' | 'marketCap';
type SortDir = 'asc' | 'desc';

function formatPrice(p: number): string {
  return p >= 1 ? p.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }) : `$${p.toFixed(4)}`;
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

function formatMcap(v: number | null): string {
  if (!v) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

// Mini sparkline SVG
function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return <div className="w-16 h-6" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 64, h = 24;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={points} fill="none" stroke={up ? '#00D4AA' : '#FF4757'} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function exportCSV(stocks: ScreenerStock[]) {
  const header = 'Symbol,Name,Sector,Price,Change%,Volume,MarketCap\n';
  const rows = stocks.map((s) => `${s.symbol},${s.name.replace(/,/g, '')},${s.sector},${s.price},${s.changePercent.toFixed(2)},${s.volume},${s.marketCap ?? ''}`).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `screener-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Screener() {
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [sector, setSector] = useState('All');
  const [mcapIdx, setMcapIdx] = useState(0);
  const [changeFilter, setChangeFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    Promise.allSettled([
      api.getScreener().then(setStocks),
      api.getScreenerSparklines().then(setSparklines),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const toggleSort = (key: SortKey) => {
    setActivePreset(null);
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    if (activePreset) {
      const preset = PRESETS.find((p) => p.label === activePreset);
      return preset ? preset.apply([...stocks]) : stocks;
    }
    let result = [...stocks];
    if (sector !== 'All') result = result.filter((s) => s.sector === sector);
    const mcap = MCAP_FILTERS[mcapIdx];
    result = result.filter((s) => (s.marketCap ?? 0) >= mcap.min && (s.marketCap ?? 0) < mcap.max);
    if (changeFilter === 'Gainers') result = result.filter((s) => s.changePercent > 0);
    if (changeFilter === 'Losers') result = result.filter((s) => s.changePercent < 0);
    result.sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      if (typeof va === 'string' && typeof vb === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return result;
  }, [stocks, sector, mcapIdx, changeFilter, sortKey, sortDir, activePreset]);

  const SortHeader = ({ label, sortKeyProp, align = 'right' }: { label: string; sortKeyProp: SortKey; align?: string }) => (
    <th
      className={`py-2.5 px-3 text-xs text-slate-500 font-medium cursor-pointer hover:text-slate-300 transition-colors select-none ${align === 'left' ? 'text-left' : 'text-right'}`}
      onClick={() => toggleSort(sortKeyProp)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortKeyProp && !activePreset && (
          <ArrowUpDown size={10} className={`text-accent-cyan ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
        )}
      </span>
    </th>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Stock Screener</h1>
          <p className="text-slate-500 text-sm mt-0.5">{filtered.length} stocks{activePreset ? ` · ${activePreset} preset` : ` · sorted by ${sortKey}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportCSV(filtered)} className="btn-ghost flex items-center gap-1.5 text-xs">
            <Download size={12} /> CSV
          </button>
          <button onClick={fetchData} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Preset buttons */}
      <div className="flex items-center gap-2 mb-4">
        <Zap size={12} className="text-accent-yellow" />
        <span className="text-[10px] text-slate-500 font-mono uppercase">Presets</span>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => setActivePreset(activePreset === p.label ? null : p.label)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
              activePreset === p.label ? 'bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30' : 'text-slate-500 border-navy-600 hover:text-slate-300 hover:border-navy-500'
            }`}
          >{p.icon} {p.label}</button>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-slate-500" />
            <span className="text-[10px] text-slate-500 font-mono uppercase">Sector</span>
          </div>
          <div className="flex gap-1">
            {SECTORS.map((s) => (
              <button key={s} onClick={() => { setSector(s); setActivePreset(null); }}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${sector === s && !activePreset ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
              >{s}</button>
            ))}
          </div>
          <div className="h-4 w-px bg-navy-600" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 font-mono uppercase">Mkt Cap</span>
            <select className="bg-navy-700 border border-navy-500 rounded px-2 py-1 text-xs text-slate-300 outline-none font-mono" value={mcapIdx} onChange={(e) => { setMcapIdx(Number(e.target.value)); setActivePreset(null); }}>
              {MCAP_FILTERS.map((m, i) => <option key={i} value={i}>{m.label}</option>)}
            </select>
          </div>
          <div className="h-4 w-px bg-navy-600" />
          <div className="flex gap-1">
            {CHANGE_FILTERS.map((c) => (
              <button key={c} onClick={() => { setChangeFilter(c); setActivePreset(null); }}
                className={`px-2 py-1 rounded text-xs font-mono transition-all ${changeFilter === c && !activePreset ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
              >{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-flex items-center gap-2 text-accent-cyan text-sm font-mono">
              <div className="w-4 h-4 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
              Loading screener…
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600">
                <SortHeader label="Symbol" sortKeyProp="symbol" align="left" />
                <SortHeader label="Name" sortKeyProp="name" align="left" />
                <th className="py-2.5 px-3 text-xs text-slate-500 font-medium text-left">Sector</th>
                <th className="py-2.5 px-3 text-xs text-slate-500 font-medium text-center">5D Chart</th>
                <SortHeader label="Price" sortKeyProp="price" />
                <SortHeader label="% Change" sortKeyProp="changePercent" />
                <SortHeader label="Volume" sortKeyProp="volume" />
                <SortHeader label="Market Cap" sortKeyProp="marketCap" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const up = s.changePercent >= 0;
                const spark = sparklines[s.symbol] || [];
                return (
                  <tr key={s.symbol} className="border-b border-navy-700 hover:bg-navy-700/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-accent-cyan">{s.symbol}</td>
                    <td className="py-3 px-3 text-slate-300 truncate max-w-[160px]">{s.name}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-navy-600 text-slate-400">{s.sector}</span>
                    </td>
                    <td className="py-3 px-3">
                      <Sparkline data={spark} up={up} />
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-white">{formatPrice(s.price)}</td>
                    <td className="py-3 px-3 text-right">
                      <span className={up ? 'badge-up' : 'badge-down'}>{up ? '+' : ''}{s.changePercent.toFixed(2)}%</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400 text-xs">{formatVolume(s.volume)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">{formatMcap(s.marketCap)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-slate-500 text-sm">No stocks match filters</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
