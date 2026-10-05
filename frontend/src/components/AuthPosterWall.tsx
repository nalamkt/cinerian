import { useAuthTitles } from "../lib/authTitles";

/*
  El fondo del acceso en mobile, donde el abanico de fichas no entra: en 375px
  los titulos y los puntajes no se leen.

  Seis posters a sangre cubriendo el tercio superior, desenfocados y oscurecidos
  hasta ser una mancha de color. No estan para que se reconozcan las peliculas
  sino para que se entienda de que va la app antes de leer una palabra; si se
  leyeran competirian con el titular que va encima.

  La grilla llena el contenedor exacto con filas fraccionarias y las imagenes
  recortan con object-fit, asi no quedan huecos ni costuras entre las fichas.
*/

const WALL_TILES = 6;

export function AuthPosterWall() {
  const titles = useAuthTitles();

  if (titles.length === 0) {
    return null;
  }

  return (
    <div className="auth-poster-wall" aria-hidden="true">
      <div className="auth-poster-wall__grid">
        {Array.from({ length: WALL_TILES }, (_, index) => {
          const item = titles[index % titles.length];

          return (
            <div className="auth-poster-wall__tile" key={index}>
              <img src={item.posterUrl} alt="" loading="lazy" />
            </div>
          );
        })}
      </div>
      <div className="auth-poster-wall__veil" />
    </div>
  );
}
