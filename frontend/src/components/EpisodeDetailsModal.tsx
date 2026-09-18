import { useEffect, useMemo, useState } from "react";
import { getSeasonEpisodes } from "../lib/tmdb";
import {
  getEpisodeWatchedAt,
  hydrateWatchedEpisodes,
  setEpisodeWatched,
  subscribeToWatchedEpisodes
} from "../lib/episodeWatched";
import type { EpisodeReference, EpisodeSummary } from "../types";

type EpisodeDetailsModalProps = {
  reference: EpisodeReference | null;
  userId: string | null;
  onClose: () => void;
};

function formatWatchedShort(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(1, "0");
  const month = String(date.getMonth() + 1).padStart(1, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function EpisodeDetailsModal({ reference, userId, onClose }: EpisodeDetailsModalProps) {
  const [episode, setEpisode] = useState<EpisodeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [watchedAt, setWatchedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setEpisode(null);
      setWatchedAt(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setEpisode(null);

    getSeasonEpisodes(reference.showId, reference.seasonNumber)
      .then((episodes) => {
        if (!isMounted) return;
        const match = episodes.find(
          (candidate) => candidate.episodeNumber === reference.episodeNumber
        );
        setEpisode(match ?? null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    if (userId) {
      void hydrateWatchedEpisodes(userId, reference.showId);
    }
    setWatchedAt(
      getEpisodeWatchedAt(userId, reference.showId, reference.seasonNumber, reference.episodeNumber)
    );
    const unsubscribe = subscribeToWatchedEpisodes(() => {
      if (!isMounted || !reference) return;
      setWatchedAt(
        getEpisodeWatchedAt(userId, reference.showId, reference.seasonNumber, reference.episodeNumber)
      );
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [reference, userId]);

  const isPilot = reference?.seasonNumber === 1 && reference?.episodeNumber === 1;
  const metaParts = useMemo(() => {
    if (!episode) return [] as string[];
    const items: string[] = [];
    if (episode.airDateLabel) items.push(episode.airDateLabel);
    if (episode.runtimeLabel) items.push(episode.runtimeLabel);
    if (episode.score) items.push(`★ ${episode.score.toFixed(1)}`);
    if (isPilot) items.push("ESTRENO");
    return items;
  }, [episode, isPilot]);

  if (!reference) {
    return null;
  }

  function handleToggleWatched() {
    if (!reference || !userId) return;
    const nowWatched = !watchedAt;
    void setEpisodeWatched(
      userId,
      reference.showId,
      reference.seasonNumber,
      reference.episodeNumber,
      nowWatched
    );
  }

  return (
    <div
      className="media-modal__backdrop episode-modal__backdrop"
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
        <div
          className="media-modal__panel episode-modal__panel"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
              return;
            }
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="episode-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
          <div
            className="episode-modal__hero"
            style={
              episode?.stillUrl
                ? {
                    backgroundImage: `linear-gradient(180deg, rgba(11, 10, 8, 0.05), rgba(17, 14, 10, 0.85)), url(${episode.stillUrl})`
                  }
                : undefined
            }
          />
          <div className="episode-modal__body">
            <button type="button" className="episode-modal__breadcrumb">
              {reference.showTitle.toUpperCase()}
              <span aria-hidden="true"> ›</span>
            </button>

            {loading && !episode ? (
              <p className="media-modal__loading">Cargando episodio…</p>
            ) : episode ? (
              <>
                <h2 className="episode-modal__title">
                  {episode.seasonNumber}x{String(episode.episodeNumber).padStart(2, "0")}: {episode.name}
                </h2>
                {metaParts.length ? (
                  <p className="episode-modal__meta">{metaParts.join(" • ")}</p>
                ) : null}
                {episode.overview ? (
                  <p className="episode-modal__overview">{episode.overview}</p>
                ) : null}

                <div className="episode-modal__actions">
                  <button
                    type="button"
                    className={`episode-modal__action ${watchedAt ? "is-primary" : ""}`}
                    onClick={handleToggleWatched}
                    disabled={!userId}
                  >
                    {watchedAt ? `Vista ${formatWatchedShort(watchedAt)}` : "Marcar vista"}
                  </button>
                  <button type="button" className="episode-modal__action is-outline" disabled>
                    Compartir
                  </button>
                </div>

                <div className="episode-modal__placeholder">
                  <strong>Valora este episodio</strong>
                  <p>Proximamente vas a poder puntuarlo y contar como te hizo sentir.</p>
                </div>
              </>
            ) : (
              <p className="media-modal__empty">No pudimos cargar este episodio.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
