import { useMemo, useState } from "react";
import { demoDiscovery } from "../data/demoData";

export function RecommendationPanel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedIds, setLikedIds] = useState<number[]>([]);

  const spotlight = demoDiscovery[currentIndex % demoDiscovery.length];
  const likedItems = useMemo(
    () => demoDiscovery.filter((item) => likedIds.includes(item.id)),
    [likedIds]
  );

  function goNext() {
    setCurrentIndex((value) => (value + 1) % demoDiscovery.length);
  }

  function handleLike() {
    setLikedIds((current) => (current.includes(spotlight.id) ? current : [spotlight.id, ...current]));
    goNext();
  }

  function handleSkip() {
    goNext();
  }

  function handleWatched() {
    goNext();
  }

  return (
    <section className="recommendation-shell">
      <div className="recommendation-main panel">
        <div className="recommendation-stage">
          <div className="recommendation-headline">
            <div>
              <p className="meta-line">
                {spotlight.mediaType === "tv" ? "Serie" : "Pelicula"} • {spotlight.year}
              </p>
              <h2>{spotlight.title}</h2>
            </div>
            <div className="recommendation-score">TMDB {spotlight.score}</div>
          </div>

          <article className="recommendation-card">
            <img src={spotlight.posterUrl} alt={spotlight.title} className="recommendation-card__image" />
          </article>

          <div className="token-row">
            {spotlight.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>

          <p className="recommendation-overview">{spotlight.overview}</p>

          <div className="recommendation-actions">
            <button type="button" className="ghost-button" onClick={handleSkip}>
              Paso
            </button>
            <button type="button" className="ghost-button" onClick={handleLike}>
              Me gusta
            </button>
            <button type="button" className="primary-button" onClick={handleWatched}>
              Ya la vi
            </button>
          </div>
        </div>
      </div>

      <aside className="recommendation-side panel">
        <p className="section-eyebrow">Tus likes</p>
        <h2>Lo que fuiste marcando</h2>

        <div className="recommendation-like-list">
          {likedItems.length ? (
            likedItems.map((item) => (
              <article className="liked-card" key={item.id}>
                <img src={item.posterUrl} alt={item.title} className="liked-card__poster" />
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-like-state">
              Marca algunas recomendaciones con <strong>Me gusta</strong> y te las voy guardando aca.
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
