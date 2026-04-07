import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, Briefcase, X } from 'lucide-react';
import { api } from '../api/client';
import { usePositions } from '../hooks/usePositions';
import type { Quote, PortfolioPosition } from '../types';

const COLORS = ['#00D4FF', '#00D4AA', '#FFD700', '#FF4757', '#A855F7', '#F97316', '#EC4899'];

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

interface PositionWithQuote extends PortfolioPosition {
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-navy-800 border border-navy-500 rounded px-2 py-1 text-[10px] font-mono shadow-xl">
      <div className="text-white font-bold">{d.symbol}</div>
      <div className="text-slate-400">{d.pct.toFixed(1)}%</div>
    </div>
  );
};

export default function PortfolioSidebar() {
  const { positions, addPosition, removePosition } = usePositions();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [showForm, setShowForm] = useState(false);
  const [sym, setSym] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (positions.length === 0) return;
    const fetch = () =>
      api.getMultiQuote(positions.map((p) => p.symbol)).then((data) => {
        const map: Record<string, Quote> = {};
        data.forEach((q) => { map[q.symbol] = q; });
        setQuotes(map);
      }).catch(() => {});
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [positions.length]);

  const handleAdd = () => {
    const s = sym.toUpperCase().trim();
    const sh = parseFloat(shares);
    const pr = parseFloat(price);
    if (!s || isNaN(sh) || sh <= 0 || isNaN(pr) || pr <= 0) return;
    addPosition(s, sh, pr);
    setSym(''); setShares(''); setPrice('');
    setShowForm(false);
  };

  const enriched: PositionWithQuote[] = positions.map((p) => {
    const q = quotes[p.symbol];
    const currentPrice = q?.price ?? p.avgPrice;
    const currentValue = currentPrice * p.shares;
    const costBasis = p.avgPrice * p.shares;
    return { ...p, currentPrice, currentValue, costBasis, pnl: currentValue - costBasis, pnlPct: costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0 };
  });

  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
  const totalCost  = enriched.reduce((s, p) => s + p.costBasis, 0);
  const totalPnl   = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const pieData = enriched.map((p, i) => ({
    symbol: p.symbol,
    value: p.currentValue,
    pct: totalValue > 0 ? (p.currentValue / totalValue) * 100 : 0,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-navy-600">
        <div className="flex items-center gap-1.5">
          <Briefcase size={11} className="text-accent-cyan" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Portfolio</span>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="text-slate-600 hover:text-accent-cyan transition-colors p-0.5">
          <Plus size={13} />
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="px-2 py-2 border-b border-navy-600 space-y-1.5">
          <input className="input-field text-xs py-1.5" placeholder="Symbol" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <input className="input-field text-xs py-1.5" placeholder="Shares" type="number" min="0" step="any" value={shares} onChange={(e) => setShares(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <input className="input-field text-xs py-1.5" placeholder="Avg Price" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <div className="flex gap-1.5">
            <button onClick={handleAdd} className="flex-1 btn-primary text-xs py-1">Add</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost text-xs py-1"><X size={12} /></button>
          </div>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="text-slate-600 text-xs text-center py-4 px-3">No positions — click + to add</div>
      ) : (
        <>
          {/* Summary */}
          <div className="px-3 py-2 border-b border-navy-600">
            <div className="text-[10px] text-slate-500 font-mono">Total Value</div>
            <div className="text-sm font-mono font-bold text-white">{formatCurrency(totalValue)}</div>
            <div className={`text-xs font-mono ${totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)} ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)
            </div>
          </div>

          {/* Donut */}
          {pieData.length > 0 && (
            <div className="px-2 py-2 border-b border-navy-600">
              <ResponsiveContainer width="100%" height={90}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={42} paddingAngle={2} dataKey="value">
                    {pieData.map((entry) => (
                      <Cell key={entry.symbol} fill={entry.fill} opacity={0.85} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {pieData.map((d) => (
                  <div key={d.symbol} className="flex items-center justify-between text-[10px] font-mono">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                      <span className="text-slate-400">{d.symbol}</span>
                    </div>
                    <span className="text-slate-600">{d.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Positions */}
          <div className="overflow-y-auto">
            {enriched.map((p) => (
              <div key={p.symbol} className="flex items-center justify-between px-3 py-2 border-b border-navy-700 group">
                <div className="min-w-0">
                  <div className="font-mono font-bold text-xs text-accent-cyan">{p.symbol}</div>
                  <div className="text-[10px] text-slate-600">{p.shares} sh</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-white">{formatCurrency(p.currentValue)}</div>
                  <div className={`text-[10px] font-mono ${p.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {p.pnl >= 0 ? '+' : ''}{p.pnlPct.toFixed(2)}%
                  </div>
                </div>
                <button
                  onClick={() => removePosition(p.symbol)}
                  className="text-slate-700 hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all ml-1 p-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
