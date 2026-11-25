import { supabase } from "./supabase";
import { NO_FILTERS, type DiscoverFilters } from "./tmdb";
import { DISCOVER_GENRES } from "./discoverTaxonomy";
import { normalizeOriginalLanguage } from "./originalLanguages";

export const DISCOVER_FILTERS_UPDATED_EVENT = "cinerian:discover-filters-updated";

const CONTENT_TYPES: DiscoverFilters["contentType"][] = ["all", "movie", "series", "mini"];
const GENRE_IDS = new Set(DISCOVER_GENRES.map((genre) => genre.id));

function extraFiltersKey(userId: string) {
  return `cinerian:discover-extra-filters:v2:${userId}`;
}

function profileFiltersCacheKey(userId: string) {
  return `cinerian:discover-profile-filters:v1:${userId}`;
}

function readCachedProfileFilters(userId: string): DiscoverFilters | null {
  try {
    const raw = window.localStorage.getItem(profileFiltersCacheKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.providerIds) || !CONTENT_TYPES.includes(record.contentType as DiscoverFilters["contentType"])) return null;
    return normalize(record.providerIds, record.contentType);
  } catch { return null; }
}

function cacheProfileFilters(userId: string, filters: DiscoverFilters) {
  try {
    window.localStorage.setItem(profileFiltersCacheKey(userId), JSON.stringify({ providerIds: filters.providerIds, contentType: filters.contentType }));
  } catch { /* El perfil remoto sigue siendo la fuente de verdad. */ }
}

export function parseExtraFilters(raw: string | null): Pick<DiscoverFilters, "genreIds" | "originalLanguages"> {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      genreIds: Array.isArray(record.genreIds)
        ? [...new Set(record.genreIds.map(Number).filter((id) => GENRE_IDS.has(id)))]
        : [],
      originalLanguages: Array.isArray(record.originalLanguages)
        ? [...new Set(record.originalLanguages.map(normalizeOriginalLanguage).filter((code): code is string => Boolean(code)))]
        : []
    };
  } catch {
    return { genreIds: [], originalLanguages: [] };
  }
}

function readExtraFilters(userId: string): Pick<DiscoverFilters, "genreIds" | "originalLanguages"> {
  try {
    return parseExtraFilters(window.localStorage.getItem(extraFiltersKey(userId)) ?? window.localStorage.getItem(`cinerian:discover-extra-filters:v1:${userId}`));
  } catch {
    return { genreIds: [], originalLanguages: [] };
  }
}

export const CONTENT_TYPE_LABEL: Record<DiscoverFilters["contentType"], string> = {
  all: "Todo",
  movie: "Películas",
  series: "Series",
  mini: "Miniseries"
};

function normalize(
  providerIds: unknown,
  contentType: unknown
): DiscoverFilters {
  return {
    providerIds: Array.isArray(providerIds)
      ? providerIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [],
    contentType: CONTENT_TYPES.includes(contentType as DiscoverFilters["contentType"])
      ? (contentType as DiscoverFilters["contentType"])
      : "all"
  };
}

/**
 * Los filtros viven en el perfil, no en la sesion: "a que plataformas tengo
 * acceso" es un dato del usuario, no algo que quiera volver a elegir cada vez
 * que entra.
 */
export async function fetchDiscoverFilters(userId: string): Promise<DiscoverFilters> {
  const extras = typeof window === "undefined" ? { genreIds: [], originalLanguages: [] } : readExtraFilters(userId);
  const cached = typeof window === "undefined" ? null : readCachedProfileFilters(userId);
  if (!supabase) {
    return { ...(cached ?? NO_FILTERS), ...extras };
  }

  let data: { watch_providers: number[] | null; content_filter: string | null } | null;
  let error: unknown;
  try {
    const response = await supabase
      .from("profiles")
      .select("watch_providers, content_filter")
      .eq("id", userId)
      .maybeSingle<{ watch_providers: number[] | null; content_filter: string | null }>();
    data = response.data;
    error = response.error;
  } catch (caught) {
    error = caught;
    data = null;
  }

  if (error) {
    if (cached) return { ...cached, ...extras };
    throw error;
  }
  if (!data) return { ...NO_FILTERS, ...extras };

  const profileFilters = normalize(data.watch_providers, data.content_filter);
  if (typeof window !== "undefined") cacheProfileFilters(userId, profileFilters);
  return { ...profileFilters, ...extras };
}

export async function saveDiscoverFilters(userId: string, filters: DiscoverFilters) {
  if (supabase) {
    const { error } = await supabase
      .from("profiles")
      .update({
        watch_providers: filters.providerIds,
        content_filter: filters.contentType
      })
      .eq("id", userId);

    if (error) throw error;
  }

  if (typeof window !== "undefined") {
    cacheProfileFilters(userId, filters);
    window.localStorage.setItem(extraFiltersKey(userId), JSON.stringify({
      genreIds: filters.genreIds ?? [],
      originalLanguages: filters.originalLanguages ?? []
    }));
    window.localStorage.removeItem(`cinerian:discover-extra-filters:v1:${userId}`);
    window.dispatchEvent(
      new CustomEvent(DISCOVER_FILTERS_UPDATED_EVENT, { detail: { userId } })
    );
  }
}

export function countActiveFilters(filters: DiscoverFilters) {
  return filters.providerIds.length + (filters.contentType === "all" ? 0 : 1) +
    (filters.genreIds?.length ?? 0) + (filters.originalLanguages?.length ?? 0);
}
