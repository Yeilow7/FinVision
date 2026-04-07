import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { DbPosition, DbPortfolio } from '../lib/supabase';
import type { PortfolioPosition } from '../types';

export function usePositions() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Get or create the default portfolio, then load positions
  const loadData = useCallback(async () => {
    if (!user) { setPositions([]); setLoading(false); return; }

    // Get portfolio
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    let pid: string;
    if (portfolios && portfolios.length > 0) {
      pid = portfolios[0].id;
    } else {
      const { data } = await supabase
        .from('portfolios')
        .insert({ user_id: user.id, name: 'My Portfolio' })
        .select('id')
        .single();
      pid = data!.id;
    }
    setPortfolioId(pid);

    // Get positions
    const { data: rows } = await supabase
      .from('positions')
      .select('*')
      .eq('portfolio_id', pid)
      .order('created_at');

    setPositions(
      (rows ?? []).map((r: DbPosition) => ({
        symbol: r.ticker,
        shares: Number(r.shares),
        avgPrice: Number(r.avg_buy_price),
      }))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('positions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` },
        () => { loadData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadData]);

  const addPosition = useCallback(async (symbol: string, shares: number, avgPrice: number) => {
    if (!user || !portfolioId) return;

    // Check if position exists
    const { data: existing } = await supabase
      .from('positions')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('ticker', symbol)
      .limit(1);

    if (existing && existing.length > 0) {
      const old = existing[0] as DbPosition;
      const oldShares = Number(old.shares);
      const oldAvg = Number(old.avg_buy_price);
      const totalCost = oldShares * oldAvg + shares * avgPrice;
      const totalShares = oldShares + shares;
      await supabase
        .from('positions')
        .update({ shares: totalShares, avg_buy_price: totalCost / totalShares })
        .eq('id', old.id);
    } else {
      await supabase
        .from('positions')
        .insert({
          portfolio_id: portfolioId,
          user_id: user.id,
          ticker: symbol,
          shares,
          avg_buy_price: avgPrice,
        });
    }
  }, [user, portfolioId]);

  const removePosition = useCallback(async (symbol: string) => {
    if (!user || !portfolioId) return;
    await supabase
      .from('positions')
      .delete()
      .eq('portfolio_id', portfolioId)
      .eq('ticker', symbol);
  }, [user, portfolioId]);

  return { positions, loading, addPosition, removePosition };
}
