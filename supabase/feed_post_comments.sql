create table if not exists public.feed_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.feed_post_comments enable row level security;

create policy "feed post comments are public read"
  on public.feed_post_comments for select
  using (true);

create policy "users insert feed post comments"
  on public.feed_post_comments for insert
  with check (auth.uid() = user_id);

create policy "users delete own feed post comments"
  on public.feed_post_comments for delete
  using (auth.uid() = user_id);
