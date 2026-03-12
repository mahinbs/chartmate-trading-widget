-- WL 5-year payment requests — admin generates a single-use link for a specific email
create table if not exists public.wl_payment_requests (
  id            uuid        primary key default gen_random_uuid(),
  token         uuid        not null unique default gen_random_uuid(),
  admin_id      uuid        not null references auth.users(id) on delete set null,
  email         text        not null,       -- the ONLY email allowed to pay
  brand_name    text        not null,
  slug          text        not null,
  plan_id       text        not null default 'wl_5_years',
  amount        numeric(14,2) not null default 3399,
  currency      text        not null default 'USD',
  status        text        not null default 'pending'
                  check (status in ('pending','paid','expired','cancelled')),
  stripe_checkout_session_id  text,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_wl_payment_requests_token  on public.wl_payment_requests(token);
create index if not exists idx_wl_payment_requests_email  on public.wl_payment_requests(email);
create index if not exists idx_wl_payment_requests_status on public.wl_payment_requests(status);

alter table public.wl_payment_requests enable row level security;

-- Only service role and admins can manage
create policy "Admins manage wl payment requests"
  on public.wl_payment_requests for all
  using (
    auth.role() = 'service_role' or
    (auth.uid() is not null and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    ))
  )
  with check (
    auth.role() = 'service_role' or
    (auth.uid() is not null and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    ))
  );

-- The intended user can read their own pending request (to initiate checkout)
create policy "Owner email can read own request"
  on public.wl_payment_requests for select
  using (
    auth.uid() is not null
    and lower(email) = lower((select u.email from auth.users u where u.id = auth.uid()))
  );

drop trigger if exists update_wl_payment_requests_updated_at on public.wl_payment_requests;
create trigger update_wl_payment_requests_updated_at
  before update on public.wl_payment_requests
  for each row execute function update_updated_at_column();

comment on table public.wl_payment_requests is
  'Admin-created single-use 5yr WL payment requests tied to a specific email';
