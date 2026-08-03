import { useEffect, useMemo, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { demoDiscovery } from "../data/demoData";
import { createFeedPost } from "../lib/feed";
import { shareMediaLink } from "../lib/share";
import {
  fetchStoredReactions,
  removeStoredLike,
  saveStoredReaction,
  type StoredReaction
} from "../lib/reactions";
import { buildWatchedPostBody } from "../lib/reviews";
import { getRecommendationTitlesByPage } from "../lib/tmdb";
import type { DiscoveryItem } from "../types";

type RecommendationPanelProps = {
  userId: string;
};

export function RecommendationPanel({ userId }: RecommendationPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [items, setItems] = useState<DiscoveryItem[]>(demoDiscovery);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);

  const likedIds = useMemo(
    () => storedReactions.filter((entry) => entry.reaction === "liked").map((entry) => entry.tmdbId),
    [storedReactions]
  );
  const reactedIds = useMemo(() => storedReactions.map((entry) => entry.tmdbId), [storedReactions]);

  const availableItems = useMemo(() => {
    return items.filter((item) => !reactedIds.includes(item.id));
  }, [items, reactedIds]);

  const spotlight = availableItems.length
    ? availableItems[currentIndex % availableItems.length]
    : null;
  const likedItems = useMemo(
    () => {
      const source = [...items, ...demoDiscovery];
      const unique = source.filter(
        (item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index
      );
      return unique.filter((item) => likedIds.includes(item.id));
    },
    [items, likedIds]
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
    void fetchStoredReactions(userId)
      .then((results) => {
        setStoredReactions(results);
      })
      .catch(() => {
        setSyncMessage("No pude sincronizar tus reacciones guardadas.");
      });
  }, [userId]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [reactedIds, items]);

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
          postType: "recommendation",
          body: `Le gusto ${target.title} y la guardo entre sus favoritas.`,
          tmdbId: target.id,
          mediaType: target.mediaType
        });
      }

      setStoredReactions((current) => [
        { tmdbId: target.id, mediaType: target.mediaType, reaction },
        ...current.filter((entry) => entry.tmdbId !== target.id)
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

  async function handleShare() {
    if (!spotlight) {
      return;
    }

    try {
      await shareMediaLink(spotlight);
      setSyncMessage("Listo para enviar.");
    } catch {
      setSyncMessage("No pude preparar el envio.");
    }
  }

  function handleWatched() {
    setReviewItem(spotlight);
  }

  function handleSkip() {
    void registerReaction("disliked");
  }

  async function handleMarkLikedAsWatched(item: DiscoveryItem) {
    setReviewItem(item);
  }

  async function handleRemoveLike(item: DiscoveryItem) {
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await removeStoredLike(userId, item);
      setStoredReactions((current) =>
        current.filter((entry) => !(entry.tmdbId === item.id && entry.reaction === "liked"))
      );
    } catch {
      setSyncMessage("No pude eliminar este like.");
    } finally {
      setIsSyncing(false);
    }
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
        ...current.filter((entry) => entry.tmdbId !== reviewItem.id)
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
                <img
                  src={spotlight.posterUrl}
                  alt={spotlight.title}
                  className="recommendation-card__image"
                />
              </article>

              <div className="token-row">
                {spotlight.genres.map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>

              <p className="recommendation-overview">{spotlight.overview}</p>

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
                  data-tooltip="Enviar"
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
          {isSyncing ? <div className="inline-status">Guardando reaccion...</div> : null}
        </div>
      </div>

      <aside className="recommendation-side panel">
        <p className="section-eyebrow">Tu watchlist</p>
        <h2>Lo que queres ver despues</h2>

        <div className="recommendation-like-list">
          {likedItems.length ? (
            likedItems.map((item) => (
              <article className="liked-card" key={item.id}>
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  className="liked-card__poster liked-card__poster--interactive"
                  onClick={() => openMediaDetails(item)}
                />
                <div className="liked-card__copy">
                  <strong className="media-linklike" onClick={() => openMediaDetails(item)}>
                    {item.title}
                  </strong>
                  <p>
                    {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
                  </p>
                  <div className="liked-card__actions">
                    <button
                      type="button"
                      className="liked-card__action liked-card__action--primary"
                      onClick={() => void handleMarkLikedAsWatched(item)}
                    >
                      Ya la vi
                    </button>
                    <button
                      type="button"
                      className="liked-card__action"
                      onClick={() => void handleRemoveLike(item)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-like-state">
              Guarda algunos titulos y te los voy armando en tu <strong>Watchlist</strong>.
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
    </section>
  );
}
