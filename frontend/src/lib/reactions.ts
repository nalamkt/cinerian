import { supabase } from "./supabase";
import type { DiscoveryItem, MediaType } from "../types";

export type RecommendationReaction = "liked" | "watched" | "disliked";

export type StoredReaction = {
  tmdbId: number;
  mediaType: MediaType;
  reaction: RecommendationReaction;
  rating?: number | null;
};

export async function fetchStoredReactions(userId: string): Promise<StoredReaction[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("media_reactions")
    .select("tmdb_id, media_type, reaction, rating")
    .eq("user_id", userId)
    .in("reaction", ["liked", "watched", "disliked"]);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => ({
    tmdbId: Number(entry.tmdb_id),
    mediaType: entry.media_type as MediaType,
    reaction: entry.reaction as RecommendationReaction,
    rating: typeof entry.rating === "number" ? entry.rating : null
  }));
}

export async function saveStoredReaction(input: {
  userId: string;
  item: DiscoveryItem;
  reaction: RecommendationReaction;
  rating?: number | null;
}) {
  if (!supabase) {
    return;
  }

  const deleteQuery = supabase
    .from("media_reactions")
    .delete()
    .eq("user_id", input.userId)
    .eq("tmdb_id", input.item.id)
    .eq("media_type", input.item.mediaType)
    .in("reaction", ["liked", "watched", "disliked"]);

  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    throw deleteError;
  }

  const { error: insertError } = await supabase.from("media_reactions").insert({
    user_id: input.userId,
    tmdb_id: input.item.id,
    media_type: input.item.mediaType,
    reaction: input.reaction,
    rating: input.reaction === "watched" ? input.rating ?? null : null
  });

  if (insertError) {
    throw insertError;
  }
}

export async function removeStoredLike(userId: string, item: DiscoveryItem) {
  return removeStoredReaction(userId, item, "liked");
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
}
