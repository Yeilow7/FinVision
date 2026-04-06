import { useEffect, useState } from 'react';
import { Newspaper, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import type { NewsItem, Quote } from '../types';

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

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  return `$${p.toFixed(4)}`;
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toString();
}

function formatMcap(v: number | null | undefined): string {
  if (v == null || v === 0) return 'N/A';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

interface Props {
  ticker: string;
  quote: Quote | null;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-navy-700 last:border-0">
      <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">{label}</span>
      <span className="text-xs font-mono text-slate-200">{value}</span>
    </div>
  );
}

export default function NewsPanel({ ticker, quote }: Props) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setNews([]);
    api.getNews(ticker)
      .then(setNews)
      .catch(() => setNews([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  const up = quote ? quote.changePercent >= 0 : true;

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      {/* Quote stats */}
      {quote && (
        <div className="bg-navy-800 border border-navy-600 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{ticker}</span>
              <div className="text-lg font-mono font-bold text-white leading-tight">
                {formatPrice(quote.price)}
              </div>
            </div>
            <div className="text-right">
              <span className={`text-sm font-mono font-bold ${up ? 'text-accent-green' : 'text-accent-red'}`}>
                {up ? '+' : ''}{quote.changePercent.toFixed(2)}%
              </span>
              <div className={`text-xs font-mono ${up ? 'text-accent-green' : 'text-accent-red'}`}>
                {up ? '+' : ''}{quote.change.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="space-y-0">
            {quote.open != null && (
              <StatRow label="Open" value={formatPrice(quote.open)} />
            )}
            {quote.previousClose != null && (
              <StatRow label="Prev Close" value={formatPrice(quote.previousClose)} />
            )}
            {quote.dayHigh != null && (
              <StatRow label="Day High" value={formatPrice(quote.dayHigh)} />
            )}
            {quote.dayLow != null && (
              <StatRow label="Day Low" value={formatPrice(quote.dayLow)} />
            )}
            {quote.volume > 0 && (
              <StatRow label="Volume" value={formatVolume(quote.volume)} />
            )}
            {quote.marketCap != null && (
              <StatRow label="Mkt Cap" value={formatMcap(quote.marketCap)} />
            )}
            {quote.fiftyTwoWeekHigh != null && (
              <StatRow label="52W High" value={formatPrice(quote.fiftyTwoWeekHigh)} />
            )}
            {quote.fiftyTwoWeekLow != null && (
              <StatRow label="52W Low" value={formatPrice(quote.fiftyTwoWeekLow)} />
            )}
          </div>
        </div>
      )}

      {/* News */}
      <div className="bg-navy-800 border border-navy-600 rounded-xl p-3 flex-1">
        <div className="flex items-center gap-1.5 mb-3">
          <Newspaper size={12} className="text-accent-cyan" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">News</span>
          <span className="text-[10px] font-mono text-slate-600 ml-1">· {ticker}</span>
        </div>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5">
                <div className="h-2.5 bg-navy-600 rounded w-full" />
                <div className="h-2.5 bg-navy-600 rounded w-3/4" />
                <div className="h-2 bg-navy-700 rounded w-1/3 mt-1" />
              </div>
            ))}
          </div>
        )}

        {!loading && news.length === 0 && (
          <div className="text-slate-600 text-xs text-center py-6">No news available</div>
        )}

        <div className="space-y-3">
          {news.map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <div className="text-xs text-slate-300 group-hover:text-white leading-relaxed line-clamp-2 transition-colors">
                {item.title}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] font-mono text-slate-600">{item.publisher}</span>
                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-600">
                  <span>{timeAgo(item.publishedAt)}</span>
                  <ExternalLink size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              {i < news.length - 1 && <div className="mt-3 border-b border-navy-700" />}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
