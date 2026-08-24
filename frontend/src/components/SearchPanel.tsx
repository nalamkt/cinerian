import { useEffect, useMemo, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { SendRecommendationModal } from "./SendRecommendationModal";
import { TalentDetailsModal } from "./TalentDetailsModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { useDiscovery } from "../hooks/useDiscovery";
import { createFeedPost } from "../lib/feed";
import { listProfiles, type Profile } from "../lib/auth";
import {
  fetchStoredReactions,
  REACTIONS_UPDATED_EVENT,
  removeStoredRatedReaction,
  saveStoredReaction,
  type RecommendationReaction,
  type StoredReaction
} from "../lib/reactions";
import { buildWatchedPostBody } from "../lib/reviews";
import { searchTalent } from "../lib/tmdb";
import type { DiscoveryItem, TalentSearchItem } from "../types";

type SearchPanelProps = {
  userId: string;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
};

type SearchMode = "titles" | "people" | "talent";

/** Vista = marcada con pulgar arriba o abajo (ya no existe un estado 'watched' aparte). */
function isWatchedReaction(reaction: RecommendationReaction | undefined) {
  return reaction === "liked" || reaction === "disliked";
}

export function SearchPanel({ userId, onOpenUserProfile }: SearchPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("titles");
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const [sendItem, setSendItem] = useState<DiscoveryItem | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [talentResults, setTalentResults] = useState<TalentSearchItem[]>([]);
  const [isTalentLoading, setIsTalentLoading] = useState(false);
  const [talentError, setTalentError] = useState<string | null>(null);
  const [activeTalent, setActiveTalent] = useState<TalentSearchItem | null>(null);
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

  useEffect(() => {
    void listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    if (searchMode !== "talent") {
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setTalentResults([]);
      setTalentError(null);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setIsTalentLoading(true);
        setTalentError(null);
        setTalentResults(await searchTalent(trimmed));
      } catch {
        setTalentError("No pude traer actores y directores ahora.");
        setTalentResults([]);
      } finally {
        setIsTalentLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [query, searchMode]);

  const reactionMap = useMemo(
    () =>
      Object.fromEntries(
        storedReactions.map((entry) => [`${entry.mediaType}-${entry.tmdbId}`, entry.reaction] as const)
      ),
    [storedReactions]
  );

  const profileResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
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
      .slice(0, 8);
  }, [profiles, query, userId]);

  function replaceStoredReaction(item: DiscoveryItem, reaction: StoredReaction["reaction"]) {
    setStoredReactions((current) => [
      { tmdbId: item.id, mediaType: item.mediaType, reaction },
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

      if (reaction === "watchlist") {
        await createFeedPost({
          userId,
          postType: "watchlist",
          body: "La guardo en su Watchlist.",
          tmdbId: item.id,
          mediaType: item.mediaType
        });
      }

      if (reaction === "liked" || reaction === "disliked") {
        await createFeedPost({
          userId,
          postType: "rating",
          body: `Marco ${item.title} como ya vista desde el buscador.`,
          tmdbId: item.id,
          mediaType: item.mediaType
        });
      }

      replaceStoredReaction(item, reaction);
    } catch {
      setSyncMessage("No pude guardar esta accion.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleWatchedToggle(item: DiscoveryItem) {
    const key = `${item.mediaType}-${item.id}`;
    const isWatched = isWatchedReaction(reactionMap[key]);

    try {
      setIsSyncing(true);
      setSyncMessage(null);

      if (isWatched) {
        await removeStoredRatedReaction(userId, item);
        setStoredReactions((current) =>
          current.filter(
            (entry) =>
              !(
                entry.tmdbId === item.id &&
                entry.mediaType === item.mediaType &&
                (entry.reaction === "liked" || entry.reaction === "disliked")
              )
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
        reaction: input.liked ? "liked" : "disliked"
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

      replaceStoredReaction(reviewItem, input.liked ? "liked" : "disliked");
      setReviewItem(null);
      setSyncMessage("Tu reseña ya salió en el feed.");
    } catch {
      setSyncMessage("No pude guardar tu reseña.");
    } finally {
      setIsSyncing(false);
    }
  }

  function handleSend(item: DiscoveryItem) {
    setSendItem(item);
  }

  return (
    <section className="panel">
      <header className="feed-header feed-header--search">
        <button
          type="button"
          className={`feed-header__tab ${searchMode === "titles" ? "is-active" : ""}`}
          onClick={() => setSearchMode("titles")}
        >
          Titulos
        </button>
        <button
          type="button"
          className={`feed-header__tab ${searchMode === "people" ? "is-active" : ""}`}
          onClick={() => setSearchMode("people")}
        >
          Personas
        </button>
        <button
          type="button"
          className={`feed-header__tab ${searchMode === "talent" ? "is-active" : ""}`}
          onClick={() => setSearchMode("talent")}
        >
          Talento
        </button>
      </header>

      <label className="input-stack">
        <span>
          {searchMode === "titles"
            ? "Busca una pelicula o serie"
            : searchMode === "people"
              ? "Busca cinerianos"
              : "Busca actores y directores"}
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            searchMode === "titles"
              ? "Ej: Interstellar, The Bear, Parasite"
              : searchMode === "people"
                ? "Ej: elchoks, Isidoro"
                : "Ej: Cillian Murphy, Christopher Nolan"
          }
        />
      </label>

      <div className="inline-status">
        {searchMode === "titles"
          ? isLoading
            ? "Buscando..."
            : syncMessage
              ? syncMessage
              : error
                ? error
                : `${results.length} resultados listos`
          : searchMode === "people"
            ? query.trim()
              ? `${profileResults.length} perfiles encontrados`
              : "Busca un cineriano por nombre o username."
            : isTalentLoading
              ? "Buscando talento..."
              : talentError
                ? talentError
                : query.trim()
                  ? `${talentResults.length} talentos encontrados`
                  : "Busca un actor o director por nombre."}
      </div>

      {searchMode === "titles" ? (
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
                      isWatchedReaction(reactionMap[`${item.mediaType}-${item.id}`])
                        ? "recommendation-action-button--primary"
                        : ""
                    }`}
                    disabled={isSyncing}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleWatchedToggle(item);
                    }}
                    data-tooltip={
                      isWatchedReaction(reactionMap[`${item.mediaType}-${item.id}`]) ? "Vista" : "Ya la vi"
                    }
                    aria-label={
                      isWatchedReaction(reactionMap[`${item.mediaType}-${item.id}`]) ? "Vista" : "Ya la vi"
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
      ) : null}

      {searchMode === "people" ? (
        <div className="card-list">
          {profileResults.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className="profile-search-card"
              onClick={() => onOpenUserProfile({ userId: profile.id, username: profile.username })}
            >
              <span className="profile-search-card__avatar" aria-hidden="true">
                {profile.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="profile-search-card__copy">
                <strong>{profile.display_name}</strong>
                <span>@{profile.username}</span>
                {profile.bio ? <p>{profile.bio}</p> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {searchMode === "talent" ? (
        <div className="card-list">
          {talentResults.map((talent) => (
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
      ) : null}

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
      />
      <TalentDetailsModal item={activeTalent} onClose={() => setActiveTalent(null)} />
    </section>
  );
}
