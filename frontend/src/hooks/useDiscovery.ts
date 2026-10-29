import { useEffect, useState } from "react";
import { demoDiscovery } from "../data/demoData";
import { searchTitles } from "../lib/tmdb";
import type { DiscoveryItem } from "../types";

export function useDiscovery(query: string) {
  const currentQuery = query.trim();
  const [search, setSearch] = useState<{
    query: string;
    results: DiscoveryItem[];
    isLoading: boolean;
    error: string | null;
  }>({ query: "", results: demoDiscovery, isLoading: false, error: null });

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setSearch({ query: "", results: demoDiscovery, isLoading: false, error: null });
      return;
    }

    let isCurrent = true;
    setSearch({ query: trimmed, results: [], isLoading: true, error: null });
    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchTitles(trimmed);
        if (isCurrent) {
          setSearch({ query: trimmed, results, isLoading: false, error: null });
        }
      } catch {
        if (isCurrent) {
          setSearch({ query: trimmed, results: [], isLoading: false, error: "No pude traer resultados en este momento." });
        }
      }
    }, 300);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  return search.query === currentQuery
    ? { results: search.results, isLoading: search.isLoading, error: search.error }
    : { results: [], isLoading: Boolean(currentQuery), error: null };
}
