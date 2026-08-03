import { useEffect, useState } from "react";
import { demoDiscovery } from "../data/demoData";
import { searchTitles } from "../lib/tmdb";
import type { DiscoveryItem } from "../types";

export function useDiscovery(query: string) {
  const [results, setResults] = useState<DiscoveryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setResults(demoDiscovery);
      setError(null);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);
        setResults(await searchTitles(trimmed));
      } catch (caughtError) {
        setError("No pude traer resultados en este momento.");
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  return { results, isLoading, error };
}
