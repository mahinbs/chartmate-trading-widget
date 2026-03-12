-- User subscriptions (Stripe)
-- Tracks premium plan and white-label subscriptions

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  plan_id text not null,
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'trialing', 'incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id);
create index if not exists idx_user_subscriptions_stripe_customer on public.user_subscriptions(stripe_customer_id);
create index if not exists idx_user_subscriptions_stripe_sub on public.user_subscriptions(stripe_subscription_id);

alter table public.user_subscriptions enable row level security;

create policy "Users can read own subscription"
  on public.user_subscriptions for select
  using (auth.uid() = user_id);

create policy "Service role full access subscriptions"
  on public.user_subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop trigger if exists update_user_subscriptions_updated_at on public.user_subscriptions;
create trigger update_user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row execute function update_updated_at_column();

comment on table public.user_subscriptions is 'User premium and WL subscriptions via Stripe';
