import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Database row types ─────────────────────────────────────────────────────

export interface DbPortfolio {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface DbPosition {
  id: string;
  portfolio_id: string;
  user_id: string;
  ticker: string;
  shares: number;
  avg_buy_price: number;
  created_at: string;
  updated_at: string;
}

export interface DbWatchlistItem {
  id: string;
  user_id: string;
  ticker: string;
  added_at: string;
}
