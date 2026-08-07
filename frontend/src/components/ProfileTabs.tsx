import { useEffect, useMemo, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import {
  type CurrentWatchingEntry,
  type Profile,
  type ProfileCollection,
  type ProfileVisibilitySettings,
  updateProfile
} from "../lib/auth";
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
import { getSeriesAiringInfo, getTitleById, searchTitles } from "../lib/tmdb";
import type { DiscoveryItem, FeedEntry, SeriesAiringInfo } from "../types";

type ProfileTabsProps = {
  userId: string;
  readOnly?: boolean;
  isOwnProfile?: boolean;
  profile?: Profile | null;
  favoriteTitles?: DiscoveryItem[];
  featuredCollections?: Array<{
    id: string;
    title: string;
    description: string | null;
    items: DiscoveryItem[];
  }>;
  visibilitySettings?: ProfileVisibilitySettings;
  onProfileUpdated?: (profile: Profile) => void;
};

type TabId = "watched" | "liked" | "watching" | "recommendations" | "posts" | "curation";

type WatchingItem = {
  entry: CurrentWatchingEntry;
  item: DiscoveryItem;
  airing: SeriesAiringInfo | null;
};

const tabLabels: Record<TabId, string> = {
  watched: "Vistas",
  liked: "Watchlist",
  watching: "Viendo",
  recommendations: "Mis recomendaciones",
  posts: "Posts",
  curation: "Mi selección"
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
  isOwnProfile = true,
  profile = null,
  favoriteTitles = [],
  featuredCollections = [],
  visibilitySettings,
  onProfileUpdated
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
  const [isEditingCuration, setIsEditingCuration] = useState(false);
  const [watchingEntries, setWatchingEntries] = useState<CurrentWatchingEntry[]>([]);
  const [watchingItems, setWatchingItems] = useState<WatchingItem[]>([]);
  const [watchingQuery, setWatchingQuery] = useState("");
  const [watchingResults, setWatchingResults] = useState<DiscoveryItem[]>([]);
  const [isWatchingSearchOpen, setIsWatchingSearchOpen] = useState(false);
  const [isWatchingSearchLoading, setIsWatchingSearchLoading] = useState(false);
  const [curationFavoriteTitles, setCurationFavoriteTitles] = useState<
    Array<{ tmdbId: number; mediaType: "movie" | "tv" }>
  >([]);
  const [curationCollections, setCurationCollections] = useState<ProfileCollection[]>([]);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  useEffect(() => {
    setCurationFavoriteTitles(profile?.favorite_titles ?? []);
    setCurationCollections(profile?.featured_collections ?? []);
    setWatchingEntries(profile?.current_watching ?? []);
    setIsEditingCuration(false);
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

  const visibleTabs = useMemo(() => {
    const tabs: TabId[] = [];

    if (visibilitySettings?.showWatchlist !== false) {
      tabs.push("watched", "liked");
    }

    if (isOwnProfile) {
      tabs.push("watching");
    }

    if (
      (isOwnProfile || visibilitySettings?.showCollections !== false) &&
      (favoriteTitles.length || featuredCollections.length || isOwnProfile)
    ) {
      tabs.push("curation");
    }

    tabs.push("recommendations", "posts");

    return tabs;
  }, [
    favoriteTitles.length,
    featuredCollections.length,
    isOwnProfile,
    visibilitySettings?.showCollections,
    visibilitySettings?.showWatchlist
  ]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? "recommendations");
    }
  }, [activeTab, visibleTabs]);

  const tabItems = useMemo(() => {
    return reactions
      .filter((entry) => entry.reaction === activeTab)
      .map((entry) => titles[`${entry.mediaType}-${entry.tmdbId}`])
      .filter((item): item is DiscoveryItem => Boolean(item));
  }, [activeTab, reactions, titles]);

  const candidateTitles = useMemo(
    () =>
      Object.values(titles).sort((left, right) =>
        left.title.localeCompare(right.title, "es", { sensitivity: "base" })
      ),
    [titles]
  );
  const selectedFavoriteTitleKeys = useMemo(
    () => new Set(curationFavoriteTitles.map((entry) => `${entry.mediaType}-${entry.tmdbId}`)),
    [curationFavoriteTitles]
  );
  const collectionSelectionKeys = useMemo(
    () =>
      Object.fromEntries(
        curationCollections.map((collection) => [
          collection.id,
          new Set(collection.items.map((entry) => `${entry.mediaType}-${entry.tmdbId}`))
        ])
      ),
    [curationCollections]
  );

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

  function toggleFavoriteTitle(item: DiscoveryItem) {
    const key = `${item.mediaType}-${item.id}`;

    setCurationFavoriteTitles((current) => {
      if (current.some((entry) => `${entry.mediaType}-${entry.tmdbId}` === key)) {
        return current.filter((entry) => `${entry.mediaType}-${entry.tmdbId}` !== key);
      }

      if (current.length >= 4) {
        return current;
      }

      return [...current, { tmdbId: item.id, mediaType: item.mediaType }];
    });
  }

  function addCollection() {
    setCurationCollections((current) => {
      if (current.length >= 3) {
        return current;
      }

      return [
        ...current,
        {
          id: crypto.randomUUID(),
          title: "",
          description: "",
          items: []
        }
      ];
    });
  }

  function updateCollection(
    collectionId: string,
    patch: Partial<Pick<ProfileCollection, "title" | "description" | "items">>
  ) {
    setCurationCollections((current) =>
      current.map((collection) =>
        collection.id === collectionId
          ? {
              ...collection,
              ...patch
            }
          : collection
      )
    );
  }

  function removeCollection(collectionId: string) {
    setCurationCollections((current) =>
      current.filter((collection) => collection.id !== collectionId)
    );
  }

  function toggleCollectionItem(collectionId: string, item: DiscoveryItem) {
    const key = `${item.mediaType}-${item.id}`;

    setCurationCollections((current) =>
      current.map((collection) => {
        if (collection.id !== collectionId) {
          return collection;
        }

        const hasItem = collection.items.some(
          (entry) => `${entry.mediaType}-${entry.tmdbId}` === key
        );

        if (hasItem) {
          return {
            ...collection,
            items: collection.items.filter(
              (entry) => `${entry.mediaType}-${entry.tmdbId}` !== key
            )
          };
        }

        if (collection.items.length >= 6) {
          return collection;
        }

        return {
          ...collection,
          items: [...collection.items, { tmdbId: item.id, mediaType: item.mediaType }]
        };
      })
    );
  }

  async function handleSaveCuration() {
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
        favoriteGenres: profile.favorite_genres,
        favoriteTitles: curationFavoriteTitles,
        featuredCollections: curationCollections
          .map((collection) => ({
            ...collection,
            title: collection.title.trim(),
            description: collection.description?.trim() ? collection.description.trim() : null
          }))
          .filter((collection) => collection.title.length > 0 && collection.items.length > 0),
        currentWatching: profile.current_watching,
        visibilitySettings: profile.visibility_settings
      });
      onProfileUpdated(nextProfile);
      setIsEditingCuration(false);
    } catch {
      setSyncMessage("No pude guardar tu selección personal.");
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
      ) : activeTab === "curation" ? (
        favoriteTitles.length || featuredCollections.length || isOwnProfile ? (
          <div className="profile-curation">
            {isOwnProfile && !readOnly ? (
              <div className="profile-curation__actions">
                {isEditingCuration ? (
                  <>
                    <button
                      type="button"
                      className="profile-follow-button"
                      disabled={isSyncing}
                      onClick={() => void handleSaveCuration()}
                    >
                      {isSyncing ? "Guardando..." : "Guardar selección"}
                    </button>
                    <button
                      type="button"
                      className="profile-share-button"
                      disabled={isSyncing}
                      onClick={() => {
                        setCurationFavoriteTitles(profile?.favorite_titles ?? []);
                        setCurationCollections(profile?.featured_collections ?? []);
                        setIsEditingCuration(false);
                      }}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="profile-share-button"
                    onClick={() => setIsEditingCuration(true)}
                  >
                    Editar selección
                  </button>
                )}
              </div>
            ) : null}

            {favoriteTitles.length ? (
              <div className="profile-top-picks">
                <div className="profile-top-picks__header">
                  <p className="section-eyebrow">{isOwnProfile ? "Tu top 4" : "Top 4 cineriano"}</p>
                  <h3>{isOwnProfile ? "Tus elegidas para definir tu perfil" : "Sus títulos fijados"}</h3>
                </div>

                <div className="profile-top-picks__grid">
                  {favoriteTitles.map((item) => (
                    <article
                      key={`${item.mediaType}-${item.id}`}
                      className="profile-top-pick profile-top-pick--interactive"
                      onClick={() => openMediaDetails(item)}
                    >
                      <img src={item.posterUrl} alt={item.title} className="profile-top-pick__poster" />
                      <div className="profile-top-pick__meta">
                        <strong>{item.title}</strong>
                        <span>
                          {item.year}
                          {item.genres.length ? ` · ${item.genres.slice(0, 2).join(" · ")}` : ""}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {featuredCollections.length ? (
              <div className="profile-collections">
                <div className="profile-collections__header">
                  <p className="section-eyebrow">Colecciones</p>
                  <h3>
                    {isOwnProfile
                      ? "Tus listas curadas dentro del perfil"
                      : "Listas curadas de este perfil"}
                  </h3>
                </div>

                <div className="profile-collections__list">
                  {featuredCollections.map((collection) => (
                    <article key={collection.id} className="profile-collection-card">
                      <div className="profile-collection-card__copy">
                        <h4>{collection.title}</h4>
                        {collection.description ? <p>{collection.description}</p> : null}
                      </div>

                      <div className="profile-collection-card__grid">
                        {collection.items.map((item) => (
                          <article
                            key={`${collection.id}-${item.mediaType}-${item.id}`}
                            className="profile-collection-card__item"
                            onClick={() => openMediaDetails(item)}
                          >
                            <img src={item.posterUrl} alt={item.title} />
                            <span>{item.title}</span>
                          </article>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {isOwnProfile && isEditingCuration ? (
              <>
                <div className="profile-editor__section">
                  <div className="profile-editor__section-copy">
                    <strong>Top 4 del perfil</strong>
                    <p>Fijá hasta 4 títulos de tu historial para que sean tu carta de presentación.</p>
                  </div>

                  {candidateTitles.length ? (
                    <div className="profile-editor__title-grid">
                      {candidateTitles.map((item) => {
                        const isActive = selectedFavoriteTitleKeys.has(`${item.mediaType}-${item.id}`);

                        return (
                          <button
                            key={`${item.mediaType}-${item.id}`}
                            type="button"
                            className={`profile-editor__title-card ${isActive ? "is-active" : ""}`}
                            onClick={() => toggleFavoriteTitle(item)}
                            disabled={!isActive && curationFavoriteTitles.length >= 4}
                          >
                            <img src={item.posterUrl} alt={item.title} />
                            <span>{item.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-like-state">
                      Cuando marques vistas o guardes títulos, vas a poder elegir tu top 4 desde acá.
                    </div>
                  )}
                </div>

                <div className="profile-editor__section">
                  <div className="profile-editor__section-copy">
                    <strong>Colecciones personales</strong>
                    <p>Armá hasta 3 listas curadas para mostrar tu criterio y no solo tu actividad.</p>
                  </div>

                  <div className="profile-editor__collection-actions">
                    <button
                      type="button"
                      className="profile-follow-button"
                      onClick={addCollection}
                      disabled={curationCollections.length >= 3}
                    >
                      {curationCollections.length >= 3 ? "Limite alcanzado" : "Agregar coleccion"}
                    </button>
                  </div>

                  {curationCollections.length ? (
                    <div className="profile-editor__collections">
                      {curationCollections.map((collection, index) => (
                        <article key={collection.id} className="profile-editor__collection-card">
                          <div className="profile-editor__collection-topline">
                            <strong>Coleccion {index + 1}</strong>
                            <button
                              type="button"
                              className="profile-grid__remove"
                              onClick={() => removeCollection(collection.id)}
                            >
                              Eliminar
                            </button>
                          </div>

                          <label className="profile-editor__field">
                            <span>Titulo</span>
                            <input
                              type="text"
                              value={collection.title}
                              onChange={(event) =>
                                updateCollection(collection.id, { title: event.target.value.slice(0, 40) })
                              }
                              placeholder="Ej: Thrillers que recomiendo a cualquiera"
                            />
                          </label>

                          <label className="profile-editor__field">
                            <span>Descripcion</span>
                            <textarea
                              value={collection.description ?? ""}
                              onChange={(event) =>
                                updateCollection(collection.id, {
                                  description: event.target.value.slice(0, 180)
                                })
                              }
                              rows={3}
                              placeholder="Contá qué une esta colección o para quién la armaste."
                            />
                          </label>

                          {candidateTitles.length ? (
                            <div className="profile-editor__mini-grid">
                              {candidateTitles.map((item) => {
                                const isActive = collectionSelectionKeys[collection.id]?.has(
                                  `${item.mediaType}-${item.id}`
                                );

                                return (
                                  <button
                                    key={`${collection.id}-${item.mediaType}-${item.id}`}
                                    type="button"
                                    className={`profile-editor__mini-card ${isActive ? "is-active" : ""}`}
                                    onClick={() => toggleCollectionItem(collection.id, item)}
                                    disabled={!isActive && collection.items.length >= 6}
                                  >
                                    <img src={item.posterUrl} alt={item.title} />
                                    <span>{item.title}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="empty-like-state">
                              Primero necesitás tener títulos en tu actividad para armar una colección.
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-like-state">
                      Todavía no armaste colecciones. Este espacio puede ser buenísimo para mostrar tu criterio.
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="profile-grid__empty">
            {isOwnProfile
              ? "Todavia no armaste una selección personal para tu perfil."
              : "Este perfil todavía no tiene una selección curada visible."}
          </div>
        )
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
