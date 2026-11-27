export type DiscoverMode = "cards" | "trailers";

export function splitTrailerTitleForBadge(title: string): { prefix: string; lastWord: string } {
  const trimmed = title.trim();
  const match = /^([\s\S]*\S)\s+(\S+)$/u.exec(trimmed);
  return match ? { prefix: match[1], lastWord: match[2] } : { prefix: "", lastWord: trimmed };
}

export function shouldFetchMoreTrailerPages(input: {
  scanComplete: boolean;
  unexploredCount: number;
  hasCurrent: boolean;
  page: number;
  maxPages: number;
  failed: boolean;
}) {
  return input.scanComplete && !input.failed && input.page < input.maxPages &&
    (!input.hasCurrent || input.unexploredCount < 3);
}

export function trailerEmptyPhase(input: {
  scanComplete: boolean;
  page: number;
  maxPages: number;
  failed: boolean;
}) {
  if (input.failed) return "error";
  return input.scanComplete && input.page >= input.maxPages ? "limit" : "loading";
}

export function canFinishTrailerJourney(input: {
  scanComplete: boolean;
  page: number;
  maxPages: number;
  pageFailed: boolean;
  scanFailed: boolean;
}) {
  return input.scanComplete && input.page >= input.maxPages && !input.pageFailed && !input.scanFailed;
}

export function trailerAvailability(details: { trailerUrl: string | null; trailerLookupComplete?: boolean } | null): "unknown" | "playable" | "missing" {
  if (!details || (!details.trailerUrl && details.trailerLookupComplete === false)) return "unknown";
  return details.trailerUrl ? "playable" : "missing";
}

export function trailerDragOffset(deltaY: number, hasNeighbor: boolean) {
  return hasNeighbor ? deltaY : deltaY * 0.18;
}

export function completesTrailerSwipe(deltaY: number, elapsedMs: number, height: number, hasNeighbor: boolean) {
  if (!hasNeighbor) return false;
  const distance = Math.abs(deltaY);
  return distance >= Math.max(75, Math.min(height * 0.18, 150)) ||
    (distance >= 35 && distance / Math.max(elapsedMs, 1) >= 0.55);
}

export function shouldOpenTrailerInfo(target: Pick<Element, "closest">, gestureSuppressed: boolean) {
  return !gestureSuppressed && !target.closest("button, a, input, select, textarea, [role='button'], .discover-overview p:not(.discover-overview__text--clamped)");
}

type TrailerPlaybackState = {
  active: boolean;
  documentVisible: boolean;
  mode: DiscoverMode;
  detailsOpen: boolean;
  reviewOpen: boolean;
  filtersOpen: boolean;
  syncing: boolean;
};

export function shouldPlayDiscoverTrailer(state: TrailerPlaybackState) {
  return state.active && state.documentVisible && state.mode === "trailers" &&
    !state.detailsOpen && !state.reviewOpen && !state.filtersOpen && !state.syncing;
}

export function moveTrailerCursor<T>(input: {
  available: T[];
  history: T[];
  index: number | null;
  current: T | null;
  direction: "next" | "previous";
  key: (item: T) => string;
}): { history: T[]; index: number } | null {
  const { available, current, direction, key } = input;
  const history = input.history.length ? input.history : current ? [current] : [];
  if (!history.length) return null;
  const index = input.index ?? 0;

  if (direction === "previous") {
    return index > 0 ? { history, index: index - 1 } : null;
  }
  if (index < history.length - 1) return { history, index: index + 1 };

  const seen = new Set(history.map(key));
  const next = available.find((item) => !seen.has(key(item)));
  return next ? { history: [...history, next], index: history.length } : null;
}

// Cuadro del propio tráiler (no el póster): 4:3 con franjas negras, se recorta con object-fit: cover.
export function youtubeThumbnailUrl(trailerUrl: string | null | undefined) {
  if (!trailerUrl) return null;
  try {
    const source = new URL(trailerUrl);
    const match = source.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)$/);
    if (source.origin !== "https://www.youtube.com" || !match) return null;
    return `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`;
  } catch {
    return null;
  }
}

/*
  Puesto que se muestra: la posición entre los títulos del ranking que quedan
  por ver, sin huecos. Los ya pasados en sesiones anteriores no cuentan, así
  el primero que aparece con tus filtros es siempre el 1°. El relleno (sin
  puesto en el ranking) no se numera.
*/
export function remainingRanks<T>(
  entries: T[],
  key: (entry: T) => string,
  isRanked: (entry: T) => boolean,
  hiddenKeys: ReadonlySet<string>
) {
  const ranks = new Map<string, number>();
  let next = 1;
  for (const entry of entries) {
    if (!isRanked(entry)) continue;
    const entryKey = key(entry);
    if (hiddenKeys.has(entryKey) || ranks.has(entryKey)) continue;
    ranks.set(entryKey, next);
    next += 1;
  }
  return ranks;
}
