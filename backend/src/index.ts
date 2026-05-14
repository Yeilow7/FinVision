import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
// yahoo-finance2 not used — crumb-based APIs are unreliable due to rate limiting

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
}));
app.use(express.json());

// ─── In-memory cache ──────────────────────────────────────────────────────────

const cache = new Map<string, { data: any; ts: number }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data as T);
  return fn().then((data) => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

// ─── Commodity / alias map ────────────────────────────────────────────────────

const SYMBOL_ALIASES: Record<string, { ticker: string; name: string }> = {
  SILVER:    { ticker: 'SI=F',  name: 'Silver' },
  GOLD:      { ticker: 'GC=F',  name: 'Gold' },
  PLATINUM:  { ticker: 'PL=F',  name: 'Platinum' },
  PALLADIUM: { ticker: 'PA=F',  name: 'Palladium' },
  COPPER:    { ticker: 'HG=F',  name: 'Copper' },
  OIL:       { ticker: 'CL=F',  name: 'Crude Oil' },
  CRUDEOIL:  { ticker: 'CL=F',  name: 'Crude Oil' },
  BRENT:     { ticker: 'BZ=F',  name: 'Brent Crude Oil' },
  NATGAS:    { ticker: 'NG=F',  name: 'Natural Gas' },
  GAS:       { ticker: 'NG=F',  name: 'Natural Gas' },
  GASOLINE:  { ticker: 'RB=F',  name: 'Gasoline' },
  WHEAT:     { ticker: 'ZW=F',  name: 'Wheat' },
  CORN:      { ticker: 'ZC=F',  name: 'Corn' },
  SOYBEANS:  { ticker: 'ZS=F',  name: 'Soybeans' },
  SUGAR:     { ticker: 'SB=F',  name: 'Sugar' },
  COFFEE:    { ticker: 'KC=F',  name: 'Coffee' },
  COCOA:     { ticker: 'CC=F',  name: 'Cocoa' },
  COTTON:    { ticker: 'CT=F',  name: 'Cotton' },
  SP500:     { ticker: '^GSPC', name: 'S&P 500' },
  NASDAQ:    { ticker: '^IXIC', name: 'NASDAQ' },
  DOW:       { ticker: '^DJI',  name: 'Dow Jones' },
};

function resolveSymbol(input: string): { ticker: string; displayName: string | null } {
  const key = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const alias = SYMBOL_ALIASES[key];
  return alias
    ? { ticker: alias.ticker, displayName: alias.name }
    : { ticker: input.toUpperCase(), displayName: null };
}

// ─── Yahoo Finance HTTP helpers ───────────────────────────────────────────────

const YF_BASE = 'https://query1.finance.yahoo.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Accept: 'application/json',
};

async function yfFetch(url: string, extraHeaders?: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers: { ...HEADERS, ...extraHeaders } });
  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${url}`);
  return res.json();
}

// ─── Rich quote data via crumb-authenticated v7 API ──────────────────────────

import { execSync } from 'child_process';

let yfCrumb: string | null = null;
const yfCookieJar = '/tmp/finvision_yf_cookies';
let crumbFetchedAt = 0;
let crumbPromise: Promise<void> | null = null;

async function ensureCrumb(): Promise<void> {
  if (yfCrumb && Date.now() - crumbFetchedAt < 30 * 60_000) return;
  if (crumbPromise) return crumbPromise;
  crumbPromise = (async () => {
    try {
      execSync(`curl -s -c ${yfCookieJar} "https://fc.yahoo.com" -o /dev/null`, { timeout: 10_000 });
      const crumbText = execSync(
        `curl -s -b ${yfCookieJar} "https://query2.finance.yahoo.com/v1/test/getcrumb"`,
        { timeout: 10_000 }
      ).toString().trim();

      const isValid = crumbText && crumbText.length < 50
        && !crumbText.startsWith('{')
        && !crumbText.includes(' ')
        && !crumbText.includes('<');

      if (isValid) {
        yfCrumb = crumbText;
        crumbFetchedAt = Date.now();
        console.log('[backend] Yahoo crumb acquired');
      } else {
        console.log('[backend] Yahoo crumb invalid:', crumbText.slice(0, 60));
      }
    } catch { /* curl failed or timed out */ }
    finally { crumbPromise = null; }
  })();
  return crumbPromise;
}

/** Fetch rich quote data via v7 API (crumb auth). Falls back to empty if unavailable. Cached 5min. */
async function fetchRichQuotes(symbols: string[]): Promise<Record<string, any>> {
  const cacheKey = `rich:${symbols.sort().join(',')}`;
  return cached(cacheKey, 300_000, async () => {
    await ensureCrumb();
    if (!yfCrumb) return {};
    try {
      const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols.map(encodeURIComponent).join(',')}&crumb=${encodeURIComponent(yfCrumb)}`;
      const raw = execSync(
        `curl -s -b ${yfCookieJar} "${url}"`,
        { timeout: 15_000, maxBuffer: 5 * 1024 * 1024 }
      ).toString();
      const data = JSON.parse(raw);
      if (data?.quoteResponse?.error) {
        // Crumb expired or invalid — reset so next call retries
        yfCrumb = null;
        return {};
      }
      const results = data?.quoteResponse?.result ?? [];
      const map: Record<string, any> = {};
      results.forEach((r: any) => { map[r.symbol] = r; });
      return map;
    } catch {
      return {};
    }
  });
}

/**
 * Fetch quote for a single symbol. Optionally pass pre-fetched rich data to
 * avoid redundant v7 calls when batching (multi-quote, screener, etc.).
 */
async function fetchQuote(symbol: string, displayName?: string | null, richOverride?: Record<string, any> | null) {
  return cached(`quote:${symbol}`, 10_000, async () => {
    // Primary: chart endpoint (always works, no auth)
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`;
    const data = await yfFetch(url);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(`No data for symbol: ${symbol}`);
    const meta = result.meta;

    // Enrich with v7 data (marketCap, sharesOutstanding, open)
    let r: any = {};
    if (richOverride) {
      r = richOverride[meta.symbol] || richOverride[symbol] || {};
    } else {
      const rich = await fetchRichQuotes([symbol]);
      r = rich[meta.symbol] || rich[symbol] || {};
    }

    return {
      symbol: meta.symbol,
      name: displayName || r.shortName || r.longName || meta.shortName || meta.longName || meta.symbol,
      price: meta.regularMarketPrice ?? 0,
      change: (meta.regularMarketPrice ?? 0) - (meta.previousClose ?? meta.chartPreviousClose ?? 0),
      changePercent:
        (((meta.regularMarketPrice ?? 0) - (meta.previousClose ?? meta.chartPreviousClose ?? 0)) /
          (meta.previousClose ?? meta.chartPreviousClose ?? 1)) * 100,
      volume: meta.regularMarketVolume ?? 0,
      marketCap: r.marketCap ?? r.regularMarketCap ?? null,
      dayHigh: meta.regularMarketDayHigh ?? r.regularMarketDayHigh ?? null,
      dayLow: meta.regularMarketDayLow ?? r.regularMarketDayLow ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? r.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? r.fiftyTwoWeekLow ?? null,
      open: meta.regularMarketOpen ?? r.regularMarketOpen ?? null,
      previousClose: meta.previousClose ?? meta.chartPreviousClose ?? r.regularMarketPreviousClose ?? null,
    };
  });
}

interface OHLCBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function getTimeframeParams(timeframe: string): { range: string; interval: string } {
  switch (timeframe) {
    case '1D': return { range: '1d',  interval: '5m' };
    case '1W': return { range: '5d',  interval: '30m' };
    case '5D': return { range: '5d',  interval: '30m' };
    case '1M': return { range: '1mo', interval: '1d' };
    case '3M': return { range: '3mo', interval: '1d' };
    case '6M': return { range: '6mo', interval: '1d' };
    case 'YTD':return { range: 'ytd', interval: '1d' };
    case '1Y': return { range: '1y',  interval: '1d' };
    case '5Y': return { range: '5y',  interval: '1wk' };
    default:   return { range: '1mo', interval: '1d' };
  }
}

async function fetchHistory(symbol: string, timeframe: string): Promise<OHLCBar[]> {
  return cached(`history:${symbol}:${timeframe}`, 60_000, async () => {
    const { range, interval } = getTimeframeParams(timeframe);
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
    const data = await yfFetch(url);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(`No data for ${symbol}`);

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0] ?? {};
    const opens: number[] = quotes.open ?? [];
    const highs: number[] = quotes.high ?? [];
    const lows: number[] = quotes.low ?? [];
    const closes: number[] = quotes.close ?? [];
    const volumes: number[] = quotes.volume ?? [];

    return timestamps
      .map((t, i) => ({
        time: t,
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i] ?? 0,
      }))
      .filter(
        (b) =>
          b.open != null && b.high != null && b.low != null && b.close != null &&
          !isNaN(b.open) && !isNaN(b.high) && !isNaN(b.low) && !isNaN(b.close)
      );
  });
}

async function fetchNews(symbol: string) {
  return cached(`news:${symbol}`, 120_000, async () => {
    const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=10&quotesCount=0&enableFuzzyQuery=false`;
    const data = await yfFetch(url);
    const news = data?.news ?? [];
    return news.map((item: any) => ({
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      publishedAt: item.providerPublishTime ? item.providerPublishTime * 1000 : Date.now(),
    }));
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const { ticker, displayName } = resolveSymbol(req.params.symbol);
    const quote = await fetchQuote(ticker, displayName);
    res.json({ ...quote, symbol: req.params.symbol.toUpperCase() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:symbol', async (req, res) => {
  try {
    const { ticker } = resolveSymbol(req.params.symbol);
    const bars = await fetchHistory(ticker, (req.query.timeframe as string) || '1M');
    res.json(bars);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/market-overview', async (req, res) => {
  const indices = [
    { symbol: '^GSPC', label: 'S&P 500' },
    { symbol: '^IXIC', label: 'NASDAQ' },
    { symbol: '^DJI',  label: 'Dow Jones' },
    { symbol: 'BTC-USD', label: 'Bitcoin' },
  ];
  try {
    const results = await Promise.allSettled(indices.map(({ symbol }) => fetchQuote(symbol)));
    const data = indices.map(({ symbol, label }, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') return { ...r.value, symbol, label };
      return { symbol, label, price: 0, change: 0, changePercent: 0, volume: 0, marketCap: null, dayHigh: null, dayLow: null, error: true };
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  const q = (req.query.q as string) || '';
  if (!q.trim()) return res.json([]);
  try {
    const aliasKey = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const aliasMatches = Object.entries(SYMBOL_ALIASES)
      .filter(([key]) => key.startsWith(aliasKey))
      .map(([key, val]) => ({
        symbol: key,
        name: val.name,
        type: 'COMMODITY',
        exchange: 'Futures',
      }));

    const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
    const data = await yfFetch(url);
    const yfQuotes = (data?.quotes ?? [])
      .filter((item: any) => ['EQUITY', 'CRYPTOCURRENCY', 'INDEX', 'ETF', 'FUTURE'].includes(item.quoteType))
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        type: item.quoteType,
        exchange: item.exchDisp || item.exchange || '',
        domain: item.symbol.includes('.') ? null : null, // future use
      }));

    res.json([...aliasMatches, ...yfQuotes].slice(0, 8));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/multi-quote', async (req, res) => {
  const { symbols } = req.body as { symbols: string[] };
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) return res.json([]);
  try {
    const resolved = symbols.map((s) => resolveSymbol(s));
    // Batch one v7 call for all tickers → pass rich data into each fetchQuote
    const richData = await fetchRichQuotes(resolved.map((r) => r.ticker));
    const results = await Promise.allSettled(
      resolved.map(({ ticker, displayName }) => fetchQuote(ticker, displayName, richData))
    );
    const data = symbols.map((symbol, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') return { ...r.value, symbol };
      return { symbol, name: symbol, price: 0, change: 0, changePercent: 0, volume: 0, marketCap: null, dayHigh: null, dayLow: null, error: true };
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/news/:ticker
app.get('/api/news/:ticker', async (req, res) => {
  try {
    const { ticker } = resolveSymbol(req.params.ticker);
    const news = await fetchNews(ticker);
    res.json(news);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stream?symbols=SPY,QQQ,BTC-USD,...
app.get('/api/stream', async (req, res) => {
  const symbolsParam = (req.query.symbols as string) || 'SPY,QQQ,BTC-USD,ETH-USD';
  const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendUpdate = async () => {
    try {
      const resolved = symbols.map((s) => resolveSymbol(s));
      const results = await Promise.allSettled(
        resolved.map(({ ticker, displayName }) => fetchQuote(ticker, displayName))
      );
      const data: Record<string, any> = {};
      symbols.forEach((sym, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') data[sym] = r.value;
      });
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Ignore errors in SSE stream
    }
  };

  // Send immediately, then every 10s
  sendUpdate();
  const interval = setInterval(sendUpdate, 10_000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// ─── Screener universe ─────────────────────────────────────────────────────

const SCREENER_UNIVERSE: { symbol: string; sector: string }[] = [
  // Technology
  { symbol: 'AAPL', sector: 'Technology' }, { symbol: 'MSFT', sector: 'Technology' },
  { symbol: 'GOOGL', sector: 'Technology' }, { symbol: 'NVDA', sector: 'Technology' },
  { symbol: 'META', sector: 'Technology' }, { symbol: 'AMZN', sector: 'Technology' },
  { symbol: 'TSM', sector: 'Technology' }, { symbol: 'AVGO', sector: 'Technology' },
  { symbol: 'ORCL', sector: 'Technology' }, { symbol: 'AMD', sector: 'Technology' },
  // Finance
  { symbol: 'JPM', sector: 'Finance' }, { symbol: 'BAC', sector: 'Finance' },
  { symbol: 'GS', sector: 'Finance' }, { symbol: 'V', sector: 'Finance' },
  { symbol: 'MA', sector: 'Finance' }, { symbol: 'WFC', sector: 'Finance' },
  // Healthcare
  { symbol: 'JNJ', sector: 'Healthcare' }, { symbol: 'UNH', sector: 'Healthcare' },
  { symbol: 'LLY', sector: 'Healthcare' }, { symbol: 'PFE', sector: 'Healthcare' },
  { symbol: 'MRK', sector: 'Healthcare' }, { symbol: 'ABBV', sector: 'Healthcare' },
  // Energy
  { symbol: 'XOM', sector: 'Energy' }, { symbol: 'CVX', sector: 'Energy' },
  { symbol: 'COP', sector: 'Energy' }, { symbol: 'SLB', sector: 'Energy' },
  // Consumer
  { symbol: 'WMT', sector: 'Consumer' }, { symbol: 'COST', sector: 'Consumer' },
  { symbol: 'HD', sector: 'Consumer' }, { symbol: 'TSLA', sector: 'Consumer' },
  { symbol: 'NKE', sector: 'Consumer' }, { symbol: 'MCD', sector: 'Consumer' },
  // Industrials
  { symbol: 'CAT', sector: 'Industrials' }, { symbol: 'GE', sector: 'Industrials' },
  { symbol: 'BA', sector: 'Industrials' }, { symbol: 'UPS', sector: 'Industrials' },
  { symbol: 'LMT', sector: 'Industrials' }, { symbol: 'HON', sector: 'Industrials' },
];

const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology' },
  { symbol: 'XLF', name: 'Financial' },
  { symbol: 'XLV', name: 'Healthcare' },
  { symbol: 'XLE', name: 'Energy' },
  { symbol: 'XLI', name: 'Industrials' },
  { symbol: 'XLU', name: 'Utilities' },
  { symbol: 'XLB', name: 'Materials' },
  { symbol: 'XLRE', name: 'Real Estate' },
  { symbol: 'XLP', name: 'Cons. Staples' },
  { symbol: 'XLY', name: 'Cons. Disc.' },
  { symbol: 'XLC', name: 'Comm. Svc.' },
];

// GET /api/screener — batch quotes for screener universe
app.get('/api/screener', async (_req, res) => {
  try {
    const data = await cached('screener', 30_000, async () => {
      const symbols = SCREENER_UNIVERSE.map((s) => s.symbol);
      const resolved = symbols.map((s) => resolveSymbol(s));
      const results = await Promise.allSettled(
        resolved.map(({ ticker, displayName }) => fetchQuote(ticker, displayName))
      );
      return SCREENER_UNIVERSE.map((item, i) => {
        const r = results[i];
        const quote = r.status === 'fulfilled' ? r.value : null;
        return {
          symbol: item.symbol,
          sector: item.sector,
          name: quote?.name ?? item.symbol,
          price: quote?.price ?? 0,
          change: quote?.change ?? 0,
          changePercent: quote?.changePercent ?? 0,
          volume: quote?.volume ?? 0,
          marketCap: quote?.marketCap ?? null,
          dayHigh: quote?.dayHigh ?? null,
          dayLow: quote?.dayLow ?? null,
        };
      });
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sector-performance — sector ETF data
app.get('/api/sector-performance', async (_req, res) => {
  try {
    const data = await cached('sectors', 30_000, async () => {
      const results = await Promise.allSettled(
        SECTOR_ETFS.map(({ symbol }) => fetchQuote(symbol))
      );
      return SECTOR_ETFS.map(({ symbol, name }, i) => {
        const r = results[i];
        const q = r.status === 'fulfilled' ? r.value : null;
        return {
          symbol,
          name,
          price: q?.price ?? 0,
          change: q?.change ?? 0,
          changePercent: q?.changePercent ?? 0,
        };
      });
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gainers-losers — top movers from screener universe
app.get('/api/gainers-losers', async (_req, res) => {
  try {
    const data = await cached('gainers-losers', 30_000, async () => {
      const symbols = SCREENER_UNIVERSE.map((s) => s.symbol);
      const resolved = symbols.map((s) => resolveSymbol(s));
      const results = await Promise.allSettled(
        resolved.map(({ ticker, displayName }) => fetchQuote(ticker, displayName))
      );
      const all = SCREENER_UNIVERSE.map((item, i) => {
        const r = results[i];
        const q = r.status === 'fulfilled' ? r.value : null;
        return { symbol: item.symbol, name: q?.name ?? item.symbol, price: q?.price ?? 0, change: q?.change ?? 0, changePercent: q?.changePercent ?? 0, volume: q?.volume ?? 0 };
      }).filter((s) => s.price > 0);
      const sorted = [...all].sort((a, b) => b.changePercent - a.changePercent);
      return { gainers: sorted.slice(0, 5), losers: sorted.slice(-5).reverse() };
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fear-greed — simplified fear & greed from VIX
app.get('/api/fear-greed', async (_req, res) => {
  try {
    const data = await cached('fear-greed', 60_000, async () => {
      const vix = await fetchQuote('^VIX');
      const spy = await fetchQuote('^GSPC');
      // VIX-based score: VIX < 12 → 90 (extreme greed), VIX > 35 → 10 (extreme fear)
      const vixScore = Math.max(0, Math.min(100, 100 - ((vix.price - 12) / 23) * 80));
      // Momentum: positive change → greed, negative → fear
      const momScore = Math.max(0, Math.min(100, 50 + spy.changePercent * 15));
      const composite = Math.round(vixScore * 0.6 + momScore * 0.4);
      let label = 'Neutral';
      if (composite >= 80) label = 'Extreme Greed';
      else if (composite >= 60) label = 'Greed';
      else if (composite <= 20) label = 'Extreme Fear';
      else if (composite <= 40) label = 'Fear';
      return { score: composite, label, vix: vix.price, spyChange: spy.changePercent };
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/news-multi?tickers=AAPL,MSFT,GOOGL — aggregate news for multiple tickers
app.get('/api/news-multi', async (req, res) => {
  const tickers = ((req.query.tickers as string) || 'AAPL,MSFT,GOOGL,TSLA,BTC-USD').split(',').slice(0, 5);
  try {
    const allNews = await cached(`news-multi:${tickers.join(',')}`, 120_000, async () => {
      const results = await Promise.allSettled(tickers.map((t) => fetchNews(resolveSymbol(t.trim()).ticker)));
      const items: any[] = [];
      tickers.forEach((t, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') {
          r.value.forEach((n: any) => items.push({ ...n, ticker: t.trim().toUpperCase() }));
        }
      });
      return items.sort((a: any, b: any) => b.publishedAt - a.publishedAt).slice(0, 40);
    });
    res.json(allNews);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Analysis (Claude API) ─────────────────────────────────────────────────

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

app.post('/api/ai/analyze', async (req, res) => {
  if (!anthropic) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set. Add it to backend/.env' });
  const { ticker, ohlcv, rsi, macd, currentPrice } = req.body;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a financial analyst. Analyze ${ticker} stock data and respond ONLY with valid JSON (no markdown).
Current price: $${currentPrice}
Recent 10 OHLCV bars: ${JSON.stringify((ohlcv || []).slice(-10))}
RSI(14): ${rsi ?? 'N/A'}
MACD: ${JSON.stringify(macd ?? {})}

Respond with this exact JSON structure:
{"trend":{"direction":"bullish|bearish|neutral","strength":"strong|moderate|weak","summary":"..."},"signal":{"action":"buy|sell|hold","confidence":50,"reasoning":"..."},"keyLevels":{"support":[0,0],"resistance":[0,0]},"risk":{"level":"low|medium|high","factors":["..."]},"summary":"2-3 sentence analysis"}`
      }],
    });
    const text = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    res.json(jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Correlation Matrix ───────────────────────────────────────────────────────

app.post('/api/correlation', async (req, res) => {
  const { tickers } = req.body as { tickers: string[] };
  if (!tickers || tickers.length < 2 || tickers.length > 10) {
    return res.status(400).json({ error: 'Provide 2-10 tickers' });
  }
  try {
    const histories = await Promise.allSettled(
      tickers.map((t) => {
        const { ticker } = resolveSymbol(t);
        return fetchHistory(ticker, '1Y');
      })
    );
    // Get close prices, aligned by index (assumes same trading days)
    const closesMap: Record<string, number[]> = {};
    tickers.forEach((t, i) => {
      const r = histories[i];
      closesMap[t] = r.status === 'fulfilled' ? r.value.map((b: OHLCBar) => b.close) : [];
    });
    // Compute daily returns
    const returnsMap: Record<string, number[]> = {};
    tickers.forEach((t) => {
      const c = closesMap[t];
      returnsMap[t] = c.slice(1).map((v, i) => (v - c[i]) / c[i]);
    });
    // Pearson correlation
    const minLen = Math.min(...tickers.map((t) => returnsMap[t].length));
    const corr = (a: number[], b: number[]): number => {
      const n = Math.min(a.length, b.length, minLen);
      if (n < 5) return 0;
      const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
      const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < n; i++) {
        const va = a[i] - ma, vb = b[i] - mb;
        num += va * vb; da += va * va; db += vb * vb;
      }
      const denom = Math.sqrt(da * db);
      return denom === 0 ? 0 : num / denom;
    };
    const matrix: number[][] = tickers.map((t1) =>
      tickers.map((t2) => t1 === t2 ? 1 : Number(corr(returnsMap[t1], returnsMap[t2]).toFixed(4)))
    );
    res.json({ tickers, matrix });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Options Flow (simulated) ─────────────────────────────────────────────────

app.get('/api/options/:ticker', async (req, res) => {
  try {
    const { ticker } = resolveSymbol(req.params.ticker);
    const quote = await fetchQuote(ticker);
    const price = quote.price;
    // Generate mock options data
    const now = Date.now();
    const fridays = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(now + (7 + i * 7) * 86400_000);
      d.setDate(d.getDate() + (5 - d.getDay() + 7) % 7);
      return d.toISOString().split('T')[0];
    });
    const rng = (min: number, max: number) => min + Math.random() * (max - min);
    const options = Array.from({ length: 20 }, () => {
      const isCall = Math.random() > 0.45;
      const strike = Math.round(price * (0.85 + Math.random() * 0.3)) ;
      const expiry = fridays[Math.floor(Math.random() * fridays.length)];
      const vol = Math.floor(rng(100, 15000));
      const oi = Math.floor(rng(500, 50000));
      const iv = Number(rng(0.15, 0.85).toFixed(2));
      return {
        ticker: req.params.ticker.toUpperCase(),
        strike, expiry, type: isCall ? 'CALL' : 'PUT',
        volume: vol, openInterest: oi, impliedVolatility: iv,
        unusual: vol > oi * 0.5,
      };
    }).sort((a, b) => b.volume - a.volume);
    res.json(options);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Economic Calendar (mock + real upcoming events) ──────────────────────────

app.get('/api/calendar', async (_req, res) => {
  const now = new Date();
  const events = [
    { date: '2026-04-07', time: '08:30', event: 'Consumer Price Index (CPI)', impact: 'high', country: 'US', forecast: '2.8%', previous: '2.9%' },
    { date: '2026-04-08', time: '14:00', event: 'FOMC Meeting Minutes', impact: 'high', country: 'US', forecast: '-', previous: '-' },
    { date: '2026-04-10', time: '08:30', event: 'Initial Jobless Claims', impact: 'medium', country: 'US', forecast: '220K', previous: '218K' },
    { date: '2026-04-11', time: '08:30', event: 'Producer Price Index (PPI)', impact: 'medium', country: 'US', forecast: '0.3%', previous: '0.2%' },
    { date: '2026-04-14', time: '08:30', event: 'Retail Sales', impact: 'high', country: 'US', forecast: '0.5%', previous: '0.2%' },
    { date: '2026-04-15', time: 'BMO', event: 'AAPL Q2 Earnings', impact: 'high', country: 'US', forecast: '$1.62 EPS', previous: '$1.53 EPS' },
    { date: '2026-04-15', time: 'AMC', event: 'NFLX Q1 Earnings', impact: 'high', country: 'US', forecast: '$5.67 EPS', previous: '$5.28 EPS' },
    { date: '2026-04-16', time: '09:15', event: 'Industrial Production', impact: 'medium', country: 'US', forecast: '0.2%', previous: '0.7%' },
    { date: '2026-04-17', time: '08:30', event: 'Philadelphia Fed Index', impact: 'medium', country: 'US', forecast: '3.2', previous: '5.6' },
    { date: '2026-04-22', time: 'All Day', event: 'FOMC Rate Decision', impact: 'high', country: 'US', forecast: '4.25-4.50%', previous: '4.25-4.50%' },
    { date: '2026-04-25', time: '08:30', event: 'GDP (Q1 Advance)', impact: 'high', country: 'US', forecast: '2.1%', previous: '2.4%' },
    { date: '2026-04-28', time: '10:00', event: 'Consumer Confidence', impact: 'medium', country: 'US', forecast: '105.0', previous: '104.7' },
    { date: '2026-04-29', time: 'BMO', event: 'MSFT Q3 Earnings', impact: 'high', country: 'US', forecast: '$3.15 EPS', previous: '$2.94 EPS' },
    { date: '2026-04-29', time: 'BMO', event: 'GOOGL Q1 Earnings', impact: 'high', country: 'US', forecast: '$2.01 EPS', previous: '$1.89 EPS' },
    { date: '2026-04-30', time: 'AMC', event: 'META Q1 Earnings', impact: 'high', country: 'US', forecast: '$5.28 EPS', previous: '$4.71 EPS' },
    { date: '2026-05-02', time: '08:30', event: 'Non-Farm Payrolls', impact: 'high', country: 'US', forecast: '200K', previous: '228K' },
    { date: '2026-05-02', time: '08:30', event: 'Unemployment Rate', impact: 'high', country: 'US', forecast: '4.2%', previous: '4.2%' },
  ];
  res.json(events);
});

// ─── Portfolio Analytics ──────────────────────────────────────────────────────

app.post('/api/portfolio/analytics', async (req, res) => {
  const { positions } = req.body as { positions: { symbol: string; shares: number; avgPrice: number }[] };
  if (!positions || positions.length === 0) return res.json({ error: 'No positions' });
  try {
    // Fetch 1Y history for each position + SPY
    const allSymbols = [...positions.map((p) => p.symbol), 'SPY'];
    const allResolved = allSymbols.map((s) => resolveSymbol(s));
    const histories = await Promise.allSettled(
      allResolved.map(({ ticker }) => fetchHistory(ticker, '1Y'))
    );

    const closesMap: Record<string, number[]> = {};
    allSymbols.forEach((s, i) => {
      const r = histories[i];
      closesMap[s] = r.status === 'fulfilled' ? r.value.map((b: OHLCBar) => b.close) : [];
    });

    // Compute weighted portfolio daily returns
    const minLen = Math.min(...allSymbols.map((s) => closesMap[s].length));
    if (minLen < 10) return res.json({ error: 'Insufficient data' });

    const totalCost = positions.reduce((s, p) => s + p.shares * p.avgPrice, 0);
    const weights = positions.map((p) => (p.shares * p.avgPrice) / totalCost);

    const portReturns: number[] = [];
    for (let d = 1; d < minLen; d++) {
      let ret = 0;
      positions.forEach((p, i) => {
        const c = closesMap[p.symbol];
        if (c.length > d) ret += weights[i] * ((c[d] - c[d - 1]) / c[d - 1]);
      });
      portReturns.push(ret);
    }

    const spyCloses = closesMap['SPY'];
    const spyReturns = spyCloses.slice(1, minLen).map((v, i) => (v - spyCloses[i]) / spyCloses[i]);

    const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const std = (arr: number[], m: number) => Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);

    const avgRet = mean(portReturns);
    const stdRet = std(portReturns, avgRet);
    const riskFree = 0.04 / 252; // ~4% annual

    // Sharpe ratio (annualized)
    const sharpe = stdRet > 0 ? ((avgRet - riskFree) / stdRet) * Math.sqrt(252) : 0;

    // Sortino ratio
    const downsideReturns = portReturns.filter((r) => r < riskFree);
    const downsideStd = downsideReturns.length > 0 ? std(downsideReturns, mean(downsideReturns)) : 0;
    const sortino = downsideStd > 0 ? ((avgRet - riskFree) / downsideStd) * Math.sqrt(252) : 0;

    // Max drawdown
    let peak = 1, maxDD = 0, equity = 1;
    portReturns.forEach((r) => {
      equity *= (1 + r);
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
    });

    // Beta vs SPY
    const n = Math.min(portReturns.length, spyReturns.length);
    const mp = mean(portReturns.slice(0, n));
    const ms = mean(spyReturns.slice(0, n));
    let cov = 0, varSpy = 0;
    for (let i = 0; i < n; i++) {
      cov += (portReturns[i] - mp) * (spyReturns[i] - ms);
      varSpy += (spyReturns[i] - ms) ** 2;
    }
    const beta = varSpy > 0 ? cov / varSpy : 1;

    // Monte Carlo — 500 paths × 252 days
    const monteCarlo: number[][] = [];
    const mu = avgRet;
    const sigma = stdRet;
    for (let p = 0; p < 500; p++) {
      const path = [totalCost];
      for (let d = 0; d < 252; d++) {
        const z = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
        path.push(path[path.length - 1] * Math.exp((mu - sigma * sigma / 2) + sigma * z));
      }
      monteCarlo.push(path);
    }

    res.json({
      sharpe: Number(sharpe.toFixed(3)),
      sortino: Number(sortino.toFixed(3)),
      maxDrawdown: Number((maxDD * 100).toFixed(2)),
      beta: Number(beta.toFixed(3)),
      annualizedReturn: Number((avgRet * 252 * 100).toFixed(2)),
      annualizedVolatility: Number((stdRet * Math.sqrt(252) * 100).toFixed(2)),
      monteCarlo,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Screener sparklines (5d closes for each stock) ──────────────────────────

app.get('/api/screener-sparklines', async (_req, res) => {
  try {
    const data = await cached('sparklines', 120_000, async () => {
      const symbols = SCREENER_UNIVERSE.map((s) => s.symbol);
      const results = await Promise.allSettled(
        symbols.map((sym) => {
          const { ticker } = resolveSymbol(sym);
          return fetchHistory(ticker, '5D');
        })
      );
      const map: Record<string, number[]> = {};
      symbols.forEach((sym, i) => {
        const r = results[i];
        map[sym] = r.status === 'fulfilled' ? r.value.map((b: OHLCBar) => b.close) : [];
      });
      return map;
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Heatmap universe ─────────────────────────────────────────────────────────

const HEATMAP_SP500: { symbol: string; sector: string; name: string }[] = [
  // Technology
  { symbol: 'AAPL', sector: 'Technology', name: 'Apple' },
  { symbol: 'MSFT', sector: 'Technology', name: 'Microsoft' },
  { symbol: 'GOOGL', sector: 'Technology', name: 'Alphabet' },
  { symbol: 'NVDA', sector: 'Technology', name: 'NVIDIA' },
  { symbol: 'META', sector: 'Technology', name: 'Meta' },
  { symbol: 'AMZN', sector: 'Technology', name: 'Amazon' },
  { symbol: 'AVGO', sector: 'Technology', name: 'Broadcom' },
  { symbol: 'ORCL', sector: 'Technology', name: 'Oracle' },
  { symbol: 'CRM', sector: 'Technology', name: 'Salesforce' },
  { symbol: 'AMD', sector: 'Technology', name: 'AMD' },
  { symbol: 'ADBE', sector: 'Technology', name: 'Adobe' },
  { symbol: 'INTC', sector: 'Technology', name: 'Intel' },
  { symbol: 'CSCO', sector: 'Technology', name: 'Cisco' },
  // Financials
  { symbol: 'JPM', sector: 'Financials', name: 'JPMorgan' },
  { symbol: 'V', sector: 'Financials', name: 'Visa' },
  { symbol: 'MA', sector: 'Financials', name: 'Mastercard' },
  { symbol: 'BAC', sector: 'Financials', name: 'Bank of America' },
  { symbol: 'WFC', sector: 'Financials', name: 'Wells Fargo' },
  { symbol: 'GS', sector: 'Financials', name: 'Goldman Sachs' },
  { symbol: 'BLK', sector: 'Financials', name: 'BlackRock' },
  // Healthcare
  { symbol: 'UNH', sector: 'Healthcare', name: 'UnitedHealth' },
  { symbol: 'JNJ', sector: 'Healthcare', name: 'Johnson & Johnson' },
  { symbol: 'LLY', sector: 'Healthcare', name: 'Eli Lilly' },
  { symbol: 'PFE', sector: 'Healthcare', name: 'Pfizer' },
  { symbol: 'MRK', sector: 'Healthcare', name: 'Merck' },
  { symbol: 'ABBV', sector: 'Healthcare', name: 'AbbVie' },
  { symbol: 'TMO', sector: 'Healthcare', name: 'Thermo Fisher' },
  // Consumer
  { symbol: 'TSLA', sector: 'Consumer Disc.', name: 'Tesla' },
  { symbol: 'HD', sector: 'Consumer Disc.', name: 'Home Depot' },
  { symbol: 'MCD', sector: 'Consumer Disc.', name: 'McDonalds' },
  { symbol: 'NKE', sector: 'Consumer Disc.', name: 'Nike' },
  { symbol: 'WMT', sector: 'Consumer Staples', name: 'Walmart' },
  { symbol: 'PG', sector: 'Consumer Staples', name: 'Procter & Gamble' },
  { symbol: 'COST', sector: 'Consumer Staples', name: 'Costco' },
  { symbol: 'KO', sector: 'Consumer Staples', name: 'Coca-Cola' },
  { symbol: 'PEP', sector: 'Consumer Staples', name: 'PepsiCo' },
  // Energy
  { symbol: 'XOM', sector: 'Energy', name: 'Exxon Mobil' },
  { symbol: 'CVX', sector: 'Energy', name: 'Chevron' },
  { symbol: 'COP', sector: 'Energy', name: 'ConocoPhillips' },
  { symbol: 'SLB', sector: 'Energy', name: 'Schlumberger' },
  // Industrials
  { symbol: 'CAT', sector: 'Industrials', name: 'Caterpillar' },
  { symbol: 'GE', sector: 'Industrials', name: 'GE Aerospace' },
  { symbol: 'BA', sector: 'Industrials', name: 'Boeing' },
  { symbol: 'UPS', sector: 'Industrials', name: 'UPS' },
  { symbol: 'HON', sector: 'Industrials', name: 'Honeywell' },
  { symbol: 'LMT', sector: 'Industrials', name: 'Lockheed Martin' },
  // Comm Services
  { symbol: 'NFLX', sector: 'Communication', name: 'Netflix' },
  { symbol: 'DIS', sector: 'Communication', name: 'Disney' },
  { symbol: 'TMUS', sector: 'Communication', name: 'T-Mobile' },
  // Real Estate / Utilities
  { symbol: 'NEE', sector: 'Utilities', name: 'NextEra Energy' },
  { symbol: 'AMT', sector: 'Real Estate', name: 'American Tower' },
];

const HEATMAP_IPSA: { symbol: string; sector: string; name: string }[] = [
  { symbol: 'BSANTANDER.SN', sector: 'Financials', name: 'Banco Santander Chile' },
  { symbol: 'CHILE.SN',      sector: 'Financials', name: 'Banco de Chile' },
  { symbol: 'BCI.SN',        sector: 'Financials', name: 'BCI' },
  { symbol: 'ITAUCL.SN',     sector: 'Financials', name: 'Itaú Chile' },
  { symbol: 'FALABELLA.SN',  sector: 'Consumer',   name: 'Falabella' },
  { symbol: 'CENCOSUD.SN',   sector: 'Consumer',   name: 'Cencosud' },
  { symbol: 'COPEC.SN',      sector: 'Energy',     name: 'Copec' },
  { symbol: 'SQM-B.SN',      sector: 'Materials',  name: 'SQM' },
  { symbol: 'CMPC.SN',       sector: 'Materials',  name: 'CMPC' },
  { symbol: 'CCU.SN',        sector: 'Consumer',   name: 'CCU' },
  { symbol: 'ENELAM.SN',     sector: 'Utilities',  name: 'Enel Américas' },
  { symbol: 'VAPORES.SN',    sector: 'Industrials', name: 'Vapores' },
  { symbol: 'CAP.SN',        sector: 'Materials',  name: 'CAP' },
  { symbol: 'ENELCHILE.SN',  sector: 'Utilities',  name: 'Enel Chile' },
  { symbol: 'PARAUCO.SN',    sector: 'Real Estate', name: 'Parque Arauco' },
  { symbol: 'COLBUN.SN',     sector: 'Utilities',  name: 'Colbún' },
  { symbol: 'IAM.SN',        sector: 'Utilities',  name: 'IAM' },
  { symbol: 'AGUAS-A.SN',    sector: 'Utilities',  name: 'Aguas Andinas' },
  { symbol: 'ECL.SN',        sector: 'Utilities',  name: 'ECL' },
  { symbol: 'SECURITY.SN',   sector: 'Financials', name: 'Security' },
];

app.get('/api/heatmap/:market', async (req, res) => {
  const market = req.params.market; // 'sp500' or 'ipsa'
  const universe = market === 'ipsa' ? HEATMAP_IPSA : HEATMAP_SP500;
  try {
    const data = await cached(`heatmap:${market}`, 30_000, async () => {
      const resolved = universe.map((s) => resolveSymbol(s.symbol));
      const richData = await fetchRichQuotes(resolved.map((r) => r.ticker));
      const results = await Promise.allSettled(
        resolved.map(({ ticker, displayName }) => fetchQuote(ticker, displayName, richData))
      );
      return universe.map((item, i) => {
        const r = results[i];
        const q = r.status === 'fulfilled' ? r.value : null;
        return {
          symbol: item.symbol,
          name: item.name,
          sector: item.sector,
          price: q?.price ?? 0,
          changePercent: q?.changePercent ?? 0,
          marketCap: q?.marketCap ?? null,
        };
      }).filter((s) => s.price > 0);
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Debug: raw quote response ───────────────────────────────────────────────

app.get('/api/debug/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  try {
    // v7 rich quote via crumb
    const richData = await fetchRichQuotes([symbol]);
    const richQuote = richData[symbol] || Object.values(richData)[0] || null;

    // v8 chart meta
    const chartUrl = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`;
    const chartData = await yfFetch(chartUrl);
    const meta = chartData?.chart?.result?.[0]?.meta ?? null;

    // Final merged quote via our fetchQuote
    cache.delete(`quote:${symbol}`); // bypass cache for debug
    const merged = await fetchQuote(symbol);

    res.json({
      crumbStatus: { hasCrumb: !!yfCrumb, crumbAge: yfCrumb ? Date.now() - crumbFetchedAt : null },
      v7RichQuote: richQuote,
      v7RichKeys: richQuote ? Object.keys(richQuote) : [],
      chartMeta: meta,
      mergedResult: merged,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\x1b[36m[backend]\x1b[0m Server running at http://localhost:${PORT}`);
});
