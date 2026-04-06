import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PortfolioPosition, PriceAlert, ThemeMode } from '../types';

interface AppStore {
  selectedTicker: string;
  setSelectedTicker: (t: string) => void;

  watchlist: string[];
  setWatchlist: (s: string[] | ((prev: string[]) => string[])) => void;

  positions: PortfolioPosition[];
  setPositions: (p: PortfolioPosition[] | ((prev: PortfolioPosition[]) => PortfolioPosition[])) => void;

  recentSearches: string[];
  addRecentSearch: (s: string) => void;

  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;

  theme: ThemeMode;
  toggleTheme: () => void;

  alerts: PriceAlert[];
  addAlert: (a: Omit<PriceAlert, 'id' | 'triggered' | 'createdAt'>) => void;
  removeAlert: (id: string) => void;
  triggerAlert: (id: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      selectedTicker: 'AAPL',
      setSelectedTicker: (t) => set({ selectedTicker: t }),

      watchlist: ['AAPL', 'MSFT', 'GOOGL', 'BTC-USD', 'ETH-USD'],
      setWatchlist: (s) =>
        set({ watchlist: typeof s === 'function' ? s(get().watchlist) : s }),

      positions: [],
      setPositions: (p) =>
        set({ positions: typeof p === 'function' ? p(get().positions) : p }),

      recentSearches: [],
      addRecentSearch: (s) =>
        set((state) => ({
          recentSearches: [s, ...state.recentSearches.filter((r) => r !== s)].slice(0, 8),
        })),

      searchOpen: false,
      setSearchOpen: (v) => set({ searchOpen: v }),

      theme: 'dark',
      toggleTheme: () => set((s) => {
        const next = s.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.classList.toggle('light', next === 'light');
        return { theme: next };
      }),

      alerts: [],
      addAlert: (a) => set((s) => ({
        alerts: [...s.alerts, { ...a, id: crypto.randomUUID(), triggered: false, createdAt: Date.now() }],
      })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      triggerAlert: (id) => set((s) => ({
        alerts: s.alerts.map((a) => a.id === id ? { ...a, triggered: true, active: false } : a),
      })),
    }),
    {
      name: 'finvision-store',
      partialize: (state) => ({
        selectedTicker: state.selectedTicker,
        watchlist: state.watchlist,
        positions: state.positions,
        recentSearches: state.recentSearches,
        theme: state.theme,
        alerts: state.alerts,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme === 'light') {
          document.documentElement.classList.add('light');
        }
      },
    }
  )
);
