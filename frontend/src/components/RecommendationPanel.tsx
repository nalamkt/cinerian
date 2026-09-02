import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { demoDiscovery } from "../data/demoData";
import { createFeedPost } from "../lib/feed";
import {
  fetchStoredReactions,
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
};

const OVERVIEW_PREVIEW_LENGTH = 180;

/**
 * Tope de paginas que pedimos al armar el mazo. Cada pagina ya escanea varias
 * de TMDB por dentro, asi que esto alcanza de sobra; esta para que un usuario
 * con muchisimo historial no dispare pedidos sin fin.
 */
const MAX_DECK_PAGES = 20;
const EMPTY_WATCH: WatchOptions = { flatrate: [], hasRentOrBuy: false, link: null };

function truncateOverview(text: string, maxLength = OVERVIEW_PREVIEW_LENGTH) {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }

  const sliced = text.slice(0, maxLength);
  const safeSlice = sliced.includes(" ") ? sliced.slice(0, sliced.lastIndexOf(" ")) : sliced;
  return { text: `${safeSlice.trim()}…`, truncated: true };
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

function initialFor(watcher: Watcher) {
  return (watcher.displayName || watcher.username || "?").trim().charAt(0).toUpperCase();
}

export function RecommendationPanel({ userId }: RecommendationPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  // Arranca vacio a proposito: demoDiscovery es el respaldo para cuando faltan
  // las claves de TMDB, no un estado inicial. Usarlo como tal hacia que se
  // pintara Interstellar por un instante antes de llegar las recomendaciones.
  const [filters, setFilters] = useState<DiscoverFilters>(NO_FILTERS);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isSavingFilters, setIsSavingFilters] = useState(false);
  const [areFiltersReady, setAreFiltersReady] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState<ProviderOption[]>([]);
  const [entries, setEntries] = useState<RankedRecommendation[]>([]);
  const [isLoadingDeck, setIsLoadingDeck] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const [spotlightDetails, setSpotlightDetails] = useState<MediaDetails | null>(null);
  const [watchOptions, setWatchOptions] = useState<WatchOptions>(EMPTY_WATCH);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

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

  const overviewPreview = useMemo(
    () => (spotlight ? truncateOverview(spotlight.overview) : { text: "", truncated: false }),
    [spotlight]
  );
  const socialLine = useMemo(
    () => (current ? buildSocialLine(current.watchers) : null),
    [current]
  );

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
    if (!areFiltersReady) {
      return;
    }

    let isMounted = true;
    setIsLoadingDeck(true);
    setEntries([]);
    setCurrentIndex(0);

    void fetchSocialRecommendations(userId, 1, 12, filters)
      .then((results) => {
        if (!isMounted) {
          return;
        }

        setEntries(results);
        setPage(1);
      })
      .catch(() => {
        if (isMounted) {
          setEntries(demoDiscovery.map((item) => ({ item, rank: null, watchers: [] })));
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
  }, [userId, filters, areFiltersReady]);

  useEffect(() => {
    // El guard va por isLoadingDeck y no por entries.length: si la primera
    // pagina viene vacia, igual hay que seguir buscando en las siguientes.
    if (isLoadingDeck || availableEntries.length >= 6 || page >= MAX_DECK_PAGES) {
      return;
    }

    const nextPage = page + 1;
    void fetchSocialRecommendations(userId, nextPage, 12, filters)
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
  }, [availableEntries.length, isLoadingDeck, page, userId, filters]);

  useEffect(() => {
    async function loadStoredReactions() {
      try {
        setStoredReactions(await fetchStoredReactions(userId));
      } catch {
        setSyncMessage("No pude sincronizar tus reacciones guardadas.");
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
      window.removeEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);
    };
  }, [userId]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [reactedKeys, entries]);

  function replaceStoredReaction(item: DiscoveryItem, reaction: StoredReaction["reaction"]) {
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
      return;
    }

    let isMounted = true;

    void Promise.all([
      getTitleDetails(spotlight.id, spotlight.mediaType),
      getWatchOptionsFor(spotlight.id, spotlight.mediaType, spotlight.title)
    ])
      .then(([details, watch]) => {
        if (!isMounted) {
          return;
        }

        setSpotlightDetails(details);
        setWatchOptions(watch);
      })
      .catch(() => {
        if (isMounted) {
          setSpotlightDetails(null);
          setWatchOptions(EMPTY_WATCH);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [spotlight]);

  function goNext() {
    if (!availableEntries.length) {
      return;
    }

    setCurrentIndex((value) => (value + 1) % availableEntries.length);
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

      replaceStoredReaction(target, reaction);
    } catch {
      setSyncMessage("No pude guardar esta reaccion.");
      return;
    } finally {
      setIsSyncing(false);
    }

    goNext();
  }

  async function handleApplyFilters(next: DiscoverFilters) {
    try {
      setIsSavingFilters(true);
      await saveDiscoverFilters(userId, next);
      setFilters(next);
      setIsFiltersOpen(false);
    } catch {
      setSyncMessage("No pude guardar los filtros.");
    } finally {
      setIsSavingFilters(false);
    }
  }

  function handleSave() {
    void registerReaction("watchlist");
  }

  function handleWatched() {
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
      replaceStoredReaction(reviewItem, watchedReaction);
      setReviewItem(null);
      if (spotlight && spotlight.id === reviewItem.id) {
        goNext();
      }
    } catch {
      setSyncMessage("No pude guardar tu reseña.");
    } finally {
      setIsSyncing(false);
    }
  }

  const genres = spotlightDetails?.genres.length ? spotlightDetails.genres : spotlight?.genres ?? [];
  const secondaryFacts = [
    spotlightDetails?.runtimeLabel,
    spotlight?.score ? `TMDB ${spotlight.score}` : null
  ].filter((fact): fact is string => Boolean(fact));

  const activeFilterCount = countActiveFilters(filters);
  const selectedProviders = providerCatalog.filter((provider) =>
    filters.providerIds.includes(provider.id)
  );

  return (
    <section className="discover">
      <div className="discover-filterbar">
        <div className="discover-filterbar__chips">
          {activeFilterCount === 0 ? (
            <span className="discover-filterbar__empty">Sin filtros</span>
          ) : (
            <>
              {filters.contentType === "all" ? null : (
                <span className="discover-chip discover-chip--plain">
                  {CONTENT_TYPE_LABEL[filters.contentType]}
                </span>
              )}
              {selectedProviders.map((provider) => (
                <span className="discover-chip" key={provider.id}>
                  {provider.logoUrl ? (
                    <img src={provider.logoUrl} alt="" className="discover-chip__logo" />
                  ) : null}
                  {provider.name}
                </span>
              ))}
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
          Filtros
          {activeFilterCount ? (
            <span className="discover-filterbar__count">{activeFilterCount}</span>
          ) : null}
        </button>
      </div>

      {spotlight && current ? (
        <article className="discover-card panel">
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

          <div className="discover-card__body" ref={bodyRef}>
            <p className={`discover-rank ${current.rank === null ? "is-filler" : ""}`}>
              {current.rank === null ? "Popular ahora" : `${current.rank}° en tu ranking`}
              <span>
                {" · "}
                {spotlight.mediaType === "tv" ? "Serie" : "Película"}
                {spotlight.year ? ` · ${spotlight.year}` : ""}
              </span>
            </p>

            <h2 className="discover-title">{spotlight.title}</h2>

            {socialLine ? (
              <div className="discover-social">
                <div className="discover-social__faces">
                  {socialLine.faces.map((watcher) => (
                    <span
                      key={watcher.id}
                      className="discover-social__face"
                      title={watcher.displayName}
                    >
                      {watcher.avatarUrl ? (
                        <img src={watcher.avatarUrl} alt="" />
                      ) : (
                        initialFor(watcher)
                      )}
                    </span>
                  ))}
                </div>
                <p>
                  A <strong>{socialLine.first.displayName}</strong>
                  {socialLine.others} {socialLine.verb}
                </p>
              </div>
            ) : null}

            {genres.length ? <p className="discover-facts">{genres.join(" · ")}</p> : null}
            {secondaryFacts.length ? (
              <p className="discover-facts discover-facts--quiet">{secondaryFacts.join(" · ")}</p>
            ) : null}

            {watchOptions.flatrate.length || watchOptions.hasRentOrBuy ? (
              <div className="discover-watch">
                <p className="discover-watch__label">Ver ahora en</p>
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
                      {provider.name}
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
              <p className={isOverviewOpen ? undefined : "discover-overview__text--clamped"}>
                {spotlight.overview}
              </p>
              {overviewPreview.truncated ? (
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

          <div className="discover-actions">
            <div className="discover-action">
              <button
                type="button"
                className="discover-action__button"
                onClick={handleSkip}
                disabled={isSyncing}
                aria-label="Ignorar"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <span className="discover-action__label">Ignorar</span>
            </div>

            <div className="discover-action">
              <button
                type="button"
                className="discover-action__button"
                onClick={handleWatched}
                disabled={isSyncing}
                aria-label="Ya la vi"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              </button>
              <span className="discover-action__label">Ya la vi</span>
            </div>

            <div className="discover-action">
              <button
                type="button"
                className="discover-action__button"
                onClick={handleSave}
                disabled={isSyncing}
                aria-label="Guardar en watchlist"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
                </svg>
              </button>
              <span className="discover-action__label">Guardar</span>
            </div>
          </div>
        </article>
      ) : (
        <div className="discover-card panel">
          <div className="empty-like-state">
            {isLoadingDeck ? "Armando tu ranking…" : "Buscando mas titulos para recomendarte…"}
          </div>
        </div>
      )}

      {syncMessage ? <div className="inline-status">{syncMessage}</div> : null}

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
