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

/**
 * Elige que trailer mostrar.
 *
 * Buscamos audio original con subtitulos en español. TMDB no tiene un campo
 * para eso, pero lo deja escrito en el nombre: para una misma pelicula conviven
 * "Trailer Oficial [Doblado]" y "Trailer Oficial [Subtitulado]", los dos
 * marcados como iso_639_1 = "es". Por eso el orden de preferencia mira el
 * nombre y no solo el idioma; quedarse con el primer video en español elegia
 * casi siempre el doblado, que es el que aparece antes en la lista.
 */
const SUBTITLED_RE = /subtitul|\bsub\b|\bvose\b/i;
const DUBBED_RE = /doblad|latino|castellano|\bdub\b/i;

function getTrailerUrl(payload: Record<string, unknown>) {
  const videos =
    (payload.videos as { results?: Array<Record<string, unknown>> } | undefined)?.results ?? [];
  const originalLanguage =
    typeof payload.original_language === "string" ? payload.original_language : null;

  const playable = videos.filter(
    (video) => video.site === "YouTube" && typeof video.key === "string"
  );
  const trailers = playable.filter((video) => video.type === "Trailer");

  const nameOf = (video: Record<string, unknown>) =>
    typeof video.name === "string" ? video.name : "";
  const isDubbed = (video: Record<string, unknown>) => DUBBED_RE.test(nameOf(video));

  const pick =
    // 1) Subtitulado al español: audio original, texto en español.
    trailers.find((video) => video.iso_639_1 === "es" && SUBTITLED_RE.test(nameOf(video))) ??
    // 2) En el idioma original de la pelicula, sin subtitulos.
    trailers.find((video) => originalLanguage && video.iso_639_1 === originalLanguage) ??
    // 3) Cualquiera que no sea doblado.
    trailers.find((video) => !isDubbed(video)) ??
    // 4) Ya sin opciones, lo que haya.
    trailers[0] ??
    playable.find((video) => video.type === "Teaser") ??
    null;

  return pick ? `https://www.youtube.com/embed/${pick.key}` : null;
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

  if (!title || !Number.isFinite(Number(item.id))) {
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
    // Keep the complete filmography visible even when TMDB has no poster for a credit.
    posterUrl: posterPath ? `${imageBase}${posterPath}` : "/images/base.png",
    roleLabel:
      (typeof item.character === "string" && item.character) ||
      (typeof item.job === "string" && item.job) ||
      "Participacion"
  };
}

function uniqueTalentCredits(credits: TalentCredit[]): TalentCredit[] {
  const seen = new Set<string>();

  return credits.filter((credit) => {
    const key = `${credit.mediaType}-${credit.id}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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

/** Filtros que el usuario elige en Descubri. */
export type DiscoverFilters = {
  /** provider_id de TMDB. Vacio = sin filtrar por plataforma. */
  providerIds: number[];
  contentType: "all" | "movie" | "series" | "mini";
};

export const NO_FILTERS: DiscoverFilters = { providerIds: [], contentType: "all" };

/** TMDB marca las miniseries con with_type=2 en discover/tv. */
const TMDB_TYPE_MINISERIES = "2";

export async function getRecommendationTitlesByPage(
  page: number,
  filters: DiscoverFilters = NO_FILTERS
): Promise<DiscoveryItem[]> {
  if (!apiKey) {
    return demoDiscovery;
  }

  const wantsMovies = filters.contentType === "all" || filters.contentType === "movie";
  const wantsSeries =
    filters.contentType === "all" ||
    filters.contentType === "series" ||
    filters.contentType === "mini";

  function applyCommon(url: URL) {
    url.searchParams.set("api_key", apiKey as string);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("language", "es-MX");
    url.searchParams.set("sort_by", "popularity.desc");
    url.searchParams.set("page", String(page));

    // Acota del lado de TMDB, pero NO alcanza para garantizar: TMDB aplica
    // proveedor y tipo de monetizacion como condiciones separadas, asi que
    // devuelve titulos que estan en esa plataforma para comprar y tienen
    // suscripcion en otra. Por eso quien consuma esto tiene que verificar
    // cada titulo contra los proveedores reales antes de mostrarlo.
    if (filters.providerIds.length) {
      url.searchParams.set("with_watch_providers", filters.providerIds.join("|"));
      url.searchParams.set("watch_region", WATCH_REGION);
      url.searchParams.set("with_watch_monetization_types", "flatrate");
    }
  }

  const requests: Array<Promise<{ mediaType: MediaType; results: Record<string, unknown>[] }>> = [];

  if (wantsMovies) {
    const movieUrl = new URL(`${baseUrl}/discover/movie`);
    applyCommon(movieUrl);
    requests.push(
      fetch(movieUrl.toString())
        .then((response) => (response.ok ? response.json() : { results: [] }))
        .then((payload) => ({
          mediaType: "movie" as MediaType,
          results: (payload as { results?: Record<string, unknown>[] }).results ?? []
        }))
    );
  }

  if (wantsSeries) {
    const tvUrl = new URL(`${baseUrl}/discover/tv`);
    applyCommon(tvUrl);
    if (filters.contentType === "mini") {
      tvUrl.searchParams.set("with_type", TMDB_TYPE_MINISERIES);
    }
    requests.push(
      fetch(tvUrl.toString())
        .then((response) => (response.ok ? response.json() : { results: [] }))
        .then((payload) => ({
          mediaType: "tv" as MediaType,
          results: (payload as { results?: Record<string, unknown>[] }).results ?? []
        }))
    );
  }

  const responses = await Promise.all(requests);

  // Con un solo tipo pedido, esa lista se lleva todos los lugares del mazo.
  const perList = responses.length > 1 ? 8 : 16;

  return responses.flatMap((response) =>
    response.results
      .filter(isSupportedCatalogResult)
      .slice(0, perList)
      .map((item) => normalizeItem({ ...item, media_type: response.mediaType }))
  );
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

export type WatchProvider = {
  id: number;
  name: string;
  logoUrl: string | null;
  /** A donde mandamos al usuario cuando toca la plataforma. */
  url: string;
};

/**
 * TMDB no entrega enlaces profundos por plataforma: su campo `link` apunta a la
 * ficha de watch del propio themoviedb.org. Para que el boton lleve al sitio de
 * la plataforma, armamos su URL de busqueda con el titulo. No abre la ficha
 * exacta —eso necesitaria el id interno de cada servicio, que TMDB no da— pero
 * deja al usuario adentro del servicio con el titulo ya buscado.
 *
 * El match va por NOMBRE, no por provider_id: los ids cambian segun la region
 * (Amazon Prime Video es 9 en Estados Unidos y 119 en Argentina), asi que
 * mapear por id se rompe en cuanto aparece una region nueva.
 */
const PLATFORM_MATCHERS: Array<{
  test: RegExp;
  build: (title: string) => string;
}> = [
  {
    test: /netflix/i,
    build: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`
  },
  {
    // Cubre "Amazon Prime Video", "Amazon Video" y los "... Amazon Channel"
    // (Universal+, MGM+, Paramount+ Amazon Channel), que se miran dentro de Prime.
    test: /amazon|prime video/i,
    build: (t) => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(t)}`
  },
  {
    test: /disney/i,
    build: (t) => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}`
  },
  {
    test: /star\+|star plus/i,
    build: (t) => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}`
  },
  {
    test: /apple/i,
    build: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`
  },
  {
    test: /\bmax\b|hbo/i,
    build: (t) => `https://play.max.com/search?q=${encodeURIComponent(t)}`
  },
  {
    test: /paramount/i,
    build: (t) => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`
  },
  {
    test: /crunchyroll/i,
    build: (t) => `https://www.crunchyroll.com/search?q=${encodeURIComponent(t)}`
  },
  {
    test: /mubi/i,
    build: (t) => `https://mubi.com/search/${encodeURIComponent(t)}`
  },
  {
    test: /skyshowtime/i,
    build: (t) => `https://www.skyshowtime.com/search?q=${encodeURIComponent(t)}`
  },
  {
    test: /movistar/i,
    build: (t) => `https://ver.movistarplus.es/buscador?q=${encodeURIComponent(t)}`
  },
  {
    test: /claro/i,
    build: (t) => `https://www.clarovideo.com/argentina/search?q=${encodeURIComponent(t)}`
  },
  {
    test: /flow/i,
    build: (t) => `https://web.flow.com.ar/buscar?q=${encodeURIComponent(t)}`
  }
];

function buildProviderUrl(providerName: string, title: string, fallback: string | null): string {
  const match = PLATFORM_MATCHERS.find((matcher) => matcher.test.test(providerName));
  if (match) {
    return match.build(title);
  }

  return fallback ?? `https://www.google.com/search?q=${encodeURIComponent(`${title} ver online`)}`;
}

export type WatchOptions = {
  /** Plataformas donde ya lo tenes incluido con tu suscripcion. */
  flatrate: WatchProvider[];
  /** Si existe alquiler o compra, lo agrupamos en una sola opcion. */
  hasRentOrBuy: boolean;
  /** Ficha de watch en themoviedb.org: lista todas las opciones de la region. */
  link: string | null;
};

const PROVIDER_LOGO_BASE = "https://image.tmdb.org/t/p/w92";
const WATCH_REGION = "AR";

function mapProviders(list: unknown, title: string, fallback: string | null): WatchProvider[] {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((entry) => {
      const provider = entry as { provider_id?: number; provider_name?: string; logo_path?: string };
      if (typeof provider.provider_name !== "string") {
        return null;
      }

      return {
        id: Number(provider.provider_id ?? 0),
        name: provider.provider_name,
        logoUrl: provider.logo_path ? `${PROVIDER_LOGO_BASE}${provider.logo_path}` : null,
        url: buildProviderUrl(provider.provider_name, title, fallback)
      };
    })
    .filter((entry): entry is WatchProvider => entry !== null);
}

function getWatchOptions(payload: Record<string, unknown>, title: string): WatchOptions {
  const results = payload.results as Record<string, Record<string, unknown>> | undefined;
  const regional = results?.AR ?? results?.US;

  if (!regional) {
    return { flatrate: [], hasRentOrBuy: false, link: null };
  }

  const link = typeof regional.link === "string" ? regional.link : null;

  return {
    flatrate: mapProviders(regional.flatrate, title, link).slice(0, 4),
    hasRentOrBuy:
      mapProviders(regional.rent, title, link).length > 0 ||
      mapProviders(regional.buy, title, link).length > 0,
    link
  };
}

export async function getWatchOptionsFor(
  tmdbId: number,
  mediaType: MediaType,
  title: string
): Promise<WatchOptions> {
  const empty: WatchOptions = { flatrate: [], hasRentOrBuy: false, link: null };

  if (!apiKey) {
    return empty;
  }

  try {
    const url = new URL(`${baseUrl}/${mediaType}/${tmdbId}/watch/providers`);
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return empty;
    }

    return getWatchOptions((await response.json()) as Record<string, unknown>, title);
  } catch {
    return empty;
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

/** Lo que necesita el recomendador para filtrar sin pedir cada dato por separado. */
export type TitleAvailability = {
  item: DiscoveryItem;
  /** provider_id de TMDB donde se puede ver por suscripcion en Argentina. */
  providerIds: number[];
  /** Solo en series: "Miniseries", "Scripted", etc. Null en peliculas. */
  seriesType: string | null;
};

/**
 * Detalles, plataformas y tipo de serie en UNA sola llamada.
 *
 * Importa para el costo: filtrar el ranking por plataforma exige saber donde
 * esta cada candidato, y pedirlo aparte duplicaria los pedidos a TMDB por
 * tarjeta. Con append_to_response viene todo junto.
 */
export async function getTitleAvailability(
  tmdbId: number,
  mediaType: MediaType
): Promise<TitleAvailability | null> {
  if (!apiKey) {
    const fallback = demoDiscovery.find(
      (entry) => entry.id === tmdbId && entry.mediaType === mediaType
    );
    return fallback ? { item: fallback, providerIds: [], seriesType: null } : null;
  }

  const url = new URL(`${baseUrl}/${mediaType}/${tmdbId}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "es-MX");
  url.searchParams.set("append_to_response", "watch/providers");

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const regional = (
      (payload["watch/providers"] as { results?: Record<string, Record<string, unknown>> } | undefined)
        ?.results ?? {}
    )[WATCH_REGION];

    const providerIds = Array.isArray(regional?.flatrate)
      ? (regional.flatrate as Array<{ provider_id?: number }>)
          .map((provider) => Number(provider.provider_id))
          .filter((id) => Number.isFinite(id))
      : [];

    return {
      item: normalizeItem({ ...payload, media_type: mediaType }),
      providerIds,
      seriesType: typeof payload.type === "string" ? payload.type : null
    };
  } catch {
    return null;
  }
}

export type ProviderOption = {
  id: number;
  name: string;
  logoUrl: string | null;
};

/** Catalogo de plataformas de la region, ordenado por relevancia segun TMDB. */
export async function getProviderCatalog(): Promise<ProviderOption[]> {
  if (!apiKey) {
    return [];
  }

  try {
    const url = new URL(`${baseUrl}/watch/providers/movie`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("watch_region", WATCH_REGION);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      results?: Array<{
        provider_id?: number;
        provider_name?: string;
        logo_path?: string;
        display_priority?: number;
      }>;
    };

    return (payload.results ?? [])
      .filter((provider) => typeof provider.provider_name === "string")
      .sort((left, right) => (left.display_priority ?? 999) - (right.display_priority ?? 999))
      .map((provider) => ({
        id: Number(provider.provider_id),
        name: provider.provider_name as string,
        logoUrl: provider.logo_path ? `${PROVIDER_LOGO_BASE}${provider.logo_path}` : null
      }));
  } catch {
    return [];
  }
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
  // TMDB filtra los videos por el `language` de arriba, y casi ningun trailer
  // esta catalogado en español: pidiendo solo es-MX la lista vuelve vacia para
  // la mayoria de los titulos. Con esto pedimos español y, si no hay, ingles.
  detailUrl.searchParams.set("include_video_language", "es-MX,es,en,null");

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
      .slice(0, 40)
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

  const actingCredits = uniqueTalentCredits(
    (combinedCredits.cast ?? [])
      .map((item) => normalizeCredit(item))
      .filter((item): item is TalentCredit => Boolean(item))
  );

  const directingCredits = uniqueTalentCredits(
    (combinedCredits.crew ?? [])
      .filter((item) => item.job === "Director" || item.department === "Directing")
      .map((item) => normalizeCredit(item))
      .filter((item): item is TalentCredit => Boolean(item))
  );

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
