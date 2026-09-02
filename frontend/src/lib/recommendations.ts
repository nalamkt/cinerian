import { fetchProfileSummaries, getProfileById, type ProfileSummary } from "./auth";
import { fetchFollowingUserIds } from "./follows";
import {
  fetchRatedReactionsForUserIds,
  fetchStoredReactions,
  type RatedReaction
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
 * Decide si un candidato del ranking social pasa los filtros.
 *
 * El relleno de TMDB no necesita esto: su buscador ya filtra del lado del
 * servidor. Pero un titulo que vio tu amigo llega sin saber donde esta
 * disponible ni si es miniserie, asi que hay que mirarlo aca.
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

async function collectFillerTitles(
  startPage: number,
  needed: number,
  excludedKeys: Set<string>,
  filters: DiscoverFilters,
  alreadyPicked: Set<string> = new Set()
): Promise<DiscoveryItem[]> {
  const picked: DiscoveryItem[] = [];
  const seen = new Set(alreadyPicked);

  for (let offset = 0; offset < MAX_BACKFILL_PAGES && picked.length < needed; offset += 1) {
    const batch = await getRecommendationTitlesByPage(startPage + offset, filters);
    if (!batch.length) {
      break;
    }

    for (const item of batch) {
      if (picked.length >= needed) {
        break;
      }

      const key = candidateKey(item.mediaType, item.id);
      if (excludedKeys.has(key) || seen.has(key)) {
        continue;
      }

      seen.add(key);
      picked.push(item);
    }
  }

  return picked;
}

type ScoredCandidate = {
  tmdbId: number;
  mediaType: MediaType;
  /** Suma cruda de pesos. El puntaje final la promedia (ver SCORE_SMOOTHING). */
  weightSum: number;
  watcherIds: Array<{ userId: string; reaction: RatedReaction }>;
  /** Alguien del circulo lo marco como gustado despues de que vos lo ignoraras. */
  hasLikeAfterIgnore: boolean;
};

function socialScoreOf(candidate: ScoredCandidate) {
  return candidate.weightSum / (candidate.watcherIds.length + SCORE_SMOOTHING);
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
  filters: DiscoverFilters = NO_FILTERS
): Promise<RankedRecommendation[]> {
  const [followingIds, ownReactions] = await Promise.all([
    fetchFollowingUserIds(userId),
    fetchStoredReactions(userId)
  ]);

  // Lo que ya viste o guardaste no vuelve nunca. Los que ignoraste van aparte:
  // pueden reaparecer si tu circulo los recomienda despues (ver mas abajo).
  const excludedKeys = new Set(
    ownReactions
      .filter((reaction) => reaction.reaction !== "ignored")
      .map((reaction) => candidateKey(reaction.mediaType, reaction.tmdbId))
  );

  const ignoredAt = new Map<string, number>(
    ownReactions
      .filter((reaction) => reaction.reaction === "ignored")
      .map((reaction) => [
        candidateKey(reaction.mediaType, reaction.tmdbId),
        reaction.createdAt ? new Date(reaction.createdAt).getTime() : 0
      ])
  );

  if (followingIds.length === 0) {
    // Sin circulo no hay señal que pueda pisar un skip: se excluyen todos.
    const allSeen = new Set([...excludedKeys, ...ignoredAt.keys()]);
    const filler = await collectFillerTitles(page, limit, allSeen, filters);
    return filler.map((item) => ({ item, rank: null, watchers: [] }));
  }

  const [followedRated, genreAffinity] = await Promise.all([
    fetchRatedReactionsForUserIds(followingIds),
    buildOwnGenreAffinity(userId)
  ]);

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
      watcherIds: [],
      hasLikeAfterIgnore: false
    };

    const positive = reaction.reaction !== "disliked";
    entry.weightSum += REACTION_WEIGHT[reaction.reaction];
    entry.watcherIds.push({ userId: reaction.userId, reaction: reaction.reaction });

    // La señal social pisa tu skip, pero solo si es NUEVA: un "me gusto"
    // anterior a tu skip ya estaba en la tarjeta cuando la pasaste de largo,
    // asi que insistir seria ignorar una decision que tomaste informado.
    if (positive && ignoredAt.has(key)) {
      const likedAt = reaction.createdAt ? new Date(reaction.createdAt).getTime() : 0;
      if (likedAt > (ignoredAt.get(key) ?? 0)) {
        entry.hasLikeAfterIgnore = true;
      }
    }

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

      const key = candidateKey(candidate.mediaType, candidate.tmdbId);
      return ignoredAt.has(key) ? candidate.hasLikeAfterIgnore : true;
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
  const profiles = await fetchProfileSummaries(neededProfileIds);
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

  // 5) Relleno: populares de TMDB, sin puesto ni prueba social. Aca los
  //    ignorados si quedan afuera: sin señal social nueva no hay motivo para
  //    volver a mostrar algo que ya pasaste de largo.
  const seenKeys = new Set(ranked.map((entry) => candidateKey(entry.item.mediaType, entry.item.id)));
  const fillerExcluded = new Set([...excludedKeys, ...ignoredAt.keys()]);
  const filler = (
    await collectFillerTitles(page, limit - ranked.length, fillerExcluded, filters, seenKeys)
  ).map((item) => ({ item, rank: null, watchers: [] as Watcher[] }));

  return [...ranked, ...filler];
}
