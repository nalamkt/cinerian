-- ============================================================
-- Cinerian - Migracion: scoring social
-- ============================================================

alter table if exists public.media_reactions
add column if not exists liked boolean;

create index if not exists media_reactions_user_id_idx
  on public.media_reactions (user_id);
