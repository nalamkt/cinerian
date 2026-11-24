export type TrailerProgress = {
  visitedKeys: string[];
  currentKey: string | null;
  historyKeys: string[];
};

const VERSION = 1;
const MAX_VISITED = 5000;
const MAX_HISTORY = 100;
const TITLE_KEY = /^(movie|tv)-[1-9]\d*$/;

export const EMPTY_TRAILER_PROGRESS: TrailerProgress = {
  visitedKeys: [], currentKey: null, historyKeys: []
};

export function trailerProgressStorageKey(userId: string, contentType: string, providerIds: number[], genreIds: number[] = [], originalLanguages: string[] = []) {
  const providers = [...providerIds].sort((a, b) => a - b).join(",") || "all";
  const base = `cinerian:trailer-progress:v${VERSION}:${userId}:${contentType}:${providers}`;
  if (!genreIds.length && !originalLanguages.length) return base;
  const genres = `:genres=${[...new Set(genreIds)].sort((a, b) => a - b).join(",") || "all"}`;
  // Conserva el progreso previo de quienes solo habían elegido géneros.
  if (!originalLanguages.length) return `${base}${genres}:regions=all`;
  return `${base}${genres}:languages=${[...new Set(originalLanguages)].sort().join(",")}`;
}

export function parseTrailerProgress(raw: string | null): TrailerProgress {
  if (!raw) return EMPTY_TRAILER_PROGRESS;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== VERSION) return EMPTY_TRAILER_PROGRESS;
    const record = value as Record<string, unknown>;
    const keys = (input: unknown, max: number) => Array.isArray(input)
      ? [...new Set(input.filter((key): key is string => typeof key === "string" && TITLE_KEY.test(key)))].slice(-max)
      : [];
    const currentKey = typeof record.currentKey === "string" && TITLE_KEY.test(record.currentKey) ? record.currentKey : null;
    return {
      visitedKeys: keys(record.visitedKeys, MAX_VISITED),
      currentKey,
      historyKeys: keys(record.historyKeys, MAX_HISTORY)
    };
  } catch {
    return EMPTY_TRAILER_PROGRESS;
  }
}

export function advanceTrailerProgress(progress: TrailerProgress, historyKeys: string[], index: number): TrailerProgress {
  const currentKey = historyKeys[index] ?? null;
  if (!currentKey) return progress;
  const visitedKeys = [...new Set([...progress.visitedKeys, ...historyKeys.slice(0, index)])].slice(-MAX_VISITED);
  return { visitedKeys, currentKey, historyKeys: historyKeys.slice(-MAX_HISTORY) };
}

export function serializeTrailerProgress(progress: TrailerProgress) {
  return JSON.stringify({ version: VERSION, ...progress });
}
