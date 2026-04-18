-- Phase A: lifecycle state machine columns + pending EOD auto-cancel timestamp.

alter table if exists public.user_strategies
  add column if not exists lifecycle_state text,
  add column if not exists lifecycle_reason text,
  add column if not exists lifecycle_updated_at timestamptz;

alter table if exists public.options_strategies
  add column if not exists lifecycle_state text,
  add column if not exists lifecycle_reason text,
  add column if not exists lifecycle_updated_at timestamptz;

alter table if exists public.pending_conditional_orders
  add column if not exists auto_cancel_at timestamptz;

alter table if exists public.pending_conditional_orders
  alter column auto_cancel_at set default (
    (
      date_trunc('day', timezone('Asia/Kolkata', now()))
      + interval '15 hours 30 minutes'
    ) at time zone 'Asia/Kolkata'
  );

update public.pending_conditional_orders
set auto_cancel_at = (
  (
    date_trunc('day', timezone('Asia/Kolkata', coalesce(created_at, now())))
    + interval '15 hours 30 minutes'
  ) at time zone 'Asia/Kolkata'
)
where auto_cancel_at is null;

create index if not exists idx_pending_conditional_orders_auto_cancel_at
  on public.pending_conditional_orders (status, auto_cancel_at);
