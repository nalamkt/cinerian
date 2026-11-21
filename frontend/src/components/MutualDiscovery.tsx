import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMediaDetails } from "./MediaDetailsModal";
import { publicComparisonSections, type Profile } from "../lib/auth";
import { fetchStoredReactions, fetchWatchlistReactionsForUserIds, REACTIONS_UPDATED_EVENT } from "../lib/reactions";
import { getTitleById } from "../lib/tmdb";
import { buildMutualPreview, parseWatchlistKey, sharedWatchlistKeys, sortPeopleByMutualCount, watchlistKey } from "../lib/mutualWatchlist";
import type { DiscoveryItem, MediaType } from "../types";

type MutualDiscoveryProps = {
  userId: string;
  profiles: Profile[];
  followingUserIds: string[];
  onCompare: (profile: { userId: string; username: string }) => void;
  alwaysOpen?: boolean;
};

export function comparableProfiles(profiles: Profile[], userId: string, followingUserIds: string[], query: string) {
  const term = query.trim().toLocaleLowerCase();
  const following = new Set(followingUserIds);
  return profiles
    .filter((profile) => profile.id !== userId && profile.username && (
      Object.values(publicComparisonSections(profile.visibility_settings)).some(Boolean)
    ))
    .filter((profile) => term
      ? `${profile.display_name} ${profile.username}`.toLocaleLowerCase().includes(term)
      : following.has(profile.id))
    .sort((left, right) => Number(following.has(right.id)) - Number(following.has(left.id)));
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

type MutualPreview = { count: number; items: DiscoveryItem[] };

export function PreviewTitles({ preview, loading, error, privateWatchlist, mobile = false, onOpenDetails }: {
  preview: MutualPreview | undefined;
  loading: boolean;
  error: boolean;
  privateWatchlist: boolean;
  mobile?: boolean;
  onOpenDetails?: (item: DiscoveryItem) => void;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressOpenUntilRef = useRef(0);
  if (privateWatchlist) return <p className="mutual-discovery__empty">Esta persona no comparte su Watchlist.</p>;
  if (loading) return <p className="mutual-discovery__empty" role="status">Buscando títulos en común...</p>;
  if (error) return <p className="mutual-discovery__empty">No pudimos cargar la vista previa.</p>;
  if (!preview?.count) return <p className="mutual-discovery__empty">Todavía no tienen títulos en común en sus Watchlists.</p>;
  if (!preview.items.length) return <p className="mutual-discovery__empty">Hay títulos en común, pero no pudimos cargar sus pósters.</p>;

  return (
    <div className="mutual-discovery__preview" aria-label="Títulos en común mejor puntuados">
      {(mobile ? preview.items : preview.items.slice(0, 3)).map((item) => (
        <div className="mutual-discovery__title" key={watchlistKey({ mediaType: item.mediaType, tmdbId: item.id })}>
          <button type="button" className="mutual-discovery__poster-button" aria-label={`Ver ficha de ${item.title}`} onTouchStart={(event) => { touchStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={(event) => {
            const start = touchStartRef.current;
            touchStartRef.current = null;
            if (start && Math.abs(event.changedTouches[0].clientX - start.x) > 10 && Math.abs(event.changedTouches[0].clientX - start.x) > Math.abs(event.changedTouches[0].clientY - start.y)) suppressOpenUntilRef.current = Date.now() + 350;
          }} onClick={(event) => { event.stopPropagation(); if (Date.now() >= suppressOpenUntilRef.current) onOpenDetails?.(item); }}>
            {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" /> : <span className="mutual-discovery__poster-fallback" aria-hidden="true">C</span>}
          </button>
          <strong>{item.title}</strong>
          <small>{item.year ? `${item.year} · ` : ""}TMDB {item.score.toFixed(1)}</small>
        </div>
      ))}
    </div>
  );
}

function PreviewTitlesWithDetails(props: Omit<Parameters<typeof PreviewTitles>[0], "onOpenDetails">) {
  const { openMediaDetails } = useMediaDetails();
  return <PreviewTitles {...props} onOpenDetails={openMediaDetails} />;
}

export function MutualDiscovery({ userId, profiles, followingUserIds, onCompare, alwaysOpen = false }: MutualDiscoveryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ownWatchlist, setOwnWatchlist] = useState<Array<{ mediaType: MediaType; tmdbId: number }> | null>(null);
  const [ownLoadError, setOwnLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [previews, setPreviews] = useState<{ key: string; entries: Record<string, MutualPreview>; orderedIds: string[]; error: boolean } | null>(null);
  const id = useId();
  const matches = useMemo(() => comparableProfiles(profiles, userId, followingUserIds, query), [profiles, userId, followingUserIds, query]);
  const showPicker = alwaysOpen || isOpen;
  const previewKey = `${userId}:${retryKey}:${matches.map((person) => `${person.id}:${Number(publicComparisonSections(person.visibility_settings).watchlist)}`).join(",")}`;

  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ userId?: string }>).detail?.userId === userId) {
        setRetryKey((value) => value + 1);
      }
    };
    window.addEventListener(REACTIONS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(REACTIONS_UPDATED_EVENT, refresh);
  }, [userId]);

  useEffect(() => {
    if (!showPicker) return;
    let current = true;
    setOwnWatchlist(null);
    setOwnLoadError(false);
    void fetchStoredReactions(userId).then((reactions) => {
      if (current) setOwnWatchlist(reactions.filter((reaction) => reaction.reaction === "watchlist"));
    }).catch(() => {
      if (current) setOwnLoadError(true);
    });
    return () => { current = false; };
  }, [showPicker, userId, retryKey]);

  useEffect(() => {
    if (!showPicker || !ownWatchlist) return;
    let current = true;
    const publicPeople = matches.filter((person) => publicComparisonSections(person.visibility_settings).watchlist);
    const ownIds = [...new Set(ownWatchlist.map((item) => item.tmdbId))];

    async function loadPreviews() {
      const entries: Record<string, MutualPreview> = {};
      if (!publicPeople.length || !ownIds.length) {
        for (const person of publicPeople) entries[person.id] = { count: 0, items: [] };
      } else {
        const remote = await fetchWatchlistReactionsForUserIds(publicPeople.map((person) => person.id), ownIds);
        const byPerson = new Map<string, Array<{ mediaType: MediaType; tmdbId: number }>>();
        for (const reaction of remote) {
          byPerson.set(reaction.userId, [...(byPerson.get(reaction.userId) ?? []), reaction]);
        }
        const keysByPerson = new Map<string, string[]>();
        for (const person of publicPeople) {
          const keys = sharedWatchlistKeys(ownWatchlist ?? [], byPerson.get(person.id) ?? []);
          keysByPerson.set(person.id, keys);
        }
        const counts = Object.fromEntries(publicPeople.map((person) => [person.id, keysByPerson.get(person.id)?.length ?? 0]));
        const selectedPeople = sortPeopleByMutualCount(matches, counts).slice(0, 12);
        const sharedKeys = new Set(selectedPeople.flatMap((person) => keysByPerson.get(person.id) ?? []));
        const titles = new Map<string, DiscoveryItem>();
        const keys = [...sharedKeys];
        for (let index = 0; index < keys.length; index += 6) {
          await Promise.all(keys.slice(index, index + 6).map(async (key) => {
            const parsed = parseWatchlistKey(key);
            if (!parsed) return;
            try {
              const item = await getTitleById(parsed.tmdbId, parsed.mediaType);
              if (item) titles.set(key, item);
            } catch {
              // El orden y la cantidad de coincidencias no dependen de cargar pósters.
            }
          }));
        }
        for (const person of selectedPeople) {
          const keys = keysByPerson.get(person.id) ?? [];
          entries[person.id] = buildMutualPreview(keys, titles);
        }
      }
      const counts = Object.fromEntries(Object.entries(entries).map(([id, preview]) => [id, preview.count]));
      const orderedIds = sortPeopleByMutualCount(matches, counts).slice(0, 12).map((person) => person.id);
      if (current) setPreviews({ key: previewKey, entries, orderedIds, error: false });
    }

    void loadPreviews().catch(() => {
      if (current) setPreviews({ key: previewKey, entries: {}, orderedIds: [], error: true });
    });
    return () => { current = false; };
  }, [showPicker, ownWatchlist, previewKey, matches]);

  const previewsReady = ownWatchlist !== null && !ownLoadError && previews?.key === previewKey;
  const previewLoading = !ownLoadError && (ownWatchlist === null || !previewsReady);
  const visiblePeople = previewsReady && !previews?.error
    ? previews.orderedIds.map((personId) => matches.find((person) => person.id === personId)).filter((person): person is Profile => Boolean(person))
    : matches.slice(0, 12);

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
              {ownLoadError ? <p className="mutual-discovery__empty" role="alert">No pudimos cargar tus coincidencias. <button type="button" onClick={() => setRetryKey((value) => value + 1)}>Reintentar</button></p> : null}
              {previewsReady && previews?.error ? <p className="mutual-discovery__empty" role="alert">No pudimos cargar las vistas previas. <button type="button" onClick={() => setRetryKey((value) => value + 1)}>Reintentar</button></p> : null}
              {previewLoading ? <p className="mutual-discovery__empty" role="status">Buscando títulos en común...</p> : visiblePeople.map((person) => {
                const privateWatchlist = !publicComparisonSections(person.visibility_settings).watchlist;
                const preview = previewsReady ? previews?.entries[person.id] : undefined;
                const count = !privateWatchlist && preview && !previews?.error ? `${preview.count} ${preview.count === 1 ? "título" : "títulos"} en común` : null;
                const content = (mobile: boolean) => <>
                  <PreviewTitlesWithDetails preview={preview} loading={previewLoading} error={ownLoadError || Boolean(previewsReady && previews?.error)} privateWatchlist={privateWatchlist} mobile={mobile} />
                  <button type="button" className="profile-share-button mutual-discovery__more" aria-label={`Ver todas las coincidencias con ${person.display_name}`} onClick={() => onCompare({ userId: person.id, username: person.username })}>Ver todo</button>
                </>;
                return (
                  <div className="mutual-discovery__person" key={person.id}>
                    <article className="mutual-discovery__person-card">
                      <div className="mutual-discovery__person-heading"><MutualAvatar person={person} /><span><strong>{person.display_name}</strong><small>@{person.username}</small></span></div>
                      {count ? <p className="mutual-discovery__count">{count}</p> : null}
                      {content(false)}
                    </article>
                    <details className="mutual-discovery__person-accordion">
                      <summary><MutualAvatar person={person} /><span><strong>{person.display_name}</strong><small>{count ?? `@${person.username}`}</small></span><span className="mutual-discovery__arrow" aria-hidden="true">⌄</span></summary>
                      <div className="mutual-discovery__person-content">{content(true)}</div>
                    </details>
                  </div>
                );
              })}
            </div>
          ) : <p className="mutual-discovery__empty">{query.trim() ? "No encontramos perfiles disponibles para comparar con esa búsqueda." : "No hay personas que seguís disponibles para comparar. Buscá a cualquier otra persona por nombre o usuario."}</p>}
        </div>
      ) : null}
    </section>
  );
}
