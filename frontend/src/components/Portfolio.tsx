import { useState, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Plus, Trash2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { api } from '../api/client';
import { usePositions } from '../hooks/usePositions';
import { usePolling } from '../hooks/usePolling';
import type { PortfolioPosition, Quote } from '../types';

const COLORS = [
  '#00D4FF', '#00FF88', '#FFD700', '#FF6B6B', '#A855F7',
  '#F97316', '#EC4899', '#14B8A6', '#84CC16', '#EF4444',
];

function formatCurrency(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

interface PositionWithQuote extends PortfolioPosition {
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
  name: string;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-navy-800 border border-navy-500 rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
        <div className="text-white font-bold">{d.symbol}</div>
        <div className="text-slate-400">{formatCurrency(d.value)}</div>
        <div className="text-slate-400">{d.pct.toFixed(1)}%</div>
      </div>
    );
  }
  return null;
};

export default function Portfolio() {
  const { positions, addPosition, removePosition } = usePositions();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);

  // Add form state
  const [formSymbol, setFormSymbol] = useState('');
  const [formShares, setFormShares] = useState('');
  const [formAvgPrice, setFormAvgPrice] = useState('');
  const [formError, setFormError] = useState('');

  const fetchQuotes = async () => {
    if (positions.length === 0) return;
    setLoading(true);
    try {
      const data = await api.getMultiQuote(positions.map((p) => p.symbol));
      const map: Record<string, Quote> = {};
      data.forEach((q) => { map[q.symbol] = q; });
      setQuotes(map);
    } catch {
      // Fail silently
    } finally {
      setLoading(false);
    }
  };

  usePolling(fetchQuotes, 30_000, positions.length > 0);
  useEffect(() => { fetchQuotes(); }, [positions.length]);

  const handleAdd = () => {
    const sym = formSymbol.toUpperCase().trim();
    const shares = parseFloat(formShares);
    const avg = parseFloat(formAvgPrice);

    if (!sym) return setFormError('Symbol required');
    if (isNaN(shares) || shares <= 0) return setFormError('Enter valid shares');
    if (isNaN(avg) || avg <= 0) return setFormError('Enter valid price');

    setFormError('');
    addPosition(sym, shares, avg);
    setFormSymbol('');
    setFormShares('');
    setFormAvgPrice('');
  };

  // Compute enriched positions
  const enriched: PositionWithQuote[] = positions.map((p) => {
    const q = quotes[p.symbol];
    const currentPrice = q?.price ?? p.avgPrice;
    const currentValue = currentPrice * p.shares;
    const costBasis = p.avgPrice * p.shares;
    const pnl = currentValue - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return {
      ...p,
      currentPrice,
      currentValue,
      costBasis,
      pnl,
      pnlPct,
      name: q?.name ?? p.symbol,
    };
  });

  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
  const totalCost = enriched.reduce((s, p) => s + p.costBasis, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const pieData = enriched.map((p, i) => ({
    symbol: p.symbol,
    value: p.currentValue,
    pct: totalValue > 0 ? (p.currentValue / totalValue) * 100 : 0,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Portfolio</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track your positions & P&L</p>
        </div>
      </div>

      {/* Summary cards */}
      {enriched.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card">
            <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total Value</div>
            <div className="text-xl font-mono font-bold text-white">{formatCurrency(totalValue)}</div>
          </div>
          <div className="card">
            <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Total P&L</div>
            <div className={`text-xl font-mono font-bold ${totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {formatCurrency(totalPnl)}
            </div>
          </div>
          <div className="card">
            <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Return</div>
            <div className={`text-xl font-mono font-bold flex items-center gap-1.5 ${totalPnlPct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {totalPnlPct >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              {formatPct(totalPnlPct)}
            </div>
          </div>
        </div>
      )}

      <div className={`grid gap-6 ${enriched.length > 0 ? 'grid-cols-[1fr_280px]' : 'grid-cols-1'}`}>
        {/* Left: Add form + table */}
        <div className="space-y-4">
          {/* Add position form */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Plus size={14} className="text-accent-cyan" />
              <h2 className="text-sm font-semibold text-slate-300">Add Position</h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              <input
                className="input-field w-28"
                placeholder="Symbol"
                value={formSymbol}
                onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <input
                className="input-field w-28"
                placeholder="Shares"
                type="number"
                min="0"
                step="any"
                value={formShares}
                onChange={(e) => setFormShares(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <input
                className="input-field w-36"
                placeholder="Avg Price $"
                type="number"
                min="0"
                step="any"
                value={formAvgPrice}
                onChange={(e) => setFormAvgPrice(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <button onClick={handleAdd} className="btn-primary flex items-center gap-1.5">
                <Plus size={14} />
                Add
              </button>
            </div>
            {formError && <p className="text-accent-red text-xs mt-2 font-mono">{formError}</p>}
          </div>

          {/* Positions table */}
          {enriched.length > 0 ? (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-600">
                    {['Symbol', 'Shares', 'Avg Cost', 'Current', 'Value', 'P&L', '%', ''].map((h) => (
                      <th key={h} className={`py-2.5 px-3 text-xs text-slate-500 font-medium ${h === 'Symbol' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((p) => (
                    <tr key={p.symbol} className="border-b border-navy-700 hover:bg-navy-700/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-accent-cyan">{p.symbol}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[120px]">{p.name}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">{p.shares.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">{formatCurrency(p.avgPrice)}</td>
                      <td className="py-3 px-3 text-right font-mono text-white">{formatCurrency(p.currentPrice)}</td>
                      <td className="py-3 px-3 text-right font-mono text-white">{formatCurrency(p.currentValue)}</td>
                      <td className={`py-3 px-3 text-right font-mono ${p.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {p.pnl >= 0 ? '+' : ''}{formatCurrency(p.pnl)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className={p.pnl >= 0 ? 'badge-up' : 'badge-down'}>{formatPct(p.pnlPct)}</span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => removePosition(p.symbol)}
                          className="text-slate-600 hover:text-accent-red transition-colors p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center py-12 text-center">
              <DollarSign size={32} className="text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">No positions yet.</p>
              <p className="text-slate-600 text-xs mt-1">Add a ticker above to get started.</p>
            </div>
          )}
        </div>

        {/* Right: Pie chart */}
        {enriched.length > 0 && (
          <div className="space-y-4">
            <div className="card">
              <div className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-widest">Allocation</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.symbol} fill={entry.fill} opacity={0.9} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pieData.map((d) => (
                  <div key={d.symbol} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                      <span className="font-mono text-slate-300">{d.symbol}</span>
                    </div>
                    <span className="font-mono text-slate-500">{d.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
