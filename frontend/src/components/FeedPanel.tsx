import { useEffect, useMemo, useState } from "react";
import { demoDiscovery, demoFeed } from "../data/demoData";
import { useMediaDetails } from "./MediaDetailsModal";
import { createFeedPost, fetchFeedPosts, fetchFeedPostsByUsers } from "../lib/feed";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchFollowingUserIds } from "../lib/follows";
import { getTitleById } from "../lib/tmdb";
import type { DiscoveryItem, FeedEntry } from "../types";

function findMediaFromPost(body: string) {
  const lowered = body.toLowerCase();
  return demoDiscovery.find((item) => lowered.includes(item.title.toLowerCase()));
}

type FeedPanelProps = {
  userId: string;
  profile: Profile | null;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
};

type FeedMode = "discover" | "following";
const COMPOSER_WORD_LIMIT = 130;

function countWords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

function parseRatingPost(body: string) {
  const fullReviewMatch = body.match(
    /^(Le gusto|No le gusto) (.+?), le dio (\d)\/5 y dijo: "([\s\S]+)"$/
  );

  if (fullReviewMatch) {
    return {
      sentiment: fullReviewMatch[1],
      title: fullReviewMatch[2],
      rating: Number(fullReviewMatch[3]),
      quote: fullReviewMatch[4]
    };
  }

  const shortReviewMatch = body.match(/^(Le gusto|No le gusto) (.+?) y le dio (\d)\/5\.$/);
  if (shortReviewMatch) {
    return {
      sentiment: shortReviewMatch[1],
      title: shortReviewMatch[2],
      quote: ""
    };
  }

  const fullReviewWithoutStarsMatch = body.match(/^(Le gusto|No le gusto) (.+?) y dijo: "([\s\S]+)"\.?$/);
  if (fullReviewWithoutStarsMatch) {
    return {
      sentiment: fullReviewWithoutStarsMatch[1],
      title: fullReviewWithoutStarsMatch[2],
      quote: fullReviewWithoutStarsMatch[3]
    };
  }

  const shortReviewWithoutStarsMatch = body.match(/^(Le gusto|No le gusto) (.+?)\.?$/);
  if (shortReviewWithoutStarsMatch) {
    return {
      sentiment: shortReviewWithoutStarsMatch[1],
      title: shortReviewWithoutStarsMatch[2],
      quote: ""
    };
  }

  return null;
}

export function FeedPanel({ userId, profile, onOpenUserProfile }: FeedPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [entries, setEntries] = useState<FeedEntry[]>(demoFeed);
  const [followingEntries, setFollowingEntries] = useState<FeedEntry[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, DiscoveryItem>>({});
  const [activeFeedMode, setActiveFeedMode] = useState<FeedMode>("discover");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [composerText, setComposerText] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [composerMessage, setComposerMessage] = useState<string | null>(null);
  const composerWordCount = useMemo(() => countWords(composerText), [composerText]);

  useEffect(() => {
    async function loadFeed() {
      const [feedResult, followingResult, profilesResult] = await Promise.allSettled([
        fetchFeedPosts(),
        fetchFollowingUserIds(userId),
        listProfiles()
      ]);

        if (feedResult.status === "fulfilled" && feedResult.value.length) {
          setEntries(feedResult.value);
        } else if (feedResult.status === "rejected") {
          setEntries(demoFeed);
        }

        if (followingResult.status === "fulfilled") {
          if (followingResult.value.length) {
            try {
              const followingFeed = await fetchFeedPostsByUsers(followingResult.value);
              setFollowingEntries(followingFeed);
            } catch {
              setFollowingEntries([]);
            }
          } else {
            setFollowingEntries([]);
          }
        } else {
          setFollowingEntries([]);
        }

        if (profilesResult.status === "fulfilled") {
          setProfiles(profilesResult.value);
        } else {
          setProfiles([]);
        }
    }

    void loadFeed();
  }, [userId]);

  const discoverProfiles = useMemo(() => {
    return profiles.filter((entry) => entry.id !== userId).slice(0, 3);
  }, [profiles, userId]);

  const visibleEntries = useMemo(() => {
    if (activeFeedMode === "following") {
      return followingEntries;
    }

    return entries;
  }, [activeFeedMode, entries, followingEntries]);

  const postsWithMedia = useMemo(
    () =>
      visibleEntries.map((entry) => {
        const fallbackMedia = findMediaFromPost(entry.body);
        const key = entry.tmdbId && entry.mediaType ? `${entry.mediaType}-${entry.tmdbId}` : null;
        const mappedMedia = key ? mediaMap[key] : undefined;
        return {
          entry,
          media: mappedMedia ?? fallbackMedia ?? null
        };
      }),
    [mediaMap, visibleEntries]
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

  async function handlePublish() {
    const body = composerText.trim();
    if (!body || composerWordCount > COMPOSER_WORD_LIMIT) {
      return;
    }

    try {
      setIsPublishing(true);
      setComposerMessage(null);
      await createFeedPost({
        userId,
        body,
        postType: "watchlist"
      });

      setEntries((current) => [
        {
          id: `local-${Date.now()}`,
          userId,
          author: profile?.display_name ?? "Vos",
          username: profile?.username ?? "vos",
          body,
          createdAtLabel: "Ahora",
          type: "watchlist"
        },
        ...current
      ]);
      setComposerText("");
      setComposerMessage("Tu post ya salio en el feed.");
    } catch {
      setComposerMessage("No pude publicar tu post.");
    } finally {
      setIsPublishing(false);
    }
  }

  function openAuthorProfile(targetUserId?: string, username?: string) {
    if (!targetUserId) {
      return;
    }

    onOpenUserProfile({ userId: targetUserId, username });
  }

  function handleComposerChange(value: string) {
    if (countWords(value) > COMPOSER_WORD_LIMIT) {
      return;
    }

    setComposerText(value);
  }

  return (
    <section className="feed-shell">
      <div className="feed-main">
        <header className="feed-header">
          <button
            type="button"
            className={`feed-header__tab ${activeFeedMode === "discover" ? "is-active" : ""}`}
            onClick={() => setActiveFeedMode("discover")}
          >
            Descubri
          </button>
          <button
            type="button"
            className={`feed-header__tab ${activeFeedMode === "following" ? "is-active" : ""}`}
            onClick={() => setActiveFeedMode("following")}
          >
            Siguiendo
          </button>
        </header>

        <section className="composer-card">
          <div className="composer-card__avatar">
            {(profile?.display_name ?? "Cinerian").slice(0, 1).toUpperCase()}
          </div>
          <div className="composer-card__body">
            <div className="composer-card__row">
              <input
                type="text"
                className="composer-card__input composer-card__input--inline"
                value={composerText}
                onChange={(event) => handleComposerChange(event.target.value)}
                placeholder="¿Que peli o serie te volo la cabeza hoy?"
                maxLength={900}
              />
              <button
                type="button"
                className="primary-button composer-card__submit"
                onClick={() => void handlePublish()}
                disabled={isPublishing || !composerText.trim() || composerWordCount > COMPOSER_WORD_LIMIT}
              >
                Publicar
              </button>
            </div>
            <div className="composer-card__footer">
              <span className={composerWordCount >= COMPOSER_WORD_LIMIT ? "composer-card__limit is-limit" : "composer-card__limit"}>
                {composerWordCount}/{COMPOSER_WORD_LIMIT}
              </span>
            </div>
            {composerMessage ? <div className="inline-status">{composerMessage}</div> : null}
          </div>
        </section>

        <div className="timeline-list">
          {postsWithMedia.length ? (
            postsWithMedia.map(({ entry, media }) => {
              const parsedRating = entry.type === "rating" ? parseRatingPost(entry.body) : null;

              return (
                <article className="timeline-card" key={entry.id}>
                  <button
                    type="button"
                    className="timeline-card__avatar timeline-card__avatar--interactive"
                    onClick={() => openAuthorProfile(entry.userId, entry.username)}
                    aria-label={`Ver perfil de ${entry.author}`}
                  >
                    {entry.author.slice(0, 1)}
                  </button>

                  <div className="timeline-card__content">
                    <div className="timeline-card__topline">
                      <div>
                        <button
                          type="button"
                          className="timeline-card__author"
                          onClick={() => openAuthorProfile(entry.userId, entry.username)}
                        >
                          <strong>{entry.author}</strong>
                        </button>
                        <button
                          type="button"
                          className="timeline-card__handle"
                          onClick={() => openAuthorProfile(entry.userId, entry.username)}
                        >
                          @{entry.username ?? entry.author.toLowerCase()}
                        </button>
                        <span className="timeline-card__meta">· {entry.createdAtLabel}</span>
                      </div>
                    </div>

                    {parsedRating ? (
                      <>
                        <p className="timeline-card__text timeline-card__text--light">
                          {parsedRating.sentiment} {parsedRating.title}
                        </p>
                        {parsedRating.quote ? (
                          <p className="timeline-card__text timeline-card__text--featured">
                            "{parsedRating.quote}"
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="timeline-card__text">{entry.body}</p>
                    )}

                    {media ? (
                      <div className="timeline-card__media timeline-card__media--interactive" onClick={() => openMediaDetails(media)}>
                        <div className="detail-poster">
                          <img src={media.posterUrl} alt={media.title} className="timeline-card__poster" />
                          <span className="detail-poster__hint" aria-hidden="true">
                            Ver detalles
                          </span>
                        </div>
                        <div className="timeline-card__media-copy">
                          <p className="meta-line">
                            {media.mediaType === "tv" ? "Serie" : "Pelicula"} • {media.year}
                          </p>
                          <h3>{media.title}</h3>
                          {media.genres.length ? (
                            <p className="timeline-card__genres">{media.genres.join(" · ")}</p>
                          ) : null}
                          <p>{media.overview}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="timeline-empty">
              {activeFeedMode === "following"
                ? "Todavia no seguis a nadie o esa gente aun no publico en Cinerian."
                : "Todavia no hay publicaciones para descubrir."}
            </div>
          )}
        </div>
      </div>

      <aside className="feed-sidebar">
        <section className="sidebar-card">
          <strong>Explorar Cinerianos</strong>

          <div className="sidebar-users">
            {discoverProfiles.length ? (
              discoverProfiles.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="sidebar-user"
                  onClick={() => onOpenUserProfile({ userId: entry.id, username: entry.username })}
                >
                  <span className="sidebar-user__avatar" aria-hidden="true">
                    {entry.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="sidebar-user__copy">
                    <strong>{entry.display_name}</strong>
                    <span>@{entry.username}</span>
                  </span>
                </button>
              ))
            ) : (
              <p className="sidebar-empty">Todavia no hay suficientes cinerianos para mostrar aca.</p>
            )}
          </div>
        </section>

        <section className="sidebar-card">
          <p className="section-eyebrow">En conversacion</p>
          <div className="sidebar-list">
            {conversationItems.length ? (
              conversationItems.map(({ media, posts }) => (
                <article className="sidebar-media" key={media.id}>
                  <div className="detail-poster detail-poster--compact" onClick={() => openMediaDetails(media)}>
                    <img
                      src={media.posterUrl}
                      alt={media.title}
                      className="sidebar-media__poster sidebar-media__poster--interactive"
                    />
                    <span className="detail-poster__hint" aria-hidden="true">
                      Ver detalles
                    </span>
                  </div>
                  <div>
                    <strong className="media-linklike" onClick={() => openMediaDetails(media)}>{media.title}</strong>
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
              <div
                key={item.id}
                className="detail-poster detail-poster--stack"
                onClick={() => openMediaDetails(item)}
              >
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  className="poster-stack__item poster-stack__item--interactive"
                />
                <span className="detail-poster__hint" aria-hidden="true">
                  Ver detalles
                </span>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}
