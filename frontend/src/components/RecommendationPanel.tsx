import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent, type WheelEvent as ReactWheelEvent } from "react";
import { CircleFriendAvatar, useMediaDetails } from "./MediaDetailsModal";
import { DiscoverTrailerPlayer } from "./DiscoverTrailerPlayer";
import { DiscoverModeSwitch } from "./DiscoverModeSwitch";
import { DiscoverOverview } from "./DiscoverOverview";
import { DiscoverWatchOptions } from "./DiscoverWatchOptions";
import { WatchReviewModal } from "./WatchReviewModal";
import { LoadingState } from "./LoadingState";
import { RatedReactionIcon } from "./RatedReactionIcon";
import { createFeedPost, removeFeedEvent } from "../lib/feed";
import {
  fetchStoredReactions,
  getReactionSaveErrorMessage,
  REACTIONS_UPDATED_EVENT,
  saveStoredReaction,
  type RatedReaction,
  type StoredReaction
} from "../lib/reactions";
import { DiscoverFiltersModal } from "./DiscoverFiltersModal";
import {
  countActiveFilters,
  CONTENT_TYPE_LABEL,
  fetchDiscoverFilters,
  saveDiscoverFilters
} from "../lib/discoverFilters";
import { fetchSocialRecommendations, type RankedRecommendation, type Watcher } from "../lib/recommendations";
import { buildWatchedPostBody } from "../lib/reviews";
import { canFinishTrailerJourney, completesTrailerSwipe, moveTrailerCursor, shouldFetchMoreTrailerPages, shouldOpenTrailerInfo, shouldPlayDiscoverTrailer, splitTrailerTitleForBadge, trailerAvailability, trailerDragOffset, trailerEmptyPhase, type DiscoverMode } from "../lib/discoverTrailer";
import { advanceTrailerProgress, EMPTY_TRAILER_PROGRESS, parseTrailerProgress, serializeTrailerProgress, trailerProgressStorageKey, type TrailerProgress } from "../lib/trailerProgress";
import { readTrailerSoundPreference, saveTrailerSoundPreference } from "../lib/trailerPlayback";
import {
  getProviderCatalog,
  getTitleDetails,
  getWatchOptionsFor,
  NO_FILTERS,
  type DiscoverFilters,
  type ProviderOption,
  type WatchOptions
} from "../lib/tmdb";
import type { DiscoveryItem, MediaDetails } from "../types";

type RecommendationPanelProps = {
  userId: string;
  active: boolean;
  onOpenUserProfile?: (profile: { userId: string; username?: string }) => void;
};

/**
 * Tope de paginas que pedimos al armar el mazo. Cada pagina ya escanea varias
 * de TMDB por dentro, asi que esto alcanza de sobra; esta para que un usuario
 * con muchisimo historial no dispare pedidos sin fin.
 */
const MAX_DECK_PAGES = 20;
const CARD_PREFETCH_PAGES = 3;
const EMPTY_WATCH: WatchOptions = { flatrate: [], hasRentOrBuy: false, link: null };
const LONG_PRESS_MS = 420;
const QUICK_RATE_DISTANCE_PX = 34;
const SWIPE_EXIT_DURATION_MS = 280;

type SwipeDirection = "left" | "right" | "up";

type QuickRateChoice = {
  reaction: RatedReaction;
  direction: SwipeDirection;
  label: string;
};

type RecommendationPayload = {
  details: MediaDetails | null;
  watchOptions: WatchOptions;
};

const QUICK_RATE_CHOICES: QuickRateChoice[] = [
  { reaction: "disliked", direction: "left", label: "No me gustó" },
  { reaction: "superliked", direction: "up", label: "Me encantó" },
  { reaction: "liked", direction: "right", label: "Me gustó" }
];

const recommendationPayloadCache = new Map<string, Promise<RecommendationPayload>>();

function itemKey(item: Pick<DiscoveryItem, "id" | "mediaType">) {
  return `${item.mediaType}-${item.id}`;
}

function preloadImage(imageUrl: string) {
  if (!imageUrl || typeof Image === "undefined") {
    return Promise.resolve();
  }

  const image = new Image();
  image.decoding = "async";
  image.src = imageUrl;
  if (typeof image.decode === "function") {
    return image.decode().catch(() => undefined);
  }

  return new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  });
}

function preloadRecommendationArtwork(item: Pick<DiscoveryItem, "posterUrl" | "backdropUrl">) {
  // En mobile se muestra el backdrop y en escritorio el póster. Precargamos
  // ambos para que el cambio de tarjeta nunca mezcle datos nuevos con el arte
  // del título anterior mientras Safari resuelve el nuevo src.
  return Promise.all(
    [item.posterUrl, item.backdropUrl]
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl))
      .map(preloadImage)
  ).then(() => undefined);
}

function loadRecommendationPayload(item: DiscoveryItem) {
  const key = itemKey(item);
  const cached = recommendationPayloadCache.get(key);
  if (cached) {
    return cached;
  }

  const request = Promise.all([
    getTitleDetails(item.id, item.mediaType),
    getWatchOptionsFor(item.id, item.mediaType, item.title)
  ])
    .then(([details, watchOptions]) => {
      if (!details || details.trailerLookupComplete === false) recommendationPayloadCache.delete(key);
      return { details, watchOptions };
    })
    .catch(() => {
      // Una falla transitoria no merece dejar la ficha inutilizable durante
      // toda la sesion: el proximo intento vuelve a pedir sus datos.
      recommendationPayloadCache.delete(key);
      return { details: null, watchOptions: EMPTY_WATCH };
    });

  recommendationPayloadCache.set(key, request);
  return request;
}

function getQuickRateChoice(deltaX: number, deltaY: number) {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (Math.max(horizontalDistance, verticalDistance) < QUICK_RATE_DISTANCE_PX) {
    return null;
  }

  if (deltaY < 0 && verticalDistance > horizontalDistance) {
    return QUICK_RATE_CHOICES[1];
  }

  if (horizontalDistance >= verticalDistance && deltaX < 0) {
    return QUICK_RATE_CHOICES[0];
  }

  return horizontalDistance >= verticalDistance && deltaX > 0 ? QUICK_RATE_CHOICES[2] : null;
}

function waitForSwipeExit() {
  if (
    typeof window === "undefined" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, SWIPE_EXIT_DURATION_MS);
  });
}

function waitForNextPaint() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  // Dos frames garantizan que React llegue a montar la tarjeta de respaldo
  // antes de empezar a mover la tarjeta que el usuario esta viendo.
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function isMobileDiscoverView() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches;
}

/**
 * "A Isidoro y 2 mas les gusto" — solo cuenta a quienes les gusto o les encanto.
 *
 * Si al menos uno lo amo, el verbo sube a "le encanto": es la señal mas fuerte
 * que tenemos para mostrar y seria una lastima aplanarla a "le gusto".
 */
function buildSocialLine(watchers: Watcher[]) {
  const positive = watchers.filter((watcher) => watcher.reaction !== "disliked");
  if (!positive.length) {
    return null;
  }

  const loved = positive.some((watcher) => watcher.reaction === "superliked");
  const [first, ...rest] = positive;
  const verb = loved
    ? positive.length === 1
      ? "le encantó"
      : "les encantó"
    : positive.length === 1
      ? "le gustó"
      : "les gustó";
  const others = rest.length ? ` y ${rest.length} más` : "";
  return { first, others, verb, faces: positive.slice(0, 3) };
}

function DiscoverCircleRank({ rank, inside, className = "" }: { rank: number | null; inside: boolean; className?: string }) {
  return <p className={`discover-rank${rank === null && !inside ? " discover-rank--outside" : ""}${className ? ` ${className}` : ""}`}>
    {rank !== null ? `${rank}° · en tu círculo` : inside ? "en tu círculo" : "Fuera de tu círculo"}
  </p>;
}

export function RecommendationPanel({ userId, active, onOpenUserProfile }: RecommendationPanelProps) {
  const { openMediaDetails, isMediaDetailsOpen } = useMediaDetails();
  // Arranca vacio a proposito: demoDiscovery es el respaldo para cuando faltan
  // las claves de TMDB, no un estado inicial. Usarlo como tal hacia que se
  // pintara Interstellar por un instante antes de llegar las recomendaciones.
  const [filters, setFilters] = useState<DiscoverFilters>(NO_FILTERS);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isProviderSummaryOpen, setIsProviderSummaryOpen] = useState(false);
  const [isSavingFilters, setIsSavingFilters] = useState(false);
  const [areFiltersReady, setAreFiltersReady] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState<ProviderOption[]>([]);
  const [entries, setEntries] = useState<RankedRecommendation[]>([]);
  const [entriesScope, setEntriesScope] = useState<string | null>(null);
  const [isLoadingDeck, setIsLoadingDeck] = useState(true);
  const [deckLoadError, setDeckLoadError] = useState(false);
  const [deckReloadKey, setDeckReloadKey] = useState(0);
  const [isInitialCardReady, setIsInitialCardReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  // La app siempre abre en Tráilers; el modo elegido solo dura la sesión.
  const [discoverMode, setDiscoverMode] = useState<DiscoverMode>("trailers");
  const [trailerSoundEnabled, setTrailerSoundEnabled] = useState(() => {
    try { return readTrailerSoundPreference(window.localStorage, userId); }
    catch { return true; }
  });
  const [trailerHistory, setTrailerHistory] = useState<DiscoveryItem[]>([]);
  const [trailerHistoryIndex, setTrailerHistoryIndex] = useState<number | null>(null);
  const [isTrailerEnd, setIsTrailerEnd] = useState(false);
  const [trailerTransition, setTrailerTransition] = useState<{ next: DiscoveryItem; direction: "next" | "previous" } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ item: DiscoveryItem; direction: "next" | "previous" } | null>(null);
  const [isTrailerDragging, setIsTrailerDragging] = useState(false);
  const [isTrailerReturning, setIsTrailerReturning] = useState(false);
  const [trailerPayload, setTrailerPayload] = useState<{ key: string; payload: RecommendationPayload } | null>(null);
  const [trailerScan, setTrailerScan] = useState<{ items: DiscoveryItem[]; complete: boolean; failed: boolean }>({ items: [], complete: false, failed: false });
  const [progressState, setProgressState] = useState<{ scope: string; progress: TrailerProgress } | null>(null);
  const [trailerPageError, setTrailerPageError] = useState(false);
  const [pageRetryKey, setPageRetryKey] = useState(0);
  const [previewPayload, setPreviewPayload] = useState<{ key: string; payload: RecommendationPayload } | null>(null);
  const [blockedTrailerKeys, setBlockedTrailerKeys] = useState<Set<string>>(() => new Set());
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [page, setPage] = useState(1);
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const [areReactionsReady, setAreReactionsReady] = useState(false);
  const [reactionSyncError, setReactionSyncError] = useState(false);
  const [reactionReloadKey, setReactionReloadKey] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const [spotlightDetails, setSpotlightDetails] = useState<MediaDetails | null>(null);
  const [watchOptions, setWatchOptions] = useState<WatchOptions>(EMPTY_WATCH);
  const [nextPayload, setNextPayload] = useState<{
    key: string;
    payload: RecommendationPayload;
  } | null>(null);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [isOverviewClamped, setIsOverviewClamped] = useState(false);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const [isQuickRateActive, setIsQuickRateActive] = useState(false);
  const [quickRateChoice, setQuickRateChoice] = useState<QuickRateChoice | null>(null);
  const [cardExitDirection, setCardExitDirection] = useState<SwipeDirection | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<HTMLParagraphElement | null>(null);
  const providerSummaryRef = useRef<HTMLDivElement | null>(null);
  const reactionsRequestRef = useRef(0);
  const hasReactionSnapshotRef = useRef(false);
  const quickRateGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    timer: number | null;
    isActive: boolean;
    wasDragged: boolean;
  } | null>(null);
  const suppressWatchedClickRef = useRef(false);
  const trailerGestureStartRef = useRef<{ y: number; startedAt: number; offset: number; direction: "next" | "previous" | null; hasNeighbor: boolean } | null>(null);
  const suppressTrailerInfoClickUntilRef = useRef(0);
  const cardStackRef = useRef<HTMLDivElement>(null);
  const cardGestureRef = useRef<{ x: number; y: number; startedAt: number; delta: number; axis: "x" | "y" | null } | null>(null);
  const cardReturnTimerRef = useRef<number | null>(null);
  const isCardNavigatingRef = useRef(false);
  const suppressCardClickUntilRef = useRef(0);
  const [cardDrag, setCardDrag] = useState<"next" | "previous" | "returning" | null>(null);
  const trailerPaneRef = useRef<HTMLElement>(null);
  const lastTrailerNavigationRef = useRef(0);
  const trailerTransitionTimerRef = useRef<number | null>(null);
  const trailerReturnTimerRef = useRef<number | null>(null);
  const loadingPageRef = useRef<number | null>(null);
  const deckGenerationRef = useRef(0);
  const trailerAvailabilityCacheRef = useRef(new Map<string, ReturnType<typeof trailerAvailability>>());
  const trailerScanScopeRef = useRef("");
  const progressScope = trailerProgressStorageKey(userId, filters.contentType, filters.providerIds);
  const deckScope = `${progressScope}:${deckReloadKey}`;
  const trailerProgress = progressState?.scope === progressScope ? progressState.progress : null;

  useEffect(() => {
    let progress = EMPTY_TRAILER_PROGRESS;
    try { progress = parseTrailerProgress(window.localStorage.getItem(progressScope)); }
    catch { /* Se puede explorar aunque el almacenamiento no este disponible. */ }
    setProgressState({ scope: progressScope, progress });
  }, [progressScope]);

  function saveTrailerProgress(progress: TrailerProgress) {
    setProgressState({ scope: progressScope, progress });
    try { window.localStorage.setItem(progressScope, serializeTrailerProgress(progress)); }
    catch { /* La navegacion no depende de la persistencia local. */ }
  }

  useEffect(() => {
    const updateVisibility = () => setIsDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (!isProviderSummaryOpen) {
      return;
    }

    function closeWhenClickingOutside(event: PointerEvent) {
      if (!providerSummaryRef.current?.contains(event.target as Node)) {
        setIsProviderSummaryOpen(false);
      }
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProviderSummaryOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeWhenClickingOutside);
    document.addEventListener("keydown", closeWithEscape);

    return () => {
      document.removeEventListener("pointerdown", closeWhenClickingOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [isProviderSummaryOpen]);

  const reactedKeys = useMemo(
    () => new Set(storedReactions.map((entry) => `${entry.mediaType}-${entry.tmdbId}`)),
    [storedReactions]
  );

  const availableEntries = useMemo(
    () => entries.filter((entry) => !reactedKeys.has(`${entry.item.mediaType}-${entry.item.id}`)),
    [entries, reactedKeys]
  );
  const circleEntries = availableEntries;
  const eligibleTrailerItems = useMemo(() => trailerScan.items.filter((item) => !blockedTrailerKeys.has(itemKey(item))), [trailerScan.items, blockedTrailerKeys]);
  const unexploredTrailerItems = useMemo(() => {
    const visited = new Set(trailerProgress?.visitedKeys ?? []);
    return eligibleTrailerItems.filter((item) => !visited.has(itemKey(item)));
  }, [eligibleTrailerItems, trailerProgress]);

  useEffect(() => {
    if (discoverMode !== "trailers" || isLoadingDeck || entriesScope !== deckScope) return;
    let activeScan = true;
    if (trailerScanScopeRef.current !== deckScope) {
      trailerScanScopeRef.current = deckScope;
      trailerAvailabilityCacheRef.current.clear();
    }
    const cached = trailerAvailabilityCacheRef.current;
    const cachedItems = circleEntries.filter((entry) => cached.get(itemKey(entry.item)) === "playable").map((entry) => entry.item);
    setTrailerScan({ items: cachedItems, complete: false, failed: circleEntries.some((entry) => cached.get(itemKey(entry.item)) === "unknown") });
    void (async () => {
      const items: DiscoveryItem[] = [];
      let failed = false;
      for (const entry of circleEntries) {
        const key = itemKey(entry.item);
        let availability = cached.get(key);
        if (!availability) {
          const { details } = await loadRecommendationPayload(entry.item);
          if (!activeScan) return;
          availability = trailerAvailability(details);
          cached.set(key, availability);
        }
        if (!activeScan) return;
        if (availability === "playable") items.push(entry.item);
        if (availability === "unknown") failed = true;
        setTrailerScan({ items: [...items], complete: false, failed });
      }
      if (activeScan) setTrailerScan({ items, complete: true, failed });
    })();
    return () => { activeScan = false; };
  }, [circleEntries, discoverMode, isLoadingDeck, entriesScope, deckScope]);

  const current = circleEntries.length
    ? circleEntries[currentIndex % circleEntries.length]
    : null;
  const spotlight = current?.item ?? null;
  const nextEntry = useMemo(() => {
    if (circleEntries.length < 2) {
      return null;
    }

    return circleEntries[(currentIndex + 1) % circleEntries.length] ?? null;
  }, [circleEntries, currentIndex]);
  const nextSpotlight = nextEntry?.item ?? null;
  const shownTrailerItem = trailerHistoryIndex !== null
    ? trailerHistory[trailerHistoryIndex] ?? null
    : trailerProgress?.currentKey
      ? eligibleTrailerItems.find((item) => itemKey(item) === trailerProgress.currentKey) ??
        (page >= MAX_DECK_PAGES && trailerScan.complete ? unexploredTrailerItems[0] ?? null : null)
      : unexploredTrailerItems[0] ?? null;
  const trailerTitleParts = shownTrailerItem ? splitTrailerTitleForBadge(shownTrailerItem.title) : null;
  const isTrailerJourneyComplete = canFinishTrailerJourney({
    scanComplete: trailerScan.complete,
    page,
    maxPages: MAX_DECK_PAGES,
    pageFailed: trailerPageError,
    scanFailed: trailerScan.failed
  });

  useEffect(() => {
    if (!isTrailerEnd) return;
    const historyKeys = new Set(trailerHistory.map(itemKey));
    if (unexploredTrailerItems.some((item) => !historyKeys.has(itemKey(item)))) setIsTrailerEnd(false);
  }, [isTrailerEnd, trailerHistory, unexploredTrailerItems]);
  const badgeEntry = discoverMode === "trailers"
    ? entries.find((entry) => shownTrailerItem && itemKey(entry.item) === itemKey(shownTrailerItem))
    : current;
  const badgeInsideCircle = badgeEntry ? badgeEntry.rank !== null || Boolean(buildSocialLine(badgeEntry.watchers)) : false;
  const hasReactedToShownTrailer = shownTrailerItem ? reactedKeys.has(itemKey(shownTrailerItem)) : false;

  useEffect(() => {
    if (discoverMode !== "trailers" || !shownTrailerItem) return;
    let mounted = true;
    void preloadRecommendationArtwork(shownTrailerItem);
    const seen = new Set(trailerHistory.map(itemKey));
    seen.add(itemKey(shownTrailerItem));
    const upcoming = unexploredTrailerItems.find((item) => !seen.has(itemKey(item)));
    if (upcoming) {
      void preloadRecommendationArtwork(upcoming);
      void loadRecommendationPayload(upcoming).then((payload) => {
        if (mounted) setPreviewPayload({ key: itemKey(upcoming), payload });
      });
    }
    return () => { mounted = false; };
  }, [discoverMode, shownTrailerItem, trailerHistory, unexploredTrailerItems]);

  useEffect(() => {
    if (!shownTrailerItem || trailerHistoryIndex !== null || !trailerProgress?.historyKeys.length) return;
    const byKey = new Map(eligibleTrailerItems.map((item) => [itemKey(item), item]));
    const history = trailerProgress.historyKeys.map((key) => byKey.get(key)).filter((item): item is DiscoveryItem => Boolean(item));
    const index = history.findIndex((item) => itemKey(item) === itemKey(shownTrailerItem));
    if (index >= 0) { setTrailerHistory(history); setTrailerHistoryIndex(index); }
  }, [shownTrailerItem, trailerHistoryIndex, trailerProgress, eligibleTrailerItems]);

  const neighboringTrailerItem = trailerTransition?.next ?? dragPreview?.item ?? null;
  useEffect(() => {
    if (!neighboringTrailerItem) return;
    let mounted = true;
    const key = itemKey(neighboringTrailerItem);
    void Promise.all([loadRecommendationPayload(neighboringTrailerItem), preloadRecommendationArtwork(neighboringTrailerItem)]).then(([payload]) => {
      if (mounted) setPreviewPayload({ key, payload });
    });
    return () => { mounted = false; };
  }, [neighboringTrailerItem]);

  useEffect(() => {
    if (discoverMode !== "trailers" || !shownTrailerItem) return;
    let isMounted = true;
    const key = itemKey(shownTrailerItem);
    void loadRecommendationPayload(shownTrailerItem).then((payload) => {
      if (isMounted) setTrailerPayload({ key, payload });
    });
    return () => { isMounted = false; };
  }, [discoverMode, shownTrailerItem]);

  useEffect(() => {
    if (trailerTransitionTimerRef.current !== null) window.clearTimeout(trailerTransitionTimerRef.current);
    trailerTransitionTimerRef.current = null;
    setIsTrailerEnd(false);
    setTrailerHistory([]);
    setTrailerHistoryIndex(null);
    setTrailerTransition(null);
  }, [filters, deckReloadKey, userId]);

  useEffect(() => () => {
    if (trailerTransitionTimerRef.current !== null) window.clearTimeout(trailerTransitionTimerRef.current);
    if (trailerReturnTimerRef.current !== null) window.clearTimeout(trailerReturnTimerRef.current);
  }, []);

  const preparedNextPayload =
    nextSpotlight && nextPayload?.key === itemKey(nextSpotlight) ? nextPayload.payload : null;

  const socialLine = useMemo(
    () => (current ? buildSocialLine(current.watchers) : null),
    [current]
  );

  // La ficha siguiente se deja lista mientras la actual esta en pantalla. El
  // cache comparte estos pedidos con el efecto que pinta sus datos al avanzar.
  useEffect(() => {
    if (!nextSpotlight) {
      setNextPayload(null);
      return;
    }

    let isMounted = true;
    const key = itemKey(nextSpotlight);

    void Promise.all([loadRecommendationPayload(nextSpotlight), preloadRecommendationArtwork(nextSpotlight)]).then(
      ([payload]) => {
        if (isMounted) {
          setNextPayload({ key, payload });
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [nextSpotlight]);

  useEffect(() => {
    return () => {
      const gesture = quickRateGestureRef.current;
      if (gesture && gesture.timer !== null) {
        window.clearTimeout(gesture.timer);
      }
    };
  }, []);

  // Los filtros se cargan primero: armar el mazo sin ellos mostraria una tanda
  // que no los respeta y habria que descartarla al instante.
  useEffect(() => {
    let isMounted = true;
    setAreFiltersReady(false);

    void fetchDiscoverFilters(userId)
      .then((saved) => {
        if (isMounted) {
          setFilters(saved);
        }
      })
      .catch(() => {
        // Sin filtros guardados se muestra todo, que es el default.
      })
      .finally(() => {
        if (isMounted) {
          setAreFiltersReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  // El catalogo es solo para dibujar el logo de los chips de la barra.
  useEffect(() => {
    if (!filters.providerIds.length || providerCatalog.length) {
      return;
    }

    let isMounted = true;
    void getProviderCatalog().then((results) => {
      if (isMounted) {
        setProviderCatalog(results);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [filters.providerIds.length, providerCatalog.length]);

  useEffect(() => {
    if (!areFiltersReady || !areReactionsReady) {
      return;
    }

    const generation = ++deckGenerationRef.current;
    loadingPageRef.current = null;
    let isMounted = true;
    setIsLoadingDeck(true);
    setTrailerPageError(false);
    setIsInitialCardReady(false);
    setDeckLoadError(false);
    setEntriesScope(null);
    setEntries([]);
    setCurrentIndex(0);

    void (async () => {
      let results: RankedRecommendation[] = [];
      let resolvedPage = 1;

      // Una pagina puede quedar vacia aunque haya recomendaciones mas adelante
      // (por ejemplo, si toda la primera ya fue reaccionada). No mostramos el
      // estado vacio hasta recorrer el mazo disponible.
      for (let candidatePage = 1; candidatePage <= MAX_DECK_PAGES; candidatePage += 1) {
        results = await fetchSocialRecommendations(
          userId,
          candidatePage,
          12,
          filters,
          storedReactions
        );
        resolvedPage = candidatePage;
        if (results.length) {
          break;
        }
      }

      if (!isMounted || generation !== deckGenerationRef.current) {
        return;
      }

      setEntriesScope(deckScope);
      setEntries(results);
      setPage(resolvedPage);
    })()
      .catch(() => {
        if (isMounted && generation === deckGenerationRef.current) {
          // Nunca mostramos el fallback a ciegas: si no pudimos armar el mazo
          // respetando reacciones, seria posible volver a ofrecer un titulo
          // que la persona acaba de pasar de largo.
          setEntries([]);
          setEntriesScope(null);
          setPage(1);
          setDeckLoadError(true);
        }
      })
      .finally(() => {
        if (isMounted && generation === deckGenerationRef.current) {
          setIsLoadingDeck(false);
        }
      });

    return () => {
      isMounted = false;
      if (deckGenerationRef.current === generation) {
        deckGenerationRef.current += 1;
        loadingPageRef.current = null;
      }
    };
  }, [userId, filters, areFiltersReady, areReactionsReady, deckReloadKey, deckScope]);

  useEffect(() => {
    // El guard va por isLoadingDeck y no por entries.length: si la primera
    // pagina viene vacia, igual hay que seguir buscando en las siguientes.
    const needsMore = discoverMode === "trailers"
      ? Boolean(trailerProgress) && shouldFetchMoreTrailerPages({
        scanComplete: trailerScan.complete,
        unexploredCount: unexploredTrailerItems.length,
        hasCurrent: Boolean(shownTrailerItem),
        page,
        maxPages: MAX_DECK_PAGES,
        failed: trailerPageError
      })
      : circleEntries.length < 6 && page < CARD_PREFETCH_PAGES;
    if (entriesScope !== deckScope || isLoadingDeck || trailerPageError || !needsMore || page >= MAX_DECK_PAGES || loadingPageRef.current !== null) {
      return;
    }

    const nextPage = page + 1;
    const generation = deckGenerationRef.current;
    loadingPageRef.current = nextPage;
    void fetchSocialRecommendations(userId, nextPage, 12, filters, storedReactions)
      .then((results) => {
        if (generation !== deckGenerationRef.current) return;
        // La pagina avanza siempre, incluso si esta vino vacia: si no, el mazo
        // queda trabado pidiendo eternamente la misma tanda ya reaccionada.
        setPage(nextPage);

        if (!results.length) {
          return;
        }

        setEntries((currentEntries) => {
          const merged = [...currentEntries, ...results];
          return merged.filter(
            (entry, index, array) =>
              array.findIndex(
                (candidate) =>
                  candidate.item.id === entry.item.id &&
                  candidate.item.mediaType === entry.item.mediaType
              ) === index
          );
        });
      })
      .catch(() => {
        if (generation === deckGenerationRef.current && discoverMode === "trailers") setTrailerPageError(true);
      })
      .finally(() => {
        if (generation === deckGenerationRef.current) loadingPageRef.current = null;
      });
  }, [circleEntries.length, isLoadingDeck, page, userId, filters, storedReactions, discoverMode, trailerScan, unexploredTrailerItems.length, shownTrailerItem, trailerProgress, trailerPageError, pageRetryKey, entriesScope, deckScope]);

  useEffect(() => {
    let isMounted = true;
    hasReactionSnapshotRef.current = false;
    setAreReactionsReady(false);
    setReactionSyncError(false);
    setSyncMessage(null);
    setEntries([]);
    setCurrentIndex(0);
    setIsLoadingDeck(true);
    setIsInitialCardReady(false);
    setDeckLoadError(false);

    async function loadStoredReactions() {
      const requestId = ++reactionsRequestRef.current;

      try {
        const reactions = await fetchStoredReactions(userId);
        if (isMounted && requestId === reactionsRequestRef.current) {
          hasReactionSnapshotRef.current = true;
          setStoredReactions(reactions);
          setAreReactionsReady(true);
          setReactionSyncError(false);
        }
      } catch {
        if (isMounted && requestId === reactionsRequestRef.current) {
          if (hasReactionSnapshotRef.current) {
            setSyncMessage("No pude actualizar tus reacciones guardadas.");
            return;
          }

          // Sin un snapshot completo no sabemos qué títulos ya marcó la
          // persona. Mostrar el mazo en este punto puede repetirle una serie.
          setEntries([]);
          setIsLoadingDeck(false);
          setIsInitialCardReady(true);
          setReactionSyncError(true);
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
    window.addEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);

    return () => {
      isMounted = false;
      window.removeEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);
    };
  }, [userId, reactionReloadKey]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [reactedKeys, entries]);

  function replaceStoredReaction(item: DiscoveryItem, reaction: StoredReaction["reaction"]) {
    // Invalida una lectura iniciada antes del upsert para que no pise el
    // estado optimista con una respuesta vieja.
    reactionsRequestRef.current += 1;
    hasReactionSnapshotRef.current = true;
    setStoredReactions((currentReactions) => [
      { tmdbId: item.id, mediaType: item.mediaType, reaction, createdAt: new Date().toISOString() },
      ...currentReactions.filter(
        (entry) => !(entry.tmdbId === item.id && entry.mediaType === item.mediaType)
      )
    ]);
  }

  useEffect(() => {
    setIsOverviewOpen(false);
    // Sin esto la tarjeta siguiente arranca a mitad del texto de la anterior.
    bodyRef.current?.scrollTo({ top: 0 });

    if (!spotlight) {
      setSpotlightDetails(null);
      setWatchOptions(EMPTY_WATCH);
      if (!isLoadingDeck) {
        setIsInitialCardReady(true);
      }
      return;
    }

    let isMounted = true;

    void loadRecommendationPayload(spotlight)
      .then(({ details, watchOptions: nextWatchOptions }) => {
        if (!isMounted) {
          return;
        }

        setSpotlightDetails(details);
        setWatchOptions(nextWatchOptions);
      })
      .finally(() => {
        if (isMounted) {
          setIsInitialCardReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [spotlight, isLoadingDeck]);

  /*
    Mide si la sinopsis se corta DE VERDAD, en vez de adivinarlo por cantidad
    de caracteres: el recorte lo hace el CSS por LINEAS, asi que un texto de
    190 caracteres que entra en cuatro lineas no tiene nada que expandir y no
    debe mostrar el boton.

    Solo se mide plegado. Expandido no hay recorte que medir, y recalcular ahi
    daria "no se corta" y se llevaria puesto el "Ver menos".
  */
  /*
    Chequea si la sinopsis se corto para mostrar u ocultar el boton "Ver mas".
    Line-clamp en CSS la deja a 3 lineas en mobile y 4 en desktop; aca solo
    comparamos la altura natural contra la altura visible.
  */
  useLayoutEffect(() => {
    const overview = overviewRef.current;
    if (!overview || isOverviewOpen) {
      return;
    }

    /*
      Deteccion de recorte sincronica, dentro del useLayoutEffect: el browser
      NO pinta entre el start y el fin del effect, asi que puedo quitar la
      clase del clamp, medir la altura natural del elemento REAL, y restaurar
      la clase sin que el usuario vea ningun flash.

      Approaches anteriores fallaron:
      - scrollHeight > clientHeight: iOS Safari devuelve clientHeight recortado.
      - Clonar el <p>: heredaba el flex/overflow del padre y la medida era
        poco confiable.
      - Proxy off-DOM: no reproducia fielmente el flujo de texto porque los
        estilos computados no cubren todos los factores de line-wrap.

      Esta version mide el elemento REAL, en su contexto real, sin paint
      intermedio. Es lo mas fiel al DOM.
    */
    const CLAMPED_CLASS = "discover-overview__text--clamped";

    function measure() {
      const el = overviewRef.current;
      if (!el) {
        return;
      }

      const hadClamp = el.classList.contains(CLAMPED_CLASS);
      if (!hadClamp) {
        // Sin clamp no hay recorte posible.
        setIsOverviewClamped(false);
        return;
      }

      const clampedHeight = el.getBoundingClientRect().height;
      if (clampedHeight <= 0) {
        return;
      }

      try {
        el.classList.remove(CLAMPED_CLASS);
        // Forzar reflow sincronico leyendo una propiedad de layout.
        const naturalHeight = el.getBoundingClientRect().height;
        setIsOverviewClamped(naturalHeight > clampedHeight + 1);
      } finally {
        // Siempre restaurar la clase, incluso si algo falla.
        el.classList.add(CLAMPED_CLASS);
      }
    }

    // El `-webkit-line-clamp` recien afecta a `scrollHeight` despues del
    // primer paint. Si medimos sincronicamente al cambiar de tarjeta,
    // scrollHeight suele devolver == clientHeight y el boton "Ver mas" nunca
    // aparece aunque visualmente el texto este cortado. Diferimos la medicion
    // un par de frames para que el browser termine de aplicar el clamp.
    measure();
    const rafOne = window.requestAnimationFrame(() => {
      measure();
    });
    const rafTwo = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(measure);
    });
    /*
      Timeouts defensivos para la PRIMERA tarjeta: el browser puede haber
      arrancado sin la fuente cargada y los rAF corren antes de que el metric
      correcto este disponible. Re-medimos a 100, 300 y 600ms para capturar
      font loading tardio sin impactar performance.
    */
    const timeoutOne = window.setTimeout(measure, 100);
    const timeoutTwo = window.setTimeout(measure, 300);
    const timeoutThree = window.setTimeout(measure, 600);
    const observer = new ResizeObserver(measure);
    observer.observe(overview);

    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(measure).catch(() => {});
    }

    return () => {
      window.cancelAnimationFrame(rafOne);
      window.cancelAnimationFrame(rafTwo);
      window.clearTimeout(timeoutOne);
      window.clearTimeout(timeoutTwo);
      window.clearTimeout(timeoutThree);
      observer.disconnect();
    };
  }, [spotlight, spotlightDetails, isOverviewOpen, isInitialCardReady]);

  /*
    El degradado del fondo insinua que hay mas para scrollear, pero estaba
    puesto siempre: cuando no habia nada debajo igual oscurecia la ultima
    linea de la sinopsis. Ahora sigue la posicion real del scroll y desaparece
    al llegar al fondo.
  */
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) {
      return;
    }

    function update() {
      const element = bodyRef.current;
      if (element) {
        setHasMoreBelow(element.scrollTop + element.clientHeight < element.scrollHeight - 1);
      }
    }

    update();
    node.addEventListener("scroll", update, { passive: true });

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => {
      node.removeEventListener("scroll", update);
      observer.disconnect();
    };
    // Las plataformas y los generos llegan async: cada uno cambia el alto del
    // contenido sin que la caja cambie de tamaño, asi que hay que remedir.
  }, [spotlight, spotlightDetails, watchOptions, isOverviewOpen]);

  async function animateCurrentCardOut(target: DiscoveryItem) {
    const isCurrentCard =
      spotlight?.id === target.id && spotlight.mediaType === target.mediaType;

    if (!isCurrentCard || !nextSpotlight) {
      return;
    }

    const [payload] = await Promise.all([
      loadRecommendationPayload(nextSpotlight),
      preloadRecommendationArtwork(nextSpotlight)
    ]);

    setNextPayload({ key: itemKey(nextSpotlight), payload });

    // En escritorio no hay mazo visual, pero esperamos el arte igual: evita
    // que Safari conserve el póster previo mientras ya cambió la ficha.
    if (!isMobileDiscoverView()) {
      setSpotlightDetails(payload.details);
      setWatchOptions(payload.watchOptions);
      return;
    }

    await waitForNextPaint();

    setCardExitDirection("up");
    await waitForNextPaint();
    await waitForSwipeExit();
    setCardExitDirection(null);

    // La ficha que aparece ya tiene sus datos locales. Asi no muestra por un
    // instante el texto de la pelicula anterior mientras React cambia el mazo.
    setSpotlightDetails(payload.details);
    setWatchOptions(payload.watchOptions);
  }

  async function registerReaction(
    reaction: StoredReaction["reaction"],
    itemOverride?: DiscoveryItem
  ) {
    const target = itemOverride ?? spotlight;
    if (!target) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({ userId, item: target, reaction });

      if (reaction === "watchlist") {
        await createFeedPost({
          userId,
          postType: "watchlist",
          body: "La guardo en su Watchlist.",
          tmdbId: target.id,
          mediaType: target.mediaType
        });
      }

      if (discoverMode === "trailers") {
        const next = moveTrailerCursor({
          available: unexploredTrailerItems.filter((item) => itemKey(item) !== itemKey(target)),
          history: trailerHistory,
          index: trailerHistoryIndex,
          current: shownTrailerItem,
          direction: "next",
          key: itemKey
        });
        if (next) {
          setTrailerHistory((history) => history.length ? history : [target]);
          setTrailerHistoryIndex((index) => index ?? 0);
          startTrailerTransition(next, "next");
        } else {
          setTrailerHistory([]);
          setTrailerHistoryIndex(null);
        }
      } else {
        await animateCurrentCardOut(target);
      }

      replaceStoredReaction(target, reaction);
    } catch (error) {
      setCardExitDirection(null);
      setSyncMessage(getReactionSaveErrorMessage(error));
      return;
    } finally {
      setIsSyncing(false);
      setCardExitDirection(null);
    }
  }

  function clearQuickRateGesture() {
    const gesture = quickRateGestureRef.current;
    if (gesture && gesture.timer !== null) {
      window.clearTimeout(gesture.timer);
    }

    quickRateGestureRef.current = null;
    setIsQuickRateActive(false);
    setQuickRateChoice(null);
  }

  function releaseWatchedPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWatchedPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (
      event.pointerType !== "touch" ||
      isSyncing ||
      !window.matchMedia("(max-width: 680px)").matches
    ) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: null as number | null,
      isActive: false,
      wasDragged: false
    };

    gesture.timer = window.setTimeout(() => {
      if (quickRateGestureRef.current !== gesture) {
        return;
      }

      gesture.timer = null;
      gesture.isActive = true;
      setIsQuickRateActive(true);
      setQuickRateChoice(null);
    }, LONG_PRESS_MS);

    quickRateGestureRef.current = gesture;
  }

  function handleWatchedPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = quickRateGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (!gesture.isActive) {
      // Un arrastre comun no debe terminar abriendo el popup como si fuera un tap.
      if (Math.hypot(deltaX, deltaY) > 12) {
        if (gesture.timer !== null) {
          window.clearTimeout(gesture.timer);
          gesture.timer = null;
        }
        gesture.wasDragged = true;
      }
      return;
    }

    event.preventDefault();
    setQuickRateChoice(getQuickRateChoice(deltaX, deltaY));
  }

  function handleWatchedPointerUp(event: ReactPointerEvent<HTMLButtonElement>, item = spotlight) {
    const gesture = quickRateGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const choice = gesture.isActive
      ? getQuickRateChoice(event.clientX - gesture.startX, event.clientY - gesture.startY)
      : null;
    const wasQuickRate = gesture.isActive;
    const wasDragged = gesture.wasDragged;

    releaseWatchedPointer(event);
    clearQuickRateGesture();

    if (!wasQuickRate && !wasDragged) {
      return;
    }

    event.preventDefault();
    // El click sintetico llega despues de pointerup: lo consumimos para que un
    // gesto largo no abra el popup normal por accidente.
    suppressWatchedClickRef.current = true;
    window.setTimeout(() => {
      suppressWatchedClickRef.current = false;
    }, 0);
    if (choice) {
      void registerReaction(choice.reaction, item ?? undefined);
    }
  }

  function handleWatchedPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = quickRateGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    releaseWatchedPointer(event);
    clearQuickRateGesture();
  }

  /*
    Guarda sin cerrar el modal. Los chips de la barra necesitan poder sacar un
    filtro sin cambiar de contexto; el modal grande cierra por su lado.
  */
  async function persistFilters(next: DiscoverFilters) {
    try {
      setIsSavingFilters(true);
      await saveDiscoverFilters(userId, next);
      setIsInitialCardReady(false);
      setFilters(next);
    } catch {
      setSyncMessage("No pude guardar los filtros.");
    } finally {
      setIsSavingFilters(false);
    }
  }

  async function handleApplyFilters(next: DiscoverFilters) {
    await persistFilters(next);
    setIsFiltersOpen(false);
  }

  function handleRemoveProvider(providerId: number) {
    const nextIds = filters.providerIds.filter((id) => id !== providerId);
    if (nextIds.length === 0) {
      // Sin plataformas el summary desaparece: dejar el dropdown "abierto"
      // ensuciaba el estado la proxima vez que aparecia.
      setIsProviderSummaryOpen(false);
    }
    void persistFilters({ ...filters, providerIds: nextIds });
  }

  function handleClearContentType() {
    void persistFilters({ ...filters, contentType: "all" });
  }

  function handleSave(item = spotlight) {
    void registerReaction("watchlist", item ?? undefined);
  }

  function handleWatched(item = spotlight) {
    if (suppressWatchedClickRef.current) {
      suppressWatchedClickRef.current = false;
      return;
    }

    setReviewItem(item);
  }

  function startTrailerTransition(movement: { history: DiscoveryItem[]; index: number }, direction: "next" | "previous", offset = 0) {
    if (trailerTransitionTimerRef.current !== null) window.clearTimeout(trailerTransitionTimerRef.current);
    trailerPaneRef.current?.style.setProperty("--trailer-drag", `${offset}px`);
    setDragPreview(null);
    setIsTrailerDragging(false);
    setIsTrailerReturning(false);
    setTrailerTransition({ next: movement.history[movement.index], direction });
    trailerTransitionTimerRef.current = window.setTimeout(() => {
      saveTrailerProgress(advanceTrailerProgress(trailerProgress ?? EMPTY_TRAILER_PROGRESS, movement.history.map(itemKey), movement.index));
      setTrailerHistory(movement.history);
      setTrailerHistoryIndex(movement.index);
      setTrailerTransition(null);
      trailerPaneRef.current?.style.removeProperty("--trailer-drag");
      trailerTransitionTimerRef.current = null;
    }, 300);
  }

  function navigateTrailer(direction: "next" | "previous", offset = 0) {
    if (isSyncing || trailerTransition || !shownTrailerItem) return;
    const movement = moveTrailerCursor({
      available: unexploredTrailerItems,
      history: trailerHistory,
      index: trailerHistoryIndex,
      current: shownTrailerItem,
      direction,
      key: itemKey
    });
    if (!movement) {
      if (direction === "next" && isTrailerJourneyComplete) setIsTrailerEnd(true);
      return;
    }
    setIsTrailerEnd(false);
    startTrailerTransition(movement, direction, offset);
  }

  function showPreviousTrailer() {
    navigateTrailer("previous");
  }

  function showNextTrailer() {
    navigateTrailer("next");
  }

  function resetTrailerProgress() {
    if (trailerTransitionTimerRef.current !== null) window.clearTimeout(trailerTransitionTimerRef.current);
    trailerTransitionTimerRef.current = null;
    setTrailerTransition(null);
    setIsTrailerEnd(false);
    setTrailerHistory([]);
    setTrailerHistoryIndex(null);
    saveTrailerProgress(EMPTY_TRAILER_PROGRESS);
  }

  function handleTrailerWheel(event: ReactWheelEvent<HTMLElement>) {
    if ((event.target as Element).closest("button, a, input, select, textarea, iframe, .discover-overview p:not(.discover-overview__text--clamped)")) return;
    if (Math.abs(event.deltaY) < 100 || Date.now() - lastTrailerNavigationRef.current < 750) return;
    event.preventDefault();
    lastTrailerNavigationRef.current = Date.now();
    if (event.deltaY > 0) showNextTrailer();
    else showPreviousTrailer();
  }

  function cancelTrailerGesture() {
    trailerGestureStartRef.current = null;
    if (!trailerPaneRef.current) return;
    setIsTrailerDragging(false);
    setIsTrailerReturning(true);
    trailerPaneRef.current.style.setProperty("--trailer-drag", "0px");
    if (trailerReturnTimerRef.current !== null) window.clearTimeout(trailerReturnTimerRef.current);
    trailerReturnTimerRef.current = window.setTimeout(() => {
      setDragPreview(null);
      setIsTrailerReturning(false);
      trailerPaneRef.current?.style.removeProperty("--trailer-drag");
      trailerReturnTimerRef.current = null;
    }, 250);
  }

  function handleTrailerTouchStart(event: ReactTouchEvent<HTMLElement>) {
    if (event.touches.length !== 1 || isSyncing || trailerTransition ||
      (event.target as Element).closest("button, a, input, select, textarea, iframe, .discover-overview p:not(.discover-overview__text--clamped)")) return;
    if (trailerReturnTimerRef.current !== null) window.clearTimeout(trailerReturnTimerRef.current);
    setIsTrailerReturning(false);
    setDragPreview(null);
    event.currentTarget.style.removeProperty("--trailer-drag");
    trailerGestureStartRef.current = { y: event.touches[0].clientY, startedAt: Date.now(), offset: 0, direction: null, hasNeighbor: false };
  }

  function handleTrailerTouchMove(event: TouchEvent) {
    const start = trailerGestureStartRef.current;
    const pane = trailerPaneRef.current;
    if (!start || !pane || event.touches.length !== 1 || trailerTransition || isSyncing) return;
    const delta = event.touches[0].clientY - start.y;
    if (Math.abs(delta) < 8) return;
    const direction = delta < 0 ? "next" : "previous";
    event.preventDefault();
    suppressTrailerInfoClickUntilRef.current = Date.now() + 350;
    const movement = moveTrailerCursor({ available: eligibleTrailerItems, history: trailerHistory,
      index: trailerHistoryIndex, current: shownTrailerItem, direction, key: itemKey });
    if (direction !== start.direction) {
      setDragPreview(movement ? { item: movement.history[movement.index], direction } : null);
      setIsTrailerDragging(true);
    }
    start.direction = direction;
    start.hasNeighbor = Boolean(movement);
    start.offset = trailerDragOffset(delta, Boolean(movement));
    pane.style.setProperty("--trailer-drag", `${start.offset}px`);
  }

  useEffect(() => {
    const pane = trailerPaneRef.current;
    if (discoverMode !== "trailers" || !pane) return;
    const move = (event: TouchEvent) => handleTrailerTouchMove(event);
    pane.addEventListener("touchmove", move, { passive: false });
    return () => pane.removeEventListener("touchmove", move);
  }, [discoverMode, shownTrailerItem, trailerHistory, trailerHistoryIndex, eligibleTrailerItems, isSyncing, trailerTransition]);

  function handleTrailerTouchEnd() {
    const start = trailerGestureStartRef.current;
    trailerGestureStartRef.current = null;
    if (!start || !start.direction) return;
    if (start.direction === "next" && !start.hasNeighbor && start.offset < -15 && isTrailerJourneyComplete) {
      setIsTrailerEnd(true);
      cancelTrailerGesture();
      return;
    }
    if (Date.now() - lastTrailerNavigationRef.current < 750) { cancelTrailerGesture(); return; }
    const pane = trailerPaneRef.current;
    if (pane && completesTrailerSwipe(start.offset, Date.now() - start.startedAt, pane.clientHeight, start.hasNeighbor)) {
      lastTrailerNavigationRef.current = Date.now();
      navigateTrailer(start.direction, start.offset);
      return;
    }
    cancelTrailerGesture();
  }

  function clearCardDrag() {
    if (cardReturnTimerRef.current !== null) window.clearTimeout(cardReturnTimerRef.current);
    cardReturnTimerRef.current = null;
    cardStackRef.current?.style.removeProperty("--card-drag");
    setCardDrag(null);
  }

  function returnCardToPlace() {
    cardStackRef.current?.style.setProperty("--card-drag", "0px");
    setCardDrag("returning");
    if (cardReturnTimerRef.current !== null) window.clearTimeout(cardReturnTimerRef.current);
    cardReturnTimerRef.current = window.setTimeout(clearCardDrag, 250);
  }

  // Pasar de tarjeta sin valorarla, igual que deslizar en Tráilers.
  async function navigateCard(direction: "next" | "previous") {
    const length = circleEntries.length;
    if (isCardNavigatingRef.current || isSyncing || !spotlight || length < 2) {
      returnCardToPlace();
      return;
    }
    if (direction === "previous") {
      setCurrentIndex((index) => ((index % length) - 1 + length) % length);
      returnCardToPlace();
      return;
    }
    isCardNavigatingRef.current = true;
    try {
      await animateCurrentCardOut(spotlight);
      setCurrentIndex((index) => (index % length) + 1);
    } finally {
      isCardNavigatingRef.current = false;
      clearCardDrag();
    }
  }

  function handleCardTouchStart(event: ReactTouchEvent<HTMLElement>) {
    if (event.touches.length !== 1 || isSyncing || isCardNavigatingRef.current || circleEntries.length < 2 ||
      (event.target as Element).closest("button, a, input, select, textarea, .discover-overview p:not(.discover-overview__text--clamped)")) return;
    if (cardReturnTimerRef.current !== null) clearCardDrag();
    const touch = event.touches[0];
    cardGestureRef.current = { x: touch.clientX, y: touch.clientY, startedAt: Date.now(), delta: 0, axis: null };
  }

  useEffect(() => {
    const stack = cardStackRef.current;
    if (discoverMode !== "cards" || !stack) return;
    const move = (event: TouchEvent) => {
      const start = cardGestureRef.current;
      if (!start || event.touches.length !== 1) return;
      const deltaX = event.touches[0].clientX - start.x;
      const deltaY = event.touches[0].clientY - start.y;
      if (!start.axis) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
        start.axis = Math.abs(deltaY) > Math.abs(deltaX) ? "y" : "x";
      }
      if (start.axis !== "y") return;
      event.preventDefault();
      suppressCardClickUntilRef.current = Date.now() + 350;
      start.delta = deltaY;
      // Hacia abajo no hay tarjeta revelada debajo: el arrastre ofrece resistencia.
      stack.style.setProperty("--card-drag", `${deltaY < 0 ? deltaY : deltaY * 0.35}px`);
      setCardDrag(deltaY < 0 ? "next" : "previous");
    };
    stack.addEventListener("touchmove", move, { passive: false });
    return () => stack.removeEventListener("touchmove", move);
  }, [discoverMode, spotlight]);

  function handleCardTouchEnd() {
    const start = cardGestureRef.current;
    cardGestureRef.current = null;
    if (!start || start.axis !== "y" || !start.delta) return;
    const stack = cardStackRef.current;
    if (stack && completesTrailerSwipe(start.delta, Date.now() - start.startedAt, stack.clientHeight, true)) {
      void navigateCard(start.delta < 0 ? "next" : "previous");
      return;
    }
    returnCardToPlace();
  }

  async function handleReviewSubmit(input: { reaction: RatedReaction; comment: string }) {
    if (!reviewItem) {
      return;
    }

    const watchedReaction = input.reaction;

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({ userId, item: reviewItem, reaction: watchedReaction });
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
      await animateCurrentCardOut(reviewItem);
      replaceStoredReaction(reviewItem, watchedReaction);
    } catch (error) {
      setSyncMessage(getReactionSaveErrorMessage(error));
    } finally {
      setIsSyncing(false);
    }
  }

  const genres = spotlightDetails?.genres.length ? spotlightDetails.genres : spotlight?.genres ?? [];
  const nextGenres = preparedNextPayload?.details?.genres.length
    ? preparedNextPayload.details.genres
    : nextSpotlight?.genres ?? [];
  /*
    Ficha tecnica unificada: año, generos, duracion y rating en una sola
    linea. Antes estaba partida en dos — ojo salta entre renglones. El ★
    antes del rating le da peso sin necesidad del "TMDB".
  */
  const primaryFacts = [
    spotlight?.year || null,
    ...(genres.length ? [genres.join(" · ")] : []),
    spotlightDetails?.runtimeLabel || null,
    spotlight?.score ? `★ ${spotlight.score}` : null
  ].filter((fact): fact is string => Boolean(fact));

  const activeFilterCount = countActiveFilters(filters);
  const selectedProviders = providerCatalog.filter((provider) =>
    filters.providerIds.includes(provider.id)
  );
  const primaryProvider = selectedProviders[0] ?? null;
  const additionalProviderCount = Math.max(0, selectedProviders.length - 1);
  const isDiscoverBooting =
    !areFiltersReady || (!areReactionsReady && !reactionSyncError) || isLoadingDeck || !isInitialCardReady;
  const shownTrailerDetails = shownTrailerItem && trailerPayload?.key === itemKey(shownTrailerItem)
    ? trailerPayload.payload.details
    : null;
  const shownTrailerWatchOptions = shownTrailerItem && trailerPayload?.key === itemKey(shownTrailerItem)
    ? trailerPayload.payload.watchOptions : EMPTY_WATCH;
  const trailerDetailsReady = shownTrailerItem && trailerPayload?.key === itemKey(shownTrailerItem);
  const canPlayTrailer = shouldPlayDiscoverTrailer({
    active,
    documentVisible: isDocumentVisible,
    mode: discoverMode,
    detailsOpen: isMediaDetailsOpen,
    reviewOpen: Boolean(reviewItem),
    filtersOpen: isFiltersOpen,
    syncing: isSyncing || Boolean(trailerTransition)
  });

  function changeTrailerSound(enabled: boolean) {
    setTrailerSoundEnabled(enabled);
    try { saveTrailerSoundPreference(window.localStorage, userId, enabled); }
    catch { /* El estado de esta sesión sigue funcionando sin almacenamiento. */ }
  }

  function renderDiscoverActions(item: DiscoveryItem, trailer = false) {
    const disabled = isSyncing || (trailer && reactedKeys.has(itemKey(item)));
    return <div className="discover-actions">
      {!trailer && circleEntries.length > 1 ? (
        <button
          type="button"
          className="discover-swipe-hint"
          aria-label="Siguiente tarjeta"
          disabled={isSyncing}
          onClick={() => void navigateCard("next")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      ) : null}
      <div className="discover-action">
        <button type="button" className="discover-action__button" onClick={() => void registerReaction("ignored", item)} disabled={disabled} aria-label="No me interesa">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <span className="discover-action__label">No me interesa</span>
      </div>
      <div className={`discover-action discover-action--primary${isQuickRateActive ? " is-quick-rate-active" : ""}`}>
        <button type="button" className="discover-action__button discover-action__button--primary" onClick={() => handleWatched(item)}
          onPointerDown={handleWatchedPointerDown} onPointerMove={handleWatchedPointerMove}
          onPointerUp={(event) => handleWatchedPointerUp(event, item)} onPointerCancel={handleWatchedPointerCancel}
          disabled={disabled} aria-label="Ya la vi">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
          <span className="discover-action__button-label">Ya la vi</span>
        </button>
        <span className="discover-action__label">Ya la vi</span>
        {isQuickRateActive ? <div className="discover-quick-rate" aria-hidden="true">
          {QUICK_RATE_CHOICES.map((choice) => <span className={`discover-quick-rate__target discover-quick-rate__target--${choice.direction}${quickRateChoice?.reaction === choice.reaction ? " is-selected" : ""}`} key={choice.reaction}>
            <RatedReactionIcon reaction={choice.reaction} /><strong>{choice.label}</strong>
          </span>)}
        </div> : null}
      </div>
      <div className="discover-action">
        <button type="button" className="discover-action__button" onClick={() => handleSave(item)} disabled={disabled} aria-label="Guardar en Watchlist">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" /></svg>
        </button>
        <span className="discover-action__label">Guardar</span>
      </div>
    </div>;
  }

  return (
    <section className={`discover${activeFilterCount ? " is-filtered" : ""}${discoverMode === "trailers" ? " discover--trailers" : ""}`}>
      {reactionSyncError ? (
        <div className="discover-empty-state">
          <p className="section-eyebrow">Descubrí</p>
          <h2>No pudimos revisar tus reacciones</h2>
          <p>Para no mostrarte un título que ya marcaste, esperamos a recuperar tu historial.</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => setReactionReloadKey((value) => value + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : isDiscoverBooting ? (
        <div className="discover-loading-gate" role="status" aria-live="polite">
          <div className="discover-loading-gate__card">
            <p className="section-eyebrow">Descubrí</p>
            <LoadingState label="Armando tu ranking..." />
          </div>
        </div>
      ) : deckLoadError ? (
        <div className="discover-empty-state">
          <p className="section-eyebrow">Descubrí</p>
          <h2>No pudimos actualizar el catálogo ahora</h2>
          <p>Tus filtros siguen guardados. Volvé a intentarlo en un momento.</p>
          <button type="button" className="primary-button" onClick={() => setDeckReloadKey((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
      <div className="discover-filterbar">
        <div className="discover-filterbar__chips">
          {activeFilterCount === 0 ? null : (
            <>
              {filters.contentType === "all" ? null : (
                <span className="discover-chip discover-chip--plain">
                  {CONTENT_TYPE_LABEL[filters.contentType]}
                  <button
                    type="button"
                    className="discover-chip__remove"
                    onClick={handleClearContentType}
                    aria-label={`Quitar filtro ${CONTENT_TYPE_LABEL[filters.contentType]}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </span>
              )}
              {primaryProvider ? (
                <div className="discover-provider-summary" ref={providerSummaryRef}>
                  <button
                    type="button"
                    className="discover-chip discover-provider-summary__trigger"
                    aria-expanded={isProviderSummaryOpen}
                    aria-controls="discover-selected-providers"
                    onClick={() => setIsProviderSummaryOpen((current) => !current)}
                  >
                    {primaryProvider.logoUrl ? (
                      <img src={primaryProvider.logoUrl} alt="" className="discover-chip__logo" />
                    ) : <span className="discover-chip__logo-fallback" aria-hidden="true">{primaryProvider.name.charAt(0)}</span>}
                    <span className="discover-provider-summary__name">{primaryProvider.name}</span>
                    {additionalProviderCount ? <strong>+{additionalProviderCount}</strong> : null}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m7 10 5 5 5-5" />
                    </svg>
                  </button>

                  {isProviderSummaryOpen ? (
                    <div
                      className="discover-provider-summary__menu"
                      id="discover-selected-providers"
                      role="list"
                      aria-label="Plataformas seleccionadas"
                    >
                      {selectedProviders.map((provider) => (
                        <div
                          className="discover-provider-summary__item"
                          key={provider.id}
                          role="listitem"
                        >
                          {provider.logoUrl ? <img src={provider.logoUrl} alt="" /> : null}
                          <span className="discover-provider-summary__name">{provider.name}</span>
                          <button
                            type="button"
                            className="discover-chip__remove"
                            onClick={() => handleRemoveProvider(provider.id)}
                            aria-label={`Quitar ${provider.name} de los filtros`}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

      <DiscoverModeSwitch mode={discoverMode} disabled={isSyncing} onChange={(mode) => {
        if (trailerTransitionTimerRef.current !== null) window.clearTimeout(trailerTransitionTimerRef.current);
        trailerTransitionTimerRef.current = null;
        if (mode === "cards" && shownTrailerItem) {
          const index = circleEntries.findIndex((entry) => itemKey(entry.item) === itemKey(shownTrailerItem));
          if (index >= 0) setCurrentIndex(index);
        }
        setTrailerHistory([]);
        setTrailerHistoryIndex(null);
        setTrailerTransition(null);
        setDiscoverMode(mode);
      }} />

        <span
          className="discover-circle-badge"
          aria-label={
            badgeEntry?.rank != null
              ? `${badgeEntry.rank}° en tu círculo`
              : badgeInsideCircle ? "En tu círculo" : "Fuera de tu círculo"
          }
        >
          <span className="discover-circle-badge__dot" aria-hidden="true" />
          {badgeEntry?.rank != null ? (
            <span className="discover-circle-badge__rank">{badgeEntry.rank}° ·</span>
          ) : null}
          <span className="discover-circle-badge__full">{badgeInsideCircle ? "En tu círculo" : "Fuera de tu círculo"}</span>
          <span className="discover-circle-badge__compact" aria-hidden="true">{badgeInsideCircle ? "Tu círculo" : "Fuera del círculo"}</span>
        </span>

        <button
          type="button"
          className={`discover-filterbar__button${activeFilterCount ? " is-active" : ""}`}
          onClick={() => setIsFiltersOpen(true)}
          aria-label={activeFilterCount ? "Filtros activos, abrir filtros" : "Abrir filtros"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          <span className="discover-filterbar__label">Filtros</span>
        </button>
      </div>

      {discoverMode === "trailers" && shownTrailerItem && !isTrailerEnd ? (
        <article
          ref={trailerPaneRef}
          className={`discover-trailer${trailerTransition ? ` is-transitioning is-transitioning--${trailerTransition.direction}` : ""}${isTrailerDragging ? " is-dragging" : ""}${isTrailerReturning ? " is-returning" : ""}`}
          tabIndex={0}
          aria-label={`Descubrir ${shownTrailerItem.title}. Flechas arriba y abajo para navegar.`}
          onWheel={handleTrailerWheel}
          onTouchStart={handleTrailerTouchStart}
          onTouchEnd={handleTrailerTouchEnd}
          onTouchCancel={cancelTrailerGesture}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); showNextTrailer(); }
            if (event.key === "ArrowUp") { event.preventDefault(); showPreviousTrailer(); }
          }}
        >
          <div className="discover-trailer__stage">
          {trailerTransition || dragPreview ? <div className={`discover-trailer__preview discover-trailer__preview--${trailerTransition?.direction ?? dragPreview?.direction}`} aria-hidden="true">
            {(() => {
              const item = trailerTransition?.next ?? dragPreview?.item;
              return item ? <>
                <div className="discover-trailer__preview-media">
                  {item.backdropUrl || item.posterUrl ? <img src={item.backdropUrl || item.posterUrl} alt="" /> : null}
                </div>
                <div className="discover-trailer__preview-info">
                  <p className="section-eyebrow">{item.mediaType === "tv" ? "Serie" : "Película"}</p>
                  <strong>{item.title}</strong>
                  <p>{[item.year, ...(previewPayload?.key === itemKey(item) && previewPayload.payload.details?.genres.length ? previewPayload.payload.details.genres : item.genres), previewPayload?.key === itemKey(item) ? previewPayload.payload.details?.runtimeLabel : null].filter(Boolean).join(" · ")}</p>
                  <p className="discover-trailer__preview-overview">{previewPayload?.key === itemKey(item) ? previewPayload.payload.details?.overview || item.overview : item.overview}</p>
                  {previewPayload?.key === itemKey(item) && previewPayload.payload.watchOptions.flatrate.length ? <div className="discover-trailer__preview-providers">Ver en: {previewPayload.payload.watchOptions.flatrate.map((provider) => provider.name).join(" · ")}</div> : null}
                </div>
              </> : null;
            })()}
          </div> : null}
          <div className="discover-trailer__current">
          {!trailerDetailsReady ? (
            <div className="discover-trailer__preparing" role="status">
              {shownTrailerItem.posterUrl ? <img src={shownTrailerItem.posterUrl} alt="" /> : null}
              <span>Preparando tráiler...</span>
            </div>
          ) : (
            <DiscoverTrailerPlayer
              key={itemKey(shownTrailerItem)}
              title={shownTrailerItem.title}
              trailerUrl={shownTrailerDetails?.trailerUrl ?? null}
              posterUrl={shownTrailerItem.posterUrl}
              active={canPlayTrailer}
              soundEnabled={trailerSoundEnabled}
              onSoundEnabledChange={changeTrailerSound}
              onUnplayable={() => {
                const key = itemKey(shownTrailerItem);
                setBlockedTrailerKeys((current) => new Set(current).add(key));
                const next = unexploredTrailerItems.find((item) => itemKey(item) !== key);
                setTrailerHistory(next ? [next] : []);
                setTrailerHistoryIndex(next ? 0 : null);
              }}
            />
          )}
          <div className="discover-trailer__info"
            onClickCapture={(event) => {
              if (Date.now() < suppressTrailerInfoClickUntilRef.current) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onClick={(event) => {
              if (shouldOpenTrailerInfo(event.target as Element, Date.now() < suppressTrailerInfoClickUntilRef.current)) {
                openMediaDetails(shownTrailerItem);
              }
            }}>
            <DiscoverCircleRank rank={badgeEntry?.rank ?? null} inside={badgeInsideCircle} className="discover-trailer__circle" />
            <div className="discover-title-row">
              <h2 className="discover-title">{shownTrailerItem.title}</h2>
              <p className="discover-kind">{shownTrailerItem.mediaType === "tv" ? "Serie" : "Película"}</p>
              <h2 className="discover-title discover-trailer__title-mobile">
                {trailerTitleParts?.prefix ? `${trailerTitleParts.prefix} ` : ""}
                <span className="discover-trailer__title-tail">
                  {trailerTitleParts?.lastWord}{"\u00a0"}<span className="discover-kind">{shownTrailerItem.mediaType === "tv" ? "Serie" : "Película"}</span>
                </span>
              </h2>
            </div>
            <button type="button" className="discover-trailer__details" onClick={() => openMediaDetails(shownTrailerItem)}>Ver ficha</button>
            <p className="discover-facts">
              {[shownTrailerItem.year, ...(shownTrailerDetails?.genres.length ? shownTrailerDetails.genres : shownTrailerItem.genres), shownTrailerDetails?.runtimeLabel]
                .filter(Boolean).join(" · ")}
              {shownTrailerItem.score ? <span className="discover-trailer__score"> · ★ {shownTrailerItem.score}</span> : null}
            </p>
            <DiscoverWatchOptions options={shownTrailerWatchOptions} />
            <DiscoverOverview key={itemKey(shownTrailerItem)} text={shownTrailerDetails?.overview || shownTrailerItem.overview || "Todavía no hay sinopsis para este título."} />
          </div>
          </div>
          </div>
          <div className="discover-trailer__bottom">
            {trailerPageError ? <p className="discover-trailer__history-note">No pudimos cargar más títulos. <button type="button" onClick={() => { setTrailerPageError(false); setPageRetryKey((value) => value + 1); }}>Reintentar</button></p> : null}
            {!trailerPageError && trailerScan.failed && page >= MAX_DECK_PAGES ? <p className="discover-trailer__history-note">Algunos tráilers no se pudieron revisar. <button type="button" onClick={() => setDeckReloadKey((value) => value + 1)}>Reintentar</button></p> : null}
            {hasReactedToShownTrailer ? <p className="discover-trailer__history-note">Ya valoraste este título. Podés seguir explorando.</p> : null}
            {eligibleTrailerItems.length > 1 ? (
              <button
                type="button"
                className="discover-swipe-hint"
                aria-label="Siguiente tráiler"
                disabled={isSyncing}
                onClick={showNextTrailer}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            ) : null}
            {renderDiscoverActions(shownTrailerItem, true)}
            <div className="discover-trailer__navigation">
              <button type="button" disabled={trailerHistoryIndex === null || trailerHistoryIndex === 0 || isSyncing} onClick={showPreviousTrailer}>Anterior</button>
              <span>Deslizá para explorar sin valorar</span>
              <button type="button" disabled={isSyncing} onClick={showNextTrailer}>Siguiente</button>
            </div>
          </div>
        </article>
      ) : discoverMode === "trailers" ? (
        <div className="discover-empty-state" role="status">
          <p className="section-eyebrow">Tráilers</p>
          {isTrailerEnd || trailerEmptyPhase({ scanComplete: trailerScan.complete, page, maxPages: MAX_DECK_PAGES, failed: trailerPageError }) !== "loading" ? <>
            <h2>{trailerPageError || trailerScan.failed ? "No pudimos completar la búsqueda de tráilers" : "Terminaste este recorrido"}</h2>
            <p>{trailerPageError || trailerScan.failed ? "Algunas consultas fallaron. Podés reintentar sin cambiar tus filtros." : "No quedan títulos sin explorar en las recomendaciones revisadas para estos filtros."}</p>
            {trailerPageError ? <button type="button" className="primary-button" onClick={() => { setTrailerPageError(false); setPageRetryKey((value) => value + 1); }}>Reintentar</button> : null}
            {!trailerPageError && trailerScan.failed ? <button type="button" className="primary-button" onClick={() => setDeckReloadKey((value) => value + 1)}>Reintentar</button> : null}
            {isTrailerJourneyComplete && trailerProgress?.visitedKeys.length ? <button type="button" className="primary-button" onClick={resetTrailerProgress}>Volver a explorar</button> : null}
            {isTrailerEnd && shownTrailerItem ? <button type="button" className="discover-empty-state__back" onClick={() => setIsTrailerEnd(false)}>Volver al último título</button> : null}
          </> : <LoadingState label="Buscando tráilers disponibles..." />}
        </div>
      ) : spotlight && current ? (
        <div
          ref={cardStackRef}
          className={`discover-card-stack${cardExitDirection || cardDrag === "next" ? " is-revealing-next" : ""}${
            cardDrag ? " is-card-dragging" : ""
          }${cardDrag === "returning" ? " is-card-returning" : ""}`}
          onTouchStart={handleCardTouchStart}
          onTouchEnd={handleCardTouchEnd}
          onTouchCancel={handleCardTouchEnd}
        >
          {nextSpotlight && nextEntry && preparedNextPayload ? (
            <article className="discover-card panel discover-card--preview" aria-hidden="true">
              <div className="discover-card__stage">
                <div className="discover-card__poster">
                  <img src={nextSpotlight.posterUrl} alt="" />
                </div>

                <div className="discover-card__body">
                  {(() => {
                    const nextHasPositive = nextEntry.watchers.some(
                      (watcher) => watcher.reaction !== "disliked"
                    );
                    if (nextEntry.rank !== null) {
                      return <p className="discover-rank">{nextEntry.rank}° · en tu círculo</p>;
                    }
                    if (nextHasPositive) {
                      return <p className="discover-rank">en tu círculo</p>;
                    }
                    return <p className="discover-rank discover-rank--outside">Fuera de tu círculo</p>;
                  })()}

                  <h2 className="discover-title">{nextSpotlight.title}</h2>

                  <p className="discover-kind">
                    {nextSpotlight.mediaType === "tv" ? "Serie" : "Película"}
                  </p>

                  {(nextSpotlight.year || nextGenres.length) ? (
                    <p className="discover-facts">
                      {[nextSpotlight.year, ...(nextGenres.length ? [nextGenres.join(" · ")] : [])]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}

                  {preparedNextPayload.watchOptions.flatrate.length ||
                  preparedNextPayload.watchOptions.hasRentOrBuy ? (
                    <div className="discover-watch">
                      <p className="discover-watch__label">Ver en</p>
                      <div className="discover-watch__row">
                        {preparedNextPayload.watchOptions.flatrate.slice(0, 4).map((provider) => (
                          <span className="discover-platform" key={provider.id}>
                            {provider.logoUrl ? (
                              <img src={provider.logoUrl} alt="" className="discover-platform__logo" />
                            ) : null}
                            <span className="discover-platform__name">{provider.name}</span>
                          </span>
                        ))}
                        {preparedNextPayload.watchOptions.hasRentOrBuy ? (
                          <span className="discover-platform discover-platform--rent">Alquilar</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Reserva la misma fila que ocupan los controles reales. Sin
                  ella, el afiche previo se estiraba durante la transicion. */}
              <div className="discover-actions discover-actions--placeholder" aria-hidden="true" />
            </article>
          ) : null}

          <article
            className={`discover-card panel${
              cardExitDirection
                ? ` is-swipe-exiting is-swipe-exiting--${cardExitDirection}`
                : ""
            }`}
          >
          <div className="discover-card__stage">
            <div
              className="discover-card__poster"
              onClick={() => {
                if (Date.now() < suppressCardClickUntilRef.current) return;
                openMediaDetails(spotlight);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openMediaDetails(spotlight);
                }
              }}
            >
              {spotlight.backdropUrl ? (
                <picture key={itemKey(spotlight)}>
                  {/* En mobile preferimos el backdrop horizontal. Desktop
                     mantiene el poster vertical. Si TMDB no mando backdrop
                     para este titulo, cae al poster en ambos lados. */}
                  <source
                    media="(max-width: 680px)"
                    srcSet={spotlight.backdropUrl}
                  />
                  <img src={spotlight.posterUrl} alt={spotlight.title} />
                </picture>
              ) : (
                <img key={itemKey(spotlight)} src={spotlight.posterUrl} alt={spotlight.title} />
              )}
              <span className="discover-card__poster-hint" aria-hidden="true">
                Ver detalles
              </span>
              {/*
                Overlays mobile-only sobre el backdrop. En desktop el CSS los
                oculta y el ranking + TMDB viven adentro de la ficha como
                siempre. En mobile se eleva el ranking a la esquina inferior
                izquierda y TMDB a la inferior derecha.
              */}
              <span
                className={`discover-card__rank-overlay ${
                  current.rank === null && !socialLine ? "discover-card__rank-overlay--outside" : ""
                }`}
                aria-hidden="true"
              >
                {current.rank !== null
                  ? `${current.rank}° · En tu círculo`
                  : socialLine
                    ? "En tu círculo"
                    : "Fuera de tu círculo"}
              </span>
              {spotlight.score ? (
                <span className="discover-card__score-overlay" aria-hidden="true">
                  TMDB {spotlight.score}
                </span>
              ) : null}
            </div>

            <div
              className={`discover-card__body ${hasMoreBelow ? "has-more-below" : ""}${
                isOverviewOpen ? " is-overview-open" : ""
              }`}
              ref={bodyRef}
            >
              <DiscoverCircleRank rank={current.rank} inside={Boolean(socialLine)} />

              <div className="discover-title-row">
                <h2 className="discover-title">{spotlight.title}</h2>
                <p className="discover-kind">
                  {spotlight.mediaType === "tv" ? "Serie" : "Película"}
                </p>
              </div>

              {socialLine ? (
                <div className="discover-circle">
                  <div className="discover-circle__faces media-modal__friend-avatars">
                    {socialLine.faces.map((watcher) => (
                      <CircleFriendAvatar
                        key={watcher.id}
                        friend={watcher}
                        onOpenUserProfile={onOpenUserProfile}
                      />
                    ))}
                  </div>
                  <div className="discover-circle__copy">
                    <p>
                      A <strong>{socialLine.first.displayName}</strong>
                      {socialLine.others} {socialLine.verb}
                    </p>
                  </div>
                </div>
              ) : null}

              {primaryFacts.length ? (
                <p className="discover-facts">{primaryFacts.join(" · ")}</p>
              ) : null}

              <DiscoverWatchOptions options={watchOptions} />

              {/* Plegado, el texto se corta por CANTIDAD DE LINEAS y no por
                  caracteres: asi ocupa un alto conocido y el "Ver mas" siempre
                  entra sin scrollear. El scroll queda solo para el expandido. */}
              <div className="discover-overview">
                <p
                  ref={overviewRef}
                  className={isOverviewOpen ? undefined : "discover-overview__text--clamped"}
                  onClick={() => {
                    if (isOverviewClamped) {
                      setIsOverviewOpen((value) => !value);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (isOverviewClamped && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      setIsOverviewOpen((value) => !value);
                    }
                  }}
                  role={isOverviewClamped ? "button" : undefined}
                  tabIndex={isOverviewClamped ? 0 : undefined}
                  aria-expanded={isOverviewClamped ? isOverviewOpen : undefined}
                >
                  {spotlight.overview}
                </p>
                {isOverviewClamped ? (
                  <button
                    type="button"
                    className="discover-overview__more"
                    onClick={() => setIsOverviewOpen((value) => !value)}
                    aria-expanded={isOverviewOpen}
                  >
                    {isOverviewOpen ? "Ver menos" : "Ver más"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {renderDiscoverActions(spotlight)}
          </article>
        </div>
      ) : (
        <div className="discover-empty-state">
          <p className="section-eyebrow">Descubrí</p>
          <h2>No encontramos títulos con estos filtros</h2>
          <p>Probá ampliar tus plataformas o cambiar el tipo de contenido para seguir descubriendo.</p>
          <button type="button" className="primary-button" onClick={() => setIsFiltersOpen(true)}>
            Revisar filtros
          </button>
        </div>
      )}

      {syncMessage ? <div className="inline-status">{syncMessage}</div> : null}
        </>
      )}

      <DiscoverFiltersModal
        isOpen={isFiltersOpen}
        filters={filters}
        isSaving={isSavingFilters}
        onClose={() => setIsFiltersOpen(false)}
        onApply={(next) => void handleApplyFilters(next)}
      />

      <WatchReviewModal
        item={reviewItem}
        isSaving={isSyncing}
        onClose={() => setReviewItem(null)}
        onSubmit={(input) => void handleReviewSubmit(input)}
      />
    </section>
  );
}
