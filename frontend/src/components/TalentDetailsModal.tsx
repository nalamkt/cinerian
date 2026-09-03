import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaDetails } from "./MediaDetailsModal";
import { getTalentDetails } from "../lib/tmdb";
import {
  fetchStoredReactions,
  REACTIONS_UPDATED_EVENT,
  type RecommendationReaction,
  type StoredReaction
} from "../lib/reactions";
import type { TalentDetails, TalentSearchItem } from "../types";

const CREDITS_PAGE_SIZE = 12;

type TalentDetailsModalProps = {
  item: TalentSearchItem | null;
  onClose: () => void;
  userId?: string;
  closeOnMediaOpen?: boolean;
  aboveMedia?: boolean;
};

const THUMB_PATH =
  "M7 10v10M7 10l3.5-6a2.5 2.5 0 0 1 2.4 3.2L12 10h6a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7";

const REACTION_LABELS: Partial<Record<RecommendationReaction, string>> = {
  superliked: "Me encanto",
  liked: "Me gusto",
  disliked: "No me gusto",
  watchlist: "Guardada"
};

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
  aboveMedia = false
}: TalentDetailsModalProps) {
  const { openMediaDetails } = useMediaDetails();
  const [details, setDetails] = useState<TalentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [visibleActingCredits, setVisibleActingCredits] = useState(CREDITS_PAGE_SIZE);
  const [visibleDirectingCredits, setVisibleDirectingCredits] = useState(CREDITS_PAGE_SIZE);
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);

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
    setVisibleActingCredits(CREDITS_PAGE_SIZE);
    setVisibleDirectingCredits(CREDITS_PAGE_SIZE);
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
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [item, onClose]);

  if (!item) {
    return null;
  }

  const reactionsByCredit = new Map(
    storedReactions.map((reaction) => [`${reaction.mediaType}-${reaction.tmdbId}`, reaction.reaction])
  );

  const modal = (
    <div
      className={`media-modal__backdrop media-modal__backdrop--talent ${aboveMedia ? "is-above-media" : ""}`}
      role="presentation"
      onClick={onClose}
    >
      <div className="media-modal__frame media-modal__frame--talent" role="presentation">
        <div
          className="media-modal__panel media-modal__panel--talent"
          role="presentation"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="media-modal media-modal--public talent-modal talent-modal--page">
            <div className="media-modal__toolbar">
              <button type="button" className="media-modal__back" onClick={onClose} aria-label="Volver">
                ←
              </button>
            </div>

            {isLoading || !details ? (
              <div className="media-modal__loading">Cargando ficha de talento...</div>
            ) : (
              <>
                <div className="media-modal__hero talent-modal__hero">
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

                {details.actingCredits.length ? (
                  <section className="media-modal__section">
                    <p className="section-eyebrow">Como actor / actriz</p>
                    <div className="talent-modal__credits">
                      {details.actingCredits.slice(0, visibleActingCredits).map((credit) => (
                        <article
                          className="talent-modal__credit talent-modal__credit--interactive"
                          key={`cast-${credit.mediaType}-${credit.id}`}
                          onClick={() => {
                            openMediaDetails({
                              id: credit.id,
                              mediaType: credit.mediaType,
                              title: credit.title
                            });
                            if (closeOnMediaOpen) {
                              onClose();
                            }
                          }}
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
                    {visibleActingCredits < details.actingCredits.length ? (
                      <button
                        type="button"
                        className="talent-modal__load-more"
                        onClick={() => setVisibleActingCredits((count) => count + CREDITS_PAGE_SIZE)}
                      >
                        Ver mas ({Math.min(CREDITS_PAGE_SIZE, details.actingCredits.length - visibleActingCredits)})
                      </button>
                    ) : null}
                  </section>
                ) : null}

                {details.directingCredits.length ? (
                  <section className="media-modal__section">
                    <p className="section-eyebrow">Como director / directora</p>
                    <div className="talent-modal__credits">
                      {details.directingCredits.slice(0, visibleDirectingCredits).map((credit) => (
                        <article
                          className="talent-modal__credit talent-modal__credit--interactive"
                          key={`crew-${credit.mediaType}-${credit.id}`}
                          onClick={() => {
                            openMediaDetails({
                              id: credit.id,
                              mediaType: credit.mediaType,
                              title: credit.title
                            });
                            if (closeOnMediaOpen) {
                              onClose();
                            }
                          }}
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
                    {visibleDirectingCredits < details.directingCredits.length ? (
                      <button
                        type="button"
                        className="talent-modal__load-more"
                        onClick={() => setVisibleDirectingCredits((count) => count + CREDITS_PAGE_SIZE)}
                      >
                        Ver mas ({Math.min(CREDITS_PAGE_SIZE, details.directingCredits.length - visibleDirectingCredits)})
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
