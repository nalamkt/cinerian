create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.media_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_id bigint not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  reaction text not null check (reaction in ('liked', 'disliked', 'watched', 'watchlist')),
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_id bigint,
  media_type text check (media_type in ('movie', 'tv')),
  body text not null,
  post_type text not null check (post_type in ('rating', 'recommendation', 'watchlist')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

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

alter table public.profiles enable row level security;
alter table public.media_reactions enable row level security;
alter table public.feed_posts enable row level security;
alter table public.user_follows enable row level security;
alter table public.recommendation_messages enable row level security;
alter table public.recommendation_message_replies enable row level security;

create policy "profiles are public read"
  on public.profiles for select
  using (true);

create policy "users manage own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "feed is public read"
  on public.feed_posts for select
  using (true);

create policy "users manage own feed posts"
  on public.feed_posts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users read reactions"
  on public.media_reactions for select
  using (true);

create policy "users manage own reactions"
  on public.media_reactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users read follows"
  on public.user_follows for select
  using (true);

create policy "users manage own follows"
  on public.user_follows for all
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

create policy "recommendation messages read by participants"
  on public.recommendation_messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "recommendation messages insert by sender"
  on public.recommendation_messages for insert
  with check (auth.uid() = sender_id);

create policy "recommendation messages update by recipient"
  on public.recommendation_messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

create policy "recommendation messages delete by recipient"
  on public.recommendation_messages for delete
  using (auth.uid() = recipient_id);

create policy "recommendation replies read by participants"
  on public.recommendation_message_replies for select
  using (
    exists (
      select 1
      from public.recommendation_messages message
      where message.id = recommendation_message_replies.message_id
        and (auth.uid() = message.sender_id or auth.uid() = message.recipient_id)
    )
  );

create policy "recommendation replies insert by participants"
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
