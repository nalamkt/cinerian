import { useEffect, useState } from "react";
import type { RatedReaction } from "../lib/reactions";
import type { DiscoveryItem } from "../types";

type WatchReviewModalProps = {
  item: DiscoveryItem | null;
  isSaving?: boolean;
  onClose: () => void;
  onSubmit: (input: { reaction: RatedReaction; comment: string }) => void;
};

/**
 * Las tres opciones van de menor a mayor entusiasmo. Leidas de izquierda a
 * derecha se entienden como una escala y no como tres acciones sueltas, que es
 * lo que hace que "Me encanto" se lea como el tope y no como otra funcion.
 */
const OPTIONS: Array<{ id: RatedReaction; label: string; thumbs: 1 | 2; down?: boolean }> = [
  { id: "disliked", label: "No me gustó", thumbs: 1, down: true },
  { id: "liked", label: "Me gustó", thumbs: 1 },
  { id: "superliked", label: "Me encantó", thumbs: 2 }
];

const THUMB_UP = "M7 10v10M7 10l3.5-6a2.5 2.5 0 0 1 2.4 3.2L12 10h6a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7";
const THUMB_DOWN = "M17 14V4M17 14l-3.5 6a2.5 2.5 0 0 1-2.4-3.2L12 14H6a2 2 0 0 1-2-2.4l1.2-6A2 2 0 0 1 7.2 4H17";

function ThumbIcon({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={down ? THUMB_DOWN : THUMB_UP} />
    </svg>
  );
}

export function WatchReviewModal({ item, isSaving = false, onClose, onSubmit }: WatchReviewModalProps) {
  const [reaction, setReaction] = useState<RatedReaction | null>(null);
  const [comment, setComment] = useState("");
  const [isCommentOpen, setIsCommentOpen] = useState(false);

  useEffect(() => {
    if (!item) {
      return;
    }

    setReaction(null);
    setComment("");
    setIsCommentOpen(false);
  }, [item]);

  useEffect(() => {
    if (!item) {
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [item, onClose]);

  if (!item) {
    return null;
  }

  const hasComment = comment.trim().length > 0;

  return (
    <div className="review-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Que te parecio ${item.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="review-modal__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>

        <p className="review-modal__kicker">Ya la viste · ¿Qué te pareció?</p>

        <div className="review-modal__head">
          {item.posterUrl ? (
            <img src={item.posterUrl} alt="" className="review-modal__thumb" />
          ) : null}
          <div className="review-modal__head-copy">
            <h3>{item.title}</h3>
            <p>
              {item.mediaType === "tv" ? "Serie" : "Película"}
              {item.year ? ` · ${item.year}` : ""}
            </p>
          </div>
        </div>

        <div className="review-modal__scale" role="group" aria-label="¿Qué te pareció?">
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`review-option ${option.id === "superliked" ? "review-option--love" : ""}`}
              aria-pressed={reaction === option.id}
              onClick={() => setReaction(option.id)}
              disabled={isSaving}
            >
              <span className="review-option__icons">
                <ThumbIcon down={option.down} />
                {option.thumbs === 2 ? <ThumbIcon /> : null}
              </span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>

        <div className="review-modal__comment">
          {isCommentOpen ? (
            <textarea
              className="review-modal__textarea"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="¿Qué te llevaste de esta película?"
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="review-modal__comment-toggle"
              onClick={() => setIsCommentOpen(true)}
              aria-expanded={false}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Agregar un comentario
            </button>
          )}
        </div>

        <div className="review-modal__actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => reaction && onSubmit({ reaction, comment })}
            disabled={isSaving || !reaction}
          >
            {isSaving ? "Guardando…" : hasComment ? "Publicar reseña" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
