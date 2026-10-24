import { fetchDiscoverFilters } from "./discoverFilters";
import type { StoredReaction } from "./reactions";
import { getSimilarTitles, getTitleAvailability, getTitleById, NO_FILTERS } from "./tmdb";
import { compareByWeightedTmdbScore, weightedTmdbScore } from "./titleRanking";
import type { DiscoveryItem } from "../types";

const MAX_SEEDS_PER_REACTION = 6;
const MAX_ACTIVE_SEEDS = 8;
const MAX_RESULTS = 20;
const MAX_VERIFIED = 40;

type Candidate = {
  item: DiscoveryItem;
  affinity: number;
};

function itemKey(item: { mediaType: string; id?: number; tmdbId?: number }) {
  return `${item.mediaType}-${item.id ?? item.tmdbId}`;
}

function candidateScore(candidate: Candidate) {
  return weightedTmdbScore(candidate.item) + candidate.affinity;
}

export async function fetchForYouTitles(userId: string, reactions: StoredReaction[]): Promise<DiscoveryItem[]> {
  const positive = reactions.filter(
    (entry) => entry.reaction === "superliked" || entry.reaction === "liked"
  );
  if (!positive.length) return [];

  const seedReactions = [
    ...positive.filter((entry) => entry.reaction === "superliked").slice(0, MAX_SEEDS_PER_REACTION),
    ...positive.filter((entry) => entry.reaction === "liked").slice(0, MAX_SEEDS_PER_REACTION)
  ];
  const excluded = new Set(reactions.map(itemKey));
  const filtersPromise = fetchDiscoverFilters(userId).catch(() => NO_FILTERS);
  const seedDetails = await Promise.all(
    seedReactions.map(async (reaction) => {
      const item = await getTitleById(reaction.tmdbId, reaction.mediaType).catch(() => null);
      return item ? { reaction, item } : null;
    })
  );
  const seeds = seedDetails
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      const reactionDifference = Number(right.reaction.reaction === "superliked") - Number(left.reaction.reaction === "superliked");
      return reactionDifference || compareByWeightedTmdbScore(left.item, right.item);
    })
    .slice(0, MAX_ACTIVE_SEEDS);

  const similarBatches = await Promise.all(
    seeds.map(async ({ reaction, item }) => ({
      seed: item,
      reaction: reaction.reaction,
      items: await getSimilarTitles(item.id, item.mediaType, 20).catch(() => [])
    }))
  );

  const candidates = new Map<string, Candidate>();
  for (const batch of similarBatches) {
    const enthusiasm = batch.reaction === "superliked" ? 2.2 : 1;
    const seedQuality = Math.max(0.75, Math.min(1.25, weightedTmdbScore(batch.seed) / 7.5));
    for (const item of batch.items) {
      const key = itemKey(item);
      if (excluded.has(key)) continue;
      const current = candidates.get(key);
      if (current) {
        current.affinity += enthusiasm * seedQuality;
      } else {
        candidates.set(key, { item, affinity: enthusiasm * seedQuality });
      }
    }
  }

  const filters = await filtersPromise;
  const ranked = [...candidates.values()].sort(
    (left, right) => candidateScore(right) - candidateScore(left) || compareByWeightedTmdbScore(left.item, right.item)
  );
  const available: Array<Candidate & { preferred: boolean }> = [];

  for (let offset = 0; offset < ranked.length && available.length < MAX_VERIFIED; offset += 8) {
    const batch = await Promise.all(
      ranked.slice(offset, offset + 8).map(async (candidate) => {
        const availability = await getTitleAvailability(candidate.item.id, candidate.item.mediaType);
        if (!availability?.providerIds.length) return null;
        return {
          ...candidate,
          item: availability.item,
          preferred: availability.providerIds.some((id) => filters.providerIds.includes(id))
        };
      })
    );
    available.push(...batch.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
  }

  return available
    .sort((left, right) =>
      candidateScore(right) + Number(right.preferred) * 0.7 -
      (candidateScore(left) + Number(left.preferred) * 0.7) ||
      compareByWeightedTmdbScore(left.item, right.item)
    )
    .slice(0, MAX_RESULTS)
    .map(({ item }) => item);
}

export async function fetchSavedTitleSuggestions(
  userId: string,
  item: Pick<DiscoveryItem, "id" | "mediaType">,
  reactions: StoredReaction[]
): Promise<DiscoveryItem[]> {
  const [similar, filters] = await Promise.all([
    getSimilarTitles(item.id, item.mediaType, 20),
    fetchDiscoverFilters(userId).catch(() => NO_FILTERS)
  ]);
  const excluded = new Set(reactions.map(itemKey));
  excluded.add(itemKey(item));

  const candidates = similar
    .filter((candidate) => !excluded.has(itemKey(candidate)))
    .sort(compareByWeightedTmdbScore);
  const available: Array<{ item: DiscoveryItem; preferred: boolean }> = [];

  for (let offset = 0; offset < candidates.length && available.length < 10; offset += 6) {
    const batch = await Promise.all(
      candidates.slice(offset, offset + 6).map(async (candidate) => {
        const availability = await getTitleAvailability(candidate.id, candidate.mediaType);
        if (!availability?.providerIds.length) return null;
        return {
          item: availability.item,
          preferred: availability.providerIds.some((id) => filters.providerIds.includes(id))
        };
      })
    );
    available.push(...batch.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
  }

  return available
    .sort((left, right) => Number(right.preferred) - Number(left.preferred) || compareByWeightedTmdbScore(left.item, right.item))
    .slice(0, 10)
    .map(({ item: candidate }) => candidate);
}
