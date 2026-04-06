import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { useAppStore } from './store';

const Terminal = lazy(() => import('./pages/Terminal'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Screener = lazy(() => import('./pages/Screener'));
const Markets = lazy(() => import('./pages/Markets'));
const News = lazy(() => import('./pages/News'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Heatmap = lazy(() => import('./pages/Heatmap'));

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex items-center gap-2 text-accent-cyan text-sm font-mono">
        <div className="w-4 h-4 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
        Loading…
      </div>
    </div>
  );
}

function KeyboardShortcuts() {
  const { setSearchOpen } = useAppStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement).isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === 's' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSearchOpen]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <KeyboardShortcuts />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/terminal" replace />} />
          <Route path="terminal" element={<Suspense fallback={<PageLoader />}><Terminal /></Suspense>} />
          <Route path="portfolio" element={<Suspense fallback={<PageLoader />}><Portfolio /></Suspense>} />
          <Route path="screener" element={<Suspense fallback={<PageLoader />}><Screener /></Suspense>} />
          <Route path="markets" element={<Suspense fallback={<PageLoader />}><Markets /></Suspense>} />
          <Route path="news" element={<Suspense fallback={<PageLoader />}><News /></Suspense>} />
          <Route path="calendar" element={<Suspense fallback={<PageLoader />}><Calendar /></Suspense>} />
          <Route path="heatmap" element={<Suspense fallback={<PageLoader />}><Heatmap /></Suspense>} />
          <Route path="*" element={<Navigate to="/terminal" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
