import { useEffect, useState } from "react";
import { getTrendingTitles } from "../lib/tmdb";
import type { DiscoveryItem } from "../types";

/*
  La ilustracion del acceso, en dos formas que salen del mismo fetch.

  En desktop, tres fichas en abanico con su puesto en el ranking: muestra de que
  se trata la app en vez de pedirle al visitante que lea un parrafo.

  En mobile el abanico no entra (en 375px los titulos y los puntajes no se leen)
  y antes no se dibujaba nada, lo que dejaba el 40% inferior de la pantalla
  vacio. En su lugar va un muro de posters desenfocado detras del logo y el
  titular, que cumple la misma funcion sin pedir que se lea nada.

  Los posters y los puntajes son titulos reales de TMDB; el ranking es un
  ejemplo de como se ve la funcion una vez que entras.
*/

type Slot = {
  rank: number;
  className: string;
};

/*
  El orden del DOM es el orden de pintado: las dos de atras primero, la primera
  arriba de todo.
*/
const SLOTS: Slot[] = [
  { rank: 2, className: "auth-showcase__card auth-showcase__card--left" },
  { rank: 3, className: "auth-showcase__card auth-showcase__card--right" },
  { rank: 1, className: "auth-showcase__card auth-showcase__card--front" }
];

/* Cuatro columnas por tres filas. Si TMDB devuelve menos, se repiten. */
const WALL_TILES = 12;

export function AuthShowcase() {
  const [titles, setTitles] = useState<DiscoveryItem[]>([]);

  useEffect(() => {
    let isActive = true;

    getTrendingTitles()
      .then((items) => {
        if (!isActive) {
          return;
        }

        setTitles(items.filter((item) => Boolean(item.posterUrl)));
      })
      .catch(() => {
        /* El acceso no depende de esto: si TMDB no responde, quedan las fichas vacias. */
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <>
      {/* Solo en mobile: ver .auth-wall en styles.css */}
      <div className="auth-wall" aria-hidden="true">
        {Array.from({ length: WALL_TILES }, (_, index) => {
          const item = titles.length > 0 ? titles[index % titles.length] : null;

          return (
            <div className="auth-wall__tile" key={index}>
              {item ? <img src={item.posterUrl} alt="" loading="lazy" /> : null}
            </div>
          );
        })}
      </div>
      <div className="auth-wall__fade" aria-hidden="true" />

      <div className="auth-showcase" aria-hidden="true">
      <span className="auth-showcase__chip auth-showcase__chip--top">
        <span className="auth-showcase__faces">
          <i />
          <i />
          <i />
        </span>
        Así se ve tu ranking
      </span>

      {SLOTS.map((slot) => {
        const item = titles[slot.rank - 1];

        return (
          <div className={slot.className} key={slot.rank}>
            <span className="auth-showcase__rank">{slot.rank}</span>
            <div className="auth-showcase__art">
              {item ? <img src={item.posterUrl} alt="" loading="lazy" /> : null}
            </div>
            {item ? (
              <div className="auth-showcase__meta">
                <p className="auth-showcase__title">{item.title}</p>
                <p className="auth-showcase__score">
                  <span>★</span> {item.score.toFixed(1)}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}

      <span className="auth-showcase__chip auth-showcase__chip--bottom">
        Según lo que vieron tus amigos
      </span>
      </div>
    </>
  );
}
