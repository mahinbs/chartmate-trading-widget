-- Create contact_submissions table
create table if not exists public.contact_submissions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  email text not null,
  phone text not null,
  telegram_id text,
  description text
);

-- Set up Row Level Security (RLS)
alter table public.contact_submissions enable row level security;

-- Create policy to allow anybody to insert (for the contact form)
create policy "Anyone can insert contact submissions"
  on public.contact_submissions
  for insert
  with check (true);

-- Create policy to allow only authenticated users to view submissions (optional, for admin panel)
-- create policy "Only authenticated users can view submissions"
--   on public.contact_submissions
--   for select
--   to authenticated
--   using (true);
