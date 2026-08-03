import type { DiscoveryItem, MediaType } from "../types";
import { demoDiscovery } from "../data/demoData";

const apiKey = import.meta.env.VITE_TMDB_API_KEY;
const baseUrl = "https://api.themoviedb.org/3";
const imageBase = "https://image.tmdb.org/t/p/w500";

function normalizeMediaType(value: string): MediaType {
  return value === "tv" ? "tv" : "movie";
}

function normalizeItem(item: Record<string, unknown>): DiscoveryItem {
  const posterPath = typeof item.poster_path === "string" ? item.poster_path : "";
  const releaseDate =
    typeof item.release_date === "string"
      ? item.release_date
      : typeof item.first_air_date === "string"
        ? item.first_air_date
        : "";

  return {
    id: Number(item.id),
    title:
      (typeof item.title === "string" && item.title) ||
      (typeof item.name === "string" && item.name) ||
      "Titulo sin nombre",
    year: releaseDate ? releaseDate.slice(0, 4) : "Sin fecha",
    mediaType: normalizeMediaType(String(item.media_type ?? "movie")),
    overview:
      (typeof item.overview === "string" && item.overview) ||
      "Todavia no tenemos descripcion para este titulo.",
    posterUrl: posterPath ? `${imageBase}${posterPath}` : "/images/base.png",
    genres: [],
    providers: [],
    score: typeof item.vote_average === "number" ? Number(item.vote_average.toFixed(1)) : 0
  };
}

export async function searchTitles(query: string): Promise<DiscoveryItem[]> {
  if (!query.trim()) {
    return [];
  }

  if (!apiKey) {
    const lowered = query.toLowerCase();
    return demoDiscovery.filter((item) => item.title.toLowerCase().includes(lowered));
  }

  const url = new URL(`${baseUrl}/search/multi`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "es-MX");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB respondio ${response.status}`);
  }

  const payload = (await response.json()) as { results?: Record<string, unknown>[] };
  return (payload.results ?? [])
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .slice(0, 8)
    .map(normalizeItem);
}
