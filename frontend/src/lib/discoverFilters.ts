import { supabase } from "./supabase";
import { NO_FILTERS, type DiscoverFilters } from "./tmdb";

export const DISCOVER_FILTERS_UPDATED_EVENT = "cinerian:discover-filters-updated";

const CONTENT_TYPES: DiscoverFilters["contentType"][] = ["all", "movie", "series", "mini"];

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
  if (!supabase) {
    return NO_FILTERS;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("watch_providers, content_filter")
    .eq("id", userId)
    .maybeSingle<{ watch_providers: number[] | null; content_filter: string | null }>();

  if (error || !data) {
    return NO_FILTERS;
  }

  return normalize(data.watch_providers, data.content_filter);
}

export async function saveDiscoverFilters(userId: string, filters: DiscoverFilters) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      watch_providers: filters.providerIds,
      content_filter: filters.contentType
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DISCOVER_FILTERS_UPDATED_EVENT, { detail: { userId } })
    );
  }
}

export function countActiveFilters(filters: DiscoverFilters) {
  return filters.providerIds.length + (filters.contentType === "all" ? 0 : 1);
}
