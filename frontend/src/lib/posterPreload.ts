import type { DiscoveryItem } from "../types";

const posterLoads = new Map<string, Promise<void>>();

export function preloadPosters(items: DiscoveryItem[]) {
  if (typeof Image === "undefined") return Promise.resolve();

  return Promise.all(
    items.map((item) => {
      const url = item.posterUrl;
      const cached = posterLoads.get(url);
      if (cached) return cached;

      const pending = new Promise<void>((resolve) => {
        const image = new Image();
        const timeout = window.setTimeout(resolve, 3000);
        image.onload = image.onerror = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        image.src = url;
        if (image.complete) {
          window.clearTimeout(timeout);
          resolve();
        }
      });
      posterLoads.set(url, pending);
      return pending;
    })
  ).then(() => undefined);
}
