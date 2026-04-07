-- ============================================================================
-- FinVision Supabase Migration
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- 1. Portfolios table
create table public.portfolios (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'My Portfolio',
  created_at timestamptz default now() not null
);

-- 2. Positions table
create table public.positions (
  id uuid default gen_random_uuid() primary key,
  portfolio_id uuid references public.portfolios(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  ticker text not null,
  shares numeric not null check (shares > 0),
  avg_buy_price numeric not null check (avg_buy_price > 0),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 3. Watchlist table
create table public.watchlist (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  ticker text not null,
  added_at timestamptz default now() not null,
  unique (user_id, ticker)
);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

alter table public.portfolios enable row level security;
alter table public.positions enable row level security;
alter table public.watchlist enable row level security;

-- Portfolios: users can only CRUD their own
create policy "Users can view own portfolios"
  on public.portfolios for select
  using (auth.uid() = user_id);

create policy "Users can insert own portfolios"
  on public.portfolios for insert
  with check (auth.uid() = user_id);

create policy "Users can update own portfolios"
  on public.portfolios for update
  using (auth.uid() = user_id);

create policy "Users can delete own portfolios"
  on public.portfolios for delete
  using (auth.uid() = user_id);

-- Positions: users can only CRUD their own
create policy "Users can view own positions"
  on public.positions for select
  using (auth.uid() = user_id);

create policy "Users can insert own positions"
  on public.positions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own positions"
  on public.positions for update
  using (auth.uid() = user_id);

create policy "Users can delete own positions"
  on public.positions for delete
  using (auth.uid() = user_id);

-- Watchlist: users can only CRUD their own
create policy "Users can view own watchlist"
  on public.watchlist for select
  using (auth.uid() = user_id);

create policy "Users can insert own watchlist"
  on public.watchlist for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own watchlist"
  on public.watchlist for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- Indexes
-- ============================================================================

create index idx_portfolios_user on public.portfolios(user_id);
create index idx_positions_portfolio on public.positions(portfolio_id);
create index idx_positions_user on public.positions(user_id);
create index idx_watchlist_user on public.watchlist(user_id);

-- ============================================================================
-- Auto-update updated_at on positions
-- ============================================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_positions_updated_at
  before update on public.positions
  for each row
  execute function public.handle_updated_at();

-- ============================================================================
-- Auto-create default portfolio for new users
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.portfolios (user_id, name)
  values (new.id, 'My Portfolio');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- Enable Realtime for positions and watchlist
-- ============================================================================

alter publication supabase_realtime add table public.positions;
alter publication supabase_realtime add table public.watchlist;
