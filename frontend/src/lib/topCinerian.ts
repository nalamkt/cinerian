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
  // Pedimos mas entradas de las que vamos a mostrar para que el desempate por
  // score de TMDB tenga margen de maniobra sin que se pierda ninguna posicion.
  const ranking = await fetchTopCinerianRanking(Math.max(limit * 2, 30));
  if (!ranking.length) return [];

  const settled = await Promise.allSettled(
    ranking.map((entry) => getTitleById(entry.tmdbId, entry.mediaType))
  );

  const hydrated = ranking.flatMap((entry, index) => {
    const result = settled[index];
    if (result.status !== "fulfilled" || !result.value) return [];
    return [{ entry, item: result.value }];
  });

  hydrated.sort((a, b) => {
    if (b.entry.score !== a.entry.score) return b.entry.score - a.entry.score;
    if (b.entry.votes !== a.entry.votes) return b.entry.votes - a.entry.votes;
    return (b.item.score ?? 0) - (a.item.score ?? 0);
  });

  return hydrated.slice(0, limit).map(({ item }) => item);
}
