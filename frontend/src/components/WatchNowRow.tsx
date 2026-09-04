import { useEffect, useState } from "react";
import { getWatchOptionsFor, type WatchOptions } from "../lib/tmdb";
import type { DiscoveryItem } from "../types";

type WatchNowRowProps = {
  item: DiscoveryItem;
};

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
export function WatchNowRow({ item }: WatchNowRowProps) {
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

  return (
    <div className="watch-now">
      <p className="watch-now__label">Ver en</p>

      {options.flatrate.map((provider) => (
        <a
          key={provider.id}
          className="watch-now__platform"
          href={provider.url}
          target="_blank"
          rel="noreferrer"
          title={`Buscar ${item.title} en ${provider.name}`}
        >
          {provider.logoUrl ? (
            <img src={provider.logoUrl} alt={provider.name} loading="lazy" />
          ) : (
            <span className="watch-now__fallback">{provider.name.slice(0, 2).toUpperCase()}</span>
          )}
        </a>
      ))}

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
