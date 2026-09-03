-- ============================================================
-- Cinerian - Migracion: 'liked' pasa a llamarse 'watchlist'
--
-- La app usaba reaction = 'liked' para decir "guardado en watchlist",
-- lo cual era confuso (sobre todo ahora que existe la columna `liked`,
-- que guarda el pulgar arriba/abajo y es otra cosa).
-- El valor 'watchlist' ya estaba permitido en la base pero nunca se usaba.
--
-- Correr despues de migration_liked_scoring.sql
-- ============================================================


-- ------------------------------------------------------------
-- 1) Migrar las filas existentes
-- ------------------------------------------------------------

update public.media_reactions
set reaction = 'watchlist'
where reaction = 'liked';


-- ------------------------------------------------------------
-- 2) Sacar 'liked' de los valores validos, para que no se pueda
--    volver a escribir por accidente
-- ------------------------------------------------------------

alter table public.media_reactions
drop constraint if exists media_reactions_reaction_check;

alter table public.media_reactions
add constraint media_reactions_reaction_check
check (reaction in ('disliked', 'watched', 'watchlist'));


-- ------------------------------------------------------------
-- 3) Verificacion: las dos consultas de abajo tienen que dar 0 filas
--    y un listado sin 'liked' respectivamente
-- ------------------------------------------------------------

-- select count(*) as deberia_ser_cero from public.media_reactions where reaction = 'liked';
-- select reaction, count(*) from public.media_reactions group by reaction order by reaction;
