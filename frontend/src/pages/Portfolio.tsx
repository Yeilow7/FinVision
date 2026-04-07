import { useState, useEffect, useRef, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, Trash2, TrendingUp, TrendingDown, DollarSign, X, Activity } from 'lucide-react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';
import { api } from '../api/client';
import { usePositions } from '../hooks/usePositions';
import type { Quote, PortfolioPosition, PortfolioAnalytics, Timeframe, OHLCBar } from '../types';

const COLORS = ['#00D4FF', '#00D4AA', '#FFD700', '#FF4757', '#A855F7', '#F97316', '#EC4899', '#14B8A6', '#84CC16', '#EF4444'];

function fmt$(n: number): string { return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }); }
function fmtPct(n: number): string { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`; }

interface Enriched extends PortfolioPosition {
  currentPrice: number; currentValue: number; costBasis: number; pnl: number; pnlPct: number; name: string; weight: number;
}

const PieTooltipC = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <div className="bg-navy-800 border border-navy-500 rounded-lg px-3 py-2 text-xs font-mono shadow-xl"><div className="text-white font-bold">{d.symbol}</div><div className="text-slate-400">{fmt$(d.value)} · {d.pct.toFixed(1)}%</div></div>;
};

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card">
      <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-lg font-mono font-bold ${color || 'text-white'}`}>{value}</div>
      {sub && <div className="text-[10px] font-mono text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Performance chart with timeframe selector ─────────────────────────────

const PERF_TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y'];

const BENCHMARKS = [
  { symbol: 'SPY',   label: 'S&P 500' },
  { symbol: 'QQQ',   label: 'NASDAQ' },
  { symbol: '^IPSA', label: 'IPSA' },
];

interface PerfData {
  points: { time: any; value: number }[];
  startValue: number;
  endValue: number;
}

function normalize(points: { time: any; value: number }[]): { time: any; value: number }[] {
  if (points.length === 0) return [];
  const base = points[0].value;
  if (base === 0) return points;
  return points.map((p) => ({ time: p.time, value: (p.value / base) * 100 }));
}

function PerformanceChart({ positions }: { positions: PortfolioPosition[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const [benchmarkIdx, setBenchmarkIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [perfData, setPerfData] = useState<PerfData | null>(null);
  const [benchData, setBenchData] = useState<PerfData | null>(null);

  const fetchAll = useCallback(async (tf: Timeframe) => {
    if (positions.length === 0) return;
    setLoading(true);
    setPerfData(null);
    setBenchData(null);

    try {
      const benchSymbol = BENCHMARKS[benchmarkIdx].symbol;
      const [posResults, benchBars] = await Promise.all([
        Promise.allSettled(positions.map((p) => api.getHistory(p.symbol, tf))),
        api.getHistory(benchSymbol, tf).catch(() => [] as OHLCBar[]),
      ]);

      let baseBars: OHLCBar[] = [];
      posResults.forEach((h) => {
        if (h.status === 'fulfilled' && h.value.length > baseBars.length) baseBars = h.value;
      });
      if (baseBars.length < 2) { setLoading(false); return; }

      const closeMaps = new Map<number, Record<string, number>>();
      positions.forEach((pos, pIdx) => {
        const h = posResults[pIdx];
        if (h.status !== 'fulfilled') return;
        h.value.forEach((bar: OHLCBar) => {
          const entry = closeMaps.get(bar.time) ?? {};
          entry[pos.symbol] = bar.close;
          closeMaps.set(bar.time, entry);
        });
      });

      const lastKnown: Record<string, number> = {};
      positions.forEach((p) => { lastKnown[p.symbol] = p.avgPrice; });

      const points: { time: any; value: number }[] = [];
      baseBars.forEach((bar) => {
        const snap = closeMaps.get(bar.time);
        let totalVal = 0;
        positions.forEach((pos) => {
          const close = snap?.[pos.symbol] ?? lastKnown[pos.symbol];
          lastKnown[pos.symbol] = close;
          totalVal += close * pos.shares;
        });
        points.push({ time: bar.time as any, value: totalVal });
      });

      if (points.length >= 2) {
        setPerfData({ points, startValue: points[0].value, endValue: points[points.length - 1].value });
      }

      if (benchBars.length >= 2) {
        const bPoints = benchBars.map((b) => ({ time: b.time as any, value: b.close }));
        setBenchData({ points: bPoints, startValue: bPoints[0].value, endValue: bPoints[bPoints.length - 1].value });
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [positions, benchmarkIdx]);

  useEffect(() => { fetchAll(timeframe); }, [timeframe, fetchAll]);

  useEffect(() => {
    if (!containerRef.current || !perfData || perfData.points.length < 2) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const w = containerRef.current.clientWidth;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#060B18' },
        textColor: '#475569',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: { vertLines: { color: '#0D1420' }, horzLines: { color: '#0D1420' } },
      rightPriceScale: { borderColor: '#1A2235' },
      timeScale: {
        borderColor: '#1A2235',
        timeVisible: timeframe === '1D' || timeframe === '1W',
        secondsVisible: false,
      },
      crosshair: {
        horzLine: { labelBackgroundColor: '#0D1420' },
        vertLine: { labelBackgroundColor: '#0D1420' },
      },
      width: w,
      height: 260,
    });
    chartRef.current = chart;

    const normPort = normalize(perfData.points);
    const normBench = benchData ? normalize(benchData.points) : [];

    const portSeries = chart.addLineSeries({
      color: '#00D4AA',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBorderColor: '#00D4AA',
      crosshairMarkerBackgroundColor: '#060B18',
    });
    portSeries.setData(normPort);

    if (normBench.length >= 2) {
      const benchSeries = chart.addLineSeries({
        color: '#FFD700',
        lineWidth: 1,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 2,
        crosshairMarkerBorderColor: '#FFD700',
        crosshairMarkerBackgroundColor: '#060B18',
      });
      benchSeries.setData(normBench);
    }

    const baseLine = chart.addLineSeries({
      color: '#475569',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const allTimes = normPort.length > 0 ? [normPort[0].time, normPort[normPort.length - 1].time] : [];
    if (allTimes.length === 2) {
      baseLine.setData([{ time: allTimes[0], value: 100 }, { time: allTimes[1], value: 100 }]);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [perfData, benchData, timeframe]);

  const portPct = perfData && perfData.startValue > 0
    ? ((perfData.endValue - perfData.startValue) / perfData.startValue) * 100 : 0;
  const benchPct = benchData && benchData.startValue > 0
    ? ((benchData.endValue - benchData.startValue) / benchData.startValue) * 100 : 0;
  const periodPnl = perfData ? perfData.endValue - perfData.startValue : 0;
  const isUp = periodPnl >= 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Performance</span>
          {perfData && !loading && (
            <div className="flex items-center gap-2">
              <span className={`text-sm font-mono font-bold ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                {isUp ? '+' : ''}{fmt$(periodPnl)}
              </span>
              <span className={`text-xs font-mono ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                ({fmtPct(portPct)})
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-navy-700 rounded-lg p-0.5">
            {BENCHMARKS.map((b, i) => (
              <button key={b.symbol} onClick={() => setBenchmarkIdx(i)}
                className={`timeframe-btn ${benchmarkIdx === i ? 'bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40' : 'timeframe-btn-inactive'}`}
              >{b.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 bg-navy-700 rounded-lg p-0.5">
            {PERF_TIMEFRAMES.map((tf) => (
              <button key={tf} onClick={() => setTimeframe(tf)}
                className={`timeframe-btn ${timeframe === tf ? 'timeframe-btn-active' : 'timeframe-btn-inactive'}`}
              >{tf}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative rounded overflow-hidden" style={{ minHeight: 260 }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy-800/80">
            <div className="space-y-3 w-full px-6">
              <div className="flex items-end gap-[2px] h-32 w-full">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div key={i} className="flex-1 bg-navy-600 rounded-t animate-pulse"
                    style={{ height: `${20 + Math.sin(i * 0.3) * 30 + Math.random() * 20}%`, animationDelay: `${i * 20}ms` }} />
                ))}
              </div>
              <div className="flex items-center justify-center gap-2 text-accent-cyan text-xs font-mono">
                <div className="w-3.5 h-3.5 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                Loading {timeframe} data…
              </div>
            </div>
          </div>
        )}
        <div ref={containerRef} className="w-full" />
        {!loading && !perfData && positions.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-xs font-mono">
            No history data available
          </div>
        )}
      </div>

      {perfData && !loading && (
        <div className="flex items-center gap-5 mt-2 text-[10px] font-mono text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#00D4AA] inline-block" />
            Portfolio
            <span className={portPct >= 0 ? 'text-accent-green' : 'text-accent-red'}>{fmtPct(portPct)}</span>
          </span>
          {benchData && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#FFD700] inline-block" />
              {BENCHMARKS[benchmarkIdx].label}
              <span className={benchPct >= 0 ? 'text-accent-green' : 'text-accent-red'}>{fmtPct(benchPct)}</span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-slate-600 inline-block border-t border-dashed border-slate-500" />
            Baseline (100)
          </span>
          {benchData && (
            <span className="ml-auto">
              Alpha: <span className={portPct - benchPct >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                {fmtPct(portPct - benchPct)}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Portfolio component ──────────────────────────────────────────────

export default function Portfolio() {
  const { positions, addPosition, removePosition } = usePositions();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [sym, setSym] = useState(''); const [shares, setShares] = useState(''); const [price, setPrice] = useState(''); const [formErr, setFormErr] = useState('');
  const mcChartRef = useRef<HTMLDivElement>(null);
  const mcInstanceRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (positions.length === 0) return;
    const fetch = () => api.getMultiQuote(positions.map((p) => p.symbol)).then((data) => {
      const m: Record<string, Quote> = {};
      data.forEach((q) => { m[q.symbol] = q; });
      setQuotes(m);
    }).catch(() => {});
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [positions.length]);

  useEffect(() => {
    if (positions.length === 0) { setAnalytics(null); return; }
    setAnalyticsLoading(true);
    api.getPortfolioAnalytics(positions).then(setAnalytics).catch(() => {}).finally(() => setAnalyticsLoading(false));
  }, [positions]);

  const handleAddPosition = () => {
    const s = sym.toUpperCase().trim();
    const sh = parseFloat(shares); const pr = parseFloat(price);
    if (!s) return setFormErr('Symbol required');
    if (isNaN(sh) || sh <= 0) return setFormErr('Valid shares required');
    if (isNaN(pr) || pr <= 0) return setFormErr('Valid price required');
    setFormErr('');
    addPosition(s, sh, pr);
    setSym(''); setShares(''); setPrice(''); setShowForm(false);
  };

  const enriched: Enriched[] = positions.map((p) => {
    const q = quotes[p.symbol];
    const currentPrice = q?.price ?? p.avgPrice;
    const currentValue = currentPrice * p.shares;
    const costBasis = p.avgPrice * p.shares;
    const pnl = currentValue - costBasis;
    return { ...p, currentPrice, currentValue, costBasis, pnl, pnlPct: costBasis > 0 ? (pnl / costBasis) * 100 : 0, name: q?.name ?? p.symbol, weight: 0 };
  });
  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
  const totalCost = enriched.reduce((s, p) => s + p.costBasis, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  enriched.forEach((p) => { p.weight = totalValue > 0 ? (p.currentValue / totalValue) * 100 : 0; });
  const pieData = enriched.map((p, i) => ({ symbol: p.symbol, value: p.currentValue, pct: p.weight, fill: COLORS[i % COLORS.length] }));

  // Monte Carlo chart
  useEffect(() => {
    if (!mcChartRef.current || !analytics?.monteCarlo?.length) return;
    if (mcInstanceRef.current) { mcInstanceRef.current.remove(); mcInstanceRef.current = null; }
    const chart = createChart(mcChartRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#060B18' }, textColor: '#475569', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
      grid: { vertLines: { color: '#0D1420' }, horzLines: { color: '#0D1420' } },
      rightPriceScale: { borderColor: '#1A2235' }, timeScale: { borderColor: '#1A2235', visible: false },
      width: mcChartRef.current.clientWidth, height: 220, crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
    });
    mcInstanceRef.current = chart;
    const paths = analytics.monteCarlo.filter((_, i) => i % 10 === 0).slice(0, 50);
    const colors = ['#00D4AA25', '#00D4FF20', '#FFD70018', '#FF475718', '#A855F718'];
    paths.forEach((path, pi) => {
      const s = chart.addLineSeries({ color: colors[pi % colors.length], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(path.map((v, d) => ({ time: (Date.now() / 1000 + d * 86400) as any, value: v })));
    });
    const medianPath = analytics.monteCarlo[0].map((_, d) => {
      const vals = analytics.monteCarlo.map((p) => p[d]).sort((a, b) => a - b);
      return vals[Math.floor(vals.length / 2)];
    });
    const ms = chart.addLineSeries({ color: '#00D4FF', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
    ms.setData(medianPath.map((v, d) => ({ time: (Date.now() / 1000 + d * 86400) as any, value: v })));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => { if (mcChartRef.current) chart.applyOptions({ width: mcChartRef.current.clientWidth }); });
    ro.observe(mcChartRef.current);
    return () => { ro.disconnect(); chart.remove(); mcInstanceRef.current = null; };
  }, [analytics]);

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-bold text-white">Portfolio</h1><p className="text-slate-500 text-sm mt-0.5">Positions, analytics & simulation</p></div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary flex items-center gap-1.5"><Plus size={14} /> Add Position</button>
      </div>

      {showForm && (
        <div className="card mb-6 animate-fade-in">
          <div className="flex items-center gap-3 flex-wrap">
            <input className="input-field w-32" placeholder="Symbol" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && handleAddPosition()} />
            <input className="input-field w-32" placeholder="Shares" type="number" min="0" step="any" value={shares} onChange={(e) => setShares(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPosition()} />
            <input className="input-field w-36" placeholder="Avg Price $" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPosition()} />
            <button onClick={handleAddPosition} className="btn-primary">Add</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost"><X size={14} /></button>
          </div>
          {formErr && <p className="text-accent-red text-xs mt-2 font-mono">{formErr}</p>}
        </div>
      )}

      {positions.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <DollarSign size={40} className="text-slate-700 mb-4" /><p className="text-slate-500">No positions yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
            <MetricCard label="Total Value" value={fmt$(totalValue)} />
            <MetricCard label="Total P&L" value={fmt$(totalPnl)} color={totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'} />
            <MetricCard label="Return" value={fmtPct(totalPnlPct)} color={totalPnlPct >= 0 ? 'text-accent-green' : 'text-accent-red'} />
            <MetricCard label="Positions" value={String(positions.length)} />
            {analytics && (
              <>
                <MetricCard label="Sharpe Ratio" value={analytics.sharpe.toFixed(2)} sub="Risk-adj. return" color={analytics.sharpe > 1 ? 'text-accent-green' : analytics.sharpe > 0 ? 'text-accent-yellow' : 'text-accent-red'} />
                <MetricCard label="Sortino Ratio" value={analytics.sortino.toFixed(2)} sub="Downside risk" />
                <MetricCard label="Max Drawdown" value={`-${analytics.maxDrawdown.toFixed(1)}%`} sub="Worst decline" color="text-accent-red" />
                <MetricCard label="Beta vs SPY" value={analytics.beta.toFixed(2)} sub={analytics.beta > 1 ? 'Higher volatility' : 'Lower volatility'} />
              </>
            )}
          </div>

          <div className="grid grid-cols-[1fr_320px] gap-6">
            <div className="space-y-6">
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-navy-600">
                      {['Symbol', 'Shares', 'Avg Cost', 'Price', 'Value', 'P&L', '%', 'Weight', ''].map((h) => (
                        <th key={h} className={`py-2.5 px-3 text-xs text-slate-500 font-medium ${h === 'Symbol' ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((p) => (
                      <tr key={p.symbol} className="border-b border-navy-700 hover:bg-navy-700/40 transition-colors group">
                        <td className="py-3 px-3"><div className="font-mono font-bold text-accent-cyan">{p.symbol}</div><div className="text-[11px] text-slate-500 truncate max-w-[120px]">{p.name}</div></td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">{p.shares.toLocaleString()}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">{fmt$(p.avgPrice)}</td>
                        <td className="py-3 px-3 text-right font-mono text-white">{fmt$(p.currentPrice)}</td>
                        <td className="py-3 px-3 text-right font-mono text-white">{fmt$(p.currentValue)}</td>
                        <td className={`py-3 px-3 text-right font-mono ${p.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{p.pnl >= 0 ? '+' : ''}{fmt$(p.pnl)}</td>
                        <td className="py-3 px-3 text-right"><span className={p.pnl >= 0 ? 'badge-up' : 'badge-down'}>{fmtPct(p.pnlPct)}</span></td>
                        <td className="py-3 px-3 text-right font-mono text-slate-500 text-xs">{p.weight.toFixed(1)}%</td>
                        <td className="py-3 px-3 text-right"><button onClick={() => removePosition(p.symbol)} className="text-slate-600 hover:text-accent-red transition-colors p-1 opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <PerformanceChart positions={positions} />

              {analytics?.monteCarlo && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity size={14} className="text-accent-cyan" />
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Monte Carlo Simulation (500 paths × 1 year)</span>
                  </div>
                  <div ref={mcChartRef} className="w-full rounded overflow-hidden" />
                  <div className="flex items-center gap-4 mt-2 text-[10px] font-mono text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-accent-cyan inline-block" /> Median path</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-accent-green/30 inline-block" /> Simulated paths</span>
                    <span>Ann. Return: {analytics.annualizedReturn.toFixed(1)}% · Vol: {analytics.annualizedVolatility.toFixed(1)}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="card">
                <div className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-widest">Allocation</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                    {pieData.map((e) => <Cell key={e.symbol} fill={e.fill} opacity={0.9} />)}
                  </Pie><Tooltip content={<PieTooltipC />} /></PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {pieData.map((d) => (
                    <div key={d.symbol} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} /><span className="font-mono text-slate-300">{d.symbol}</span></div>
                      <span className="font-mono text-slate-500">{d.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-widest">P&L Breakdown</div>
                <div className="space-y-2">
                  {enriched.sort((a, b) => b.pnl - a.pnl).map((p) => (
                    <div key={p.symbol} className="flex items-center justify-between">
                      <span className="font-mono text-xs text-slate-300">{p.symbol}</span>
                      <div className="flex items-center gap-2">
                        <div className={`h-1.5 rounded-full ${p.pnl >= 0 ? 'bg-accent-green' : 'bg-accent-red'}`} style={{ width: Math.max(4, Math.abs(p.pnl) / Math.max(1, Math.max(...enriched.map((e) => Math.abs(e.pnl)))) * 80) }} />
                        <span className={`font-mono text-xs ${p.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{p.pnl >= 0 ? '+' : ''}{fmt$(p.pnl)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {analyticsLoading && (
                <div className="card py-8 text-center">
                  <div className="inline-flex items-center gap-2 text-accent-cyan text-xs font-mono">
                    <div className="w-3 h-3 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                    Computing analytics…
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
