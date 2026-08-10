import type {
  DiscoveryItem,
  MediaDetails,
  MediaType,
  SeriesAiringInfo,
  TalentCredit,
  TalentDetails,
  TalentSearchItem
} from "../types";
import { demoDiscovery } from "../data/demoData";

const apiKey = import.meta.env.VITE_TMDB_API_KEY;
const baseUrl = "https://api.themoviedb.org/3";
const imageBase = "https://image.tmdb.org/t/p/w500";
const backdropBase = "https://image.tmdb.org/t/p/original";
const profileBase = "https://image.tmdb.org/t/p/w300";

const MOVIE_GENRE_LABELS: Record<number, string> = {
  12: "Aventura",
  14: "Fantasia",
  16: "Animacion",
  18: "Drama",
  27: "Terror",
  28: "Accion",
  35: "Comedia",
  36: "Historia",
  37: "Western",
  53: "Thriller",
  80: "Crimen",
  99: "Documental",
  878: "Sci-fi",
  9648: "Misterio",
  10402: "Musica",
  10749: "Romance",
  10751: "Familia",
  10752: "Belica"
};

const TV_GENRE_LABELS: Record<number, string> = {
  16: "Animacion",
  18: "Drama",
  35: "Comedia",
  37: "Western",
  80: "Crimen",
  99: "Documental",
  9648: "Misterio",
  10751: "Familia",
  10759: "Accion",
  10762: "Infantil",
  10763: "Noticias",
  10764: "Reality",
  10765: "Sci-fi",
  10766: "Soap",
  10767: "Talk",
  10768: "Belica"
};

function normalizeMediaType(value: string): MediaType {
  return value === "tv" ? "tv" : "movie";
}

function isAllowedOriginalLanguage(value: unknown) {
  return value === "es" || value === "en";
}

function hasUsefulArtwork(item: Record<string, unknown>) {
  return typeof item.poster_path === "string" && item.poster_path.trim().length > 0;
}

function hasUsefulOverview(item: Record<string, unknown>) {
  return typeof item.overview === "string" && item.overview.trim().length > 0;
}

function hasDisplayTitle(item: Record<string, unknown>) {
  return (
    (typeof item.title === "string" && item.title.trim().length > 0) ||
    (typeof item.name === "string" && item.name.trim().length > 0)
  );
}

function isSupportedCatalogResult(item: Record<string, unknown>) {
  return (
    hasDisplayTitle(item) &&
    hasUsefulArtwork(item) &&
    hasUsefulOverview(item) &&
    isAllowedOriginalLanguage(item.original_language)
  );
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

function normalizeDepartment(value: string | null | undefined) {
  if (!value) {
    return "Talento";
  }

  const labels: Record<string, string> = {
    Acting: "Actor / Actriz",
    Directing: "Director / Directora",
    Production: "Produccion",
    Writing: "Guion",
    Creator: "Creador / Creadora"
  };

  return labels[value] ?? value;
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

function formatWeekday(dateString: string | null) {
  if (!dateString) {
    return null;
  }

  const parsed = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("es-AR", { weekday: "long" }).format(parsed);
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
  const mediaType = normalizeMediaType(String(item.media_type ?? "movie"));
  const genreLabels = mediaType === "tv" ? TV_GENRE_LABELS : MOVIE_GENRE_LABELS;
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
      : Array.isArray(item.genre_ids)
        ? item.genre_ids
            .map((genreId) => (typeof genreId === "number" ? genreLabels[genreId] ?? null : null))
            .filter((genre): genre is string => Boolean(genre))
      : [];

  return {
    id: Number(item.id),
    title:
      (typeof item.title === "string" && item.title) ||
      (typeof item.name === "string" && item.name) ||
      "Titulo sin nombre",
    year: releaseDate ? releaseDate.slice(0, 4) : "Sin fecha",
    releaseDate: releaseDate || null,
    mediaType,
    overview:
      (typeof item.overview === "string" && item.overview) ||
      "Todavia no tenemos descripcion para este titulo.",
    posterUrl: posterPath ? `${imageBase}${posterPath}` : "/images/base.png",
    genres,
    providers: [],
    score: typeof item.vote_average === "number" ? Number(item.vote_average.toFixed(1)) : 0
  };
}

function isUpcomingThisWeek(dateString: string | null | undefined) {
  if (!dateString) {
    return false;
  }

  const releaseTime = new Date(`${dateString}T00:00:00`).getTime();
  if (Number.isNaN(releaseTime)) {
    return false;
  }

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = start + 1000 * 60 * 60 * 24 * 10;

  return releaseTime >= start && releaseTime <= end;
}

function getTodayRange() {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 10);
  const recentStartDate = new Date(startDate);
  recentStartDate.setDate(recentStartDate.getDate() - 6);

  const formatIsoDate = (value: Date) => value.toISOString().slice(0, 10);

  return {
    start: formatIsoDate(startDate),
    end: formatIsoDate(endDate),
    recentStart: formatIsoDate(recentStartDate)
  };
}

function uniqueDiscoveryItems(items: DiscoveryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}-${item.id}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function curateUpcomingItems(items: DiscoveryItem[], options?: { limit?: number; maxStreaming?: number }) {
  const limit = options?.limit ?? 10;
  const maxStreaming = options?.maxStreaming ?? 2;

  const theatrical: DiscoveryItem[] = [];
  const streaming: DiscoveryItem[] = [];

  items.forEach((item) => {
    if (item.providers.length) {
      streaming.push(item);
      return;
    }

    theatrical.push(item);
  });

  const selected: DiscoveryItem[] = [];
  const remainingTheatrical = [...theatrical];
  const remainingStreaming = [...streaming];
  let streamingCount = 0;

  while (selected.length < limit && (remainingTheatrical.length || remainingStreaming.length)) {
    if (remainingTheatrical.length) {
      selected.push(remainingTheatrical.shift()!);
      continue;
    }

    if (remainingStreaming.length && streamingCount < maxStreaming) {
      selected.push(remainingStreaming.shift()!);
      streamingCount += 1;
      continue;
    }

    break;
  }

  while (selected.length < limit && remainingStreaming.length && streamingCount < maxStreaming) {
    selected.push(remainingStreaming.shift()!);
    streamingCount += 1;
  }

  return selected;
}

async function enrichItemsWithProviders(items: DiscoveryItem[]) {
  const enriched = await Promise.all(
    items.map(async (item) => {
      if (!apiKey) {
        return item;
      }

      try {
        const url = new URL(`${baseUrl}/${item.mediaType}/${item.id}/watch/providers`);
        url.searchParams.set("api_key", apiKey);

        const response = await fetch(url.toString());
        if (!response.ok) {
          return item;
        }

        const payload = (await response.json()) as Record<string, unknown>;
        return {
          ...item,
          providers: getProvidersLabel(payload)
        };
      } catch {
        return item;
      }
    })
  );

  return enriched;
}

async function fetchDiscoveredCatalog(
  mediaType: MediaType,
  query: Record<string, string>,
  page = 1
): Promise<DiscoveryItem[]> {
  if (!apiKey) {
    return demoDiscovery;
  }

  const url = new URL(`${baseUrl}/discover/${mediaType}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "es-MX");
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("page", String(page));

  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("No pude descubrir estrenos desde TMDB.");
  }

  const payload = (await response.json()) as { results?: Record<string, unknown>[] };
  return (payload.results ?? [])
    .filter(isSupportedCatalogResult)
    .map((item) => normalizeItem({ ...item, media_type: mediaType }));
}

function normalizeCredit(item: Record<string, unknown>): TalentCredit | null {
  const posterPath = typeof item.poster_path === "string" ? item.poster_path : "";
  const title =
    (typeof item.title === "string" && item.title) ||
    (typeof item.name === "string" && item.name) ||
    null;

  if (!title || !posterPath) {
    return null;
  }

  const releaseDate =
    typeof item.release_date === "string"
      ? item.release_date
      : typeof item.first_air_date === "string"
        ? item.first_air_date
        : "";

  return {
    id: Number(item.id),
    title,
    year: releaseDate ? releaseDate.slice(0, 4) : "Sin fecha",
    mediaType: normalizeMediaType(String(item.media_type ?? "movie")),
    posterUrl: `${imageBase}${posterPath}`,
    roleLabel:
      (typeof item.character === "string" && item.character) ||
      (typeof item.job === "string" && item.job) ||
      "Participacion"
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
    .filter(isSupportedCatalogResult)
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

  const movieItems = (moviePayload.results ?? [])
    .filter(isSupportedCatalogResult)
    .slice(0, 8)
    .map((item) =>
    normalizeItem({ ...item, media_type: "movie" })
  );
  const tvItems = (tvPayload.results ?? [])
    .filter(isSupportedCatalogResult)
    .slice(0, 8)
    .map((item) =>
    normalizeItem({ ...item, media_type: "tv" })
  );

  return [...movieItems, ...tvItems];
}

async function fetchCatalogCollection(
  path: string,
  options?: {
    page?: number;
    mediaType?: MediaType;
  }
): Promise<DiscoveryItem[]> {
  if (!apiKey) {
    return demoDiscovery;
  }

  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "es-MX");
  url.searchParams.set("page", String(options?.page ?? 1));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("No pude traer titulos para el home.");
  }

  const payload = (await response.json()) as { results?: Record<string, unknown>[] };
  return (payload.results ?? [])
    .filter(isSupportedCatalogResult)
    .map((item) =>
      normalizeItem({
        ...item,
        media_type: options?.mediaType ?? normalizeMediaType(String(item.media_type ?? "movie"))
      })
    );
}

export async function getTrendingTitles(): Promise<DiscoveryItem[]> {
  const items = await fetchCatalogCollection("/trending/all/week");
  return items.slice(0, 6);
}

export async function getUpcomingTitles(): Promise<DiscoveryItem[]> {
  const { recentStart, start, end } = getTodayRange();

  if (!apiKey) {
    return demoDiscovery.slice(0, 6);
  }

  const [theatricalMovies, upcomingMovies, streamingMovies, streamingSeries] = await Promise.all([
    fetchDiscoveredCatalog("movie", {
      region: "AR",
      with_release_type: "3|2",
      "release_date.gte": recentStart,
      "release_date.lte": end,
      sort_by: "popularity.desc"
    }),
    fetchCatalogCollection("/movie/upcoming", { mediaType: "movie" }),
    fetchDiscoveredCatalog("movie", {
      watch_region: "AR",
      with_watch_monetization_types: "flatrate",
      with_release_type: "4",
      "release_date.gte": recentStart,
      "release_date.lte": end,
      sort_by: "popularity.desc"
    }),
    fetchDiscoveredCatalog("tv", {
      watch_region: "AR",
      with_watch_monetization_types: "flatrate",
      "first_air_date.gte": recentStart,
      "first_air_date.lte": end,
      sort_by: "popularity.desc"
    })
  ]);

  const combined = uniqueDiscoveryItems([
    ...theatricalMovies.filter((item) => {
      if (!item.releaseDate) {
        return false;
      }

      return item.releaseDate >= recentStart && item.releaseDate <= end;
    }),
    ...upcomingMovies.filter((item) => isUpcomingThisWeek(item.releaseDate)),
    ...streamingMovies.filter((item) => item.releaseDate && item.releaseDate >= recentStart && item.releaseDate <= end),
    ...streamingSeries.filter((item) => item.releaseDate && item.releaseDate >= start && item.releaseDate <= end)
  ])
    .sort((left, right) => {
      const leftDate = left.releaseDate ?? "9999-12-31";
      const rightDate = right.releaseDate ?? "9999-12-31";
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }

      return right.score - left.score;
    });

  const enriched = await enrichItemsWithProviders(combined);
  return curateUpcomingItems(enriched, {
    limit: 10,
    maxStreaming: 2
  });
}

export async function getNowPlayingTitles(): Promise<DiscoveryItem[]> {
  const movieItems = await fetchCatalogCollection("/movie/now_playing", { mediaType: "movie" });
  return movieItems.slice(0, 6);
}

export async function getSimilarTitles(tmdbId: number, mediaType: MediaType): Promise<DiscoveryItem[]> {
  if (!apiKey) {
    return demoDiscovery
      .filter((item) => !(item.id === tmdbId && item.mediaType === mediaType))
      .slice(0, 6);
  }

  const url = new URL(`${baseUrl}/${mediaType}/${tmdbId}/similar`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "es-MX");
  url.searchParams.set("page", "1");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("No pude traer titulos similares.");
  }

  const payload = (await response.json()) as { results?: Record<string, unknown>[] };
  return (payload.results ?? [])
    .filter(isSupportedCatalogResult)
    .slice(0, 6)
    .map((item) => normalizeItem({ ...item, media_type: mediaType }));
}

export async function getWatchProviders(tmdbId: number, mediaType: MediaType): Promise<string[]> {
  if (!apiKey) {
    return [];
  }

  try {
    const url = new URL(`${baseUrl}/${mediaType}/${tmdbId}/watch/providers`);
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return getProvidersLabel(payload);
  } catch {
    return [];
  }
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
      creators: [],
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
  const creators =
    mediaType === "movie"
      ? (((payload.credits as { crew?: Array<Record<string, unknown>> } | undefined)?.crew ?? [])
          .filter((person) => person.job === "Director")
          .slice(0, 3)
          .map((person) => ({
            id: Number(person.id),
            name: typeof person.name === "string" ? person.name : "Sin nombre",
            roleLabel: typeof person.job === "string" ? person.job : "Director",
            profileUrl:
              typeof person.profile_path === "string" ? `${imageBase}${person.profile_path}` : null
          })) ?? [])
      : ((payload.created_by as Array<Record<string, unknown>> | undefined) ?? []).map((person) => ({
          id: Number(person.id),
          name: typeof person.name === "string" ? person.name : "Sin nombre",
          roleLabel: "Creador / Creadora",
          profileUrl:
            typeof person.profile_path === "string" ? `${imageBase}${person.profile_path}` : null
        }));

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
    creators,
    cast
  };
}

export async function getSeriesAiringInfo(tmdbId: number): Promise<SeriesAiringInfo | null> {
  if (!apiKey) {
    return null;
  }

  const detailUrl = new URL(`${baseUrl}/tv/${tmdbId}`);
  detailUrl.searchParams.set("api_key", apiKey);
  detailUrl.searchParams.set("language", "es-MX");

  const response = await fetch(detailUrl.toString());
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const nextEpisode =
    typeof payload.next_episode_to_air === "object" && payload.next_episode_to_air !== null
      ? (payload.next_episode_to_air as Record<string, unknown>)
      : null;
  const nextEpisodeDate =
    nextEpisode && typeof nextEpisode.air_date === "string" ? nextEpisode.air_date : null;
  const nextEpisodeName =
    nextEpisode && typeof nextEpisode.name === "string" ? nextEpisode.name : null;
  const seasonNumber =
    nextEpisode && typeof nextEpisode.season_number === "number"
      ? Number(nextEpisode.season_number)
      : null;
  const episodeNumber =
    nextEpisode && typeof nextEpisode.episode_number === "number"
      ? Number(nextEpisode.episode_number)
      : null;

  const nextEpisodeLabel =
    nextEpisodeDate && seasonNumber && episodeNumber
      ? `${nextEpisodeName ?? "Próximo episodio"} · T${seasonNumber}E${episodeNumber} · ${formatDate(nextEpisodeDate)}`
      : nextEpisodeDate
        ? `${nextEpisodeName ?? "Próximo episodio"} · ${formatDate(nextEpisodeDate)}`
        : null;

  return {
    statusLabel: typeof payload.status === "string" ? payload.status : null,
    nextEpisodeLabel,
    nextEpisodeDate,
    nextEpisodeDayLabel: nextEpisodeDate ? formatWeekday(nextEpisodeDate) : null
  };
}

export async function searchTalent(query: string): Promise<TalentSearchItem[]> {
  if (!query.trim()) {
    return [];
  }

  if (!apiKey) {
    return [];
  }

  const url = new URL(`${baseUrl}/search/person`);
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
    .filter((item) => typeof item.name === "string" && item.name.trim().length > 0)
    .filter((item) => typeof item.profile_path === "string" && item.profile_path.trim().length > 0)
    .slice(0, 8)
    .map((item) => ({
      id: Number(item.id),
      name: String(item.name),
      knownForDepartment: normalizeDepartment(
        typeof item.known_for_department === "string" ? item.known_for_department : null
      ),
      profileUrl:
        typeof item.profile_path === "string" ? `${profileBase}${item.profile_path}` : null,
      knownForTitles: Array.isArray(item.known_for)
        ? item.known_for
            .map((credit) =>
              typeof credit === "object" &&
              credit !== null &&
              (typeof (credit as { title?: unknown }).title === "string"
                ? (credit as { title: string }).title
                : typeof (credit as { name?: unknown }).name === "string"
                  ? (credit as { name: string }).name
                  : null)
            )
            .filter((title): title is string => Boolean(title))
            .slice(0, 3)
        : []
    }));
}

export async function getTalentDetails(personId: number): Promise<TalentDetails | null> {
  if (!apiKey) {
    return null;
  }

  const url = new URL(`${baseUrl}/person/${personId}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "es-MX");
  url.searchParams.set("append_to_response", "combined_credits");

  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const combinedCredits = (payload.combined_credits as {
    cast?: Record<string, unknown>[];
    crew?: Record<string, unknown>[];
  } | undefined) ?? { cast: [], crew: [] };

  const actingCredits = (combinedCredits.cast ?? [])
    .map((item) => normalizeCredit(item))
    .filter((item): item is TalentCredit => Boolean(item))
    .slice(0, 12);

  const directingCredits = (combinedCredits.crew ?? [])
    .filter((item) => item.job === "Director" || item.department === "Directing")
    .map((item) => normalizeCredit(item))
    .filter((item): item is TalentCredit => Boolean(item))
    .slice(0, 12);

  return {
    id: Number(payload.id),
    name: typeof payload.name === "string" ? payload.name : "Talento sin nombre",
    profileUrl:
      typeof payload.profile_path === "string" ? `${profileBase}${payload.profile_path}` : null,
    biography:
      typeof payload.biography === "string" && payload.biography.trim().length > 0
        ? payload.biography
        : "Todavia no tenemos biografia cargada para este talento.",
    knownForDepartment: normalizeDepartment(
      typeof payload.known_for_department === "string" ? payload.known_for_department : null
    ),
    birthday: typeof payload.birthday === "string" ? payload.birthday : null,
    placeOfBirth: typeof payload.place_of_birth === "string" ? payload.place_of_birth : null,
    actingCredits,
    directingCredits
  };
}
