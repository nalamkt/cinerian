import { useEffect, useRef, useState } from "react";
import { demoDiscovery } from "../data/demoData";
import { createSearchRequestGate, visibleDiscoverySearch, type DiscoverySearchState } from "../lib/discoverySearchState";
import { searchTitlesByDate } from "../lib/tmdb";

export function useDiscovery(query: string) {
  const currentQuery = query.trim();
  const [search, setSearch] = useState<DiscoverySearchState>({ query: "", results: demoDiscovery, isLoading: false, error: null, partial: false, scannedCount: 0 });
  const requestGate = useRef(createSearchRequestGate());

  useEffect(() => {
    const trimmed = query.trim();

    const requestId = requestGate.current.begin();
    if (!trimmed) {
      setSearch({ query: "", results: demoDiscovery, isLoading: false, error: null, partial: false, scannedCount: 0 });
      return () => requestGate.current.cancel(requestId);
    }

    setSearch({ query: trimmed, results: [], isLoading: true, error: null, partial: false, scannedCount: 0 });
    const timeoutId = window.setTimeout(async () => {
      try {
        const { items, partial, scannedCount } = await searchTitlesByDate(trimmed);
        if (requestGate.current.isLatest(requestId)) {
          setSearch({ query: trimmed, results: items, isLoading: false, error: null, partial, scannedCount });
        }
      } catch {
        if (requestGate.current.isLatest(requestId)) {
          setSearch({ query: trimmed, results: [], isLoading: false, error: "No pude traer resultados en este momento.", partial: false, scannedCount: 0 });
        }
      }
    }, 300);

    return () => {
      requestGate.current.cancel(requestId);
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  return visibleDiscoverySearch(search, currentQuery);
}
