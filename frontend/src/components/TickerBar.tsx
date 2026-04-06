import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../api/client';
import type { Quote } from '../types';

const TICKER_SYMBOLS = ['SPY', 'QQQ', 'BTC-USD', 'ETH-USD', 'CLP=X', 'IPSA.SN'];

const TICKER_LABELS: Record<string, string> = {
  'SPY':    'S&P 500 ETF',
  'QQQ':    'NASDAQ ETF',
  'BTC-USD':'Bitcoin',
  'ETH-USD':'Ethereum',
  'CLP=X':  'USD/CLP',
  'IPSA.SN':'IPSA',
};

function fmt(quote: Quote): string {
  const p = quote.price;
  if (quote.symbol === 'CLP=X') return p.toFixed(2);
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export default function TickerBar() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    const cleanup = api.subscribeStream(TICKER_SYMBOLS, (data) => {
      setQuotes((prev) => ({ ...prev, ...data }));
    });
    return cleanup;
  }, []);

  const items = TICKER_SYMBOLS.map((sym) => ({ sym, q: quotes[sym] }));
  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="h-8 bg-navy-900 border-b border-navy-600 overflow-hidden flex items-center">
      <div className="w-20 shrink-0 flex items-center px-3 border-r border-navy-600 h-full">
        <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">LIVE</span>
        <span className="w-1.5 h-1.5 rounded-full bg-accent-green ml-1.5 animate-pulse" />
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div className="animate-marquee">
          {doubled.map(({ sym, q }, idx) => {
            const up = q ? q.changePercent >= 0 : true;
            return (
              <span key={`${sym}-${idx}`} className="inline-flex items-center gap-1.5 mx-5">
                <span className="text-[11px] font-mono font-bold text-slate-300">
                  {TICKER_LABELS[sym] || sym}
                </span>
                {q ? (
                  <>
                    <span className="text-[11px] font-mono text-white">{fmt(q)}</span>
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${
                        up ? 'text-accent-green' : 'text-accent-red'
                      }`}
                    >
                      {up ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                      {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] font-mono text-slate-600">—</span>
                )}
                <span className="text-navy-600 text-[10px] ml-2">·</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
