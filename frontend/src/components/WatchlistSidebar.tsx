import { useEffect, useRef, useState } from 'react';
import { Plus, X, Star } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store';
import type { Quote } from '../types';

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export default function WatchlistSidebar() {
  const { watchlist, setWatchlist, selectedTicker, setSelectedTicker } = useAppStore();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState('');
  const prevQuotesRef = useRef<Record<string, Quote>>({});
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down' | null>>({});

  useEffect(() => {
    if (watchlist.length === 0) return;
    const fetch = () =>
      api.getMultiQuote(watchlist).then((data) => {
        const map: Record<string, Quote> = {};
        const flashes: Record<string, 'up' | 'down' | null> = {};
        data.forEach((q) => {
          map[q.symbol] = q;
          const prev = prevQuotesRef.current[q.symbol];
          if (prev && q.price !== prev.price) {
            flashes[q.symbol] = q.price > prev.price ? 'up' : 'down';
          }
        });
        prevQuotesRef.current = map;
        setQuotes(map);
        if (Object.keys(flashes).length > 0) {
          setFlashMap(flashes);
          setTimeout(() => setFlashMap({}), 700);
        }
      }).catch(() => {});

    fetch();
    const id = setInterval(fetch, 10_000);
    return () => clearInterval(id);
  }, [watchlist]);

  const addSymbol = () => {
    const sym = input.toUpperCase().trim();
    if (!sym || watchlist.includes(sym)) { setInput(''); setAdding(false); return; }
    setWatchlist((prev) => [...prev, sym]);
    setInput('');
    setAdding(false);
  };

  const removeSymbol = (sym: string) => {
    setWatchlist((prev) => prev.filter((s) => s !== sym));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-navy-600">
        <div className="flex items-center gap-1.5">
          <Star size={11} className="text-accent-yellow" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Watchlist</span>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-slate-600 hover:text-accent-cyan transition-colors p-0.5"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Add input */}
      {adding && (
        <div className="px-2 py-2 border-b border-navy-600">
          <input
            autoFocus
            className="input-field text-xs py-1.5"
            placeholder="Symbol (TSLA, SOL-USD…)"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addSymbol();
              if (e.key === 'Escape') { setAdding(false); setInput(''); }
            }}
          />
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {watchlist.length === 0 && (
          <div className="text-slate-600 text-xs text-center py-6">Empty watchlist</div>
        )}
        {watchlist.map((sym) => {
          const q = quotes[sym];
          const up = q ? q.changePercent >= 0 : true;
          const active = sym === selectedTicker;
          const flash = flashMap[sym];

          return (
            <button
              key={sym}
              onClick={() => setSelectedTicker(sym)}
              className={`w-full flex items-center justify-between px-3 py-2 group transition-colors text-left
                ${active ? 'bg-accent-cyan/8 border-l-2 border-accent-cyan' : 'border-l-2 border-transparent hover:bg-navy-700/50'}
                ${flash === 'up' ? 'flash-green' : flash === 'down' ? 'flash-red' : ''}
              `}
            >
              <div className="min-w-0">
                <div className={`font-mono font-bold text-xs ${active ? 'text-accent-cyan' : 'text-slate-300'}`}>
                  {sym}
                </div>
                {q && q.name !== sym && (
                  <div className="text-[10px] text-slate-600 truncate max-w-[110px]">{q.name}</div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {q && !q.error ? (
                  <>
                    <span className="font-mono text-xs text-white">{formatPrice(q.price)}</span>
                    <span className={`text-[10px] font-mono ${up ? 'text-accent-green' : 'text-accent-red'}`}>
                      {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <span className="text-slate-600 text-[10px]">—</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeSymbol(sym); }}
                  className="text-slate-700 hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all p-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
