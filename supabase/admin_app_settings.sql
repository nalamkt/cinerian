-- Run once in the Supabase SQL Editor to enable the configurable app landing screen.
create table if not exists public.admin_app_settings (
  setting_key text primary key check (setting_key = 'public-app'),
  default_view text not null default 'feed' check (default_view in ('feed', 'search', 'recommendations', 'inbox')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.admin_app_settings (setting_key, default_view)
values ('public-app', 'feed')
on conflict (setting_key) do nothing;

alter table public.admin_app_settings enable row level security;

revoke all on table public.admin_app_settings from anon, authenticated;
grant select on table public.admin_app_settings to anon, authenticated;
grant insert, update, delete on table public.admin_app_settings to authenticated;

drop policy if exists "app settings are public read" on public.admin_app_settings;
create policy "app settings are public read"
  on public.admin_app_settings for select
  using (true);

drop policy if exists "admins manage app settings" on public.admin_app_settings;
create policy "admins manage app settings"
  on public.admin_app_settings for all
  using (public.is_admin_user())
  with check (public.is_admin_user());
