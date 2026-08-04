import { useEffect, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { getTalentDetails } from "../lib/tmdb";
import type { TalentDetails, TalentSearchItem } from "../types";

type TalentDetailsModalProps = {
  item: TalentSearchItem | null;
  onClose: () => void;
};

export function TalentDetailsModal({ item, onClose }: TalentDetailsModalProps) {
  const { openMediaDetails } = useMediaDetails();
  const [details, setDetails] = useState<TalentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <div className="media-modal__backdrop" role="presentation" onClick={onClose}>
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
                      {details.actingCredits.map((credit) => (
                        <article
                          className="talent-modal__credit talent-modal__credit--interactive"
                          key={`cast-${credit.mediaType}-${credit.id}`}
                          onClick={() => {
                            openMediaDetails({
                              id: credit.id,
                              mediaType: credit.mediaType,
                              title: credit.title
                            });
                            onClose();
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
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {details.directingCredits.length ? (
                  <section className="media-modal__section">
                    <p className="section-eyebrow">Como director / directora</p>
                    <div className="talent-modal__credits">
                      {details.directingCredits.map((credit) => (
                        <article
                          className="talent-modal__credit talent-modal__credit--interactive"
                          key={`crew-${credit.mediaType}-${credit.id}`}
                          onClick={() => {
                            openMediaDetails({
                              id: credit.id,
                              mediaType: credit.mediaType,
                              title: credit.title
                            });
                            onClose();
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
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
