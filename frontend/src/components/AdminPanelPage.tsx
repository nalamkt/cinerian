import { AuthPanel } from "./AuthPanel";
import { CinerianLogo } from "./CinerianLogo";
import { useAuth } from "../hooks/useAuth";
import { usePublicFeatureFlags } from "../hooks/usePublicFeatureFlags";
import { getAccessControl } from "../lib/access";
import { hasSupabaseEnv } from "../lib/supabase";
import { AdminControlPanel } from "./AdminControlPanel";
import { attachAdminTelemetry, hasAdminAccess } from "../lib/admin";
import { useEffect, useMemo, useState } from "react";

export function AdminPanelPage() {
  const { session, profile, isLoading, error } = useAuth();
  const { enabledFeatures, refreshEnabledFeatures } = usePublicFeatureFlags();
  const [hasDatabaseAdminAccess, setHasDatabaseAdminAccess] = useState(false);
  const accessControl = useMemo(
    () =>
      getAccessControl({
        session,
        profile,
        enabledFeatureOverrides: enabledFeatures
      }),
    [enabledFeatures, profile, session]
  );

  useEffect(() => {
    attachAdminTelemetry(session?.user.id ?? null);
  }, [session?.user.id]);

  useEffect(() => {
    let isMounted = true;

    async function loadAdminAccess() {
      if (!session?.user.id) {
        setHasDatabaseAdminAccess(false);
        return;
      }

      const canAccess = await hasAdminAccess(session.user.id);
      if (isMounted) {
        setHasDatabaseAdminAccess(canAccess);
      }
    }

    void loadAdminAccess();
    return () => {
      isMounted = false;
    };
  }, [session?.user.id]);

  const canAccessPanel = accessControl.canAccessAdminPanel || hasDatabaseAdminAccess;

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-shell__inner">
          <section className="auth-hero-card">
            <CinerianLogo className="auth-logo" />
            <p className="section-eyebrow">Panel</p>
            <h1>Control operativo de Cinerian</h1>
            <p className="section-description">
              Ingresá con una cuenta interna para ver métricas, flags y logs de la app en una vista separada.
            </p>
          </section>

          <div className="auth-shell__form">
            {error ? <div className="app-alert">{error}</div> : null}
            {isLoading ? <div className="app-alert">Cargando sesion...</div> : null}
            <AuthPanel isSupabaseReady={hasSupabaseEnv} canCreateAccount={false} />
          </div>
        </div>
      </div>
    );
  }

  if (!canAccessPanel) {
    return (
      <div className="auth-shell">
        <div className="auth-shell__inner">
          <section className="auth-hero-card">
            <CinerianLogo className="auth-logo" />
            <p className="section-eyebrow">Panel</p>
            <h1>Acceso restringido</h1>
            <p className="section-description">
              Esta cuenta no tiene permiso para entrar a `/panel`. Agregala a la whitelist interna o al acceso admin en Supabase.
            </p>
            <div className="token-row">
              <span>{session.user.email ?? "Usuario autenticado"}</span>
              <span>
                <a href="/">Volver a la app</a>
              </span>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--immersive">
      <AdminControlPanel
        operatorName={profile?.display_name ?? profile?.username ?? "Equipo interno"}
        operatorEmail={session.user.email}
        enabledPublicFeatures={accessControl.enabledPublicFeatures}
        sessionUserId={session.user.id}
        hasDatabaseAdminAccess={hasDatabaseAdminAccess}
        onFeatureOverridesChange={() => void refreshEnabledFeatures()}
      />
    </div>
  );
}
