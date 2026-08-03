import { demoDiscovery, demoFeed } from "../data/demoData";

function findMediaFromPost(body: string) {
  const lowered = body.toLowerCase();
  return demoDiscovery.find((item) => lowered.includes(item.title.toLowerCase()));
}

export function FeedPanel() {
  return (
    <section className="feed-shell">
      <div className="feed-main">
        <header className="feed-header">
          <button type="button" className="feed-header__tab is-active">
            Para ti
          </button>
          <button type="button" className="feed-header__tab">
            Siguiendo
          </button>
        </header>

        <section className="composer-card">
          <div className="composer-card__avatar">C</div>
          <div className="composer-card__body">
            <input
              className="composer-card__input"
              type="text"
              placeholder="¿Que peli o serie te volo la cabeza hoy?"
            />
            <div className="composer-card__footer">
              <div className="composer-card__tools">
                <span>Poster</span>
                <span>Puntaje</span>
                <span>Watchlist</span>
              </div>
              <button type="button" className="primary-button">
                Publicar
              </button>
            </div>
          </div>
        </section>

        <div className="timeline-list">
          {demoFeed.map((entry) => {
            const media = findMediaFromPost(entry.body);

            return (
              <article className="timeline-card" key={entry.id}>
                <div className="timeline-card__avatar">{entry.author.slice(0, 1)}</div>

                <div className="timeline-card__content">
                  <div className="timeline-card__topline">
                    <div>
                      <strong>{entry.author}</strong>
                      <span className="timeline-card__meta">@{entry.author.toLowerCase()}</span>
                      <span className="timeline-card__meta">· {entry.createdAtLabel}</span>
                    </div>
                  </div>

                  <p className="timeline-card__text">{entry.body}</p>

                  {media ? (
                    <div className="timeline-card__media">
                      <img src={media.posterUrl} alt={media.title} className="timeline-card__poster" />
                      <div className="timeline-card__media-copy">
                        <p className="meta-line">
                          {media.mediaType === "tv" ? "Serie" : "Pelicula"} • {media.year}
                        </p>
                        <h3>{media.title}</h3>
                        <p>{media.overview}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="feed-sidebar">
        <section className="sidebar-card">
          <label className="sidebar-search">
            <span>Explorar Cinerianos</span>
            <input type="search" placeholder="Busca personas o posteos" />
          </label>
        </section>

        <section className="sidebar-card">
          <p className="section-eyebrow">En conversacion</p>
          <div className="sidebar-list">
            {demoDiscovery.slice(0, 3).map((item) => (
              <article className="sidebar-media" key={item.id}>
                <img src={item.posterUrl} alt={item.title} className="sidebar-media__poster" />
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.mediaType === "tv" ? "Serie" : "Pelicula"} • TMDB {item.score}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="sidebar-card">
          <p className="section-eyebrow">Recomendados para vos</p>
          <div className="poster-stack">
            {demoDiscovery.map((item) => (
              <img key={item.id} src={item.posterUrl} alt={item.title} className="poster-stack__item" />
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}
