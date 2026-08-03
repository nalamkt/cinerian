import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchFeedPosts } from "../lib/feed";
import { getProviderSearchUrl } from "../lib/providerLinks";
import { buildSharedMediaUrl, shareMediaLink } from "../lib/share";
import { getTitleDetails } from "../lib/tmdb";
import type { FeedEntry, MediaDetails, DiscoveryItem } from "../types";

export type MediaReference = Pick<DiscoveryItem, "id" | "mediaType" | "title">;

type MediaDetailsContextValue = {
  openMediaDetails: (item: MediaReference) => void;
};

const MediaDetailsContext = createContext<MediaDetailsContextValue | null>(null);

function parseFeedReview(body: string) {
  const match = body.match(/^(Le gusto|No le gusto) (.+?)(, le dio| y le dio) (\d)\/5(?: y dijo: "([\s\S]+)")?\.?$/);
  if (!match) {
    return null;
  }

  return {
    sentiment: match[1],
    rating: Number(match[4]),
    quote: match[5] ?? ""
  };
}

function useMediaDetailsData(item: MediaReference | null) {
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [feedPosts, setFeedPosts] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!item) {
      return;
    }

    let isMounted = true;
    const currentItem = item;

    async function load() {
      setIsLoading(true);

      try {
        const [detailResult, posts] = await Promise.all([
          getTitleDetails(currentItem.id, currentItem.mediaType),
          fetchFeedPosts()
        ]);

        if (!isMounted) {
          return;
        }

        setDetails(detailResult);
        setFeedPosts(
          posts
            .filter((post) => post.tmdbId === currentItem.id && post.mediaType === currentItem.mediaType)
            .slice(0, 4)
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [item]);

  return { details, feedPosts, isLoading };
}

type MediaDetailsSheetProps = {
  item: MediaReference | null;
  details: MediaDetails | null;
  feedPosts: FeedEntry[];
  isLoading: boolean;
  onClose?: () => void;
  onShare?: () => void;
  shareLabel?: string;
  publicCta?: ReactNode;
  publicMode?: boolean;
};

export function MediaDetailsSheet({
  item,
  details,
  feedPosts,
  isLoading,
  onClose,
  onShare,
  shareLabel,
  publicCta,
  publicMode = false
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

        {onShare ? (
          <button type="button" className="media-modal__share" onClick={onShare}>
            {shareLabel ?? "Compartir"}
          </button>
        ) : null}
      </div>

      {isLoading || !details ? (
        <div className="media-modal__loading">Cargando detalles...</div>
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
                      {review ? (
                        <div className="media-modal__review-stars">
                          {Array.from({ length: review.rating }).map((_, index) => (
                            <span key={`${post.id}-active-${index}`}>★</span>
                          ))}
                        </div>
                      ) : null}
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
                  <article className="media-modal__cast-card" key={person.id}>
                    <div className="media-modal__cast-avatar">
                      {person.profileUrl ? <img src={person.profileUrl} alt={person.name} /> : <span>🎭</span>}
                    </div>
                    <strong>{person.name}</strong>
                    {person.character ? <span>{person.character}</span> : null}
                  </article>
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
  item,
  onClose
}: {
  item: MediaReference | null;
  onClose: () => void;
}) {
  const { details, feedPosts, isLoading } = useMediaDetailsData(item);
  const [shareLabel, setShareLabel] = useState("Compartir");

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

  async function handleShare() {
    if (!item) {
      return;
    }

    const result = await shareMediaLink(details ? { ...item, title: details.title } : item);
    setShareLabel(result === "shared" ? "Compartido" : "Link copiado");
    window.setTimeout(() => setShareLabel("Compartir"), 1800);
  }

  if (!item) {
    return null;
  }

  return (
    <div className="media-modal__backdrop" role="presentation" onClick={onClose}>
      <div className="media-modal__frame" role="presentation" onClick={(event) => event.stopPropagation()}>
        <MediaDetailsSheet
          item={item}
          details={details}
          feedPosts={feedPosts}
          isLoading={isLoading}
          onClose={onClose}
          onShare={handleShare}
          shareLabel={shareLabel}
        />
      </div>
    </div>
  );
}

export function MediaDetailsProvider({ children }: { children: ReactNode }) {
  const [activeItem, setActiveItem] = useState<MediaReference | null>(null);

  return (
    <MediaDetailsContext.Provider
      value={{
        openMediaDetails: (item) => setActiveItem(item)
      }}
    >
      {children}
      <MediaDetailsModal item={activeItem} onClose={() => setActiveItem(null)} />
    </MediaDetailsContext.Provider>
  );
}

export function SharedMediaLanding({ item }: { item: MediaReference }) {
  const { details, feedPosts, isLoading } = useMediaDetailsData(item);
  const [shareLabel, setShareLabel] = useState("Compartir");

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
    <MediaDetailsSheet
      item={item}
      details={details}
      feedPosts={feedPosts}
      isLoading={isLoading}
      onShare={handleShare}
      shareLabel={shareLabel}
      publicCta={publicCta}
      publicMode
    />
  );
}

export function useMediaDetails() {
  const context = useContext(MediaDetailsContext);
  if (!context) {
    throw new Error("useMediaDetails must be used within MediaDetailsProvider");
  }

  return context;
}
