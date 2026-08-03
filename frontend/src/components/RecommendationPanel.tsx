import { demoDiscovery } from "../data/demoData";
import { SectionHeader } from "./SectionHeader";

const spotlight = demoDiscovery[0];

export function RecommendationPanel() {
  return (
    <section className="panel spotlight-panel">
      <SectionHeader
        eyebrow="Recomendacion"
        title="La experiencia swipe ya tiene forma"
        description="Por ahora es conceptual y visual, para que migremos primero la arquitectura antes de enchufar todos los eventos."
      />

      <article className="spotlight-card">
        <img src={spotlight.posterUrl} alt={spotlight.title} className="spotlight-image" />
        <div className="spotlight-copy">
          <p className="meta-line">
            {spotlight.mediaType === "tv" ? "Serie" : "Pelicula"} • {spotlight.year}
          </p>
          <h3>{spotlight.title}</h3>
          <p>{spotlight.overview}</p>
          <div className="token-row">
            {spotlight.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          <div className="action-row">
            <button type="button" className="ghost-button">
              Paso
            </button>
            <button type="button" className="ghost-button">
              Me gusta
            </button>
            <button type="button" className="primary-button">
              Ya la vi
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
