import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Clock, X, TrendingUp, Monitor, Briefcase, BarChart2, Globe, Newspaper, Calendar, Bell, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store';
import type { SearchResult } from '../types';

const TYPE_COLORS: Record<string, string> = {
  EQUITY: 'text-accent-cyan', CRYPTOCURRENCY: 'text-accent-yellow', INDEX: 'text-purple-400',
  ETF: 'text-blue-400', FUTURE: 'text-orange-400', COMMODITY: 'text-orange-400',
};

const PAGE_COMMANDS = [
  { label: 'Go to Terminal', path: '/terminal', Icon: Monitor, keywords: 'terminal chart' },
  { label: 'Go to Portfolio', path: '/portfolio', Icon: Briefcase, keywords: 'portfolio positions' },
  { label: 'Go to Screener', path: '/screener', Icon: BarChart2, keywords: 'screener filter stocks' },
  { label: 'Go to Markets', path: '/markets', Icon: Globe, keywords: 'markets overview sectors' },
  { label: 'Go to News', path: '/news', Icon: Newspaper, keywords: 'news headlines' },
  { label: 'Go to Calendar', path: '/calendar', Icon: Calendar, keywords: 'calendar economic events' },
];

function ClearbitLogo({ name, symbol }: { name: string; symbol: string }) {
  const [failed, setFailed] = useState(false);
  const domain = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)[0] + '.com';
  if (failed) return <div className="w-6 h-6 rounded bg-navy-600 flex items-center justify-center text-[9px] font-mono font-bold text-slate-400">{symbol.slice(0, 2)}</div>;
  return <img src={`https://logo.clearbit.com/${domain}`} alt="" className="w-6 h-6 rounded object-contain bg-white" onError={() => setFailed(true)} />;
}

export default function SearchModal() {
  const navigate = useNavigate();
  const { searchOpen, setSearchOpen, setSelectedTicker, addRecentSearch, recentSearches, addAlert } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (searchOpen) { setQuery(''); setResults([]); setActiveIdx(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [searchOpen]);

  const doSearch = useCallback((q: string) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try { const res = await api.search(q); setResults(res.slice(0, 6)); setActiveIdx(0); }
      catch { setResults([]); }
      finally { setLoading(false); }
    }, 200);
  }, []);

  const selectResult = (symbol: string) => { setSelectedTicker(symbol.toUpperCase()); addRecentSearch(symbol.toUpperCase()); setSearchOpen(false); navigate('/terminal'); };

  // Check for page navigation commands
  const isAlertCmd = query.toLowerCase().startsWith('alert ');
  const matchingPages = query.trim() ? PAGE_COMMANDS.filter((p) => p.label.toLowerCase().includes(query.toLowerCase()) || p.keywords.includes(query.toLowerCase())) : [];

  // Parse alert command: "alert AAPL > 270" or "alert AAPL < 250"
  const parseAlert = () => {
    const match = query.match(/^alert\s+(\S+)\s*(>|<|above|below)\s*\$?(\d+\.?\d*)/i);
    if (!match) return null;
    return { ticker: match[1].toUpperCase(), condition: (match[2] === '>' || match[2].toLowerCase() === 'above') ? 'above' as const : 'below' as const, price: parseFloat(match[3]) };
  };

  const allItems: Array<{ type: 'page' | 'ticker' | 'recent' | 'alert'; data: any }> = [];
  if (isAlertCmd) {
    const parsed = parseAlert();
    if (parsed) allItems.push({ type: 'alert', data: parsed });
  }
  matchingPages.forEach((p) => allItems.push({ type: 'page', data: p }));
  if (query.trim() && !isAlertCmd) results.forEach((r) => allItems.push({ type: 'ticker', data: r }));
  if (!query.trim()) recentSearches.forEach((s) => allItems.push({ type: 'recent', data: s }));

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setSearchOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, allItems.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && allItems[activeIdx]) {
      const item = allItems[activeIdx];
      if (item.type === 'page') { navigate(item.data.path); setSearchOpen(false); }
      else if (item.type === 'ticker') selectResult(item.data.symbol);
      else if (item.type === 'recent') selectResult(item.data);
      else if (item.type === 'alert') { addAlert({ ticker: item.data.ticker, condition: item.data.condition, price: item.data.price, active: true }); setSearchOpen(false); }
    }
  };

  if (!searchOpen) return null;

  return (
    <div className="modal-backdrop" onClick={() => setSearchOpen(false)}>
      <div className="w-full max-w-lg bg-navy-800 border border-navy-500 rounded-2xl shadow-2xl overflow-hidden animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-navy-600">
          <Search size={16} className="text-slate-500 shrink-0" />
          <input ref={inputRef} className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none font-mono"
            placeholder="Search tickers, pages… (try 'alert AAPL > 270')"
            value={query} onChange={(e) => { setQuery(e.target.value); doSearch(e.target.value); }} onKeyDown={handleKey}
          />
          {loading && <div className="w-3.5 h-3.5 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin shrink-0" />}
          <button onClick={() => setSearchOpen(false)} className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"><X size={14} /></button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {allItems.length === 0 && !loading && query.trim() && <div className="py-8 text-center text-slate-500 text-sm">No results for "{query}"</div>}
          {allItems.length === 0 && !query.trim() && recentSearches.length === 0 && (
            <div className="py-4 px-4"><div className="text-[10px] text-slate-600 font-mono uppercase tracking-widest mb-2">Try</div>
              <div className="text-slate-500 text-xs space-y-1">
                <p className="font-mono">"AAPL" — search tickers</p><p className="font-mono">"portfolio" — navigate pages</p><p className="font-mono">"alert TSLA &gt; 300" — set price alert</p>
              </div>
            </div>
          )}

          <div className="py-2">
            {allItems.map((item, i) => {
              const active = activeIdx === i;
              if (item.type === 'alert') {
                const d = item.data;
                return (
                  <button key={`alert-${i}`} onMouseDown={() => { addAlert({ ticker: d.ticker, condition: d.condition, price: d.price, active: true }); setSearchOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-navy-700 text-left transition-colors ${active ? 'bg-navy-700' : ''}`}>
                    <Bell size={14} className="text-accent-yellow shrink-0" />
                    <span className="text-sm text-slate-300">Set alert: <span className="text-accent-cyan font-mono font-bold">{d.ticker}</span> {d.condition === 'above' ? '>' : '<'} <span className="text-white font-mono">${d.price}</span></span>
                    <ArrowRight size={12} className="ml-auto text-slate-600" />
                  </button>
                );
              }
              if (item.type === 'page') {
                const p = item.data;
                return (
                  <button key={p.path} onMouseDown={() => { navigate(p.path); setSearchOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-navy-700 text-left transition-colors ${active ? 'bg-navy-700' : ''}`}>
                    <p.Icon size={14} className="text-accent-cyan shrink-0" />
                    <span className="text-sm text-slate-300">{p.label}</span>
                    <ArrowRight size={12} className="ml-auto text-slate-600" />
                  </button>
                );
              }
              if (item.type === 'ticker') {
                const r = item.data;
                return (
                  <button key={r.symbol} onMouseDown={() => selectResult(r.symbol)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-navy-700 text-left transition-colors ${active ? 'bg-navy-700' : ''}`}>
                    {['EQUITY', 'ETF'].includes(r.type) ? <ClearbitLogo name={r.name} symbol={r.symbol} /> :
                      <div className="w-6 h-6 rounded bg-navy-600 flex items-center justify-center"><TrendingUp size={10} className={TYPE_COLORS[r.type] || 'text-slate-400'} /></div>}
                    <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="font-mono font-bold text-accent-cyan text-sm">{r.symbol}</span>{r.exchange && <span className="text-[9px] font-mono text-slate-600 uppercase">{r.exchange}</span>}</div><div className="text-slate-400 text-xs truncate">{r.name}</div></div>
                    <span className={`text-[10px] font-mono uppercase shrink-0 ${TYPE_COLORS[r.type] || 'text-slate-500'}`}>{r.type}</span>
                  </button>
                );
              }
              if (item.type === 'recent') {
                return (
                  <button key={item.data} onMouseDown={() => selectResult(item.data)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-navy-700 text-left transition-colors ${active ? 'bg-navy-700' : ''}`}>
                    <Clock size={12} className="text-slate-600 shrink-0" /><span className="font-mono font-bold text-accent-cyan text-sm">{item.data}</span>
                  </button>
                );
              }
              return null;
            })}
          </div>
        </div>

        <div className="px-4 py-2 border-t border-navy-700 flex items-center gap-4 text-[10px] text-slate-600 font-mono">
          <span><kbd className="bg-navy-600 px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="bg-navy-600 px-1 rounded">↵</kbd> select</span>
          <span><kbd className="bg-navy-600 px-1 rounded">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
