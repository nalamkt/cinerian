import { supabase } from "./supabase";
import { getTitleById } from "./tmdb";
import type { DiscoveryItem, MediaType } from "../types";

export type TopCinerianEntry = {
  tmdbId: number;
  mediaType: MediaType;
  score: number;
  votes: number;
};

/**
 * Ranking global de Cinerian: agrega puntuaciones de todos los usuarios.
 * Puntos: superliked=2, liked=1, disliked=-1.
 * Requiere la view public.top_cinerian_ranking (ver migracion en el chat).
 */
export async function fetchTopCinerianRanking(limit = 20): Promise<TopCinerianEntry[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("top_cinerian_ranking")
    .select("tmdb_id, media_type, score, votes")
    .limit(limit);

  if (error) {
    console.warn("[topCinerian] no se pudo leer el ranking global", error);
    return [];
  }

  return (data ?? []).map((entry) => ({
    tmdbId: Number(entry.tmdb_id),
    mediaType: entry.media_type as MediaType,
    score: Number(entry.score),
    votes: Number(entry.votes)
  }));
}

export async function fetchTopCinerianTitles(limit = 15): Promise<DiscoveryItem[]> {
  const ranking = await fetchTopCinerianRanking(limit);
  if (!ranking.length) return [];

  const settled = await Promise.allSettled(
    ranking.map((entry) => getTitleById(entry.tmdbId, entry.mediaType))
  );

  return settled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
}
