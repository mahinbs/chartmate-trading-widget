-- White-label tenants and users (required by affiliates migration)
create table if not exists public.white_label_tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand_name text not null,
  brand_logo_url text,
  brand_primary_color text not null default '#6366f1',
  brand_tagline text,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_email text,
  subscription_plan text not null default '1_year' check (subscription_plan in ('1_year', '2_year')),
  stripe_customer_id text,
  stripe_subscription_id text,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.white_label_tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.white_label_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create index if not exists idx_wl_tenants_slug on public.white_label_tenants(slug);
create index if not exists idx_wl_tenants_status on public.white_label_tenants(status);
create index if not exists idx_wl_tenant_users_tenant on public.white_label_tenant_users(tenant_id);
create index if not exists idx_wl_tenant_users_user on public.white_label_tenant_users(user_id);

alter table public.white_label_tenants enable row level security;
alter table public.white_label_tenant_users enable row level security;

create policy "Anyone can read active WL tenants by slug"
  on public.white_label_tenants for select
  using (true);

create policy "Admins and service can manage WL tenants"
  on public.white_label_tenants for all
  using (
    auth.role() = 'service_role' or
    (auth.uid() is not null and exists (
      select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'
    ))
  )
  with check (
    auth.role() = 'service_role' or
    (auth.uid() is not null and exists (
      select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'
    ))
  );

create policy "Users can read own WL membership"
  on public.white_label_tenant_users for select
  using (auth.uid() = user_id);

create policy "Service can insert WL tenant users"
  on public.white_label_tenant_users for insert
  with check (true);

create policy "Service and admins can manage WL tenant users"
  on public.white_label_tenant_users for all
  using (auth.role() = 'service_role' or exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'
  ));

drop trigger if exists update_white_label_tenants_updated_at on public.white_label_tenants;
create trigger update_white_label_tenants_updated_at
  before update on public.white_label_tenants
  for each row execute function update_updated_at_column();
