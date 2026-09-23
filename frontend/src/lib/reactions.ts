import { supabase } from "./supabase";
import { trackProductEvent } from "./analytics";
import type { DiscoveryItem, MediaType } from "../types";

export const REACTIONS_UPDATED_EVENT = "cinerian:reactions-updated";

// Un titulo esta siempre en exactamente UNO de estos estados por usuario:
// vista (con tres niveles de entusiasmo), guardada, o pasada de largo.
export type RecommendationReaction =
  | "superliked"
  | "liked"
  | "disliked"
  | "watchlist"
  | "ignored";

/** Los tres niveles de "ya la vi": son los unicos que puntuan en el recomendador. */
export const RATED_REACTIONS = ["superliked", "liked", "disliked"] as const;

export type RatedReaction = (typeof RATED_REACTIONS)[number];

export function isRatedReaction(reaction: RecommendationReaction): reaction is RatedReaction {
  return (RATED_REACTIONS as readonly string[]).includes(reaction);
}

const ALL_REACTIONS: RecommendationReaction[] = [
  "superliked",
  "liked",
  "disliked",
  "watchlist",
  "ignored"
];

// Protege el estado inmediato frente a lecturas que llegan tarde despues de un
// upsert. Es un espejo breve: Supabase sigue siendo la fuente persistente y la
// cache vence sola para no tapar cambios hechos desde otro dispositivo.
const REACTION_CACHE_TTL_MS = 5 * 60 * 1000;
const REACTION_CACHE_KEY_PREFIX = "cinerian.reactions.recent.";
// PostgREST puede limitar una respuesta a 1.000 filas. Paginar evita que un
// historial grande haga reaparecer reacciones antiguas como si no existieran.
const REACTION_PAGE_SIZE = 1_000;

export type StoredReaction = {
  tmdbId: number;
  mediaType: MediaType;
  reaction: RecommendationReaction;
  /** Cuando se guardo. Lo usa el recomendador para comparar contra tu circulo. */
  createdAt: string | null;
};

function reactionKey(entry: Pick<StoredReaction, "tmdbId" | "mediaType">) {
  return `${entry.mediaType}-${entry.tmdbId}`;
}

function reactionTimestamp(value: string | null) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function readRecentReactionCache(userId: string): StoredReaction[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(`${REACTION_CACHE_KEY_PREFIX}${userId}`);
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    const minimumTimestamp = Date.now() - REACTION_CACHE_TTL_MS;
    return parsed.filter(
      (entry): entry is StoredReaction =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as StoredReaction).tmdbId === "number" &&
        ((entry as StoredReaction).mediaType === "movie" || (entry as StoredReaction).mediaType === "tv") &&
        ALL_REACTIONS.includes((entry as StoredReaction).reaction) &&
        reactionTimestamp((entry as StoredReaction).createdAt) >= minimumTimestamp
    );
  } catch {
    return [];
  }
}

function writeRecentReactionCache(userId: string, reactions: StoredReaction[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      `${REACTION_CACHE_KEY_PREFIX}${userId}`,
      JSON.stringify(reactions.slice(0, 100))
    );
  } catch {
    // Un navegador en modo privado puede no permitir storage; Supabase sigue funcionando igual.
  }
}

function mergeStoredReactions(...lists: StoredReaction[][]) {
  const latestByTitle = new Map<string, StoredReaction>();

  lists.flat().forEach((entry) => {
    const key = reactionKey(entry);
    const current = latestByTitle.get(key);
    if (!current || reactionTimestamp(entry.createdAt) >= reactionTimestamp(current.createdAt)) {
      latestByTitle.set(key, entry);
    }
  });

  return [...latestByTitle.values()];
}

function cacheStoredReaction(userId: string, reaction: StoredReaction) {
  writeRecentReactionCache(
    userId,
    mergeStoredReactions(readRecentReactionCache(userId), [reaction])
  );
}

function removeCachedReaction(
  userId: string,
  item: DiscoveryItem,
  predicate: (reaction: RecommendationReaction) => boolean
) {
  writeRecentReactionCache(
    userId,
    readRecentReactionCache(userId).filter(
      (entry) =>
        !(
          entry.tmdbId === item.id &&
          entry.mediaType === item.mediaType &&
          predicate(entry.reaction)
        )
    )
  );
}

export function getReactionSaveErrorMessage(error: unknown) {
  const details = error as { code?: string; message?: string } | null;

  if (details?.code === "23514") {
    return "No pude guardar tu reacción porque falta actualizar la base de Cinerian.";
  }

  if (details?.code === "42501") {
    return "No pude guardar tu reacción. Volvé a iniciar sesión e intentá otra vez.";
  }

  return "No pude guardar tu reacción. Intentá otra vez.";
}

function notifyReactionsUpdated(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(REACTIONS_UPDATED_EVENT, {
      detail: { userId }
    })
  );
}

export async function fetchStoredReactions(userId: string): Promise<StoredReaction[]> {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  const remoteReactions: StoredReaction[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("media_reactions")
      .select("tmdb_id, media_type, reaction, created_at")
      .eq("user_id", userId)
      .in("reaction", ALL_REACTIONS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + REACTION_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = data ?? [];
    remoteReactions.push(
      ...page.map((entry) => ({
        tmdbId: Number(entry.tmdb_id),
        mediaType: entry.media_type as MediaType,
        reaction: entry.reaction as RecommendationReaction,
        createdAt: (entry.created_at as string | null) ?? null
      }))
    );

    if (page.length < REACTION_PAGE_SIZE) {
      break;
    }

    from += page.length;
  }

  return mergeStoredReactions(remoteReactions, readRecentReactionCache(userId));
}

export async function saveStoredReaction(input: {
  userId: string;
  item: DiscoveryItem;
  reaction: RecommendationReaction;
}) {
  if (!supabase) {
    throw new Error("Supabase no está configurado.");
  }

  const payload = {
    user_id: input.userId,
    tmdb_id: input.item.id,
    media_type: input.item.mediaType,
    reaction: input.reaction,
    created_at: new Date().toISOString()
  };

  const { error: upsertError } = await supabase
    .from("media_reactions")
    .upsert(payload, { onConflict: "user_id,tmdb_id,media_type" });

  // Compatibilidad temporal para instalaciones que todavia no aplicaron el
  // indice unico. La migracion reactions_state_repair.sql vuelve el upsert
  // atomico y elimina este camino alternativo en la practica.
  if (upsertError?.code === "42P10") {
    const { error: deleteError } = await supabase
      .from("media_reactions")
      .delete()
      .eq("user_id", input.userId)
      .eq("tmdb_id", input.item.id)
      .eq("media_type", input.item.mediaType);

    if (deleteError) {
      throw deleteError;
    }

    const { error: insertError } = await supabase.from("media_reactions").insert(payload);
    if (insertError) {
      throw insertError;
    }
  } else if (upsertError) {
    throw upsertError;
  }

  cacheStoredReaction(input.userId, {
    tmdbId: input.item.id,
    mediaType: input.item.mediaType,
    reaction: input.reaction,
    createdAt: payload.created_at
  });

  // La telemetria no es parte de la transaccion de usuario. Si la tabla de
  // eventos tiene RLS pendiente o esta deshabilitada, la reaccion ya guardada
  // debe actualizar la UI y sacar el titulo del mazo igual.
  void trackProductEvent({
    eventName: "reaction_saved",
    userId: input.userId,
    featureKey: "recommendations",
    metadata: {
      tmdbId: input.item.id,
      mediaType: input.item.mediaType,
      reaction: input.reaction
    }
  }).catch(() => undefined);

  notifyReactionsUpdated(input.userId);
}

export type FollowedRatedReaction = {
  userId: string;
  tmdbId: number;
  mediaType: MediaType;
  reaction: RatedReaction;
  createdAt: string | null;
};

export type TitleReactionSummary = {
  likedCount: number;
  superlikedCount: number;
  /** Hasta cinco personas del circulo, ordenadas por su reaccion mas reciente. */
  friends: FollowedRatedReaction[];
};

export type TitleReactionUser = {
  userId: string;
  reaction: RatedReaction;
  createdAt: string | null;
};

/** Trae solo las reacciones que implican haber visto el titulo: son las unicas que puntuan. */
export async function fetchRatedReactionsForUserIds(
  userIds: string[]
): Promise<FollowedRatedReaction[]> {
  if (!supabase || userIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("media_reactions")
    .select("user_id, tmdb_id, media_type, reaction, created_at")
    .in("reaction", RATED_REACTIONS)
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => ({
    userId: entry.user_id as string,
    tmdbId: Number(entry.tmdb_id),
    mediaType: entry.media_type as MediaType,
    reaction: entry.reaction as RatedReaction,
    createdAt: (entry.created_at as string | null) ?? null
  }));
}

/**
 * Resume la senal social de una ficha sin traer el historial completo.
 * Los contadores se calculan en Postgres y la lista se limita al circulo del
 * usuario para que no revele nombres de personas ajenas.
 */
export async function fetchTitleReactionSummary(
  item: Pick<DiscoveryItem, "id" | "mediaType">,
  followingUserIds: string[]
): Promise<TitleReactionSummary> {
  if (!supabase) {
    return { likedCount: 0, superlikedCount: 0, friends: [] };
  }

  const [likedResult, superlikedResult, friendResult] = await Promise.all([
    supabase
      .from("media_reactions")
      .select("id", { count: "exact", head: true })
      .eq("tmdb_id", item.id)
      .eq("media_type", item.mediaType)
      .eq("reaction", "liked"),
    supabase
      .from("media_reactions")
      .select("id", { count: "exact", head: true })
      .eq("tmdb_id", item.id)
      .eq("media_type", item.mediaType)
      .eq("reaction", "superliked"),
    followingUserIds.length
      ? supabase
          .from("media_reactions")
          .select("user_id, tmdb_id, media_type, reaction, created_at")
          .eq("tmdb_id", item.id)
          .eq("media_type", item.mediaType)
          .in("reaction", RATED_REACTIONS)
          .in("user_id", followingUserIds)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          // Veinticinco filas permiten deduplicar instalaciones antiguas antes
          // de mostrar cinco amistades distintas.
          .limit(25)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (likedResult.error) {
    throw likedResult.error;
  }

  if (superlikedResult.error) {
    throw superlikedResult.error;
  }

  if (friendResult.error) {
    throw friendResult.error;
  }

  const friendsByUserId = new Map<string, FollowedRatedReaction>();
  (friendResult.data ?? []).forEach((entry) => {
    const userId = entry.user_id as string;
    if (!friendsByUserId.has(userId) && isRatedReaction(entry.reaction as RecommendationReaction)) {
      friendsByUserId.set(userId, {
        userId,
        tmdbId: Number(entry.tmdb_id),
        mediaType: entry.media_type as MediaType,
        reaction: entry.reaction as RatedReaction,
        createdAt: (entry.created_at as string | null) ?? null
      });
    }
  });

  return {
    likedCount: likedResult.count ?? 0,
    superlikedCount: superlikedResult.count ?? 0,
    friends: [...friendsByUserId.values()].slice(0, 5)
  };
}

/**
 * Devuelve una pagina estable de personas que reaccionaron al titulo. La UI
 * carga paginas sucesivas para no depender del maximo de filas de PostgREST.
 */
export async function fetchTitleReactionUsers(
  item: Pick<DiscoveryItem, "id" | "mediaType">,
  reaction: Extract<RatedReaction, "liked" | "superliked">,
  offset = 0,
  limit = 40
): Promise<TitleReactionUser[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("media_reactions")
    .select("user_id, reaction, created_at")
    .eq("tmdb_id", item.id)
    .eq("media_type", item.mediaType)
    .eq("reaction", reaction)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => ({
    userId: entry.user_id as string,
    reaction: entry.reaction as RatedReaction,
    createdAt: (entry.created_at as string | null) ?? null
  }));
}

export async function removeStoredWatchlist(userId: string, item: DiscoveryItem) {
  return removeStoredReaction(userId, item, "watchlist");
}

/** Desmarca un titulo como visto, sin necesitar saber si quedo como 'liked' o 'disliked'. */
export async function removeStoredRatedReaction(userId: string, item: DiscoveryItem) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("media_reactions")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_id", item.id)
    .eq("media_type", item.mediaType)
    .in("reaction", RATED_REACTIONS);

  if (error) {
    throw error;
  }

  removeCachedReaction(userId, item, isRatedReaction);
  notifyReactionsUpdated(userId);
}

export async function removeStoredReaction(
  userId: string,
  item: DiscoveryItem,
  reaction: RecommendationReaction
) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("media_reactions")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_id", item.id)
    .eq("media_type", item.mediaType)
    .eq("reaction", reaction);

  if (error) {
    throw error;
  }

  removeCachedReaction(userId, item, (currentReaction) => currentReaction === reaction);
  notifyReactionsUpdated(userId);
}
