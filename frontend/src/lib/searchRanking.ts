import type { DiscoveryItem } from "../types";

export type SearchTitle = DiscoveryItem & { originalTitle: string; popularity: number; genreIds: number[] };
export type SearchCategory = "all" | "movie" | "tv" | "people";
export type SearchOrder = "relevance" | "popularity" | "rating" | "newest" | "oldest";
export type SearchFilters = { category: SearchCategory; excludeAnimation: boolean; releasedOnly: boolean; genreIds: number[]; yearFrom: string; yearTo: string; order: SearchOrder };
export const DEFAULT_SEARCH_FILTERS: SearchFilters = { category: "all", excludeAnimation: false, releasedOnly: false, genreIds: [], yearFrom: "", yearTo: "", order: "relevance" };

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").replace(/[^a-z0-9]+/g, " ").trim();
}

export function searchRelevance(item: SearchTitle, query: string) {
  const term = normalized(query);
  const names = [item.title, item.originalTitle].map(normalized).filter(Boolean);
  if (names.some((name) => name === term)) return 0;
  if (names.some((name) => name.startsWith(`${term} `))) return 1;
  if (names.some((name) => name.includes(` ${term} `) || name.endsWith(` ${term}`))) return 2;
  const words = term.split(" ").filter(Boolean);
  if (words.length && names.some((name) => words.every((word) => name.split(" ").some((part) => part.startsWith(word))))) return 3;
  return 4;
}

function validDate(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : null;
}

export function rankSearchTitles(items: SearchTitle[], query: string, filters: SearchFilters, now = Date.now()): SearchTitle[] {
  const from = Number(filters.yearFrom) || null;
  const to = Number(filters.yearTo) || null;
  const filtered = items.filter((item) => {
    if (filters.category === "people") return false;
    if (filters.category !== "all" && item.mediaType !== filters.category) return false;
    if (filters.excludeAnimation && item.genreIds.includes(16)) return false;
    if (filters.genreIds.length && !item.genreIds.some((id) => filters.genreIds.includes(id))) return false;
    const date = validDate(item.releaseDate);
    if (filters.releasedOnly && (date === null || date > now)) return false;
    const year = date === null ? null : new Date(date).getUTCFullYear();
    if ((from && (!year || year < from)) || (to && (!year || year > to))) return false;
    return true;
  });
  return filtered.map((item, index) => ({ item, index })).sort((left, right) => {
    const a = left.item;
    const b = right.item;
    const dateA = validDate(a.releaseDate);
    const dateB = validDate(b.releaseDate);
    const releasedA = dateA !== null && dateA <= now ? 1 : 0;
    const releasedB = dateB !== null && dateB <= now ? 1 : 0;
    let difference = 0;
    if (filters.order === "relevance") {
      const rankA = searchRelevance(a, query);
      const rankB = searchRelevance(b, query);
      // TMDB puede encontrar títulos alternativos no incluidos en la respuesta.
      // Conservamos su orden de origen cuando no podemos verificar el texto.
      difference = rankA - rankB || releasedB - releasedA || (rankA < 4 ? b.popularity - a.popularity : 0);
    }
    if (filters.order === "popularity") difference = b.popularity - a.popularity;
    if (filters.order === "rating") difference = b.score - a.score || (b.voteCount ?? 0) - (a.voteCount ?? 0);
    if (filters.order === "newest") difference = (dateB ?? -Infinity) - (dateA ?? -Infinity);
    if (filters.order === "oldest") difference = (dateA ?? Infinity) - (dateB ?? Infinity);
    return difference || left.index - right.index;
  }).map(({ item }) => item);
}
