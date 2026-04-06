import { useState } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, BarChart2 } from 'lucide-react';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import type { MarketIndex } from '../types';

const ICON_MAP: Record<string, string> = {
  '^GSPC': 'S&P',
  '^IXIC': 'NDX',
  '^DJI': 'DJI',
  'BTC-USD': '₿',
};

function IndexCard({ idx }: { idx: MarketIndex }) {
  const up = idx.changePercent >= 0;
  return (
    <div className="card animate-fade-in hover:border-navy-500 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
            {ICON_MAP[idx.symbol] || idx.symbol}
          </div>
          <div className="text-slate-300 font-medium text-sm mt-0.5">{idx.label}</div>
        </div>
        <span className={up ? 'badge-up' : 'badge-down'}>
          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {up ? '+' : ''}
          {idx.changePercent.toFixed(2)}%
        </span>
      </div>

      <div className="text-2xl font-mono font-bold text-white">
        {idx.symbol === 'BTC-USD'
          ? `$${idx.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
          : idx.price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}
      </div>

      <div className={`text-sm font-mono mt-1 ${up ? 'text-accent-green' : 'text-accent-red'}`}>
        {up ? '+' : ''}
        {idx.change.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}
      </div>

      {(idx.dayHigh || idx.dayLow) && (
        <div className="mt-3 pt-3 border-t border-navy-600 flex justify-between text-xs text-slate-500 font-mono">
          <span>L: {idx.dayLow?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}</span>
          <span>H: {idx.dayHigh?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}</span>
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="h-3 w-12 bg-navy-600 rounded mb-3" />
      <div className="h-6 w-32 bg-navy-600 rounded mb-2" />
      <div className="h-4 w-20 bg-navy-700 rounded" />
    </div>
  );
}

export default function MarketOverview() {
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const data = await api.getMarketOverview();
      setIndices(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  usePolling(fetchData, 30_000);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Market Overview</h1>
          <p className="text-slate-500 text-sm mt-0.5">Global indices & crypto</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
              <RefreshCw size={10} className="animate-spin-slow" />
              {lastUpdated.toLocaleTimeString()}
            </div>
          )}
          <button onClick={fetchData} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-accent-red/30 bg-accent-red/5 text-accent-red text-sm mb-4">
          {error} — make sure the backend is running at localhost:3001
        </div>
      )}

      {/* Index cards grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : indices.map((idx) => <IndexCard key={idx.symbol} idx={idx} />)}
      </div>

      {/* Market Stats Row */}
      {!loading && indices.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={14} className="text-accent-cyan" />
            <h2 className="text-sm font-semibold text-slate-300">Market Stats</h2>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-600">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium text-xs">Market</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium text-xs">Price</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium text-xs">Change</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium text-xs">% Change</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium text-xs">Volume</th>
                </tr>
              </thead>
              <tbody>
                {indices.map((idx) => {
                  const up = idx.changePercent >= 0;
                  return (
                    <tr key={idx.symbol} className="border-b border-navy-700 hover:bg-navy-700/50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-medium text-white">{idx.label}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{idx.symbol}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-white">
                        {idx.price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono ${up ? 'text-accent-green' : 'text-accent-red'}`}>
                        {up ? '+' : ''}{idx.change.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className={up ? 'badge-up' : 'badge-down'}>
                          {up ? '+' : ''}{idx.changePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400 text-xs">
                        {idx.volume > 1_000_000_000
                          ? `${(idx.volume / 1_000_000_000).toFixed(2)}B`
                          : idx.volume > 1_000_000
                          ? `${(idx.volume / 1_000_000).toFixed(2)}M`
                          : idx.volume.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
