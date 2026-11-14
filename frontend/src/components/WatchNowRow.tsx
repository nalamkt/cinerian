import { useEffect, useState } from "react";
import { getWatchOptionsFor, type WatchOptions, type WatchProvider } from "../lib/tmdb";
import type { DiscoveryItem } from "../types";

type WatchNowRowProps = {
  item: DiscoveryItem;
  /**
   * provider_id de las plataformas del usuario. Cuando viene, la fila pasa al
   * modo compacto de la Watchlist: una entrada por marca, las del usuario
   * primero y resaltadas, y el resto resumido en "+N".
   */
  preferredProviderIds?: number[];
  /** Cuantos logos mostrar en modo compacto antes del "+N". */
  limit?: number;
};

/** Cuantos logos entran antes de resumir el resto en "+N". */
const COMPACT_LIMIT = 3;

/**
 * TMDB lista la misma marca varias veces ("Apple TV+" y "Apple TV Plus Amazon
 * Channel", "Netflix" y "Netflix Standard with Ads"). En una tarjeta chica eso
 * se lee como un logo repetido, asi que las agrupamos por marca.
 */
export function providerBrandKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+plus\b/g, "+")
    .replace(/\s*(amazon channel|apple tv channel|standard with ads|basic with ads|with ads)\s*$/g, "")
    .trim();
}

function groupByBrand(providers: WatchProvider[], preferred: Set<number>) {
  const groups = new Map<string, { provider: WatchProvider; isMine: boolean }>();

  providers.forEach((provider) => {
    const key = providerBrandKey(provider.name);
    const isMine = preferred.has(provider.id);
    const current = groups.get(key);

    // Dentro de una marca gana la variante que el usuario tiene contratada.
    if (!current || (isMine && !current.isMine)) {
      groups.set(key, { provider, isMine });
    }
  });

  return Array.from(groups.values()).sort(
    (left, right) => Number(right.isMine) - Number(left.isMine)
  );
}

/**
 * Donde ver un titulo, con los logos reales de cada plataforma.
 *
 * Cada logo abre esa plataforma en una pestaña nueva. Ojo: no cae en la ficha
 * exacta sino en su buscador con el titulo cargado, porque TMDB no publica
 * enlaces profundos por servicio (ver buildProviderUrl en lib/tmdb).
 *
 * El alquiler aparece solo cuando NO hay ninguna plataforma por suscripcion:
 * en una tarjeta chica, si ya mostramos donde verla incluida, sumar "Alquilar"
 * es ruido.
 */
export function WatchNowRow({ item, preferredProviderIds, limit = COMPACT_LIMIT }: WatchNowRowProps) {
  const [options, setOptions] = useState<WatchOptions | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getWatchOptionsFor(item.id, item.mediaType, item.title).then((result) => {
      if (isMounted) {
        setOptions(result);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [item.id, item.mediaType, item.title]);

  if (!options) {
    return null;
  }

  const showRent = options.flatrate.length === 0 && options.hasRentOrBuy && options.link;

  if (!options.flatrate.length && !showRent) {
    return null;
  }

  const isCompact = preferredProviderIds !== undefined;
  const entries = isCompact
    ? groupByBrand(options.flatrate, new Set(preferredProviderIds))
    : options.flatrate.map((provider) => ({ provider, isMine: false }));
  const visible = isCompact ? entries.slice(0, limit) : entries;
  const hidden = isCompact ? entries.slice(limit) : [];

  return (
    <div className="watch-now">
      <p className="watch-now__label">Ver en</p>

      {visible.map(({ provider, isMine }) => (
        <a
          key={provider.id}
          className={`watch-now__platform ${isMine ? "is-mine" : ""}`}
          href={provider.url}
          target="_blank"
          rel="noreferrer"
          title={
            isMine
              ? `${provider.name}: incluida en tus plataformas`
              : `Buscar ${item.title} en ${provider.name}`
          }
        >
          {provider.logoUrl ? (
            <img src={provider.logoUrl} alt={provider.name} loading="lazy" />
          ) : (
            <span className="watch-now__fallback">{provider.name.slice(0, 2).toUpperCase()}</span>
          )}
        </a>
      ))}

      {hidden.length ? (
        <a
          className="watch-now__platform watch-now__platform--more"
          href={options.link ?? hidden[0].provider.url}
          target="_blank"
          rel="noreferrer"
          title={`También en ${hidden.map((entry) => entry.provider.name).join(", ")}`}
        >
          +{hidden.length}
        </a>
      ) : null}

      {showRent && options.link ? (
        <a
          className="watch-now__platform watch-now__platform--rent"
          href={options.link}
          target="_blank"
          rel="noreferrer"
          title={`Opciones de alquiler para ${item.title}`}
        >
          Alquilar
        </a>
      ) : null}
    </div>
  );
}
