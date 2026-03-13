-- Algo onboarding: stores user details collected after payment
create table if not exists public.algo_onboarding (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  full_name       text        not null,
  phone           text,
  broker          text        not null,  -- e.g. 'zerodha','upstox','angel','fyers'
  broker_client_id text,
  capital_amount  numeric(14,2),
  risk_level      text        not null default 'medium'
                    check (risk_level in ('low','medium','high')),
  strategy_pref   text,                   -- e.g. 'momentum','scalping','swing'
  notes           text,
  plan_id         text        not null,   -- mirrors user_subscriptions.plan_id
  status          text        not null default 'pending'
                    check (status in ('pending','provisioned','active','cancelled')),
  provisioned_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.algo_onboarding enable row level security;

-- Users can insert/read their own onboarding row
create policy "Users manage own onboarding"
  on public.algo_onboarding for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Super-admin and service can manage all rows
create policy "Super-admin full access onboarding"
  on public.algo_onboarding for all
  using (
    auth.role() = 'service_role'
    or public.is_super_admin()
  )
  with check (
    auth.role() = 'service_role'
    or public.is_super_admin()
  );

-- Updated_at trigger
create or replace function public.set_algo_onboarding_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger algo_onboarding_updated_at
  before update on public.algo_onboarding
  for each row execute function public.set_algo_onboarding_updated_at();
