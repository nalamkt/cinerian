import { useEffect, useState, type ReactNode } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchFollowerCount, fetchFollowerUserIds, fetchFollowingUserIds } from "../lib/follows";
import { fetchStoredReactions, isRatedReaction, REACTIONS_UPDATED_EVENT } from "../lib/reactions";
import { EditProfileForm } from "./EditProfileForm";
import { ProfileTabs } from "./ProfileTabs";

type ProfilePanelProps = {
  userId: string;
  viewerUserId?: string;
  profile: Profile | null;
  isOwnProfile?: boolean;
  followerCountOverride?: number | null;
  profileMessage?: string;
  /** `null` deja el encabezado sin volanta. */
  headerLabel?: string | null;
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
  const visibilitySettings = profile?.visibility_settings;
  const [stats, setStats] = useState({ likes: 0, watched: 0, followers: 0, following: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [followerProfiles, setFollowerProfiles] = useState<Profile[]>([]);
  const [followingProfiles, setFollowingProfiles] = useState<Profile[]>([]);
  const [peoplePopupTab, setPeoplePopupTab] = useState<"followers" | "following" | null>(null);
  const [peopleSearchQuery, setPeopleSearchQuery] = useState("");

  useEffect(() => {
    let isMounted = true;

    function resetStats() {
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
    }

    async function loadStats() {
      const results = await Promise.allSettled([
        fetchStoredReactions(userId),
        fetchFollowerCount(userId),
        listProfiles(),
        fetchFollowerUserIds(userId),
        fetchFollowingUserIds(userId)
      ]);
      if (!isMounted) {
        return;
      }

      const [reactionsResult, followersResult, profilesResult, followerIdsResult, followingIdsResult] =
        results;
      const storedReactions = reactionsResult.status === "fulfilled" ? reactionsResult.value : [];
      const followers = followersResult.status === "fulfilled" ? followersResult.value : 0;
      const allProfiles = profilesResult.status === "fulfilled" ? profilesResult.value : [];
      const followerIds = followerIdsResult.status === "fulfilled" ? followerIdsResult.value : [];
      const followingIds = followingIdsResult.status === "fulfilled" ? followingIdsResult.value : [];

      setStats({
        likes: storedReactions.filter((entry) => entry.reaction === "watchlist").length,
        watched: storedReactions.filter((entry) => isRatedReaction(entry.reaction)).length,
        followers: followerCountOverride ?? followers,
        following: followingIds.length
      });
      setFollowerProfiles(allProfiles.filter((entry) => followerIds.includes(entry.id)));
      setFollowingProfiles(allProfiles.filter((entry) => followingIds.includes(entry.id)));
    }

    function handleReactionsUpdated(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) {
        return;
      }

      void loadStats().catch(resetStats);
    }

    void loadStats().catch(resetStats);

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
              {headerLabel ? <p className="section-eyebrow">{headerLabel}</p> : null}
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
                data-escape-dismiss
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
                    data-escape-dismiss
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
      />
    </section>
  );
}
