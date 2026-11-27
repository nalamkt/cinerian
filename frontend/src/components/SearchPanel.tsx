import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMediaDetails } from "./MediaDetailsModal";
import { SendRecommendationModal } from "./SendRecommendationModal";
import { TalentDetailsModal } from "./TalentDetailsModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { getRatedReactionLabel, RatedReactionIcon } from "./RatedReactionIcon";
import { useDiscovery } from "../hooks/useDiscovery";
import { createFeedPost, removeFeedEvent } from "../lib/feed";
import { listProfiles, type Profile } from "../lib/auth";
import { DISCOVER_FILTERS_UPDATED_EVENT } from "../lib/discoverFilters";
import { DISCOVER_GENRES } from "../lib/discoverTaxonomy";
import { DEFAULT_SEARCH_FILTERS, rankSearchTitles, type SearchCategory, type SearchFilters, type SearchOrder } from "../lib/searchRanking";
import { scheduleSearchCommit } from "../lib/searchInputTiming";
import { fetchForYouTitles } from "../lib/personalizedTitles";
import { preloadPosters } from "../lib/posterPreload";
import {
  fetchStoredReactions,
  getReactionSaveErrorMessage,
  REACTIONS_UPDATED_EVENT,
  saveStoredReaction,
  type RatedReaction,
  type RecommendationReaction,
  type StoredReaction
} from "../lib/reactions";
import { buildWatchedPostBody } from "../lib/reviews";
import {
  getFeaturedTalent,
  getTitlesByGenre,
  getTrendingTitles,
  getUpcomingTitles,
  searchTalentPage
} from "../lib/tmdb";
import { fetchTopCinerianTitles } from "../lib/topCinerian";
import type { DiscoveryItem, TalentSearchItem } from "../types";

type SearchPanelProps = {
  userId: string;
  query: string;
  onQueryChange: (query: string) => void;
  isBrowsing: boolean;
  canDiscover: boolean;
  onToggleBrowse: () => void;
  showInput?: boolean;
  showBrowseToggle?: boolean;
  showRecents?: boolean;
  dedicated?: boolean;
  onClose?: () => void;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
};

const RECENT_SEARCHES_KEY = "cinerian:recent-searches";
const RECENT_SEARCHES_LIMIT = 8;

function loadRecentSearches(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${RECENT_SEARCHES_KEY}:${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function persistRecentSearches(userId: string, values: string[]) {
  try {
    window.localStorage.setItem(`${RECENT_SEARCHES_KEY}:${userId}`, JSON.stringify(values));
  } catch {
    /* ignore */
  }
}

type BrowseRail = {
  id: string;
  title: string;
  description: string;
  items: DiscoveryItem[];
};

const HEADER_SEARCH_SLOT_ID = "app-topbar-search-slot";
const DESKTOP_HEADER_QUERY = "(min-width: 901px)";

// En desktop el buscador abierto vive dentro del header, no debajo.
function useDesktopHeaderSearchSlot(enabled: boolean) {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(DESKTOP_HEADER_QUERY).matches));
  const [, setMounted] = useState(false);
  useEffect(() => {
    // Un render más tras montar: el header ya está en el DOM y el slot se puede encontrar.
    setMounted(true);
    const media = window.matchMedia?.(DESKTOP_HEADER_QUERY);
    if (!media) return;
    const update = () => setIsDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (!enabled || !isDesktop || typeof document === "undefined") return null;
  return document.getElementById(HEADER_SEARCH_SLOT_ID);
}

/** Vista = marcada con pulgar arriba o abajo (ya no existe un estado 'watched' aparte). */
function isWatchedReaction(reaction: RecommendationReaction | undefined): reaction is RatedReaction {
  return reaction === "superliked" || reaction === "liked" || reaction === "disliked";
}

const SearchInput = memo(function SearchInput({ query, onQueryChange, inputRef, onFocus }: {
  query: string;
  onQueryChange: (query: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  onFocus: () => void;
}) {
  const [draft, setDraft] = useState(query);
  const [isComposing, setIsComposing] = useState(false);
  const onQueryChangeRef = useRef(onQueryChange);
  const lastSentRef = useRef(query);
  onQueryChangeRef.current = onQueryChange;

  useEffect(() => {
    if (query !== lastSentRef.current) setDraft(query);
  }, [query]);
  useEffect(() => {
    if (isComposing || draft === query) return;
    return scheduleSearchCommit(draft, (value) => {
      lastSentRef.current = value;
      onQueryChangeRef.current(value);
    });
  }, [draft, query, isComposing]);

  return <div className="input-stack search-panel__input search-panel__input--glass">
    <svg className="search-panel__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
    <input
      ref={inputRef}
      id="cinerian-global-search"
      type="search"
      aria-label="Buscar películas, series, usuarios o actores"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={(event) => { setDraft(event.currentTarget.value); setIsComposing(false); }}
      onFocus={onFocus}
      placeholder="Películas, series, usuarios o actores"
    />
    {draft ? <button type="button" className="search-panel__input-clear" aria-label="Borrar búsqueda"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => { setDraft(""); lastSentRef.current = ""; onQueryChangeRef.current(""); inputRef.current?.focus(); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
      </svg>
    </button> : null}
  </div>;
});

export function SearchPanel({ userId, query, onQueryChange, isBrowsing, canDiscover, onToggleBrowse, showInput = true, showBrowseToggle = true, showRecents = false, dedicated = false, onClose, onOpenUserProfile }: SearchPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const [areReactionsReady, setAreReactionsReady] = useState(false);
  const [forYouTitles, setForYouTitles] = useState<DiscoveryItem[]>([]);
  const [isForYouLoading, setIsForYouLoading] = useState(false);
  const [filtersVersion, setFiltersVersion] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const [reviewInitialReaction, setReviewInitialReaction] = useState<RatedReaction | null>(null);
  const [sendItem, setSendItem] = useState<DiscoveryItem | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileLimit, setProfileLimit] = useState(8);
  const [isProfilesLoading, setIsProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [talentResults, setTalentResults] = useState<TalentSearchItem[]>([]);
  const [talentPage, setTalentPage] = useState(0);
  const [talentTotalPages, setTalentTotalPages] = useState(0);
  const [isTalentLoadingMore, setIsTalentLoadingMore] = useState(false);
  const [talentQuery, setTalentQuery] = useState("");
  const [topCinerianTitles, setTopCinerianTitles] = useState<DiscoveryItem[]>([]);
  const [trendingTitles, setTrendingTitles] = useState<DiscoveryItem[]>([]);
  const [upcomingTitles, setUpcomingTitles] = useState<DiscoveryItem[]>([]);
  const [genreRails, setGenreRails] = useState<BrowseRail[]>([]);
  const [featuredTalent, setFeaturedTalent] = useState<TalentSearchItem[]>([]);
  const [isBrowseLoading, setIsBrowseLoading] = useState(false);
  const [isTalentLoading, setIsTalentLoading] = useState(false);
  const [talentError, setTalentError] = useState<string | null>(null);
  const [activeTalent, setActiveTalent] = useState<TalentSearchItem | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches(userId));
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(DEFAULT_SEARCH_FILTERS);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const headerSearchSlot = useDesktopHeaderSearchSlot(dedicated && showInput);
  useEffect(() => {
    if (headerSearchSlot) searchInputRef.current?.focus();
  }, [headerSearchSlot]);
  const talentRequestRef = useRef(0);
  const talentControllerRef = useRef<AbortController | null>(null);
  const talentMoreRef = useRef(false);
  const reactionsRequestRef = useRef(0);
  const [hasOpenedBrowse, setHasOpenedBrowse] = useState(false);
  const { results, isLoading, isLoadingMore, error, partial, loadMore } = useDiscovery(query);
  const visibleTitles = useMemo(() => rankSearchTitles(results, query, searchFilters), [results, query, searchFilters]);

  useEffect(() => {
    setRecentSearches(loadRecentSearches(userId));
  }, [userId]);

  useEffect(() => { setProfileLimit(8); }, [query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    const timeoutId = window.setTimeout(() => {
      setRecentSearches((current) => {
        const next = [trimmed, ...current.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())].slice(
          0,
          RECENT_SEARCHES_LIMIT
        );
        persistRecentSearches(userId, next);
        return next;
      });
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [query, userId]);

  function removeRecentSearch(term: string) {
    setRecentSearches((current) => {
      const next = current.filter((entry) => entry !== term);
      persistRecentSearches(userId, next);
      return next;
    });
  }

  function clearRecentSearches() {
    setRecentSearches([]);
    persistRecentSearches(userId, []);
  }

  useEffect(() => {
    async function loadStoredReactions() {
      const requestId = ++reactionsRequestRef.current;

      try {
        const response = await fetchStoredReactions(userId);
        if (requestId === reactionsRequestRef.current) {
          setStoredReactions(response);
          setAreReactionsReady(true);
        }
      } catch {
        if (requestId === reactionsRequestRef.current) {
          setSyncMessage("No pude sincronizar tus acciones guardadas.");
        }
      }
    }

    function handleReactionsUpdated(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) {
        return;
      }

      void loadStoredReactions();
    }

    void loadStoredReactions();
    setAreReactionsReady(false);
    window.addEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);

    return () => {
      window.removeEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);
    };
  }, [userId]);

  useEffect(() => {
    function handleFiltersUpdated(event: Event) {
      const updatedUserId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (updatedUserId === userId) setFiltersVersion((version) => version + 1);
    }

    window.addEventListener(DISCOVER_FILTERS_UPDATED_EVENT, handleFiltersUpdated);
    return () => window.removeEventListener(DISCOVER_FILTERS_UPDATED_EVENT, handleFiltersUpdated);
  }, [userId]);

  useEffect(() => {
    if (!hasOpenedBrowse || !areReactionsReady) return;
    if (!storedReactions.some((entry) => entry.reaction === "liked" || entry.reaction === "superliked")) {
      setForYouTitles([]);
      setIsForYouLoading(false);
      return;
    }

    let isMounted = true;
    setIsForYouLoading(true);
    void fetchForYouTitles(userId, storedReactions)
      .then(async (items) => {
        await preloadPosters(items);
        if (isMounted) setForYouTitles(items);
      })
      .catch(() => {
        if (isMounted) setForYouTitles([]);
      })
      .finally(() => {
        if (isMounted) setIsForYouLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [areReactionsReady, filtersVersion, hasOpenedBrowse, storedReactions, userId]);

  useEffect(() => {
    if (isBrowsing) setHasOpenedBrowse(true);
  }, [isBrowsing]);

  useEffect(() => {
    void listProfiles()
      .then(setProfiles)
      .catch(() => {
        setProfiles([]);
        setProfilesError("No pude traer usuarios en este momento.");
      })
      .finally(() => setIsProfilesLoading(false));
  }, []);

  useEffect(() => {
    if (!hasOpenedBrowse) return;
    let isMounted = true;
    setIsBrowseLoading(true);

    void fetchTopCinerianTitles(15)
      .then((items) => {
        if (isMounted) setTopCinerianTitles(items);
      })
      .catch(() => {
        if (isMounted) setTopCinerianTitles([]);
      });

    void Promise.allSettled([
      getTrendingTitles(),
      getUpcomingTitles(),
      getFeaturedTalent(),
      getTitlesByGenre(28),
      getTitlesByGenre(18),
      getTitlesByGenre(35),
      getTitlesByGenre(878),
      getTitlesByGenre(53),
      getTitlesByGenre(27),
      getTitlesByGenre(10749),
      getTitlesByGenre(16),
      getTitlesByGenre(10751)
    ]).then(
      ([
        trendingResult,
        upcomingResult,
        talentResult,
        actionResult,
        dramaResult,
        comedyResult,
        sciFiResult,
        thrillerResult,
        horrorResult,
        romanceResult,
        animationResult,
        familyResult
      ]) => {
        if (!isMounted) {
          return;
        }

        setTrendingTitles(trendingResult.status === "fulfilled" ? trendingResult.value : []);
        setUpcomingTitles(upcomingResult.status === "fulfilled" ? upcomingResult.value : []);
        setFeaturedTalent(talentResult.status === "fulfilled" ? talentResult.value : []);
        setGenreRails(
          [
            { id: "action", title: "Accion y aventura", description: "Ritmo, adrenalina y grandes mundos", result: actionResult },
            { id: "drama", title: "Drama", description: "Historias que quedan dando vueltas", result: dramaResult },
            { id: "comedy", title: "Comedia", description: "Para desconectar y pasarla bien", result: comedyResult },
            { id: "sci-fi", title: "Ciencia ficcion", description: "Ideas grandes y futuros posibles", result: sciFiResult },
            { id: "thriller", title: "Suspenso", description: "Tension hasta el ultimo minuto", result: thrillerResult },
            { id: "horror", title: "Terror", description: "Para mirar con las luces prendidas", result: horrorResult },
            { id: "romance", title: "Romance", description: "Historias para sentir", result: romanceResult },
            { id: "animation", title: "Animacion", description: "Mundos que cobran vida", result: animationResult },
            { id: "family", title: "Para ver en familia", description: "Planes para compartir", result: familyResult }
          ].flatMap(({ id, title, description, result }) =>
            result.status === "fulfilled" && result.value.length
              ? [{ id, title, description, items: result.value }]
              : []
          )
        );
        setIsBrowseLoading(false);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [hasOpenedBrowse]);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++talentRequestRef.current;
    talentControllerRef.current?.abort();
    talentMoreRef.current = false;
    setTalentQuery(trimmed);
    setTalentResults([]);
    setTalentPage(0);
    setTalentTotalPages(0);
    setIsTalentLoadingMore(false);
    setTalentError(null);
    setIsTalentLoading(Boolean(trimmed));

    if (!trimmed) {
      return;
    }

    let isCurrent = true;
    const controller = new AbortController();
    talentControllerRef.current = controller;
    void (async () => {
      try {
        const page = await searchTalentPage(trimmed, 1, controller.signal);
        if (isCurrent && talentRequestRef.current === requestId) {
          setTalentResults(page.items);
          setTalentPage(1);
          setTalentTotalPages(page.totalPages);
        }
      } catch {
        if (isCurrent && talentRequestRef.current === requestId) {
          setTalentError("No pude traer actores y directores ahora.");
          setTalentResults([]);
        }
      } finally {
        if (isCurrent && talentRequestRef.current === requestId) {
          setIsTalentLoading(false);
        }
      }
    })();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [query]);

  async function loadMoreTalent() {
    if (talentMoreRef.current || talentPage >= talentTotalPages || talentQuery !== query.trim()) return;
    talentMoreRef.current = true;
    const requestId = talentRequestRef.current;
    const nextPage = talentPage + 1;
    const controller = new AbortController();
    talentControllerRef.current = controller;
    setIsTalentLoadingMore(true);
    try {
      const response = await searchTalentPage(query.trim(), nextPage, controller.signal);
      if (talentRequestRef.current === requestId) {
        setTalentResults((current) => {
          const seen = new Set(current.map((entry) => entry.id));
          return [...current, ...response.items.filter((entry) => !seen.has(entry.id))];
        });
        setTalentPage(nextPage);
        setTalentTotalPages(response.totalPages);
        setTalentError(null);
      }
    } catch {
      if (talentRequestRef.current === requestId) setTalentError("No pude cargar más talentos. Intentá otra vez.");
    } finally {
      if (talentControllerRef.current === controller) {
        talentControllerRef.current = null;
        talentMoreRef.current = false;
      }
      if (talentRequestRef.current === requestId) setIsTalentLoadingMore(false);
    }
  }

  const reactionMap = useMemo(
    () =>
      Object.fromEntries(
        storedReactions.map((entry) => [`${entry.mediaType}-${entry.tmdbId}`, entry.reaction] as const)
      ),
    [storedReactions]
  );

  const profileResults = useMemo(() => {
    if (searchFilters.category !== "all" && searchFilters.category !== "people") return [];
    const trimmed = query.trim().toLowerCase().replace(/^@/, "");
    if (!trimmed) {
      return [];
    }

    return profiles
      .filter((profile) => profile.id !== userId)
      .filter(
        (profile) =>
          profile.display_name.toLowerCase().includes(trimmed) ||
          profile.username.toLowerCase().includes(trimmed)
      )
      .slice(0, profileLimit);
  }, [profiles, profileLimit, query, searchFilters.category, userId]);
  const profileMatchCount = useMemo(() => {
    const term = query.trim().toLowerCase().replace(/^@/, "");
    return term && (searchFilters.category === "all" || searchFilters.category === "people")
      ? profiles.filter((profile) => profile.id !== userId && (profile.display_name.toLowerCase().includes(term) || profile.username.toLowerCase().includes(term))).length
      : 0;
  }, [profiles, query, searchFilters.category, userId]);

  const hasQuery = Boolean(query.trim());
  const isTalentCurrent = talentQuery === query.trim();
  const visibleTalentResults = isTalentCurrent && (searchFilters.category === "all" || searchFilters.category === "people") ? talentResults : [];
  const visibleTalentError = isTalentCurrent ? talentError : null;
  const isSearching = isLoading || isTalentLoading || (hasQuery && !isTalentCurrent);

  function replaceStoredReaction(item: DiscoveryItem, reaction: StoredReaction["reaction"]) {
    setStoredReactions((current) => [
      { tmdbId: item.id, mediaType: item.mediaType, reaction, createdAt: new Date().toISOString() },
      ...current.filter(
        (entry) => !(entry.tmdbId === item.id && entry.mediaType === item.mediaType)
      )
    ]);
  }

  async function handleReaction(item: DiscoveryItem, reaction: StoredReaction["reaction"]) {
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({
        userId,
        item,
        reaction
      });
      replaceStoredReaction(item, reaction);

      if (reaction === "watchlist") {
        await createFeedPost({
          userId,
          postType: "watchlist",
          body: "La guardo en su Watchlist.",
          tmdbId: item.id,
          mediaType: item.mediaType
        });
      }

    } catch (error) {
      setSyncMessage(getReactionSaveErrorMessage(error));
    } finally {
      setIsSyncing(false);
    }
  }

  function handleWatchedToggle(item: DiscoveryItem) {
    const key = `${item.mediaType}-${item.id}`;
    const currentReaction = reactionMap[key];

    if (document.activeElement === searchInputRef.current) {
      searchInputRef.current?.blur();
    }

    // Una calificacion anterior se puede reemplazar directamente: no hace
    // falta borrarla para volver a elegir entre "me gustó" y "me encantó".
    setReviewInitialReaction(isWatchedReaction(currentReaction) ? currentReaction : null);
    setReviewItem(item);
  }

  async function handleReviewSubmit(input: { reaction: RatedReaction; comment: string }) {
    if (!reviewItem) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({
        userId,
        item: reviewItem,
        reaction: input.reaction
      });
      replaceStoredReaction(reviewItem, input.reaction);
      if (input.comment.trim()) {
        await createFeedPost({
          userId,
          postType: "rating",
          body: buildWatchedPostBody({
            item: reviewItem,
            reaction: input.reaction,
            comment: input.comment
          }),
          tmdbId: reviewItem.id,
          mediaType: reviewItem.mediaType
        });
      } else {
        await removeFeedEvent({
          userId,
          postType: "rating",
          tmdbId: reviewItem.id,
          mediaType: reviewItem.mediaType
        });
      }

      setReviewItem(null);
    } catch (error) {
      setSyncMessage(getReactionSaveErrorMessage(error));
    } finally {
      setIsSyncing(false);
    }
  }

  function handleSend(item: DiscoveryItem) {
    setSendItem(item);
  }

  return (
    <section className={`panel search-panel${hasQuery || isBrowsing || dedicated ? " is-active" : ""}${showInput ? "" : " search-panel--global"}${dedicated ? " search-panel--dedicated" : ""}`} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsInputFocused(false);
    }}>
      {dedicated && !headerSearchSlot ? <div className="search-panel__heading"><h1>Buscar</h1><button type="button" className="search-panel__close" onClick={onClose} data-escape-dismiss>Cerrar</button></div> : null}
      {headerSearchSlot ? createPortal(
        <div className="app-topbar-search">
          <SearchInput query={query} onQueryChange={onQueryChange} inputRef={searchInputRef} onFocus={() => setIsInputFocused(true)} />
          <button type="button" className="app-topbar-search__close" onClick={onClose} data-escape-dismiss>Cerrar</button>
        </div>,
        headerSearchSlot
      ) : showInput ? <SearchInput query={query} onQueryChange={onQueryChange} inputRef={searchInputRef} onFocus={() => setIsInputFocused(true)} /> : null}

      {dedicated && hasQuery ? <div className="search-panel__filters">
        <div className="search-panel__tabs" role="group" aria-label="Tipo de resultado">
          {([ ["all", "Todo"], ["movie", "Películas"], ["tv", "Series"], ["people", "Personas"] ] as [SearchCategory, string][]).map(([category, label]) => <button key={category} type="button" className={`search-panel__tab${searchFilters.category === category ? " search-panel__tab--active" : ""}`} aria-pressed={searchFilters.category === category} onClick={() => setSearchFilters((current) => ({ ...current, category }))}>{label}</button>)}
        </div>
        {searchFilters.category !== "people" ? <div className="search-panel__filter-row">
          <label><input type="checkbox" checked={searchFilters.excludeAnimation} onChange={(event) => setSearchFilters((current) => ({ ...current, excludeAnimation: event.target.checked }))} /> Excluir animación</label>
          <label><input type="checkbox" checked={searchFilters.releasedOnly} onChange={(event) => setSearchFilters((current) => ({ ...current, releasedOnly: event.target.checked }))} /> Solo estrenados</label>
          <label>Ordenar <select value={searchFilters.order} onChange={(event) => setSearchFilters((current) => ({ ...current, order: event.target.value as SearchOrder }))}>
            <option value="relevance">Relevancia</option><option value="popularity">Popularidad</option><option value="rating">Mejor puntuados</option><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option>
          </select></label>
          <details className="search-panel__advanced"><summary>Más filtros</summary><div className="search-panel__advanced-content"><fieldset><legend>Género</legend><div className="search-panel__genre-list">{DISCOVER_GENRES.map((genre) => <label key={genre.id}><input type="checkbox" checked={searchFilters.genreIds.includes(genre.id)} onChange={() => setSearchFilters((current) => ({ ...current, genreIds: current.genreIds.includes(genre.id) ? current.genreIds.filter((id) => id !== genre.id) : [...current.genreIds, genre.id] }))} /> {genre.label}</label>)}</div></fieldset><label>Desde <input type="number" inputMode="numeric" min="1880" max="2100" placeholder="Año" value={searchFilters.yearFrom} onChange={(event) => setSearchFilters((current) => ({ ...current, yearFrom: event.target.value }))} /></label><label>Hasta <input type="number" inputMode="numeric" min="1880" max="2100" placeholder="Año" value={searchFilters.yearTo} onChange={(event) => setSearchFilters((current) => ({ ...current, yearTo: event.target.value }))} /></label></div></details>
        </div> : null}
      </div> : null}

      {!hasQuery && canDiscover && showBrowseToggle ? (
        <button type="button" className="search-panel__browse-toggle" onClick={onToggleBrowse} aria-expanded={isBrowsing} aria-label={isBrowsing ? "Volver a las tarjetas" : "Explorar catálogo"}>
          {isBrowsing ? "Volver" : "Catálogo"}
        </button>
      ) : null}

      {syncMessage || (hasQuery && isSearching) ? (
        <div className="inline-status">
          {syncMessage ?? "Buscando títulos y talentos..."}
        </div>
      ) : null}

      {showRecents && !hasQuery && isInputFocused && recentSearches.length ? (
        <div className="search-panel__recents">
          <div className="search-panel__recents-header">
            <p>Busquedas recientes</p>
            <button
              type="button"
              className="search-panel__recents-clear"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearRecentSearches}
            >
              Limpiar
            </button>
          </div>
          {recentSearches.map((term) => (
            <div key={term} className="search-panel__recent">
              <button type="button" className="search-panel__recent-choice" onMouseDown={(event) => event.preventDefault()} onClick={() => onQueryChange(term)}>
                <svg className="search-panel__recent-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
                <span className="search-panel__recent-label">{term}</span>
              </button>
              <button type="button" aria-label={`Eliminar ${term}`} className="search-panel__recent-remove" onMouseDown={(event) => event.preventDefault()} onClick={() => removeRecentSearch(term)}>
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {hasQuery ? (
        <div className="search-result-sections">
          {error && !results.length ? <p className="inline-status">{error}</p> : null}
          {visibleTalentError && !visibleTalentResults.length ? <p className="inline-status">{visibleTalentError}</p> : null}
          {profilesError ? <p className="inline-status">{profilesError}</p> : null}
          {visibleTitles.length ? (
            <section className="search-result-section" aria-label="Películas y series">
              <div className="card-list search-panel__title-grid">
                {visibleTitles.map((item) => {
            const reaction = reactionMap[`${item.mediaType}-${item.id}`];
            const watchedReaction = isWatchedReaction(reaction) ? reaction : null;

            return (
            <article
              className="media-card media-card--interactive"
              key={`${item.mediaType}-${item.id}`}
            >
              <button type="button" className="media-card__open" aria-label={`Ver detalles de ${item.title}`} onClick={() => openMediaDetails(item)} />
              <div className="detail-poster">
                <img src={item.posterUrl} alt={item.title} className="media-poster" />
                <span className="detail-poster__hint" aria-hidden="true">
                  Ver detalles
                </span>
              </div>
              <div className="media-copy">
                <div className="media-copy__meta-row">
                  <p className="meta-line">
                    {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
                  </p>
                  {item.score > 0 ? <span className="media-score">TMDB {item.score}</span> : null}
                </div>
                <h3>{item.title}</h3>
                <div className="action-row">
                  <button
                    type="button"
                    className={`recommendation-action-button recommendation-action-button--small ${
                      reactionMap[`${item.mediaType}-${item.id}`] === "watchlist"
                        ? "recommendation-action-button--primary"
                        : ""
                    }`}
                    disabled={isSyncing}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleReaction(item, "watchlist");
                    }}
                    data-tooltip={
                      reactionMap[`${item.mediaType}-${item.id}`] === "watchlist" ? "Guardada" : "Guardar"
                    }
                    aria-label={
                      reactionMap[`${item.mediaType}-${item.id}`] === "watchlist" ? "Guardada" : "Guardar"
                    }
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="recommendation-action-button recommendation-action-button--small"
                    disabled={isSyncing}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSend(item);
                    }}
                    data-tooltip="Enviar"
                    aria-label="Enviar"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M21 3 10 14" />
                      <path d="m21 3-7 18-4-7-7-4 18-7Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`recommendation-action-button recommendation-action-button--small ${
                      watchedReaction ? "recommendation-action-button--primary" : ""
                    }`}
                    disabled={isSyncing}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleWatchedToggle(item);
                    }}
                    data-tooltip={
                      getRatedReactionLabel(watchedReaction)
                    }
                    aria-label={
                      getRatedReactionLabel(watchedReaction)
                    }
                  >
                    <RatedReactionIcon reaction={watchedReaction} />
                  </button>
                </div>
              </div>
            </article>
            );
                })}
              </div>
            </section>
          ) : null}

          {partial && searchFilters.category !== "people" ? <button type="button" className="search-panel__load-more" onClick={() => void loadMore()} disabled={isLoadingMore}>{isLoadingMore ? "Cargando..." : "Cargar más resultados"}</button> : null}

          {profileResults.length ? (
            <section className="search-result-section">
              <div className="search-result-section__heading">
                <p className="section-eyebrow">Cinerianos</p>
                <h2>Personas de la comunidad</h2>
              </div>
              <div className="card-list">
                {profileResults.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className="profile-search-card"
              onClick={() => onOpenUserProfile({ userId: profile.id, username: profile.username })}
            >
              <span className="profile-search-card__avatar" aria-hidden="true">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" />
                ) : (
                  profile.display_name.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="profile-search-card__copy">
                <strong>{profile.display_name}</strong>
                <span>@{profile.username}</span>
                {profile.bio ? <p>{profile.bio}</p> : null}
              </span>
            </button>
                ))}
              </div>
              {profileMatchCount > profileLimit ? <button type="button" className="search-panel__load-more" onClick={() => setProfileLimit((current) => current + 8)}>Cargar más personas</button> : null}
            </section>
          ) : null}

          {visibleTalentResults.length ? (
            <section className="search-result-section">
              <div className="search-result-section__heading">
                <p className="section-eyebrow">Talentos</p>
                <h2>Actores y directores</h2>
              </div>
              <div className="card-list">
                {visibleTalentResults.map((talent) => (
            <button
              key={talent.id}
              type="button"
              className="talent-search-card"
              onClick={() => setActiveTalent(talent)}
            >
              <img src={talent.profileUrl ?? "/images/base.png"} alt={talent.name} />
              <span className="talent-search-card__copy">
                <p className="meta-line">{talent.knownForDepartment}</p>
                <strong>{talent.name}</strong>
                {talent.knownForTitles.length ? (
                  <p>{talent.knownForTitles.join(" · ")}</p>
                ) : null}
              </span>
            </button>
                ))}
              </div>
              {talentPage < talentTotalPages ? <button type="button" className="search-panel__load-more" onClick={() => void loadMoreTalent()} disabled={isTalentLoadingMore}>{isTalentLoadingMore ? "Cargando..." : "Cargar más talentos"}</button> : null}
            </section>
          ) : null}

          {!isSearching && !isProfilesLoading && !error && !visibleTalentError && !profilesError &&
            !visibleTitles.length && !profileResults.length && !visibleTalentResults.length ? (
            <p className="search-empty">{partial && searchFilters.category !== "people" ? "Todavía no hay coincidencias. Probá con Cargar más." : "No encontramos coincidencias. Probá con otro nombre o título."}</p>
          ) : null}
        </div>
      ) : isBrowsing ? (
        <div className="search-browse" aria-busy={isBrowseLoading || isForYouLoading || !hasOpenedBrowse}>
          {isBrowseLoading || !hasOpenedBrowse ? <p className="inline-status">Cargando para explorar...</p> : null}
          {topCinerianTitles.length ? (
            <BrowseTitleRail
              title="Top Cinerian"
              description="Ranking global segun las puntuaciones de la comunidad"
              eyebrow="La comunidad"
              items={topCinerianTitles}
              onOpen={openMediaDetails}
              ranked
            />
          ) : null}
          {isForYouLoading ? (
            <section className="search-browse__section search-browse__section--pending">
              <div className="search-browse__heading">
                <div>
                  <p className="section-eyebrow">Elegido para vos</p>
                  <h2>Para vos</h2>
                </div>
              </div>
              <p className="inline-status">Buscando títulos parecidos a los que te gustaron...</p>
            </section>
          ) : forYouTitles.length ? (
            <BrowseTitleRail
              title="Para vos"
              description="Historias similares a las que te encantaron y te gustaron"
              eyebrow="Elegido para vos"
              items={forYouTitles}
              onOpen={openMediaDetails}
              ranked
              showTmdbScore
            />
          ) : null}
          {trendingTitles.length ? (
            <BrowseTitleRail
              title="En tendencia"
              description="Lo que esta dando que hablar esta semana"
              items={trendingTitles}
              onOpen={openMediaDetails}
            />
          ) : null}
          {upcomingTitles.length ? (
            <BrowseTitleRail
              title="Proximos estrenos"
              description="Novedades que llegan muy pronto"
              items={upcomingTitles}
              onOpen={openMediaDetails}
            />
          ) : null}
          {featuredTalent.length ? (
            <section className="search-browse__section">
              <div className="search-browse__heading">
                <div>
                  <p className="section-eyebrow">Talentos</p>
                  <h2>Personas destacadas</h2>
                  <p>Actores y directores para seguir explorando</p>
                </div>
              </div>
              <div className="search-browse__talent-rail">
                {featuredTalent.map((talent) => (
                  <button
                    className="search-browse__talent"
                    key={talent.id}
                    type="button"
                    onClick={() => setActiveTalent(talent)}
                  >
                    <img src={talent.profileUrl ?? "/images/base.png"} alt={talent.name} />
                    <strong>{talent.name}</strong>
                    <span>{talent.knownForTitles[0] ?? talent.knownForDepartment}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {genreRails.map((rail) => (
            <BrowseTitleRail
              key={rail.id}
              title={rail.title}
              description={rail.description}
              items={rail.items}
              onOpen={openMediaDetails}
            />
          ))}
        </div>
      ) : null}

      <WatchReviewModal
        item={reviewItem}
        isSaving={isSyncing}
        initialReaction={reviewInitialReaction}
        topAlignedOnMobile
        onClose={() => {
          setReviewItem(null);
          setReviewInitialReaction(null);
        }}
        onSubmit={(input) => void handleReviewSubmit(input)}
      />
      <SendRecommendationModal
        userId={userId}
        item={sendItem}
        onClose={() => setSendItem(null)}
      />
      <TalentDetailsModal item={activeTalent} userId={userId} onClose={() => setActiveTalent(null)} />
    </section>
  );
}

function BrowseTitleRail({
  title,
  description,
  items,
  onOpen,
  eyebrow = "Para explorar",
  ranked = false,
  showTmdbScore = false
}: {
  title: string;
  description: string;
  items: DiscoveryItem[];
  onOpen: (item: DiscoveryItem) => void;
  eyebrow?: string;
  ranked?: boolean;
  showTmdbScore?: boolean;
}) {
  return (
    <section className="search-browse__section">
      <div className="search-browse__heading">
        <div>
          <p className="section-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="search-browse__rail">
        {items.map((item, index) => (
          <button
            className={`search-browse__title${ranked ? " search-browse__title--ranked" : ""}`}
            key={`${item.mediaType}-${item.id}`}
            type="button"
            onClick={() => onOpen(item)}
          >
            <div className="search-browse__poster-wrap">
              <img src={item.posterUrl} alt={item.title} />
            </div>
            {ranked ? (
              <span className="search-browse__rank">
                {index + 1}
                <sup>°</sup>
              </span>
            ) : null}
            <strong>{item.title}</strong>
            <span>{item.year}{showTmdbScore ? ` · TMDB ${item.score.toFixed(1)}` : ""}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
