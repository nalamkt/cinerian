import { useEffect, useState, type ReactNode } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchUserMediaPosts, fetchUserTextPosts } from "../lib/feed";
import { fetchFollowerCount, fetchFollowerUserIds, fetchFollowingUserIds } from "../lib/follows";
import { fetchStoredReactions, isRatedReaction, REACTIONS_UPDATED_EVENT } from "../lib/reactions";
import { getTitleById } from "../lib/tmdb";
import type { DiscoveryItem } from "../types";
import { EditProfileForm } from "./EditProfileForm";
import { ProfileTabs } from "./ProfileTabs";

type ProfilePanelProps = {
  userId: string;
  viewerUserId?: string;
  profile: Profile | null;
  isOwnProfile?: boolean;
  followerCountOverride?: number | null;
  profileMessage?: string;
  headerLabel?: string;
  headerAction?: ReactNode;
  readOnly?: boolean;
  onProfileUpdated?: (profile: Profile) => void;
  onOpenUserProfile?: (profile: { userId: string; username?: string }) => void;
};

export function ProfilePanel({
  userId,
  viewerUserId,
  profile,
  isOwnProfile = true,
  followerCountOverride = null,
  profileMessage,
  headerLabel = "Perfil",
  headerAction,
  readOnly = false,
  onProfileUpdated,
  onOpenUserProfile
}: ProfilePanelProps) {
  const displayName = profile?.display_name ?? "Cineriano activo";
  const username = profile?.username ?? "cargando";
  const avatarUrl = profile?.avatar_url ?? null;
  const bannerUrl = profile?.banner_url ?? null;
  const bio = profile?.bio?.trim();
  const favoriteGenres = profile?.favorite_genres ?? [];
  const featuredCollections = profile?.featured_collections ?? [];
  const visibilitySettings = profile?.visibility_settings;
  const canShowBadges = visibilitySettings?.showBadges !== false;
  const [stats, setStats] = useState({ likes: 0, watched: 0, followers: 0, following: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [followerProfiles, setFollowerProfiles] = useState<Profile[]>([]);
  const [followingProfiles, setFollowingProfiles] = useState<Profile[]>([]);
  const [peoplePopupTab, setPeoplePopupTab] = useState<"followers" | "following" | null>(null);
  const [peopleSearchQuery, setPeopleSearchQuery] = useState("");
  const [identityBadges, setIdentityBadges] = useState<string[]>([]);
  const [tasteInsights, setTasteInsights] = useState({
    topGenre: "Sin definir",
    topDecade: "Sin definir",
    formatSplit: "Sin datos",
    profileMood: "Todavia estamos aprendiendo de este perfil"
  });
  const [activitySummary, setActivitySummary] = useState({
    recommendations: 0,
    posts: 0,
    lastActivityLabel: "Sin actividad reciente"
  });

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      const results = await Promise.allSettled([
        fetchStoredReactions(userId),
        fetchFollowerCount(userId),
        fetchUserTextPosts(userId),
        fetchUserMediaPosts(userId),
        listProfiles(),
        fetchFollowerUserIds(userId),
        fetchFollowingUserIds(userId)
      ]);
      if (!isMounted) {
        return;
      }

      const reactionsResult = results[0];
      const followersResult = results[1];
      const textPostsResult = results[2];
      const mediaPostsResult = results[3];
      const profilesResult = results[4];
      const followerIdsResult = results[5];
      const followingIdsResult = results[6];
      const storedReactions = reactionsResult.status === "fulfilled" ? reactionsResult.value : [];
      const followers = followersResult.status === "fulfilled" ? followersResult.value : 0;
      const textPosts = textPostsResult.status === "fulfilled" ? textPostsResult.value : [];
      const mediaPosts = mediaPostsResult.status === "fulfilled" ? mediaPostsResult.value : [];
      const allProfiles = profilesResult.status === "fulfilled" ? profilesResult.value : [];
      const followerIds = followerIdsResult.status === "fulfilled" ? followerIdsResult.value : [];
      const followingIds = followingIdsResult.status === "fulfilled" ? followingIdsResult.value : [];
      const uniqueTasteEntries = storedReactions
        .filter((entry) => entry.reaction !== "ignored")
        .filter(
          (entry, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.tmdbId === entry.tmdbId && candidate.mediaType === entry.mediaType
            ) === index
        )
        .slice(0, 30);
      const resolvedTasteItems = (
        await Promise.all(uniqueTasteEntries.map((entry) => getTitleById(entry.tmdbId, entry.mediaType)))
      ).filter((item): item is DiscoveryItem => Boolean(item));
      const mergedActivity = [...mediaPosts, ...textPosts]
        .sort((left, right) => {
          const leftDate = left.createdAt ? new Date(left.createdAt).getTime() : 0;
          const rightDate = right.createdAt ? new Date(right.createdAt).getTime() : 0;
          return rightDate - leftDate;
        })
        .slice(0, 4);

      setStats({
        likes: storedReactions.filter((entry) => entry.reaction === "watchlist").length,
        watched: storedReactions.filter(
          (entry) => isRatedReaction(entry.reaction)
        ).length,
        followers: followerCountOverride ?? followers,
        following: followingIds.length
      });
      setFollowerProfiles(allProfiles.filter((entry) => followerIds.includes(entry.id)));
      setFollowingProfiles(allProfiles.filter((entry) => followingIds.includes(entry.id)));
      const genreCount = resolvedTasteItems.reduce<Record<string, number>>((accumulator, item) => {
        item.genres.forEach((genre) => {
          accumulator[genre] = (accumulator[genre] ?? 0) + 1;
        });
        return accumulator;
      }, {});
      const topGenre =
        Object.entries(genreCount).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Sin definir";
      const decadeCount = resolvedTasteItems.reduce<Record<string, number>>((accumulator, item) => {
        const parsedYear = Number(item.year);
        if (!Number.isFinite(parsedYear)) {
          return accumulator;
        }

        const decade = `${Math.floor(parsedYear / 10) * 10}s`;
        accumulator[decade] = (accumulator[decade] ?? 0) + 1;
        return accumulator;
      }, {});
      const topDecade =
        Object.entries(decadeCount).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Sin definir";
      const movieCount = resolvedTasteItems.filter((item) => item.mediaType === "movie").length;
      const tvCount = resolvedTasteItems.filter((item) => item.mediaType === "tv").length;
      const formatSplit =
        movieCount || tvCount
          ? `${movieCount} pelis · ${tvCount} series`
          : "Sin datos";
      const profileMood =
        topGenre === "Sin definir"
          ? "Todavia estamos aprendiendo de este perfil"
          : movieCount > tvCount
            ? `Perfil mas de cine ${topGenre.toLowerCase()} que de maraton`
            : tvCount > movieCount
              ? `Perfil bien seriéfilo con debilidad por ${topGenre.toLowerCase()}`
              : `Gusto equilibrado con mucha energia ${topGenre.toLowerCase()}`;
      const badges = [
        topGenre !== "Sin definir" ? `${topGenre} lover` : null,
        movieCount > tvCount ? "Mas cine que series" : tvCount > movieCount ? "Serieadicto" : "Todo terreno",
        mediaPosts.filter((post) => post.type === "rating").length >= 5 ? "Recomienda seguido" : null,
        textPosts.length >= 3 ? "Opinionista" : null,
        featuredCollections.length > 0 ? "Curador de listas" : null
      ].filter((badge): badge is string => Boolean(badge));

      setActivitySummary({
        recommendations: mediaPosts.filter((post) => post.type === "rating").length,
        posts: textPosts.length,
        lastActivityLabel: mergedActivity[0]?.createdAtLabel ?? "Sin actividad reciente"
      });
      setTasteInsights({
        topGenre,
        topDecade,
        formatSplit,
        profileMood
      });
      setIdentityBadges(badges.slice(0, 4));
    }

    function handleReactionsUpdated(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) {
        return;
      }

      void loadStats().catch(() => {
        if (!isMounted) {
          return;
        }

        setStats((current) => ({
          likes: 0,
          watched: 0,
          followers: followerCountOverride ?? current.followers ?? 0,
          following: current.following ?? 0
        }));
        setFollowerProfiles([]);
        setFollowingProfiles([]);
        setActivitySummary({
          recommendations: 0,
          posts: 0,
          lastActivityLabel: "Sin actividad reciente"
        });
        setTasteInsights({
          topGenre: "Sin definir",
          topDecade: "Sin definir",
          formatSplit: "Sin datos",
          profileMood: "Todavia estamos aprendiendo de este perfil"
        });
        setIdentityBadges([]);
      });
    }

    void loadStats().catch(() => {
      if (!isMounted) {
        return;
      }

      setStats((current) => ({
        likes: 0,
        watched: 0,
        followers: followerCountOverride ?? current.followers ?? 0,
        following: current.following ?? 0
      }));
      setFollowerProfiles([]);
      setFollowingProfiles([]);
      setActivitySummary({
        recommendations: 0,
        posts: 0,
        lastActivityLabel: "Sin actividad reciente"
      });
      setTasteInsights({
        topGenre: "Sin definir",
        topDecade: "Sin definir",
        formatSplit: "Sin datos",
        profileMood: "Todavia estamos aprendiendo de este perfil"
      });
      setIdentityBadges([]);
    });

    window.addEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);

    return () => {
      isMounted = false;
      window.removeEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);
    };
  }, [followerCountOverride, userId]);

  useEffect(() => {
    if (!profile) {
      setIsEditing(false);
    }
  }, [profile]);

  function openPeoplePopup(tab: "followers" | "following") {
    setPeopleSearchQuery("");
    setPeoplePopupTab(tab);
  }

  function closePeoplePopup() {
    setPeoplePopupTab(null);
  }

  const activePeopleList = peoplePopupTab === "following" ? followingProfiles : followerProfiles;
  const normalizedPeopleQuery = peopleSearchQuery.trim().toLowerCase();
  const filteredPeopleList = normalizedPeopleQuery
    ? activePeopleList.filter(
        (entry) =>
          entry.display_name.toLowerCase().includes(normalizedPeopleQuery) ||
          entry.username.toLowerCase().includes(normalizedPeopleQuery)
      )
    : activePeopleList;

  return (
    <section className="panel profile-panel">
      {bannerUrl ? (
        <div className="profile-banner" aria-hidden="true">
          <img src={bannerUrl} alt="" className="profile-banner__image" />
        </div>
      ) : null}

      <div className="profile-hero">
        <div className="profile-avatar" aria-hidden="true">
          {avatarUrl ? (
            <img src={avatarUrl} alt={`Avatar de ${displayName}`} className="profile-avatar__image" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>

        <div className="profile-hero__copy">
          <div className="profile-hero__header">
            <div>
              <p className="section-eyebrow">{headerLabel}</p>
              <h2>{displayName}</h2>
              <p className="profile-handle">@{username}</p>
            </div>

            <div className={`profile-hero__action ${isOwnProfile ? "profile-hero__action--own" : ""}`}>
              {headerAction}
              {isOwnProfile && onProfileUpdated ? (
                <button
                  type="button"
                  className="profile-share-button"
                  onClick={() => setIsEditing(true)}
                >
                  Editar perfil
                </button>
              ) : null}
            </div>
          </div>

          <div className="profile-stats-inline">
            <button
              type="button"
              className="profile-stats-inline__item profile-stats-inline__item--button"
              onClick={() => openPeoplePopup("followers")}
            >
              <strong>{stats.followers}</strong>
              <span>Seguidores</span>
            </button>
            <button
              type="button"
              className="profile-stats-inline__item profile-stats-inline__item--button"
              onClick={() => openPeoplePopup("following")}
            >
              <strong>{stats.following}</strong>
              <span>Seguidos</span>
            </button>
            <span className="profile-stats-inline__item">
              <strong>{stats.watched}</strong>
              <span>Vistas</span>
            </span>
          </div>

          <p className="profile-bio">
            {bio ??
              profileMessage ??
              (isOwnProfile
                ? "Tu perfil va juntando automaticamente lo que marcaste como visto y lo que guardaste en Watchlist."
                : "Aca ves lo que esta persona ya miro, guardo para despues y publico dentro de Cinerian.")}
          </p>

          {favoriteGenres.length ? (
            <div className="profile-genres">
              {favoriteGenres.map((genre) => (
                <span key={genre} className="profile-genre-chip">
                  {genre}
                </span>
              ))}
            </div>
          ) : null}

          {canShowBadges && identityBadges.length ? (
            <div className="profile-badges">
              {identityBadges.map((badge) => (
                <span key={badge} className="profile-badge">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

        </div>
      </div>

      {peoplePopupTab ? (
        <div className="profile-people-popup__backdrop" onClick={closePeoplePopup}>
          <div className="profile-people-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-people-modal__header">
              <h3>{peoplePopupTab === "following" ? "Seguidos" : "Seguidores"}</h3>
              <button
                type="button"
                className="profile-people-modal__close"
                onClick={closePeoplePopup}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="profile-people-modal__search">
              <input
                type="search"
                value={peopleSearchQuery}
                onChange={(event) => setPeopleSearchQuery(event.target.value)}
                placeholder="Buscar"
              />
            </div>

            <div className="profile-people-modal__list">
              {filteredPeopleList.length ? (
                filteredPeopleList.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="profile-people-user"
                    onClick={() => {
                      onOpenUserProfile?.({ userId: entry.id, username: entry.username });
                      closePeoplePopup();
                    }}
                    disabled={!onOpenUserProfile}
                  >
                    <span className="profile-people-user__avatar" aria-hidden="true">
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt="" className="profile-avatar__image" />
                      ) : (
                        entry.display_name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="profile-people-user__copy">
                      <strong>{entry.display_name}</strong>
                      <span>@{entry.username}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="profile-grid__empty">
                  {normalizedPeopleQuery
                    ? "No encontramos a nadie con ese nombre."
                    : peoplePopupTab === "following"
                      ? isOwnProfile
                        ? "Todavia no seguis a nadie desde este perfil."
                        : "Este perfil todavia no sigue a otras personas."
                      : isOwnProfile
                        ? "Todavia no tenes seguidores visibles."
                        : "Este perfil todavia no tiene seguidores visibles."}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isOwnProfile && profile && onProfileUpdated && isEditing ? (
        <div
          className="media-modal__backdrop"
          role="presentation"
          onClick={() => setIsEditing(false)}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsEditing(false);
            }
          }}
        >
          <div
            className="media-modal__frame"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsEditing(false);
              }
            }}
          >
            <div className="media-modal__panel" role="presentation" onClick={(event) => event.stopPropagation()}>
              <div className="media-modal profile-editor-modal" role="dialog" aria-modal="true">
                <div className="media-modal__toolbar">
                  <button
                    type="button"
                    className="media-modal__back"
                    onClick={() => setIsEditing(false)}
                    aria-label="Cerrar editor"
                  >
                    ×
                  </button>
                </div>
                <EditProfileForm
                  profile={profile}
                  onCancel={() => setIsEditing(false)}
                  onSaved={(nextProfile) => {
                    onProfileUpdated(nextProfile);
                    setIsEditing(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ProfileTabs
        userId={userId}
        viewerUserId={viewerUserId}
        readOnly={readOnly}
        isOwnProfile={isOwnProfile}
        profile={profile}
        visibilitySettings={visibilitySettings}
        onProfileUpdated={onProfileUpdated}
        activitySummary={activitySummary}
        tasteInsights={tasteInsights}
      />
    </section>
  );
}
