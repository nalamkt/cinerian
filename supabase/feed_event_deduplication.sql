-- Cinerian: un solo evento vigente por usuario, titulo y tipo de actividad.
-- Conserva el post mas reciente y mueve sus comentarios/notificaciones antes
-- de eliminar cualquier duplicado historico.

begin;

create temporary table feed_event_duplicates on commit drop as
with ranked as (
  select
    id,
    first_value(id) over event_window as keep_id,
    row_number() over event_window as position
  from public.feed_posts
  where tmdb_id is not null
  window event_window as (
    partition by user_id, tmdb_id, media_type, post_type
    order by created_at desc, id desc
  )
)
select id as duplicate_id, keep_id
from ranked
where position > 1;

update public.feed_post_comments comments
set post_id = duplicates.keep_id
from feed_event_duplicates duplicates
where comments.post_id = duplicates.duplicate_id;

update public.feed_post_comment_notifications notifications
set post_id = duplicates.keep_id
from feed_event_duplicates duplicates
where notifications.post_id = duplicates.duplicate_id;

delete from public.feed_posts posts
using feed_event_duplicates duplicates
where posts.id = duplicates.duplicate_id;

alter table public.feed_posts
  drop constraint if exists feed_posts_unique_media_event;

alter table public.feed_posts
  add constraint feed_posts_unique_media_event
  unique (user_id, tmdb_id, media_type, post_type);

commit;
