import { useEffect, useMemo, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import {
  deleteFeedPost,
  fetchUserMediaPosts,
  fetchUserTextPosts,
  updateFeedPost
} from "../lib/feed";
import {
  fetchStoredReactions,
  REACTIONS_UPDATED_EVENT,
  removeStoredReaction,
  type StoredReaction
} from "../lib/reactions";
import { getTitleById } from "../lib/tmdb";
import type { DiscoveryItem, FeedEntry } from "../types";

type ProfileTabsProps = {
  userId: string;
  readOnly?: boolean;
  isOwnProfile?: boolean;
};

type TabId = "watched" | "liked" | "recommendations" | "posts";

const tabLabels: Record<TabId, string> = {
  watched: "Vistas",
  liked: "Watchlist",
  recommendations: "Mis recomendaciones",
  posts: "Posts"
};

function parseRatingPost(body: string) {
  const fullReviewMatch = body.match(/^Le gusto (.+?), le dio (\d)\/5 y dijo: "([\s\S]+)"\.?$/);
  if (fullReviewMatch) {
    return {
      title: fullReviewMatch[1],
      quote: fullReviewMatch[3],
      liked: true
    };
  }

  const shortReviewMatch = body.match(/^(Le gusto|No le gusto) (.+?)(?:,| y) le dio (\d)\/5\.?$/);
  if (shortReviewMatch) {
    return {
      title: shortReviewMatch[2],
      quote: "",
      liked: shortReviewMatch[1] === "Le gusto"
    };
  }

  const fullReviewWithoutStarsMatch = body.match(/^(Le gusto|No le gusto) (.+?) y dijo: "([\s\S]+)"\.?$/);
  if (fullReviewWithoutStarsMatch) {
    return {
      title: fullReviewWithoutStarsMatch[2],
      quote: fullReviewWithoutStarsMatch[3],
      liked: fullReviewWithoutStarsMatch[1] === "Le gusto"
    };
  }

  const shortReviewWithoutStarsMatch = body.match(/^(Le gusto|No le gusto) (.+?)\.?$/);
  if (shortReviewWithoutStarsMatch) {
    return {
      title: shortReviewWithoutStarsMatch[2],
      quote: "",
      liked: shortReviewWithoutStarsMatch[1] === "Le gusto"
    };
  }

  return null;
}

export function ProfileTabs({
  userId,
  readOnly = false,
  isOwnProfile = true
}: ProfileTabsProps) {
  const { openMediaDetails } = useMediaDetails();
  const [activeTab, setActiveTab] = useState<TabId>("watched");
  const [reactions, setReactions] = useState<StoredReaction[]>([]);
  const [titles, setTitles] = useState<Record<string, DiscoveryItem>>({});
  const [posts, setPosts] = useState<FeedEntry[]>([]);
  const [mediaPosts, setMediaPosts] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadProfileMedia() {
      setIsLoading(true);

      try {
        const [results, ownPosts, ownMediaPosts] = await Promise.all([
          fetchStoredReactions(userId),
          fetchUserTextPosts(userId),
          fetchUserMediaPosts(userId)
        ]);
        if (!isMounted) {
          return;
        }

        setReactions(results);
        setPosts(ownPosts);
        setMediaPosts(ownMediaPosts);

        const detailed = await Promise.all(
          [
            ...results
              .filter((entry) => entry.reaction === "liked" || entry.reaction === "watched")
              .map((entry) => ({ tmdbId: entry.tmdbId, mediaType: entry.mediaType })),
            ...ownMediaPosts
              .filter((post): post is FeedEntry & { tmdbId: number; mediaType: DiscoveryItem["mediaType"] } => Boolean(post.tmdbId && post.mediaType))
              .map((post) => ({ tmdbId: post.tmdbId, mediaType: post.mediaType }))
          ].map(async (entry) => {
              const title = await getTitleById(entry.tmdbId, entry.mediaType);
              if (!title) {
                return null;
              }

              return [`${entry.mediaType}-${entry.tmdbId}`, title] as const;
            })
        );

        if (!isMounted) {
          return;
        }

        const nextTitles: Record<string, DiscoveryItem> = {};
        for (const entry of detailed) {
          if (!entry) {
            continue;
          }

          nextTitles[entry[0]] = entry[1];
        }

        setTitles(nextTitles);
        setSyncMessage(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    function handleReactionsUpdated(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) {
        return;
      }

      void loadProfileMedia();
    }

    void loadProfileMedia();
    window.addEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);

    return () => {
      isMounted = false;
      window.removeEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);
    };
  }, [userId]);

  const visibleTabs = useMemo(() => ["watched", "liked", "recommendations", "posts"] as TabId[], []);

  const tabItems = useMemo(() => {
    return reactions
      .filter((entry) => entry.reaction === activeTab)
      .map((entry) => titles[`${entry.mediaType}-${entry.tmdbId}`])
      .filter((item): item is DiscoveryItem => Boolean(item));
  }, [activeTab, reactions, titles]);

  async function handleRemove(item: DiscoveryItem) {
    if (activeTab !== "watched" && activeTab !== "liked") {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await removeStoredReaction(userId, item, activeTab);
      setReactions((current) =>
        current.filter(
          (entry) =>
            !(
              entry.tmdbId === item.id &&
              entry.mediaType === item.mediaType &&
              entry.reaction === activeTab
            )
        )
      );
    } catch {
      setSyncMessage("No pude eliminar este titulo del perfil.");
    } finally {
      setIsSyncing(false);
    }
  }

  function startEditing(post: FeedEntry) {
    setEditingPostId(post.id);
    setEditingBody(post.body);
  }

  async function handleSavePost(postId: string) {
    const body = editingBody.trim();
    if (!body) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await updateFeedPost({
        postId,
        userId,
        body
      });
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                body
              }
            : post
        )
      );
      setEditingPostId(null);
      setEditingBody("");
    } catch {
      setSyncMessage("No pude editar este post.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDeletePost(postId: string) {
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await deleteFeedPost({
        postId,
        userId
      });
      setPosts((current) => current.filter((post) => post.id !== postId));
      if (editingPostId === postId) {
        setEditingPostId(null);
        setEditingBody("");
      }
    } catch {
      setSyncMessage("No pude eliminar este post.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="profile-tabs">
      <div className="profile-tabs__switcher">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`profile-tabs__switch ${activeTab === tab ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {!readOnly && syncMessage ? <div className="inline-status">{syncMessage}</div> : null}

      {isLoading ? (
        <div className="profile-grid__empty">
          {isOwnProfile ? "Cargando tu videoteca..." : "Cargando este perfil..."}
        </div>
      ) : activeTab === "recommendations" ? (
        mediaPosts.filter((post) => {
          if (post.type !== "rating") {
            return false;
          }

          const parsed = parseRatingPost(post.body);
          return Boolean(parsed?.liked);
        }).length ? (
          <div className="profile-posts">
            {mediaPosts
              .filter((post) => {
                if (post.type !== "rating") {
                  return false;
                }

                const parsed = parseRatingPost(post.body);
                return Boolean(parsed?.liked);
              })
              .map((post) => {
                if (!post.tmdbId || !post.mediaType) {
                  return null;
                }

                const item = titles[`${post.mediaType}-${post.tmdbId}`];
                const parsedRating = parseRatingPost(post.body);

                return (
                  <article className="profile-post-card profile-post-card--media" key={post.id}>
                <div className="profile-post-card__topline">
                      <strong>{isOwnProfile ? "La recomendas" : "La recomienda"}</strong>
                      <span>{post.createdAtLabel}</span>
                </div>

                    <div className="profile-post-card__media-layout">
                      {item ? (
                        <div className="detail-poster detail-poster--profile" onClick={() => openMediaDetails(item)}>
                    <img
                            src={item.posterUrl}
                            alt={item.title}
                      className="profile-post-card__poster"
                    />
                    <span className="detail-poster__hint" aria-hidden="true">
                      Ver detalles
                    </span>
                        </div>
                      ) : null}

                      <div className="profile-post-card__media-copy">
                        <strong className="media-linklike" onClick={() => item ? openMediaDetails(item) : undefined}>
                          {item?.title ?? parsedRating?.title ?? "Titulo"}
                        </strong>
                    <span>
                          {item?.mediaType === "tv" ? "Serie" : "Pelicula"}{item?.year ? ` • ${item.year}` : ""}
                    </span>
                        <p className="profile-post-card__text">
                          {parsedRating?.quote ||
                            (isOwnProfile
                              ? "La viste, te gustó y la dejas como recomendada en tu perfil."
                              : "La vio, le gustó y la deja como recomendada en su perfil.")}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        ) : (
          <div className="profile-grid__empty">
            {isOwnProfile
              ? "Todavia no marcaste títulos que te gustaron para recomendar."
              : "Esta persona todavia no tiene recomendaciones públicas en su perfil."}
          </div>
        )
      ) : activeTab === "posts" ? (
        posts.length ? (
          <div className="profile-posts">
            {posts.map((post) => (
              <article className="profile-post-card" key={post.id}>
                <div className="profile-post-card__topline">
                  <strong>{isOwnProfile ? "Post propio" : "Post publicado"}</strong>
                  <span>{post.createdAtLabel}</span>
                </div>

                {!readOnly && editingPostId === post.id ? (
                  <textarea
                    className="profile-post-card__textarea"
                    value={editingBody}
                    onChange={(event) => setEditingBody(event.target.value)}
                  />
                ) : (
                  <p className="profile-post-card__text">{post.body}</p>
                )}

                {!readOnly ? (
                  <div className="profile-post-card__actions">
                    {editingPostId === post.id ? (
                      <>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={isSyncing || !editingBody.trim()}
                          onClick={() => void handleSavePost(post.id)}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={isSyncing}
                          onClick={() => {
                            setEditingPostId(null);
                            setEditingBody("");
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={isSyncing}
                          onClick={() => startEditing(post)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="profile-grid__remove"
                          disabled={isSyncing}
                          onClick={() => void handleDeletePost(post.id)}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="profile-grid__empty">
            {isOwnProfile
              ? "Todavia no publicaste textos propios en el feed."
              : "Esta persona todavia no publico textos propios en el feed."}
          </div>
        )
      ) : tabItems.length ? (
        <div className="profile-grid">
          {tabItems.map((item) => (
            <article className="profile-grid__item" key={`${item.mediaType}-${item.id}`}>
              <div className="detail-poster detail-poster--grid" onClick={() => openMediaDetails(item)}>
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  className="profile-grid__poster profile-grid__poster--interactive"
                />
                <span className="detail-poster__hint" aria-hidden="true">
                  Ver detalles
                </span>
              </div>
              <div className="profile-grid__meta">
                <strong className="media-linklike" onClick={() => openMediaDetails(item)}>{item.title}</strong>
                <span>
                  {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
                </span>
                {!readOnly ? (
                  <button
                    type="button"
                    className="recommendation-action-button recommendation-action-button--small profile-remove-button"
                    disabled={isSyncing}
                    onClick={() => void handleRemove(item)}
                    data-tooltip="Eliminar"
                    aria-label="Eliminar"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6 18 18" />
                      <path d="M18 6 6 18" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="profile-grid__empty">
          {activeTab === "watched"
            ? isOwnProfile
              ? "Todavia no marcaste titulos como vistos."
              : "Esta persona todavia no marco titulos como vistos."
            : isOwnProfile
              ? "Todavia no guardaste titulos en Watchlist."
              : "Esta persona todavia no guardo titulos en Watchlist."}
        </div>
      )}
    </section>
  );
}
