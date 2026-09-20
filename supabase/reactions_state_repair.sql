-- Cinerian: repara el modelo actual de reacciones.
-- Ejecutar una unica vez en el SQL Editor de Supabase.

begin;

alter table public.media_reactions
  drop constraint if exists media_reactions_reaction_check;

-- La version anterior usaba `watched`. La nueva escala guarda la opinion
-- concreta; una vista legacy se conserva como "Me gustó" en lugar de perderla.
update public.media_reactions
set reaction = 'liked'
where reaction = 'watched';

-- Cada usuario conserva solo su estado mas reciente para cada titulo.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, tmdb_id, media_type
      order by created_at desc, id desc
    ) as position
  from public.media_reactions
)
delete from public.media_reactions reactions
using ranked
where reactions.id = ranked.id
  and ranked.position > 1;

alter table public.media_reactions
  add constraint media_reactions_reaction_check
  check (reaction in ('superliked', 'liked', 'disliked', 'watchlist', 'ignored'));

alter table public.media_reactions
  drop constraint if exists media_reactions_user_title_unique;

alter table public.media_reactions
  add constraint media_reactions_user_title_unique
  unique (user_id, tmdb_id, media_type);

commit;
