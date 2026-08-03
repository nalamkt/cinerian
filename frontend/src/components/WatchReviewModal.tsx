import { useEffect, useState } from "react";
import type { DiscoveryItem } from "../types";

type WatchReviewModalProps = {
  item: DiscoveryItem | null;
  isSaving?: boolean;
  onClose: () => void;
  onSubmit: (input: { liked: boolean; rating: number; comment: string }) => void;
};

export function WatchReviewModal({ item, isSaving = false, onClose, onSubmit }: WatchReviewModalProps) {
  const [liked, setLiked] = useState<boolean | null>(true);
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!item) {
      return;
    }

    setLiked(true);
    setRating(4);
    setComment("");
  }, [item]);

  if (!item) {
    return null;
  }

  return (
    <div className="review-modal__backdrop" role="presentation" onClick={onClose}>
      <div className="review-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="review-modal__header">
          <div>
            <p className="section-eyebrow">Ya la viste</p>
            <h3>{item.title}</h3>
          </div>
          <button type="button" className="review-modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <p className="review-modal__question">¿Que te parecio?</p>

        <div className="review-modal__sentiment">
          <button
            type="button"
            className={`review-modal__sentiment-button ${liked === true ? "is-active" : ""}`}
            onClick={() => setLiked(true)}
          >
            <span>👍</span>
            <strong>Me gusto</strong>
          </button>
          <button
            type="button"
            className={`review-modal__sentiment-button ${liked === false ? "is-active" : ""}`}
            onClick={() => setLiked(false)}
          >
            <span>👎</span>
            <strong>No me gusto</strong>
          </button>
        </div>

        <div className="review-modal__stars" aria-label={`Puntaje ${rating} de 5`}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className={`review-modal__star ${value <= rating ? "is-active" : ""}`}
              onClick={() => setRating(value)}
              aria-label={`${value} estrellas`}
            >
              ★
            </button>
          ))}
        </div>

        <textarea
          className="review-modal__textarea"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="¿Queres agregar algo? (opcional)"
        />

        <div className="review-modal__actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onSubmit({ liked: liked !== false, rating, comment })}
            disabled={isSaving}
          >
            Publicar reseña
          </button>
        </div>
      </div>
    </div>
  );
}
