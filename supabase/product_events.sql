-- Revisar y ejecutar manualmente en Supabase SQL Editor. No carga eventos historicos.
-- El esquema actual de Cinerian no tiene esta tabla. Mantiene feature_key y metadata
-- para que el panel de administracion siga leyendo los eventos existentes del codigo.
create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in (
    'app_opened', 'discovery_opened', 'title_saved', 'watching_title_added',
    'mutual_discovery_opened', 'discover_filters_applied', 'push_opened',
    'profile_created', 'auth_magic_link_requested', 'auth_google_started',
    'auth_apple_started', 'reaction_saved', 'feed_post_created',
    'feed_comment_created', 'recommendation_sent', 'profile_opened',
    'view_session_recorded'
  )),
  created_at timestamptz not null default now(),
  session_id uuid not null,
  feature_key text check (feature_key is null or length(feature_key) <= 40),
  dedupe_key text check (dedupe_key is null or length(dedupe_key) <= 72),
  metadata jsonb not null default '{}'::jsonb,
  constraint product_events_metadata_safe check (
    jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 512
    and metadata - array['environment', 'platform', 'mediaType', 'reaction', 'postType', 'durationMs', 'durationSeconds', 'reason', 'view'] = '{}'::jsonb
    and metadata ? 'environment'
    and metadata ? 'platform'
    and metadata->>'environment' in ('production', 'development', 'preview')
    and metadata->>'platform' in ('ios', 'android', 'desktop')
  )
);

create index if not exists product_events_user_date_idx on public.product_events (user_id, created_at desc);
create index if not exists product_events_name_date_idx on public.product_events (event_name, created_at desc);
create index if not exists product_events_session_idx on public.product_events (user_id, session_id, created_at);
create unique index if not exists product_events_dedupe_idx on public.product_events (user_id, event_name, dedupe_key) where dedupe_key is not null;

alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;
grant select on public.product_events to authenticated;
grant insert (id, user_id, event_name, session_id, feature_key, dedupe_key, metadata) on public.product_events to authenticated;

drop policy if exists "product events insert own" on public.product_events;
drop policy if exists "authenticated users insert product events" on public.product_events;
create policy "product events insert own" on public.product_events
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "product events read own" on public.product_events;
create policy "product events read own" on public.product_events
  for select to authenticated using (auth.uid() = user_id);

-- Conserva el acceso al panel administrador cuando su funcion ya esta instalada.
do $$
begin
  if to_regprocedure('public.is_admin_user(uuid)') is not null then
    execute 'drop policy if exists "admins read product events" on public.product_events';
    execute 'create policy "admins read product events" on public.product_events for select to authenticated using (public.is_admin_user())';
  end if;
end $$;
