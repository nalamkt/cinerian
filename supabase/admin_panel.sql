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

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event_name text not null,
  feature_key text,
  metadata jsonb not null default '{}'::jsonb,
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

alter table public.admin_access enable row level security;
alter table public.admin_feature_flags enable row level security;
alter table public.admin_logs enable row level security;
alter table public.product_events enable row level security;

drop policy if exists "admin access visible to self and admins" on public.admin_access;
create policy "admin access visible to self and admins"
  on public.admin_access for select
  using (auth.uid() = user_id or public.is_admin_user());

drop policy if exists "admins manage admin access" on public.admin_access;
create policy "admins manage admin access"
  on public.admin_access for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "feature flags are public read" on public.admin_feature_flags;
create policy "feature flags are public read"
  on public.admin_feature_flags for select
  using (true);

drop policy if exists "admins manage feature flags" on public.admin_feature_flags;
create policy "admins manage feature flags"
  on public.admin_feature_flags for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "admins read logs" on public.admin_logs;
create policy "admins read logs"
  on public.admin_logs for select
  using (public.is_admin_user());

drop policy if exists "authenticated users insert logs" on public.admin_logs;
create policy "authenticated users insert logs"
  on public.admin_logs for insert
  with check (auth.uid() is not null);

drop policy if exists "admins delete logs" on public.admin_logs;
create policy "admins delete logs"
  on public.admin_logs for delete
  using (public.is_admin_user());

drop policy if exists "admins read product events" on public.product_events;
create policy "admins read product events"
  on public.product_events for select
  using (public.is_admin_user());

drop policy if exists "authenticated users insert product events" on public.product_events;
create policy "authenticated users insert product events"
  on public.product_events for insert
  with check (auth.uid() is not null);
