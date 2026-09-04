import { useEffect, useMemo, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { LoadingState } from "./LoadingState";
import { TitleCard } from "./TitleCard";
import { WatchNowRow } from "./WatchNowRow";
import {
  type CurrentWatchingEntry,
  type Profile,
  type ProfileVisibilitySettings,
  updateProfile
} from "../lib/auth";
import { deleteFeedPost, fetchUserTextPosts, updateFeedPost } from "../lib/feed";
import {
  fetchStoredReactions,
  isRatedReaction,
  REACTIONS_UPDATED_EVENT,
  removeStoredRatedReaction,
  removeStoredReaction,
  saveStoredReaction,
  type RatedReaction,
  type RecommendationReaction,
  type StoredReaction
} from "../lib/reactions";
import { fetchCircleScores, type CircleScore } from "../lib/recommendations";
import { getSeriesAiringInfo, getTitleById, searchTitles } from "../lib/tmdb";
import type { DiscoveryItem, FeedEntry, SeriesAiringInfo } from "../types";

type ProfileTabsProps = {
  userId: string;
  viewerUserId?: string;
  readOnly?: boolean;
  isOwnProfile?: boolean;
  profile?: Profile | null;
  visibilitySettings?: ProfileVisibilitySettings;
  onProfileUpdated?: (profile: Profile) => void;
  activitySummary?: {
    recommendations: number;
    posts: number;
    lastActivityLabel: string;
  };
  tasteInsights?: {
    topGenre: string;
    topDecade: string;
    formatSplit: string;
    profileMood: string;
  };
};

type TabId = "watched" | "watchlist" | "mutual-likes" | "watching" | "posts" | "insights";

type WatchingItem = {
  entry: CurrentWatchingEntry;
  item: DiscoveryItem;
  airing: SeriesAiringInfo | null;
};

// La pestana "Vistas" agrupa dos reacciones, asi que el id de pestana ya no
// mapea 1:1 contra el valor guardado en la base.
const TAB_REACTIONS: Partial<Record<TabId, RecommendationReaction[]>> = {
  watched: ["superliked", "liked", "disliked"],
  watchlist: ["watchlist"]
};

/** Las reacciones viejas pueden no tener fecha: van al final. */
function toTimestamp(value: string | null) {
  return value ? new Date(value).getTime() : 0;
}

const tabLabels: Record<TabId, string> = {
  watched: "Vistas",
  watchlist: "Watchlist",
  "mutual-likes": "En común",
  watching: "Viendo",
  posts: "Posts",
  insights: "Insights"
};

export function ProfileTabs({
  userId,
  viewerUserId,
  readOnly = false,
  isOwnProfile = true,
  profile = null,
  visibilitySettings,
  onProfileUpdated,
  activitySummary = { recommendations: 0, posts: 0, lastActivityLabel: "Sin actividad reciente" },
  tasteInsights = {
    topGenre: "Sin definir",
    topDecade: "Sin definir",
    formatSplit: "Sin datos",
    profileMood: "Todavia estamos aprendiendo de este perfil"
  }
}: ProfileTabsProps) {
  const { openMediaDetails } = useMediaDetails();
  const [activeTab, setActiveTab] = useState<TabId>("watched");
  const [reactions, setReactions] = useState<StoredReaction[]>([]);
  const [viewerReactions, setViewerReactions] = useState<StoredReaction[]>([]);
  const [titles, setTitles] = useState<Record<string, DiscoveryItem>>({});
  const [posts, setPosts] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [watchingEntries, setWatchingEntries] = useState<CurrentWatchingEntry[]>([]);
  const [watchingItems, setWatchingItems] = useState<WatchingItem[]>([]);
  const [watchingQuery, setWatchingQuery] = useState("");
  const [watchingResults, setWatchingResults] = useState<DiscoveryItem[]>([]);
  const [isWatchingSearchOpen, setIsWatchingSearchOpen] = useState(false);
  const [isWatchingSearchLoading, setIsWatchingSearchLoading] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  useEffect(() => {
    setWatchingEntries(profile?.current_watching ?? []);
  }, [profile]);

  useEffect(() => {
    let isMounted = true;

    async function loadWatchingItems() {
      if (!watchingEntries.length) {
        setWatchingItems([]);
        return;
      }

      const resolved = await Promise.all(
        watchingEntries.map(async (entry) => {
          const [item, airing] = await Promise.all([
            getTitleById(entry.tmdbId, "tv"),
            getSeriesAiringInfo(entry.tmdbId)
          ]);

          if (!item || item.mediaType !== "tv") {
            return null;
          }

          return {
            entry,
            item,
            airing
          } satisfies WatchingItem;
        })
      );

      if (!isMounted) {
        return;
      }

      setWatchingItems(
        resolved
          .filter((entry): entry is WatchingItem => Boolean(entry))
          .sort((left, right) => right.entry.addedAt.localeCompare(left.entry.addedAt))
      );
    }

    void loadWatchingItems().catch(() => {
      if (isMounted) {
        setWatchingItems([]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [watchingEntries]);

  useEffect(() => {
    if (!isWatchingSearchOpen) {
      setWatchingQuery("");
      setWatchingResults([]);
      return;
    }

    const trimmed = watchingQuery.trim();
    if (!trimmed) {
      setWatchingResults([]);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setIsWatchingSearchLoading(true);
        const results = await searchTitles(trimmed);
        setWatchingResults(results.filter((item) => item.mediaType === "tv").slice(0, 8));
      } catch {
        setWatchingResults([]);
      } finally {
        setIsWatchingSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [isWatchingSearchOpen, watchingQuery]);

  useEffect(() => {
    let isMounted = true;

    async function loadProfileMedia() {
      setIsLoading(true);

      try {
        const [results, ownPosts, viewerResults] = await Promise.all([
          fetchStoredReactions(userId),
          fetchUserTextPosts(userId),
          viewerUserId && viewerUserId !== userId ? fetchStoredReactions(viewerUserId) : Promise.resolve([])
        ]);
        if (!isMounted) {
          return;
        }

        setReactions(results);
        setViewerReactions(viewerResults);
        setPosts(ownPosts);

        const detailed = await Promise.all(
          results
            .filter((entry) => entry.reaction !== "ignored")
            .map((entry) => ({ tmdbId: entry.tmdbId, mediaType: entry.mediaType }))
            .map(async (entry) => {
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
      if (detail?.userId && detail.userId !== userId && detail.userId !== viewerUserId) {
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
  }, [userId, viewerUserId]);

  const visibleTabs = useMemo(() => {
    const tabs: TabId[] = [];

    if (visibilitySettings?.showWatchlist !== false) {
      tabs.push("watched", "watchlist");

      if (!isOwnProfile && viewerUserId) {
        tabs.push("mutual-likes");
      }
    }

    if (isOwnProfile) {
      tabs.push("watching");
    }

    tabs.push("posts");

    if (visibilitySettings?.showActivity !== false) {
      tabs.push("insights");
    }

    return tabs;
  }, [isOwnProfile, viewerUserId, visibilitySettings?.showActivity, visibilitySettings?.showWatchlist]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? "posts");
    }
  }, [activeTab, visibleTabs]);

  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [circleScores, setCircleScores] = useState<Map<string, CircleScore>>(new Map());

  // El puntaje del circulo solo se usa para ordenar la Watchlist: lo pedimos
  // recien cuando se abre esa pestaña.
  useEffect(() => {
    if (activeTab !== "watchlist") {
      return;
    }

    let isMounted = true;

    void fetchCircleScores(userId)
      .then((result) => {
        if (isMounted) {
          setCircleScores(result);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCircleScores(new Map());
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, userId]);

  const mutualLikedItems = useMemo(() => {
    const viewerLikedKeys = new Set(
      viewerReactions
        .filter((entry) => entry.reaction === "liked" || entry.reaction === "superliked")
        .map((entry) => `${entry.mediaType}-${entry.tmdbId}`)
    );

    return reactions
      .filter((entry) => entry.reaction === "liked" || entry.reaction === "superliked")
      .filter((entry) => viewerLikedKeys.has(`${entry.mediaType}-${entry.tmdbId}`))
      .map((entry) => titles[`${entry.mediaType}-${entry.tmdbId}`])
      .filter((item): item is DiscoveryItem => Boolean(item))
      .filter((item) => typeFilter === "all" || item.mediaType === typeFilter);
  }, [reactions, titles, typeFilter, viewerReactions]);

  const tabItems = useMemo(() => {
    if (activeTab === "mutual-likes") {
      return mutualLikedItems;
    }

    const tabReactions = TAB_REACTIONS[activeTab] ?? [];
    const entries = reactions.filter((entry) => tabReactions.includes(entry.reaction));

    // Vistas arranca por lo ultimo que marcaste como visto.
    if (activeTab === "watched") {
      entries.sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt));
    }

    const items = entries
      .map((entry) => titles[`${entry.mediaType}-${entry.tmdbId}`])
      .filter((item): item is DiscoveryItem => Boolean(item))
      .filter((item) => typeFilter === "all" || item.mediaType === typeFilter);

    // La Watchlist es una lista para elegir que ver: arranca por lo mejor
    // puntuado por tu circulo. Lo que nadie de tu circulo vio queda al final
    // (no tiene puntaje, que no es lo mismo que tener cero) y ahi desempata TMDB.
    if (activeTab === "watchlist") {
      items.sort((left, right) => {
        const leftScore = circleScores.get(`${left.mediaType}-${left.id}`)?.score ?? null;
        const rightScore = circleScores.get(`${right.mediaType}-${right.id}`)?.score ?? null;

        if (leftScore !== rightScore) {
          if (leftScore === null) {
            return 1;
          }

          if (rightScore === null) {
            return -1;
          }

          return rightScore - leftScore;
        }

        return right.score - left.score;
      });
    }

    return items;
  }, [activeTab, circleScores, mutualLikedItems, reactions, titles, typeFilter]);

  const reactionByTitle = useMemo(
    () => new Map(reactions.map((entry) => [`${entry.mediaType}-${entry.tmdbId}`, entry.reaction])),
    [reactions]
  );

  const tabCounts: Partial<Record<TabId, number>> = {
    watched: reactions.filter(
      (entry) => isRatedReaction(entry.reaction)
    ).length,
    watchlist: reactions.filter((entry) => entry.reaction === "watchlist").length,
    "mutual-likes": mutualLikedItems.length,
    watching: watchingEntries.length,
    posts: posts.length
  };

  async function handleRemove(item: DiscoveryItem) {
    const tabReactions = TAB_REACTIONS[activeTab];
    if (!tabReactions) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      if (activeTab === "watched") {
        await removeStoredRatedReaction(userId, item);
      } else {
        await removeStoredReaction(userId, item, "watchlist");
      }
      setReactions((current) =>
        current.filter(
          (entry) =>
            !(
              entry.tmdbId === item.id &&
              entry.mediaType === item.mediaType &&
              tabReactions.includes(entry.reaction)
            )
        )
      );
    } catch {
      setSyncMessage("No pude eliminar este titulo del perfil.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleChangeRating(item: DiscoveryItem, reaction: RatedReaction) {
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({ userId, item, reaction });
      setReactions((current) => [
        ...current.filter(
          (entry) => !(entry.tmdbId === item.id && entry.mediaType === item.mediaType)
        ),
        {
          tmdbId: item.id,
          mediaType: item.mediaType,
          reaction,
          createdAt: new Date().toISOString()
        }
      ]);
    } catch {
      setSyncMessage("No pude actualizar tu puntuacion.");
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

  async function saveWatchingEntries(nextEntries: CurrentWatchingEntry[]) {
    if (!profile || !onProfileUpdated) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      const nextProfile = await updateProfile({
        userId: profile.id,
        displayName: profile.display_name,
        username: profile.username,
        bio: profile.bio ?? "",
        avatarUrl: profile.avatar_url ?? "",
        bannerUrl: profile.banner_url ?? "",
        gender: profile.gender,
        birthDate: profile.birth_date,
        favoriteGenres: profile.favorite_genres,
        favoriteTitles: profile.favorite_titles,
        featuredCollections: profile.featured_collections,
        currentWatching: nextEntries,
        visibilitySettings: profile.visibility_settings
      });
      onProfileUpdated(nextProfile);
      setWatchingEntries(nextEntries);
    } catch {
      setSyncMessage("No pude guardar la lista de series que estás viendo.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleAddWatching(item: DiscoveryItem) {
    if (item.mediaType !== "tv") {
      return;
    }

    const alreadyAdded = watchingEntries.some((entry) => entry.tmdbId === item.id);
    if (alreadyAdded) {
      return;
    }

    await saveWatchingEntries([
      {
        tmdbId: item.id,
        mediaType: "tv",
        addedAt: new Date().toISOString()
      },
      ...watchingEntries
    ]);
    setWatchingQuery("");
    setWatchingResults([]);
    setIsWatchingSearchOpen(false);
  }

  async function handleRemoveWatching(tmdbId: number) {
    await saveWatchingEntries(watchingEntries.filter((entry) => entry.tmdbId !== tmdbId));
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
            {tabCounts[tab] !== undefined ? (
              <span className="profile-tabs__switch-count">{tabCounts[tab]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {!readOnly && syncMessage ? <div className="inline-status">{syncMessage}</div> : null}

      {isLoading ? (
        <LoadingState label={isOwnProfile ? "Cargando tu videoteca..." : "Cargando este perfil..."} />
      ) : activeTab === "watching" ? (
        <div className="profile-watching">
          <div className="profile-watching__toolbar">
            <div>
              <p className="section-eyebrow">Privado</p>
              <h3>Series que estás viendo ahora</h3>
              <p className="profile-secondary__copy">
                Esta sección solo la ves vos. Podés anotar qué venís siguiendo y cuándo sale lo próximo.
              </p>
            </div>

            <button
              type="button"
              className="profile-share-button"
              onClick={() => setIsWatchingSearchOpen((current) => !current)}
            >
              {isWatchingSearchOpen ? "Cerrar" : "Agregar serie"}
            </button>
          </div>

          {isWatchingSearchOpen ? (
            <div className="profile-watching__search">
              <input
                type="search"
                value={watchingQuery}
                onChange={(event) => setWatchingQuery(event.target.value)}
                placeholder="Buscá una serie para sumar a Viendo"
              />

              {isWatchingSearchLoading ? (
                <div className="profile-grid__empty">Buscando series...</div>
              ) : watchingQuery.trim() && watchingResults.length ? (
                <div className="profile-watching-search-results">
                  {watchingResults.map((item) => {
                    const isAdded = watchingEntries.some((entry) => entry.tmdbId === item.id);

                    return (
                      <article key={`${item.mediaType}-${item.id}`} className="liked-card">
                        <img src={item.posterUrl} alt={item.title} className="liked-card__poster" />
                        <div className="liked-card__copy">
                          <strong>{item.title}</strong>
                          <span>
                            Serie{item.year ? ` • ${item.year}` : ""}
                          </span>
                          <p>{item.genres.slice(0, 2).join(" · ") || "Sin género cargado"}</p>
                          <div className="liked-card__actions">
                            <button
                              type="button"
                              className="profile-follow-button"
                              disabled={isAdded || isSyncing}
                              onClick={() => void handleAddWatching(item)}
                            >
                              {isAdded ? "Ya está en Viendo" : "Agregar"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : watchingQuery.trim() ? (
                <div className="profile-grid__empty">No encontré series para esa búsqueda.</div>
              ) : null}
            </div>
          ) : null}

          {watchingItems.length ? (
            <div className="profile-watching__list">
              {watchingItems.map(({ entry, item, airing }) => (
                <article key={entry.tmdbId} className="profile-watching-card">
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

                  <div className="profile-watching-card__copy">
                    <div className="profile-watching-card__topline">
                      <div>
                        <strong className="media-linklike" onClick={() => openMediaDetails(item)}>
                          {item.title}
                        </strong>
                        <span>
                          Serie{item.year ? ` • ${item.year}` : ""}
                          {airing?.statusLabel ? ` • ${airing.statusLabel}` : ""}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="profile-grid__remove"
                        disabled={isSyncing}
                        onClick={() => void handleRemoveWatching(entry.tmdbId)}
                      >
                        Quitar
                      </button>
                    </div>

                    <div className="profile-watching-card__schedule">
                      <p>
                        {airing?.nextEpisodeLabel
                          ? airing.nextEpisodeLabel
                          : "Sin próximo episodio confirmado por ahora."}
                      </p>
                      <span>
                        {airing?.nextEpisodeDayLabel
                          ? `Si se mantiene, el próximo cae ${airing.nextEpisodeDayLabel}.`
                          : "La info de salida puede variar según TMDB."}
                      </span>
                    </div>

                    <WatchNowRow item={item} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="profile-grid__empty">
              Todavía no cargaste series en Viendo. Sumá una desde el buscador para arrancar.
            </div>
          )}
        </div>
      ) : activeTab === "insights" ? (
        <div className="profile-insights-tab">
          <div className="profile-summary-grid">
            <article className="profile-summary-card">
              <span className="profile-summary-card__label">Recomendaciones</span>
              <strong>{activitySummary.recommendations}</strong>
              <p>
                {isOwnProfile
                  ? "Titulos que dejaste visibles como parte de tu gusto."
                  : "Titulos recomendados dentro de este perfil."}
              </p>
            </article>
            <article className="profile-summary-card">
              <span className="profile-summary-card__label">Posts propios</span>
              <strong>{activitySummary.posts}</strong>
              <p>
                {isOwnProfile
                  ? "Textos y opiniones publicadas por vos."
                  : "Textos y opiniones que esta persona compartio."}
              </p>
            </article>
            <article className="profile-summary-card">
              <span className="profile-summary-card__label">Ultimo movimiento</span>
              <strong>{activitySummary.lastActivityLabel}</strong>
              <p>
                {isOwnProfile
                  ? "La senal mas reciente de tu actividad."
                  : "Lo ultimo que movio dentro de Cinerian."}
              </p>
            </article>
          </div>

          {isOwnProfile && visibilitySettings?.showInsights !== false ? (
            <div className="profile-insights">
              <div className="profile-insights__header">
                <div>
                  <p className="section-eyebrow">Insights de gusto</p>
                  <h3>Lo que tu historial dice de vos</h3>
                  <p>{tasteInsights.profileMood}</p>
                </div>
              </div>

              <div className="profile-insights__grid">
                <article className="profile-insight-card">
                  <span>Genero dominante</span>
                  <strong>{tasteInsights.topGenre}</strong>
                </article>
                <article className="profile-insight-card">
                  <span>Decada favorita</span>
                  <strong>{tasteInsights.topDecade}</strong>
                </article>
                <article className="profile-insight-card">
                  <span>Balance de formato</span>
                  <strong>{tasteInsights.formatSplit}</strong>
                </article>
              </div>
            </div>
          ) : null}
        </div>
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
      ) : (
        <>
          {activeTab === "mutual-likes" ? (
            <div className="profile-mutual-likes__intro">
              <p className="section-eyebrow">Punto en común</p>
              <h3>En común</h3>
              <p>Películas y series que ambos vieron y marcaron como favoritas.</p>
            </div>
          ) : null}

          <div className="profile-list-toolbar">
            <div className="profile-type-filter">
              <button
                type="button"
                className={typeFilter === "all" ? "is-active" : ""}
                onClick={() => setTypeFilter("all")}
              >
                Todo
              </button>
              <button
                type="button"
                className={typeFilter === "movie" ? "is-active" : ""}
                onClick={() => setTypeFilter("movie")}
              >
                Peliculas
              </button>
              <button
                type="button"
                className={typeFilter === "tv" ? "is-active" : ""}
                onClick={() => setTypeFilter("tv")}
              >
                Series
              </button>
            </div>

            {activeTab === "watchlist" ? (
              <p className="profile-list-order">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 10v10M7 10l3.5-6a2.5 2.5 0 0 1 2.4 3.2L12 10h6a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7" />
                </svg>
                {circleScores.size
                  ? "Mejor puntuadas por tu círculo primero"
                  : "Se ordenan por lo que puntúa tu círculo"}
              </p>
            ) : null}
          </div>

          {tabItems.length ? (
            <div
              className={`profile-grid ${activeTab === "watched" || activeTab === "watchlist" ? "profile-grid--library" : ""}`}
            >
              {tabItems.map((item) => (
                <TitleCard
                  key={`${item.mediaType}-${item.id}`}
                  item={item}
                  reaction={
                    activeTab === "watched" ? reactionByTitle.get(`${item.mediaType}-${item.id}`) : undefined
                  }
                  onOpenDetails={() => openMediaDetails(item)}
                  onChangeRating={
                    readOnly || activeTab !== "watched"
                      ? undefined
                      : (next) => void handleChangeRating(item, next)
                  }
                  onRemove={readOnly || activeTab === "mutual-likes" ? undefined : () => void handleRemove(item)}
                  removeLabel={activeTab === "watched" ? "Quitar de Vistas" : "Quitar de Watchlist"}
                  isRemoving={isSyncing}
                />
              ))}
            </div>
          ) : (
            <div className="profile-grid__empty">
              {activeTab === "mutual-likes"
                ? "Todavía no tienen títulos que les hayan gustado a los dos."
                : activeTab === "watched"
                ? isOwnProfile
                  ? "Todavia no marcaste titulos como vistos."
                  : "Esta persona todavia no marco titulos como vistos."
                : isOwnProfile
                  ? "Todavia no guardaste titulos en Watchlist."
                  : "Esta persona todavia no guardo titulos en Watchlist."}
            </div>
          )}
        </>
      )}
    </section>
  );
}
