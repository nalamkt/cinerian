import { useEffect, useMemo, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { useDiscovery } from "../hooks/useDiscovery";
import { createFeedPost } from "../lib/feed";
import {
  fetchStoredReactions,
  REACTIONS_UPDATED_EVENT,
  removeStoredReaction,
  saveStoredReaction,
  type StoredReaction
} from "../lib/reactions";
import { buildWatchedPostBody } from "../lib/reviews";
import { SectionHeader } from "./SectionHeader";
import type { DiscoveryItem } from "../types";

type SearchPanelProps = {
  userId: string;
};

export function SearchPanel({ userId }: SearchPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [query, setQuery] = useState("");
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const { results, isLoading, error } = useDiscovery(query);

  useEffect(() => {
    async function loadStoredReactions() {
      try {
        const response = await fetchStoredReactions(userId);
        setStoredReactions(response);
      } catch {
        setSyncMessage("No pude sincronizar tus acciones guardadas.");
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

  const reactionMap = useMemo(
    () =>
      Object.fromEntries(
        storedReactions.map((entry) => [`${entry.mediaType}-${entry.tmdbId}`, entry.reaction] as const)
      ),
    [storedReactions]
  );

  async function handleReaction(item: DiscoveryItem, reaction: StoredReaction["reaction"]) {
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({
        userId,
        item,
        reaction
      });

      if (reaction === "liked") {
        await createFeedPost({
          userId,
          postType: "recommendation",
          body: `Le gusto ${item.title} y la guardo desde el buscador.`,
          tmdbId: item.id,
          mediaType: item.mediaType
        });
      }

      if (reaction === "watched") {
        await createFeedPost({
          userId,
          postType: "rating",
          body: `Marco ${item.title} como ya vista desde el buscador.`,
          tmdbId: item.id,
          mediaType: item.mediaType
        });
      }

      setStoredReactions((current) => [
        { tmdbId: item.id, mediaType: item.mediaType, reaction },
        ...current.filter(
          (entry) =>
            !(
              entry.tmdbId === item.id &&
              entry.mediaType === item.mediaType &&
              (entry.reaction === reaction || entry.reaction === "disliked")
            )
        )
      ]);
    } catch {
      setSyncMessage("No pude guardar esta accion.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleWatchedToggle(item: DiscoveryItem) {
    const key = `${item.mediaType}-${item.id}`;
    const isWatched = reactionMap[key] === "watched";

    try {
      setIsSyncing(true);
      setSyncMessage(null);

      if (isWatched) {
        await removeStoredReaction(userId, item, "watched");
        setStoredReactions((current) =>
          current.filter(
            (entry) =>
              !(entry.tmdbId === item.id && entry.mediaType === item.mediaType && entry.reaction === "watched")
          )
        );
        setSyncMessage("La saque de vistas.");
        return;
      }

      setReviewItem(item);
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
      setSyncMessage("Tu reseña ya salió en el feed.");
    } catch {
      setSyncMessage("No pude guardar tu reseña.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="panel">
      <SectionHeader
        eyebrow="Buscador"
        title="Encontra rapido que ver"
        description="Este primer paso ya vive en React y mantiene la idea central de Cinerian."
      />

      <label className="input-stack">
        <span>Busca una pelicula o serie</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej: Interstellar, The Bear, Parasite"
        />
      </label>

      <div className="inline-status">
        {isLoading
          ? "Buscando..."
          : syncMessage
            ? syncMessage
            : error
              ? error
              : `${results.length} resultados listos`}
      </div>

      <div className="card-list">
        {results.map((item) => (
          <article
            className="media-card media-card--interactive"
            key={`${item.mediaType}-${item.id}`}
            onClick={() => openMediaDetails(item)}
          >
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
                <span className="media-score">TMDB {item.score}</span>
              </div>
              <h3>{item.title}</h3>
              <div className="action-row">
                <button
                  type="button"
                  className={`recommendation-action-button recommendation-action-button--small ${
                    reactionMap[`${item.mediaType}-${item.id}`] === "liked"
                      ? "recommendation-action-button--primary"
                      : ""
                  }`}
                  disabled={isSyncing}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleReaction(item, "liked");
                  }}
                  data-tooltip={
                    reactionMap[`${item.mediaType}-${item.id}`] === "liked" ? "Guardada" : "Guardar"
                  }
                  aria-label={
                    reactionMap[`${item.mediaType}-${item.id}`] === "liked" ? "Guardada" : "Guardar"
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`recommendation-action-button recommendation-action-button--small ${
                    reactionMap[`${item.mediaType}-${item.id}`] === "watched"
                      ? "recommendation-action-button--primary"
                      : ""
                  }`}
                  disabled={isSyncing}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleWatchedToggle(item);
                  }}
                  data-tooltip={
                    reactionMap[`${item.mediaType}-${item.id}`] === "watched" ? "Vista" : "Ya la vi"
                  }
                  aria-label={
                    reactionMap[`${item.mediaType}-${item.id}`] === "watched" ? "Vista" : "Ya la vi"
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <WatchReviewModal
        item={reviewItem}
        isSaving={isSyncing}
        onClose={() => setReviewItem(null)}
        onSubmit={(input) => void handleReviewSubmit(input)}
      />
    </section>
  );
}
