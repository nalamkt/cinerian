import type {
  DiscoveryItem,
  EpisodeSummary,
  MediaDetails,
  MediaType,
  SeasonSummary,
  SeriesAiringInfo,
  StreamingProvider,
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
const WATCH_REGION = "AR";

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

// Descubri ya valida que el titulo este incluido con una suscripcion en AR.
// No usamos el idioma original como proxy de relevancia: una serie alemana,
// coreana o japonesa disponible localmente tambien es una recomendacion valida.
function isSupportedDiscoverResult(item: Record<string, unknown>) {
  return hasDisplayTitle(item) && hasUsefulArtwork(item) && hasUsefulOverview(item);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();
}

function searchMatchRank(item: Record<string, unknown>, normalizedQuery: string) {
  const names = [item.title, item.name, item.original_title, item.original_name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(normalizeSearchText);

  if (names.some((name) => name === normalizedQuery)) {
    return 0;
  }

  if (names.some((name) => name.startsWith(normalizedQuery))) {
    return 1;
  }

  if (names.some((name) => name.includes(normalizedQuery))) {
    return 2;
  }

  return 3;
}

function popularityOf(item: Record<string, unknown>) {
  return typeof item.popularity === "number" && Number.isFinite(item.popularity)
    ? item.popularity
    : 0;
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

const CREW_JOB_TRANSLATIONS: Record<string, string> = {
  Director: "Director",
  "Co-Director": "Co-Director",
  Screenplay: "Guion",
  Writer: "Guion",
  Story: "Historia",
  "Original Story": "Historia",
  Novel: "Novela",
  Producer: "Productor",
  "Executive Producer": "Productor ejecutivo",
  "Director of Photography": "Direccion de fotografia",
  Cinematography: "Direccion de fotografia",
  Editor: "Montaje",
  "Original Music Composer": "Musica",
  Music: "Musica",
  "Production Design": "Diseño de produccion",
  "Production Designer": "Diseño de produccion",
  "Costume Design": "Vestuario",
  "Costume Designer": "Vestuario"
};

const MOVIE_CREW_JOB_ORDER = [
  "Director",
  "Co-Director",
  "Screenplay",
  "Writer",
  "Story",
  "Original Story",
  "Novel",
  "Producer",
  "Executive Producer",
  "Director of Photography",
  "Cinematography",
  "Original Music Composer",
  "Music",
  "Editor",
  "Production Design",
  "Production Designer",
  "Costume Design",
  "Costume Designer"
];

const TV_CREW_JOB_ORDER = [
  "Executive Producer",
  "Producer",
  "Writer",
  "Screenplay",
  "Director of Photography",
  "Original Music Composer",
  "Editor"
];

function buildCrewList(
  rawCrew: Array<Record<string, unknown>>,
  mediaType: MediaType,
  seededCreators: Array<{ id: number; name: string; roleLabel: string | null; profileUrl: string | null }>
) {
  const priorityJobs = mediaType === "movie" ? MOVIE_CREW_JOB_ORDER : TV_CREW_JOB_ORDER;
  const priorityIndex = new Map(priorityJobs.map((job, index) => [job, index]));
  const grouped = new Map<
    number,
    { id: number; name: string; profileUrl: string | null; jobs: string[]; bestPriority: number }
  >();

  for (const person of rawCrew) {
    const job = typeof person.job === "string" ? person.job : "";
    if (!priorityIndex.has(job)) {
      continue;
    }
    const id = Number(person.id);
    if (!Number.isFinite(id)) {
      continue;
    }
    const name = typeof person.name === "string" ? person.name : "Sin nombre";
    const profileUrl =
      typeof person.profile_path === "string" ? `${imageBase}${person.profile_path}` : null;
    const localized = CREW_JOB_TRANSLATIONS[job] ?? job;
    const rank = priorityIndex.get(job) ?? 999;
    const existing = grouped.get(id);
    if (existing) {
      if (!existing.jobs.includes(localized)) {
        existing.jobs.push(localized);
      }
      if (rank < existing.bestPriority) {
        existing.bestPriority = rank;
      }
    } else {
      grouped.set(id, {
        id,
        name,
        profileUrl,
        jobs: [localized],
        bestPriority: rank
      });
    }
  }

  if (mediaType !== "movie") {
    for (const creator of seededCreators) {
      if (!grouped.has(creator.id)) {
        grouped.set(creator.id, {
          id: creator.id,
          name: creator.name,
          profileUrl: creator.profileUrl,
          jobs: [creator.roleLabel ?? "Creador / Creadora"],
          bestPriority: -1
        });
      }
    }
  }

  return Array.from(grouped.values())
    .sort((left, right) => left.bestPriority - right.bestPriority)
    .slice(0, 20)
    .map(({ id, name, profileUrl, jobs }) => ({
      id,
      name,
      roleLabel: jobs.join(" · "),
      profileUrl
    }));
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

function collectionReleaseTimestamp(item: DiscoveryItem) {
  if (!item.releaseDate) {
    return Number.MAX_SAFE_INTEGER;
  }

  const timestamp = new Date(`${item.releaseDate}T12:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function parsePreviousInstallments(rawParts: Array<Record<string, unknown>>, currentMovieId: number) {
  const parts = rawParts
    .filter((part) => Number.isFinite(Number(part.id)))
    .map((part) => normalizeItem({ ...part, media_type: "movie" }))
    .sort((left, right) => {
      const dateDifference = collectionReleaseTimestamp(left) - collectionReleaseTimestamp(right);
      return dateDifference || left.id - right.id;
    });
  const currentIndex = parts.findIndex((part) => part.id === currentMovieId);

  // Si TMDB no incluyó el título actual dentro de su colección, no suponemos
  // cuál es la parte anterior: es preferible ocultar el carrusel a inventarlo.
  // La entrega inmediatamente anterior es la mas util al abrir una secuela,
  // asi que aparece primero aunque TMDB devuelva la coleccion por cronologia.
  return currentIndex > 0 ? parts.slice(0, currentIndex).reverse() : [];
}

async function getPreviousCollectionInstallments(collectionId: number, currentMovieId: number) {
  if (!apiKey) {
    return [];
  }

  try {
    const collectionUrl = new URL(`${baseUrl}/collection/${collectionId}`);
    collectionUrl.searchParams.set("api_key", apiKey);
    collectionUrl.searchParams.set("language", "es-MX");

    const response = await fetch(collectionUrl.toString());
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { parts?: Array<Record<string, unknown>> };
    return parsePreviousInstallments(payload.parts ?? [], currentMovieId);
  } catch {
    // Una colección es información complementaria: la ficha principal sigue
    // siendo útil aunque ese endpoint puntual no responda.
    return [];
  }
}

function getCastCharacter(person: Record<string, unknown>) {
  const aggregateRoles = Array.isArray(person.roles)
    ? person.roles
        .map((role) =>
          typeof role === "object" &&
          role !== null &&
          "character" in role &&
          typeof role.character === "string"
            ? role.character.trim()
            : ""
        )
        .filter(Boolean)
    : [];
  const characters = [...new Set(aggregateRoles)];

  if (characters.length) {
    return characters.join(" · ");
  }

  return typeof person.character === "string" && person.character.trim()
    ? person.character.trim()
    : null;
}

function buildCastList(rawCast: Array<Record<string, unknown>>, isAggregate = false): MediaDetails["cast"] {
  const seenIds = new Set<number>();
  const orderedCast = [...rawCast].sort((left, right) => {
    if (isAggregate) {
      const episodeDifference =
        (typeof right.total_episode_count === "number" ? right.total_episode_count : 0) -
        (typeof left.total_episode_count === "number" ? left.total_episode_count : 0);
      if (episodeDifference) {
        return episodeDifference;
      }
    }

    const leftOrder = typeof left.order === "number" ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof right.order === "number" ? right.order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });

  return orderedCast.reduce<MediaDetails["cast"]>((cast, person) => {
    const id = Number(person.id);
    const name = typeof person.name === "string" ? person.name.trim() : "";
    if (!Number.isFinite(id) || !name || seenIds.has(id)) {
      return cast;
    }

    seenIds.add(id);
    cast.push({
      id,
      name,
      character: getCastCharacter(person),
      profileUrl: typeof person.profile_path === "string" ? `${imageBase}${person.profile_path}` : null
    });
    return cast;
  }, []);
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

function creditNumber(item: Record<string, unknown>, key: string): number {
  const value = item[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function creditReleaseDate(item: Record<string, unknown>): number {
  const date =
    typeof item.release_date === "string"
      ? item.release_date
      : typeof item.first_air_date === "string"
        ? item.first_air_date
        : "";
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortTalentCreditsByRelevance(
  credits: Record<string, unknown>[]
): Record<string, unknown>[] {
  return [...credits].sort((left, right) => {
    const popularityDifference = creditNumber(right, "popularity") - creditNumber(left, "popularity");
    if (popularityDifference !== 0) {
      return popularityDifference;
    }

    const ratingDifference = creditNumber(right, "vote_average") - creditNumber(left, "vote_average");
    if (ratingDifference !== 0) {
      return ratingDifference;
    }

    const voteCountDifference = creditNumber(right, "vote_count") - creditNumber(left, "vote_count");
    if (voteCountDifference !== 0) {
      return voteCountDifference;
    }

    return creditReleaseDate(right) - creditReleaseDate(left);
  });
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

  const normalizedQuery = normalizeSearchText(query);
  const payload = (await response.json()) as { results?: Record<string, unknown>[] };
  return (payload.results ?? [])
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    // Buscar es una intencion explicita: nunca descartamos un titulo porque
    // no tenga sinopsis, poster, idioma ingles/español o disponibilidad que
    // TMDB todavia no haya actualizado para Argentina.
    .filter(hasDisplayTitle)
    .sort((left, right) => {
      const matchDifference = searchMatchRank(left, normalizedQuery) - searchMatchRank(right, normalizedQuery);
      if (matchDifference !== 0) {
        return matchDifference;
      }

      return popularityOf(right) - popularityOf(left);
    })
    .slice(0, 20)
    .map(normalizeItem);
}

export async function getRecommendationTitles(): Promise<DiscoveryItem[]> {
  return getRecommendationTitlesByPage(1);
}

/** Filtros que el usuario elige en Descubri. */
export type DiscoverFilters = {
  /** provider_id de TMDB. Vacio = cualquier suscripcion disponible en AR. */
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

    // Descubri es regional: solo parte de titulos incluidos con suscripcion
    // en Argentina. Con proveedores seleccionados, "|" significa cualquiera
    // de ellos, no todos a la vez.
    url.searchParams.set("watch_region", WATCH_REGION);
    url.searchParams.set("with_watch_monetization_types", "flatrate");

    // Esto acota del lado de TMDB, pero NO alcanza para garantizar: TMDB
    // aplica proveedor y tipo de monetizacion como condiciones separadas.
    // Quien consuma estos resultados vuelve a verificar los proveedores
    // reales antes de mostrar cada tarjeta.
    if (filters.providerIds.length) {
      url.searchParams.set("with_watch_providers", filters.providerIds.join("|"));
    }
  }

  const requests: Array<Promise<{ mediaType: MediaType; results: Record<string, unknown>[] }>> = [];

  if (wantsMovies) {
    const movieUrl = new URL(`${baseUrl}/discover/movie`);
    applyCommon(movieUrl);
    requests.push(
      fetch(movieUrl.toString())
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`TMDB respondio ${response.status} para peliculas.`);
          }

          const payload = (await response.json()) as { results?: Record<string, unknown>[] };
          return {
            mediaType: "movie" as MediaType,
            results: payload.results ?? []
          };
        })
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
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`TMDB respondio ${response.status} para series.`);
          }

          const payload = (await response.json()) as { results?: Record<string, unknown>[] };
          return {
            mediaType: "tv" as MediaType,
            results: payload.results ?? []
          };
        })
    );
  }

  // Si falla una de las dos colecciones, seguimos con la otra. Pero si TMDB
  // no devolvio ninguna, no disfrazamos una caida temporal como "no hay
  // titulos": el panel puede ofrecer reintentar y conservar el mazo actual.
  const settledResponses = await Promise.allSettled(requests);
  const responses = settledResponses.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  if (!responses.length) {
    throw new Error("TMDB no pudo cargar el catalogo en este momento.");
  }

  // Con un solo tipo pedido, esa lista se lleva todos los lugares del mazo.
  const perList = responses.length > 1 ? 8 : 16;

  return responses.flatMap((response) =>
    response.results
      .filter(isSupportedDiscoverResult)
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
  return items.slice(0, 10);
}

export async function getTitlesByGenre(genreId: number): Promise<DiscoveryItem[]> {
  const items = await fetchDiscoveredCatalog("movie", {
    with_genres: String(genreId),
    sort_by: "popularity.desc",
    "vote_count.gte": "80"
  });

  return items.slice(0, 10);
}

export async function getFeaturedTalent(): Promise<TalentSearchItem[]> {
  if (!apiKey) {
    return [];
  }

  // Popular people is more stable than the global weekly trend for a mainstream discovery surface.
  const pages = await Promise.all(
    [1, 2].map(async (page) => {
      const url = new URL(`${baseUrl}/person/popular`);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("language", "en-US");
      url.searchParams.set("page", String(page));

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error("No pude traer los talentos destacados.");
      }

      const payload = (await response.json()) as { results?: Record<string, unknown>[] };
      return payload.results ?? [];
    })
  );

  const seenIds = new Set<number>();
  return pages
    .flat()
    .filter((item) => typeof item.name === "string" && item.name.trim().length > 0)
    .filter((item) => typeof item.profile_path === "string" && item.profile_path.trim().length > 0)
    .filter((item) => item.known_for_department === "Acting" || item.known_for_department === "Directing")
    .filter((item) =>
      Array.isArray(item.known_for) &&
      item.known_for.some(
        (credit) =>
          typeof credit === "object" &&
          credit !== null &&
          (credit as { original_language?: unknown }).original_language === "en"
      )
    )
    .filter((item) => {
      const id = Number(item.id);
      if (!Number.isFinite(id) || seenIds.has(id)) {
        return false;
      }

      seenIds.add(id);
      return true;
    })
    .slice(0, 4)
    .map((item) => ({
      id: Number(item.id),
      name: String(item.name),
      knownForDepartment: normalizeDepartment(
        typeof item.known_for_department === "string" ? item.known_for_department : null
      ),
      profileUrl: typeof item.profile_path === "string" ? `${profileBase}${item.profile_path}` : null,
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

export type WatchProvider = StreamingProvider;

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
  const regional = results?.[WATCH_REGION];

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

function hasCurrentTheatricalRelease(payload: Record<string, unknown>, hasStreaming: boolean) {
  if (hasStreaming) {
    return false;
  }

  const releaseDates = payload.release_dates as
    | {
        results?: Array<{
          iso_3166_1?: string;
          release_dates?: Array<{ type?: number; release_date?: string }>;
        }>;
      }
    | undefined;
  const regional = releaseDates?.results?.find((item) => item.iso_3166_1 === "AR") ??
    releaseDates?.results?.find((item) => item.iso_3166_1 === "US");
  const theatricalDate = regional?.release_dates
    ?.filter((entry) => entry.type === 3 || entry.type === 4)
    .map((entry) => entry.release_date ?? "")
    .sort()[0];

  if (!theatricalDate) {
    return false;
  }

  const premiereTime = new Date(theatricalDate).getTime();
  const elapsedDays = (Date.now() - premiereTime) / 86_400_000;
  return elapsedDays >= 0 && elapsedDays <= 120;
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
      providers: fallback.providers.map((name) => ({
        id: 0,
        name,
        logoUrl: null,
        url: buildProviderUrl(name, fallback.title, null)
      })),
      backdropUrl: null,
      releaseDate: fallback.releaseDate ?? null,
      isTheatrical: false,
      runtimeLabel: null,
      releaseLabel: null,
      countryLabel: null,
      languageLabel: null,
      certification: null,
      directorLabel: null,
      budgetLabel: null,
      trailerUrl: null,
      creators: [],
      previousInstallments: [],
      cast: [],
      crew: [],
      seasons: []
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
  const watchOptions = getWatchOptions(providersPayload, item.title);
  const standardCast =
    (payload.credits as { cast?: Array<Record<string, unknown>> } | undefined)?.cast ?? [];
  const cast = buildCastList(mediaType === "movie" ? standardCast.slice(0, 40) : standardCast);
  const collectionId =
    mediaType === "movie" &&
    typeof payload.belongs_to_collection === "object" &&
    payload.belongs_to_collection !== null &&
    "id" in payload.belongs_to_collection
      ? Number(payload.belongs_to_collection.id)
      : null;
  const previousInstallmentsPromise = collectionId !== null && Number.isFinite(collectionId)
    ? getPreviousCollectionInstallments(collectionId, tmdbId)
    : Promise.resolve<DiscoveryItem[]>([]);
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
  const crew = buildCrewList(
    (payload.credits as { crew?: Array<Record<string, unknown>> } | undefined)?.crew ?? [],
    mediaType,
    creators
  );

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
    providers: watchOptions.flatrate,
    releaseDate: item.releaseDate ?? null,
    isTheatrical: mediaType === "movie" && hasCurrentTheatricalRelease(payload, watchOptions.flatrate.length > 0),
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
    previousInstallments: await previousInstallmentsPromise,
    cast,
    crew,
    seasons: mediaType === "tv" ? parseSeasons(payload) : []
  };
}

/** Reparto acumulado de los episodios de una temporada puntual de una serie. */
export async function getSeasonCast(
  showId: number,
  seasonNumber: number
): Promise<MediaDetails["cast"]> {
  if (!apiKey) {
    return [];
  }

  const url = new URL(`${baseUrl}/tv/${showId}/season/${seasonNumber}/aggregate_credits`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "es-MX");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`No se pudo cargar el reparto de la temporada ${seasonNumber}.`);
  }

  const payload = (await response.json()) as { cast?: Array<Record<string, unknown>> };
  return buildCastList(payload.cast ?? [], true);
}

function parseSeasons(payload: Record<string, unknown>): SeasonSummary[] {
  const rawSeasons = Array.isArray(payload.seasons)
    ? (payload.seasons as Array<Record<string, unknown>>)
    : [];

  return rawSeasons
    .filter((season) => typeof season.season_number === "number")
    .map((season) => {
      const seasonNumber = Number(season.season_number);
      const rawName = typeof season.name === "string" ? season.name : "";
      const name = seasonNumber === 0
        ? "Especiales"
        : rawName && !/^Season\s+\d+/i.test(rawName)
          ? rawName
          : `Temporada ${seasonNumber}`;
      const airDate = typeof season.air_date === "string" && season.air_date ? season.air_date : null;
      return {
        id: Number(season.id ?? seasonNumber),
        seasonNumber,
        name,
        overview: typeof season.overview === "string" ? season.overview : "",
        posterUrl:
          typeof season.poster_path === "string" ? `${imageBase}${season.poster_path}` : null,
        airDate,
        airDateLabel: formatDate(airDate),
        episodeCount: typeof season.episode_count === "number" ? Number(season.episode_count) : 0
      };
    })
    .sort((left, right) => {
      // Especiales (0) al principio para replicar el orden que muestran Sofa Time / TMDB.
      if (left.seasonNumber === 0) return -1;
      if (right.seasonNumber === 0) return 1;
      return left.seasonNumber - right.seasonNumber;
    });
}

export async function getSeasonEpisodes(
  showId: number,
  seasonNumber: number
): Promise<EpisodeSummary[]> {
  if (!apiKey) {
    return [];
  }

  const url = new URL(`${baseUrl}/tv/${showId}/season/${seasonNumber}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "es-MX");

  const response = await fetch(url.toString());
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const rawEpisodes = Array.isArray(payload.episodes)
    ? (payload.episodes as Array<Record<string, unknown>>)
    : [];

  return rawEpisodes
    .filter((episode) => typeof episode.episode_number === "number")
    .map((episode) => {
      const airDate = typeof episode.air_date === "string" && episode.air_date ? episode.air_date : null;
      const runtime = typeof episode.runtime === "number" ? Number(episode.runtime) : null;
      return {
        id: Number(episode.id ?? episode.episode_number),
        seasonNumber:
          typeof episode.season_number === "number" ? Number(episode.season_number) : seasonNumber,
        episodeNumber: Number(episode.episode_number),
        name: typeof episode.name === "string" ? episode.name : `Episodio ${Number(episode.episode_number)}`,
        overview: typeof episode.overview === "string" ? episode.overview : "",
        stillUrl:
          typeof episode.still_path === "string" ? `${imageBase}${episode.still_path}` : null,
        airDate,
        airDateLabel: formatDate(airDate),
        runtime,
        runtimeLabel: formatRuntime(runtime),
        score:
          typeof episode.vote_average === "number" ? Number(episode.vote_average) : 0
      };
    });
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
    sortTalentCreditsByRelevance(combinedCredits.cast ?? [])
      .map((item) => normalizeCredit(item))
      .filter((item): item is TalentCredit => Boolean(item))
  );

  const directingCredits = uniqueTalentCredits(
    sortTalentCreditsByRelevance(
      (combinedCredits.crew ?? []).filter(
        (item) => item.job === "Director" || item.department === "Directing"
      )
    )
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
