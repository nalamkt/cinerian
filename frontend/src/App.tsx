import { AuthPanel } from "./components/AuthPanel";
import { CinerianLogo } from "./components/CinerianLogo";
import { FeedPanel } from "./components/FeedPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { SearchPanel } from "./components/SearchPanel";
import { useAuth } from "./hooks/useAuth";
import { signOut } from "./lib/auth";
import { hasSupabaseEnv } from "./lib/supabase";
import { useState } from "react";

type AppView = "feed" | "search" | "recommendations" | "user";

function DockIcon({ id }: { id: AppView }) {
  if (id === "feed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }

  if (id === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
    );
  }

  if (id === "recommendations") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.22 6.8 19l1-5.78L3.58 9.12l5.82-.85z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H4" />
    </svg>
  );
}

const dockItems: Array<{ id: AppView; label: string }> = [
  { id: "feed", label: "Inicio" },
  { id: "search", label: "Buscador" },
  { id: "recommendations", label: "Recomendador" },
  { id: "user", label: "Mi cuenta" }
];

export default function App() {
  const { session, profile, isLoading, error } = useAuth();
  const [activeView, setActiveView] = useState<AppView>("feed");

  function renderActiveView() {
    switch (activeView) {
      case "search":
        return <SearchPanel userId={session!.user.id} />;
      case "recommendations":
        return <RecommendationPanel userId={session!.user.id} />;
      case "user":
        return <ProfilePanel session={session!} profile={profile} />;
      case "feed":
      default:
        return <FeedPanel userId={session!.user.id} profile={profile} />;
    }
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-shell__inner">
          <section className="auth-hero-card">
            <CinerianLogo className="auth-logo" />
            <p className="section-eyebrow">Cinerian</p>
            <h1>Tu mundo de pelis y series, ahora con identidad real</h1>
            <p className="section-description">
              Sumate a Cinerian para registrar lo que viste, puntuar, recomendar y descubrir que
              mirar con una experiencia social hecha para cinefilos.
            </p>
          </section>

          <div className="auth-shell__form">
            {error ? <div className="app-alert">{error}</div> : null}
            {isLoading ? <div className="app-alert">Cargando sesion...</div> : null}
            <AuthPanel isSupabaseReady={hasSupabaseEnv} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--immersive">
      {error ? <div className="app-alert app-alert--floating">{error}</div> : null}
      {isLoading ? <div className="app-alert app-alert--floating">Cargando sesion...</div> : null}

      <main className="workspace-grid workspace-grid--immersive">
        <nav className="dock">
          <div className="dock__items">
            <div className="dock__brand">
              <CinerianLogo className="dock__brand-logo" />
            </div>
            <div className="dock__nav">
              {dockItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`dock__button ${activeView === item.id ? "is-active" : ""}`}
                  onClick={() => setActiveView(item.id)}
                  aria-label={item.label}
                >
                  <span className="dock__icon">
                    <DockIcon id={item.id} />
                  </span>
                  <span className="dock__label">{item.label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="dock__button dock__button--logout"
              onClick={() => void signOut()}
              aria-label="Cerrar sesion"
            >
              <span className="dock__icon">
                <LogoutIcon />
              </span>
              <span className="dock__label">Salir</span>
            </button>
          </div>
        </nav>

        <section className="workspace-content">{renderActiveView()}</section>
      </main>
    </div>
  );
}
