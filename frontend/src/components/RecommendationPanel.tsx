import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CircleFriendAvatar, useMediaDetails } from "./MediaDetailsModal";
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
  onOpenUserProfile?: (profile: { userId: string; username?: string }) => void;
};

/**
 * Tope de paginas que pedimos al armar el mazo. Cada pagina ya escanea varias
 * de TMDB por dentro, asi que esto alcanza de sobra; esta para que un usuario
 * con muchisimo historial no dispare pedidos sin fin.
 */
const MAX_DECK_PAGES = 20;
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

function preloadPoster(posterUrl: string) {
  if (!posterUrl || typeof Image === "undefined") {
    return Promise.resolve();
  }

  const image = new Image();
  image.decoding = "async";
  image.src = posterUrl;
  if (typeof image.decode === "function") {
    return image.decode().catch(() => undefined);
  }

  return new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  });
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
    .then(([details, watchOptions]) => ({ details, watchOptions }))
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

export function RecommendationPanel({ userId, onOpenUserProfile }: RecommendationPanelProps) {
  const { openMediaDetails } = useMediaDetails();
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
  const [isLoadingDeck, setIsLoadingDeck] = useState(true);
  const [deckLoadError, setDeckLoadError] = useState(false);
  const [deckReloadKey, setDeckReloadKey] = useState(0);
  const [isInitialCardReady, setIsInitialCardReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
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

  const current = availableEntries.length
    ? availableEntries[currentIndex % availableEntries.length]
    : null;
  const spotlight = current?.item ?? null;
  const nextEntry = useMemo(() => {
    if (availableEntries.length < 2) {
      return null;
    }

    return availableEntries[(currentIndex + 1) % availableEntries.length] ?? null;
  }, [availableEntries, currentIndex]);
  const nextSpotlight = nextEntry?.item ?? null;
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

    void Promise.all([loadRecommendationPayload(nextSpotlight), preloadPoster(nextSpotlight.posterUrl)]).then(
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

    let isMounted = true;
    setIsLoadingDeck(true);
    setIsInitialCardReady(false);
    setDeckLoadError(false);
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

      if (!isMounted) {
        return;
      }

      setEntries(results);
      setPage(resolvedPage);
    })()
      .catch(() => {
        if (isMounted) {
          // Nunca mostramos el fallback a ciegas: si no pudimos armar el mazo
          // respetando reacciones, seria posible volver a ofrecer un titulo
          // que la persona acaba de pasar de largo.
          setEntries([]);
          setPage(1);
          setDeckLoadError(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingDeck(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId, filters, areFiltersReady, areReactionsReady, deckReloadKey]);

  useEffect(() => {
    // El guard va por isLoadingDeck y no por entries.length: si la primera
    // pagina viene vacia, igual hay que seguir buscando en las siguientes.
    if (isLoadingDeck || availableEntries.length >= 6 || page >= MAX_DECK_PAGES) {
      return;
    }

    const nextPage = page + 1;
    void fetchSocialRecommendations(userId, nextPage, 12, filters, storedReactions)
      .then((results) => {
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
        // Si falla una pagina, seguimos con el mazo que ya tenemos.
      });
  }, [availableEntries.length, isLoadingDeck, page, userId, filters, storedReactions]);

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
  useEffect(() => {
    const node = overviewRef.current;
    if (!node || isOverviewOpen) {
      return;
    }

    function measure() {
      const element = overviewRef.current;
      if (element) {
        setIsOverviewClamped(element.scrollHeight > element.clientHeight + 1);
      }
    }

    measure();

    // El corte depende del ancho disponible y de la fuente ya cargada: el
    // mismo texto pasa de entrar a no entrar al cambiar el tamaño de la
    // ventana.
    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => observer.disconnect();
  }, [spotlight, isOverviewOpen]);

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

    // El mazo visual existe solo en mobile. En desktop mantenemos el cambio
    // inmediato que ya tenia la vista, sin demorar la interaccion.
    if (!isCurrentCard || !isMobileDiscoverView() || !nextSpotlight) {
      return;
    }

    const [payload] = await Promise.all([
      loadRecommendationPayload(nextSpotlight),
      preloadPoster(nextSpotlight.posterUrl)
    ]);

    setNextPayload({ key: itemKey(nextSpotlight), payload });
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

      await animateCurrentCardOut(target);

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

  function handleWatchedPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
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
      void registerReaction(choice.reaction);
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

  function handleSave() {
    void registerReaction("watchlist");
  }

  function handleWatched() {
    if (suppressWatchedClickRef.current) {
      suppressWatchedClickRef.current = false;
      return;
    }

    setReviewItem(spotlight);
  }

  function handleSkip() {
    void registerReaction("ignored");
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
    Primero "año · géneros" y despues, en su propia linea, TMDB. La duracion
    (solo peliculas) se suma a la linea de TMDB — no la mostramos aparte
    porque no aporta jerarquia propia, pero tampoco la queremos perder.
  */
  const primaryFacts = [
    spotlight?.year || null,
    ...(genres.length ? [genres.join(" · ")] : [])
  ].filter((fact): fact is string => Boolean(fact));
  const scoreFacts = [
    spotlightDetails?.runtimeLabel,
    spotlight?.score ? `TMDB ${spotlight.score}` : null
  ].filter((fact): fact is string => Boolean(fact));

  const activeFilterCount = countActiveFilters(filters);
  const selectedProviders = providerCatalog.filter((provider) =>
    filters.providerIds.includes(provider.id)
  );
  const primaryProvider = selectedProviders[0] ?? null;
  const additionalProviderCount = Math.max(0, selectedProviders.length - 1);
  const isDiscoverBooting =
    !areFiltersReady || (!areReactionsReady && !reactionSyncError) || isLoadingDeck || !isInitialCardReady;

  return (
    <section className={`discover ${activeFilterCount ? "is-filtered" : ""}`}>
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
                    ) : null}
                    <span>{primaryProvider.name}</span>
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

        <button
          type="button"
          className="discover-filterbar__button"
          onClick={() => setIsFiltersOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          <span className="discover-filterbar__label">Filtros</span>
          {activeFilterCount ? (
            <span className="discover-filterbar__count">{activeFilterCount}</span>
          ) : null}
        </button>
      </div>

      {spotlight && current ? (
        <div className={`discover-card-stack${cardExitDirection ? " is-revealing-next" : ""}`}>
          {nextSpotlight && nextEntry && preparedNextPayload ? (
            <article className="discover-card panel discover-card--preview" aria-hidden="true">
              <div className="discover-card__stage">
                <div className="discover-card__poster">
                  <img src={nextSpotlight.posterUrl} alt="" />
                </div>

                <div className="discover-card__body">
                  {nextEntry.rank === null ? (
                    <p className="discover-rank discover-rank--outside">Fuera de tu círculo</p>
                  ) : (
                    <p className="discover-rank">{nextEntry.rank}° · en tu círculo</p>
                  )}

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
              onClick={() => openMediaDetails(spotlight)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openMediaDetails(spotlight);
                }
              }}
            >
              <img src={spotlight.posterUrl} alt={spotlight.title} />
              <span className="discover-card__poster-hint" aria-hidden="true">
                Ver detalles
              </span>
            </div>

            <div
              className={`discover-card__body ${hasMoreBelow ? "has-more-below" : ""}${
                isOverviewOpen ? " is-overview-open" : ""
              }`}
              ref={bodyRef}
            >
              {current.rank === null ? (
                <p className="discover-rank discover-rank--outside">Fuera de tu círculo</p>
              ) : (
                <p className="discover-rank">{current.rank}° · en tu círculo</p>
              )}

              <h2 className="discover-title">{spotlight.title}</h2>

              <p className="discover-kind">
                {spotlight.mediaType === "tv" ? "Serie" : "Película"}
              </p>

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
                    <span className="discover-circle__label">de tu círculo</span>
                  </div>
                </div>
              ) : current.rank === null ? (
                <p className="discover-circle-empty">
                  Nadie de tu círculo la vio todavía. La sumamos porque es popular ahora.
                </p>
              ) : null}

              {primaryFacts.length ? (
                <p className="discover-facts">{primaryFacts.join(" · ")}</p>
              ) : null}
              {scoreFacts.length ? (
                <p className="discover-facts discover-facts--quiet">{scoreFacts.join(" · ")}</p>
              ) : null}

              {watchOptions.flatrate.length || watchOptions.hasRentOrBuy ? (
                <div className="discover-watch">
                  <p className="discover-watch__label">Ver en</p>
                  <div className="discover-watch__row">
                    {watchOptions.flatrate.map((provider) => (
                      <a
                        key={provider.id}
                        className="discover-platform"
                        href={provider.url}
                        target="_blank"
                        rel="noreferrer"
                        title={`Buscar en ${provider.name}`}
                      >
                        {provider.logoUrl ? (
                          <img src={provider.logoUrl} alt="" className="discover-platform__logo" />
                        ) : null}
                        <span className="discover-platform__name">{provider.name}</span>
                      </a>
                    ))}
                    {watchOptions.hasRentOrBuy && watchOptions.link ? (
                      <a
                        className="discover-platform discover-platform--rent"
                        href={watchOptions.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Alquilar
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}

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

          <div className="discover-actions">
            <div className="discover-action">
              <button
                type="button"
                className="discover-action__button"
                onClick={handleSkip}
                disabled={isSyncing}
                aria-label="No me interesa"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <span className="discover-action__label">No me interesa</span>
            </div>

            <div
              className={`discover-action discover-action--primary${
                isQuickRateActive ? " is-quick-rate-active" : ""
              }`}
            >
              <button
                type="button"
                className="discover-action__button discover-action__button--primary"
                onClick={handleWatched}
                onPointerDown={handleWatchedPointerDown}
                onPointerMove={handleWatchedPointerMove}
                onPointerUp={handleWatchedPointerUp}
                onPointerCancel={handleWatchedPointerCancel}
                disabled={isSyncing}
                aria-label="Ya la vi"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              </button>
              <span className="discover-action__label">Ya la vi</span>
              {isQuickRateActive ? (
                <div className="discover-quick-rate" aria-hidden="true">
                  {QUICK_RATE_CHOICES.map((choice) => (
                    <span
                      className={`discover-quick-rate__target discover-quick-rate__target--${choice.direction}${
                        quickRateChoice?.reaction === choice.reaction ? " is-selected" : ""
                      }`}
                      key={choice.reaction}
                    >
                      <RatedReactionIcon reaction={choice.reaction} />
                      <strong>{choice.label}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="discover-action">
              <button
                type="button"
                className="discover-action__button"
                onClick={handleSave}
                disabled={isSyncing}
                aria-label="Me interesa, guardar en watchlist"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
                </svg>
              </button>
              <span className="discover-action__label">Me interesa</span>
            </div>
          </div>
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
