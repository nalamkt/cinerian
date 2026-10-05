import { useAuthTitles } from "../lib/authTitles";

/*
  La ilustracion del acceso en desktop: tres fichas en abanico con su puesto en
  el ranking. Muestra de que se trata la app en vez de pedirle al visitante que
  lea un parrafo.

  En mobile no se dibuja: ahi va AuthPosterWall, porque en 375px los titulos y
  los puntajes de las fichas no se leen.

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

export function AuthShowcase() {
  const titles = useAuthTitles();

  return (
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
  );
}
