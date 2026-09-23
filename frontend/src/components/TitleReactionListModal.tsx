import { useEffect, useState } from "react";
import { fetchProfileSummaries, type ProfileSummary } from "../lib/auth";
import { fetchFollowingUserIds, followUser } from "../lib/follows";
import { buildSharedProfilePath } from "../lib/profileShare";
import { fetchTitleReactionUsers, type RatedReaction } from "../lib/reactions";
import type { DiscoveryItem } from "../types";
import { getRatedReactionLabel, RatedReactionIcon } from "./RatedReactionIcon";

type PositiveReaction = Extract<RatedReaction, "liked" | "superliked">;

type ReactorProfile = ProfileSummary & {
  reaction: PositiveReaction;
};

type TitleReactionListModalProps = {
  item: Pick<DiscoveryItem, "id" | "mediaType" | "title"> | null;
  reaction: PositiveReaction | null;
  totalCount: number;
  userId?: string;
  onClose: () => void;
  onOpenUserProfile?: (profile: { userId: string; username?: string }) => void;
};

const REACTORS_PAGE_SIZE = 40;

function profileInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function ReactorAvatar({ profile }: { profile: ProfileSummary }) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUrl = profile.avatarUrl?.trim() ?? "";

  useEffect(() => {
    setHasImageError(false);
  }, [profile.avatarUrl]);

  if (!imageUrl || hasImageError) {
    return <span className="title-reactions__avatar-initials">{profileInitials(profile.displayName)}</span>;
  }

  return <img src={imageUrl} alt="" onError={() => setHasImageError(true)} />;
}

function mergeProfiles(
  rows: Awaited<ReturnType<typeof fetchTitleReactionUsers>>,
  profiles: ProfileSummary[]
): ReactorProfile[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const uniqueReactors = new Map<string, ReactorProfile>();

  rows.forEach((row) => {
    const profile = profileById.get(row.userId);
    if (profile && !uniqueReactors.has(profile.id)) {
      uniqueReactors.set(profile.id, { ...profile, reaction: row.reaction as PositiveReaction });
    }
  });

  return [...uniqueReactors.values()];
}

export function TitleReactionListModal({
  item,
  reaction,
  totalCount,
  userId,
  onClose,
  onOpenUserProfile
}: TitleReactionListModalProps) {
  const [reactors, setReactors] = useState<ReactorProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [followErrorId, setFollowErrorId] = useState<string | null>(null);
  const [followingInFlight, setFollowingInFlight] = useState<string | null>(null);
  const itemId = item?.id;
  const mediaType = item?.mediaType;

  useEffect(() => {
    if (itemId == null || !mediaType || !reaction) {
      setReactors([]);
      return;
    }

    let isMounted = true;
    const titleReference = { id: itemId, mediaType };
    const selectedReaction: PositiveReaction = reaction;

    async function loadInitialReactors() {
      setIsLoading(true);
      setLoadError(null);
      setReactors([]);
      setNextOffset(0);
      setHasMore(false);

      try {
        const [rows, followedIds] = await Promise.all([
          fetchTitleReactionUsers(titleReference, selectedReaction, 0, REACTORS_PAGE_SIZE),
          userId ? fetchFollowingUserIds(userId) : Promise.resolve([])
        ]);
        const profiles = await fetchProfileSummaries(rows.map((row) => row.userId));

        if (!isMounted) {
          return;
        }

        setReactors(mergeProfiles(rows, profiles));
        setFollowingIds(new Set(followedIds));
        setNextOffset(rows.length);
        setHasMore(rows.length === REACTORS_PAGE_SIZE && rows.length < totalCount);
      } catch {
        if (isMounted) {
          setLoadError("No pudimos cargar quiénes reaccionaron todavía.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialReactors();

    return () => {
      isMounted = false;
    };
  }, [itemId, mediaType, reaction, totalCount, userId]);

  async function handleLoadMore() {
    if (itemId == null || !mediaType || !reaction || isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const rows = await fetchTitleReactionUsers(
        { id: itemId, mediaType },
        reaction,
        nextOffset,
        REACTORS_PAGE_SIZE
      );
      const profiles = await fetchProfileSummaries(rows.map((row) => row.userId));
      const nextProfiles = mergeProfiles(rows, profiles);

      setReactors((current) => {
        const currentIds = new Set(current.map((profile) => profile.id));
        return [...current, ...nextProfiles.filter((profile) => !currentIds.has(profile.id))];
      });
      setNextOffset((offset) => offset + rows.length);
      setHasMore(rows.length === REACTORS_PAGE_SIZE && nextOffset + rows.length < totalCount);
    } catch {
      setLoadError("No pudimos cargar más cinerianos. Probá de nuevo.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleFollow(targetUserId: string) {
    if (!userId || followingIds.has(targetUserId) || followingInFlight) {
      return;
    }

    setFollowingInFlight(targetUserId);
    setFollowErrorId(null);

    try {
      await followUser(userId, targetUserId);
      setFollowingIds((current) => new Set([...current, targetUserId]));
    } catch {
      setFollowErrorId(targetUserId);
    } finally {
      setFollowingInFlight(null);
    }
  }

  if (!item || !reaction) {
    return null;
  }

  const reactionLabel = getRatedReactionLabel(reaction);
  const heading = reaction === "superliked" ? "A quienes les encantó" : "A quienes les gustó";

  return (
    <div className="title-reactions__backdrop" role="presentation" onClick={onClose}>
      <section
        className="title-reactions"
        role="dialog"
        aria-modal="true"
        aria-labelledby="title-reactions-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="title-reactions__close"
          onClick={onClose}
          aria-label="Cerrar"
          data-escape-dismiss
        >
          ×
        </button>

        <p className="section-eyebrow">Reacciones cinerianas</p>
        <h2 id="title-reactions-title">{heading}</h2>
        <p className="title-reactions__intro">
          {totalCount} {totalCount === 1 ? "persona eligió" : "personas eligieron"} “{reactionLabel}” para {item.title}.
        </p>

        <div className="title-reactions__list" aria-live="polite">
          {isLoading ? <div className="media-modal__loading">Cargando cinerianos...</div> : null}
          {!isLoading && loadError && reactors.length === 0 ? (
            <div className="media-modal__empty">{loadError}</div>
          ) : null}
          {!isLoading && !loadError && reactors.length === 0 ? (
            <div className="media-modal__empty">Todavía no encontramos perfiles disponibles para esta reacción.</div>
          ) : null}

          {reactors.map((profile) => {
            const isOwnProfile = profile.id === userId;
            const isFollowing = followingIds.has(profile.id);
            const followLabel = followErrorId === profile.id
              ? "Reintentar"
              : followingInFlight === profile.id
                ? "Siguiendo..."
                : isFollowing
                  ? "Siguiendo"
                  : "Seguir";

            return (
              <article className="title-reactions__person" key={profile.id}>
                <a
                  href={buildSharedProfilePath(profile.username)}
                  className="title-reactions__profile"
                  onClick={(event) => {
                    if (!onOpenUserProfile) {
                      return;
                    }

                    event.preventDefault();
                    onClose();
                    onOpenUserProfile({ userId: profile.id, username: profile.username });
                  }}
                >
                  <span className="title-reactions__avatar" aria-hidden="true">
                    <ReactorAvatar profile={profile} />
                  </span>
                  <span className="title-reactions__person-copy">
                    <strong>{profile.displayName}</strong>
                    <span>@{profile.username}</span>
                    <span className="title-reactions__person-reaction">
                      <RatedReactionIcon reaction={profile.reaction} />
                      {reactionLabel}
                    </span>
                  </span>
                </a>

                {userId && !isOwnProfile ? (
                  <button
                    type="button"
                    className={`title-reactions__follow ${isFollowing ? "is-following" : ""}`}
                    onClick={() => void handleFollow(profile.id)}
                    disabled={isFollowing || followingInFlight === profile.id}
                    aria-label={`${followLabel} a ${profile.displayName}`}
                  >
                    {followLabel}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>

        {loadError && reactors.length ? <p className="title-reactions__load-error">{loadError}</p> : null}
        {hasMore ? (
          <button
            type="button"
            className="title-reactions__more"
            onClick={() => void handleLoadMore()}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Cargando..." : "Ver más"}
          </button>
        ) : null}
      </section>
    </div>
  );
}
