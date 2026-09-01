-- Run once in the Supabase SQL editor. Replies become first-class inbox activity:
-- they know who must read them and can drive unread counts and ordering.
alter table public.recommendation_message_replies
  add column if not exists recipient_id uuid references auth.users(id) on delete cascade,
  add column if not exists read_at timestamptz;

update public.recommendation_message_replies reply
set recipient_id = case
  when reply.sender_id = message.sender_id then message.recipient_id
  else message.sender_id
end
from public.recommendation_messages message
where message.id = reply.message_id
  and reply.recipient_id is null;

create index if not exists recommendation_message_replies_recipient_unread_idx
  on public.recommendation_message_replies (recipient_id, created_at desc)
  where read_at is null;

drop policy if exists "recommendation_message_replies_insert_participants" on public.recommendation_message_replies;
create policy "recommendation_message_replies_insert_participants"
  on public.recommendation_message_replies for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.recommendation_messages message
      where message.id = recommendation_message_replies.message_id
        and (auth.uid() = message.sender_id or auth.uid() = message.recipient_id)
        and recommendation_message_replies.recipient_id = case
          when auth.uid() = message.sender_id then message.recipient_id
          else message.sender_id
        end
    )
  );

drop policy if exists "recommendation_message_replies_update_recipient" on public.recommendation_message_replies;
create policy "recommendation_message_replies_update_recipient"
  on public.recommendation_message_replies for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- The app subscribes to these inserts to refresh the Inbox badge and thread list.
do $$
begin
  alter publication supabase_realtime add table public.recommendation_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.recommendation_message_replies;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.feed_post_comment_notifications;
exception when duplicate_object then null;
end $$;
