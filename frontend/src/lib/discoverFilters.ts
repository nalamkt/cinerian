import { supabase } from "./supabase";
import { NO_FILTERS, type DiscoverFilters } from "./tmdb";
import { DISCOVER_GENRES, DISCOVER_REGIONS, type ProductionRegion } from "./discoverTaxonomy";

export const DISCOVER_FILTERS_UPDATED_EVENT = "cinerian:discover-filters-updated";

const CONTENT_TYPES: DiscoverFilters["contentType"][] = ["all", "movie", "series", "mini"];
const GENRE_IDS = new Set(DISCOVER_GENRES.map((genre) => genre.id));
const REGION_IDS = new Set<ProductionRegion>(DISCOVER_REGIONS.map((region) => region.id));

function extraFiltersKey(userId: string) {
  return `cinerian:discover-extra-filters:v1:${userId}`;
}

function readExtraFilters(userId: string): Pick<DiscoverFilters, "genreIds" | "productionRegions"> {
  try {
    const raw = window.localStorage.getItem(extraFiltersKey(userId));
    const value: unknown = raw ? JSON.parse(raw) : null;
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      genreIds: Array.isArray(record.genreIds)
        ? [...new Set(record.genreIds.map(Number).filter((id) => GENRE_IDS.has(id)))]
        : [],
      productionRegions: Array.isArray(record.productionRegions)
        ? [...new Set(record.productionRegions.filter((id): id is ProductionRegion => REGION_IDS.has(id as ProductionRegion)))]
        : []
    };
  } catch {
    return { genreIds: [], productionRegions: [] };
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
  const extras = typeof window === "undefined" ? { genreIds: [], productionRegions: [] } : readExtraFilters(userId);
  if (!supabase) {
    return { ...NO_FILTERS, ...extras };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("watch_providers, content_filter")
    .eq("id", userId)
    .maybeSingle<{ watch_providers: number[] | null; content_filter: string | null }>();

  if (error || !data) {
    return { ...NO_FILTERS, ...extras };
  }

  return { ...normalize(data.watch_providers, data.content_filter), ...extras };
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
    window.localStorage.setItem(extraFiltersKey(userId), JSON.stringify({
      genreIds: filters.genreIds ?? [],
      productionRegions: filters.productionRegions ?? []
    }));
    window.dispatchEvent(
      new CustomEvent(DISCOVER_FILTERS_UPDATED_EVENT, { detail: { userId } })
    );
  }
}

export function countActiveFilters(filters: DiscoverFilters) {
  return filters.providerIds.length + (filters.contentType === "all" ? 0 : 1) +
    (filters.genreIds?.length ?? 0) + (filters.productionRegions?.length ?? 0);
}
