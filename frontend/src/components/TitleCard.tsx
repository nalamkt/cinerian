import { useEffect, useRef, useState } from "react";
import { isRatedReaction, type RatedReaction, type RecommendationReaction } from "../lib/reactions";
import { WatchNowRow } from "./WatchNowRow";
import type { DiscoveryItem } from "../types";

type TitleCardProps = {
  item: DiscoveryItem;
  reaction?: RecommendationReaction;
  onOpenDetails: () => void;
  onChangeRating?: (reaction: RatedReaction) => void;
  onRemove?: () => void;
  removeLabel?: string;
  isRemoving?: boolean;
};

const THUMB_PATH =
  "M7 10v10M7 10l3.5-6a2.5 2.5 0 0 1 2.4 3.2L12 10h6a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7";

const RATING_OPTIONS: Array<{ id: RatedReaction; label: string }> = [
  { id: "superliked", label: "Me encantó" },
  { id: "liked", label: "Me gustó" },
  { id: "disliked", label: "No me gustó" }
];

function Thumbs({ reaction }: { reaction: RatedReaction }) {
  const count = reaction === "superliked" ? 2 : 1;

  return (
    <span
      className={`title-card__thumbs ${reaction === "disliked" ? "title-card__thumbs--down" : ""}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <svg key={index} viewBox="0 0 24 24" aria-hidden="true">
          <path d={THUMB_PATH} />
        </svg>
      ))}
    </span>
  );
}

export function TitleCard({
  item,
  reaction,
  onOpenDetails,
  onChangeRating,
  onRemove,
  removeLabel = "Quitar",
  isRemoving = false
}: TitleCardProps) {
  const [menuState, setMenuState] = useState<"closed" | "menu" | "confirm">("closed");
  const cardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (menuState === "closed") {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setMenuState("closed");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuState("closed");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuState]);

  const ratedReaction = reaction && isRatedReaction(reaction) ? reaction : null;
  const canRate = Boolean(onChangeRating && ratedReaction);
  const canRemove = Boolean(onRemove);
  const currentLabel = ratedReaction
    ? RATING_OPTIONS.find((option) => option.id === ratedReaction)?.label
    : null;

  function pickRating(next: RatedReaction) {
    setMenuState("closed");
    if (next !== ratedReaction) {
      onChangeRating?.(next);
    }
  }

  function confirmRemove() {
    setMenuState("closed");
    onRemove?.();
  }

  return (
    <article ref={cardRef} className={`title-card ${menuState !== "closed" ? "is-menu-open" : ""}`}>
      <div className="title-card__poster-wrap">
        <img
          src={item.posterUrl}
          alt={item.title}
          className="title-card__poster"
          onClick={onOpenDetails}
        />

        {item.score > 0 ? (
          <span className="title-card__score">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7-5.4-4.7 7.1-.6z" />
            </svg>
            {item.score.toFixed(1)}
          </span>
        ) : null}
      </div>

      <strong className="title-card__title media-linklike" onClick={onOpenDetails}>
        {item.title}
      </strong>
      <span className="title-card__meta">
        {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
      </span>

      {canRate || canRemove ? (
        <button
          type="button"
          className={`title-card__reaction ${ratedReaction === "disliked" ? "is-muted" : ""}`}
          onClick={() => setMenuState((current) => (current === "closed" ? "menu" : "closed"))}
          aria-haspopup="menu"
          aria-expanded={menuState !== "closed"}
          aria-label={currentLabel ? `Tu puntuación: ${currentLabel}` : `Opciones de ${item.title}`}
        >
          {ratedReaction ? (
            <Thumbs reaction={ratedReaction} />
          ) : (
            <svg className="title-card__reaction-dots" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          )}
          <svg className="title-card__reaction-caret" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ) : null}

      <WatchNowRow item={item} />

      {menuState === "menu" ? (
        <div className="title-card__menu" role="menu">
          {canRate ? (
            <>
              <p className="title-card__menu-label">Tu puntuación</p>
              {RATING_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.id === ratedReaction}
                  className={`title-card__menu-option ${option.id === ratedReaction ? "is-current" : ""}`}
                  onClick={() => pickRating(option.id)}
                >
                  <Thumbs reaction={option.id} />
                  {option.label}
                  <svg className="title-card__menu-check" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </button>
              ))}
            </>
          ) : null}

          {canRate && canRemove ? <div className="title-card__menu-separator" /> : null}

          {canRemove ? (
            <button
              type="button"
              role="menuitem"
              className="title-card__menu-option title-card__menu-option--danger"
              onClick={() => setMenuState("confirm")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6 18 18" />
                <path d="M18 6 6 18" />
              </svg>
              {removeLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {menuState === "confirm" ? (
        <div className="title-card__menu" role="dialog" aria-modal="false">
          <p className="title-card__confirm-title">¿{removeLabel}?</p>
          <p className="title-card__confirm-body">
            {ratedReaction
              ? "Se va a desmarcar como vista y vas a perder la puntuación que le pusiste."
              : "Se va a sacar de tu lista."}
          </p>
          <div className="title-card__confirm-actions">
            <button
              type="button"
              className="title-card__confirm-button"
              onClick={() => setMenuState("menu")}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="title-card__confirm-button title-card__confirm-button--danger"
              disabled={isRemoving}
              onClick={confirmRemove}
            >
              Sí, quitar
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
