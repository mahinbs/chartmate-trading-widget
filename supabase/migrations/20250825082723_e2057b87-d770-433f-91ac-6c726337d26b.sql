
-- 1) Create table to store predictions
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  symbol text not null,
  timeframe text not null,
  investment double precision,
  current_price double precision,
  expected_move_percent double precision,
  expected_move_direction text,
  price_target_min double precision,
  price_target_max double precision,
  recommendation text,
  confidence double precision,
  patterns jsonb,
  key_levels jsonb,
  risks jsonb,
  opportunities jsonb,
  rationale text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Maintain updated_at automatically
drop trigger if exists set_updated_at_on_predictions on public.predictions;
create trigger set_updated_at_on_predictions
before update on public.predictions
for each row
execute function public.update_updated_at_column();

-- 3) Index for faster listing by user/date
create index if not exists predictions_user_created_at_idx
  on public.predictions (user_id, created_at desc);

-- 4) Enable Row Level Security
alter table public.predictions enable row level security;

-- 5) RLS policies: users can manage only their own predictions
drop policy if exists "Users can view their own predictions" on public.predictions;
create policy "Users can view their own predictions"
  on public.predictions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own predictions" on public.predictions;
create policy "Users can insert their own predictions"
  on public.predictions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own predictions" on public.predictions;
create policy "Users can update their own predictions"
  on public.predictions
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own predictions" on public.predictions;
create policy "Users can delete their own predictions"
  on public.predictions
  for delete
  using (auth.uid() = user_id);
