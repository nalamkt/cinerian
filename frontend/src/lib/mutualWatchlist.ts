import type { StoredReaction } from "./reactions";
import type { DiscoveryItem, MediaType } from "../types";

type WatchlistTitle = Pick<StoredReaction, "mediaType" | "tmdbId">;

export function watchlistKey(item: WatchlistTitle): string {
  return `${item.mediaType}-${item.tmdbId}`;
}

export function sharedWatchlistKeys(own: WatchlistTitle[], other: WatchlistTitle[]): string[] {
  const ownKeys = new Set(own.map(watchlistKey));
  return [...new Set(other.map(watchlistKey))].filter((key) => ownKeys.has(key));
}

export function sortMutualPreview(items: DiscoveryItem[]): DiscoveryItem[] {
  return [...new Map(items.map((item) => [watchlistKey({ mediaType: item.mediaType, tmdbId: item.id }), item])).values()]
    .sort((left, right) =>
      right.score - left.score ||
      left.title.localeCompare(right.title, "es") ||
      left.mediaType.localeCompare(right.mediaType) ||
      left.id - right.id
    );
}

export function buildMutualPreview(keys: string[], titles: Map<string, DiscoveryItem>): { count: number; items: DiscoveryItem[] } {
  return {
    count: keys.length,
    items: sortMutualPreview(keys.map((key) => titles.get(key)).filter((item): item is DiscoveryItem => Boolean(item)))
  };
}

export function sortPeopleByMutualCount<T extends { id: string; display_name: string; username: string }>(
  people: T[],
  counts: Record<string, number>
): T[] {
  return people.map((person, index) => ({ person, index })).sort((left, right) =>
    (counts[right.person.id] ?? 0) - (counts[left.person.id] ?? 0) ||
    left.person.display_name.localeCompare(right.person.display_name, "es", { sensitivity: "base" }) ||
    left.person.username.localeCompare(right.person.username, "es", { sensitivity: "base" }) ||
    left.index - right.index
  ).map(({ person }) => person);
}

export function parseWatchlistKey(key: string): { mediaType: MediaType; tmdbId: number } | null {
  const match = /^(movie|tv)-(\d+)$/.exec(key);
  return match ? { mediaType: match[1] as MediaType, tmdbId: Number(match[2]) } : null;
}
