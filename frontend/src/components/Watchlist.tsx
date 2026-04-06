import { useState } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, Star, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { usePolling } from '../hooks/usePolling';
import type { Quote } from '../types';

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'BTC-USD', 'ETH-USD'];

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toString();
}

function formatPrice(p: number) {
  if (p >= 1) return p.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  return `$${p.toFixed(6)}`;
}

export default function Watchlist() {
  const [symbols, setSymbols] = useLocalStorage<string[]>('watchlist_symbols', DEFAULT_SYMBOLS);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    if (symbols.length === 0) return;
    setLoading(true);
    try {
      const data = await api.getMultiQuote(symbols);
      const map: Record<string, Quote> = {};
      data.forEach((q) => { map[q.symbol] = q; });
      setQuotes(map);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  usePolling(fetchAll, 30_000, symbols.length > 0);

  const addSymbol = () => {
    const sym = inputVal.toUpperCase().trim();
    if (!sym) return;
    if (symbols.includes(sym)) { setInputVal(''); return; }
    setSymbols((prev) => [...prev, sym]);
    setInputVal('');
  };

  const removeSymbol = (sym: string) => {
    setSymbols((prev) => prev.filter((s) => s !== sym));
    setQuotes((prev) => {
      const copy = { ...prev };
      delete copy[sym];
      return copy;
    });
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Watchlist</h1>
          <p className="text-slate-500 text-sm mt-0.5">Live prices — updates every 30s</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-500 font-mono">
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" />
                  Updating…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-accent-green" />
                  {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </span>
          )}
          <button onClick={fetchAll} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-accent-red/30 bg-accent-red/5 text-accent-red text-sm mb-4">
          {error} — ensure backend is running at localhost:3001
        </div>
      )}

      {/* Add symbol */}
      <div className="card mb-4">
        <div className="flex gap-2">
          <input
            className="input-field flex-1"
            placeholder="Add symbol (e.g. TSLA, NVDA, SOL-USD)"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
          />
          <button onClick={addSymbol} className="btn-primary flex items-center gap-1.5">
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {/* Watchlist table */}
      {symbols.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Star size={32} className="text-slate-700 mb-3" />
          <p className="text-slate-500 text-sm">Your watchlist is empty.</p>
          <p className="text-slate-600 text-xs mt-1">Add symbols above to track live prices.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600">
                <th className="text-left py-3 px-4 text-xs text-slate-500 font-medium">Symbol</th>
                <th className="text-right py-3 px-4 text-xs text-slate-500 font-medium">Price</th>
                <th className="text-right py-3 px-4 text-xs text-slate-500 font-medium">Change</th>
                <th className="text-right py-3 px-4 text-xs text-slate-500 font-medium">% Change</th>
                <th className="text-right py-3 px-4 text-xs text-slate-500 font-medium">Volume</th>
                <th className="text-right py-3 px-4 text-xs text-slate-500 font-medium">Day Range</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {symbols.map((sym) => {
                const q = quotes[sym];
                const up = q ? q.changePercent >= 0 : true;
                const hasData = !!q && !q.error;

                return (
                  <tr key={sym} className="border-b border-navy-700 hover:bg-navy-700/40 transition-colors group">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${hasData ? (up ? 'bg-accent-green' : 'bg-accent-red') : 'bg-slate-600'}`} />
                        <div>
                          <div className="font-mono font-bold text-accent-cyan">{sym}</div>
                          {hasData && q.name !== sym && (
                            <div className="text-[11px] text-slate-500 truncate max-w-[160px]">{q.name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {hasData ? (
                        <span className="font-mono font-medium text-white">{formatPrice(q.price)}</span>
                      ) : (
                        <span className="text-slate-600 font-mono text-xs animate-pulse">Loading…</span>
                      )}
                    </td>
                    <td className={`py-3.5 px-4 text-right font-mono ${hasData ? (up ? 'text-accent-green' : 'text-accent-red') : 'text-slate-600'}`}>
                      {hasData ? `${up ? '+' : ''}${q.change.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {hasData ? (
                        <span className={up ? 'badge-up' : 'badge-down'}>
                          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-slate-600 font-mono text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-400 text-xs">
                      {hasData ? formatVolume(q.volume) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-500">
                      {hasData && q.dayLow && q.dayHigh ? (
                        <span>{formatPrice(q.dayLow)} – {formatPrice(q.dayHigh)}</span>
                      ) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => removeSymbol(sym)}
                        className="text-slate-700 hover:text-accent-red transition-colors opacity-0 group-hover:opacity-100 p-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Market cap summary for tracked symbols */}
      {Object.values(quotes).some((q) => q.marketCap) && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {symbols
            .filter((s) => quotes[s]?.marketCap)
            .map((sym) => {
              const q = quotes[sym]!;
              const up = q.changePercent >= 0;
              const mcap = q.marketCap!;
              const mcapStr =
                mcap >= 1e12
                  ? `$${(mcap / 1e12).toFixed(2)}T`
                  : mcap >= 1e9
                  ? `$${(mcap / 1e9).toFixed(1)}B`
                  : `$${(mcap / 1e6).toFixed(0)}M`;
              return (
                <div key={sym} className="card py-3">
                  <div className="text-[10px] text-slate-500 font-mono uppercase mb-1">{sym}</div>
                  <div className="text-xs text-slate-400">Market Cap</div>
                  <div className="font-mono font-bold text-white text-sm">{mcapStr}</div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
