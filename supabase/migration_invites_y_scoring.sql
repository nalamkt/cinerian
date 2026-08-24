-- ============================================================
-- Cinerian - Migracion: invitaciones + scoring social
-- Pegar TODO este archivo de una sola vez en el SQL Editor de Supabase.
-- Es idempotente: si lo corres dos veces no rompe nada.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Tabla de invitaciones
-- ------------------------------------------------------------

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  -- apunta a auth.users (no a profiles): la invitacion se redime ANTES de que
  -- exista el perfil, porque la policy de profiles exige la invitacion redimida.
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists invites_code_idx on public.invites (code);
create index if not exists invites_inviter_id_idx on public.invites (inviter_id);

alter table public.invites enable row level security;

drop policy if exists "invites are publicly readable by code" on public.invites;
create policy "invites are publicly readable by code"
  on public.invites for select
  using (true);

drop policy if exists "users create own invites" on public.invites;
create policy "users create own invites"
  on public.invites for insert
  with check (auth.uid() = inviter_id);

drop policy if exists "invitee redeems unclaimed invite" on public.invites;
create policy "invitee redeems unclaimed invite"
  on public.invites for update
  using (redeemed_by is null)
  with check (auth.uid() = redeemed_by);


-- ------------------------------------------------------------
-- 2) Señal para el scoring: el pulgar arriba/abajo de "Ya la vi"
-- ------------------------------------------------------------

alter table if exists public.media_reactions
add column if not exists liked boolean;

create index if not exists media_reactions_user_id_idx
  on public.media_reactions (user_id);


-- ------------------------------------------------------------
-- 3) Acceso por invitacion: crear perfil exige invitacion redimida
--    (editar el propio perfil NO la exige)
-- ------------------------------------------------------------

drop policy if exists "users manage own profile" on public.profiles;

drop policy if exists "users create own profile with invite" on public.profiles;
create policy "users create own profile with invite"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and (
      not exists (select 1 from public.profiles)
      or exists (select 1 from public.invites where redeemed_by = auth.uid())
    )
  );

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "users delete own profile" on public.profiles;
create policy "users delete own profile"
  on public.profiles for delete
  using (auth.uid() = id);


-- ============================================================
-- PARA REVERTIR el acceso por invitacion (si algo sale mal):
-- corre solo este bloque y volves a como estaba antes.
-- ============================================================
--
-- drop policy if exists "users create own profile with invite" on public.profiles;
-- drop policy if exists "users update own profile" on public.profiles;
-- drop policy if exists "users delete own profile" on public.profiles;
-- create policy "users manage own profile"
--   on public.profiles for all
--   using (auth.uid() = id)
--   with check (auth.uid() = id);
