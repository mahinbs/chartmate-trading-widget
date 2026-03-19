-- Chat history tables for the market intelligence chatbot

create table if not exists public.chatbot_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chatbot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chatbot_conversations(id) on delete cascade,
  role text not null check (role in ('bot', 'user')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chatbot_conv_user on public.chatbot_conversations(user_id, updated_at desc);
create index if not exists idx_chatbot_msg_conv on public.chatbot_messages(conversation_id, created_at asc);

alter table public.chatbot_conversations enable row level security;
alter table public.chatbot_messages enable row level security;

create policy "Users see own conversations"
  on public.chatbot_conversations for select using (auth.uid() = user_id);
create policy "Users insert own conversations"
  on public.chatbot_conversations for insert with check (auth.uid() = user_id);
create policy "Users update own conversations"
  on public.chatbot_conversations for update using (auth.uid() = user_id);
create policy "Users delete own conversations"
  on public.chatbot_conversations for delete using (auth.uid() = user_id);

create policy "Users see own messages"
  on public.chatbot_messages for select
  using (exists (select 1 from public.chatbot_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy "Users insert own messages"
  on public.chatbot_messages for insert
  with check (exists (select 1 from public.chatbot_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
