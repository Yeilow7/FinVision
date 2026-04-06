import type { Quote, OHLCBar, MarketIndex, SearchResult, Timeframe, NewsItem, ScreenerStock, SectorPerf, FearGreed, GainersLosers, AIAnalysis, CorrelationResult, OptionFlow, CalendarEvent, PortfolioAnalytics, PortfolioPosition, HeatmapStock } from '../types';

const BASE = 'http://localhost:3001';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getQuote: (symbol: string) =>
    apiFetch<Quote>(`/api/quote/${encodeURIComponent(symbol)}`),

  getHistory: (symbol: string, timeframe: Timeframe) =>
    apiFetch<OHLCBar[]>(`/api/history/${encodeURIComponent(symbol)}?timeframe=${timeframe}`),

  getMarketOverview: () =>
    apiFetch<MarketIndex[]>('/api/market-overview'),

  search: (q: string) =>
    apiFetch<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),

  getMultiQuote: (symbols: string[]) =>
    apiFetch<Quote[]>('/api/multi-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    }),

  getNews: (ticker: string) =>
    apiFetch<NewsItem[]>(`/api/news/${encodeURIComponent(ticker)}`),

  getNewsMulti: (tickers: string[]) =>
    apiFetch<NewsItem[]>(`/api/news-multi?tickers=${tickers.map(encodeURIComponent).join(',')}`),

  getScreener: () =>
    apiFetch<ScreenerStock[]>('/api/screener'),

  getScreenerSparklines: () =>
    apiFetch<Record<string, number[]>>('/api/screener-sparklines'),

  getSectorPerformance: () =>
    apiFetch<SectorPerf[]>('/api/sector-performance'),

  getFearGreed: () =>
    apiFetch<FearGreed>('/api/fear-greed'),

  getGainersLosers: () =>
    apiFetch<GainersLosers>('/api/gainers-losers'),

  analyzeAI: (data: { ticker: string; ohlcv: OHLCBar[]; rsi: number | null; macd: any; currentPrice: number }) =>
    apiFetch<AIAnalysis>('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getCorrelation: (tickers: string[]) =>
    apiFetch<CorrelationResult>('/api/correlation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    }),

  getOptions: (ticker: string) =>
    apiFetch<OptionFlow[]>(`/api/options/${encodeURIComponent(ticker)}`),

  getCalendar: () =>
    apiFetch<CalendarEvent[]>('/api/calendar'),

  getPortfolioAnalytics: (positions: PortfolioPosition[]) =>
    apiFetch<PortfolioAnalytics>('/api/portfolio/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions }),
    }),

  getHeatmap: (market: 'sp500' | 'ipsa') =>
    apiFetch<HeatmapStock[]>(`/api/heatmap/${market}`),

  subscribeStream: (
    symbols: string[],
    onData: (quotes: Record<string, Quote>) => void
  ): (() => void) => {
    const url = `${BASE}/api/stream?symbols=${symbols.map(encodeURIComponent).join(',')}`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try { onData(JSON.parse(e.data)); } catch {}
    };
    return () => es.close();
  },
};
