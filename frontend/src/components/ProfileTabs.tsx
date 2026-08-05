import { useEffect, useMemo, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { fetchSentMessages } from "../lib/inbox";
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
import type { DiscoveryItem, FeedEntry, RecommendationMessage } from "../types";

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [sentRecommendations, setSentRecommendations] = useState<RecommendationMessage[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadProfileMedia() {
      setIsLoading(true);

      try {
        const [results, ownPosts, ownMediaPosts, ownSentRecommendations] = await Promise.all([
          fetchStoredReactions(userId),
          fetchUserTextPosts(userId),
          fetchUserMediaPosts(userId),
          isOwnProfile ? fetchSentMessages(userId) : Promise.resolve([])
        ]);
        if (!isMounted) {
          return;
        }

        setReactions(results);
        setPosts(ownPosts);
        setSentRecommendations(ownSentRecommendations);

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

  const visibleTabs = useMemo(
    () =>
      (["watched", "liked", ...(isOwnProfile ? (["recommendations"] as TabId[]) : []), "posts"] as TabId[]),
    [isOwnProfile]
  );

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
        isOwnProfile && sentRecommendations.length ? (
          <div className="profile-posts">
            {sentRecommendations.map((message) => (
              <article className="profile-post-card profile-post-card--media" key={message.id}>
                <div className="profile-post-card__topline">
                  <strong>Recomendación privada enviada</strong>
                  <span>{message.createdAtLabel}</span>
                </div>

                <div className="profile-post-card__media-layout">
                  <div className="detail-poster detail-poster--profile" onClick={() => openMediaDetails(message.item)}>
                    <img
                      src={message.item.posterUrl}
                      alt={message.item.title}
                      className="profile-post-card__poster"
                    />
                    <span className="detail-poster__hint" aria-hidden="true">
                      Ver detalles
                    </span>
                  </div>

                  <div className="profile-post-card__media-copy">
                    <strong className="media-linklike" onClick={() => openMediaDetails(message.item)}>
                      {message.item.title}
                    </strong>
                    <span>
                      {message.item.mediaType === "tv" ? "Serie" : "Pelicula"} • {message.item.year}
                    </span>
                    <p className="profile-post-card__text">
                      Para @{message.recipientProfile?.username ?? "cineriano"} ·{" "}
                      {message.readAt ? "Vista por la otra persona" : "Pendiente de leer"}
                    </p>
                    {message.note.trim() ? (
                      <p className="profile-post-card__text">"{message.note.trim()}"</p>
                    ) : (
                      <p className="profile-post-card__text">
                        La mandaste sin mensaje extra.
                      </p>
                    )}
                    {message.replies?.length ? (
                      <p className="profile-post-card__text">
                        {message.replies.length} {message.replies.length === 1 ? "respuesta" : "respuestas"} en el hilo
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="profile-grid__empty">
            Todavia no mandaste recomendaciones privadas.
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
