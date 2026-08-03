import { ArchitecturePanel } from "./components/ArchitecturePanel";
import { FeedPanel } from "./components/FeedPanel";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { SearchPanel } from "./components/SearchPanel";

export default function App() {
  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="section-eyebrow">Cinerian Next</p>
          <h1>Primer paso real hacia React + Supabase</h1>
          <p className="section-description">
            La app vieja queda como referencia. Desde aca empezamos la nueva base donde buscador,
            feed y recomendaciones ya comparten una misma arquitectura.
          </p>
        </div>

        <div className="hero-grid">
          <div className="metric-card">
            <span>Stack</span>
            <strong>React + Vite</strong>
          </div>
          <div className="metric-card">
            <span>Backend</span>
            <strong>Supabase Ready</strong>
          </div>
          <div className="metric-card">
            <span>Modo</span>
            <strong>Demo + TMDB opcional</strong>
          </div>
        </div>
      </header>

      <main className="main-grid">
        <div className="content-column">
          <SearchPanel />
          <RecommendationPanel />
          <FeedPanel />
        </div>
        <ArchitecturePanel />
      </main>
    </div>
  );
}
