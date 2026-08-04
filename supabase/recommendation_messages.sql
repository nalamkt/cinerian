create table if not exists public.recommendation_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_id bigint not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_url text,
  year text,
  note text,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (sender_id <> recipient_id)
);

alter table public.recommendation_messages
  add column if not exists read_at timestamptz;

create index if not exists recommendation_messages_sender_idx
  on public.recommendation_messages (sender_id, created_at desc);

create index if not exists recommendation_messages_recipient_idx
  on public.recommendation_messages (recipient_id, created_at desc);

alter table public.recommendation_messages enable row level security;

drop policy if exists "recommendation_messages_select_participants" on public.recommendation_messages;
create policy "recommendation_messages_select_participants"
  on public.recommendation_messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "recommendation_messages_insert_sender" on public.recommendation_messages;
create policy "recommendation_messages_insert_sender"
  on public.recommendation_messages for insert
  with check (auth.uid() = sender_id);
