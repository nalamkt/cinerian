import { useEffect, useMemo, useState } from "react";
import { demoDiscovery, demoFeed } from "../data/demoData";
import { fetchFeedPosts } from "../lib/feed";
import { getTitleById } from "../lib/tmdb";
import type { DiscoveryItem, FeedEntry } from "../types";

function findMediaFromPost(body: string) {
  const lowered = body.toLowerCase();
  return demoDiscovery.find((item) => lowered.includes(item.title.toLowerCase()));
}

export function FeedPanel() {
  const [entries, setEntries] = useState<FeedEntry[]>(demoFeed);
  const [mediaMap, setMediaMap] = useState<Record<string, DiscoveryItem>>({});

  useEffect(() => {
    void fetchFeedPosts()
      .then((results) => {
        if (results.length) {
          setEntries(results);
        }
      })
      .catch(() => {
        setEntries(demoFeed);
      });
  }, []);

  const postsWithMedia = useMemo(
    () =>
      entries.map((entry) => {
        const fallbackMedia = findMediaFromPost(entry.body);
        const key = entry.tmdbId && entry.mediaType ? `${entry.mediaType}-${entry.tmdbId}` : null;
        const mappedMedia = key ? mediaMap[key] : undefined;
        return {
          entry,
          media: mappedMedia ?? fallbackMedia ?? null
        };
      }),
    [entries, mediaMap]
  );

  const conversationItems = useMemo(() => {
    const counts = new Map<
      string,
      {
        media: DiscoveryItem;
        posts: number;
      }
    >();

    postsWithMedia.forEach(({ media }) => {
      if (!media) {
        return;
      }

      const key = `${media.mediaType}-${media.id}`;
      const current = counts.get(key);

      if (current) {
        current.posts += 1;
        return;
      }

      counts.set(key, {
        media,
        posts: 1
      });
    });

    return [...counts.values()].sort((a, b) => b.posts - a.posts).slice(0, 3);
  }, [postsWithMedia]);

  useEffect(() => {
    const targets = entries.filter((entry) => entry.tmdbId && entry.mediaType);
    const missing = targets.filter((entry) => !mediaMap[`${entry.mediaType}-${entry.tmdbId}`]);

    if (!missing.length) {
      return;
    }

    void Promise.all(
      missing.map(async (entry) => {
        const media = await getTitleById(entry.tmdbId!, entry.mediaType!);
        return {
          key: `${entry.mediaType}-${entry.tmdbId}`,
          media
        };
      })
    ).then((results) => {
      setMediaMap((current) => {
        const next = { ...current };
        results.forEach((result) => {
          if (result.media) {
            next[result.key] = result.media;
          }
        });
        return next;
      });
    });
  }, [entries, mediaMap]);

  return (
    <section className="feed-shell">
      <div className="feed-main">
        <header className="feed-header">
          <button type="button" className="feed-header__tab is-active">
            Para ti
          </button>
          <button type="button" className="feed-header__tab">
            Siguiendo
          </button>
        </header>

        <section className="composer-card">
          <div className="composer-card__avatar">C</div>
          <div className="composer-card__body">
            <input
              className="composer-card__input"
              type="text"
              placeholder="¿Que peli o serie te volo la cabeza hoy?"
            />
            <div className="composer-card__footer">
              <div className="composer-card__tools">
                <span>Poster</span>
                <span>Puntaje</span>
                <span>Watchlist</span>
              </div>
              <button type="button" className="primary-button">
                Publicar
              </button>
            </div>
          </div>
        </section>

        <div className="timeline-list">
          {postsWithMedia.map(({ entry, media }) => {

            return (
              <article className="timeline-card" key={entry.id}>
                <div className="timeline-card__avatar">{entry.author.slice(0, 1)}</div>

                <div className="timeline-card__content">
                  <div className="timeline-card__topline">
                    <div>
                      <strong>{entry.author}</strong>
                      <span className="timeline-card__meta">@{entry.author.toLowerCase()}</span>
                      <span className="timeline-card__meta">· {entry.createdAtLabel}</span>
                    </div>
                  </div>

                  <p className="timeline-card__text">{entry.body}</p>

                  {media ? (
                    <div className="timeline-card__media">
                      <img src={media.posterUrl} alt={media.title} className="timeline-card__poster" />
                      <div className="timeline-card__media-copy">
                        <p className="meta-line">
                          {media.mediaType === "tv" ? "Serie" : "Pelicula"} • {media.year}
                        </p>
                        <h3>{media.title}</h3>
                        <p>{media.overview}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="feed-sidebar">
        <section className="sidebar-card">
          <label className="sidebar-search">
            <span>Explorar Cinerianos</span>
            <input type="search" placeholder="Busca personas o posteos" />
          </label>
        </section>

        <section className="sidebar-card">
          <p className="section-eyebrow">En conversacion</p>
          <div className="sidebar-list">
            {conversationItems.length ? (
              conversationItems.map(({ media, posts }) => (
                <article className="sidebar-media" key={media.id}>
                  <img src={media.posterUrl} alt={media.title} className="sidebar-media__poster" />
                  <div>
                    <strong>{media.title}</strong>
                    <p>
                      {posts} {posts === 1 ? "posteo" : "posteos"} en el feed
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <p className="sidebar-empty">Todavia no hay suficiente conversacion para armar tendencias.</p>
            )}
          </div>
        </section>

        <section className="sidebar-card">
          <p className="section-eyebrow">Recomendados para vos</p>
          <div className="poster-stack">
            {demoDiscovery.map((item) => (
              <img key={item.id} src={item.posterUrl} alt={item.title} className="poster-stack__item" />
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}
