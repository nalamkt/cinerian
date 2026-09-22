import { fetchProfileSummaries, getProfileById, type ProfileSummary } from "./auth";
import { fetchFollowingUserIds } from "./follows";
import {
  fetchRatedReactionsForUserIds,
  fetchStoredReactions,
  type RatedReaction,
  type StoredReaction
} from "./reactions";
import {
  getRecommendationTitlesByPage,
  getTitleAvailability,
  getTitleById,
  NO_FILTERS,
  type DiscoverFilters
} from "./tmdb";
import type { DiscoveryItem, MediaType } from "../types";

const REACTION_WEIGHT: Record<RatedReaction, number> = {
  superliked: 6,
  liked: 3,
  disliked: -2
};

/**
 * El puntaje social es un PROMEDIO, no una suma.
 *
 * Sumando, el ranking termina midiendo popularidad: cinco personas a las que
 * algo "les gusto" (5 x 3 = 15) le ganan siempre a dos que lo amaron
 * (2 x 6 = 12), aunque el segundo sea mucho mejor recomendacion.
 *
 * Dividir a secas tampoco sirve, porque el primero que puntua define el puesto.
 * Por eso dividimos por (cantidad + este amortiguador): hacen falta al menos
 * dos personas entusiastas para desplazar a un grupo tibio, y una sola no
 * alcanza para mandar algo al primer puesto.
 *
 *   Tarzan, 5 "me gusto"     -> 15 / (5+2) = 2.14
 *   Gladiador, 2 "me encanto" -> 12 / (2+2) = 3.00  <- gana
 *   Un solo "me encanto"      ->  6 / (1+2) = 2.00  <- no alcanza
 */
const SCORE_SMOOTHING = 2;

/**
 * Con el promedio, el puntaje social vive entre -2 y 6. El bonus de genero
 * tiene que ser un empujon dentro de esa escala y no el que decide: por eso
 * baja de 1.5 a 0.4 por genero en comun.
 */
const GENRE_BONUS_WEIGHT = 0.4;
const OWN_GENRE_SAMPLE_LIMIT = 15;

/** Alguien de tu circulo que vio el titulo, con su veredicto. */
export type Watcher = ProfileSummary & { reaction: RatedReaction };

export type RankedRecommendation = {
  item: DiscoveryItem;
  /**
   * Puesto en el ranking personal, empezando en 1. Es null cuando el titulo
   * entra como relleno de TMDB: ahi no hay ranking que mostrar, porque nadie
   * de tu circulo lo vio.
   */
  rank: number | null;
  /** Quienes de tu circulo lo vieron. Vacio en los titulos de relleno. */
  watchers: Watcher[];
};

/**
 * Decide si un titulo pasa los filtros, contra sus proveedores REALES en AR.
 *
 * Lo usan los dos caminos. El ranking social lo necesita porque un titulo que
 * vio tu amigo llega sin saber donde esta disponible. Y el relleno tambien,
 * aunque TMDB ya haya filtrado: su buscador aplica proveedor y monetizacion
 * como condiciones separadas, asi que cuela titulos que en esa plataforma solo
 * se compran y tienen suscripcion en otra.
 */
function passesFilters(
  availability: { item: DiscoveryItem; providerIds: number[]; seriesType: string | null },
  filters: DiscoverFilters
) {
  const { item, providerIds, seriesType } = availability;

  if (filters.contentType === "movie" && item.mediaType !== "movie") {
    return false;
  }

  if (filters.contentType === "series" && item.mediaType !== "tv") {
    return false;
  }

  if (filters.contentType === "mini" && (item.mediaType !== "tv" || seriesType !== "Miniseries")) {
    return false;
  }

  // Descubri nunca ofrece un titulo que no este incluido con suscripcion en
  // Argentina. Si se eligieron plataformas, alcanza con que este en una de
  // ellas: pedir que este en todas vaciaria el catalogo artificialmente.
  if (!providerIds.length) {
    return false;
  }

  if (filters.providerIds.length) {
    return providerIds.some((id) => filters.providerIds.includes(id));
  }

  return true;
}

function candidateKey(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}-${tmdbId}`;
}

function normalizeGenreLabel(value: string) {
  return value.trim().toLowerCase();
}

async function buildOwnGenreAffinity(userId: string): Promise<Set<string>> {
  const [ownReactions, ownProfile] = await Promise.all([
    fetchStoredReactions(userId),
    getProfileById(userId)
  ]);

  const ownLiked = ownReactions
    .filter((reaction) => reaction.reaction === "liked" || reaction.reaction === "superliked")
    .slice(0, OWN_GENRE_SAMPLE_LIMIT);

  if (ownLiked.length < 3) {
    return new Set((ownProfile?.favorite_genres ?? []).map(normalizeGenreLabel));
  }

  const ownItems = await Promise.all(
    ownLiked.map((reaction) => getTitleById(reaction.tmdbId, reaction.mediaType))
  );

  const genreCounts = new Map<string, number>();
  ownItems.forEach((item) => {
    item?.genres.forEach((genre) => {
      const key = normalizeGenreLabel(genre);
      genreCounts.set(key, (genreCounts.get(key) ?? 0) + 1);
    });
  });

  return new Set(
    [...genreCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([genre]) => genre)
  );
}

/**
 * Cuantas paginas de TMDB escaneamos como maximo buscando titulos sin reaccion.
 * Hace falta porque un usuario con mucho historial puede tener reaccionada toda
 * una pagina de populares: si nos quedaramos con la primera que pedimos,
 * Descubri quedaria vacio aunque TMDB tenga miles de paginas mas.
 */
const MAX_BACKFILL_PAGES = 8;

/**
 * Cada "pagina" del mazo escanea MAX_BACKFILL_PAGES paginas reales de TMDB.
 * Si el siguiente intento arrancara en `page + 1`, volveria a mirar casi todo
 * el bloque anterior y podria declarar vacio el catalogo despues de revisar
 * solo los primeros populares. Los bloques contiguos permiten seguir buscando
 * aunque el usuario ya haya reaccionado cientos de titulos.
 */
function catalogPageForDeckPage(page: number) {
  const deckPage = Math.max(1, Math.floor(page));
  return 1 + (deckPage - 1) * MAX_BACKFILL_PAGES;
}

async function collectFillerTitles(
  startPage: number,
  needed: number,
  excludedKeys: Set<string>,
  filters: DiscoverFilters,
  alreadyPicked: Set<string> = new Set()
): Promise<DiscoveryItem[]> {
  const picked: DiscoveryItem[] = [];
  const seen = new Set(alreadyPicked);
  const tmdbFilteredFallback: DiscoveryItem[] = [];
  let successfulCatalogPages = 0;
  let failedCatalogPages = 0;

  // El buscador de TMDB acota pero no garantiza: aplica proveedor y tipo de
  // monetizacion por separado, asi que puede colar un titulo sin suscripcion
  // real en Argentina. Verificamos siempre antes de mostrarlo.
  const needsVerification = true;

  for (let offset = 0; offset < MAX_BACKFILL_PAGES && picked.length < needed; offset += 1) {
    let batch: DiscoveryItem[];
    try {
      batch = await getRecommendationTitlesByPage(startPage + offset, filters);
      successfulCatalogPages += 1;
    } catch {
      // Una pagina puntual de TMDB no debe cancelar el resto del catalogo.
      failedCatalogPages += 1;
      continue;
    }
    if (!batch.length) {
      break;
    }

    const fresh = batch.filter((item) => {
      const key = candidateKey(item.mediaType, item.id);
      if (excludedKeys.has(key) || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

    // Esta lista ya viene de `discover` con región, plataforma y flatrate.
    // Solo se usa si la verificación detallada no pudo validar NI una carta:
    // así una respuesta incompleta/rate-limit de fichas no convierte miles de
    // resultados válidos de TMDB en un mazo vacío.
    tmdbFilteredFallback.push(...fresh);

    if (!needsVerification) {
      picked.push(...fresh.slice(0, needed - picked.length));
      continue;
    }

    const checked = await Promise.all(
      fresh.slice(0, (needed - picked.length) * 2).map(async (item) => {
        const availability = await getTitleAvailability(item.id, item.mediaType);
        // Si no se pudo verificar, se descarta: mostrar algo que quiza no este
        // en tus plataformas es peor que buscar en la pagina siguiente.
        return availability && passesFilters(availability, filters) ? availability.item : null;
      })
    );

    for (const item of checked) {
      if (picked.length >= needed) {
        break;
      }
      if (item) {
        picked.push(item);
      }
    }
  }

  if (successfulCatalogPages === 0 && failedCatalogPages > 0) {
    throw new Error("TMDB no pudo cargar paginas del catalogo.");
  }

  if (picked.length === 0 && tmdbFilteredFallback.length) {
    return tmdbFilteredFallback.slice(0, needed);
  }

  return picked;
}

type ScoredCandidate = {
  tmdbId: number;
  mediaType: MediaType;
  /** Suma cruda de pesos. El puntaje final la promedia (ver SCORE_SMOOTHING). */
  weightSum: number;
  watcherIds: Array<{ userId: string; reaction: RatedReaction }>;
};

function socialScoreOf(candidate: ScoredCandidate) {
  return candidate.weightSum / (candidate.watcherIds.length + SCORE_SMOOTHING);
}

/**
 * El puntaje que se MUESTRA, de 0 a 10. Distinto del que ordena.
 *
 * Compara el entusiasmo del circulo contra el maximo que ese mismo grupo podia
 * dar: si todos eligieron "me encanto" da 10, sean 3 personas o 300.
 *
 * El amortiguador de socialScoreOf queda afuera a proposito. Ese sirve para
 * ORDENAR, porque mezcla veredicto con confianza, y como efecto secundario
 * hace que el techo dependa de cuanta gente puntuo: con 3 opiniones el maximo
 * posible era 3.6, asi que un unanime se mostraba como si fuera mediocre.
 *
 * Division del trabajo: este numero dice QUE TAN bien le fue, y el puesto en
 * la lista dice CUANTA confianza hay en ese numero. Por eso un solo "me
 * encanto" puede mostrar 10 y aun asi quedar al fondo del ranking; la linea
 * con el tamaño de la muestra, al lado, es la que lo explica.
 */
function displayScoreOf(candidate: ScoredCandidate) {
  const best = REACTION_WEIGHT.superliked * candidate.watcherIds.length;
  if (best <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(10, (candidate.weightSum / best) * 10));
}

/** Cuanto puntuo el circulo del usuario a un titulo, y con cuantas opiniones. */
export type CircleScore = {
  score: number;
  watchers: number;
};

/**
 * Puntaje de Cinerian por titulo: el mismo promedio ponderado que ordena
 * Descubri (ver REACTION_WEIGHT y SCORE_SMOOTHING), pero calculado para
 * titulos que el usuario todavia no vio.
 *
 * Devuelve solo los titulos que alguien del circulo puntuo: si la clave no
 * esta, no hay señal social, no es un cero.
 */
export async function fetchCircleScores(userId: string): Promise<Map<string, CircleScore>> {
  const followingIds = await fetchFollowingUserIds(userId);
  if (followingIds.length === 0) {
    return new Map();
  }

  const followedRated = await fetchRatedReactionsForUserIds(followingIds);
  const totals = new Map<string, { weightSum: number; watchers: number }>();

  followedRated.forEach((reaction) => {
    const key = candidateKey(reaction.mediaType, reaction.tmdbId);
    const entry = totals.get(key) ?? { weightSum: 0, watchers: 0 };

    entry.weightSum += REACTION_WEIGHT[reaction.reaction];
    entry.watchers += 1;
    totals.set(key, entry);
  });

  return new Map(
    Array.from(totals, ([key, entry]) => [
      key,
      {
        score: entry.weightSum / (entry.watchers + SCORE_SMOOTHING),
        watchers: entry.watchers
      }
    ])
  );
}

/** Una posicion del ranking personal, ya con el detalle del titulo. */
export type CircleRankingEntry = {
  item: DiscoveryItem;
  /** Puesto dentro del ranking, empezando en 1. */
  rank: number;
  /** De 0 a 10, para mostrar. No es el numero que ordena: ver displayScoreOf. */
  score: number;
  watchers: Watcher[];
};

export type CircleRanking = {
  entries: CircleRankingEntry[];
  /**
   * Cuantos titulos tiene el ranking completo. Es null filtrando por
   * miniseries: saber el total exacto obligaria a pedirle a TMDB la ficha de
   * TODAS las series del circulo, porque "es miniserie" no se sabe hasta
   * traerla.
   */
  total: number | null;
  hasMore: boolean;
};

/** Que puede pedir el ranking. "tv" incluye miniseries; "mini" es el subconjunto. */
export type RankingContentType = "all" | "movie" | "tv" | "mini";

/**
 * Cuantas series se hidratan por tanda buscando miniseries, y hasta donde se
 * escanea. El tope existe porque el filtro no se puede resolver sin pedir la
 * ficha: sin el, un circulo con miles de series puntuadas dispararia miles de
 * pedidos para llenar una pagina de 20.
 */
const MINISERIES_SCAN_CHUNK = 24;
const MINISERIES_SCAN_LIMIT = 150;

/**
 * El ranking personal COMPLETO del circulo, sin importar si el usuario ya vio
 * el titulo.
 *
 * Es la diferencia con Descubri: alla cualquier reaccion propia saca el titulo
 * del mazo, porque el objetivo es ofrecer algo nuevo para ver. Aca el objetivo
 * es otro -- ver como quedo ordenado lo que mira tu circulo -- y esconder lo
 * que ya viste romperia justamente eso.
 *
 * Tampoco aplica los filtros de plataforma de Descubri: un ranking que se
 * recorta por donde esta disponible cada titulo deja de ser un ranking.
 *
 * `contentType` filtra ANTES de numerar, asi que al elegir "Peliculas" los
 * puestos son 1, 2, 3... entre peliculas y no los huecos que dejan las series.
 *
 * Solo se hidrata contra TMDB el tramo pedido: el circulo puede tener miles de
 * titulos puntuados y no vamos a pedir el detalle de todos para mostrar 20.
 * Por eso "ver mas" pide `offset` y suma, en vez de volver a traer desde el
 * puesto 1: sin eso, el quinto click terminaria pidiendo 100 fichas de TMDB
 * para mostrar 20 nuevas.
 *
 * "mini" es el unico filtro que no se puede resolver contra la base: la
 * reaccion guardada solo sabe si es pelicula o serie, y que una serie sea
 * miniserie recien se sabe al traer la ficha. Por eso ese camino escanea por
 * tandas en vez de cortar de una.
 */
export async function fetchCircleRanking(
  userId: string,
  options: { offset?: number; limit?: number; contentType?: RankingContentType } = {}
): Promise<CircleRanking> {
  const { offset = 0, limit = 20, contentType = "all" } = options;
  const wantedMediaType: MediaType | null =
    contentType === "movie" ? "movie" : contentType === "all" ? null : "tv";

  const followingIds = await fetchFollowingUserIds(userId);
  if (followingIds.length === 0) {
    return { entries: [], total: 0, hasMore: false };
  }

  const followedRated = await fetchRatedReactionsForUserIds(followingIds);
  const candidates = new Map<string, ScoredCandidate>();

  followedRated.forEach((reaction) => {
    if (wantedMediaType && reaction.mediaType !== wantedMediaType) {
      return;
    }

    const key = candidateKey(reaction.mediaType, reaction.tmdbId);
    const entry = candidates.get(key) ?? {
      tmdbId: reaction.tmdbId,
      mediaType: reaction.mediaType,
      weightSum: 0,
      watcherIds: []
    };

    entry.weightSum += REACTION_WEIGHT[reaction.reaction];
    entry.watcherIds.push({ userId: reaction.userId, reaction: reaction.reaction });

    candidates.set(key, entry);
  });

  // Igual que en Descubri, los de puntaje <= 0 quedan afuera: son titulos que
  // al circulo no le gustaron, y numerarlos dentro de un ranking los leeria
  // como recomendados.
  const ordered = [...candidates.values()]
    .filter((candidate) => socialScoreOf(candidate) > 0)
    .sort((left, right) => {
      const diff = socialScoreOf(right) - socialScoreOf(left);
      if (diff !== 0) {
        return diff;
      }

      // A igual promedio gana el que junto mas opiniones: es mas confiable.
      return right.watcherIds.length - left.watcherIds.length;
    });

  const start = Math.max(0, offset);
  const size = Math.max(0, limit);

  type Hydrated = {
    item: DiscoveryItem;
    rank: number;
    score: number;
    watcherIds: ScoredCandidate["watcherIds"];
  };

  let detailed: Hydrated[];
  let total: number | null;
  let hasMore: boolean;

  if (contentType === "mini") {
    // Escaneo por tandas: hidratamos series en orden de ranking y nos quedamos
    // con las miniseries hasta juntar la pagina pedida (mas una, para saber si
    // hay siguiente). El cache de getTitleById hace que "ver mas" no vuelva a
    // pagar las tandas ya escaneadas.
    const needed = start + size + 1;
    const kept: Array<{ candidate: ScoredCandidate; item: DiscoveryItem }> = [];
    let scanned = 0;

    while (kept.length < needed && scanned < ordered.length && scanned < MINISERIES_SCAN_LIMIT) {
      const chunk = ordered.slice(scanned, scanned + MINISERIES_SCAN_CHUNK);
      scanned += chunk.length;

      const hydratedChunk = await Promise.all(
        chunk.map(async (candidate) => {
          const item = await getTitleById(candidate.tmdbId, candidate.mediaType);
          return item ? { candidate, item } : null;
        })
      );

      for (const entry of hydratedChunk) {
        if (entry && entry.item.seriesType === "Miniseries") {
          kept.push(entry);
        }
      }
    }

    const scannedEverything = scanned >= ordered.length;
    detailed = kept.slice(start, start + size).map((entry, index) => ({
      item: entry.item,
      rank: start + index + 1,
      score: displayScoreOf(entry.candidate),
      watcherIds: entry.candidate.watcherIds
    }));

    // El total solo se sabe si se recorrio todo; si se corto por el tope,
    // puede haber mas miniseries mas abajo que nunca se miraron.
    total = scannedEverything ? kept.length : null;
    hasMore = kept.length > start + size;
  } else {
    const slice = ordered.slice(start, start + size);

    // El puesto se calcula contra el ranking completo, antes de descartar los
    // titulos que TMDB no devuelve: si uno falla, los demas conservan su numero
    // real en vez de correrse y mentir sobre su lugar.
    detailed = (
      await Promise.all(
        slice.map(async (candidate, index) => {
          const item = await getTitleById(candidate.tmdbId, candidate.mediaType);
          if (!item) {
            return null;
          }

          return {
            item,
            rank: start + index + 1,
            score: displayScoreOf(candidate),
            watcherIds: candidate.watcherIds
          };
        })
      )
    ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    total = ordered.length;
    hasMore = start + size < ordered.length;
  }

  const neededProfileIds = [
    ...new Set(detailed.flatMap((entry) => entry.watcherIds.map((watcher) => watcher.userId)))
  ];
  let profiles: ProfileSummary[] = [];
  try {
    profiles = await fetchProfileSummaries(neededProfileIds);
  } catch {
    // Los nombres del circulo son decorativos: sin ellos el ranking igual sirve.
  }
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return {
    total,
    hasMore,
    entries: detailed.map((entry) => ({
      item: entry.item,
      rank: entry.rank,
      score: entry.score,
      watchers: entry.watcherIds
        .map((watcher) => {
          const profile = profileById.get(watcher.userId);
          return profile ? { ...profile, reaction: watcher.reaction } : null;
        })
        .filter((watcher): watcher is Watcher => watcher !== null)
        .sort((left, right) => REACTION_WEIGHT[right.reaction] - REACTION_WEIGHT[left.reaction])
    }))
  };
}

/**
 * Arma el ranking personal del usuario y devuelve la pagina pedida.
 *
 * El puntaje social se calcula sin tocar TMDB; recien despues pedimos el
 * detalle de los titulos de esta pagina, para no traer datos que no se ven.
 */
export async function fetchSocialRecommendations(
  userId: string,
  page: number,
  limit = 12,
  filters: DiscoverFilters = NO_FILTERS,
  knownReactions: StoredReaction[] = []
): Promise<RankedRecommendation[]> {
  const [followingResult] = await Promise.allSettled([fetchFollowingUserIds(userId)]);
  const followingIds = followingResult.status === "fulfilled" ? followingResult.value : [];

  // El panel valida este snapshot antes de pedir el mazo. Consultarlo de nuevo
  // acá podía devolver una lectura vieja y pisar una reacción que ya se había
  // confirmado, ofreciendo otra vez la misma tarjeta.
  const reactionsByTitle = new Map<string, StoredReaction>();
  knownReactions.forEach((reaction) => {
    const key = candidateKey(reaction.mediaType, reaction.tmdbId);
    const current = reactionsByTitle.get(key);
    const currentTime = current?.createdAt ? new Date(current.createdAt).getTime() : 0;
    const reactionTime = reaction.createdAt ? new Date(reaction.createdAt).getTime() : 0;
    if (!current || reactionTime >= currentTime) {
      reactionsByTitle.set(key, reaction);
    }
  });
  const resolvedOwnReactions = [...reactionsByTitle.values()];

  // Cualquier reacción saca el título del mazo. "No me interesa" es una
  // decisión explícita de la persona y no debe volver, ni siquiera por una
  // recomendación nueva de su círculo.
  const excludedKeys = new Set(
    resolvedOwnReactions
      .map((reaction) => candidateKey(reaction.mediaType, reaction.tmdbId))
  );

  if (followingIds.length === 0) {
    const filler = await collectFillerTitles(
      catalogPageForDeckPage(page),
      limit,
      excludedKeys,
      filters
    );
    return filler.map((item) => ({ item, rank: null, watchers: [] }));
  }

  const [followedRatedResult, genreAffinityResult] = await Promise.allSettled([
    fetchRatedReactionsForUserIds(followingIds),
    buildOwnGenreAffinity(userId)
  ]);
  const followedRated = followedRatedResult.status === "fulfilled" ? followedRatedResult.value : [];
  const genreAffinity = genreAffinityResult.status === "fulfilled" ? genreAffinityResult.value : new Set<string>();

  // 1) Puntaje social, agrupando por titulo.
  const candidates = new Map<string, ScoredCandidate>();

  followedRated.forEach((reaction) => {
    const key = candidateKey(reaction.mediaType, reaction.tmdbId);
    if (excludedKeys.has(key)) {
      return;
    }

    const entry = candidates.get(key) ?? {
      tmdbId: reaction.tmdbId,
      mediaType: reaction.mediaType,
      weightSum: 0,
      watcherIds: []
    };

    entry.weightSum += REACTION_WEIGHT[reaction.reaction];
    entry.watcherIds.push({ userId: reaction.userId, reaction: reaction.reaction });

    candidates.set(key, entry);
  });

  // 2) Orden preliminar por señal social. El bonus de genero necesita los
  //    generos del titulo, asi que se aplica sobre la pagina ya recortada.
  //
  //    Los de puntaje <= 0 quedan afuera del ranking: son titulos que tu
  //    circulo vio y no le gusto, asi que numerarlos seria recomendarlos, y
  //    ademas la tarjeta no tendria prueba social que mostrar debajo.
  const preliminary = [...candidates.values()]
    .filter((candidate) => {
      if (socialScoreOf(candidate) <= 0) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      const diff = socialScoreOf(right) - socialScoreOf(left);
      if (diff !== 0) {
        return diff;
      }
      return right.watcherIds.length - left.watcherIds.length;
    });

  const offset = Math.max(0, (page - 1) * limit);
  const slice = preliminary.slice(offset, offset + limit);

  // 3) Detalle de TMDB solo para los que entran en esta pagina. La misma
  //    llamada trae plataformas y tipo de serie, que es lo que necesitan los
  //    filtros: pedirlos aparte duplicaria los pedidos por tarjeta.
  //
  //    El puesto se calcula ANTES de filtrar, contra el ranking completo: si un
  //    titulo se cae por el filtro, los que quedan conservan su numero real en
  //    vez de correrse, que mentiria sobre su lugar en tu ranking.
  const detailed = (
    await Promise.all(
      slice.map(async (candidate, indexInSlice) => {
        const availability = await getTitleAvailability(candidate.tmdbId, candidate.mediaType);
        if (!availability || !passesFilters(availability, filters)) {
          return null;
        }

        const { item } = availability;
        const genreBonus =
          item.genres.filter((genre) => genreAffinity.has(normalizeGenreLabel(genre))).length *
          GENRE_BONUS_WEIGHT;

        return {
          item,
          rank: offset + indexInSlice + 1,
          totalScore: socialScoreOf(candidate) + genreBonus,
          watcherIds: candidate.watcherIds
        };
      })
    )
  ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  // 4) Los perfiles de quienes vieron algo de esta pagina, en una sola consulta.
  const neededProfileIds = [
    ...new Set(detailed.flatMap((entry) => entry.watcherIds.map((watcher) => watcher.userId)))
  ];
  let profiles: ProfileSummary[] = [];
  try {
    profiles = await fetchProfileSummaries(neededProfileIds);
  } catch {
    // La ficha de perfil es decorativa; sin ella el catalogo igual se muestra.
  }
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const ranked: RankedRecommendation[] = detailed.map((entry) => ({
    item: entry.item,
    rank: entry.rank,
    watchers: entry.watcherIds
      .map((watcher) => {
        const profile = profileById.get(watcher.userId);
        return profile ? { ...profile, reaction: watcher.reaction } : null;
      })
      .filter((watcher): watcher is Watcher => watcher !== null)
      // Los mas entusiastas primero: son los que se muestran en la tarjeta.
      .sort((left, right) => REACTION_WEIGHT[right.reaction] - REACTION_WEIGHT[left.reaction])
  }));

  if (ranked.length >= limit) {
    return ranked;
  }

  // 5) Relleno: populares de TMDB, sin puesto ni prueba social.
  const seenKeys = new Set(ranked.map((entry) => candidateKey(entry.item.mediaType, entry.item.id)));
  const filler = (
    await collectFillerTitles(
      catalogPageForDeckPage(page),
      limit - ranked.length,
      excludedKeys,
      filters,
      seenKeys
    )
  ).map((item) => ({ item, rank: null, watchers: [] as Watcher[] }));

  return [...ranked, ...filler];
}
