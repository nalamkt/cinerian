import { useEffect, useMemo, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { SendRecommendationModal } from "./SendRecommendationModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { demoDiscovery } from "../data/demoData";
import { createFeedPost } from "../lib/feed";
import {
  fetchStoredReactions,
  REACTIONS_UPDATED_EVENT,
  saveStoredReaction,
  type StoredReaction
} from "../lib/reactions";
import { buildWatchedPostBody } from "../lib/reviews";
import { getRecommendationTitlesByPage, getSimilarTitles, getTitleDetails } from "../lib/tmdb";
import type { DiscoveryItem, MediaDetails } from "../types";

type RecommendationPanelProps = {
  userId: string;
};

function truncateOverview(text: string, maxLength = 150) {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }

  const sliced = text.slice(0, maxLength);
  const safeSlice = sliced.includes(" ") ? sliced.slice(0, sliced.lastIndexOf(" ")) : sliced;
  return {
    text: `${safeSlice.trim()}...`,
    truncated: true
  };
}

export function RecommendationPanel({ userId }: RecommendationPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [items, setItems] = useState<DiscoveryItem[]>(demoDiscovery);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const [spotlightDetails, setSpotlightDetails] = useState<MediaDetails | null>(null);
  const [sendItem, setSendItem] = useState<DiscoveryItem | null>(null);
  const [sendStatus, setSendStatus] = useState("Enviar");
  const [similarItems, setSimilarItems] = useState<DiscoveryItem[]>([]);

  const reactedIds = useMemo(() => storedReactions.map((entry) => entry.tmdbId), [storedReactions]);

  const availableItems = useMemo(() => {
    return items.filter((item) => !reactedIds.includes(item.id));
  }, [items, reactedIds]);

  const spotlight = availableItems.length
    ? availableItems[currentIndex % availableItems.length]
    : null;
  const overviewPreview = useMemo(
    () => (spotlight ? truncateOverview(spotlight.overview) : { text: "", truncated: false }),
    [spotlight]
  );

  useEffect(() => {
    void getRecommendationTitlesByPage(1)
      .then((results) => {
        if (results.length) {
          setItems(results);
          setPage(1);
        }
      })
      .catch(() => {
        setItems(demoDiscovery);
      });
  }, []);

  useEffect(() => {
    if (availableItems.length >= 6) {
      return;
    }

    if (!items.length) {
      return;
    }

    const nextPage = page + 1;
    void getRecommendationTitlesByPage(nextPage)
      .then((results) => {
        if (!results.length) {
          return;
        }

        setItems((current) => {
          const merged = [...current, ...results];
          return merged.filter(
            (item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index
          );
        });
        setPage(nextPage);
      })
      .catch(() => {
        // Keep current pool if a new page fails.
      });
  }, [availableItems.length, items.length, page]);

  useEffect(() => {
    async function loadStoredReactions() {
      try {
        const results = await fetchStoredReactions(userId);
        setStoredReactions(results);
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
  }, [reactedIds, items]);

  useEffect(() => {
    if (!spotlight) {
      setSpotlightDetails(null);
      setSimilarItems([]);
      return;
    }

    let isMounted = true;

    void Promise.all([
      getTitleDetails(spotlight.id, spotlight.mediaType),
      getSimilarTitles(spotlight.id, spotlight.mediaType)
    ])
      .then(([details, similar]) => {
        if (!isMounted) {
          return;
        }

        setSpotlightDetails(details);
        setSimilarItems(similar.filter((item) => item.id !== spotlight.id));
      })
      .catch(() => {
        if (isMounted) {
          setSpotlightDetails(null);
          setSimilarItems([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [spotlight]);

  function goNext() {
    if (!availableItems.length) {
      return;
    }

    setCurrentIndex((value) => (value + 1) % availableItems.length);
  }

  async function registerReaction(reaction: StoredReaction["reaction"], itemOverride?: DiscoveryItem) {
    const target = itemOverride ?? spotlight;
    if (!target) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({
        userId,
        item: target,
        reaction
      });

      if (reaction === "liked") {
        await createFeedPost({
          userId,
          postType: "watchlist",
          body: "La guardo en su Watchlist.",
          tmdbId: target.id,
          mediaType: target.mediaType
        });
      }

      setStoredReactions((current) => [
        { tmdbId: target.id, mediaType: target.mediaType, reaction },
        ...current.filter(
          (entry) =>
            !(
              entry.tmdbId === target.id &&
              entry.mediaType === target.mediaType &&
              (entry.reaction === reaction || entry.reaction === "disliked")
            )
        )
      ]);
    } catch {
      setSyncMessage("No pude guardar esta reaccion.");
      return;
    } finally {
      setIsSyncing(false);
    }

    goNext();
  }

  function handleLike() {
    void registerReaction("liked");
  }

  function handleShare() {
    if (!spotlight) {
      return;
    }

    setSendItem(spotlight);
  }

  function handleWatched() {
    setReviewItem(spotlight);
  }

  function handleSkip() {
    void registerReaction("disliked");
  }

  async function handleReviewSubmit(input: { liked: boolean; comment: string }) {
    if (!reviewItem) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({
        userId,
        item: reviewItem,
        reaction: "watched"
      });
      await createFeedPost({
        userId,
        postType: "rating",
        body: buildWatchedPostBody({
          item: reviewItem,
          liked: input.liked,
          comment: input.comment
        }),
        tmdbId: reviewItem.id,
        mediaType: reviewItem.mediaType
      });
      setStoredReactions((current) => [
        {
          tmdbId: reviewItem.id,
          mediaType: reviewItem.mediaType,
          reaction: "watched"
        },
        ...current.filter(
          (entry) =>
            !(
              entry.tmdbId === reviewItem.id &&
              entry.mediaType === reviewItem.mediaType &&
              (entry.reaction === "watched" || entry.reaction === "disliked")
            )
        )
      ]);
      setReviewItem(null);
      if (spotlight && spotlight.id === reviewItem.id) {
        goNext();
      }
      setSyncMessage("Tu reseña ya salió en el feed.");
    } catch {
      setSyncMessage("No pude guardar tu reseña.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="recommendation-shell">
      <div className="recommendation-main panel">
        <div className="recommendation-stage">
          {spotlight ? (
            <>
              <div className="recommendation-headline">
                <div>
                  <p className="meta-line">
                    {spotlight.mediaType === "tv" ? "Serie" : "Pelicula"} • {spotlight.year}
                  </p>
                  <h2>{spotlight.title}</h2>
                </div>
                <div className="recommendation-score">TMDB {spotlight.score}</div>
              </div>

              <article
                className="recommendation-card recommendation-card--interactive"
                onClick={() => openMediaDetails(spotlight)}
              >
                <span className="detail-poster__hint detail-poster__hint--card" aria-hidden="true">
                  Ver detalles
                </span>
                <img
                  src={spotlight.posterUrl}
                  alt={spotlight.title}
                  className="recommendation-card__image"
                />
              </article>

              <p className="recommendation-facts">
                {(spotlightDetails?.genres.length ? spotlightDetails.genres : spotlight.genres).join(" · ")}
                {spotlightDetails?.runtimeLabel
                  ? `${(spotlightDetails?.genres.length ? spotlightDetails.genres : spotlight.genres).length ? " · " : ""}${spotlightDetails.runtimeLabel}`
                  : ""}
              </p>

              {(spotlightDetails?.providers.length ? spotlightDetails.providers : spotlight.providers).length ? (
                <div className="token-row token-row--providers">
                  {(spotlightDetails?.providers.length ? spotlightDetails.providers : spotlight.providers).map((provider) => (
                    <span key={provider}>{provider}</span>
                  ))}
                </div>
              ) : null}

              <p className="recommendation-overview">
                {overviewPreview.text}{" "}
                {overviewPreview.truncated ? (
                  <button
                    type="button"
                    className="recommendation-overview__more"
                    onClick={() => openMediaDetails(spotlight)}
                  >
                    Ver más
                  </button>
                ) : null}
              </p>

              <div className="recommendation-actions">
                <button
                  type="button"
                  className="recommendation-action-button"
                  onClick={handleSkip}
                  disabled={isSyncing}
                  data-tooltip="Ignorar"
                  aria-label="Ignorar"
                >
                  <span aria-hidden="true">✕</span>
                </button>
                <button
                  type="button"
                  className="recommendation-action-button"
                  onClick={() => void handleShare()}
                  disabled={isSyncing}
                  data-tooltip={sendStatus}
                  aria-label="Enviar a un amigo"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21 3 10 14" />
                    <path d="m21 3-7 18-4-7-7-4 18-7Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="recommendation-action-button recommendation-action-button--primary"
                  onClick={handleWatched}
                  disabled={isSyncing}
                  data-tooltip="Ya la vi"
                  aria-label="Ya la vi"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="recommendation-action-button"
                  onClick={handleLike}
                  disabled={isSyncing}
                  data-tooltip="Guardar"
                  aria-label="Guardar en watchlist"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <div className="empty-like-state">
              Ya reaccionaste a toda esta tanda. Cuando ampliemos el pool de TMDB, aca vas a seguir
              descubriendo nuevas opciones.
            </div>
          )}

          {syncMessage ? <div className="inline-status">{syncMessage}</div> : null}

        </div>
      </div>

      <aside className="recommendation-side panel">
        <p className="section-eyebrow">Parecidas</p>
        <h2>Segui por aca</h2>

        <div className="recommendation-like-list">
          {similarItems.length ? (
            similarItems.map((item) => (
              <article className="liked-card" key={item.id}>
                <div className="detail-poster detail-poster--compact" onClick={() => openMediaDetails(item)}>
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="liked-card__poster liked-card__poster--interactive"
                  />
                  <span className="detail-poster__hint" aria-hidden="true">
                    Ver detalles
                  </span>
                </div>
                <div className="liked-card__copy">
                  <strong className="media-linklike" onClick={() => openMediaDetails(item)}>
                    {item.title}
                  </strong>
                  <p>
                    {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-like-state">
              Cuando TMDB traiga parecidas para este titulo, te las voy mostrando aca.
            </div>
          )}
        </div>
      </aside>

      <WatchReviewModal
        item={reviewItem}
        isSaving={isSyncing}
        onClose={() => setReviewItem(null)}
        onSubmit={(input) => void handleReviewSubmit(input)}
      />
      <SendRecommendationModal
        userId={userId}
        item={sendItem}
        onClose={() => setSendItem(null)}
        onSent={() => {
          setSendStatus("Enviado");
          window.setTimeout(() => setSendStatus("Enviar"), 1800);
        }}
      />
    </section>
  );
}
