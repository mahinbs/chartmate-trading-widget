-- Enforced admin assignment for live algo execution
create table if not exists public.algo_user_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid references public.user_trading_integration(id) on delete set null,
  allowed_strategy text not null,
  risk_profile text not null default 'medium'
    check (risk_profile in ('low', 'medium', 'high')),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists idx_algo_user_assignments_user on public.algo_user_assignments(user_id);
create index if not exists idx_algo_user_assignments_status on public.algo_user_assignments(status);

alter table public.algo_user_assignments enable row level security;

drop policy if exists "Users can read own algo assignment" on public.algo_user_assignments;
create policy "Users can read own algo assignment"
  on public.algo_user_assignments
  for select
  using (auth.uid() = user_id);

drop policy if exists "Service and super-admin manage algo assignments" on public.algo_user_assignments;
create policy "Service and super-admin manage algo assignments"
  on public.algo_user_assignments
  for all
  using (auth.role() = 'service_role' or public.is_super_admin())
  with check (auth.role() = 'service_role' or public.is_super_admin());

drop trigger if exists update_algo_user_assignments_updated_at on public.algo_user_assignments;
create trigger update_algo_user_assignments_updated_at
before update on public.algo_user_assignments
for each row execute function public.update_updated_at_column();

comment on table public.algo_user_assignments is
  'Server-enforced admin assignment for each user: allowed strategy, risk profile, and integration linkage.';

-- Immutable audit trail for order requests/responses
create table if not exists public.order_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid references public.active_trades(id) on delete set null,
  intent text not null default 'entry'
    check (intent in ('entry', 'exit')),
  provider text not null default 'openalgo',
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  status text not null
    check (status in ('success', 'failed')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_audit_logs_user on public.order_audit_logs(user_id);
create index if not exists idx_order_audit_logs_trade on public.order_audit_logs(trade_id);
create index if not exists idx_order_audit_logs_status on public.order_audit_logs(status);
create index if not exists idx_order_audit_logs_created on public.order_audit_logs(created_at desc);

alter table public.order_audit_logs enable row level security;

drop policy if exists "Users read own order audit logs" on public.order_audit_logs;
create policy "Users read own order audit logs"
  on public.order_audit_logs
  for select
  using (auth.uid() = user_id);

drop policy if exists "Service and super-admin manage order audit logs" on public.order_audit_logs;
create policy "Service and super-admin manage order audit logs"
  on public.order_audit_logs
  for all
  using (auth.role() = 'service_role' or public.is_super_admin())
  with check (auth.role() = 'service_role' or public.is_super_admin());

comment on table public.order_audit_logs is
  'Immutable audit records for order placement attempts and responses.';
