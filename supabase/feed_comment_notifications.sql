create table if not exists public.feed_post_comment_notifications (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.feed_post_comments(id) on delete cascade,
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (comment_id, recipient_user_id),
  check (actor_user_id <> recipient_user_id)
);

create index if not exists feed_post_comment_notifications_recipient_idx
  on public.feed_post_comment_notifications (recipient_user_id, created_at desc);

create index if not exists feed_post_comment_notifications_comment_idx
  on public.feed_post_comment_notifications (comment_id);

alter table public.feed_post_comment_notifications enable row level security;

drop policy if exists "comment_notifications_select_participants" on public.feed_post_comment_notifications;
create policy "comment_notifications_select_participants"
  on public.feed_post_comment_notifications for select
  using (auth.uid() = recipient_user_id or auth.uid() = actor_user_id);

drop policy if exists "comment_notifications_insert_actor" on public.feed_post_comment_notifications;
create policy "comment_notifications_insert_actor"
  on public.feed_post_comment_notifications for insert
  with check (auth.uid() = actor_user_id);

drop policy if exists "comment_notifications_update_recipient" on public.feed_post_comment_notifications;
create policy "comment_notifications_update_recipient"
  on public.feed_post_comment_notifications for update
  using (auth.uid() = recipient_user_id)
  with check (auth.uid() = recipient_user_id);
