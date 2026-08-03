import type { Session } from "@supabase/supabase-js";
import { signOut, type Profile } from "../lib/auth";

type ProfilePanelProps = {
  session: Session;
  profile: Profile | null;
};

export function ProfilePanel({ session, profile }: ProfilePanelProps) {
  const email = session.user.email ?? "sin-email";

  return (
    <section className="panel profile-panel">
      <p className="section-eyebrow">Usuario</p>
      <h2>{profile?.display_name ?? "Cineriano activo"}</h2>

      <div className="profile-summary">
        <div className="summary-row">
          <span>Usuario</span>
          <strong>@{profile?.username ?? "cargando"}</strong>
        </div>
        <div className="summary-row">
          <span>Email</span>
          <strong>{email}</strong>
        </div>
        <div className="summary-row">
          <span>UID</span>
          <strong>{session.user.id.slice(0, 8)}...</strong>
        </div>
      </div>

      <button type="button" className="ghost-button" onClick={() => void signOut()}>
        Cerrar sesion
      </button>
    </section>
  );
}
