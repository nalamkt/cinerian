import { useState } from "react";
import { useDiscovery } from "../hooks/useDiscovery";
import { SectionHeader } from "./SectionHeader";

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const { results, isLoading, error } = useDiscovery(query);

  return (
    <section className="panel">
      <SectionHeader
        eyebrow="Buscador"
        title="Encontra rapido que ver"
        description="Este primer paso ya vive en React y mantiene la idea central de Cinerian."
      />

      <label className="input-stack">
        <span>Busca una pelicula o serie</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej: Interstellar, The Bear, Parasite"
        />
      </label>

      <div className="inline-status">
        {isLoading ? "Buscando..." : error ? error : `${results.length} resultados listos`}
      </div>

      <div className="card-list">
        {results.map((item) => (
          <article className="media-card" key={`${item.mediaType}-${item.id}`}>
            <img src={item.posterUrl} alt={item.title} className="media-poster" />
            <div className="media-copy">
              <p className="meta-line">
                {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
              </p>
              <h3>{item.title}</h3>
              <p>{item.overview}</p>
              <div className="token-row">
                <span>TMDB {item.score}</span>
                {item.providers.map((provider) => (
                  <span key={provider}>{provider}</span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
