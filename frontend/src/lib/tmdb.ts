import type { DiscoveryItem, MediaDetails, MediaType } from "../types";
import { demoDiscovery } from "../data/demoData";

const apiKey = import.meta.env.VITE_TMDB_API_KEY;
const baseUrl = "https://api.themoviedb.org/3";
const imageBase = "https://image.tmdb.org/t/p/w500";
const backdropBase = "https://image.tmdb.org/t/p/original";

function normalizeMediaType(value: string): MediaType {
  return value === "tv" ? "tv" : "movie";
}

function normalizeLanguage(code: string | null) {
  if (!code) {
    return null;
  }

  const labels: Record<string, string> = {
    en: "Ingles",
    es: "Espanol",
    fr: "Frances",
    it: "Italiano",
    ko: "Coreano",
    ja: "Japones"
  };

  return labels[code] ?? code.toUpperCase();
}

function formatRuntime(minutes: number | null) {
  if (!minutes || minutes <= 0) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (!hours) {
    return `${mins} min`;
  }

  if (!mins) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}min`;
}

function formatDate(dateString: string | null) {
  if (!dateString) {
    return null;
  }

  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) {
    return dateString;
  }

  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(day)} ${months[Number(month) - 1] ?? month}, ${year}`;
}

function formatBudget(amount: number | null) {
  if (!amount || amount <= 0) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amount);
}

function getCertification(payload: Record<string, unknown>, mediaType: MediaType) {
  if (mediaType === "movie") {
    const releaseDates = payload.release_dates as { results?: Array<{ iso_3166_1?: string; release_dates?: Array<{ certification?: string }> }> } | undefined;
    const regional = releaseDates?.results?.find((item) => item.iso_3166_1 === "US" || item.iso_3166_1 === "AR");
    const certification = regional?.release_dates?.find((item) => item.certification)?.certification;
    return certification || null;
  }

  const ratings = payload.content_ratings as { results?: Array<{ iso_3166_1?: string; rating?: string }> } | undefined;
  const regional = ratings?.results?.find((item) => item.iso_3166_1 === "US" || item.iso_3166_1 === "AR");
  return regional?.rating ?? null;
}

function getDirectorLabel(payload: Record<string, unknown>, mediaType: MediaType) {
  if (mediaType === "movie") {
    const crew = (payload.credits as { crew?: Array<{ job?: string; name?: string }> } | undefined)?.crew ?? [];
    return crew.find((person) => person.job === "Director")?.name ?? null;
  }

  const creators = payload.created_by as Array<{ name?: string }> | undefined;
  return creators?.map((person) => person.name).filter(Boolean).join(", ") || null;
}

function getCountryLabel(payload: Record<string, unknown>, mediaType: MediaType) {
  if (mediaType === "movie") {
    const countries = payload.production_countries as Array<{ name?: string }> | undefined;
    return countries?.map((country) => country.name).filter(Boolean).join(", ") || null;
  }

  const countries = payload.origin_country as string[] | undefined;
  return countries?.join(", ") || null;
}

function getProvidersLabel(payload: Record<string, unknown>) {
  const providers = payload.results as
    | Record<string, { flatrate?: Array<{ provider_name?: string }> }>
    | undefined;
  const regional = providers?.AR ?? providers?.US;
  return (
    regional?.flatrate
      ?.map((provider) => provider.provider_name)
      .filter((provider): provider is string => Boolean(provider))
      .slice(0, 6) ?? []
  );
}

function getTrailerUrl(payload: Record<string, unknown>) {
  const videos = (payload.videos as { results?: Array<Record<string, unknown>> } | undefined)?.results ?? [];
  const trailer = videos.find(
    (video) =>
      video.site === "YouTube" &&
      video.type === "Trailer" &&
      typeof video.key === "string"
  );

  return trailer ? `https://www.youtube.com/embed/${trailer.key}` : null;
}

function normalizeItem(item: Record<string, unknown>): DiscoveryItem {
  const posterPath = typeof item.poster_path === "string" ? item.poster_path : "";
  const releaseDate =
    typeof item.release_date === "string"
      ? item.release_date
      : typeof item.first_air_date === "string"
        ? item.first_air_date
        : "";
  const genres =
    Array.isArray(item.genres)
      ? item.genres
          .map((genre) =>
            typeof genre === "object" &&
            genre !== null &&
            "name" in genre &&
            typeof genre.name === "string"
              ? genre.name
              : null
          )
          .filter((genre): genre is string => Boolean(genre))
      : [];

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
    genres,
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

export async function getRecommendationTitles(): Promise<DiscoveryItem[]> {
  return getRecommendationTitlesByPage(1);
}

export async function getRecommendationTitlesByPage(page: number): Promise<DiscoveryItem[]> {
  if (!apiKey) {
    return demoDiscovery;
  }

  const movieUrl = new URL(`${baseUrl}/discover/movie`);
  movieUrl.searchParams.set("api_key", apiKey);
  movieUrl.searchParams.set("include_adult", "false");
  movieUrl.searchParams.set("language", "es-MX");
  movieUrl.searchParams.set("sort_by", "popularity.desc");
  movieUrl.searchParams.set("page", String(page));

  const tvUrl = new URL(`${baseUrl}/discover/tv`);
  tvUrl.searchParams.set("api_key", apiKey);
  tvUrl.searchParams.set("include_adult", "false");
  tvUrl.searchParams.set("language", "es-MX");
  tvUrl.searchParams.set("sort_by", "popularity.desc");
  tvUrl.searchParams.set("page", String(page));

  const [movieResponse, tvResponse] = await Promise.all([fetch(movieUrl.toString()), fetch(tvUrl.toString())]);

  if (!movieResponse.ok || !tvResponse.ok) {
    throw new Error("No pude traer recomendaciones de TMDB.");
  }

  const moviePayload = (await movieResponse.json()) as { results?: Record<string, unknown>[] };
  const tvPayload = (await tvResponse.json()) as { results?: Record<string, unknown>[] };

  const movieItems = (moviePayload.results ?? []).slice(0, 8).map((item) =>
    normalizeItem({ ...item, media_type: "movie" })
  );
  const tvItems = (tvPayload.results ?? []).slice(0, 8).map((item) =>
    normalizeItem({ ...item, media_type: "tv" })
  );

  return [...movieItems, ...tvItems];
}

export async function getTitleById(tmdbId: number, mediaType: MediaType): Promise<DiscoveryItem | null> {
  if (!apiKey) {
    return demoDiscovery.find((item) => item.id === tmdbId && item.mediaType === mediaType) ?? null;
  }

  const url = new URL(`${baseUrl}/${mediaType}/${tmdbId}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "es-MX");

  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return normalizeItem({ ...payload, media_type: mediaType });
}

export async function getTitleDetails(tmdbId: number, mediaType: MediaType): Promise<MediaDetails | null> {
  if (!apiKey) {
    const fallback = demoDiscovery.find((item) => item.id === tmdbId && item.mediaType === mediaType);
    if (!fallback) {
      return null;
    }

    return {
      ...fallback,
      backdropUrl: null,
      runtimeLabel: null,
      releaseLabel: null,
      countryLabel: null,
      languageLabel: null,
      certification: null,
      directorLabel: null,
      budgetLabel: null,
      trailerUrl: null,
      cast: []
    };
  }

  const detailUrl = new URL(`${baseUrl}/${mediaType}/${tmdbId}`);
  detailUrl.searchParams.set("api_key", apiKey);
  detailUrl.searchParams.set("language", "es-MX");
  detailUrl.searchParams.set(
    "append_to_response",
    mediaType === "movie" ? "credits,release_dates,videos" : "credits,content_ratings,videos"
  );

  const providersUrl = new URL(`${baseUrl}/${mediaType}/${tmdbId}/watch/providers`);
  providersUrl.searchParams.set("api_key", apiKey);

  const [detailResponse, providersResponse] = await Promise.all([
    fetch(detailUrl.toString()),
    fetch(providersUrl.toString())
  ]);

  if (!detailResponse.ok) {
    return null;
  }

  const payload = (await detailResponse.json()) as Record<string, unknown>;
  const providersPayload = providersResponse.ok ? ((await providersResponse.json()) as Record<string, unknown>) : {};
  const item = normalizeItem({ ...payload, media_type: mediaType });
  const cast =
    ((payload.credits as { cast?: Array<Record<string, unknown>> } | undefined)?.cast ?? [])
      .slice(0, 6)
      .map((person) => ({
        id: Number(person.id),
        name: typeof person.name === "string" ? person.name : "Sin nombre",
        character: typeof person.character === "string" ? person.character : null,
        profileUrl:
          typeof person.profile_path === "string" ? `${imageBase}${person.profile_path}` : null
      })) ?? [];

  const runtime =
    mediaType === "movie"
      ? typeof payload.runtime === "number"
        ? payload.runtime
        : null
      : Array.isArray(payload.episode_run_time) && typeof payload.episode_run_time[0] === "number"
        ? Number(payload.episode_run_time[0])
        : null;

  return {
    ...item,
    backdropUrl:
      typeof payload.backdrop_path === "string" ? `${backdropBase}${payload.backdrop_path}` : null,
    providers: getProvidersLabel(providersPayload),
    runtimeLabel: formatRuntime(runtime),
    releaseLabel: formatDate(
      typeof payload.release_date === "string"
        ? payload.release_date
        : typeof payload.first_air_date === "string"
          ? payload.first_air_date
          : null
    ),
    countryLabel: getCountryLabel(payload, mediaType),
    languageLabel: normalizeLanguage(
      typeof payload.original_language === "string" ? payload.original_language : null
    ),
    certification: getCertification(payload, mediaType),
    directorLabel: getDirectorLabel(payload, mediaType),
    budgetLabel: mediaType === "movie" ? formatBudget(typeof payload.budget === "number" ? payload.budget : null) : null,
    trailerUrl: getTrailerUrl(payload),
    cast
  };
}
