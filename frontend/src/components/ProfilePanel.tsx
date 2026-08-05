import { useEffect, useState, type ReactNode } from "react";
import { type Profile } from "../lib/auth";
import { fetchFollowerCount } from "../lib/follows";
import { fetchStoredReactions, REACTIONS_UPDATED_EVENT } from "../lib/reactions";
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
};

export function ProfilePanel({
  userId,
  profile,
  isOwnProfile = true,
  followerCountOverride = null,
  profileMessage,
  headerLabel = "Perfil",
  headerAction,
  readOnly = false
}: ProfilePanelProps) {
  const displayName = profile?.display_name ?? "Cineriano activo";
  const username = profile?.username ?? "cargando";
  const [stats, setStats] = useState({ likes: 0, watched: 0, followers: 0 });

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      const results = await Promise.allSettled([fetchStoredReactions(userId), fetchFollowerCount(userId)]);
      if (!isMounted) {
        return;
      }

        const reactionsResult = results[0];
        const followersResult = results[1];
        const storedReactions = reactionsResult.status === "fulfilled" ? reactionsResult.value : [];
        const followers = followersResult.status === "fulfilled" ? followersResult.value : 0;

        setStats({
          likes: storedReactions.filter((entry) => entry.reaction === "liked").length,
          watched: storedReactions.filter((entry) => entry.reaction === "watched").length,
          followers: followerCountOverride ?? followers
        });
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
    });

    window.addEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);

    return () => {
      isMounted = false;
      window.removeEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);
    };
  }, [followerCountOverride, userId]);

  return (
    <section className="panel profile-panel">
      <div className="profile-hero">
        <div className="profile-avatar" aria-hidden="true">
          {displayName.charAt(0).toUpperCase()}
        </div>

        <div className="profile-hero__copy">
          <div className="profile-hero__header">
            <div>
              <p className="section-eyebrow">{headerLabel}</p>
              <h2>{displayName}</h2>
              <p className="profile-handle">@{username}</p>
            </div>

            {headerAction ? <div className="profile-hero__action">{headerAction}</div> : null}
          </div>

          <div className="profile-stats">
            <div className="profile-stat">
              <strong>{stats.likes}</strong>
              <span>Watchlist</span>
            </div>
            <div className="profile-stat">
              <strong>{stats.watched}</strong>
              <span>Vistas</span>
            </div>
            <div className="profile-stat">
              <strong>{stats.followers}</strong>
              <span>Seguidores</span>
            </div>
          </div>

          <p className="profile-bio">
            {profileMessage ??
              (isOwnProfile
                ? "Tu perfil va juntando automaticamente lo que marcaste como visto y lo que guardaste en Watchlist."
                : "Aca ves lo que esta persona ya miro, guardo para despues y publico dentro de Cinerian.")}
          </p>
        </div>
      </div>

      <ProfileTabs userId={userId} readOnly={readOnly} isOwnProfile={isOwnProfile} />
    </section>
  );
}
