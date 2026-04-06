import { useState, useEffect, useCallback } from 'react';
import { Search, Newspaper, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import type { NewsItem } from '../types';

const CATEGORIES = ['All', 'Stocks', 'Crypto', 'Macro', 'Earnings'];
const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'BTC-USD'];
const CRYPTO_KEYWORDS = ['bitcoin', 'crypto', 'ethereum', 'btc', 'eth', 'blockchain'];
const MACRO_KEYWORDS = ['fed', 'inflation', 'gdp', 'rates', 'treasury', 'economy', 'recession', 'jobs'];
const EARNINGS_KEYWORDS = ['earnings', 'revenue', 'profit', 'quarterly', 'guidance', 'eps', 'beat', 'miss'];

function categorize(item: NewsItem): string[] {
  const text = (item.title + ' ' + item.publisher).toLowerCase();
  const cats: string[] = [];
  if (CRYPTO_KEYWORDS.some((k) => text.includes(k))) cats.push('Crypto');
  if (MACRO_KEYWORDS.some((k) => text.includes(k))) cats.push('Macro');
  if (EARNINGS_KEYWORDS.some((k) => text.includes(k))) cats.push('Earnings');
  if (cats.length === 0) cats.push('Stocks');
  return cats;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function News() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [tickerSearch, setTickerSearch] = useState('');
  const [searchedTicker, setSearchedTicker] = useState('');

  const fetchDefault = useCallback(() => {
    setLoading(true);
    api.getNewsMulti(DEFAULT_TICKERS).then(setNews).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchDefault(); }, [fetchDefault]);

  const searchTicker = () => {
    const t = tickerSearch.toUpperCase().trim();
    if (!t) { setSearchedTicker(''); fetchDefault(); return; }
    setSearchedTicker(t);
    setLoading(true);
    api.getNews(t).then((data) => {
      setNews(data.map((n) => ({ ...n, ticker: t })));
    }).catch(() => setNews([])).finally(() => setLoading(false));
  };

  const clearSearch = () => {
    setTickerSearch('');
    setSearchedTicker('');
    fetchDefault();
  };

  const filtered = category === 'All'
    ? news
    : news.filter((n) => categorize(n).includes(category));

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-[1000px] mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">News Feed</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {searchedTicker ? `Showing news for ${searchedTicker}` : 'Latest financial headlines'}
          </p>
        </div>
        <button onClick={() => searchedTicker ? searchTicker() : fetchDefault()} disabled={loading}
          className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Search + filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Ticker search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input-field pl-8"
              placeholder="Filter by ticker (AAPL, BTC-USD…)"
              value={tickerSearch}
              onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && searchTicker()}
            />
          </div>
          <button onClick={searchTicker} className="btn-primary text-xs">Search</button>
          {searchedTicker && (
            <button onClick={clearSearch} className="btn-ghost text-xs">Clear</button>
          )}

          <div className="h-4 w-px bg-navy-600" />

          {/* Category tabs */}
          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  category === c ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* News items */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 bg-navy-600 rounded w-3/4 mb-2" />
              <div className="h-3 bg-navy-600 rounded w-1/2 mb-3" />
              <div className="h-2 bg-navy-700 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <Newspaper size={32} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">No news found{searchedTicker ? ` for ${searchedTicker}` : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, i) => {
            const cats = categorize(item);
            return (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
                className="card block group hover:border-navy-500 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200 group-hover:text-white leading-relaxed line-clamp-2 transition-colors font-medium">
                      {item.title}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] font-mono text-slate-500">{item.publisher}</span>
                      <span className="text-[10px] font-mono text-slate-600">{timeAgo(item.publishedAt)}</span>
                      {item.ticker && (
                        <span className="px-1.5 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan text-[10px] font-mono font-bold">{item.ticker}</span>
                      )}
                      {cats.map((c) => (
                        <span key={c} className="px-1.5 py-0.5 rounded bg-navy-600 text-slate-500 text-[9px] font-mono uppercase">{c}</span>
                      ))}
                    </div>
                  </div>
                  <ExternalLink size={14} className="text-slate-700 group-hover:text-slate-400 transition-colors shrink-0 mt-1" />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
