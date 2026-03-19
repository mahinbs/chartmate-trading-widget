create table if not exists public.strategy_scan_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  scan_started_at timestamptz not null default now(),
  scan_completed_at timestamptz not null default now(),
  strategies text[] not null default '{}',
  custom_strategy_ids text[] not null default '{}',
  asset_type text,
  data_source text,
  indicator_source text,
  interval text,
  signal_count int not null default 0,
  live_count int not null default 0,
  predicted_count int not null default 0,
  signals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_strategy_scan_history_user_created
  on public.strategy_scan_history(user_id, created_at desc);

alter table public.strategy_scan_history enable row level security;

drop policy if exists "Users can view their strategy scan history" on public.strategy_scan_history;
create policy "Users can view their strategy scan history"
on public.strategy_scan_history
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their strategy scan history" on public.strategy_scan_history;
create policy "Users can insert their strategy scan history"
on public.strategy_scan_history
for insert
with check (auth.uid() = user_id);
