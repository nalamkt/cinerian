import { useEffect, useState, type ReactNode } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchUserMediaPosts, fetchUserTextPosts } from "../lib/feed";
import { fetchFollowerCount, fetchFollowerUserIds, fetchFollowingUserIds } from "../lib/follows";
import { fetchStoredReactions, REACTIONS_UPDATED_EVENT } from "../lib/reactions";
import { getTitleById } from "../lib/tmdb";
import type { DiscoveryItem } from "../types";
import { EditProfileForm } from "./EditProfileForm";
import { ProfileTabs } from "./ProfileTabs";

type ProfilePanelProps = {
  userId: string;
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
  const canShowWatchStats = visibilitySettings?.showWatchlist !== false;
  const canShowPeople =
    visibilitySettings?.showFollowers !== false || visibilitySettings?.showFollowing !== false;
  const canShowExtras = visibilitySettings?.showActivity !== false;
  const canShowBadges = visibilitySettings?.showBadges !== false;
  const [stats, setStats] = useState({ likes: 0, watched: 0, followers: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [favoriteTitles, setFavoriteTitles] = useState<DiscoveryItem[]>([]);
  const [resolvedCollections, setResolvedCollections] = useState<
    Array<{
      id: string;
      title: string;
      description: string | null;
      items: DiscoveryItem[];
    }>
  >([]);
  const [followerProfiles, setFollowerProfiles] = useState<Profile[]>([]);
  const [followingProfiles, setFollowingProfiles] = useState<Profile[]>([]);
  const [isPeoplePopupOpen, setIsPeoplePopupOpen] = useState(false);
  const [identityBadges, setIdentityBadges] = useState<string[]>([]);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
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
        .filter((entry) => entry.reaction === "liked" || entry.reaction === "watched")
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
        likes: storedReactions.filter((entry) => entry.reaction === "liked").length,
        watched: storedReactions.filter((entry) => entry.reaction === "watched").length,
        followers: followerCountOverride ?? followers
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
          followers: followerCountOverride ?? current.followers ?? 0
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
        followers: followerCountOverride ?? current.followers ?? 0
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

  useEffect(() => {
    if (!canShowPeople && isPeoplePopupOpen) {
      setIsPeoplePopupOpen(false);
    }
  }, [canShowPeople, isPeoplePopupOpen]);

  useEffect(() => {
    let isMounted = true;

    async function loadCollections() {
      if (!featuredCollections.length) {
        setResolvedCollections([]);
        return;
      }

      const resolved = await Promise.all(
        featuredCollections.map(async (collection) => {
          const items = await Promise.all(
            collection.items.map((entry) => getTitleById(entry.tmdbId, entry.mediaType))
          );

          return {
            id: collection.id,
            title: collection.title,
            description: collection.description,
            items: items.filter((item): item is DiscoveryItem => Boolean(item))
          };
        })
      );

      if (!isMounted) {
        return;
      }

      setResolvedCollections(resolved.filter((collection) => collection.items.length));
    }

    void loadCollections().catch(() => {
      if (isMounted) {
        setResolvedCollections([]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [featuredCollections]);

  useEffect(() => {
    let isMounted = true;

    async function loadFavoriteTitles() {
      if (!profile?.favorite_titles?.length) {
        setFavoriteTitles([]);
        return;
      }

      const resolved = await Promise.all(
        profile.favorite_titles.map((entry) => getTitleById(entry.tmdbId, entry.mediaType))
      );

      if (!isMounted) {
        return;
      }

      setFavoriteTitles(resolved.filter((item): item is DiscoveryItem => Boolean(item)));
    }

    void loadFavoriteTitles().catch(() => {
      if (isMounted) {
        setFavoriteTitles([]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [profile]);

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

            <div className="profile-hero__action">
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

          {canShowWatchStats || canShowPeople ? (
            <div className="profile-stats">
              {canShowWatchStats ? (
                <div className="profile-stat">
                  <strong>{stats.likes}</strong>
                  <span>Watchlist</span>
                </div>
              ) : null}
              {canShowWatchStats ? (
                <div className="profile-stat">
                  <strong>{stats.watched}</strong>
                  <span>Vistas</span>
                </div>
              ) : null}
              {canShowPeople ? (
                <button
                  type="button"
                  className="profile-stat profile-stat--button"
                  onClick={() => setIsPeoplePopupOpen(true)}
                >
                  <strong>{stats.followers}</strong>
                  <span>Seguidores</span>
                </button>
              ) : null}
            </div>
          ) : null}

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

          {canShowExtras ? (
            <div className="profile-secondary">
              <div className="profile-secondary__header">
                <div>
                  <p className="section-eyebrow">Extras del perfil</p>
                  <p className="profile-secondary__copy">
                    Actividad, resumenes e insights personales.
                  </p>
                </div>
                <button
                  type="button"
                  className="profile-share-button"
                  onClick={() => setIsDetailsExpanded((current) => !current)}
                >
                  {isDetailsExpanded ? "Ver menos" : "Ver mas"}
                </button>
              </div>

              {isDetailsExpanded ? (
                <>
                  <div className="profile-summary-grid">
                    <article className="profile-summary-card">
                      <span className="profile-summary-card__label">Recomendaciones</span>
                      <strong>{activitySummary.recommendations}</strong>
                      <p>
                        {isOwnProfile
                          ? "Titulos que dejaste visibles como parte de tu gusto."
                          : "Titulos recomendados dentro de este perfil."}
                      </p>
                    </article>
                    <article className="profile-summary-card">
                      <span className="profile-summary-card__label">Posts propios</span>
                      <strong>{activitySummary.posts}</strong>
                      <p>
                        {isOwnProfile
                          ? "Textos y opiniones publicadas por vos."
                          : "Textos y opiniones que esta persona compartio."}
                      </p>
                    </article>
                    <article className="profile-summary-card">
                      <span className="profile-summary-card__label">Ultimo movimiento</span>
                      <strong>{activitySummary.lastActivityLabel}</strong>
                      <p>
                        {isOwnProfile
                          ? "La senal mas reciente de tu actividad."
                          : "Lo ultimo que movio dentro de Cinerian."}
                      </p>
                    </article>
                  </div>

                  {isOwnProfile && visibilitySettings?.showInsights !== false ? (
                    <div className="profile-insights">
                      <div className="profile-insights__header">
                        <div>
                          <p className="section-eyebrow">Insights de gusto</p>
                          <h3>Lo que tu historial dice de vos</h3>
                          <p>{tasteInsights.profileMood}</p>
                        </div>
                      </div>

                      <div className="profile-insights__grid">
                        <article className="profile-insight-card">
                          <span>Genero dominante</span>
                          <strong>{tasteInsights.topGenre}</strong>
                        </article>
                        <article className="profile-insight-card">
                          <span>Decada favorita</span>
                          <strong>{tasteInsights.topDecade}</strong>
                        </article>
                        <article className="profile-insight-card">
                          <span>Balance de formato</span>
                          <strong>{tasteInsights.formatSplit}</strong>
                        </article>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
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

      {isPeoplePopupOpen && canShowPeople ? (
        <div className="profile-people-popup__backdrop" onClick={() => setIsPeoplePopupOpen(false)}>
          <div className="profile-people-popup" onClick={(event) => event.stopPropagation()}>
            <div className="profile-people-popup__header">
              <div>
                <p className="section-eyebrow">Red del perfil</p>
                <h3>Seguidores y seguidos</h3>
              </div>
              <button
                type="button"
                className="media-modal__back"
                onClick={() => setIsPeoplePopupOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="profile-people-grid">
              {visibilitySettings?.showFollowers !== false ? (
                <div className="profile-people-card">
                  <div className="profile-people-card__header">
                    <div>
                      <p className="section-eyebrow">Seguidores</p>
                      <h3>Quienes siguen este perfil</h3>
                    </div>
                    <strong>{followerProfiles.length}</strong>
                  </div>
                  {followerProfiles.length ? (
                    <div className="profile-people-list">
                      {followerProfiles.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className="profile-people-user"
                          onClick={() => {
                            onOpenUserProfile?.({ userId: entry.id, username: entry.username });
                            setIsPeoplePopupOpen(false);
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
                      ))}
                    </div>
                  ) : (
                    <div className="profile-grid__empty">
                      {isOwnProfile
                        ? "Todavia no tenes seguidores visibles."
                        : "Este perfil todavia no tiene seguidores visibles."}
                    </div>
                  )}
                </div>
              ) : null}

              {visibilitySettings?.showFollowing !== false ? (
                <div className="profile-people-card">
                  <div className="profile-people-card__header">
                    <div>
                      <p className="section-eyebrow">Seguidos</p>
                      <h3>A quienes sigue</h3>
                    </div>
                    <strong>{followingProfiles.length}</strong>
                  </div>
                  {followingProfiles.length ? (
                    <div className="profile-people-list">
                      {followingProfiles.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className="profile-people-user"
                          onClick={() => {
                            onOpenUserProfile?.({ userId: entry.id, username: entry.username });
                            setIsPeoplePopupOpen(false);
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
                      ))}
                    </div>
                  ) : (
                    <div className="profile-grid__empty">
                      {isOwnProfile
                        ? "Todavia no seguis a nadie desde este perfil."
                        : "Este perfil todavia no sigue a otras personas."}
                    </div>
                  )}
                </div>
              ) : null}
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
        readOnly={readOnly}
        isOwnProfile={isOwnProfile}
        profile={profile}
        favoriteTitles={favoriteTitles}
        featuredCollections={resolvedCollections}
        visibilitySettings={visibilitySettings}
        onProfileUpdated={onProfileUpdated}
      />
    </section>
  );
}
