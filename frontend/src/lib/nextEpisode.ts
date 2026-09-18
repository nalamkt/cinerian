import type { SeasonSummary } from "../types";

export type NextEpisode = {
  seasonNumber: number;
  episodeNumber: number;
  isStart: boolean;
};

// "Siguiente episodio": el mas alto marcado como visto + 1. Si no hay nada visto,
// arranca en la primera temporada regular. Ignora los especiales (season 0).
export function computeNextEpisode(
  showId: number,
  seasons: SeasonSummary[],
  watched: Set<string>
): NextEpisode | null {
  const regular = seasons
    .filter((season) => season.seasonNumber >= 1 && season.episodeCount > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
  if (!regular.length) {
    return null;
  }

  let highest: { seasonNumber: number; episodeNumber: number } | null = null;
  for (const season of regular) {
    for (let ep = 1; ep <= season.episodeCount; ep += 1) {
      if (watched.has(`${showId}:${season.seasonNumber}:${ep}`)) {
        highest = { seasonNumber: season.seasonNumber, episodeNumber: ep };
      }
    }
  }

  if (!highest) {
    return { seasonNumber: regular[0].seasonNumber, episodeNumber: 1, isStart: true };
  }

  const currentSeason = regular.find((season) => season.seasonNumber === highest!.seasonNumber);
  if (currentSeason && highest.episodeNumber < currentSeason.episodeCount) {
    return {
      seasonNumber: highest.seasonNumber,
      episodeNumber: highest.episodeNumber + 1,
      isStart: false
    };
  }

  const nextSeason = regular.find((season) => season.seasonNumber > highest!.seasonNumber);
  if (nextSeason) {
    return { seasonNumber: nextSeason.seasonNumber, episodeNumber: 1, isStart: false };
  }

  return null;
}
