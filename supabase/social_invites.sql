-- Invitaciones sociales: el registro sigue abierto; el link solo atribuye
-- al invitador y crea un follow automatico desde la app.
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists invites_code_idx on public.invites (code);
create index if not exists invites_inviter_id_idx on public.invites (inviter_id);

alter table public.invites enable row level security;

drop policy if exists "invites are publicly readable by code" on public.invites;
create policy "invites are publicly readable by code"
  on public.invites for select using (true);

drop policy if exists "users create own invites" on public.invites;
create policy "users create own invites"
  on public.invites for insert with check (auth.uid() = inviter_id);

drop policy if exists "invitee redeems unclaimed invite" on public.invites;
create policy "invitee redeems unclaimed invite"
  on public.invites for update
  using (redeemed_by is null)
  with check (auth.uid() = redeemed_by);
