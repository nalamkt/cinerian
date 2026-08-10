import { useEffect, useState } from "react";
import { getWatchProviders } from "../lib/tmdb";
import type { DiscoveryItem } from "../types";

type TitleCardProps = {
  item: DiscoveryItem;
  onOpenDetails: () => void;
  onRemove?: () => void;
  isRemoving?: boolean;
};

const PROVIDER_STYLES: Record<string, { label: string; color: string }> = {
  Netflix: { label: "N", color: "#a3161c" },
  "Disney Plus": { label: "D+", color: "#0f3a8c" },
  "HBO Max": { label: "H", color: "#5b3fb0" },
  Max: { label: "M", color: "#5b3fb0" },
  "Amazon Prime Video": { label: "P", color: "#1c2f4a" },
  "Star Plus": { label: "S+", color: "#0b1a3a" },
  "Apple TV Plus": { label: "TV", color: "#1a1a1a" },
  "Paramount Plus": { label: "P+", color: "#1a5fd0" }
};

function getProviderStyle(name: string) {
  return PROVIDER_STYLES[name] ?? { label: name.slice(0, 2).toUpperCase(), color: "#3a3f4a" };
}

export function TitleCard({ item, onOpenDetails, onRemove, isRemoving = false }: TitleCardProps) {
  const [providers, setProviders] = useState<string[] | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getWatchProviders(item.id, item.mediaType).then((result) => {
      if (isMounted) {
        setProviders(result);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [item.id, item.mediaType]);

  const primaryProvider = providers?.[0] ?? null;
  const providerStyle = primaryProvider ? getProviderStyle(primaryProvider) : null;

  return (
    <article className="title-card">
      <div className="title-card__poster-wrap">
        <img
          src={item.posterUrl}
          alt={item.title}
          className="title-card__poster"
          onClick={onOpenDetails}
        />

        {item.score > 0 ? (
          <span className="title-card__score">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7-5.4-4.7 7.1-.6z" />
            </svg>
            {item.score.toFixed(1)}
          </span>
        ) : null}

        {onRemove ? (
          <button
            type="button"
            className="title-card__remove"
            onClick={onRemove}
            disabled={isRemoving}
            aria-label={`Quitar ${item.title}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6 18 18" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      <strong className="title-card__title media-linklike" onClick={onOpenDetails}>
        {item.title}
      </strong>
      <span className="title-card__meta">
        {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
      </span>

      {providerStyle ? (
        <button type="button" className="title-card__watch" onClick={onOpenDetails}>
          <span className="title-card__watch-icon" style={{ background: providerStyle.color }}>
            {providerStyle.label}
          </span>
          <span>Ver ahora</span>
        </button>
      ) : null}
    </article>
  );
}
