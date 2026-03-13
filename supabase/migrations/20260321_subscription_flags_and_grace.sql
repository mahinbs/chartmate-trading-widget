-- Subscription renewal/expiry UX flags
alter table public.user_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz;

create index if not exists idx_user_subscriptions_cancel_at_period_end
  on public.user_subscriptions(cancel_at_period_end);
