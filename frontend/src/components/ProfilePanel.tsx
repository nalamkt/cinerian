import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { type Profile } from "../lib/auth";
import { fetchStoredReactions } from "../lib/reactions";
import { ProfileTabs } from "./ProfileTabs";

type ProfilePanelProps = {
  session: Session;
  profile: Profile | null;
};

export function ProfilePanel({ session, profile }: ProfilePanelProps) {
  const displayName = profile?.display_name ?? "Cineriano activo";
  const username = profile?.username ?? "cargando";
  const [stats, setStats] = useState({ likes: 0, watched: 0, followers: 0 });

  useEffect(() => {
    void fetchStoredReactions(session.user.id)
      .then((results) => {
        setStats({
          likes: results.filter((entry) => entry.reaction === "liked").length,
          watched: results.filter((entry) => entry.reaction === "watched").length,
          followers: 0
        });
      })
      .catch(() => {
        setStats({ likes: 0, watched: 0, followers: 0 });
      });
  }, [session.user.id]);

  return (
    <section className="panel profile-panel">
      <div className="profile-hero">
        <div className="profile-avatar" aria-hidden="true">
          {displayName.charAt(0).toUpperCase()}
        </div>

        <div className="profile-hero__copy">
          <div className="profile-hero__header">
            <div>
              <p className="section-eyebrow">Perfil</p>
              <h2>{displayName}</h2>
              <p className="profile-handle">@{username}</p>
            </div>
          </div>

          <div className="profile-stats">
            <div className="profile-stat">
              <strong>{stats.likes}</strong>
              <span>Me gusta</span>
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
            Tu perfil va juntando automaticamente lo que marcaste como visto y lo que guardaste en
            Me gusta.
          </p>
        </div>
      </div>

      <ProfileTabs userId={session.user.id} />
    </section>
  );
}
