export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  open?: number | null;
  previousClose?: number | null;
  error?: boolean;
}

export interface OHLCBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketIndex {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  dayHigh: number | null;
  dayLow: number | null;
  error?: boolean;
}

export interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

export interface PortfolioPosition {
  symbol: string;
  shares: number;
  avgPrice: number;
}

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: number;
  ticker?: string;
}

export interface ScreenerStock {
  symbol: string;
  sector: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number | null;
  dayHigh: number | null;
  dayLow: number | null;
}

export interface SectorPerf {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface FearGreed {
  score: number;
  label: string;
  vix: number;
  spyChange: number;
}

export interface GainersLosers {
  gainers: { symbol: string; name: string; price: number; change: number; changePercent: number; volume: number }[];
  losers: { symbol: string; name: string; price: number; change: number; changePercent: number; volume: number }[];
}

export interface AIAnalysis {
  trend: { direction: string; strength: string; summary: string };
  signal: { action: string; confidence: number; reasoning: string };
  keyLevels: { support: number[]; resistance: number[] };
  risk: { level: string; factors: string[] };
  summary: string;
}

export interface CorrelationResult {
  tickers: string[];
  matrix: number[][];
}

export interface OptionFlow {
  ticker: string;
  strike: number;
  expiry: string;
  type: 'CALL' | 'PUT';
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  unusual: boolean;
}

export interface CalendarEvent {
  date: string;
  time: string;
  event: string;
  impact: 'high' | 'medium' | 'low';
  country: string;
  forecast: string;
  previous: string;
}

export interface PortfolioAnalytics {
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  beta: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  monteCarlo: number[][];
}

export interface PriceAlert {
  id: string;
  ticker: string;
  condition: 'above' | 'below';
  price: number;
  active: boolean;
  triggered: boolean;
  createdAt: number;
}

export interface HeatmapStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  marketCap: number | null;
}

export type Timeframe = '1D' | '1W' | '5D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';
export type ChartMode = 'candlestick' | 'line';
export type ThemeMode = 'dark' | 'light';
