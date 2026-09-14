import { useEffect, useState } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchFollowedByUsers, fetchFollowingUserIds, followUser } from "../lib/follows";

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
        const friendsOfFriendsIds = await fetchFollowedByUsers(followedIds);
        if (!isMounted) {
          return;
        }

        setFollowingIds(followedIds);
        const candidateIds = new Set(friendsOfFriendsIds);
        setSuggestions(
          profiles
            .filter(
              (profile) =>
                profile.id !== userId && !followedIds.includes(profile.id) && candidateIds.has(profile.id)
            )
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
    if (!isLoading && suggestions.length === 0) {
      onClose();
    }
  }, [isLoading, onClose, suggestions.length]);

  async function handleFollow(targetUserId: string) {
    if (followingInFlight || followingIds.includes(targetUserId)) {
      return;
    }

    setFollowingInFlight(targetUserId);

    try {
      await followUser(userId, targetUserId);
      setFollowingIds((current) => [...current, targetUserId]);
      setSuggestions((current) => current.filter((profile) => profile.id !== targetUserId));
    } catch {
      // Keep the suggestion available so the user can retry if the follow request fails.
    } finally {
      setFollowingInFlight(null);
    }
  }

  // Only show the prompt when there is someone new the user can actually follow.
  if (isLoading || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="follow-suggestions__backdrop" role="presentation">
      <section
        className="follow-suggestions"
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-suggestions-title"
      >
        <button type="button" className="follow-suggestions__close" onClick={onClose} aria-label="Cerrar" data-escape-dismiss>
          ×
        </button>

        <p className="section-eyebrow">Tu circulo</p>
        <h2 id="follow-suggestions-title">Empeza a seguir cinerianos</h2>
        <p className="follow-suggestions__intro">
          Segui a algunas personas para que Cinerian empiece a mostrarte sus opiniones y recomendaciones.
        </p>

        <div className="follow-suggestions__list">
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
