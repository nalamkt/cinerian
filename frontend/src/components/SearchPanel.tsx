import { useEffect, useMemo, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { useDiscovery } from "../hooks/useDiscovery";
import { createFeedPost } from "../lib/feed";
import {
  fetchStoredReactions,
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
    void fetchStoredReactions(userId)
      .then((response) => {
        setStoredReactions(response);
      })
      .catch(() => {
        setSyncMessage("No pude sincronizar tus acciones guardadas.");
      });
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
        ...current.filter((entry) => entry.tmdbId !== item.id)
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

  async function handleReviewSubmit(input: { liked: boolean; rating: number; comment: string }) {
    if (!reviewItem) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await saveStoredReaction({
        userId,
        item: reviewItem,
        reaction: "watched",
        rating: input.rating
      });
      await createFeedPost({
        userId,
        postType: "rating",
        body: buildWatchedPostBody({
          item: reviewItem,
          liked: input.liked,
          rating: input.rating,
          comment: input.comment
        }),
        tmdbId: reviewItem.id,
        mediaType: reviewItem.mediaType
      });

      setStoredReactions((current) => [
        {
          tmdbId: reviewItem.id,
          mediaType: reviewItem.mediaType,
          reaction: "watched",
          rating: input.rating
        },
        ...current.filter((entry) => entry.tmdbId !== reviewItem.id)
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
            <img src={item.posterUrl} alt={item.title} className="media-poster" />
            <div className="media-copy">
              <div className="media-copy__meta-row">
                <p className="meta-line">
                  {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
                </p>
                <span className="media-score">TMDB {item.score}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.overview}</p>
              <div className="token-row">
                {item.providers.map((provider) => (
                  <span key={provider}>{provider}</span>
                ))}
              </div>
              <div className="action-row">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={isSyncing || reactionMap[`${item.mediaType}-${item.id}`] === "liked"}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleReaction(item, "liked");
                  }}
                >
                  {reactionMap[`${item.mediaType}-${item.id}`] === "liked" ? "Ya te gusto" : "Me gusta"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={isSyncing}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleWatchedToggle(item);
                  }}
                >
                  {reactionMap[`${item.mediaType}-${item.id}`] === "watched" ? "Ya la viste" : "Ya la vi"}
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
