import type { DiscoveryItem } from "../types";

export type DiscoverySearchState = {
  query: string;
  results: DiscoveryItem[];
  isLoading: boolean;
  error: string | null;
  partial: boolean;
  scannedCount: number;
};

export function visibleDiscoverySearch(state: DiscoverySearchState, query: string) {
  if (state.query === query.trim()) {
    const { results, isLoading, error, partial, scannedCount } = state;
    return { results, isLoading, error, partial, scannedCount };
  }
  return { results: [], isLoading: Boolean(query.trim()), error: null, partial: false, scannedCount: 0 };
}

export function createSearchRequestGate() {
  let latest = 0;
  return {
    begin: () => ++latest,
    isLatest: (request: number) => request === latest,
    cancel: (request: number) => { if (request === latest) latest += 1; }
  };
}
