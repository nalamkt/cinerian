import { useEffect, useState } from "react";
import { getTrendingTitles } from "./tmdb";
import type { DiscoveryItem } from "../types";

/*
  Los titulos que ilustran el acceso. La promesa queda cacheada a nivel modulo,
  asi remontar el panel no dispara otra llamada a TMDB.
*/
let pending: Promise<DiscoveryItem[]> | null = null;

function loadAuthTitles(): Promise<DiscoveryItem[]> {
  if (!pending) {
    pending = getTrendingTitles()
      .then((items) => items.filter((item) => Boolean(item.posterUrl)))
      .catch(() => {
        /* El acceso no depende de esto: si TMDB no responde, no se dibuja nada. */
        return [];
      });
  }

  return pending;
}

export function useAuthTitles(): DiscoveryItem[] {
  const [titles, setTitles] = useState<DiscoveryItem[]>([]);

  useEffect(() => {
    let isActive = true;

    void loadAuthTitles().then((items) => {
      if (isActive) {
        setTitles(items);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  return titles;
}
