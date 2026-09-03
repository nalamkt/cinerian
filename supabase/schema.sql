create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  banner_url text,
  bio text,
  favorite_genres text[] not null default '{}',
  favorite_titles jsonb not null default '[]'::jsonb,
  featured_collections jsonb not null default '[]'::jsonb,
  current_watching jsonb not null default '[]'::jsonb,
  visibility_settings jsonb not null default '{"showFollowers":false,"showFollowing":false,"showCollections":false,"showBadges":false,"showInsights":false,"showActivity":false,"showWatchlist":true}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.profiles
add column if not exists current_watching jsonb not null default '[]'::jsonb;

alter table if exists public.profiles
add column if not exists gender text;

alter table if exists public.profiles
add column if not exists birth_date date;

alter table if exists public.profiles
alter column visibility_settings
set default '{"showFollowers":false,"showFollowing":false,"showCollections":false,"showBadges":false,"showInsights":false,"showActivity":false,"showWatchlist":true}'::jsonb;

update public.profiles
set visibility_settings = coalesce(visibility_settings, '{}'::jsonb) || '{"showBadges":false}'::jsonb
where visibility_settings is null
   or not (visibility_settings ? 'showBadges')
   or visibility_settings = '{}'::jsonb
   or visibility_settings = '{"showFollowers":false,"showFollowing":false,"showCollections":false,"showInsights":false,"showActivity":false,"showWatchlist":false}'::jsonb
   or visibility_settings = '{"showFollowers":false,"showFollowing":false,"showCollections":false,"showInsights":false,"showActivity":false,"showWatchlist":true}'::jsonb
   or visibility_settings = '{"showFollowers":true,"showFollowing":true,"showCollections":true,"showInsights":true,"showActivity":true,"showWatchlist":true}'::jsonb;

update public.profiles
set visibility_settings = '{"showFollowers":false,"showFollowing":false,"showCollections":false,"showBadges":false,"showInsights":false,"showActivity":false,"showWatchlist":true}'::jsonb
where visibility_settings is null
   or visibility_settings = '{}'::jsonb
   or visibility_settings = '{"showFollowers":false,"showFollowing":false,"showCollections":false,"showInsights":false,"showActivity":false,"showWatchlist":false}'::jsonb
   or visibility_settings = '{"showFollowers":true,"showFollowing":true,"showCollections":true,"showInsights":true,"showActivity":true,"showWatchlist":true}'::jsonb;

create table if not exists public.media_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_id bigint not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  -- Un titulo esta siempre en exactamente uno de estos estados por usuario:
  --   superliked -> la vio y le encanto
  --   liked      -> la vio y le gusto
  --   disliked   -> la vio y no le gusto
  --   watchlist  -> guardada, todavia no la vio
  --   ignored    -> la paso de largo en Descubri
  reaction text not null check (
    reaction in ('superliked', 'liked', 'disliked', 'watchlist', 'ignored')
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists media_reactions_user_id_idx on public.media_reactions (user_id);

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

create table if not exists public.feed_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.feed_post_comment_notifications (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.feed_post_comments(id) on delete cascade,
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (comment_id, recipient_user_id),
  check (actor_user_id <> recipient_user_id)
);

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event_name text not null,
  feature_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.admin_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'operator' check (role in ('operator', 'admin')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.admin_feature_flags (
  feature_key text primary key check (feature_key in ('feed', 'search', 'recommendations', 'inbox', 'editorial', 'premieres')),
  display_name text,
  enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_feature_flags
  add column if not exists display_name text;

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  level text not null check (level in ('info', 'warning', 'error')),
  title text not null,
  detail text not null,
  context jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.is_admin_user(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_access
    where user_id = coalesce(target_user_id, auth.uid())
  );
$$;

revoke all on function public.is_admin_user(uuid) from public;
grant execute on function public.is_admin_user(uuid) to anon, authenticated;

insert into public.admin_feature_flags (feature_key, display_name, enabled)
values
  ('feed', 'Feed social', true),
  ('search', 'Buscador', true),
  ('recommendations', 'Descubri', true),
  ('inbox', 'Inbox', true),
  ('editorial', 'Capa editorial', true),
  ('premieres', 'Estrenos', true)
on conflict (feature_key) do nothing;

alter table public.profiles enable row level security;
alter table public.media_reactions enable row level security;
alter table public.feed_posts enable row level security;
alter table public.user_follows enable row level security;
alter table public.recommendation_messages enable row level security;
alter table public.recommendation_message_replies enable row level security;
alter table public.feed_post_comments enable row level security;
alter table public.feed_post_comment_notifications enable row level security;
alter table public.product_events enable row level security;
alter table public.admin_access enable row level security;
alter table public.admin_feature_flags enable row level security;
alter table public.admin_logs enable row level security;

create policy "profiles are public read"
  on public.profiles for select
  using (true);

drop policy if exists "users manage own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "users delete own profile" on public.profiles;
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

create policy "recommendation messages delete by participants"
  on public.recommendation_messages for delete
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

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

create policy "feed post comments are public read"
  on public.feed_post_comments for select
  using (true);

create policy "users insert feed post comments"
  on public.feed_post_comments for insert
  with check (auth.uid() = user_id);

create policy "users delete own feed post comments"
  on public.feed_post_comments for delete
  using (auth.uid() = user_id);

create policy "comment notifications read by participants"
  on public.feed_post_comment_notifications for select
  using (auth.uid() = recipient_user_id or auth.uid() = actor_user_id);

create policy "comment notifications insert by actor"
  on public.feed_post_comment_notifications for insert
  with check (auth.uid() = actor_user_id);

create policy "comment notifications update by recipient"
  on public.feed_post_comment_notifications for update
  using (auth.uid() = recipient_user_id)
  with check (auth.uid() = recipient_user_id);

create policy "admins read product events"
  on public.product_events for select
  using (public.is_admin_user());

create policy "authenticated users insert product events"
  on public.product_events for insert
  with check (auth.uid() is not null);

create policy "admin access visible to self and admins"
  on public.admin_access for select
  using (auth.uid() = user_id or public.is_admin_user());

create policy "admins manage admin access"
  on public.admin_access for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "feature flags are public read"
  on public.admin_feature_flags for select
  using (true);

create policy "admins manage feature flags"
  on public.admin_feature_flags for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "admins read logs"
  on public.admin_logs for select
  using (public.is_admin_user());

create policy "authenticated users insert logs"
  on public.admin_logs for insert
  with check (auth.uid() is not null);

create policy "admins delete logs"
  on public.admin_logs for delete
  using (public.is_admin_user());
