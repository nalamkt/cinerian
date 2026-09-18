// Tracking de capitulos vistos. La verdad vive en Supabase (tabla
// `episode_watched`), pero mantenemos un cache en memoria por (userId, showId)
// para que la UI pueda leerlo sincronamente. Los cambios optimisticos
// disparan un evento para que los componentes suscritos se refresquen.
import { supabase } from "./supabase";

const EVENT_NAME = "cinerian:episodes-updated";
const LEGACY_STORAGE_KEY = "cinerian:episodes-watched";

type ShowKey = `${string}:${number}`;

const cache = new Map<ShowKey, Set<string>>();
const hydrated = new Set<ShowKey>();
const inflightHydrations = new Map<ShowKey, Promise<void>>();
const legacyMigrations = new Set<string>();

function shk(userId: string, showId: number): ShowKey {
  return `${userId}:${showId}`;
}

function episodeKey(showId: number, seasonNumber: number, episodeNumber: number) {
  return `${showId}:${seasonNumber}:${episodeNumber}`;
}

function notifyChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function readLegacyMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function clearLegacyMap() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignoramos: en modo privado o con storage bloqueado no hay nada que hacer.
  }
}

// Migra una unica vez por sesion las marcas guardadas en localStorage
// (esquema viejo) al Supabase del usuario logueado. Si no hay nada, es no-op.
async function migrateLegacyEntriesOnce(userId: string) {
  if (!supabase || legacyMigrations.has(userId)) return;
  legacyMigrations.add(userId);

  const legacy = readLegacyMap();
  const entries = Object.entries(legacy);
  if (!entries.length) return;

  const rows = entries
    .map(([key, watchedAt]) => {
      const [showIdStr, seasonStr, episodeStr] = key.split(":");
      const tmdb_show_id = Number(showIdStr);
      const season_number = Number(seasonStr);
      const episode_number = Number(episodeStr);
      if (![tmdb_show_id, season_number, episode_number].every(Number.isFinite)) {
        return null;
      }
      return {
        user_id: userId,
        tmdb_show_id,
        season_number,
        episode_number,
        watched_at: watchedAt || new Date().toISOString()
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (!rows.length) {
    clearLegacyMap();
    return;
  }

  const { error } = await supabase
    .from("episode_watched")
    .upsert(rows, { onConflict: "user_id,tmdb_show_id,season_number,episode_number" });

  if (!error) {
    clearLegacyMap();
  }
}

export async function hydrateWatchedEpisodes(userId: string, showId: number): Promise<void> {
  if (!supabase) return;
  const key = shk(userId, showId);
  if (hydrated.has(key)) return;

  const existing = inflightHydrations.get(key);
  if (existing) return existing;

  const promise = (async () => {
    await migrateLegacyEntriesOnce(userId);

    const { data, error } = await supabase
      .from("episode_watched")
      .select("season_number, episode_number")
      .eq("user_id", userId)
      .eq("tmdb_show_id", showId);

    if (error) {
      return;
    }

    const set = new Set<string>();
    for (const row of data ?? []) {
      set.add(episodeKey(showId, Number(row.season_number), Number(row.episode_number)));
    }
    cache.set(key, set);
    hydrated.add(key);
    notifyChange();
  })().finally(() => {
    inflightHydrations.delete(key);
  });

  inflightHydrations.set(key, promise);
  return promise;
}

export function getWatchedEpisodes(userId: string | null, showId: number): Set<string> {
  if (!userId) return new Set();
  return cache.get(shk(userId, showId)) ?? new Set();
}

export function isEpisodeWatched(
  userId: string | null,
  showId: number,
  seasonNumber: number,
  episodeNumber: number
) {
  if (!userId) return false;
  const set = cache.get(shk(userId, showId));
  return set ? set.has(episodeKey(showId, seasonNumber, episodeNumber)) : false;
}

export function getEpisodeWatchedAt(
  userId: string | null,
  showId: number,
  seasonNumber: number,
  episodeNumber: number
): string | null {
  // Ya no guardamos el `watched_at` en memoria para el cache primario. Si algun
  // dia lo necesitamos como valor exacto lo consultamos en Supabase; hoy la UI
  // solo distingue vista/no vista, asi que devolvemos "vista" o null.
  return isEpisodeWatched(userId, showId, seasonNumber, episodeNumber)
    ? new Date().toISOString()
    : null;
}

function updateCache(
  userId: string,
  showId: number,
  updater: (set: Set<string>) => void
) {
  const key = shk(userId, showId);
  const current = cache.get(key) ?? new Set<string>();
  const next = new Set(current);
  updater(next);
  cache.set(key, next);
  hydrated.add(key);
  notifyChange();
}

export async function setEpisodeWatched(
  userId: string | null,
  showId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean
) {
  if (!userId || !supabase) return;

  updateCache(userId, showId, (set) => {
    const key = episodeKey(showId, seasonNumber, episodeNumber);
    if (watched) {
      set.add(key);
    } else {
      set.delete(key);
    }
  });

  if (watched) {
    const { error } = await supabase.from("episode_watched").upsert(
      {
        user_id: userId,
        tmdb_show_id: showId,
        season_number: seasonNumber,
        episode_number: episodeNumber,
        watched_at: new Date().toISOString()
      },
      { onConflict: "user_id,tmdb_show_id,season_number,episode_number" }
    );
    if (error) {
      // Rollback optimista.
      updateCache(userId, showId, (set) =>
        set.delete(episodeKey(showId, seasonNumber, episodeNumber))
      );
    }
    return;
  }

  const { error } = await supabase
    .from("episode_watched")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_show_id", showId)
    .eq("season_number", seasonNumber)
    .eq("episode_number", episodeNumber);

  if (error) {
    updateCache(userId, showId, (set) =>
      set.add(episodeKey(showId, seasonNumber, episodeNumber))
    );
  }
}

export async function setSeasonWatched(
  userId: string | null,
  showId: number,
  seasonNumber: number,
  episodeNumbers: number[],
  watched: boolean
) {
  if (!userId || !supabase || !episodeNumbers.length) return;

  const previous = new Set(cache.get(shk(userId, showId)) ?? []);

  updateCache(userId, showId, (set) => {
    for (const episodeNumber of episodeNumbers) {
      const key = episodeKey(showId, seasonNumber, episodeNumber);
      if (watched) set.add(key);
      else set.delete(key);
    }
  });

  if (watched) {
    const rows = episodeNumbers.map((episodeNumber) => ({
      user_id: userId,
      tmdb_show_id: showId,
      season_number: seasonNumber,
      episode_number: episodeNumber,
      watched_at: new Date().toISOString()
    }));
    const { error } = await supabase
      .from("episode_watched")
      .upsert(rows, { onConflict: "user_id,tmdb_show_id,season_number,episode_number" });
    if (error) {
      cache.set(shk(userId, showId), previous);
      notifyChange();
    }
    return;
  }

  const { error } = await supabase
    .from("episode_watched")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_show_id", showId)
    .eq("season_number", seasonNumber)
    .in("episode_number", episodeNumbers);

  if (error) {
    cache.set(shk(userId, showId), previous);
    notifyChange();
  }
}

export function subscribeToWatchedEpisodes(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}
