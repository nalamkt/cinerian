import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { SendRecommendationModal } from "./SendRecommendationModal";
import { TalentDetailsModal } from "./TalentDetailsModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { getRatedReactionLabel, RatedReactionIcon } from "./RatedReactionIcon";
import { useDiscovery } from "../hooks/useDiscovery";
import { createFeedPost, removeFeedEvent } from "../lib/feed";
import { listProfiles, type Profile } from "../lib/auth";
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
  searchTalent
} from "../lib/tmdb";
import type { DiscoveryItem, TalentSearchItem } from "../types";

type SearchPanelProps = {
  userId: string;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
};

type BrowseRail = {
  id: string;
  title: string;
  description: string;
  items: DiscoveryItem[];
};

/** Vista = marcada con pulgar arriba o abajo (ya no existe un estado 'watched' aparte). */
function isWatchedReaction(reaction: RecommendationReaction | undefined): reaction is RatedReaction {
  return reaction === "superliked" || reaction === "liked" || reaction === "disliked";
}

export function SearchPanel({ userId, onOpenUserProfile }: SearchPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [query, setQuery] = useState("");
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const [reviewInitialReaction, setReviewInitialReaction] = useState<RatedReaction | null>(null);
  const [sendItem, setSendItem] = useState<DiscoveryItem | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [talentResults, setTalentResults] = useState<TalentSearchItem[]>([]);
  const [trendingTitles, setTrendingTitles] = useState<DiscoveryItem[]>([]);
  const [upcomingTitles, setUpcomingTitles] = useState<DiscoveryItem[]>([]);
  const [genreRails, setGenreRails] = useState<BrowseRail[]>([]);
  const [featuredTalent, setFeaturedTalent] = useState<TalentSearchItem[]>([]);
  const [isBrowseLoading, setIsBrowseLoading] = useState(true);
  const [isTalentLoading, setIsTalentLoading] = useState(false);
  const [talentError, setTalentError] = useState<string | null>(null);
  const [activeTalent, setActiveTalent] = useState<TalentSearchItem | null>(null);
  const reactionsRequestRef = useRef(0);
  const { results, isLoading, error } = useDiscovery(query);

  useEffect(() => {
    async function loadStoredReactions() {
      const requestId = ++reactionsRequestRef.current;

      try {
        const response = await fetchStoredReactions(userId);
        if (requestId === reactionsRequestRef.current) {
          setStoredReactions(response);
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
    let isMounted = true;

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
  }, []);

  useEffect(() => {
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
  }, [query]);

  const reactionMap = useMemo(
    () =>
      Object.fromEntries(
        storedReactions.map((entry) => [`${entry.mediaType}-${entry.tmdbId}`, entry.reaction] as const)
      ),
    [storedReactions]
  );

  const profileResults = useMemo(() => {
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
      .slice(0, 8);
  }, [profiles, query, userId]);

  const hasQuery = Boolean(query.trim());
  const isSearching = isLoading || isTalentLoading;

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

      if (reaction === "watchlist") {
        await createFeedPost({
          userId,
          postType: "watchlist",
          body: "La guardo en su Watchlist.",
          tmdbId: item.id,
          mediaType: item.mediaType
        });
      }

      replaceStoredReaction(item, reaction);
    } catch (error) {
      setSyncMessage(getReactionSaveErrorMessage(error));
    } finally {
      setIsSyncing(false);
    }
  }

  function handleWatchedToggle(item: DiscoveryItem) {
    const key = `${item.mediaType}-${item.id}`;
    const currentReaction = reactionMap[key];

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

      replaceStoredReaction(reviewItem, input.reaction);
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
    <section className="panel search-panel">
      <label className="input-stack search-panel__input search-panel__input--glass">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej: Interstellar, @elchoks, Christopher Nolan"
        />
      </label>

      <div className="inline-status">
        {syncMessage ?? (hasQuery && isSearching ? "Buscando en titulos, personas y talentos..." : null)}
      </div>

      {hasQuery ? (
        <div className="search-result-sections">
          {error ? <p className="inline-status">{error}</p> : null}
          {talentError ? <p className="inline-status">{talentError}</p> : null}
          {results.length ? (
            <section className="search-result-section">
              <div className="search-result-section__heading">
                <p className="section-eyebrow">Titulos</p>
                <h2>Peliculas y series</h2>
              </div>
              <div className="card-list">
                {results.map((item) => {
            const reaction = reactionMap[`${item.mediaType}-${item.id}`];
            const watchedReaction = isWatchedReaction(reaction) ? reaction : null;

            return (
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
            </section>
          ) : null}

          {talentResults.length ? (
            <section className="search-result-section">
              <div className="search-result-section__heading">
                <p className="section-eyebrow">Talentos</p>
                <h2>Actores y directores</h2>
              </div>
              <div className="card-list">
                {talentResults.slice(0, 8).map((talent) => (
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
            </section>
          ) : null}

          {!isSearching && !results.length && !profileResults.length && !talentResults.length ? (
            <p className="search-empty">No encontramos coincidencias. Proba con otro nombre o titulo.</p>
          ) : null}
        </div>
      ) : (
        <div className="search-browse" aria-busy={isBrowseLoading}>
          {isBrowseLoading ? <p className="inline-status">Cargando para explorar...</p> : null}
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
      )}

      <WatchReviewModal
        item={reviewItem}
        isSaving={isSyncing}
        initialReaction={reviewInitialReaction}
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
  onOpen
}: {
  title: string;
  description: string;
  items: DiscoveryItem[];
  onOpen: (item: DiscoveryItem) => void;
}) {
  return (
    <section className="search-browse__section">
      <div className="search-browse__heading">
        <div>
          <p className="section-eyebrow">Para explorar</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="search-browse__rail">
        {items.map((item) => (
          <button
            className="search-browse__title"
            key={`${item.mediaType}-${item.id}`}
            type="button"
            onClick={() => onOpen(item)}
          >
            <img src={item.posterUrl} alt={item.title} />
            <strong>{item.title}</strong>
            <span>{item.year}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
