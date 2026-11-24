import { useEffect, useRef, useState } from "react";
import { createSearchRequestGate } from "../lib/discoverySearchState";
import { searchTitlesPage } from "../lib/tmdb";
import type { SearchTitle } from "../lib/searchRanking";

type SearchState = { query: string; results: SearchTitle[]; page: number; totalPages: number; isLoading: boolean; isLoadingMore: boolean; error: string | null };
const emptySearch: SearchState = { query: "", results: [], page: 0, totalPages: 0, isLoading: false, isLoadingMore: false, error: null };

export function useDiscovery(query: string) {
  const currentQuery = query.trim();
  const [search, setSearch] = useState<SearchState>(emptySearch);
  const requestGate = useRef(createSearchRequestGate());
  const loadingPageRef = useRef(false);
  const pageControllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, SearchState>());

  useEffect(() => {
    const requestId = requestGate.current.begin();
    loadingPageRef.current = false;
    pageControllerRef.current?.abort();
    pageControllerRef.current = null;
    if (!currentQuery) {
      setSearch(emptySearch);
      return () => requestGate.current.cancel(requestId);
    }

    const cached = cacheRef.current.get(currentQuery);
    if (cached) {
      setSearch(cached);
      return () => requestGate.current.cancel(requestId);
    }

    setSearch({ ...emptySearch, query: currentQuery, isLoading: true });
    const controller = new AbortController();
    void (async () => {
      try {
        const page = await searchTitlesPage(currentQuery, 1, controller.signal);
        if (requestGate.current.isLatest(requestId)) {
          const next = { query: currentQuery, results: page.items, page: 1, totalPages: page.totalPages, isLoading: false, isLoadingMore: false, error: null };
          cacheRef.current.delete(currentQuery);
          cacheRef.current.set(currentQuery, next);
          if (cacheRef.current.size > 10) cacheRef.current.delete(cacheRef.current.keys().next().value!);
          setSearch(next);
        }
      } catch {
        if (requestGate.current.isLatest(requestId)) {
          setSearch({ ...emptySearch, query: currentQuery, error: "No pude traer resultados en este momento." });
        }
      }
    })();

    return () => {
      requestGate.current.cancel(requestId);
      controller.abort();
    };
  }, [currentQuery]);

  async function loadMore() {
    if (loadingPageRef.current || search.query !== currentQuery || search.isLoading || search.isLoadingMore || search.page >= search.totalPages) return;
    loadingPageRef.current = true;
    const requestId = requestGate.current.begin();
    const nextPage = search.page + 1;
    const controller = new AbortController();
    pageControllerRef.current = controller;
    setSearch((current) => ({ ...current, isLoadingMore: true, error: null }));
    try {
      const page = await searchTitlesPage(currentQuery, nextPage, controller.signal);
      if (requestGate.current.isLatest(requestId)) {
        const seen = new Set(search.results.map((item) => `${item.mediaType}-${item.id}`));
        const next = { ...search, results: [...search.results, ...page.items.filter((item) => !seen.has(`${item.mediaType}-${item.id}`))], page: nextPage, totalPages: page.totalPages, isLoadingMore: false, error: null };
        cacheRef.current.set(currentQuery, next);
        setSearch(next);
      }
    } catch {
      if (requestGate.current.isLatest(requestId)) setSearch((current) => ({ ...current, isLoadingMore: false, error: "No pude cargar más resultados. Intentá otra vez." }));
    } finally {
      if (pageControllerRef.current === controller) {
        pageControllerRef.current = null;
        loadingPageRef.current = false;
      }
    }
  }

  if (search.query !== currentQuery) return { ...emptySearch, isLoading: Boolean(currentQuery), partial: false, scannedCount: 0, loadMore };
  return { ...search, partial: search.page < search.totalPages, scannedCount: search.results.length, loadMore };
}
