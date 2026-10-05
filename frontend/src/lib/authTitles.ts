import { useEffect, useState } from "react";
import { getTrendingTitles } from "./tmdb";
import type { DiscoveryItem } from "../types";

/*
  Un solo fetch compartido por las dos piezas visuales del acceso: el abanico de
  fichas en desktop y el muro de posters en mobile. Los dos se montan juntos, asi
  que sin esto serian dos llamadas a TMDB por la misma lista.
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
