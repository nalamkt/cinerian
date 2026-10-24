import type { DiscoveryItem } from "../types";

const BASE_SCORE = 7;
const CONFIDENCE_VOTES = 500;

export function weightedTmdbScore(item: Pick<DiscoveryItem, "score" | "voteCount">) {
  const votes = Math.max(0, item.voteCount ?? 0);
  return (votes * item.score + CONFIDENCE_VOTES * BASE_SCORE) / (votes + CONFIDENCE_VOTES);
}

export function compareByWeightedTmdbScore(left: DiscoveryItem, right: DiscoveryItem) {
  return (
    weightedTmdbScore(right) - weightedTmdbScore(left) ||
    right.score - left.score ||
    (right.voteCount ?? 0) - (left.voteCount ?? 0) ||
    left.title.localeCompare(right.title, "es")
  );
}
