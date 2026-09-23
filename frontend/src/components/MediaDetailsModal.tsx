import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { EpisodeDetailsModal } from "./EpisodeDetailsModal";
import { SeasonsSection } from "./SeasonsSection";
import { SendRecommendationModal } from "./SendRecommendationModal";
import { TalentDetailsModal } from "./TalentDetailsModal";
import { TitleReactionListModal } from "./TitleReactionListModal";
import { WatchReviewModal } from "./WatchReviewModal";
import { getRatedReactionLabel, RatedReactionIcon } from "./RatedReactionIcon";
import { fetchProfileSummaries, type ProfileSummary } from "../lib/auth";
import { createFeedPost, fetchFeedPosts, removeFeedEvent } from "../lib/feed";
import { fetchFollowingUserIds } from "../lib/follows";
import { getProviderSearchUrl } from "../lib/providerLinks";
import { buildSharedProfilePath } from "../lib/profileShare";
import {
  fetchTitleReactionSummary,
  fetchStoredReactions,
  isRatedReaction,
  REACTIONS_UPDATED_EVENT,
  removeStoredRatedReaction,
  removeStoredReaction,
  saveStoredReaction,
  type RatedReaction
} from "../lib/reactions";
import { buildWatchedPostBody } from "../lib/reviews";
import { buildSharedMediaUrl, shareMediaLink } from "../lib/share";
import { getSeasonCast, getTitleById, getTitleDetails } from "../lib/tmdb";
import type { EpisodeReference, FeedEntry, MediaDetails, DiscoveryItem, TalentSearchItem } from "../types";

export type MediaReference = Pick<DiscoveryItem, "id" | "mediaType" | "title">;

type MediaDetailsContextValue = {
  openMediaDetails: (item: MediaReference) => void;
  pushMediaDetails: (item: MediaReference) => void;
};

const MediaDetailsContext = createContext<MediaDetailsContextValue | null>(null);

function parseFeedReview(body: string) {
  const match =
    body.match(/^(Le encanto|Le gusto|No le gusto) .+?(?:, le dio| y le dio) \d\/5 y dijo: "([\s\S]+)"\.?$/) ??
    body.match(/^(Le encanto|Le gusto|No le gusto) .+? y dijo: "([\s\S]+)"\.?$/);
  if (!match?.[2].trim()) {
    return null;
  }

  const reactionBySentiment: Record<string, RatedReaction> = {
    "Le encanto": "superliked",
    "Le gusto": "liked",
    "No le gusto": "disliked"
  };

  return {
    reaction: reactionBySentiment[match[1]],
    quote: match[2].trim()
  };
}

type CircleReaction = ProfileSummary & { reaction: RatedReaction };
type PositiveReaction = Extract<RatedReaction, "liked" | "superliked">;

type TitleSocialSummary = {
  likedCount: number;
  superlikedCount: number;
  friends: CircleReaction[];
};

function profileInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function describeCircleReaction(friends: CircleReaction[]) {
  const names = friends.map((friend) => friend.displayName);

  if (names.length === 1) {
    return `${names[0]} reaccionó a este título.`;
  }

  if (names.length === 2) {
    return `${names[0]} y ${names[1]} reaccionaron a este título.`;
  }

  return `${names[0]}, ${names[1]} y ${names.length - 2} más reaccionaron a este título.`;
}

type OpenUserProfile = (profile: { userId: string; username?: string }) => void;

type CircleFriendProfileLinkProps = {
  friend: CircleReaction;
  variant: "avatar" | "name";
  onOpenUserProfile?: OpenUserProfile;
  children: (image: {
    imageUrl: string;
    showInitials: boolean;
    onImageError: () => void;
  }) => ReactNode;
};

function CircleFriendProfileLink({
  friend,
  variant,
  onOpenUserProfile,
  children
}: CircleFriendProfileLinkProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUrl = friend.avatarUrl?.trim() ?? "";

  useEffect(() => {
    setHasImageError(false);
  }, [friend.avatarUrl]);

  const showInitials = !imageUrl || hasImageError;

  return (
    <a
      href={buildSharedProfilePath(friend.username)}
      className={`media-modal__friend-link media-modal__friend-link--${variant}`}
      onClick={(event) => {
        if (!onOpenUserProfile) {
          return;
        }

        event.preventDefault();
        onOpenUserProfile({ userId: friend.id, username: friend.username });
      }}
      aria-label={`Ver el perfil de ${friend.displayName}`}
    >
      {children({
        imageUrl,
        showInitials,
        onImageError: () => setHasImageError(true)
      })}
      <span className="media-modal__friend-preview" aria-hidden="true">
        <span className="media-modal__friend-preview-avatar">
          {showInitials ? (
            <span className="media-modal__friend-preview-initials">
              {profileInitials(friend.displayName)}
            </span>
          ) : (
            <img src={imageUrl} alt="" onError={() => setHasImageError(true)} />
          )}
        </span>
        <span className="media-modal__friend-preview-copy">
          <strong>{friend.displayName}</strong>
          <span>@{friend.username}</span>
          <span className="media-modal__friend-preview-reaction">
            <RatedReactionIcon reaction={friend.reaction} />
            {getRatedReactionLabel(friend.reaction)}
          </span>
        </span>
        <span className="media-modal__friend-preview-cta">Ver perfil</span>
      </span>
    </a>
  );
}

function CircleFriendAvatar({
  friend,
  onOpenUserProfile
}: {
  friend: CircleReaction;
  onOpenUserProfile?: OpenUserProfile;
}) {
  return (
    <CircleFriendProfileLink friend={friend} variant="avatar" onOpenUserProfile={onOpenUserProfile}>
      {({ imageUrl, showInitials, onImageError }) => (
        <span className="media-modal__friend-avatar">
          {showInitials ? (
            <span className="media-modal__friend-initials" aria-hidden="true">
              {profileInitials(friend.displayName)}
            </span>
          ) : (
            <img src={imageUrl} alt="" onError={onImageError} />
          )}
          <span className="media-modal__friend-reaction" aria-hidden="true">
            <RatedReactionIcon reaction={friend.reaction} />
          </span>
        </span>
      )}
    </CircleFriendProfileLink>
  );
}

function CircleReactionDescription({
  friends,
  onOpenUserProfile
}: {
  friends: CircleReaction[];
  onOpenUserProfile?: OpenUserProfile;
}) {
  const nameLink = (friend: CircleReaction) => (
    <CircleFriendProfileLink
      friend={friend}
      key={friend.id}
      variant="name"
      onOpenUserProfile={onOpenUserProfile}
    >
      {() => friend.displayName}
    </CircleFriendProfileLink>
  );

  if (friends.length === 1) {
    return <p>{nameLink(friends[0])} reaccionó a este título.</p>;
  }

  if (friends.length === 2) {
    return (
      <p>
        {nameLink(friends[0])} y {nameLink(friends[1])} reaccionaron a este título.
      </p>
    );
  }

  return (
    <p>
      {nameLink(friends[0])}, {nameLink(friends[1])} y {friends.length - 2} más reaccionaron a este título.
    </p>
  );
}

function useTitleSocialSummary(item: MediaReference | null, userId?: string) {
  const [summary, setSummary] = useState<TitleSocialSummary | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const itemId = item?.id;
  const mediaType = item?.mediaType;

  useEffect(() => {
    const currentItem = itemId == null || !mediaType ? null : { id: itemId, mediaType };
    if (!currentItem) {
      setSummary(null);
      return;
    }
    const titleReference: Pick<DiscoveryItem, "id" | "mediaType"> = currentItem;

    let isMounted = true;

    async function load() {
      setSummary(null);

      try {
        // Los totales se pueden mostrar aunque todavía no siga a nadie. Si la
        // lectura de follows falla, la señal global no desaparece por eso.
        const followingIds = userId
          ? await fetchFollowingUserIds(userId).catch(() => [])
          : [];
        const reactionSummary = await fetchTitleReactionSummary(titleReference, followingIds);
        const profileIds = [...new Set(reactionSummary.friends.map((friend) => friend.userId))];
        const profiles = await fetchProfileSummaries(profileIds).catch(() => []);
        const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

        if (!isMounted) {
          return;
        }

        setSummary({
          likedCount: reactionSummary.likedCount,
          superlikedCount: reactionSummary.superlikedCount,
          friends: reactionSummary.friends
            .map((friend) => {
              const profile = profileById.get(friend.userId);
              return profile ? { ...profile, reaction: friend.reaction } : null;
            })
            .filter((friend): friend is CircleReaction => friend !== null)
        });
      } catch {
        if (isMounted) {
          setSummary(null);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [itemId, mediaType, refreshVersion, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    function refreshAfterOwnReaction(event: Event) {
      const updatedUserId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (updatedUserId === userId) {
        setRefreshVersion((version) => version + 1);
      }
    }

    window.addEventListener(REACTIONS_UPDATED_EVENT, refreshAfterOwnReaction);
    return () => window.removeEventListener(REACTIONS_UPDATED_EVENT, refreshAfterOwnReaction);
  }, [userId]);

  return summary;
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
              providers: fallbackItem.providers.map((name) => ({
                id: 0,
                name,
                logoUrl: null,
                url: getProviderSearchUrl(name, fallbackItem.title)
              })),
              releaseDate: fallbackItem.releaseDate ?? null,
              isTheatrical: false,
              runtimeLabel: null,
              releaseLabel: null,
              countryLabel: null,
              languageLabel: null,
              certification: null,
              directorLabel: null,
              budgetLabel: null,
              trailerUrl: null,
              creators: [],
              previousInstallments: [],
              cast: [],
              crew: [],
              seasons: []
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
              .filter((post) => post.type === "rating")
              .filter((post) => post.tmdbId === currentItem.id && post.mediaType === currentItem.mediaType)
              .filter((post) => Boolean(parseFeedReview(post.body)))
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
  socialSummary?: TitleSocialSummary | null;
  isLoading: boolean;
  hasFailed?: boolean;
  onClose?: () => void;
  onShare?: () => void;
  shareLabel?: string;
  onSave?: () => void;
  saveLabel?: string;
  onWatched?: () => void;
  watchedLabel?: string;
  watchedReaction?: RatedReaction | null;
  canSave?: boolean;
  canMarkWatched?: boolean;
  publicCta?: ReactNode;
  publicMode?: boolean;
  onOpenTalent?: (talent: TalentSearchItem) => void;
  onOpenEpisode?: (reference: EpisodeReference) => void;
  onOpenMedia?: (item: MediaReference) => void;
  onOpenReactionList?: (reaction: PositiveReaction) => void;
  onOpenUserProfile?: OpenUserProfile;
  userId?: string;
};

export function MediaDetailsSheet({
  item,
  details,
  feedPosts,
  socialSummary = null,
  isLoading,
  hasFailed = false,
  onClose,
  onShare,
  shareLabel,
  onSave,
  saveLabel,
  onWatched,
  watchedLabel,
  watchedReaction,
  canSave = false,
  canMarkWatched = false,
  publicCta,
  publicMode = false,
  onOpenTalent,
  onOpenEpisode,
  onOpenMedia,
  onOpenReactionList,
  onOpenUserProfile,
  userId
}: MediaDetailsSheetProps) {
  // En series, el reparto se consulta por temporada para no cargar el historial completo.
  const crewList = useMemo(() => {
    if (!details) {
      return [];
    }
    if (details.crew.length) {
      return details.crew;
    }
    return details.creators.map((person) => ({
      id: person.id,
      name: person.name,
      roleLabel: person.roleLabel ?? (details.mediaType === "movie" ? "Director" : "Creador / Creadora"),
      profileUrl: person.profileUrl
    }));
  }, [details]);
  const [creditsTab, setCreditsTab] = useState<"cast" | "crew">("cast");
  useEffect(() => {
    if (!details) {
      return;
    }
    const hasSeasonalCast =
      details.mediaType === "tv" && details.seasons.some((season) => season.seasonNumber > 0);
    if (!details.cast.length && !hasSeasonalCast && crewList.length) {
      setCreditsTab("crew");
    } else {
      setCreditsTab("cast");
    }
  }, [details, crewList.length]);
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
  const isUpcoming = Boolean(details?.releaseDate && new Date(`${details.releaseDate}T12:00:00`).getTime() > Date.now());
  const hasSocialReactionData = Boolean(
    socialSummary &&
      (socialSummary.friends.length || socialSummary.likedCount || socialSummary.superlikedCount)
  );
  const tvCastSeasons = useMemo(() => {
    if (!details || details.mediaType !== "tv") {
      return [];
    }

    return details.seasons
      .filter((season) => season.seasonNumber > 0)
      .sort((left, right) => right.seasonNumber - left.seasonNumber);
  }, [details]);
  const [castSeasonNumber, setCastSeasonNumber] = useState<number | null>(null);
  const [castSeasonShowId, setCastSeasonShowId] = useState<number | null>(null);
  const [seasonCast, setSeasonCast] = useState<MediaDetails["cast"] | null>(null);
  const [isSeasonCastLoading, setIsSeasonCastLoading] = useState(false);
  const [hasSeasonCastFailed, setHasSeasonCastFailed] = useState(false);

  useEffect(() => {
    if (!details || details.mediaType !== "tv") {
      setCastSeasonNumber(null);
      setCastSeasonShowId(null);
      setSeasonCast(null);
      setIsSeasonCastLoading(false);
      setHasSeasonCastFailed(false);
      return;
    }

    const today = Date.now();
    const latestReleasedSeason = tvCastSeasons.find((season) => {
      if (!season.airDate) {
        return true;
      }

      const timestamp = new Date(`${season.airDate}T12:00:00`).getTime();
      return !Number.isFinite(timestamp) || timestamp <= today;
    });
    const selectedSeason = latestReleasedSeason ?? tvCastSeasons[0] ?? null;

    setCastSeasonNumber(selectedSeason?.seasonNumber ?? null);
    setCastSeasonShowId(selectedSeason ? details.id : null);
    setSeasonCast(null);
    setHasSeasonCastFailed(false);
  }, [details?.id, details?.mediaType, tvCastSeasons]);

  useEffect(() => {
    if (
      !details ||
      details.mediaType !== "tv" ||
      castSeasonNumber === null ||
      castSeasonShowId !== details.id
    ) {
      return;
    }

    let isMounted = true;
    setIsSeasonCastLoading(true);
    setSeasonCast(null);
    setHasSeasonCastFailed(false);

    void getSeasonCast(details.id, castSeasonNumber)
      .then((cast) => {
        if (isMounted) {
          setSeasonCast(cast);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSeasonCast([]);
          setHasSeasonCastFailed(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSeasonCastLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [castSeasonNumber, castSeasonShowId, details?.id, details?.mediaType]);
  const visibleCast =
    details?.mediaType === "tv" && castSeasonShowId === details.id && castSeasonNumber !== null
      ? seasonCast ?? []
      : details?.cast ?? [];
  const hasCast = Boolean(
    details && (details.mediaType === "tv" ? tvCastSeasons.length || details.cast.length : details.cast.length)
  );

  if (!item) {
    return null;
  }

  return (
    <div className={`media-modal ${publicMode ? "media-modal--public" : ""}`} role="dialog" aria-modal={!publicMode}>
      <div className="media-modal__toolbar">
        {onClose ? (
          <button
            type="button"
            className="media-modal__back"
            onClick={onClose}
            aria-label="Volver"
            data-escape-dismiss
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
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
                    backgroundImage: `linear-gradient(180deg, rgba(11, 10, 8, 0.15) 0%, rgba(11, 10, 8, 0.35) 45%, rgba(11, 10, 8, 0.78) 75%, rgba(11, 10, 8, 0.94) 100%), url(${details.backdropUrl})`
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
                {isUpcoming || details.isTheatrical || details.providers.length ? (
                  <div className="media-modal__providers">
                    {details.providers.length && !isUpcoming && !details.isTheatrical ? (
                      <span className="media-modal__providers-label">Donde ver:</span>
                    ) : null}
                    {isUpcoming ? <span className="media-modal__availability-badge">Próximamente</span> : null}
                    {details.isTheatrical ? <span className="media-modal__availability-badge">Solo en cines</span> : null}
                    {details.providers.map((provider) => (
                      <a
                        key={`${provider.id}-${provider.name}`}
                        href={provider.url || getProviderSearchUrl(provider.name, details.title)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {provider.logoUrl ? <img src={provider.logoUrl} alt="" aria-hidden="true" /> : null}
                        {provider.name}
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
                        watchedReaction ? "recommendation-action-button--primary" : ""
                      }`}
                      onClick={onWatched}
                      data-tooltip={watchedLabel ?? "Ya la vi"}
                      aria-label={watchedLabel ?? "Ya la vi"}
                    >
                      <RatedReactionIcon reaction={watchedReaction} />
                    </button>
                    <span className="media-modal__action-label">{watchedLabel ?? "Ya la vi"}</span>
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

          {hasSocialReactionData && socialSummary ? (
            <section className="media-modal__section media-modal__section--social">
              <p className="section-eyebrow">Reacciones cinerianas</p>
              <div className="media-modal__social-reactions">
                {socialSummary.friends.length ? (
                  <div className="media-modal__circle-reactions">
                    <div className="media-modal__friend-avatars" aria-label={describeCircleReaction(socialSummary.friends)}>
                      {socialSummary.friends.map((friend) => (
                        <CircleFriendAvatar
                          friend={friend}
                          key={friend.id}
                          onOpenUserProfile={onOpenUserProfile}
                        />
                      ))}
                    </div>
                    <CircleReactionDescription
                      friends={socialSummary.friends}
                      onOpenUserProfile={onOpenUserProfile}
                    />
                  </div>
                ) : null}

                {socialSummary.likedCount || socialSummary.superlikedCount ? (
                  <div className="media-modal__reaction-totals" aria-label="Totales de reacciones en Cinerian">
                    {socialSummary.likedCount ? (
                      <button
                        type="button"
                        onClick={() => onOpenReactionList?.("liked")}
                        disabled={!onOpenReactionList}
                        aria-label={`Ver las ${socialSummary.likedCount} personas a quienes les gustó este título`}
                      >
                        <RatedReactionIcon reaction="liked" />
                        <strong>{socialSummary.likedCount}</strong>
                        Me gusta
                      </button>
                    ) : null}
                    {socialSummary.superlikedCount ? (
                      <button
                        type="button"
                        onClick={() => onOpenReactionList?.("superliked")}
                        disabled={!onOpenReactionList}
                        aria-label={`Ver las ${socialSummary.superlikedCount} personas a quienes les encantó este título`}
                      >
                        <RatedReactionIcon reaction="superliked" />
                        <strong>{socialSummary.superlikedCount}</strong>
                        Me encantó
                      </button>
                    ) : null}
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

          {details.previousInstallments.length ? (
            <section className="media-modal__section">
              <p className="section-eyebrow">Peliculas anteriores</p>
              <div className="media-modal__related-carousel" aria-label="Peliculas anteriores de la coleccion">
                {details.previousInstallments.map((previous) => (
                  <button
                    type="button"
                    className="media-modal__related-card"
                    key={previous.id}
                    onClick={() =>
                      onOpenMedia?.({
                        id: previous.id,
                        mediaType: previous.mediaType,
                        title: previous.title
                      })
                    }
                    disabled={!onOpenMedia}
                    aria-label={`Ver ${previous.title}`}
                  >
                    <img
                      src={previous.posterUrl || "/images/base.png"}
                      alt=""
                      loading="lazy"
                    />
                    <strong>{previous.title}</strong>
                    <span>{previous.year}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {details.mediaType === "tv" && details.seasons.length && onOpenEpisode ? (
            <SeasonsSection
              showId={details.id}
              showTitle={details.title}
              seasons={details.seasons}
              onOpenEpisode={onOpenEpisode}
              userId={userId ?? null}
            />
          ) : null}

          {feedPosts.length ? (
            <section className="media-modal__section">
              <p className="section-eyebrow">Reseñas de cinerianos</p>
              <div className="media-modal__reviews">
                {feedPosts.map((post) => {
                  const review = parseFeedReview(post.body);

                  return (
                    <article className="media-modal__review-card" key={post.id}>
                      <strong>{post.author}</strong>
                      <span className="media-modal__review-meta">{post.createdAtLabel}</span>
                      {review ? (
                        <span className="media-modal__review-reaction">
                          <RatedReactionIcon reaction={review.reaction} />
                          {getRatedReactionLabel(review.reaction)}
                        </span>
                      ) : null}
                      <p>{review?.quote}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {hasCast || crewList.length ? (
            <section className="media-modal__section">
              <div className="media-modal__credits-heading">
                <div className="media-modal__credits-tabs" role="tablist">
                  {hasCast ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={creditsTab === "cast"}
                      className={`media-modal__credits-tab ${
                        creditsTab === "cast" ? "is-active" : ""
                      }`}
                      onClick={() => setCreditsTab("cast")}
                    >
                      Reparto
                    </button>
                  ) : null}
                  {crewList.length ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={creditsTab === "crew"}
                      className={`media-modal__credits-tab ${
                        creditsTab === "crew" ? "is-active" : ""
                      }`}
                      onClick={() => setCreditsTab("crew")}
                    >
                      Equipo
                    </button>
                  ) : null}
                </div>
                {creditsTab === "cast" && details.mediaType === "tv" && tvCastSeasons.length > 1 ? (
                  <label className="media-modal__season-cast-filter">
                    <span>Temporada</span>
                    <select
                      value={castSeasonNumber ?? ""}
                      onChange={(event) => setCastSeasonNumber(Number(event.target.value))}
                      aria-label="Elegir temporada para ver su reparto"
                    >
                      {tvCastSeasons.map((season) => (
                        <option key={season.id} value={season.seasonNumber}>
                          {season.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="media-modal__cast media-modal__cast--carousel">
                {creditsTab === "cast" ? (
                  isSeasonCastLoading ? (
                    <div className="media-modal__cast-empty">Cargando reparto...</div>
                  ) : visibleCast.length ? (
                    visibleCast.map((person) => (
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
                          {person.profileUrl ? (
                            <img src={person.profileUrl} alt={person.name} loading="lazy" />
                          ) : (
                            <span>🎭</span>
                          )}
                        </div>
                        <strong>{person.name}</strong>
                        {person.character ? <span>{person.character}</span> : null}
                      </button>
                    ))
                  ) : (
                    <div className="media-modal__cast-empty">
                      {hasSeasonCastFailed
                        ? "No pudimos cargar el reparto de esta temporada."
                        : "No hay reparto cargado para esta temporada."}
                    </div>
                  )
                ) : (
                  crewList.map((person) => (
                      <button
                        type="button"
                        className="media-modal__cast-card media-modal__cast-card--interactive"
                        key={`crew-${person.id}`}
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
                          {person.profileUrl ? (
                            <img src={person.profileUrl} alt={person.name} loading="lazy" />
                          ) : (
                            <span>🎬</span>
                          )}
                        </div>
                        <strong>{person.name}</strong>
                        {person.roleLabel ? <span>{person.roleLabel}</span> : null}
                      </button>
                    ))
                )}
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
  onClose,
  onOpenRelatedItem,
  onOpenTalent,
  onOpenUserProfile
}: {
  userId?: string;
  item: MediaReference | null;
  onClose: () => void;
  onOpenRelatedItem: (item: MediaReference) => void;
  onOpenTalent: (talent: TalentSearchItem) => void;
  onOpenUserProfile?: OpenUserProfile;
}) {
  const { details, feedPosts, isLoading, hasFailed } = useMediaDetailsData(item);
  const socialSummary = useTitleSocialSummary(item, userId);
  const [shareLabel, setShareLabel] = useState("Compartir");
  const [saveLabel, setSaveLabel] = useState("Guardar");
  const [watchedLabel, setWatchedLabel] = useState("Ya la vi");
  const [watchedReaction, setWatchedReaction] = useState<RatedReaction | null>(null);
  const [reviewItem, setReviewItem] = useState<DiscoveryItem | null>(null);
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  const [sendItem, setSendItem] = useState<DiscoveryItem | null>(null);
  const [activeEpisode, setActiveEpisode] = useState<EpisodeReference | null>(null);
  const [activeReactionList, setActiveReactionList] = useState<PositiveReaction | null>(null);
  const handleOpenUserProfile = onOpenUserProfile
    ? (profile: { userId: string; username?: string }) => {
        onClose();
        onOpenUserProfile(profile);
      }
    : undefined;

  useEffect(() => {
    setShareLabel("Compartir");
    setActiveReactionList(null);
  }, [item]);

  useEffect(() => {
    if (!item || !userId) {
      setSaveLabel("Guardar");
      setWatchedLabel("Ya la vi");
      setWatchedReaction(null);
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
        const ratedReaction = reactions.find(
          (entry) =>
            entry.tmdbId === item.id &&
            entry.mediaType === item.mediaType &&
            isRatedReaction(entry.reaction)
        )?.reaction;

        setSaveLabel(isSaved ? "Guardado" : "Guardar");
        setWatchedReaction(ratedReaction && isRatedReaction(ratedReaction) ? ratedReaction : null);
        setWatchedLabel(
          ratedReaction && isRatedReaction(ratedReaction)
            ? getRatedReactionLabel(ratedReaction)
            : "Ya la vi"
        );
      })
      .catch(() => {
        if (isMounted) {
          setSaveLabel("Guardar");
          setWatchedLabel("Ya la vi");
          setWatchedReaction(null);
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
      providers: details?.providers.map((provider) => provider.name) ?? [],
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
        providers: details?.providers.map((provider) => provider.name) ?? [],
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
        providers: details?.providers.map((provider) => provider.name) ?? [],
        score: details?.score ?? 0
      };

      if (watchedReaction) {
        await removeStoredRatedReaction(userId, normalizedItem);
        setWatchedReaction(null);
        setWatchedLabel("Quitada");
        window.setTimeout(() => setWatchedLabel("Ya la vi"), 1800);
        return;
      }

      setReviewItem(normalizedItem);
    } catch {
      setWatchedLabel(watchedReaction ? "No pude quitar" : "No pude marcar");
      window.setTimeout(
        () => setWatchedLabel(getRatedReactionLabel(watchedReaction)),
        1800
      );
    }
  }

  async function handleReviewSubmit(input: { reaction: RatedReaction; comment: string }) {
    if (!reviewItem || !userId) {
      return;
    }

    try {
      setIsReviewSaving(true);
      await saveStoredReaction({
        userId,
        item: reviewItem,
        reaction: input.reaction
      });
      if (input.comment.trim()) {
        await createFeedPost({
          userId,
          postType: "rating",
          body: buildWatchedPostBody({
            item: reviewItem,
            reaction: input.reaction,
            comment: input.comment
          }),
          tmdbId: reviewItem.id,
          mediaType: reviewItem.mediaType
        });
      } else {
        await removeFeedEvent({
          userId,
          postType: "rating",
          tmdbId: reviewItem.id,
          mediaType: reviewItem.mediaType
        });
      }
      setWatchedReaction(input.reaction);
      setWatchedLabel(getRatedReactionLabel(input.reaction));
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
            socialSummary={socialSummary}
            isLoading={isLoading}
            hasFailed={hasFailed}
            onClose={onClose}
            onShare={handleShare}
            shareLabel={shareLabel === "Compartir" ? "Enviar" : shareLabel}
            onSave={handleSave}
            saveLabel={saveLabel}
            onWatched={handleWatched}
            watchedLabel={watchedLabel}
            watchedReaction={watchedReaction}
            canSave={Boolean(userId)}
            canMarkWatched={Boolean(userId)}
            onOpenTalent={onOpenTalent}
            onOpenEpisode={setActiveEpisode}
            onOpenMedia={onOpenRelatedItem}
            onOpenReactionList={setActiveReactionList}
            onOpenUserProfile={handleOpenUserProfile}
            userId={userId}
          />
        </div>
        <EpisodeDetailsModal
          reference={activeEpisode}
          userId={userId ?? null}
          onClose={() => setActiveEpisode(null)}
        />
        <WatchReviewModal
          item={reviewItem}
          isSaving={isReviewSaving}
          onClose={() => setReviewItem(null)}
          onSubmit={(input) => void handleReviewSubmit(input)}
        />
        <TitleReactionListModal
          item={item}
          reaction={activeReactionList}
          totalCount={
            activeReactionList === "liked"
              ? socialSummary?.likedCount ?? 0
              : activeReactionList === "superliked"
                ? socialSummary?.superlikedCount ?? 0
                : 0
          }
          userId={userId}
          onClose={() => setActiveReactionList(null)}
          onOpenUserProfile={handleOpenUserProfile}
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
      </div>
    </div>
  );
}

type DetailStackEntry =
  | { kind: "media"; item: MediaReference }
  | { kind: "talent"; item: TalentSearchItem };

export function MediaDetailsProvider({
  userId,
  onOpenUserProfile,
  children
}: {
  userId?: string;
  onOpenUserProfile?: OpenUserProfile;
  children: ReactNode;
}) {
  const [detailStack, setDetailStack] = useState<DetailStackEntry[]>([]);
  const activeEntry = detailStack[detailStack.length - 1] ?? null;
  const activeMedia = [...detailStack]
    .reverse()
    .find((entry): entry is Extract<DetailStackEntry, { kind: "media" }> => entry.kind === "media")?.item ?? null;
  const activeTalent = activeEntry?.kind === "talent" ? activeEntry.item : null;

  function openMediaDetails(item: MediaReference) {
    setDetailStack([{ kind: "media", item }]);
  }

  function closeMediaDetails() {
    setDetailStack((entries) => entries.slice(0, -1));
  }

  function openRelatedMedia(item: MediaReference) {
    setDetailStack((entries) => [...entries, { kind: "media", item }]);
  }

  function openRelatedTalent(item: TalentSearchItem) {
    setDetailStack((entries) => [...entries, { kind: "talent", item }]);
  }

  return (
    <MediaDetailsContext.Provider
      value={{
        openMediaDetails,
        pushMediaDetails: openRelatedMedia
      }}
    >
      {children}
      <MediaDetailsModal
        userId={userId}
        item={activeMedia}
        onClose={closeMediaDetails}
        onOpenRelatedItem={openRelatedMedia}
        onOpenTalent={openRelatedTalent}
        onOpenUserProfile={onOpenUserProfile}
      />
      <TalentDetailsModal
        item={activeTalent}
        userId={userId}
        onClose={closeMediaDetails}
        closeOnMediaOpen
        preserveInNavigationStack
        aboveMedia
      />
    </MediaDetailsContext.Provider>
  );
}

export function SharedMediaLanding({ item }: { item: MediaReference }) {
  const { details, feedPosts, isLoading, hasFailed } = useMediaDetailsData(item);
  const [shareLabel, setShareLabel] = useState("Compartir");
  const [activeTalent, setActiveTalent] = useState<TalentSearchItem | null>(null);
  const [activeEpisode, setActiveEpisode] = useState<EpisodeReference | null>(null);

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
            onOpenEpisode={setActiveEpisode}
            onOpenMedia={(related) => {
              window.location.assign(buildSharedMediaUrl(related));
            }}
          />
        </div>
      </div>
      <EpisodeDetailsModal
        reference={activeEpisode}
        userId={null}
        onClose={() => setActiveEpisode(null)}
      />
      <TalentDetailsModal
        item={activeTalent}
        onClose={() => setActiveTalent(null)}
        closeOnMediaOpen
        aboveMedia
      />
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
