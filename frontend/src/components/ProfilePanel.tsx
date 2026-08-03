import type { Session } from "@supabase/supabase-js";
import { signOut, type Profile } from "../lib/auth";
import { ProfileTabs } from "./ProfileTabs";

type ProfilePanelProps = {
  session: Session;
  profile: Profile | null;
};

export function ProfilePanel({ session, profile }: ProfilePanelProps) {
  const email = session.user.email ?? "sin-email";
  const displayName = profile?.display_name ?? "Cineriano activo";
  const username = profile?.username ?? "cargando";

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

            <button type="button" className="ghost-button" onClick={() => void signOut()}>
              Cerrar sesion
            </button>
          </div>

          <div className="profile-stats">
            <div className="profile-stat">
              <strong>{session.user.id.slice(0, 4)}</strong>
              <span>ID corto</span>
            </div>
            <div className="profile-stat">
              <strong>{email.split("@")[0]}</strong>
              <span>Cuenta</span>
            </div>
            <div className="profile-stat">
              <strong>Cinerian</strong>
              <span>Estado</span>
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
