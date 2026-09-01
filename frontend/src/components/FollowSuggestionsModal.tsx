import { useEffect, useState } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchFollowingUserIds, followUser } from "../lib/follows";

type FollowSuggestionsModalProps = {
  userId: string;
  onClose: () => void;
};

export function FollowSuggestionsModal({ userId, onClose }: FollowSuggestionsModalProps) {
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followingInFlight, setFollowingInFlight] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSuggestions() {
      try {
        const [profiles, followedIds] = await Promise.all([listProfiles(), fetchFollowingUserIds(userId)]);
        if (!isMounted) {
          return;
        }

        setFollowingIds(followedIds);
        setSuggestions(
          profiles
            .filter((profile) => profile.id !== userId && !followedIds.includes(profile.id))
            .slice(0, 5)
        );
      } catch {
        if (isMounted) {
          setSuggestions([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSuggestions();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleFollow(targetUserId: string) {
    if (followingInFlight || followingIds.includes(targetUserId)) {
      return;
    }

    setFollowingInFlight(targetUserId);
    setFollowingIds((current) => [...current, targetUserId]);

    try {
      await followUser(userId, targetUserId);
    } catch {
      setFollowingIds((current) => current.filter((id) => id !== targetUserId));
    } finally {
      setFollowingInFlight(null);
    }
  }

  return (
    <div className="follow-suggestions__backdrop" role="presentation">
      <section
        className="follow-suggestions"
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-suggestions-title"
      >
        <button type="button" className="follow-suggestions__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>

        <p className="section-eyebrow">Tu circulo</p>
        <h2 id="follow-suggestions-title">Empeza a seguir cinerianos</h2>
        <p className="follow-suggestions__intro">
          Segui a algunas personas para que Cinerian empiece a mostrarte sus opiniones y recomendaciones.
        </p>

        <div className="follow-suggestions__list">
          {isLoading ? <p className="sidebar-empty">Buscando cinerianos para vos...</p> : null}

          {!isLoading && suggestions.length === 0 ? (
            <p className="sidebar-empty">Por ahora no hay cinerianos nuevos para recomendarte.</p>
          ) : null}

          {suggestions.map((profile) => {
            const isFollowing = followingIds.includes(profile.id);
            return (
              <article className="sidebar-user" key={profile.id}>
                <span className="sidebar-user__profile follow-suggestions__user">
                  <span className="sidebar-user__avatar" aria-hidden="true">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="sidebar-user__avatar-image" />
                    ) : (
                      profile.display_name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="sidebar-user__copy">
                    <strong>{profile.display_name}</strong>
                    <span>@{profile.username}</span>
                  </span>
                </span>
                <button
                  type="button"
                  className={`sidebar-user__follow ${isFollowing ? "is-following" : ""}`}
                  onClick={() => void handleFollow(profile.id)}
                  disabled={followingInFlight === profile.id || isFollowing}
                  aria-label={isFollowing ? `Ya seguís a ${profile.display_name}` : `Seguir a ${profile.display_name}`}
                >
                  {followingInFlight === profile.id ? "…" : isFollowing ? "✓" : "+"}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
