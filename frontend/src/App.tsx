import { AuthPanel } from "./components/AuthPanel";
import { FeedPanel } from "./components/FeedPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { SearchPanel } from "./components/SearchPanel";
import { useAuth } from "./hooks/useAuth";
import { hasSupabaseEnv } from "./lib/supabase";
import { useState } from "react";

type AppView = "feed" | "search" | "recommendations" | "user";

const dockItems: Array<{ id: AppView; label: string; short: string }> = [
  { id: "feed", label: "Feed", short: "F" },
  { id: "search", label: "Buscador", short: "B" },
  { id: "recommendations", label: "Recomendador", short: "R" },
  { id: "user", label: "Usuario", short: "U" }
];

export default function App() {
  const { session, profile, isLoading, error } = useAuth();
  const [activeView, setActiveView] = useState<AppView>("feed");

  function renderActiveView() {
    switch (activeView) {
      case "search":
        return <SearchPanel />;
      case "recommendations":
        return <RecommendationPanel />;
      case "user":
        return <ProfilePanel session={session!} profile={profile} />;
      case "feed":
      default:
        return <FeedPanel />;
    }
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-shell__inner">
          <section className="auth-hero-card">
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
            <div className="dock__brand">C</div>
            {dockItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`dock__button ${activeView === item.id ? "is-active" : ""}`}
                onClick={() => setActiveView(item.id)}
                aria-label={item.label}
              >
                <span className="dock__icon">{item.short}</span>
                <span className="dock__label">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <section className="workspace-content">{renderActiveView()}</section>
      </main>
    </div>
  );
}
