type SearchResult = Record<string, unknown>;

export function searchReleaseDate(item: SearchResult): string | null {
  const raw = item.media_type === "tv" ? item.first_air_date : item.release_date;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? raw : null;
}

export function sortSearchResultsByDate<T extends SearchResult>(items: T[]): T[] {
  return items.map((item, index) => ({ item, index, date: searchReleaseDate(item) }))
    .sort((left, right) => {
      if (!left.date) return right.date ? 1 : left.index - right.index;
      if (!right.date) return -1;
      return right.date.localeCompare(left.date) || left.index - right.index;
    })
    .map(({ item }) => item);
}
