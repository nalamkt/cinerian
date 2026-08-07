create table if not exists public.editorial_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text unique not null,
  name text not null,
  feed_url text unique not null,
  source_type text not null check (source_type in ('all', 'movies', 'series', 'tv')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.editorial_sources(id) on delete cascade,
  external_id text not null unique,
  title text not null,
  url text not null,
  summary text not null,
  image_url text,
  author text,
  source_section text,
  source_label text not null,
  media_scope text not null check (media_scope in ('movie', 'series', 'mixed', 'tv')),
  badge text not null check (badge in ('Noticia', 'Estreno', 'Trailer', 'Tendencia')),
  editorial_tags text[] not null default '{}',
  genre_tags text[] not null default '{}',
  raw_payload jsonb not null default '{}'::jsonb,
  published_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_news_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  selected_topics text[] not null default '{"movies","series","releases","trailers","mainstream"}',
  selected_genres text[] not null default '{}',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists news_items_published_at_idx on public.news_items (published_at desc);
create index if not exists news_items_editorial_tags_idx on public.news_items using gin (editorial_tags);
create index if not exists news_items_genre_tags_idx on public.news_items using gin (genre_tags);

insert into public.editorial_sources (source_key, name, feed_url, source_type)
values
  ('sensacine-all', 'SensaCine - Todas las noticias', 'https://www.sensacine.com/rss/noticias.xml', 'all'),
  ('sensacine-movies', 'SensaCine - Noticias de cine', 'https://www.sensacine.com/rss/noticias-cine.xml', 'movies'),
  ('sensacine-series', 'SensaCine - Noticias de series', 'https://www.sensacine.com/rss/noticias-series.xml', 'series'),
  ('sensacine-tv', 'SensaCine - Noticias de televisión', 'https://www.sensacine.com/rss/noticias-television.xml', 'tv')
on conflict (source_key) do update
set
  name = excluded.name,
  feed_url = excluded.feed_url,
  source_type = excluded.source_type,
  is_active = true;

alter table public.editorial_sources enable row level security;
alter table public.news_items enable row level security;
alter table public.user_news_preferences enable row level security;

create policy "editorial sources are public read"
  on public.editorial_sources for select
  using (true);

create policy "news items are public read"
  on public.news_items for select
  using (true);

create policy "users read own news preferences"
  on public.user_news_preferences for select
  using (auth.uid() = user_id);

create policy "users insert own news preferences"
  on public.user_news_preferences for insert
  with check (auth.uid() = user_id);

create policy "users update own news preferences"
  on public.user_news_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
