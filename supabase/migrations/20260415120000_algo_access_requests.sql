-- Public access / onboarding applications (no auth user). Super admins review in widget admin panel.
create table if not exists public.algo_access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  country text,
  city text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists algo_access_requests_created_at_idx
  on public.algo_access_requests (created_at desc);

create index if not exists algo_access_requests_status_idx
  on public.algo_access_requests (status);

comment on table public.algo_access_requests is 'TradingSmart / algo-only access request wizard submissions; listed in super-admin dashboard.';

alter table public.algo_access_requests enable row level security;
