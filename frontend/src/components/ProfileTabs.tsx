import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaDetails } from "./MediaDetailsModal";
import { LoadingState } from "./LoadingState";
import { describeLength, describeType, TitleCard, type TitleCardQuickAction } from "./TitleCard";
import { WatchNowRow } from "./WatchNowRow";
import { WatchlistDropdown } from "./WatchlistDropdown";
import { WatchlistSheet } from "./WatchlistSheet";
import { WatchReviewModal } from "./WatchReviewModal";
import {
  type CurrentWatchingEntry,
  type Profile,
  type ProfileSummary,
  type ProfileVisibilitySettings,
  publicComparisonSections,
  saveCurrentWatchingEntries
} from "../lib/auth";
import {
  DISCOVER_FILTERS_UPDATED_EVENT,
  fetchDiscoverFilters,
  saveDiscoverFilters
} from "../lib/discoverFilters";
import {
  createFeedPost,
  deleteFeedPost,
  fetchUserTextPosts,
  removeFeedEvent,
  updateFeedPost
} from "../lib/feed";
import {
  fetchStoredReactions,
  getReactionSaveErrorMessage,
  isRatedReaction,
  REACTIONS_UPDATED_EVENT,
  removeStoredRatedReaction,
  removeStoredReaction,
  saveStoredReaction,
  type RatedReaction,
  type RecommendationReaction,
  type StoredReaction
} from "../lib/reactions";
import {
  fetchCircleRanking,
  fetchCircleScores,
  fetchCircleWatchlist,
  type CircleRanking,
  type CircleScore
} from "../lib/recommendations";
import { buildWatchedPostBody } from "../lib/reviews";
import {
  getSeriesAiringInfo,
  getTitleById,
  getProviderCatalog,
  getWatchOptionsFor,
  NO_FILTERS,
  searchTitles,
  type DiscoverFilters,
  type ProviderOption,
  type WatchOptions
} from "../lib/tmdb";
import type { DiscoveryItem, FeedEntry, SeriesAiringInfo } from "../types";
import { argentinaToday, orderWatchingItems } from "../lib/watchingOrder";
import { sharedWatchlistKeys } from "../lib/mutualWatchlist";

type ProfileTabsProps = {
  userId: string;
  viewerUserId?: string;
  readOnly?: boolean;
  isOwnProfile?: boolean;
  profile?: Profile | null;
  visibilitySettings?: ProfileVisibilitySettings;
  onProfileUpdated?: (profile: Profile) => void;
  watchingOnly?: boolean;
  watchlistOnly?: boolean;
};

type TabId = "watched" | "watchlist" | "mutual-likes" | "watching" | "posts" | "ranking";

function requestedProfileTab(): TabId {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "watchlist" || tab === "mutual-likes" || tab === "watching" || tab === "posts" || tab === "ranking"
    ? tab
    : "watched";
}

/** Cuantos puestos del ranking traemos por tanda. */
const RANKING_PAGE_SIZE = 20;

type WatchlistSort = "score" | "tmdb" | "recent" | "year" | "alpha";

/**
 * `short` es lo que se ve en el disparador y `label` lo que se lee dentro del
 * menu: el disparador vive al lado de los filtros y no puede crecer.
 */
const WATCHLIST_SORT_OPTIONS: Array<{ id: WatchlistSort; short: string; label: string }> = [
  { id: "score", short: "Ranking Cineriano", label: "Ranking Cineriano" },
  { id: "tmdb", short: "Puntaje TMDB", label: "Puntaje TMDB" },
  { id: "recent", short: "Recientes", label: "Agregadas recientemente" },
  { id: "year", short: "Estreno", label: "Año de estreno" },
  { id: "alpha", short: "A–Z", label: "Orden alfabético" }
];

/** La version enriquecida de la Watchlist es solo para desktop. */
const DESKTOP_QUERY = "(min-width: 901px)";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches
  );

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const handleChange = () => setIsDesktop(query.matches);

    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return isDesktop;
}

const WATCHLIST_HINT_KEY = "cinerian:watchlist-viendo-hint-seen";

type WatchlistToast = {
  message: string;
  undo?: () => Promise<void>;
};

const WATCHLIST_SORT_KEY = "cinerian:watchlist-sort";

/**
 * El orden elegido se recuerda entre sesiones: si alguien prefiere ver lo
 * ultimo que guardo, tener que volver a elegirlo cada vez anula la opcion.
 */
function loadWatchlistSort(ownerId: string): WatchlistSort {
  try {
    const raw = window.localStorage.getItem(`${WATCHLIST_SORT_KEY}:${ownerId}`);
    return WATCHLIST_SORT_OPTIONS.some((option) => option.id === raw) ? (raw as WatchlistSort) : "score";
  } catch {
    return "score";
  }
}

function persistWatchlistSort(ownerId: string, value: WatchlistSort) {
  try {
    window.localStorage.setItem(`${WATCHLIST_SORT_KEY}:${ownerId}`, value);
  } catch {
    // Es una comodidad: si el navegador bloquea el storage, no pasa nada.
  }
}

/**
 * El puntaje de 0 a 10 dice que tan bien le fue, pero no con cuanta gente: un
 * unanime de 1 persona y uno de 20 muestran el mismo 10. Esta linea es la que
 * los diferencia, asi que tiene que decir el total, no solo los nombres.
 *
 * Se arma con las etiquetas entre comillas en vez de conjugar ("3 lo amaron")
 * porque la concordancia en español cambia con la cantidad y con el genero del
 * titulo -- "la amaron" para una serie, "lo amaron" para una pelicula.
 */
/**
 * "tv" incluye miniseries y "mini" es el subconjunto, igual que en Descubri:
 * una miniserie es una serie, asi que filtrar "Series" y que no aparezcan
 * seria raro. "Miniserie" es un refinamiento, no una categoria hermana.
 */
type TypeFilter = "all" | "movie" | "tv" | "mini";

const TYPE_FILTER_OPTIONS: Array<{ id: TypeFilter; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "movie", label: "Películas" },
  { id: "tv", label: "Series" },
  { id: "mini", label: "Miniseries" }
];

function matchesTypeFilter(item: DiscoveryItem, filter: TypeFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "movie") {
    return item.mediaType === "movie";
  }

  if (filter === "mini") {
    return item.mediaType === "tv" && item.seriesType === "Miniseries";
  }

  return item.mediaType === "tv";
}

const RATED_REACTION_LABELS: Record<RatedReaction, string> = {
  superliked: "Me encantó",
  liked: "Me gustó",
  disliked: "No me gustó"
};

function describeRankingWatchers(watchers: Array<{ reaction: RatedReaction }>) {
  const total = watchers.length;
  if (!total) {
    return "Sin opiniones visibles de tu círculo";
  }

  const counted = (Object.keys(RATED_REACTION_LABELS) as RatedReaction[])
    .map((reaction) => ({
      label: RATED_REACTION_LABELS[reaction],
      count: watchers.filter((watcher) => watcher.reaction === reaction).length
    }))
    .filter((bucket) => bucket.count > 0);

  if (counted.length === 1) {
    return `${total} de ${total} · ${counted[0].label}`;
  }

  return `${total} de tu círculo · ${counted
    .map((bucket) => `${bucket.count} ${bucket.label}`)
    .join(" · ")}`;
}

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
  ranking: "Mi Ranking"
};

export function ProfileTabs({
  userId,
  viewerUserId,
  readOnly = false,
  isOwnProfile = true,
  profile = null,
  visibilitySettings,
  onProfileUpdated,
  watchingOnly = false,
  watchlistOnly = false
}: ProfileTabsProps) {
  const { openMediaDetails } = useMediaDetails();
  const [selectedTab, setActiveTab] = useState<TabId>(requestedProfileTab);
  const tabsRef = useRef<HTMLElement | null>(null);
  const [reactions, setReactions] = useState<StoredReaction[]>([]);
  const [viewerReactions, setViewerReactions] = useState<StoredReaction[]>([]);
  const [titles, setTitles] = useState<Record<string, DiscoveryItem>>({});
  const [posts, setPosts] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [watchingEntries, setWatchingEntries] = useState<CurrentWatchingEntry[]>([]);
  const [watchingItems, setWatchingItems] = useState<WatchingItem[]>([]);
  const [showMutualHint, setShowMutualHint] = useState(() => {
    try {
      return !window.localStorage.getItem(`cinerian:mutual-hint-seen:${viewerUserId}`);
    } catch {
      return true;
    }
  });
  const [watchingQuery, setWatchingQuery] = useState("");
  const [watchingResults, setWatchingResults] = useState<DiscoveryItem[]>([]);
  const [isWatchingSearchOpen, setIsWatchingSearchOpen] = useState(false);
  const [isWatchingSearchLoading, setIsWatchingSearchLoading] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  useEffect(() => {
    setWatchingEntries(profile?.current_watching ?? []);
  }, [profile]);

  function dismissMutualHint() {
    setShowMutualHint(false);
    if (viewerUserId) {
      try {
        window.localStorage.setItem(`cinerian:mutual-hint-seen:${viewerUserId}`, "1");
      } catch {
        // El acceso a En común sigue disponible aunque localStorage esté bloqueado.
      }
    }
  }

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
    const publicSections = publicComparisonSections(visibilitySettings);
    const canShowWatched = isOwnProfile || publicSections.watched;
    const canShowWatchlist = !isOwnProfile && publicSections.watchlist;
    if (canShowWatched) {
      tabs.push("watched");
    }
    if (canShowWatchlist) {
      tabs.push("watchlist");
    }
    if (!isOwnProfile && viewerUserId && (canShowWatched || canShowWatchlist)) {
      tabs.push("mutual-likes");
    }

    // El ranking se arma con a quien seguis vos, asi que solo tiene sentido en
    // tu propio perfil: en el de otro seria tu ranking con su cara.
    if (isOwnProfile) {
      tabs.push("ranking");
    }

    return tabs;
  }, [isOwnProfile, viewerUserId, visibilitySettings?.showWatched, visibilitySettings?.showWatchlist]);
  const activeTab: TabId = watchlistOnly ? "watchlist" : watchingOnly ? "watching" : visibleTabs.includes(selectedTab) ? selectedTab : visibleTabs[0] ?? "posts";

  useEffect(() => {
    if (!visibleTabs.includes(selectedTab)) {
      setActiveTab(visibleTabs[0] ?? "posts");
    }
  }, [selectedTab, visibleTabs]);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [mutualFilter, setMutualFilter] = useState<"watched" | "watchlist">("watched");
  const { watched: canCompareWatched, watchlist: canCompareWatchlist } = publicComparisonSections(visibilitySettings);
  const shownMutualFilter = mutualFilter === "watched" && !canCompareWatched ? "watchlist" :
    mutualFilter === "watchlist" && !canCompareWatchlist ? "watched" : mutualFilter;
  // La preferencia es de quien mira, no del perfil que se esta viendo.
  const sortOwnerId = viewerUserId ?? userId;
  const [watchlistSort, setWatchlistSort] = useState<WatchlistSort>(() =>
    loadWatchlistSort(sortOwnerId)
  );

  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  /*
    Watchlist enriquecida (solo desktop y solo la propia): filtros por
    plataforma y genero, acciones directas sobre el poster y la capa social.
    `rich` es la Watchlist propia; `enhanced` es su version desktop (barra de
    filtros, acciones al pasar el mouse) y `richMobile` la de mobile (un boton
    "Filtros" y paneles inferiores). Los datos y los filtros son los mismos.
  */
  const isDesktop = useIsDesktop();
  const rich = watchlistOnly && isOwnProfile && !readOnly;
  const enhanced = rich && isDesktop;
  const richMobile = rich && !isDesktop;
  const [mobileSheet, setMobileSheet] = useState<"filters" | "platforms" | "pick" | null>(null);
  const [actionItem, setActionItem] = useState<DiscoveryItem | null>(null);
  const [platformQuery, setPlatformQuery] = useState("");
  // Los mismos filtros que guarda Descubri: de ahi salen "mis plataformas".
  const [discoverFilters, setDiscoverFilters] = useState<DiscoverFilters>(NO_FILTERS);
  const myProviderIds = discoverFilters.providerIds;
  const [providerCatalog, setProviderCatalog] = useState<ProviderOption[]>([]);
  const [watchOptions, setWatchOptions] = useState<Record<string, WatchOptions>>({});
  const [onlyMine, setOnlyMine] = useState(false);
  const [genreFilter, setGenreFilter] = useState<string[]>([]);
  const [circleWatchlist, setCircleWatchlist] = useState<Map<string, ProfileSummary[]>>(new Map());
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<WatchlistToast | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const [stickyTop, setStickyTop] = useState(64);
  const [showWatchingHint, setShowWatchingHint] = useState(() => {
    try {
      return !window.localStorage.getItem(`${WATCHLIST_HINT_KEY}:${userId}`);
    } catch {
      return true;
    }
  });

  function dismissWatchingHint() {
    setShowWatchingHint(false);
    try {
      window.localStorage.setItem(`${WATCHLIST_HINT_KEY}:${userId}`, "1");
    } catch {
      // Si el storage esta bloqueado, el aviso vuelve a aparecer la proxima vez.
    }
  }

  // "Mis plataformas" son las que el usuario eligio en los filtros de Descubri.
  useEffect(() => {
    if (!rich) {
      return;
    }

    let isMounted = true;

    function loadProviders() {
      void fetchDiscoverFilters(userId)
        .then((filters) => {
          if (isMounted) {
            setDiscoverFilters(filters);
          }
        })
        .catch(() => undefined);
    }

    loadProviders();
    void getProviderCatalog().then((catalog) => {
      if (isMounted) {
        setProviderCatalog(catalog);
      }
    });
    window.addEventListener(DISCOVER_FILTERS_UPDATED_EVENT, loadProviders);

    return () => {
      isMounted = false;
      window.removeEventListener(DISCOVER_FILTERS_UPDATED_EVENT, loadProviders);
    };
  }, [rich, userId]);

  // La barra de filtros queda fija debajo de la barra superior, mida lo que mida.
  useEffect(() => {
    if (!rich) {
      return;
    }

    function measure() {
      const topbar = document.querySelector(".app-topbar");
      setStickyTop(topbar ? Math.round(topbar.getBoundingClientRect().height) : 0);
    }

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [rich, isDesktop]);

  // La barra solo toma fondo cuando queda pegada arriba: en reposo se apoya
  // directo sobre el fondo de la pagina, sin franja propia.
  const [toolbarSentinel, setToolbarSentinel] = useState<HTMLDivElement | null>(null);
  const [isToolbarStuck, setIsToolbarStuck] = useState(false);

  useEffect(() => {
    if (!rich || !toolbarSentinel) {
      setIsToolbarStuck(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsToolbarStuck(!entry.isIntersecting && entry.boundingClientRect.top < stickyTop + 1),
      { rootMargin: `-${stickyTop + 1}px 0px 0px 0px`, threshold: 0 }
    );

    observer.observe(toolbarSentinel);
    return () => observer.disconnect();
  }, [rich, stickyTop, toolbarSentinel]);

  /** Editar "mis plataformas" desde aca las guarda en el perfil, igual que Descubri. */
  async function changeMyProviders(values: string[]) {
    const previous = discoverFilters;
    const next: DiscoverFilters = { ...previous, providerIds: values.map(Number) };

    setDiscoverFilters(next);
    if (!next.providerIds.length) {
      setOnlyMine(false);
    }

    try {
      await saveDiscoverFilters(userId, next);
    } catch {
      setDiscoverFilters(previous);
      setSyncMessage("No pude guardar tus plataformas. Probá de nuevo.");
    }
  }

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    setWatchlistSort(loadWatchlistSort(sortOwnerId));
  }, [sortOwnerId]);

  /*
    Escape lo maneja el handler global de App via `data-escape-dismiss`, que
    le hace click al disparador. Aca solo hace falta cerrar al tocar afuera.
  */
  useEffect(() => {
    if (!isSortMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isSortMenuOpen]);

  function changeWatchlistSort(value: WatchlistSort) {
    setWatchlistSort(value);
    persistWatchlistSort(sortOwnerId, value);
    setIsSortMenuOpen(false);
  }

  const [circleScores, setCircleScores] = useState<Map<string, CircleScore>>(new Map());
  const [ranking, setRanking] = useState<CircleRanking>({
    entries: [],
    total: 0,
    hasMore: false
  });
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const [isRankingExpanding, setIsRankingExpanding] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);

  // El ranking es caro (una consulta al circulo mas una ficha de TMDB por
  // puesto): se pide recien al abrir la pestaña. Cambiar el filtro lo rehace
  // desde el puesto 1, porque el puesto se numera dentro de lo filtrado.
  useEffect(() => {
    if (activeTab !== "ranking") {
      return;
    }

    let isMounted = true;
    setIsRankingLoading(true);
    setRanking({ entries: [], total: 0, hasMore: false });

    void fetchCircleRanking(userId, { limit: RANKING_PAGE_SIZE, contentType: typeFilter })
      .then((result) => {
        if (isMounted) {
          setRanking(result);
          setRankingError(null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRankingError("No pudimos armar tu ranking ahora mismo. Probá de nuevo en un rato.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsRankingLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, typeFilter, userId]);

  async function handleLoadMoreRanking() {
    if (isRankingExpanding) {
      return;
    }

    try {
      setIsRankingExpanding(true);
      const next = await fetchCircleRanking(userId, {
        offset: ranking.entries.length,
        limit: RANKING_PAGE_SIZE,
        contentType: typeFilter
      });

      setRanking((current) => ({
        total: next.total,
        hasMore: next.hasMore,
        entries: [...current.entries, ...next.entries]
      }));
      setRankingError(null);
    } catch {
      setRankingError("No pudimos traer mas puestos. Probá de nuevo en un rato.");
    } finally {
      setIsRankingExpanding(false);
    }
  }

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

  const mutualWatchedItems = useMemo(() => {
    const viewerWatchedKeys = new Set(
      viewerReactions
        .filter((entry) => entry.reaction === "liked" || entry.reaction === "superliked")
        .map((entry) => `${entry.mediaType}-${entry.tmdbId}`)
    );

    return reactions
      .filter((entry) => entry.reaction === "liked" || entry.reaction === "superliked")
      .filter((entry) => viewerWatchedKeys.has(`${entry.mediaType}-${entry.tmdbId}`))
      .map((entry) => titles[`${entry.mediaType}-${entry.tmdbId}`])
      .filter((item): item is DiscoveryItem => Boolean(item));
  }, [reactions, titles, viewerReactions]);

  const mutualWatchlistItems = useMemo(() => {
    return sharedWatchlistKeys(
      viewerReactions.filter((entry) => entry.reaction === "watchlist"),
      reactions.filter((entry) => entry.reaction === "watchlist")
    )
      .map((key) => titles[key])
      .filter((item): item is DiscoveryItem => Boolean(item));
  }, [reactions, titles, viewerReactions]);

  const mutualItems = shownMutualFilter === "watched" ? mutualWatchedItems : mutualWatchlistItems;

  /** Toda la Watchlist, sin filtrar: base de los contadores y de los filtros. */
  const watchlistAll = useMemo(
    () =>
      reactions
        .filter((entry) => entry.reaction === "watchlist")
        .map((entry) => titles[`${entry.mediaType}-${entry.tmdbId}`])
        .filter((item): item is DiscoveryItem => Boolean(item)),
    [reactions, titles]
  );

  useEffect(() => {
    if (!rich || !watchlistAll.length) {
      return;
    }

    let isMounted = true;

    void Promise.all(
      watchlistAll.map(async (item) => {
        const options = await getWatchOptionsFor(item.id, item.mediaType, item.title);
        return [`${item.mediaType}-${item.id}`, options] as const;
      })
    ).then((entries) => {
      if (isMounted) {
        setWatchOptions(Object.fromEntries(entries));
      }
    });

    void fetchCircleWatchlist(userId, watchlistAll)
      .then((result) => {
        if (isMounted) {
          setCircleWatchlist(result);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCircleWatchlist(new Map());
        }
      });

    return () => {
      isMounted = false;
    };
  }, [rich, userId, watchlistAll]);

  const myProviderSet = useMemo(() => new Set(myProviderIds), [myProviderIds]);

  function isOnMyPlatforms(item: DiscoveryItem) {
    return Boolean(
      watchOptions[`${item.mediaType}-${item.id}`]?.flatrate.some((provider) =>
        myProviderSet.has(provider.id)
      )
    );
  }

  const passesExtraFilters = useMemo(() => {
    if (!rich) {
      return (_item: DiscoveryItem) => true;
    }

    return (item: DiscoveryItem) => {
      const flatrate = watchOptions[`${item.mediaType}-${item.id}`]?.flatrate ?? [];

      if (onlyMine && !flatrate.some((provider) => myProviderSet.has(provider.id))) {
        return false;
      }

      // Con varios generos elegidos alcanza con coincidir con uno.
      return !genreFilter.length || item.genres.some((genre) => genreFilter.includes(genre));
    };
  }, [rich, genreFilter, myProviderSet, onlyMine, watchOptions]);

  const tabItems = useMemo(() => {
    if (activeTab === "mutual-likes") {
      return mutualItems;
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
      .filter((item) => matchesTypeFilter(item, typeFilter))
      .filter((item) => activeTab !== "watchlist" || passesExtraFilters(item));

    if (activeTab === "watchlist") {
      if (watchlistSort === "tmdb") {
        items.sort((left, right) => right.score - left.score);
      } else if (watchlistSort === "year") {
        items.sort((left, right) => (right.releaseDate ?? "").localeCompare(left.releaseDate ?? ""));
      } else if (watchlistSort === "alpha") {
        // `localeCompare` en español: ignora acentos y mayusculas, y ordena
        // "Rocky 2" antes que "Rocky 10" en vez de alfabeticamente.
        items.sort((left, right) =>
          left.title.localeCompare(right.title, "es", { sensitivity: "base", numeric: true })
        );
      } else if (watchlistSort === "recent") {
        // El item no trae la fecha; la fecha vive en la reaccion guardada.
        const addedAt = new Map(
          entries.map((entry) => [
            `${entry.mediaType}-${entry.tmdbId}`,
            toTimestamp(entry.createdAt)
          ])
        );

        items.sort(
          (left, right) =>
            (addedAt.get(`${right.mediaType}-${right.id}`) ?? 0) -
            (addedAt.get(`${left.mediaType}-${left.id}`) ?? 0)
        );
      } else {
        // Por defecto, lo mejor puntuado por tu circulo. Lo que nadie de tu
        // circulo vio queda al final (no tiene puntaje, que no es lo mismo que
        // tener cero) y ahi desempata TMDB.
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
    }

    return items;
  }, [activeTab, circleScores, mutualItems, passesExtraFilters, reactions, titles, typeFilter, watchlistSort]);

  const filteredWatchlist = useMemo(
    () => watchlistAll.filter(passesExtraFilters),
    [passesExtraFilters, watchlistAll]
  );

  const myPlatformOptions = useMemo(
    () =>
      providerCatalog.map((provider) => ({
        value: String(provider.id),
        label: provider.name,
        logoUrl: provider.logoUrl
      })),
    [providerCatalog]
  );

  const genreOptions = useMemo(
    () =>
      Array.from(new Set(watchlistAll.flatMap((item) => item.genres))).sort((left, right) =>
        left.localeCompare(right, "es")
      ),
    [watchlistAll]
  );

  const mineCount = watchlistAll.filter(isOnMyPlatforms).length;
  const pickedItem = pickedKey
    ? tabItems.find((item) => `${item.mediaType}-${item.id}` === pickedKey) ?? null
    : null;
  // "Tu próxima": lo primero del orden actual que ya podés ver con lo que tenés.
  const nextItem = pickedItem ?? tabItems.find(isOnMyPlatforms) ?? tabItems[0] ?? null;
  const nextProviders = nextItem ? watchOptions[`${nextItem.mediaType}-${nextItem.id}`]?.flatrate ?? [] : [];
  const nextProvider = nextProviders.find((provider) => myProviderSet.has(provider.id)) ?? nextProviders[0] ?? null;

  function clearExtraFilters() {
    setOnlyMine(false);
    setGenreFilter([]);
    setTypeFilter("all");
  }

  function pickRandom() {
    if (!tabItems.length) {
      return;
    }

    const pool = tabItems.length > 1
      ? tabItems.filter((item) => `${item.mediaType}-${item.id}` !== pickedKey)
      : tabItems;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    setPickedKey(`${chosen.mediaType}-${chosen.id}`);
    if (richMobile) {
      setMobileSheet("pick");
    }
  }

  function describeMeta(item: DiscoveryItem) {
    const length = describeLength(item);
    return `${describeType(item)} • ${item.year}${length ? ` • ${length}` : ""}`;
  }

  /** "Disponible en X" si es de tus plataformas; si no, donde esta. */
  function describeWhere(item: DiscoveryItem) {
    const flatrate = watchOptions[`${item.mediaType}-${item.id}`]?.flatrate ?? [];
    const mineProvider = flatrate.find((provider) => myProviderSet.has(provider.id));
    if (mineProvider) {
      return `Disponible en ${mineProvider.name}`;
    }

    return flatrate[0] ? `En ${flatrate[0].name}` : null;
  }

  const watchlistSummary = `${watchlistAll.length} ${watchlistAll.length === 1 ? "título" : "títulos"}${
    myProviderIds.length ? ` · ${mineCount} en tus plataformas` : ""
  }`;

  // Lo que esta filtrando ahora, para verlo y sacarlo sin abrir el panel.
  const filterChips: Array<{ id: string; label: string; remove: () => void }> = [];
  if (typeFilter !== "all") {
    filterChips.push({
      id: "type",
      label: TYPE_FILTER_OPTIONS.find((option) => option.id === typeFilter)?.label ?? "",
      remove: () => setTypeFilter("all")
    });
  }
  if (onlyMine) {
    filterChips.push({ id: "mine", label: "En mis plataformas", remove: () => setOnlyMine(false) });
  }
  genreFilter.forEach((genre) => {
    filterChips.push({
      id: `genre-${genre}`,
      label: genre,
      remove: () => setGenreFilter((current) => current.filter((entry) => entry !== genre))
    });
  });

  const normalizedPlatformQuery = platformQuery.trim().toLowerCase();
  const myProviders = providerCatalog.filter((provider) => myProviderSet.has(provider.id));

  const activeSortOption =
    WATCHLIST_SORT_OPTIONS.find((option) => option.id === watchlistSort) ??
    WATCHLIST_SORT_OPTIONS[0];

  const reactionByTitle = useMemo(
    () => new Map(reactions.map((entry) => [`${entry.mediaType}-${entry.tmdbId}`, entry.reaction])),
    [reactions]
  );

  const tabCounts: Partial<Record<TabId, number>> = {
    watched: reactions.filter(
      (entry) => isRatedReaction(entry.reaction)
    ).length,
    watchlist: reactions.filter((entry) => entry.reaction === "watchlist").length,
    "mutual-likes": (canCompareWatched ? mutualWatchedItems.length : 0) + (canCompareWatchlist ? mutualWatchlistItems.length : 0),
    watching: watchingEntries.length,
    posts: posts.length
  };
  const watchingGroups = orderWatchingItems(watchingItems, argentinaToday());

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

  function dropFromWatchlist(item: DiscoveryItem) {
    setReactions((current) =>
      current.filter(
        (entry) =>
          !(entry.tmdbId === item.id && entry.mediaType === item.mediaType && entry.reaction === "watchlist")
      )
    );
  }

  async function restoreToWatchlist(item: DiscoveryItem) {
    await saveStoredReaction({ userId, item, reaction: "watchlist" });
  }

  /** Quitar sin dialogo de confirmacion: el "Deshacer" del aviso lo reemplaza. */
  async function handleQuickRemove(item: DiscoveryItem) {
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await removeStoredReaction(userId, item, "watchlist");
      dropFromWatchlist(item);
      setToast({
        message: `Quitaste «${item.title}» de tu Watchlist.`,
        undo: () => restoreToWatchlist(item)
      });
    } catch {
      setSyncMessage("No pude eliminar este titulo del perfil.");
    } finally {
      setIsSyncing(false);
    }
  }

  /** Empezar una serie la saca de la Watchlist y la deja en Viendo. */
  async function handleStartWatching(item: DiscoveryItem) {
    if (!profile || !onProfileUpdated || item.mediaType !== "tv") {
      return;
    }

    const previousEntries = watchingEntries;

    try {
      setIsSyncing(true);
      setSyncMessage(null);

      if (!previousEntries.some((entry) => entry.tmdbId === item.id)) {
        const nextEntries: CurrentWatchingEntry[] = [
          { tmdbId: item.id, mediaType: "tv", addedAt: new Date().toISOString() },
          ...previousEntries
        ];
        onProfileUpdated(await saveCurrentWatchingEntries(profile.id, nextEntries, previousEntries));
        setWatchingEntries(nextEntries);
      }

      await removeStoredReaction(userId, item, "watchlist");
      dropFromWatchlist(item);
      setToast({
        message: `«${item.title}» pasó a Viendo.`,
        undo: async () => {
          await restoreToWatchlist(item);
          onProfileUpdated(await saveCurrentWatchingEntries(profile.id, previousEntries));
          setWatchingEntries(previousEntries);
        }
      });
    } catch {
      setSyncMessage("No pude pasar esta serie a Viendo. Probá de nuevo.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleUndoToast() {
    const undo = toast?.undo;
    setToast(null);
    if (!undo) {
      return;
    }

    try {
      setIsSyncing(true);
      await undo();
    } catch {
      setSyncMessage("No pude deshacer el cambio. Probá de nuevo.");
    } finally {
      setIsSyncing(false);
    }
  }

  /** "Ya la vi": pide la puntuacion, que reemplaza el guardado en Watchlist. */
  async function handleReviewSubmit(input: { reaction: RatedReaction; comment: string }) {
    const item = reviewItem;
    if (!item) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({ userId, item, reaction: input.reaction });
      setReactions((current) => [
        ...current.filter((entry) => !(entry.tmdbId === item.id && entry.mediaType === item.mediaType)),
        { tmdbId: item.id, mediaType: item.mediaType, reaction: input.reaction, createdAt: new Date().toISOString() }
      ]);

      if (input.comment.trim()) {
        await createFeedPost({
          userId,
          postType: "rating",
          body: buildWatchedPostBody({ item, reaction: input.reaction, comment: input.comment }),
          tmdbId: item.id,
          mediaType: item.mediaType
        });
      } else {
        await removeFeedEvent({ userId, postType: "rating", tmdbId: item.id, mediaType: item.mediaType });
      }

      setReviewItem(null);
      setToast({ message: `Marcaste «${item.title}» como vista. Ya está en tus Vistas.` });
    } catch (error) {
      setSyncMessage(getReactionSaveErrorMessage(error));
    } finally {
      setIsSyncing(false);
    }
  }

  function quickActionsFor(item: DiscoveryItem): TitleCardQuickAction[] {
    const actions: TitleCardQuickAction[] = [];
    const canStartWatching =
      item.mediaType === "tv" &&
      Boolean(profile && onProfileUpdated) &&
      !watchingEntries.some((entry) => entry.tmdbId === item.id);

    if (canStartWatching) {
      actions.push({
        id: "start",
        label: "Empecé a verla",
        tone: "primary",
        onClick: () => void handleStartWatching(item)
      });
    }

    actions.push({
      id: "seen",
      label: "Ya la vi",
      tone: canStartWatching ? "ghost" : "primary",
      onClick: () => setReviewItem(item)
    });
    actions.push({ id: "remove", label: "Quitar", tone: "ghost", onClick: () => void handleQuickRemove(item) });

    return actions;
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
      const nextProfile = await saveCurrentWatchingEntries(profile.id, nextEntries, watchingEntries);
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
    <section
      className={`profile-tabs ${enhanced ? "profile-tabs--watchlist-desktop" : ""} ${
        richMobile ? "profile-tabs--watchlist-mobile" : ""
      }`}
      ref={tabsRef}
      style={rich ? ({ "--watchlist-sticky-top": `${stickyTop}px` } as React.CSSProperties) : undefined}
    >
      {richMobile ? (
        <>
          <div className="watchlist-toolbar-sentinel" ref={setToolbarSentinel} aria-hidden="true" />
          <header className={`watchlist-mobile-header ${isToolbarStuck ? "is-stuck" : ""}`}>
            <div className="watchlist-mobile-header__row">
              <div className="watchlist-mobile-header__title">
                <h2>Watchlist</h2>
                {!isLoading ? <p>{watchlistSummary}</p> : null}
              </div>
              <button
                type="button"
                className={`watchlist-filter-button ${filterChips.length ? "has-filters" : ""}`}
                onClick={() => setMobileSheet("filters")}
                aria-haspopup="dialog"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
                  <circle cx="16" cy="7" r="2" />
                  <circle cx="8" cy="17" r="2" />
                </svg>
                Filtros
                {filterChips.length ? <span>{filterChips.length}</span> : null}
              </button>
            </div>

            {filterChips.length ? (
              <div className="watchlist-chips">
                {filterChips.map((chip) => (
                  <button key={chip.id} type="button" onClick={chip.remove} aria-label={`Quitar filtro ${chip.label}`}>
                    {chip.label}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                ))}
              </div>
            ) : null}
          </header>
        </>
      ) : null}
      {watchlistOnly && !rich ? <div className="profile-tabs__standalone-heading"><p className="section-eyebrow">Tu biblioteca</p><h2>Watchlist</h2><p>Películas y series que guardaste para ver después.</p></div> : null}
      {enhanced ? (
        <header className="watchlist-header">
          <div className="watchlist-header__title">
            <h2>Watchlist</h2>
            {!isLoading ? (
              <p>{watchlistSummary}</p>
            ) : null}
          </div>

          <div className="watchlist-header__actions">
            {nextItem && !isLoading ? (
              <button
                type="button"
                className="watchlist-next"
                onClick={() => openMediaDetails(nextItem)}
                title={`Abrir la ficha de ${nextItem.title}`}
              >
                <img src={nextItem.posterUrl} alt="" />
                <span>
                  <small>{pickedItem ? "Elegida para vos" : "Tu próxima"}</small>
                  <strong>{nextItem.title}</strong>
                  {nextProvider ? (
                    <em>
                      {myProviderSet.has(nextProvider.id) ? "Disponible en" : "En"} {nextProvider.name}
                    </em>
                  ) : null}
                </span>
              </button>
            ) : null}

            <button
              type="button"
              className="watchlist-pick"
              onClick={pickRandom}
              disabled={isLoading || !tabItems.length}
              title="Sortea un título entre los que estás viendo con los filtros actuales"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 7h3c4 0 6 10 10 10h5M3 17h3c1.500 0 2.700-1.400 3.800-3.200M14.200 10.200C15.300 8.400 16.500 7 18 7h3M18 4l3 3-3 3M18 14l3 3-3 3" />
              </svg>
              Elegí por mí
            </button>
          </div>
        </header>
      ) : null}
      {!isOwnProfile && visibleTabs.includes("mutual-likes") && showMutualHint && activeTab !== "mutual-likes" ? (
        <div className="profile-tabs__discovery-hint">
          <p>¿Qué tienen en común? Compará las Vistas y Watchlists que este perfil comparte.</p>
          <button type="button" onClick={() => { setActiveTab("mutual-likes"); dismissMutualHint(); }}>
            Ver en común <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="profile-tabs__discovery-dismiss" onClick={dismissMutualHint} aria-label="Ocultar sugerencia sobre En común">
            ×
          </button>
        </div>
      ) : null}
      {!watchingOnly && !watchlistOnly ? <div className="profile-tabs__switcher">
        {visibleTabs.map((tab) => {
          const isComingSoon = tab === "posts";

          return (
            <span
              key={tab}
              className={isComingSoon ? "profile-tabs__coming-soon" : undefined}
              data-tooltip={isComingSoon ? "Próximamente" : undefined}
            >
              <button
                type="button"
                className={`profile-tabs__switch ${activeTab === tab ? "is-active" : ""} ${
                  isComingSoon ? "is-disabled" : ""
                }`}
                data-profile-tab={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === "mutual-likes") {
                    dismissMutualHint();
                  }
                }}
                disabled={isComingSoon}
                aria-label={isComingSoon ? "Posts: Próximamente" : undefined}
              >
                {tabLabels[tab]}
                {!isComingSoon && tabCounts[tab] !== undefined ? (
                  <span className="profile-tabs__switch-count">{tabCounts[tab]}</span>
                ) : null}
              </button>
            </span>
          );
        })}
      </div> : null}

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
                <div className="profile-watching-search-results profile-watching-search-results--compact">
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
            <div className="profile-watching__groups">
              {([
                { label: "En emisión", items: watchingGroups.active },
                { label: "Próximos estrenos", items: watchingGroups.upcoming },
                { label: "En espera", items: watchingGroups.waiting }
              ] as const).filter((group) => group.items.length).map((group) => (
                <section key={group.label} className="profile-watching__group" aria-label={group.label}>
                  <h4>{group.label}</h4>
                  <div className="profile-watching__list">
              {group.items.map(({ entry, item, airing }) => (
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
                          {airing?.statusLabel ? ` • TMDB: ${airing.statusLabel}` : ""}
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
                </section>
              ))}
            </div>
          ) : (
            <div className="profile-grid__empty">
              <strong>Seguí tus series en un solo lugar.</strong> Agregá la que estás mirando para consultar su próximo episodio cuando TMDB tenga la fecha. También podés sumarla desde su ficha.
            </div>
          )}
        </div>
      ) : activeTab === "ranking" ? (
        <div className="profile-ranking">
          <div className="profile-ranking__intro">
            <p className="section-eyebrow">Tu ranking</p>
            <h3>Lo mejor puntuado por tu círculo</h3>
            <p>
              Ordenado con el puntaje de Cinerian, contando solo a las personas que seguís. A
              diferencia de Descubrí, acá entra todo: lo que ya viste y lo que todavía no.
            </p>
          </div>

          <div className="profile-list-toolbar">
            <div className="profile-type-filter">
              {TYPE_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={typeFilter === option.id ? "is-active" : ""}
                  onClick={() => setTypeFilter(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {rankingError ? <div className="inline-status">{rankingError}</div> : null}

          {isRankingLoading && !ranking.entries.length ? (
            <LoadingState label="Armando tu ranking..." />
          ) : ranking.entries.length ? (
            <>
              <ol className="profile-ranking__list">
                {ranking.entries.map((entry) => {
                  const key = `${entry.item.mediaType}-${entry.item.id}`;
                  const ownReaction = reactionByTitle.get(key);
                  // El puntaje es el del circulo y no incluye tu voto, asi que
                  // el chip muestra QUE pusiste vos y no solo que la viste: si
                  // no, un 10 arriba de "Ya la viste" parece un error cuando lo
                  // tuyo fue "Me gusto".
                  const seenLabel = !ownReaction
                    ? null
                    : isRatedReaction(ownReaction)
                      ? `Vos: ${RATED_REACTION_LABELS[ownReaction]}`
                      : ownReaction === "watchlist"
                        ? "En tu Watchlist"
                        : null;

                  return (
                    <li className="profile-ranking-item" key={key}>
                      <span className="profile-ranking-item__position">{entry.rank}</span>

                      <button
                        type="button"
                        className="profile-ranking-item__poster"
                        onClick={() => openMediaDetails(entry.item)}
                        aria-label={`Abrir ${entry.item.title}`}
                      >
                        {entry.item.posterUrl ? (
                          <img src={entry.item.posterUrl} alt="" />
                        ) : (
                          <span aria-hidden="true">🎬</span>
                        )}
                      </button>

                      <div className="profile-ranking-item__copy">
                        <button
                          type="button"
                          className="profile-ranking-item__title"
                          onClick={() => openMediaDetails(entry.item)}
                        >
                          {entry.item.title}
                        </button>

                        <p className="profile-ranking-item__meta">
                          {entry.item.mediaType === "movie" ? "Pelicula" : "Serie"}
                          {entry.item.year ? ` · ${entry.item.year}` : ""}
                          {seenLabel ? (
                            <span className="profile-ranking-item__seen">{seenLabel}</span>
                          ) : null}
                        </p>

                        {/* Los nombres pasan al tooltip: la linea visible
                            ahora carga el tamaño de la muestra. */}
                        <p
                          className="profile-ranking-item__watchers"
                          title={entry.watchers.map((watcher) => watcher.displayName).join(", ")}
                        >
                          {describeRankingWatchers(entry.watchers)}
                        </p>
                      </div>

                      <span
                        className="profile-ranking-item__score"
                        title="Puntaje de Cinerian segun tu circulo, de 0 a 10"
                      >
                        {entry.score >= 10 ? "10" : entry.score.toFixed(1)}
                      </span>
                    </li>
                  );
                })}
              </ol>

              {ranking.hasMore ? (
                <button
                  type="button"
                  className="profile-ranking__more"
                  onClick={() => void handleLoadMoreRanking()}
                  disabled={isRankingExpanding}
                >
                  {isRankingExpanding
                    ? "Cargando..."
                    : ranking.total === null
                      ? "Ver mas"
                      : `Ver mas (${ranking.entries.length} de ${ranking.total})`}
                </button>
              ) : null}
            </>
          ) : (
            <div className="profile-grid__empty">
              Tu ranking se arma con lo que puntúan las personas que seguís. Seguí a alguien desde
              el buscador y va a empezar a llenarse.
            </div>
          )}
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
              <p>
                {shownMutualFilter === "watched"
                  ? "Películas y series que ambos vieron y marcaron como favoritas."
                  : "Títulos que ambos guardaron para ver más adelante."}
              </p>
            </div>
          ) : null}

          {enhanced ? <div className="watchlist-toolbar-sentinel" ref={setToolbarSentinel} aria-hidden="true" /> : null}
          <div className={`profile-list-toolbar ${enhanced && isToolbarStuck ? "is-stuck" : ""}`}>
            {activeTab === "mutual-likes" ? (
              <div className="profile-type-filter">
                {canCompareWatched ? <button
                  type="button"
                  className={shownMutualFilter === "watched" ? "is-active" : ""}
                  onClick={() => setMutualFilter("watched")}
                >
                  Vistas
                </button> : null}
                {canCompareWatchlist ? <button
                  type="button"
                  className={shownMutualFilter === "watchlist" ? "is-active" : ""}
                  onClick={() => setMutualFilter("watchlist")}
                >
                  Watchlist
                </button> : null}
              </div>
            ) : (
              <div className="profile-type-filter">
                {TYPE_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={typeFilter === option.id ? "is-active" : ""}
                    onClick={() => setTypeFilter(option.id)}
                  >
                    {option.label}
                    {enhanced ? (
                      <span className="profile-type-filter__count">
                        {filteredWatchlist.filter((item) => matchesTypeFilter(item, option.id)).length}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            {enhanced ? (
              <div className="watchlist-filters">
                <div className={`watchlist-mine ${onlyMine ? "is-active" : ""}`}>
                  <button
                    type="button"
                    className={`watchlist-toggle ${onlyMine ? "is-active" : ""}`}
                    role="switch"
                    aria-checked={onlyMine}
                    disabled={!myProviderIds.length}
                    onClick={() => setOnlyMine((current) => !current)}
                    title={
                      myProviderIds.length
                        ? "Mostrar solo lo que podés ver con las plataformas que marcaste como tuyas"
                        : "Primero elegí cuáles son tus plataformas"
                    }
                  >
                    <span className="watchlist-toggle__track" aria-hidden="true"><span /></span>
                    En mis plataformas
                  </button>

                  <WatchlistDropdown
                    variant="edit"
                    label="Tus plataformas"
                    allLabel="Elegir"
                    values={myProviderIds.map(String)}
                    options={myPlatformOptions}
                    onChange={(values) => void changeMyProviders(values)}
                    withLogos
                    searchPlaceholder="Buscar plataforma…"
                    note="Son las que tenés contratadas. Se guardan en tu perfil y son las mismas que usa Descubrí."
                  />
                </div>

                <WatchlistDropdown
                  label="Género"
                  allLabel="Todos"
                  values={genreFilter}
                  options={genreOptions.map((genre) => ({ value: genre, label: genre }))}
                  onChange={setGenreFilter}
                />
              </div>
            ) : null}

            {activeTab === "watchlist" ? (
              <div className="profile-list-order" ref={sortMenuRef}>
                <button
                  type="button"
                  className="profile-list-order__trigger"
                  onClick={() => setIsSortMenuOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={isSortMenuOpen}
                  aria-label={`Ordenar por: ${activeSortOption.label}`}
                  // En mobile se ve solo el icono, asi que el handler global de
                  // Escape es la unica forma de cerrarlo sin elegir.
                  data-escape-dismiss={isSortMenuOpen ? "" : undefined}
                >
                  <svg className="profile-list-order__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 4v16M7 20l-3-3M7 20l3-3" />
                    <path d="M17 20V4M17 4l-3 3M17 4l3 3" />
                  </svg>
                  {enhanced ? <span className="profile-list-order__prefix">Ordenar por:</span> : null}
                  <span className="profile-list-order__value">{activeSortOption.short}</span>
                  <svg className="profile-list-order__caret" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isSortMenuOpen ? (
                  <div className="profile-list-order__menu" role="menu">
                    {WATCHLIST_SORT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={watchlistSort === option.id}
                        className={`profile-list-order__option ${
                          watchlistSort === option.id ? "is-current" : ""
                        }`}
                        onClick={() => changeWatchlistSort(option.id)}
                      >
                        {option.label}
                        <svg className="profile-list-order__check" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m5 13 4 4L19 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {rich && showWatchingHint ? (
            <div className="watchlist-hint">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.500v.500" />
              </svg>
              {richMobile ? (
                <p>
                  Tocá <strong>···</strong> en un título para marcarlo como visto o pasarlo a{" "}
                  <strong>Viendo</strong>.
                </p>
              ) : (
                <p>
                  Cuando empezás una serie desde acá, pasa a <strong>Viendo</strong>. Lo que marcás como
                  visto va a tus <strong>Vistas</strong>.
                </p>
              )}
              <button type="button" onClick={dismissWatchingHint}>Entendido</button>
            </div>
          ) : null}

          {tabItems.length ? (
            <div
              className={`profile-grid ${
                activeTab === "watched" || activeTab === "watchlist" || activeTab === "mutual-likes"
                  ? "profile-grid--library"
                  : ""
              }`}
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
                  {...(rich
                    ? {
                        scoreSource: "TMDB",
                        showLength: true,
                        friends: circleWatchlist.get(`${item.mediaType}-${item.id}`),
                        preferredProviderIds: myProviderIds
                      }
                    : {})}
                  {...(enhanced
                    ? {
                        quickActions: quickActionsFor(item),
                        isHighlighted: pickedKey === `${item.mediaType}-${item.id}`
                      }
                    : {})}
                  {...(richMobile ? { onOpenActions: () => setActionItem(item), posterFooter: true } : {})}
                />
              ))}
            </div>
          ) : rich && watchlistAll.length ? (
            <div className="profile-grid__empty watchlist-empty">
              <strong>Nada con estos filtros</strong>
              <p>Probá sacar algún filtro para ver más títulos de tu Watchlist.</p>
              <button type="button" onClick={clearExtraFilters}>Limpiar filtros</button>
            </div>
          ) : (
            <div className="profile-grid__empty">
              {activeTab === "mutual-likes"
                ? shownMutualFilter === "watched"
                  ? canCompareWatchlist ? "Todavía no tienen títulos valorados positivamente por ambos. Probá Watchlist para ver qué guardaron en común." : "Todavía no tienen títulos valorados positivamente por ambos."
                  : canCompareWatched ? "Todavía no tienen títulos en Watchlist en común. Probá Vistas para encontrar favoritos de ambos." : "Todavía no tienen títulos en Watchlist en común."
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

      {richMobile && !isLoading && tabItems.length ? (
        <button type="button" className="watchlist-fab" onClick={pickRandom}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 7h3c4 0 6 10 10 10h5M3 17h3c1.500 0 2.700-1.400 3.800-3.200M14.200 10.200C15.300 8.400 16.500 7 18 7h3M18 4l3 3-3 3M18 14l3 3-3 3" />
          </svg>
          Elegí por mí
        </button>
      ) : null}

      {richMobile && mobileSheet === "filters" ? (
        <WatchlistSheet label="Filtros" onClose={() => setMobileSheet(null)}>
          <div className="watchlist-sheet__head">
            <strong>Filtros</strong>
            <button type="button" onClick={clearExtraFilters} disabled={!filterChips.length}>Limpiar</button>
          </div>

          <div className="watchlist-sheet__body">
            <section>
              <h3>Tipo</h3>
              <div className="watchlist-sheet__grid">
                {TYPE_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="watchlist-sheet__option"
                    aria-pressed={typeFilter === option.id}
                    onClick={() => setTypeFilter(option.id)}
                  >
                    <span>{option.label}</span>
                    <span className="watchlist-sheet__count">
                      {filteredWatchlist.filter((item) => matchesTypeFilter(item, option.id)).length}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3>Dónde verla</h3>
              <div className={`watchlist-sheet__mine ${onlyMine ? "is-active" : ""}`}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={onlyMine}
                  onClick={() => (myProviderIds.length ? setOnlyMine((current) => !current) : setMobileSheet("platforms"))}
                >
                  Solo en mis plataformas
                  <span className="watchlist-toggle__track" aria-hidden="true"><span /></span>
                </button>
                <button type="button" onClick={() => setMobileSheet("platforms")}>
                  {myProviders.length ? (
                    <span className="watchlist-sheet__logos">
                      {myProviders.slice(0, 6).map((provider) =>
                        provider.logoUrl ? (
                          <img key={provider.id} src={provider.logoUrl} alt={provider.name} />
                        ) : (
                          <span key={provider.id}>{provider.name.slice(0, 2).toUpperCase()}</span>
                        )
                      )}
                      {myProviders.length > 6 ? <em>+{myProviders.length - 6}</em> : null}
                    </span>
                  ) : (
                    <span>Todavía no elegiste ninguna</span>
                  )}
                  <strong>{myProviders.length ? "Editar" : "Elegir"}</strong>
                </button>
              </div>
            </section>

            <section>
              <h3>Género</h3>
              <div className="watchlist-sheet__chips">
                {genreOptions.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    aria-pressed={genreFilter.includes(genre)}
                    onClick={() =>
                      setGenreFilter((current) =>
                        current.includes(genre) ? current.filter((entry) => entry !== genre) : [...current, genre]
                      )
                    }
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3>Ordenar por</h3>
              <div className="watchlist-sheet__chips">
                {WATCHLIST_SORT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={watchlistSort === option.id}
                    onClick={() => changeWatchlistSort(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <button type="button" className="watchlist-sheet__primary" onClick={() => setMobileSheet(null)}>
            Ver {tabItems.length} {tabItems.length === 1 ? "título" : "títulos"}
          </button>
        </WatchlistSheet>
      ) : null}

      {richMobile && mobileSheet === "platforms" ? (
        <WatchlistSheet label="Tus plataformas" onClose={() => setMobileSheet(null)}>
          <div className="watchlist-sheet__head">
            <strong>Tus plataformas</strong>
            <button type="button" onClick={() => void changeMyProviders([])} disabled={!myProviderIds.length}>
              Limpiar
            </button>
          </div>
          <p className="watchlist-sheet__note">
            Las que tenés contratadas. Se guardan en tu perfil y son las mismas que usa Descubrí.
          </p>
          <div className="filters-search watchlist-dropdown__search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              type="search"
              value={platformQuery}
              onChange={(event) => setPlatformQuery(event.target.value)}
              placeholder="Buscar plataforma…"
              autoComplete="off"
            />
          </div>
          <div className="watchlist-sheet__body">
            <div className="watchlist-sheet__grid">
              {providerCatalog
                .filter((provider) => provider.name.toLowerCase().includes(normalizedPlatformQuery))
                .map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className="watchlist-sheet__option"
                    aria-pressed={myProviderSet.has(provider.id)}
                    onClick={() =>
                      void changeMyProviders(
                        (myProviderSet.has(provider.id)
                          ? myProviderIds.filter((id) => id !== provider.id)
                          : [...myProviderIds, provider.id]
                        ).map(String)
                      )
                    }
                  >
                    {provider.logoUrl ? (
                      <img src={provider.logoUrl} alt="" className="watchlist-sheet__option-logo" />
                    ) : (
                      <span className="watchlist-sheet__option-logo" />
                    )}
                    <span>{provider.name}</span>
                    <span className="watchlist-sheet__check" aria-hidden="true">✓</span>
                  </button>
                ))}
            </div>
          </div>
          <button
            type="button"
            className="watchlist-sheet__primary"
            onClick={() => {
              setPlatformQuery("");
              setMobileSheet("filters");
            }}
          >
            Listo
          </button>
        </WatchlistSheet>
      ) : null}

      {richMobile && actionItem ? (
        <WatchlistSheet label={`Acciones de ${actionItem.title}`} onClose={() => setActionItem(null)}>
          <div className="watchlist-sheet__title">
            <img src={actionItem.posterUrl} alt="" />
            <div>
              <strong>{actionItem.title}</strong>
              <span>{describeMeta(actionItem)}</span>
              <span>
                {[describeWhere(actionItem), actionItem.score > 0 ? `TMDB ${actionItem.score.toFixed(1)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {circleWatchlist.get(`${actionItem.mediaType}-${actionItem.id}`)?.length ? (
                <em>
                  {(() => {
                    const friends = circleWatchlist.get(`${actionItem.mediaType}-${actionItem.id}`) ?? [];
                    return friends.length === 1
                      ? `${friends[0].displayName.split(" ")[0]} también la quiere ver`
                      : `${friends.length} amigos también la quieren ver`;
                  })()}
                </em>
              ) : null}
            </div>
          </div>

          <div className="watchlist-sheet__actions">
            {quickActionsFor(actionItem)
              .filter((action) => action.id !== "remove")
              .map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={action.tone === "primary" ? "watchlist-sheet__primary" : "watchlist-sheet__ghost"}
                  onClick={() => {
                    setActionItem(null);
                    action.onClick();
                  }}
                >
                  {action.label}
                </button>
              ))}
            <button
              type="button"
              className="watchlist-sheet__ghost"
              onClick={() => {
                const item = actionItem;
                setActionItem(null);
                openMediaDetails(item);
              }}
            >
              Ver ficha
            </button>
            <button
              type="button"
              className="watchlist-sheet__danger"
              onClick={() => {
                const item = actionItem;
                setActionItem(null);
                void handleQuickRemove(item);
              }}
            >
              Quitar de Watchlist
            </button>
          </div>
        </WatchlistSheet>
      ) : null}

      {richMobile && mobileSheet === "pick" && pickedItem ? (
        <WatchlistSheet label="Elegida para vos" onClose={() => setMobileSheet(null)} className="watchlist-sheet__panel--pick">
          <small>Elegida para vos</small>
          <img src={pickedItem.posterUrl} alt="" />
          <div className="watchlist-sheet__pick-copy">
            <strong>{pickedItem.title}</strong>
            <span>{describeMeta(pickedItem)}</span>
            {describeWhere(pickedItem) ? <span>{describeWhere(pickedItem)}</span> : null}
          </div>
          <div className="watchlist-sheet__pair">
            <button type="button" className="watchlist-sheet__ghost" onClick={pickRandom} disabled={tabItems.length < 2}>
              Elegir otra
            </button>
            <button
              type="button"
              className="watchlist-sheet__primary"
              onClick={() => {
                const item = pickedItem;
                setMobileSheet(null);
                openMediaDetails(item);
              }}
            >
              Ver ficha
            </button>
          </div>
        </WatchlistSheet>
      ) : null}

      {rich ? (
        <WatchReviewModal
          item={reviewItem}
          isSaving={isSyncing}
          onClose={() => setReviewItem(null)}
          onSubmit={(input) => void handleReviewSubmit(input)}
        />
      ) : null}

      {rich && toast
        ? createPortal(
            <div className="watchlist-toast" role="status">
              <span>{toast.message}</span>
              {toast.undo ? (
                <button type="button" onClick={() => void handleUndoToast()}>Deshacer</button>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
