-- Allow authenticated users to insert their own signup profile row (e.g. legacy accounts
-- created before the auth trigger, or upsert from the Profile page).
create policy "Users insert own signup profile"
  on public.user_signup_profiles for insert
  with check (auth.uid() = user_id);
