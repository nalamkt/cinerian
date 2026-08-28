import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SendRecommendationModal } from "./SendRecommendationModal";
import { TalentDetailsModal } from "./TalentDetailsModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { createFeedPost, fetchFeedPosts } from "../lib/feed";
import { getProviderSearchUrl } from "../lib/providerLinks";
import {
  fetchStoredReactions,
  removeStoredRatedReaction,
  removeStoredReaction,
  saveStoredReaction
} from "../lib/reactions";
import { buildWatchedPostBody } from "../lib/reviews";
import { buildSharedMediaUrl, shareMediaLink } from "../lib/share";
import { getTitleById, getTitleDetails } from "../lib/tmdb";
import type { FeedEntry, MediaDetails, DiscoveryItem, TalentSearchItem } from "../types";

export type MediaReference = Pick<DiscoveryItem, "id" | "mediaType" | "title">;

type MediaDetailsContextValue = {
  openMediaDetails: (item: MediaReference) => void;
};

const MediaDetailsContext = createContext<MediaDetailsContextValue | null>(null);

function parseFeedReview(body: string) {
  const match = body.match(/^(Le gusto|No le gusto) (.+?)(, le dio| y le dio) (\d)\/5(?: y dijo: "([\s\S]+)")?\.?$/);
  if (match) {
    return {
      sentiment: match[1],
      quote: match[5] ?? ""
    };
  }

  const matchWithoutStars = body.match(/^(Le gusto|No le gusto) (.+?)(?: y dijo: "([\s\S]+)")?\.?$/);
  if (!matchWithoutStars) {
    return null;
  }

  return {
    sentiment: matchWithoutStars[1],
    quote: matchWithoutStars[3] ?? ""
  };
}

function useMediaDetailsData(item: MediaReference | null) {
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [feedPosts, setFeedPosts] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    if (!item) {
      return;
    }

    let isMounted = true;
    const currentItem = item;

    async function load() {
      setIsLoading(true);
      setHasFailed(false);
      setFeedPosts([]);

      try {
        let resolvedDetails = await getTitleDetails(currentItem.id, currentItem.mediaType).catch(() => null);
        if (!resolvedDetails) {
          const fallbackItem = await getTitleById(currentItem.id, currentItem.mediaType).catch(() => null);
          if (fallbackItem) {
            resolvedDetails = {
              ...fallbackItem,
              backdropUrl: null,
              runtimeLabel: null,
              releaseLabel: null,
              countryLabel: null,
              languageLabel: null,
              certification: null,
              directorLabel: null,
              budgetLabel: null,
              trailerUrl: null,
              creators: [],
              cast: []
            };
          }
        }

        if (!isMounted) {
          return;
        }

        setDetails(resolvedDetails);
        setHasFailed(!resolvedDetails);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }

      void fetchFeedPosts()
        .then((posts) => {
          if (!isMounted) {
            return;
          }

          setFeedPosts(
            posts
              .filter((post) => post.tmdbId === currentItem.id && post.mediaType === currentItem.mediaType)
              .slice(0, 4)
          );
        })
        .catch(() => {
          if (isMounted) {
            setFeedPosts([]);
          }
        });
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [item]);

  return { details, feedPosts, isLoading, hasFailed };
}

type MediaDetailsSheetProps = {
  item: MediaReference | null;
  details: MediaDetails | null;
  feedPosts: FeedEntry[];
  isLoading: boolean;
  hasFailed?: boolean;
  onClose?: () => void;
  onShare?: () => void;
  shareLabel?: string;
  onSave?: () => void;
  saveLabel?: string;
  onWatched?: () => void;
  watchedLabel?: string;
  canSave?: boolean;
  canMarkWatched?: boolean;
  publicCta?: ReactNode;
  publicMode?: boolean;
  onOpenTalent?: (talent: TalentSearchItem) => void;
};

export function MediaDetailsSheet({
  item,
  details,
  feedPosts,
  isLoading,
  hasFailed = false,
  onClose,
  onShare,
  shareLabel,
  onSave,
  saveLabel,
  onWatched,
  watchedLabel,
  canSave = false,
  canMarkWatched = false,
  publicCta,
  publicMode = false,
  onOpenTalent
}: MediaDetailsSheetProps) {
  const technicalData = useMemo(() => {
    if (!details) {
      return [];
    }

    return [
      { label: details.mediaType === "movie" ? "Director" : "Creado por", value: details.directorLabel },
      { label: "Pais", value: details.countryLabel },
      { label: "Idioma", value: details.languageLabel },
      { label: "Duracion", value: details.runtimeLabel },
      { label: "Estreno", value: details.releaseLabel },
      { label: "Presupuesto", value: details.budgetLabel }
    ].filter((itemData) => Boolean(itemData.value));
  }, [details]);

  if (!item) {
    return null;
  }

  return (
    <div className={`media-modal ${publicMode ? "media-modal--public" : ""}`} role="dialog" aria-modal={!publicMode}>
      <div className="media-modal__toolbar">
        {onClose ? (
          <button type="button" className="media-modal__back" onClick={onClose} aria-label="Volver">
            ←
          </button>
        ) : (
          <div />
        )}

        {onShare && publicMode ? (
          <button type="button" className="media-modal__share" onClick={onShare}>
            {shareLabel ?? "Compartir"}
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="media-modal__loading">Cargando detalles...</div>
      ) : !details ? (
        <div className="media-modal__empty">
          {hasFailed
            ? "No pudimos cargar esta ficha compartida ahora mismo. Probá abrirla otra vez en unos segundos."
            : "Todavia no tenemos datos para esta ficha."}
        </div>
      ) : (
        <>
          <div
            className="media-modal__hero"
            style={
              details.backdropUrl
                ? {
                    backgroundImage: `linear-gradient(180deg, rgba(11, 10, 8, 0.15), rgba(17, 14, 10, 0.94)), url(${details.backdropUrl})`
                  }
                : undefined
            }
          >
            <div className="media-modal__hero-inner">
              <img src={details.posterUrl} alt={details.title} className="media-modal__poster" />
              <div className="media-modal__hero-copy">
                <h2>{details.title}</h2>
                <p className="media-modal__meta">
                  {details.year}
                  {details.runtimeLabel ? ` • ${details.runtimeLabel}` : ""}
                  {details.genres.length ? ` • ${details.genres.join(" · ")}` : ""}
                  {details.certification ? ` • ${details.certification}` : ""}
                </p>
                <div className="media-modal__score-row">
                  <div className="media-modal__score-card is-accent">
                    <strong>{details.score.toFixed(1)}</strong>
                    <span>TMDB</span>
                  </div>
                  <div className="media-modal__score-card">
                    <strong>{feedPosts.length}</strong>
                    <span>Reseñas cinerianas</span>
                  </div>
                </div>
                {details.providers.length ? (
                  <div className="media-modal__providers">
                    {details.providers.map((provider) => (
                      <a
                        key={provider}
                        href={getProviderSearchUrl(provider, details.title)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {provider}
                      </a>
                    ))}
                  </div>
                ) : null}
                {publicCta ? <div className="media-modal__public-cta">{publicCta}</div> : null}
              </div>
            </div>
          </div>

          {(canSave || canMarkWatched || onShare) && !publicMode ? (
            <section className="media-modal__section media-modal__section--actions">
              <div className="media-modal__actions-row">
                {canMarkWatched && onWatched ? (
                  <div className="media-modal__action-item">
                    <button
                      type="button"
                      className={`recommendation-action-button ${
                        watchedLabel === "Vista" ? "recommendation-action-button--primary" : ""
                      }`}
                      onClick={onWatched}
                      data-tooltip={watchedLabel ?? "Ya la vi"}
                      aria-label={watchedLabel ?? "Ya la vi"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </svg>
                    </button>
                    <span className="media-modal__action-label">Ya la vi</span>
                  </div>
                ) : null}
                {canSave && onSave ? (
                  <div className="media-modal__action-item">
                    <button
                      type="button"
                      className={`recommendation-action-button ${
                        saveLabel === "Guardado" ? "recommendation-action-button--primary" : ""
                      }`}
                      onClick={onSave}
                      data-tooltip={saveLabel ?? "Guardar"}
                      aria-label={saveLabel ?? "Guardar"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
                      </svg>
                    </button>
                    <span className="media-modal__action-label">Guardar</span>
                  </div>
                ) : null}
                {onShare ? (
                  <div className="media-modal__action-item">
                    <button
                      type="button"
                      className="recommendation-action-button"
                      onClick={onShare}
                      data-tooltip={shareLabel ?? "Enviar"}
                      aria-label={shareLabel ?? "Enviar"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M21 3 10 14" />
                        <path d="m21 3-7 18-4-7-7-4 18-7Z" />
                      </svg>
                    </button>
                    <span className="media-modal__action-label">Enviar</span>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="media-modal__section">
            <p className="section-eyebrow">Sinopsis</p>
            <p className="media-modal__overview">{details.overview}</p>
            {details.trailerUrl ? (
              <div className="media-modal__trailer">
                <iframe
                  src={details.trailerUrl}
                  title={`Trailer de ${details.title}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : null}
          </section>

          <section className="media-modal__section">
            <p className="section-eyebrow">Reseñas de cinerianos</p>
            {feedPosts.length ? (
              <div className="media-modal__reviews">
                {feedPosts.map((post) => {
                  const review = parseFeedReview(post.body);

                  return (
                    <article className="media-modal__review-card" key={post.id}>
                      <strong>{post.author}</strong>
                      <span className="media-modal__review-meta">{post.createdAtLabel}</span>
                      <p>{review?.quote || post.body}</p>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="media-modal__empty">Todavia nadie reseño este titulo en Cinerian.</div>
            )}
          </section>

          {details.cast.length ? (
            <section className="media-modal__section">
              <p className="section-eyebrow">Elenco</p>
              <div className="media-modal__cast">
                {details.cast.map((person) => (
                  <button
                    type="button"
                    className="media-modal__cast-card media-modal__cast-card--interactive"
                    key={person.id}
                    onClick={() =>
                      onOpenTalent?.({
                        id: person.id,
                        name: person.name,
                        knownForDepartment: "Actor / Actriz",
                        profileUrl: person.profileUrl,
                        knownForTitles: []
                      })
                    }
                  >
                    <div className="media-modal__cast-avatar">
                      {person.profileUrl ? <img src={person.profileUrl} alt={person.name} /> : <span>🎭</span>}
                    </div>
                    <strong>{person.name}</strong>
                    {person.character ? <span>{person.character}</span> : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {details.creators.length ? (
            <section className="media-modal__section">
              <p className="section-eyebrow">
                {details.mediaType === "movie" ? "Direccion" : "Creacion"}
              </p>
              <div className="media-modal__cast media-modal__cast--creators">
                {details.creators.map((person) => (
                  <button
                    type="button"
                    className="media-modal__cast-card media-modal__cast-card--interactive"
                    key={`creator-${person.id}`}
                    onClick={() =>
                      onOpenTalent?.({
                        id: person.id,
                        name: person.name,
                        knownForDepartment: person.roleLabel ?? "Talento",
                        profileUrl: person.profileUrl,
                        knownForTitles: []
                      })
                    }
                  >
                    <div className="media-modal__cast-avatar">
                      {person.profileUrl ? <img src={person.profileUrl} alt={person.name} /> : <span>🎬</span>}
                    </div>
                    <strong>{person.name}</strong>
                    {person.roleLabel ? <span>{person.roleLabel}</span> : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {technicalData.length ? (
            <section className="media-modal__section">
              <p className="section-eyebrow">Datos tecnicos</p>
              <div className="media-modal__technical-grid">
                {technicalData.map((itemData) => (
                  <article className="media-modal__technical-card" key={itemData.label}>
                    <span>{itemData.label}</span>
                    <strong>{itemData.value}</strong>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function MediaDetailsModal({
  userId,
  item,
  onClose
}: {
  userId?: string;
  item: MediaReference | null;
  onClose: () => void;
}) {
  const { details, feedPosts, isLoading, hasFailed } = useMediaDetailsData(item);
  const [shareLabel, setShareLabel] = useState("Compartir");
  const [saveLabel, setSaveLabel] = useState("Guardar");
  const [watchedLabel, setWatchedLabel] = useState("Ya la vi");
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  const [sendItem, setSendItem] = useState<DiscoveryItem | null>(null);
  const [activeTalent, setActiveTalent] = useState<TalentSearchItem | null>(null);

  useEffect(() => {
    if (!item) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [item, onClose]);

  useEffect(() => {
    setShareLabel("Compartir");
  }, [item]);

  useEffect(() => {
    if (!item || !userId) {
      setSaveLabel("Guardar");
      setWatchedLabel("Ya la vi");
      return;
    }

    let isMounted = true;

    void fetchStoredReactions(userId)
      .then((reactions) => {
        if (!isMounted) {
          return;
        }

        const isSaved = reactions.some(
          (entry) =>
            entry.tmdbId === item.id &&
            entry.mediaType === item.mediaType &&
            entry.reaction === "watchlist"
        );
        const isWatched = reactions.some(
          (entry) =>
            entry.tmdbId === item.id &&
            entry.mediaType === item.mediaType &&
            (entry.reaction === "liked" || entry.reaction === "disliked")
        );

        setSaveLabel(isSaved ? "Guardado" : "Guardar");
        setWatchedLabel(isWatched ? "Vista" : "Ya la vi");
      })
      .catch(() => {
        if (isMounted) {
          setSaveLabel("Guardar");
          setWatchedLabel("Ya la vi");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [item, userId]);

  async function handleShare() {
    if (!item) {
      return;
    }

    setSendItem({
      id: item.id,
      mediaType: item.mediaType,
      title: details?.title ?? item.title,
      year: details?.year ?? "",
      overview: details?.overview ?? "",
      posterUrl: details?.posterUrl ?? "",
      genres: details?.genres ?? [],
      providers: details?.providers ?? [],
      score: details?.score ?? 0
    });
  }

  async function handleSave() {
    if (!item || !userId) {
      return;
    }

    try {
      const normalizedItem = {
        id: item.id,
        mediaType: item.mediaType,
        title: details?.title ?? item.title,
        year: details?.year ?? "",
        overview: details?.overview ?? "",
        posterUrl: details?.posterUrl ?? "",
        genres: details?.genres ?? [],
        providers: details?.providers ?? [],
        score: details?.score ?? 0
      };

      if (saveLabel === "Guardado") {
        await removeStoredReaction(userId, normalizedItem, "watchlist");
        setSaveLabel("Quitado");
        window.setTimeout(() => setSaveLabel("Guardar"), 1800);
        return;
      }

      await saveStoredReaction({
        userId,
        item: normalizedItem,
        reaction: "watchlist"
      });
      setSaveLabel("Guardado");
    } catch {
      setSaveLabel(saveLabel === "Guardado" ? "No pude quitar" : "No pude guardar");
      window.setTimeout(() => setSaveLabel("Guardar"), 1800);
    }
  }

  async function handleWatched() {
    if (!item || !userId) {
      return;
    }

    try {
      const normalizedItem = {
        id: item.id,
        mediaType: item.mediaType,
        title: details?.title ?? item.title,
        year: details?.year ?? "",
        overview: details?.overview ?? "",
        posterUrl: details?.posterUrl ?? "",
        genres: details?.genres ?? [],
        providers: details?.providers ?? [],
        score: details?.score ?? 0
      };

      if (watchedLabel === "Vista") {
        await removeStoredRatedReaction(userId, normalizedItem);
        setWatchedLabel("Quitada");
        window.setTimeout(() => setWatchedLabel("Ya la vi"), 1800);
        return;
      }

      setReviewItem(normalizedItem);
    } catch {
      setWatchedLabel(watchedLabel === "Vista" ? "No pude quitar" : "No pude marcar");
      window.setTimeout(() => setWatchedLabel("Ya la vi"), 1800);
    }
  }

  async function handleReviewSubmit(input: { liked: boolean; comment: string }) {
    if (!reviewItem || !userId) {
      return;
    }

    try {
      setIsReviewSaving(true);
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
      setWatchedLabel("Vista");
      setReviewItem(null);
    } catch {
      setWatchedLabel("No pude marcar");
      window.setTimeout(() => setWatchedLabel("Ya la vi"), 1800);
    } finally {
      setIsReviewSaving(false);
    }
  }

  if (!item) {
    return null;
  }

  return (
    <div
      className="media-modal__backdrop"
      role="presentation"
      onClick={onClose}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="media-modal__frame"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        {/*
          El panel ocupa todo el ancho aunque la ficha este centrada y sea mas
          angosta, asi que los costados oscuros tambien son el panel. Por eso no
          alcanza con frenar la propagacion: hay que cerrar cuando el clic cae
          en el panel mismo, y frenarla solo cuando cae dentro de la ficha.
        */}
        <div
          className="media-modal__panel"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
              return;
            }

            event.stopPropagation();
          }}
        >
          <MediaDetailsSheet
            item={item}
            details={details}
            feedPosts={feedPosts}
            isLoading={isLoading}
            hasFailed={hasFailed}
            onClose={onClose}
            onShare={handleShare}
            shareLabel={shareLabel === "Compartir" ? "Enviar" : shareLabel}
            onSave={handleSave}
            saveLabel={saveLabel}
            onWatched={handleWatched}
            watchedLabel={watchedLabel}
            canSave={Boolean(userId)}
            canMarkWatched={Boolean(userId)}
            onOpenTalent={setActiveTalent}
          />
        </div>
        <WatchReviewModal
          item={reviewItem}
          isSaving={isReviewSaving}
          onClose={() => setReviewItem(null)}
          onSubmit={(input) => void handleReviewSubmit(input)}
        />
        {userId ? (
          <SendRecommendationModal
            userId={userId}
            item={sendItem}
            onClose={() => setSendItem(null)}
            onSent={() => {
              setShareLabel("Enviado");
              window.setTimeout(() => setShareLabel("Compartir"), 1800);
            }}
          />
        ) : null}
        <TalentDetailsModal item={activeTalent} onClose={() => setActiveTalent(null)} />
      </div>
    </div>
  );
}

export function MediaDetailsProvider({
  userId,
  children
}: {
  userId?: string;
  children: ReactNode;
}) {
  const [activeItem, setActiveItem] = useState<MediaReference | null>(null);

  return (
    <MediaDetailsContext.Provider
      value={{
        openMediaDetails: (item) => setActiveItem(item)
      }}
    >
      {children}
      <MediaDetailsModal userId={userId} item={activeItem} onClose={() => setActiveItem(null)} />
    </MediaDetailsContext.Provider>
  );
}

export function SharedMediaLanding({ item }: { item: MediaReference }) {
  const { details, feedPosts, isLoading, hasFailed } = useMediaDetailsData(item);
  const [shareLabel, setShareLabel] = useState("Compartir");
  const [activeTalent, setActiveTalent] = useState<TalentSearchItem | null>(null);

  async function handleShare() {
    const result = await shareMediaLink(details ? { ...item, title: details.title } : item);
    setShareLabel(result === "shared" ? "Compartido" : "Link copiado");
    window.setTimeout(() => setShareLabel("Compartir"), 1800);
  }

  const publicCta = details ? (
    <>
      <a href="/" className="media-modal__cta-link">
        Abrir Cinerian
      </a>
      <a
        href={buildSharedMediaUrl(item)}
        className="media-modal__cta-link is-secondary"
        target="_blank"
        rel="noreferrer"
      >
        Link publico
      </a>
    </>
  ) : null;

  return (
    <>
      <div className="media-modal__frame" role="presentation">
        <div className="media-modal__panel" role="presentation">
          <MediaDetailsSheet
            item={item}
            details={details}
            feedPosts={feedPosts}
            isLoading={isLoading}
            hasFailed={hasFailed}
            onShare={handleShare}
            shareLabel={shareLabel}
            publicCta={publicCta}
            publicMode
            onOpenTalent={setActiveTalent}
          />
        </div>
      </div>
      <TalentDetailsModal item={activeTalent} onClose={() => setActiveTalent(null)} />
    </>
  );
}

export function useMediaDetails() {
  const context = useContext(MediaDetailsContext);
  if (!context) {
    throw new Error("useMediaDetails must be used within MediaDetailsProvider");
  }

  return context;
}
