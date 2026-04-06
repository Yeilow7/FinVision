import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import * as d3 from 'd3';
import { api } from '../api/client';
import { useAppStore } from '../store';
import type { HeatmapStock } from '../types';

type MarketView = 'sp500' | 'ipsa';

function changeColor(pct: number): string {
  if (pct >= 3)  return '#15803d';
  if (pct >= 2)  return '#16a34a';
  if (pct >= 1)  return '#22c55e';
  if (pct >= 0.4) return '#4ade80';
  if (pct >= 0)  return '#374151';
  if (pct >= -0.4) return '#374151';
  if (pct >= -1) return '#f87171';
  if (pct >= -2) return '#ef4444';
  if (pct >= -3) return '#dc2626';
  return '#b91c1c';
}

function textColor(pct: number): string {
  return Math.abs(pct) < 0.4 ? '#9ca3af' : '#ffffff';
}

export default function Heatmap() {
  const navigate = useNavigate();
  const { setSelectedTicker } = useAppStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [market, setMarket] = useState<MarketView>('sp500');
  const [stocks, setStocks] = useState<HeatmapStock[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    api.getHeatmap(market).then(setStocks).catch(() => {}).finally(() => setLoading(false));
  }, [market]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Render treemap
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || stocks.length === 0 || loading) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = containerRef.current.clientWidth;
    const height = Math.max(500, window.innerHeight - 200);
    svg.attr('width', width).attr('height', height);

    // Group by sector
    const sectors = Array.from(new Set(stocks.map((s) => s.sector)));
    const hierarchyData = {
      name: 'root',
      children: sectors.map((sector) => ({
        name: sector,
        children: stocks
          .filter((s) => s.sector === sector)
          .map((s) => ({
            name: s.symbol,
            fullName: s.name,
            sector: s.sector,
            value: Math.max(s.marketCap ?? 1e9, 1e8), // fallback for missing marketCap
            changePercent: s.changePercent,
            price: s.price,
          })),
      })),
    };

    const root = d3.hierarchy(hierarchyData)
      .sum((d: any) => d.value || 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<any>()
      .size([width, height])
      .paddingTop(18)
      .paddingInner(2)
      .paddingOuter(2)
      .round(true)(root);

    // Sector group labels
    svg.selectAll('.sector-label')
      .data(root.children || [])
      .join('text')
      .attr('class', 'sector-label')
      .attr('x', (d: any) => d.x0 + 4)
      .attr('y', (d: any) => d.y0 + 13)
      .text((d: any) => d.data.name)
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', '#64748b')
      .attr('font-weight', '600');

    // Stock rectangles
    const leaves = root.leaves();
    const tooltip = d3.select(tooltipRef.current);

    const rects = svg.selectAll('.stock-rect')
      .data(leaves)
      .join('g')
      .attr('class', 'stock-rect')
      .attr('transform', (d: any) => `translate(${d.x0},${d.y0})`)
      .style('cursor', 'pointer');

    rects.append('rect')
      .attr('width', (d: any) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d: any) => Math.max(0, d.y1 - d.y0))
      .attr('rx', 3)
      .attr('fill', (d: any) => changeColor(d.data.changePercent))
      .attr('stroke', '#060B18')
      .attr('stroke-width', 1)
      .on('mouseover', (_e: any, d: any) => {
        tooltip.style('opacity', '1');
        tooltip.html(`
          <div class="font-bold text-white">${d.data.fullName}</div>
          <div class="text-accent-cyan font-mono">${d.data.name}</div>
          <div class="text-slate-400">${d.data.sector}</div>
          <div class="font-mono mt-1" style="color: ${d.data.changePercent >= 0 ? '#00D4AA' : '#FF4757'}">
            ${d.data.changePercent >= 0 ? '+' : ''}${d.data.changePercent.toFixed(2)}%
          </div>
          <div class="text-slate-500 font-mono text-[10px]">$${d.data.price.toFixed(2)}</div>
        `);
      })
      .on('mousemove', (e: any) => {
        const rect = containerRef.current!.getBoundingClientRect();
        tooltip
          .style('left', `${e.clientX - rect.left + 12}px`)
          .style('top', `${e.clientY - rect.top - 10}px`);
      })
      .on('mouseout', () => { tooltip.style('opacity', '0'); })
      .on('click', (_e: any, d: any) => {
        setSelectedTicker(d.data.name); // symbol is d.data.name in leaves
        navigate('/terminal');
      });

    // Ticker label
    rects.append('text')
      .attr('x', (d: any) => (d.x1 - d.x0) / 2)
      .attr('y', (d: any) => (d.y1 - d.y0) / 2 - 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', (d: any) => {
        const w = d.x1 - d.x0;
        if (w > 100) return '12px';
        if (w > 60) return '10px';
        return '8px';
      })
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-weight', '700')
      .attr('fill', (d: any) => textColor(d.data.changePercent))
      .text((d: any) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 35 || h < 25) return '';
        return d.data.name;
      });

    // Change % label
    rects.append('text')
      .attr('x', (d: any) => (d.x1 - d.x0) / 2)
      .attr('y', (d: any) => (d.y1 - d.y0) / 2 + 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', (d: any) => {
        const w = d.x1 - d.x0;
        return w > 60 ? '10px' : '8px';
      })
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', (d: any) => textColor(d.data.changePercent))
      .attr('opacity', 0.8)
      .text((d: any) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 45 || h < 35) return '';
        return `${d.data.changePercent >= 0 ? '+' : ''}${d.data.changePercent.toFixed(2)}%`;
      });

    // Resize
    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const nw = containerRef.current.clientWidth;
      svg.attr('width', nw);
      // Don't re-layout on resize — just note it; a full re-render would be expensive
    });
    ro.observe(containerRef.current);

    return () => ro.disconnect();
  }, [stocks, loading, navigate, setSelectedTicker]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">Market Heatmap</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Size = market cap · Color = % change today
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Market toggle */}
          <div className="flex items-center gap-0.5 bg-navy-700 rounded-lg p-0.5">
            <button onClick={() => setMarket('sp500')}
              className={`timeframe-btn ${market === 'sp500' ? 'timeframe-btn-active' : 'timeframe-btn-inactive'}`}
            >S&P 500</button>
            <button onClick={() => setMarket('ipsa')}
              className={`timeframe-btn ${market === 'ipsa' ? 'timeframe-btn-active' : 'timeframe-btn-inactive'}`}
            >IPSA (Chile)</button>
          </div>
          <button onClick={fetchData} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Color scale legend */}
      <div className="flex items-center gap-2 mb-4 text-[10px] font-mono text-slate-500">
        <span>-3%</span>
        <div className="flex h-2.5 rounded overflow-hidden flex-1 max-w-xs">
          {[-3, -2, -1, -0.4, 0, 0.4, 1, 2, 3].map((v) => (
            <div key={v} className="flex-1" style={{ backgroundColor: changeColor(v) }} />
          ))}
        </div>
        <span>+3%</span>
      </div>

      {/* Treemap */}
      <div ref={containerRef} className="relative card p-0 overflow-hidden" style={{ minHeight: 500 }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy-800/90">
            <div className="flex items-center gap-2 text-accent-cyan text-sm font-mono">
              <div className="w-4 h-4 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
              Loading {market === 'ipsa' ? 'IPSA' : 'S&P 500'} heatmap…
            </div>
          </div>
        )}
        <svg ref={svgRef} />
        {/* Tooltip */}
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none z-20 bg-navy-800 border border-navy-500 rounded-lg px-3 py-2 text-xs shadow-xl transition-opacity duration-100"
          style={{ opacity: 0 }}
        />
      </div>
    </div>
  );
}
