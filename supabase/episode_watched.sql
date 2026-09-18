-- Tracking de capitulos vistos por usuario.
-- La app hoy los guarda en localStorage; con esta tabla siguen al usuario entre
-- dispositivos y sesiones.

create table if not exists public.episode_watched (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_show_id bigint not null,
  season_number integer not null,
  episode_number integer not null,
  watched_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, tmdb_show_id, season_number, episode_number)
);

create index if not exists episode_watched_user_show_idx
  on public.episode_watched (user_id, tmdb_show_id);

alter table public.episode_watched enable row level security;

drop policy if exists "users manage own episode watched" on public.episode_watched;

create policy "users manage own episode watched"
  on public.episode_watched for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
