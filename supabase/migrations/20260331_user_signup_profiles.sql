-- Extended signup data: name, DOB, age at signup, phone, country.
-- Rows are created by a trigger on auth.users from raw_user_meta_data.

create table if not exists public.user_signup_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  date_of_birth date,
  age_at_signup integer,
  phone text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_signup_profiles_email on public.user_signup_profiles (email);

comment on table public.user_signup_profiles is 'Demographics collected at email/password signup; synced from auth.users raw_user_meta_data via trigger.';

alter table public.user_signup_profiles enable row level security;

create policy "Users read own signup profile"
  on public.user_signup_profiles for select
  using (auth.uid() = user_id);

create policy "Users update own signup profile"
  on public.user_signup_profiles for update
  using (auth.uid() = user_id);

-- Super-admin read (matches other user-scoped tables in this project)
drop policy if exists "Super-admin reads all signup profiles" on public.user_signup_profiles;
create policy "Super-admin reads all signup profiles"
  on public.user_signup_profiles for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'super_admin'
    )
  );

drop trigger if exists update_user_signup_profiles_updated_at on public.user_signup_profiles;
create trigger update_user_signup_profiles_updated_at
  before update on public.user_signup_profiles
  for each row execute function public.update_updated_at_column();

create or replace function public.handle_new_user_signup_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dob date;
  v_age int;
  v_name text;
  v_phone text;
  v_country text;
begin
  v_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), '');
  v_phone := nullif(trim(new.raw_user_meta_data->>'phone'), '');
  v_country := nullif(trim(new.raw_user_meta_data->>'country'), '');

  if new.raw_user_meta_data ? 'date_of_birth'
     and nullif(trim(new.raw_user_meta_data->>'date_of_birth'), '') is not null
  then
    begin
      v_dob := (new.raw_user_meta_data->>'date_of_birth')::date;
      v_age := (extract(year from age(current_date, v_dob)))::int;
    exception
      when others then
        v_dob := null;
        v_age := null;
    end;
  end if;

  insert into public.user_signup_profiles (user_id, email, full_name, date_of_birth, age_at_signup, phone, country)
  values (new.id, new.email, v_name, v_dob, v_age, v_phone, v_country)
  on conflict (user_id) do update set
    email       = excluded.email,
    full_name   = excluded.full_name,
    date_of_birth = coalesce(excluded.date_of_birth, user_signup_profiles.date_of_birth),
    age_at_signup = coalesce(excluded.age_at_signup, user_signup_profiles.age_at_signup),
    phone       = coalesce(excluded.phone, user_signup_profiles.phone),
    country     = coalesce(excluded.country, user_signup_profiles.country),
    updated_at  = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_signup_profile on auth.users;
create trigger on_auth_user_created_signup_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_signup_profile();
