import { useEffect, useMemo, useState } from "react";
import { getProfileById, getProfileByUsername, type Profile } from "../lib/auth";
import { fetchFollowerCount, followUser, isFollowingUser, unfollowUser } from "../lib/follows";
import { shareProfileLink } from "../lib/profileShare";
import { ProfilePanel } from "./ProfilePanel";

type UserProfilePageProps = {
  currentUserId: string;
  userId?: string;
  username?: string;
  onBack: () => void;
  onOpenUserProfile?: (profile: { userId: string; username?: string }) => void;
};

export function UserProfilePage({
  currentUserId,
  userId,
  username,
  onBack,
  onOpenUserProfile
}: UserProfilePageProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followers, setFollowers] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [shareLabel, setShareLabel] = useState("Compartir perfil");

  const resolvedUserId = profile?.id ?? userId ?? "";
  const isOwnProfile = resolvedUserId === currentUserId;

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setStatusMessage(null);

      const profileResult = userId
        ? await getProfileById(userId)
        : username
          ? await getProfileByUsername(username)
          : null;

      if (!isMounted) {
        return;
      }

      setProfile(profileResult);

      if (!profileResult) {
        setFollowers(0);
        setIsFollowing(false);
        setStatusMessage("No encontre ese perfil en Cinerian.");
        setIsLoading(false);
        return;
      }

      const [followerCountResult, followingResult] = await Promise.allSettled([
        fetchFollowerCount(profileResult.id),
        profileResult.id === currentUserId
          ? Promise.resolve(false)
          : isFollowingUser(currentUserId, profileResult.id)
      ]);

      if (!isMounted) {
        return;
      }

      setFollowers(followerCountResult.status === "fulfilled" ? followerCountResult.value : 0);
      setIsFollowing(followingResult.status === "fulfilled" ? followingResult.value : false);

      setIsLoading(false);
    }

    void load().catch(() => {
      if (!isMounted) {
        return;
      }

      setStatusMessage("No pude cargar este perfil todavia.");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [currentUserId, userId, username]);

  async function handleToggleFollow() {
    if (isOwnProfile || !profile) {
      return;
    }

    try {
      setIsToggling(true);
      setStatusMessage(null);

      if (isFollowing) {
        await unfollowUser(currentUserId, profile.id);
        setIsFollowing(false);
        setFollowers((current) => Math.max(0, current - 1));
      } else {
        await followUser(currentUserId, profile.id);
        setIsFollowing(true);
        setFollowers((current) => current + 1);
      }
    } catch {
      setStatusMessage(
        "Para seguir usuarios hay que crear primero la tabla user_follows en Supabase."
      );
    } finally {
      setIsToggling(false);
    }
  }

  async function handleShareProfile() {
    if (!profile?.username) {
      return;
    }

    const result = await shareProfileLink(profile.username);
    setShareLabel(result === "shared" ? "Compartido" : "Link copiado");
    window.setTimeout(() => setShareLabel("Compartir perfil"), 1800);
  }

  const action = useMemo(() => {
    return (
      <div className="profile-hero__actions">
        <button
          type="button"
          className="profile-share-button"
          onClick={() => void handleShareProfile()}
          disabled={!profile?.username}
        >
          {shareLabel}
        </button>
        {isOwnProfile ? (
          <span className="profile-follow-badge">Este sos vos</span>
        ) : (
          <button
            type="button"
            className={`profile-follow-button ${isFollowing ? "is-following" : ""}`}
            onClick={() => void handleToggleFollow()}
            disabled={isToggling}
          >
            {isFollowing ? "Siguiendo" : "Seguir"}
          </button>
        )}
      </div>
    );
  }, [handleToggleFollow, isFollowing, isOwnProfile, isToggling, profile?.username, shareLabel]);

  return (
    <div className="profile-page-shell">
      <div className="profile-page__toolbar">
        <button type="button" className="media-modal__back" onClick={onBack} aria-label="Volver">
          ←
        </button>
      </div>

      {statusMessage ? <div className="inline-status">{statusMessage}</div> : null}

      {isLoading ? (
        <section className="panel profile-panel">
          <div className="media-modal__loading">Cargando perfil...</div>
        </section>
      ) : !profile ? (
        <section className="panel profile-panel">
          <div className="media-modal__empty">Este perfil no existe o todavia no esta disponible.</div>
        </section>
      ) : (
        <ProfilePanel
          userId={profile.id}
          profile={profile}
          isOwnProfile={isOwnProfile}
          followerCountOverride={followers}
          headerLabel="Cineriano"
          headerAction={action}
          profileMessage={
            isOwnProfile
              ? "Este es tu perfil publico dentro de Cinerian."
              : "Explora lo que esta persona vio, guardo y recomendo dentro de Cinerian."
          }
          readOnly={!isOwnProfile}
          onOpenUserProfile={onOpenUserProfile}
        />
      )}
    </div>
  );
}
