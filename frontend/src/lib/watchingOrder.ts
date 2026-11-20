import type { SeriesAiringInfo } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EPISODE_DAYS = 21;
const UPCOMING_EPISODE_DAYS = 21;

function dayNumber(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp / DAY_MS
    : null;
}

export function argentinaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function activeAiringDate(airing: SeriesAiringInfo | null, today: string): string | null {
  if (!airing) return null;
  if (airing.nextEpisodeDateSource !== "tmdb") return null;
  const todayDay = dayNumber(today);
  const lastDay = dayNumber(airing.lastEpisodeDate);
  const nextDay = dayNumber(airing.nextEpisodeDate);
  if (todayDay === null || lastDay === null || nextDay === null) return null;
  if (airing.lastEpisodeSeasonNumber === null || airing.nextEpisodeSeasonNumber === null) return null;
  if (airing.lastEpisodeSeasonNumber !== airing.nextEpisodeSeasonNumber) return null;
  if (airing.lastEpisodeNumber === null || airing.nextEpisodeNumber === null) return null;
  if (airing.nextEpisodeNumber <= airing.lastEpisodeNumber) return null;
  if (lastDay > todayDay || todayDay - lastDay > RECENT_EPISODE_DAYS) return null;
  if (nextDay < todayDay || nextDay - todayDay > UPCOMING_EPISODE_DAYS) return null;
  return airing.nextEpisodeDate;
}

export function upcomingAiringDate(airing: SeriesAiringInfo | null, today: string): string | null {
  if (!airing || airing.nextEpisodeDateSource !== "tmdb") return null;
  const todayDay = dayNumber(today);
  const nextDay = dayNumber(airing.nextEpisodeDate);
  return todayDay !== null && nextDay !== null && nextDay >= todayDay ? airing.nextEpisodeDate : null;
}

export function orderWatchingItems<T extends { entry: { addedAt: string; tmdbId: number }; airing: SeriesAiringInfo | null }>(
  items: T[],
  today: string
): { active: T[]; upcoming: T[]; waiting: T[] } {
  const active: T[] = [];
  const upcoming: T[] = [];
  const waiting: T[] = [];
  for (const item of items) {
    if (activeAiringDate(item.airing, today)) active.push(item);
    else if (upcomingAiringDate(item.airing, today)) upcoming.push(item);
    else waiting.push(item);
  }
  active.sort((left, right) =>
    (activeAiringDate(left.airing, today) ?? "").localeCompare(activeAiringDate(right.airing, today) ?? "") ||
    right.entry.addedAt.localeCompare(left.entry.addedAt) || left.entry.tmdbId - right.entry.tmdbId
  );
  upcoming.sort((left, right) =>
    (upcomingAiringDate(left.airing, today) ?? "").localeCompare(upcomingAiringDate(right.airing, today) ?? "") ||
    left.entry.tmdbId - right.entry.tmdbId
  );
  waiting.sort((left, right) =>
    right.entry.addedAt.localeCompare(left.entry.addedAt) || left.entry.tmdbId - right.entry.tmdbId
  );
  return { active, upcoming, waiting };
}
