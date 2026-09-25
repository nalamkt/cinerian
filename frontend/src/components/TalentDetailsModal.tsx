import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useMediaDetails } from "./MediaDetailsModal";
import { getTalentDetails } from "../lib/tmdb";
import {
  fetchStoredReactions,
  REACTIONS_UPDATED_EVENT,
  type RecommendationReaction,
  type StoredReaction
} from "../lib/reactions";
import type { TalentCredit, TalentDetails, TalentSearchItem } from "../types";

const CREDITS_PAGE_SIZE = 12;
type CreditOrder = "known" | "recent";

// Cuando el usuario abre una ficha de pelicula desde el perfil de un actor, el
// TalentDetailsModal se desmonta y al volver arrancaba en el tope de la lista,
// perdiendo el "Ver mas" ya expandido y el scroll. Guardamos ese contexto
// aca (module-level) por talento para restaurarlo al remontar.
type TalentUiState = {
  scrollTop: number;
  visibleActingCredits: number;
  visibleDirectingCredits: number;
  creditOrder: CreditOrder;
};
const talentUiCache = new Map<number, TalentUiState>();

type TalentDetailsModalProps = {
  item: TalentSearchItem | null;
  onClose: () => void;
  userId?: string;
  closeOnMediaOpen?: boolean;
  preserveInNavigationStack?: boolean;
  aboveMedia?: boolean;
};

const THUMB_PATH =
  "M7 10v10M7 10l3.5-6a2.5 2.5 0 0 1 2.4 3.2L12 10h6a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7";

const REACTION_LABELS: Partial<Record<RecommendationReaction, string>> = {
  superliked: "Me encantó",
  liked: "Me gustó",
  disliked: "No me gustó",
  watchlist: "Guardada"
};

function orderCredits(credits: TalentCredit[], order: CreditOrder): TalentCredit[] {
  if (order === "known") {
    return credits;
  }

  return [...credits].sort((left, right) => {
    const rightYear = Number.parseInt(right.year, 10) || 0;
    const leftYear = Number.parseInt(left.year, 10) || 0;
    return rightYear - leftYear;
  });
}

function TalentCreditReaction({ reaction }: { reaction: RecommendationReaction | undefined }) {
  if (!reaction || reaction === "ignored") {
    return null;
  }

  const label = REACTION_LABELS[reaction];
  if (!label) {
    return null;
  }

  return (
    <span
      className={`talent-modal__reaction talent-modal__reaction--${reaction}`}
      aria-label={`Tu reaccion: ${label}`}
      title={label}
    >
      {reaction === "watchlist" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16l-5-3.2-5 3.2z" />
        </svg>
      ) : (
        <span className="talent-modal__reaction-thumbs" aria-hidden="true">
          {Array.from({ length: reaction === "superliked" ? 2 : 1 }, (_, index) => (
            <svg key={index} viewBox="0 0 24 24" className={reaction === "disliked" ? "is-down" : ""}>
              <path d={THUMB_PATH} />
            </svg>
          ))}
        </span>
      )}
    </span>
  );
}

export function TalentDetailsModal({
  item,
  onClose,
  userId,
  closeOnMediaOpen = false,
  preserveInNavigationStack = false,
  aboveMedia = false
}: TalentDetailsModalProps) {
  const { openMediaDetails, pushMediaDetails } = useMediaDetails();
  const cached = item ? talentUiCache.get(item.id) : null;
  const [details, setDetails] = useState<TalentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [visibleActingCredits, setVisibleActingCredits] = useState(
    cached?.visibleActingCredits ?? CREDITS_PAGE_SIZE
  );
  const [visibleDirectingCredits, setVisibleDirectingCredits] = useState(
    cached?.visibleDirectingCredits ?? CREDITS_PAGE_SIZE
  );
  const [creditOrder, setCreditOrder] = useState<CreditOrder>(cached?.creditOrder ?? "known");
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollRef = useRef<number | null>(cached?.scrollTop ?? null);

  useEffect(() => {
    if (!item) {
      return;
    }

    let isMounted = true;

    void (async () => {
      setIsLoading(true);
      try {
        const result = await getTalentDetails(item.id);
        if (isMounted) {
          setDetails(result);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const nextCached = talentUiCache.get(item.id);
    setVisibleActingCredits(nextCached?.visibleActingCredits ?? CREDITS_PAGE_SIZE);
    setVisibleDirectingCredits(nextCached?.visibleDirectingCredits ?? CREDITS_PAGE_SIZE);
    setCreditOrder(nextCached?.creditOrder ?? "known");
    pendingScrollRef.current = nextCached?.scrollTop ?? 0;
  }, [item?.id]);

  useEffect(() => {
    if (!userId) {
      setStoredReactions([]);
      return;
    }

    const activeUserId = userId;
    let isMounted = true;

    async function loadStoredReactions() {
      try {
        const reactions = await fetchStoredReactions(activeUserId);
        if (isMounted) {
          setStoredReactions(reactions);
        }
      } catch {
        if (isMounted) {
          setStoredReactions([]);
        }
      }
    }

    function handleReactionsUpdated(event: Event) {
      const eventUserId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (!eventUserId || eventUserId === activeUserId) {
        void loadStoredReactions();
      }
    }

    void loadStoredReactions();
    window.addEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);

    return () => {
      isMounted = false;
      window.removeEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);
    };
  }, [userId]);

  useLayoutEffect(() => {
    if (!details || pendingScrollRef.current == null) return;
    const target = pendingScrollRef.current;
    const el = scrollRef.current;
    if (!el) return;
    // Los posters cargan de a poco: aplicamos el scroll ahora y otra vez tras
    // un frame por si las imagenes cambiaron la altura del contenido.
    el.scrollTop = target;
    const rafId = window.requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = target;
      }
      pendingScrollRef.current = null;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [details, visibleActingCredits, visibleDirectingCredits]);

  if (!item) {
    return null;
  }

  const reactionsByCredit = new Map(
    storedReactions.map((reaction) => [`${reaction.mediaType}-${reaction.tmdbId}`, reaction.reaction])
  );
  const actingCredits = details ? orderCredits(details.actingCredits, creditOrder) : [];
  const directingCredits = details ? orderCredits(details.directingCredits, creditOrder) : [];
  const heroCredits = details ? [...details.actingCredits, ...details.directingCredits] : [];
  const heroPoster = [...heroCredits]
    .sort((left, right) => (Number.parseInt(right.year, 10) || 0) - (Number.parseInt(left.year, 10) || 0))
    .find((credit) => credit.posterUrl !== "/images/base.png")?.posterUrl;
  const heroStyle = heroPoster
    ? ({ "--talent-hero-poster": `url("${heroPoster}")` } as CSSProperties)
    : undefined;

  function changeCreditOrder(order: CreditOrder) {
    setCreditOrder(order);
    setVisibleActingCredits(CREDITS_PAGE_SIZE);
    setVisibleDirectingCredits(CREDITS_PAGE_SIZE);
  }

  function saveUiState() {
    if (!item) return;
    talentUiCache.set(item.id, {
      scrollTop: scrollRef.current?.scrollTop ?? 0,
      visibleActingCredits,
      visibleDirectingCredits,
      creditOrder
    });
  }

  function handleClose() {
    saveUiState();
    onClose();
  }

  function openCreditDetails(credit: TalentCredit) {
    saveUiState();
    const media = {
      id: credit.id,
      mediaType: credit.mediaType,
      title: credit.title
    };

    // Desde una ficha, el crédito forma parte del recorrido actual. Desde el
    // buscador abre una ficha nueva y conserva el comportamiento existente.
    if (closeOnMediaOpen) {
      pushMediaDetails(media);
      if (!preserveInNavigationStack) {
        onClose();
      }
      return;
    }

    openMediaDetails(media);
  }

  const modal = (
    <div
      className={`media-modal__backdrop media-modal__backdrop--talent ${aboveMedia ? "is-above-media" : ""}`}
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="media-modal__frame media-modal__frame--talent"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            handleClose();
          }
        }}
      >
        <div
          className="media-modal__panel media-modal__panel--talent"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleClose();
              return;
            }
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleClose();
            }
          }}
        >
          <div
            ref={scrollRef}
            className="media-modal media-modal--public talent-modal talent-modal--page"
          >
            <div className="media-modal__toolbar">
              <button
                type="button"
                className="media-modal__back"
                onClick={handleClose}
                aria-label="Volver"
                data-escape-dismiss
              >
                ←
              </button>
            </div>

            {isLoading || !details ? (
              <div className="media-modal__loading">Cargando ficha de talento...</div>
            ) : (
              <>
                <div
                  className={`media-modal__hero talent-modal__hero${heroPoster ? " has-backdrop" : ""}`}
                  style={heroStyle}
                >
                  <div className="media-modal__hero-inner">
                    <img
                      src={details.profileUrl ?? "/images/base.png"}
                      alt={details.name}
                      className="media-modal__poster"
                    />
                    <div className="media-modal__hero-copy">
                      <p className="meta-line">{details.knownForDepartment}</p>
                      <h2>{details.name}</h2>
                      <p className="media-modal__meta">
                        {details.birthday ? `Nacio: ${details.birthday}` : "Sin fecha"}
                        {details.placeOfBirth ? ` • ${details.placeOfBirth}` : ""}
                      </p>
                      {item.knownForTitles.length ? (
                        <div className="token-row talent-modal__known-for">
                          {item.knownForTitles.slice(0, 4).map((title) => (
                            <span key={title}>{title}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <section className="media-modal__section">
                  <p className="section-eyebrow">Biografia</p>
                  <p className="media-modal__overview">{details.biography}</p>
                </section>

                {actingCredits.length ? (
                  <section className="media-modal__section">
                    <div className="talent-modal__section-heading">
                      <p className="section-eyebrow">Como actor / actriz</p>
                      <label className="talent-modal__credit-order">
                        <span>Ordenar por</span>
                        <select
                          value={creditOrder}
                          onChange={(event) => changeCreditOrder(event.target.value as CreditOrder)}
                        >
                          <option value="known">Mas conocidos</option>
                          <option value="recent">Mas recientes</option>
                        </select>
                      </label>
                    </div>
                    <div className="talent-modal__credits">
                      {actingCredits.slice(0, visibleActingCredits).map((credit) => (
                        <article
                          className="talent-modal__credit talent-modal__credit--interactive"
                          key={`cast-${credit.mediaType}-${credit.id}`}
                          onClick={() => openCreditDetails(credit)}
                        >
                          <img src={credit.posterUrl} alt={credit.title} />
                          <div>
                            <strong>{credit.title}</strong>
                            <span>
                              {credit.mediaType === "tv" ? "Serie" : "Pelicula"} • {credit.year}
                            </span>
                            <p>{credit.roleLabel}</p>
                            <small>Ver detalle</small>
                          </div>
                          <TalentCreditReaction
                            reaction={reactionsByCredit.get(`${credit.mediaType}-${credit.id}`)}
                          />
                        </article>
                      ))}
                    </div>
                    {visibleActingCredits < actingCredits.length ? (
                      <button
                        type="button"
                        className="talent-modal__load-more"
                        onClick={() => setVisibleActingCredits((count) => count + CREDITS_PAGE_SIZE)}
                      >
                        Ver mas ({Math.min(CREDITS_PAGE_SIZE, actingCredits.length - visibleActingCredits)})
                      </button>
                    ) : null}
                  </section>
                ) : null}

                {directingCredits.length ? (
                  <section className="media-modal__section">
                    <div className="talent-modal__section-heading">
                      <p className="section-eyebrow">Como director / directora</p>
                      <label className="talent-modal__credit-order">
                        <span>Ordenar por</span>
                        <select
                          value={creditOrder}
                          onChange={(event) => changeCreditOrder(event.target.value as CreditOrder)}
                        >
                          <option value="known">Mas conocidos</option>
                          <option value="recent">Mas recientes</option>
                        </select>
                      </label>
                    </div>
                    <div className="talent-modal__credits">
                      {directingCredits.slice(0, visibleDirectingCredits).map((credit) => (
                        <article
                          className="talent-modal__credit talent-modal__credit--interactive"
                          key={`crew-${credit.mediaType}-${credit.id}`}
                          onClick={() => openCreditDetails(credit)}
                        >
                          <img src={credit.posterUrl} alt={credit.title} />
                          <div>
                            <strong>{credit.title}</strong>
                            <span>
                              {credit.mediaType === "tv" ? "Serie" : "Pelicula"} • {credit.year}
                            </span>
                            <p>{credit.roleLabel}</p>
                            <small>Ver detalle</small>
                          </div>
                          <TalentCreditReaction
                            reaction={reactionsByCredit.get(`${credit.mediaType}-${credit.id}`)}
                          />
                        </article>
                      ))}
                    </div>
                    {visibleDirectingCredits < directingCredits.length ? (
                      <button
                        type="button"
                        className="talent-modal__load-more"
                        onClick={() => setVisibleDirectingCredits((count) => count + CREDITS_PAGE_SIZE)}
                      >
                        Ver mas ({Math.min(CREDITS_PAGE_SIZE, directingCredits.length - visibleDirectingCredits)})
                      </button>
                    ) : null}
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
