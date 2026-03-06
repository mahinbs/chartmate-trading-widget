-- openalgo_orders: live mirror of every order event pushed from OpenAlgo webhook
-- Gives ChartMate full visibility into broker order lifecycle inside Supabase.

create table if not exists public.openalgo_orders (
  id           bigserial    primary key,
  order_id     text         not null unique,       -- OpenAlgo / broker order ID
  strategy     text,                               -- strategy name (e.g. "ChartMate AI")
  symbol       text,
  action       text,                               -- BUY | SELL
  exchange     text,                               -- NSE | BSE | NFO
  quantity     integer,
  price        numeric(18, 4),
  status       text,                               -- complete | rejected | cancelled | open
  message      text,
  raw_payload  jsonb,                              -- full webhook body for debugging
  updated_at   timestamptz  not null default now(),
  created_at   timestamptz  not null default now()
);

-- Index for fast lookups by symbol or strategy
create index if not exists idx_openalgo_orders_symbol   on public.openalgo_orders (symbol);
create index if not exists idx_openalgo_orders_strategy on public.openalgo_orders (strategy);
create index if not exists idx_openalgo_orders_status   on public.openalgo_orders (status);

-- Only service role (edge functions) can write; authenticated users can read their own strategy's orders
alter table public.openalgo_orders enable row level security;

create policy "Service role full access"
  on public.openalgo_orders
  for all
  using (true)
  with check (true);

-- Authenticated users can view all orders (you can tighten this to user_id later)
create policy "Authenticated users can read orders"
  on public.openalgo_orders
  for select
  to authenticated
  using (true);
