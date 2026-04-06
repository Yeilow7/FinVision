import { useState, useEffect } from 'react';
import WatchlistSidebar from '../components/WatchlistSidebar';
import PortfolioSidebar from '../components/PortfolioSidebar';
import ChartPanel from '../components/ChartPanel';
import NewsPanel from '../components/NewsPanel';
import { useAppStore } from '../store';
import { api } from '../api/client';
import type { Quote } from '../types';

function RightPanel({ ticker }: { ticker: string }) {
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    api.getQuote(ticker).then(setQuote).catch(() => {});
    const id = setInterval(() => {
      api.getQuote(ticker).then(setQuote).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [ticker]);

  return <NewsPanel ticker={ticker} quote={quote} />;
}

export default function Terminal() {
  const { selectedTicker } = useAppStore();

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-[270px] shrink-0 flex flex-col border-r border-navy-600 overflow-hidden bg-navy-900">
        <div className="overflow-hidden border-b border-navy-600" style={{ flex: '0 0 55%' }}>
          <WatchlistSidebar />
        </div>
        <div className="overflow-y-auto" style={{ flex: '1 1 auto' }}>
          <PortfolioSidebar />
        </div>
      </aside>

      {/* Center chart */}
      <main className="flex-1 overflow-hidden flex flex-col p-3 min-w-0 bg-navy-950">
        <ChartPanel />
      </main>

      {/* Right panel */}
      <aside className="w-[285px] shrink-0 border-l border-navy-600 overflow-y-auto p-3 bg-navy-900">
        <RightPanel ticker={selectedTicker} />
      </aside>
    </div>
  );
}
