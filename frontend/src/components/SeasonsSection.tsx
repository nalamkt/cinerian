import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { getSeasonEpisodes } from "../lib/tmdb";
import {
  getWatchedEpisodes,
  hydrateWatchedEpisodes,
  setEpisodeWatched,
  setSeasonWatched,
  subscribeToWatchedEpisodes
} from "../lib/episodeWatched";
import { computeNextEpisode } from "../lib/nextEpisode";
import type { EpisodeSummary, SeasonSummary, EpisodeReference } from "../types";

const INITIAL_VISIBLE = 2;

type SeasonsSectionProps = {
  showId: number;
  showTitle: string;
  seasons: SeasonSummary[];
  onOpenEpisode: (ref: EpisodeReference) => void;
  userId: string | null;
};

export function SeasonsSection({ showId, showTitle, seasons, onOpenEpisode, userId }: SeasonsSectionProps) {
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, EpisodeSummary[]>>({});
  const [loadingSeasons, setLoadingSeasons] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [watchedKeys, setWatchedKeys] = useState<Set<string>>(() => getWatchedEpisodes(userId, showId));

  useEffect(() => {
    setWatchedKeys(getWatchedEpisodes(userId, showId));
    if (userId) {
      void hydrateWatchedEpisodes(userId, showId);
    }
    const unsubscribe = subscribeToWatchedEpisodes(() => {
      setWatchedKeys(getWatchedEpisodes(userId, showId));
    });
    return unsubscribe;
  }, [showId, userId]);

  const visibleSeasons = useMemo(() => {
    if (showAll || seasons.length <= INITIAL_VISIBLE + 1) {
      return seasons;
    }
    return seasons.slice(0, INITIAL_VISIBLE + 1);
  }, [seasons, showAll]);

  const hiddenCount = seasons.length - visibleSeasons.length;

  async function handleToggleSeason(season: SeasonSummary) {
    if (expandedSeason === season.seasonNumber) {
      setExpandedSeason(null);
      return;
    }

    setExpandedSeason(season.seasonNumber);
    if (episodesBySeason[season.seasonNumber]) {
      return;
    }

    setLoadingSeasons((prev) => new Set(prev).add(season.seasonNumber));
    try {
      const episodes = await getSeasonEpisodes(showId, season.seasonNumber);
      setEpisodesBySeason((prev) => ({ ...prev, [season.seasonNumber]: episodes }));
    } finally {
      setLoadingSeasons((prev) => {
        const next = new Set(prev);
        next.delete(season.seasonNumber);
        return next;
      });
    }
  }

  function isSeasonFullyWatched(season: SeasonSummary) {
    const episodes = episodesBySeason[season.seasonNumber];
    if (!episodes || episodes.length === 0) {
      return false;
    }
    return episodes.every((episode) =>
      watchedKeys.has(`${showId}:${episode.seasonNumber}:${episode.episodeNumber}`)
    );
  }

  function handleToggleSeasonWatched(season: SeasonSummary) {
    if (!userId) return;
    const episodes = episodesBySeason[season.seasonNumber];
    if (!episodes || episodes.length === 0) {
      return;
    }
    const alreadyAll = isSeasonFullyWatched(season);
    void setSeasonWatched(
      userId,
      showId,
      season.seasonNumber,
      episodes.map((episode) => episode.episodeNumber),
      !alreadyAll
    );
  }

  const nextEpisode = useMemo(
    () => computeNextEpisode(showId, seasons, watchedKeys),
    [showId, seasons, watchedKeys]
  );
  const hasRegularSeasons = useMemo(
    () => seasons.some((season) => season.seasonNumber >= 1 && season.episodeCount > 0),
    [seasons]
  );
  const hasAnyWatched = watchedKeys.size > 0;
  const seriesFinished = !nextEpisode && hasRegularSeasons && hasAnyWatched;

  const nextEpisodeDetails = useMemo(() => {
    if (!nextEpisode) return null;
    const cached = episodesBySeason[nextEpisode.seasonNumber];
    return cached?.find((episode) => episode.episodeNumber === nextEpisode.episodeNumber) ?? null;
  }, [nextEpisode, episodesBySeason]);

  useEffect(() => {
    if (!nextEpisode) return;
    if (episodesBySeason[nextEpisode.seasonNumber]) return;
    if (loadingSeasons.has(nextEpisode.seasonNumber)) return;

    let cancelled = false;
    setLoadingSeasons((prev) => new Set(prev).add(nextEpisode.seasonNumber));
    getSeasonEpisodes(showId, nextEpisode.seasonNumber)
      .then((episodes) => {
        if (cancelled) return;
        setEpisodesBySeason((prev) => ({ ...prev, [nextEpisode.seasonNumber]: episodes }));
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingSeasons((prev) => {
          const next = new Set(prev);
          next.delete(nextEpisode.seasonNumber);
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextEpisode?.seasonNumber, showId]);

  if (!seasons.length) {
    return null;
  }

  return (
    <section className="media-modal__section">
      {nextEpisode ? (
        <NextEpisodeCard
          showId={showId}
          userId={userId}
          next={nextEpisode}
          episode={nextEpisodeDetails}
          onOpen={() =>
            onOpenEpisode({
              showId,
              showTitle,
              seasonNumber: nextEpisode.seasonNumber,
              episodeNumber: nextEpisode.episodeNumber
            })
          }
        />
      ) : seriesFinished ? (
        <div className="media-modal__next-episode media-modal__next-episode--done">
          <div className="media-modal__next-episode-copy">
            <span className="media-modal__next-episode-eyebrow">Terminada</span>
            <strong>Marcaste todos los episodios como vistos</strong>
          </div>
        </div>
      ) : null}
      <p className="section-eyebrow media-modal__seasons-title">
        {seasons.length} {seasons.length === 1 ? "temporada" : "temporadas"}
      </p>
      <div className="media-modal__seasons">
        {visibleSeasons.map((season) => {
          const isExpanded = expandedSeason === season.seasonNumber;
          const episodes = episodesBySeason[season.seasonNumber];
          const fullyWatched = isSeasonFullyWatched(season);
          const isLoading = loadingSeasons.has(season.seasonNumber);
          return (
            <article
              key={season.id}
              className={`media-modal__season ${isExpanded ? "is-expanded" : ""}`}
            >
              <div className="media-modal__season-row">
                <button
                  type="button"
                  className="media-modal__season-main"
                  onClick={() => handleToggleSeason(season)}
                  aria-expanded={isExpanded}
                >
                  {season.posterUrl ? (
                    <img
                      src={season.posterUrl}
                      alt={season.name}
                      className="media-modal__season-poster"
                    />
                  ) : (
                    <div className="media-modal__season-poster media-modal__season-poster--empty">
                      <span>📺</span>
                    </div>
                  )}
                  <div className="media-modal__season-copy">
                    <span className="media-modal__season-name">
                      {season.name.toUpperCase()}
                      <span className="media-modal__season-chevron" aria-hidden="true">
                        {isExpanded ? "⌃" : "⌄"}
                      </span>
                    </span>
                    {season.airDateLabel ? (
                      <span className="media-modal__season-meta">{season.airDateLabel}</span>
                    ) : null}
                    <span className="media-modal__season-meta">
                      {season.episodeCount} {season.episodeCount === 1 ? "episodio" : "episodios"}
                    </span>
                  </div>
                </button>
                {episodes && userId ? (
                  <button
                    type="button"
                    className={`media-modal__season-watched ${
                      fullyWatched ? "is-active" : ""
                    }`}
                    onClick={() => handleToggleSeasonWatched(season)}
                    aria-label={fullyWatched ? "Desmarcar temporada" : "Marcar temporada como vista"}
                  >
                    ✓
                  </button>
                ) : null}
              </div>
              {isExpanded ? (
                <div className="media-modal__episodes">
                  {isLoading ? (
                    <p className="media-modal__episodes-loading">Cargando episodios…</p>
                  ) : episodes && episodes.length ? (
                    episodes.map((episode) => {
                      const key = `${showId}:${episode.seasonNumber}:${episode.episodeNumber}`;
                      const watched = watchedKeys.has(key);
                      return (
                        <button
                          type="button"
                          className="media-modal__episode"
                          key={episode.id}
                          onClick={() =>
                            onOpenEpisode({
                              showId,
                              showTitle,
                              seasonNumber: episode.seasonNumber,
                              episodeNumber: episode.episodeNumber
                            })
                          }
                        >
                          {episode.stillUrl ? (
                            <img
                              src={episode.stillUrl}
                              alt={episode.name}
                              className="media-modal__episode-still"
                            />
                          ) : (
                            <div className="media-modal__episode-still media-modal__episode-still--empty" />
                          )}
                          <div className="media-modal__episode-copy">
                            <strong>
                              {episode.seasonNumber}x{String(episode.episodeNumber).padStart(2, "0")} · {episode.name}
                            </strong>
                            {episode.score ? (
                              <span className="media-modal__episode-score-badge">
                                {episode.score.toFixed(1)} TMDB
                              </span>
                            ) : null}
                            <span className="media-modal__episode-meta">
                              {[episode.airDateLabel, episode.runtimeLabel]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                          {userId ? (
                            <span
                              className={`media-modal__episode-watched ${watched ? "is-active" : ""}`}
                              role="button"
                              aria-label={watched ? "Desmarcar episodio" : "Marcar episodio como visto"}
                              onClick={(event) => {
                                event.stopPropagation();
                                void setEpisodeWatched(
                                  userId,
                                  showId,
                                  episode.seasonNumber,
                                  episode.episodeNumber,
                                  !watched
                                );
                              }}
                            >
                              ✓
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  ) : (
                    <p className="media-modal__episodes-loading">Sin episodios disponibles.</p>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="media-modal__seasons-more"
          onClick={() => setShowAll(true)}
        >
          Ver {hiddenCount} {hiddenCount === 1 ? "temporada más" : "temporadas más"}
        </button>
      ) : null}
    </section>
  );
}

type NextEpisodeCardProps = {
  showId: number;
  userId: string | null;
  next: { seasonNumber: number; episodeNumber: number; isStart: boolean };
  episode: EpisodeSummary | null;
  onOpen: () => void;
};

function NextEpisodeCard({ showId, userId, next, episode, onOpen }: NextEpisodeCardProps) {
  const code = `T${next.seasonNumber}E${String(next.episodeNumber).padStart(2, "0")}`;
  const eyebrow = next.isStart ? "Empezá por" : "Siguiente episodio";

  function handleMarkWatched(event: MouseEvent) {
    event.stopPropagation();
    if (!userId) return;
    void setEpisodeWatched(userId, showId, next.seasonNumber, next.episodeNumber, true);
  }

  return (
    <button type="button" className="media-modal__next-episode" onClick={onOpen}>
      {episode?.stillUrl ? (
        <img
          src={episode.stillUrl}
          alt={episode.name}
          className="media-modal__next-episode-still"
        />
      ) : (
        <div className="media-modal__next-episode-still media-modal__next-episode-still--empty">
          <span>📺</span>
        </div>
      )}
      <div className="media-modal__next-episode-copy">
        <span className="media-modal__next-episode-eyebrow">{eyebrow}</span>
        <strong>
          {code}
          {episode?.name ? ` · ${episode.name}` : ""}
        </strong>
        {episode ? (
          <span className="media-modal__next-episode-meta">
            {[episode.airDateLabel, episode.runtimeLabel].filter(Boolean).join(" · ")}
          </span>
        ) : (
          <span className="media-modal__next-episode-meta">Cargando…</span>
        )}
      </div>
      {userId ? (
        <span
          className="media-modal__next-episode-action"
          role="button"
          aria-label="Marcar como visto"
          onClick={handleMarkWatched}
        >
          ✓
        </span>
      ) : null}
    </button>
  );
}
