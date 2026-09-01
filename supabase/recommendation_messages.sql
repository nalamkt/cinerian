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

create table if not exists public.recommendation_message_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.recommendation_messages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.recommendation_messages
  add column if not exists read_at timestamptz;

create index if not exists recommendation_messages_sender_idx
  on public.recommendation_messages (sender_id, created_at desc);

create index if not exists recommendation_messages_recipient_idx
  on public.recommendation_messages (recipient_id, created_at desc);

create index if not exists recommendation_message_replies_message_idx
  on public.recommendation_message_replies (message_id, created_at asc);

alter table public.recommendation_messages enable row level security;
alter table public.recommendation_message_replies enable row level security;

drop policy if exists "recommendation_messages_select_participants" on public.recommendation_messages;
create policy "recommendation_messages_select_participants"
  on public.recommendation_messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "recommendation_messages_insert_sender" on public.recommendation_messages;
create policy "recommendation_messages_insert_sender"
  on public.recommendation_messages for insert
  with check (auth.uid() = sender_id);

drop policy if exists "recommendation_messages_update_recipient" on public.recommendation_messages;
create policy "recommendation_messages_update_recipient"
  on public.recommendation_messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "recommendation_messages_delete_recipient" on public.recommendation_messages;
drop policy if exists "recommendation_messages_delete_participants" on public.recommendation_messages;
create policy "recommendation_messages_delete_participants"
  on public.recommendation_messages for delete
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "recommendation_message_replies_select_participants" on public.recommendation_message_replies;
create policy "recommendation_message_replies_select_participants"
  on public.recommendation_message_replies for select
  using (
    exists (
      select 1
      from public.recommendation_messages message
      where message.id = recommendation_message_replies.message_id
        and (auth.uid() = message.sender_id or auth.uid() = message.recipient_id)
    )
  );

drop policy if exists "recommendation_message_replies_insert_participants" on public.recommendation_message_replies;
create policy "recommendation_message_replies_insert_participants"
  on public.recommendation_message_replies for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.recommendation_messages message
      where message.id = recommendation_message_replies.message_id
        and (auth.uid() = message.sender_id or auth.uid() = message.recipient_id)
    )
  );
