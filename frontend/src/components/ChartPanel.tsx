import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CrosshairMode,
  ColorType,
  LineStyle,
} from 'lightweight-charts';
import { api } from '../api/client';
import { useAppStore } from '../store';
import AIDrawer from './AIDrawer';
import type { Timeframe, OHLCBar, Quote } from '../types';

// ─── Indicator math ──────────────────────────────────────────────────────────

function computeSMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    return data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function computeEMA(data: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(data.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { continue; }
    if (i === period - 1) {
      prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result[i] = prev;
      continue;
    }
    prev = data[i] * k + prev! * (1 - k);
    result[i] = prev;
  }
  return result;
}

function computeBollingerBands(
  data: number[],
  period = 20,
  multiplier = 2
): { upper: number | null; middle: number | null; lower: number | null }[] {
  const mid = computeSMA(data, period);
  return mid.map((m, i) => {
    if (m === null) return { upper: null, middle: null, lower: null };
    const slice = data.slice(i - period + 1, i + 1);
    const variance = slice.reduce((a, b) => a + (b - m) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return { upper: m + multiplier * std, middle: m, lower: m - multiplier * std };
  });
}

function computeRSI(data: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = data[i] - data[i - 1];
    if (ch >= 0) avgGain += ch; else avgLoss -= ch;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < data.length; i++) {
    const ch = data[i] - data[i - 1];
    const gain = Math.max(0, ch);
    const loss = Math.max(0, -ch);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function computeMACD(
  data: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number | null; sig: number | null; hist: number | null }[] {
  const emaFast = computeEMA(data, fast);
  const emaSlow = computeEMA(data, slow);
  const macdLine = emaFast.map((f, i) =>
    f !== null && emaSlow[i] !== null ? f - emaSlow[i]! : null
  );

  // Compute signal EMA over non-null MACD values
  const macdNonNull: number[] = macdLine.filter((v): v is number => v !== null);
  const sigEma = computeEMA(macdNonNull, signal);
  let sigIdx = 0;
  const signalLine: (number | null)[] = macdLine.map((m) => {
    if (m === null) return null;
    return sigEma[sigIdx++] ?? null;
  });

  return macdLine.map((m, i) => ({
    macd: m,
    sig: signalLine[i],
    hist: m !== null && signalLine[i] !== null ? m - signalLine[i]! : null,
  }));
}

// ─── Chart config helpers ─────────────────────────────────────────────────────

const CHART_BG = '#060B18';
const GRID_COLOR = '#0D1420';
const BORDER_COLOR = '#1A2235';
const TEXT_COLOR = '#475569';

function baseChartOptions(width: number, height: number) {
  return {
    layout: {
      background: { type: ColorType.Solid, color: CHART_BG },
      textColor: TEXT_COLOR,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10,
    },
    grid: {
      vertLines: { color: GRID_COLOR },
      horzLines: { color: GRID_COLOR },
    },
    rightPriceScale: { borderColor: BORDER_COLOR },
    timeScale: { borderColor: BORDER_COLOR, timeVisible: true, secondsVisible: false },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: '#00D4FF30', labelBackgroundColor: CHART_BG },
      horzLine: { color: '#00D4FF30', labelBackgroundColor: CHART_BG },
    },
    handleScale: true,
    handleScroll: true,
    width,
    height,
  };
}

// ─── Timeframes ───────────────────────────────────────────────────────────────

const TIMEFRAMES: Timeframe[] = ['1D', '5D', '1M', '3M', '6M', '1Y', '5Y'];

// ─── Component ───────────────────────────────────────────────────────────────

type IndicatorKey = 'vol' | 'sma20' | 'sma50' | 'ema200' | 'bb' | 'rsi' | 'macd';

const DEFAULT_INDICATORS: Record<IndicatorKey, boolean> = {
  vol: true, sma20: true, sma50: true, ema200: false, bb: false, rsi: true, macd: true,
};

function formatP(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  return `$${price.toFixed(5)}`;
}

export default function ChartPanel() {
  const { selectedTicker } = useAppStore();

  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef  = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);

  const mainChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef  = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const [indicators, setIndicators] = useState<Record<IndicatorKey, boolean>>(DEFAULT_INDICATORS);
  const [bars, setBars] = useState<OHLCBar[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ o: number; h: number; l: number; c: number; v: number; time: string } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const toggleIndicator = (key: IndicatorKey) =>
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async (sym: string, tf: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const [barsData, quoteData] = await Promise.all([
        api.getHistory(sym, tf),
        api.getQuote(sym),
      ]);
      setBars(barsData);
      setQuote(quoteData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(selectedTicker, timeframe);
  }, [selectedTicker, timeframe, loadData]);

  // ── Init charts ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current || !rsiRef.current || !macdRef.current) return;

    const w = mainRef.current.clientWidth;

    const main = createChart(mainRef.current, { ...baseChartOptions(w, 370), rightPriceScale: { borderColor: BORDER_COLOR, scaleMargins: { top: 0.05, bottom: 0.2 } } });
    const rsi  = createChart(rsiRef.current,  { ...baseChartOptions(w, 90),  rightPriceScale: { borderColor: BORDER_COLOR, autoScale: false }, timeScale: { borderColor: BORDER_COLOR, timeVisible: false, secondsVisible: false } });
    const macd = createChart(macdRef.current, { ...baseChartOptions(w, 100), rightPriceScale: { borderColor: BORDER_COLOR }, timeScale: { borderColor: BORDER_COLOR, timeVisible: false, secondsVisible: false } });

    // Sync time scales
    let syncing = false;
    const syncFrom = (src: IChartApi, targets: IChartApi[]) => {
      src.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        targets.forEach((t) => t.timeScale().setVisibleLogicalRange(range));
        syncing = false;
      });
    };
    syncFrom(main, [rsi, macd]);
    syncFrom(rsi,  [main, macd]);
    syncFrom(macd, [main, rsi]);

    mainChartRef.current = main;
    rsiChartRef.current  = rsi;
    macdChartRef.current = macd;

    const ro = new ResizeObserver(() => {
      if (mainRef.current) {
        const nw = mainRef.current.clientWidth;
        main.applyOptions({ width: nw });
        rsi.applyOptions({ width: nw });
        macd.applyOptions({ width: nw });
      }
    });
    ro.observe(mainRef.current);

    return () => {
      ro.disconnect();
      main.remove();
      rsi.remove();
      macd.remove();
      mainChartRef.current = null;
      rsiChartRef.current  = null;
      macdChartRef.current = null;
    };
  }, []);

  // ── Draw series ────────────────────────────────────────────────────────────
  useEffect(() => {
    const main = mainChartRef.current;
    const rsiC = rsiChartRef.current;
    const macdC = macdChartRef.current;
    if (!main || !rsiC || !macdC || bars.length === 0) return;

    // Remove all existing series by re-building — simplest approach with lightweight-charts
    // is to destroy and recreate. Instead we track refs and remove manually.
    // We'll use a different approach: track series in refs, remove them, re-add.

    const closes = bars.map((b) => b.close);
    const times  = bars.map((b) => b.time as any);

    // ── Main chart series ──────────────────────────────────────────────────
    const series: ISeriesApi<any>[] = [];

    // Candlestick
    const candles = main.addCandlestickSeries({
      upColor:         '#00D4AA',
      downColor:       '#FF4757',
      borderUpColor:   '#00D4AA',
      borderDownColor: '#FF4757',
      wickUpColor:     '#00D4AA99',
      wickDownColor:   '#FF475799',
    });
    candles.setData(bars.map((b) => ({ time: b.time as any, open: b.open, high: b.high, low: b.low, close: b.close })));
    series.push(candles);

    // Volume histogram
    if (indicators.vol) {
      const volSeries = main.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
        color: '#1A2235',
      });
      main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
      volSeries.setData(bars.map((b) => ({
        time: b.time as any,
        value: b.volume,
        color: b.close >= b.open ? '#00D4AA30' : '#FF475730',
      })));
      series.push(volSeries);
    }

    // SMA 20
    if (indicators.sma20) {
      const sma20 = computeSMA(closes, 20);
      const s = main.addLineSeries({ color: '#3B82F6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(bars.map((b, i) => sma20[i] !== null ? { time: b.time as any, value: sma20[i]! } : null).filter(Boolean) as any);
      series.push(s);
    }

    // SMA 50
    if (indicators.sma50) {
      const sma50 = computeSMA(closes, 50);
      const s = main.addLineSeries({ color: '#F97316', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(bars.map((b, i) => sma50[i] !== null ? { time: b.time as any, value: sma50[i]! } : null).filter(Boolean) as any);
      series.push(s);
    }

    // EMA 200
    if (indicators.ema200) {
      const ema200 = computeEMA(closes, 200);
      const s = main.addLineSeries({ color: '#A855F7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(bars.map((b, i) => ema200[i] !== null ? { time: b.time as any, value: ema200[i]! } : null).filter(Boolean) as any);
      series.push(s);
    }

    // Bollinger Bands
    if (indicators.bb) {
      const bb = computeBollingerBands(closes, 20, 2);
      const bbStyle = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      const upper = main.addLineSeries({ ...bbStyle, color: '#FFD70060', lineStyle: LineStyle.Dashed });
      const lower = main.addLineSeries({ ...bbStyle, color: '#FFD70060', lineStyle: LineStyle.Dashed });
      const mid   = main.addLineSeries({ ...bbStyle, color: '#FFD70030', lineStyle: LineStyle.Dotted });
      upper.setData(bars.map((b, i) => bb[i].upper !== null ? { time: b.time as any, value: bb[i].upper! } : null).filter(Boolean) as any);
      lower.setData(bars.map((b, i) => bb[i].lower !== null ? { time: b.time as any, value: bb[i].lower! } : null).filter(Boolean) as any);
      mid.setData(bars.map((b, i) => bb[i].middle !== null ? { time: b.time as any, value: bb[i].middle! } : null).filter(Boolean) as any);
      series.push(upper, lower, mid);
    }

    // Crosshair OHLCV tooltip
    const crosshairFn = (param: any) => {
      if (!param.time || !param.seriesData) {
        setTooltip(null);
        return;
      }
      const d = param.seriesData.get(candles) as any;
      if (!d) { setTooltip(null); return; }
      const barIdx = bars.findIndex((b) => b.time === (param.time as any));
      const vol = barIdx >= 0 ? bars[barIdx].volume : 0;
      const date = new Date((param.time as number) * 1000);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      setTooltip({ o: d.open, h: d.high, l: d.low, c: d.close, v: vol, time: dateStr });
    };
    main.subscribeCrosshairMove(crosshairFn);

    // ── RSI ────────────────────────────────────────────────────────────────
    const rsiSeries: ISeriesApi<any>[] = [];
    if (indicators.rsi) {
      const rsiVals = computeRSI(closes);
      const rsiLine = rsiC.addLineSeries({ color: '#A855F7', lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
      rsiLine.setData(bars.map((b, i) => rsiVals[i] !== null ? { time: b.time as any, value: rsiVals[i]! } : null).filter(Boolean) as any);

      // Overbought / oversold reference lines
      const ob = rsiC.addLineSeries({ color: '#FF475740', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      const os = rsiC.addLineSeries({ color: '#00D4AA40', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ob.setData([{ time: times[0], value: 70 }, { time: times[times.length - 1], value: 70 }]);
      os.setData([{ time: times[0], value: 30 }, { time: times[times.length - 1], value: 30 }]);

      rsiSeries.push(rsiLine, ob, os);
    }

    // ── MACD ───────────────────────────────────────────────────────────────
    const macdSeries: ISeriesApi<any>[] = [];
    if (indicators.macd) {
      const macdVals = computeMACD(closes);
      const macdLine  = macdC.addLineSeries({ color: '#00D4FF', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      const sigLine   = macdC.addLineSeries({ color: '#FF4757',  lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      const histSeries = macdC.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false, color: '#3B82F6' });

      macdLine.setData(bars.map((b, i) => macdVals[i].macd !== null ? { time: b.time as any, value: macdVals[i].macd! } : null).filter(Boolean) as any);
      sigLine.setData(bars.map((b, i) => macdVals[i].sig !== null ? { time: b.time as any, value: macdVals[i].sig! } : null).filter(Boolean) as any);
      histSeries.setData(bars.map((b, i) => macdVals[i].hist !== null ? {
        time: b.time as any,
        value: macdVals[i].hist!,
        color: macdVals[i].hist! >= 0 ? '#00D4AA50' : '#FF475750',
      } : null).filter(Boolean) as any);

      macdSeries.push(macdLine, sigLine, histSeries);
    }

    main.timeScale().fitContent();
    rsiC.timeScale().fitContent();
    macdC.timeScale().fitContent();

    return () => {
      series.forEach((s) => { try { main.removeSeries(s); } catch {} });
      rsiSeries.forEach((s) => { try { rsiC.removeSeries(s); } catch {} });
      macdSeries.forEach((s) => { try { macdC.removeSeries(s); } catch {} });
      try { main.unsubscribeCrosshairMove(crosshairFn); } catch {}
    };
  }, [bars, indicators]);

  const up = quote ? quote.changePercent >= 0 : true;

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Symbol + quote */}
        <div className="flex items-center gap-2 bg-navy-800 border border-navy-600 rounded-lg px-3 py-1.5 min-w-0">
          <span className="font-mono font-bold text-accent-cyan text-sm">{selectedTicker}</span>
          {quote && (
            <>
              <span className="font-mono text-white text-sm">{formatP(quote.price)}</span>
              <span className={`font-mono text-xs ${up ? 'text-accent-green' : 'text-accent-red'}`}>
                {up ? '+' : ''}{quote.changePercent.toFixed(2)}%
              </span>
              <span className="text-slate-500 text-xs truncate hidden lg:block">{quote.name}</span>
            </>
          )}
        </div>

        {/* Timeframes */}
        <div className="flex items-center gap-0.5 bg-navy-800 border border-navy-600 rounded-lg p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`timeframe-btn ${timeframe === tf ? 'timeframe-btn-active' : 'timeframe-btn-inactive'}`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Indicator toggles */}
        <div className="flex items-center gap-1 flex-wrap">
          {([
            { key: 'vol',   label: 'VOL',   color: 'text-slate-400' },
            { key: 'sma20', label: 'SMA20', color: 'text-blue-400' },
            { key: 'sma50', label: 'SMA50', color: 'text-orange-400' },
            { key: 'ema200',label: 'EMA200',color: 'text-purple-400' },
            { key: 'bb',    label: 'BB',    color: 'text-yellow-400' },
            { key: 'rsi',   label: 'RSI',   color: 'text-purple-400' },
            { key: 'macd',  label: 'MACD',  color: 'text-cyan-400' },
          ] as { key: IndicatorKey; label: string; color: string }[]).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleIndicator(key)}
              className={`indicator-btn ${indicators[key] ? `indicator-btn-active ${color}` : 'indicator-btn-inactive'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Ask AI button */}
        <button onClick={() => setAiOpen(true)} className="btn-primary flex items-center gap-1.5 text-xs shrink-0">
          <span className="text-sm">✨</span> Ask AI
        </button>
      </div>

      {/* Charts container */}
      <div className="relative flex-1 bg-navy-800 border border-navy-600 rounded-xl overflow-hidden">
        {(loading || error) && (
          <div className="absolute inset-0 bg-navy-800/90 flex items-center justify-center z-10">
            {loading ? (
              <div className="flex items-center gap-2 text-accent-cyan text-xs font-mono">
                <div className="w-3.5 h-3.5 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="text-accent-red text-xs font-mono text-center px-6">{error}</div>
            )}
          </div>
        )}

        {/* OHLCV tooltip overlay */}
        {tooltip && (
          <div className="absolute top-2 left-3 z-10 bg-navy-900/90 border border-navy-600 rounded px-2.5 py-1.5 text-[10px] font-mono text-slate-300 pointer-events-none">
            <span className="text-slate-500 mr-1">{tooltip.time}</span>
            <span className="mr-2">O <span className="text-white">{formatP(tooltip.o)}</span></span>
            <span className="mr-2">H <span className="text-accent-green">{formatP(tooltip.h)}</span></span>
            <span className="mr-2">L <span className="text-accent-red">{formatP(tooltip.l)}</span></span>
            <span className="mr-2">C <span className="text-white">{formatP(tooltip.c)}</span></span>
            <span>V <span className="text-slate-400">
              {tooltip.v >= 1e9 ? `${(tooltip.v/1e9).toFixed(1)}B` : tooltip.v >= 1e6 ? `${(tooltip.v/1e6).toFixed(1)}M` : `${(tooltip.v/1e3).toFixed(0)}K`}
            </span></span>
          </div>
        )}

        {/* Main chart */}
        <div ref={mainRef} className="w-full" />

        {/* RSI panel */}
        {indicators.rsi && (
          <div className="border-t border-navy-600">
            <div className="absolute text-[9px] font-mono text-slate-600 z-10 mt-0.5 ml-1.5">RSI(14)</div>
            <div ref={rsiRef} className="w-full" />
          </div>
        )}

        {/* MACD panel */}
        {indicators.macd && (
          <div className="border-t border-navy-600">
            <div className="absolute text-[9px] font-mono text-slate-600 z-10 mt-0.5 ml-1.5">MACD(12,26,9)</div>
            <div ref={macdRef} className="w-full" />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-1 text-[10px] font-mono">
        {indicators.sma20  && <span className="flex items-center gap-1"><span className="w-3 h-px bg-blue-400 inline-block" /> SMA20</span>}
        {indicators.sma50  && <span className="flex items-center gap-1"><span className="w-3 h-px bg-orange-400 inline-block" /> SMA50</span>}
        {indicators.ema200 && <span className="flex items-center gap-1"><span className="w-3 h-px bg-purple-400 inline-block" /> EMA200</span>}
        {indicators.bb     && <span className="flex items-center gap-1"><span className="w-3 h-px bg-yellow-400 inline-block" /> BB(20)</span>}
        {indicators.rsi    && <span className="flex items-center gap-1 text-purple-400">RSI 70/30</span>}
        {indicators.macd   && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-500/30 inline-block" /> MACD <span className="w-2 h-2 rounded-sm bg-red-500/30 inline-block" /> Signal</span>}
      </div>

      {/* AI Analysis Drawer */}
      <AIDrawer open={aiOpen} onClose={() => setAiOpen(false)} ticker={selectedTicker} bars={bars} />
    </div>
  );
}
