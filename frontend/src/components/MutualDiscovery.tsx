import { useId, useState } from "react";
import { publicComparisonSections, type Profile } from "../lib/auth";

type MutualDiscoveryProps = {
  userId: string;
  profiles: Profile[];
  followingUserIds: string[];
  onCompare: (profile: { userId: string; username: string }) => void;
  alwaysOpen?: boolean;
};

export function comparableProfiles(profiles: Profile[], userId: string, followingUserIds: string[], query: string) {
  const term = query.trim().toLocaleLowerCase();
  return profiles
    .filter((profile) => profile.id !== userId && profile.username && (
      Object.values(publicComparisonSections(profile.visibility_settings)).some(Boolean)
    ))
    .filter((profile) => !term || `${profile.display_name} ${profile.username}`.toLocaleLowerCase().includes(term))
    .sort((left, right) => Number(followingUserIds.includes(right.id)) - Number(followingUserIds.includes(left.id)));
}

function MutualAvatar({ person }: { person: Profile }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className="mutual-discovery__avatar" aria-hidden="true">
      {person.display_name.slice(0, 1).toUpperCase()}
      {person.avatar_url && failedUrl !== person.avatar_url ? (
        <img src={person.avatar_url} alt="" onError={() => setFailedUrl(person.avatar_url)} />
      ) : null}
    </span>
  );
}

export function MutualDiscovery({ userId, profiles, followingUserIds, onCompare, alwaysOpen = false }: MutualDiscoveryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const id = useId();
  const matches = comparableProfiles(profiles, userId, followingUserIds, query);
  const showPicker = alwaysOpen || isOpen;

  return (
    <section className={`mutual-discovery${alwaysOpen ? " mutual-discovery--standalone" : ""}`} aria-label="Descubrir en común">
      <div className="mutual-discovery__intro">
        <div>
          <p className="section-eyebrow">Para mirar juntos</p>
          <h2>¿Qué vemos juntos?</h2>
          <p>Compará Vistas valoradas positivamente y Watchlists que la otra persona comparte.</p>
        </div>
        {!alwaysOpen ? <button type="button" className="profile-share-button" onClick={() => setIsOpen((current) => !current)} aria-expanded={isOpen} aria-controls={`${id}-people`}>
          {isOpen ? "Cerrar" : "Elegir persona"}
        </button> : null}
      </div>
      {showPicker ? (
        <div className="mutual-discovery__picker" id={`${id}-people`}>
          <label htmlFor={`${id}-search`}>Buscar una persona</label>
          <input id={`${id}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o usuario" autoComplete="off" />
          {matches.length ? (
            <div className="mutual-discovery__people">
              {matches.slice(0, 12).map((person) => (
                <button key={person.id} type="button" onClick={() => onCompare({ userId: person.id, username: person.username })}>
                  <MutualAvatar person={person} />
                  <span><strong>{person.display_name}</strong><small>@{person.username}</small></span>
                  <span className="mutual-discovery__arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          ) : <p className="mutual-discovery__empty">{query ? "No encontramos perfiles para comparar con esa búsqueda." : "Todavía no hay perfiles visibles para comparar."}</p>}
        </div>
      ) : null}
    </section>
  );
}
