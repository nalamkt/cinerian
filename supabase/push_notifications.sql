-- Push notifications run from private Vercel functions. The browser can only
-- update its own recent activity; snapshots and delivery logs stay server-only.

create table if not exists public.notification_user_activity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_opened_at timestamptz not null default timezone('utc', now()),
  last_reengagement_notification_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.series_notification_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_show_id bigint not null,
  title text not null,
  status text,
  next_episode_id bigint,
  next_episode_name text,
  next_episode_date date,
  next_season_number integer,
  next_episode_number integer,
  fingerprint text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, tmdb_show_id)
);

create table if not exists public.ranking_notification_states (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  snapshot jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null unique,
  notification_type text not null check (
    notification_type in ('inbox_message', 'series_update', 'ranking_update', 'reengagement')
  ),
  title text not null,
  body text not null,
  target_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  provider_response jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz
);

create index if not exists notification_user_activity_inactive_idx
  on public.notification_user_activity (last_opened_at);

create index if not exists push_notification_deliveries_recipient_idx
  on public.push_notification_deliveries (recipient_user_id, created_at desc);

alter table public.notification_user_activity enable row level security;
alter table public.series_notification_states enable row level security;
alter table public.ranking_notification_states enable row level security;
alter table public.push_notification_deliveries enable row level security;

drop policy if exists "users read own notification activity" on public.notification_user_activity;
create policy "users read own notification activity"
  on public.notification_user_activity for select
  using (auth.uid() = user_id);

drop policy if exists "users insert own notification activity" on public.notification_user_activity;
create policy "users insert own notification activity"
  on public.notification_user_activity for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own notification activity" on public.notification_user_activity;
create policy "users update own notification activity"
  on public.notification_user_activity for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The remaining tables are read and written exclusively with the Supabase
-- service role inside Vercel. No browser policy is intentionally granted.
