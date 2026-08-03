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

alter table public.profiles enable row level security;
alter table public.media_reactions enable row level security;
alter table public.feed_posts enable row level security;
alter table public.user_follows enable row level security;

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
