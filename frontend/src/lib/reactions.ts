import { supabase } from "./supabase";
import type { DiscoveryItem, MediaType } from "../types";

export const REACTIONS_UPDATED_EVENT = "cinerian:reactions-updated";

// Un titulo esta siempre en exactamente UNO de estos estados por usuario:
// vista con pulgar arriba, vista con pulgar abajo, guardada, o pasada de largo.
export type RecommendationReaction = "liked" | "disliked" | "watchlist" | "ignored";

// Las dos que implican haberla visto (las unicas que puntuan en el recomendador).
export const RATED_REACTIONS = ["liked", "disliked"] as const;

const ALL_REACTIONS: RecommendationReaction[] = ["liked", "disliked", "watchlist", "ignored"];

export type StoredReaction = {
  tmdbId: number;
  mediaType: MediaType;
  reaction: RecommendationReaction;
};

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
    return [];
  }

  const { data, error } = await supabase
    .from("media_reactions")
    .select("tmdb_id, media_type, reaction")
    .eq("user_id", userId)
    .in("reaction", ALL_REACTIONS);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => ({
    tmdbId: Number(entry.tmdb_id),
    mediaType: entry.media_type as MediaType,
    reaction: entry.reaction as RecommendationReaction
  }));
}

export async function saveStoredReaction(input: {
  userId: string;
  item: DiscoveryItem;
  reaction: RecommendationReaction;
}) {
  if (!supabase) {
    return;
  }

  let deleteQuery = supabase
    .from("media_reactions")
    .delete()
    .eq("user_id", input.userId)
    .eq("tmdb_id", input.item.id)
    .eq("media_type", input.item.mediaType);

  deleteQuery = deleteQuery.in("reaction", ALL_REACTIONS);

  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    throw deleteError;
  }

  const { error: insertError } = await supabase.from("media_reactions").insert({
    user_id: input.userId,
    tmdb_id: input.item.id,
    media_type: input.item.mediaType,
    reaction: input.reaction
  });

  if (insertError) {
    throw insertError;
  }

  notifyReactionsUpdated(input.userId);
}

export type FollowedRatedReaction = {
  userId: string;
  tmdbId: number;
  mediaType: MediaType;
  reaction: "liked" | "disliked";
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
    .select("user_id, tmdb_id, media_type, reaction")
    .in("reaction", RATED_REACTIONS)
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => ({
    userId: entry.user_id as string,
    tmdbId: Number(entry.tmdb_id),
    mediaType: entry.media_type as MediaType,
    reaction: entry.reaction as "liked" | "disliked"
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

  notifyReactionsUpdated(userId);
}
