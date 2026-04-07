import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { DbWatchlistItem } from '../lib/supabase';

export function useWatchlist() {
  const { user } = useAuth();
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) { setSymbols([]); setLoading(false); return; }

    const { data } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', user.id)
      .order('added_at');

    setSymbols((data ?? []).map((r: DbWatchlistItem) => r.ticker));
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('watchlist-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'watchlist', filter: `user_id=eq.${user.id}` },
        () => { loadData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadData]);

  const addSymbol = useCallback(async (ticker: string) => {
    if (!user) return;
    await supabase
      .from('watchlist')
      .upsert({ user_id: user.id, ticker }, { onConflict: 'user_id,ticker' });
  }, [user]);

  const removeSymbol = useCallback(async (ticker: string) => {
    if (!user) return;
    await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('ticker', ticker);
  }, [user]);

  return { symbols, loading, addSymbol, removeSymbol };
}
