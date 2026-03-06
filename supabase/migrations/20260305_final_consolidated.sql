-- ============================================================
-- ChartMate + TradeBrainX — Final Consolidated Migration
-- Covers: broker execution fields, OpenAlgo API key,
--         openalgo_orders mirror table
-- Safe to re-run (all statements use IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- 1. user_trading_integration: store OpenAlgo (trading engine) API key
alter table public.user_trading_integration
  add column if not exists openalgo_api_key text;

-- 2. active_trades: store broker execution metadata so we can square off
alter table public.active_trades
  add column if not exists broker_order_id text,
  add column if not exists exit_order_id   text,
  add column if not exists exchange        text default 'NSE',
  add column if not exists product         text default 'CNC',
  add column if not exists strategy_type   text;

-- 3. openalgo_orders: live mirror of every order event pushed from the
--    TradeBrainX trading engine webhook
create table if not exists public.openalgo_orders (
  id           bigserial    primary key,
  order_id     text         not null unique,
  strategy     text,
  symbol       text,
  action       text,
  exchange     text,
  quantity     integer,
  price        numeric(18,4),
  status       text,
  message      text,
  raw_payload  jsonb,
  updated_at   timestamptz  not null default now(),
  created_at   timestamptz  not null default now()
);

create index if not exists idx_openalgo_orders_symbol   on public.openalgo_orders (symbol);
create index if not exists idx_openalgo_orders_strategy on public.openalgo_orders (strategy);
create index if not exists idx_openalgo_orders_status   on public.openalgo_orders (status);

alter table public.openalgo_orders enable row level security;

-- Service role (edge functions) can do everything
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'openalgo_orders' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access"
      on public.openalgo_orders for all using (true) with check (true);
  end if;
end $$;

-- Authenticated users can read
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'openalgo_orders' and policyname = 'Authenticated users can read orders'
  ) then
    create policy "Authenticated users can read orders"
      on public.openalgo_orders for select to authenticated using (true);
  end if;
end $$;
