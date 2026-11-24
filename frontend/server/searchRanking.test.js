import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { rankSearchTitles, DEFAULT_SEARCH_FILTERS } = await vite.ssrLoadModule("/src/lib/searchRanking.ts");

function title(id, name, options = {}) {
  return { id, mediaType: "movie", title: name, originalTitle: name, popularity: 10, score: 6, voteCount: 10, releaseDate: "2020-01-01", genreIds: [28], ...options };
}

test("coincidencia exacta y título traducido prevalecen sobre popularidad y estrenos futuros", () => {
  const future = title(1, "X-Men: Mañana", { popularity: 500, releaseDate: "2099-01-01" });
  const exact = title(2, "X-Men", { popularity: 5, originalTitle: "X-Men" });
  const translated = title(3, "Hombres X", { originalTitle: "X-Men", popularity: 1 });
  const partial = title(4, "X-Men: El origen", { popularity: 3 });
  assert.deepEqual(rankSearchTitles([future, partial, translated, exact], "X-Men", DEFAULT_SEARCH_FILTERS).map((item) => item.id), [2, 3, 4, 1]);
});

test("categoría, animación, estreno, género y años filtran páginas ya cargadas sin afectar personas", () => {
  const items = [title(1, "A", { genreIds: [16] }), title(2, "B", { releaseDate: "2099-01-01" }), title(3, "C", { releaseDate: "2020-01-01" }), title(4, "D", { mediaType: "tv" })];
  const filters = { ...DEFAULT_SEARCH_FILTERS, category: "movie", excludeAnimation: true, releasedOnly: true, genreIds: [28], yearFrom: "2019", yearTo: "2021" };
  assert.deepEqual(rankSearchTitles(items, "", filters).map((item) => item.id), [3]);
  assert.deepEqual(rankSearchTitles(items, "", { ...filters, category: "people" }), []);
});

test("ordenamientos son estables y no muestran puntajes inexistentes como datos reales", () => {
  const items = [title(1, "A", { score: 0, popularity: 1 }), title(2, "B", { score: 8, popularity: 2 }), title(3, "C", { score: 8, popularity: 2 })];
  assert.deepEqual(rankSearchTitles(items, "", { ...DEFAULT_SEARCH_FILTERS, order: "rating" }).map((item) => item.id), [2, 3, 1]);
  assert.deepEqual(rankSearchTitles(items, "", { ...DEFAULT_SEARCH_FILTERS, order: "popularity" }).map((item) => item.id), [2, 3, 1]);
});

test("coincidencias alternativas que TMDB devuelve conservan su orden cuando no hay título alternativo en la respuesta", () => {
  const first = title(1, "Título alternativo A", { popularity: 1 });
  const second = title(2, "Título alternativo B", { popularity: 100 });
  assert.deepEqual(rankSearchTitles([first, second], "Nombre internacional", DEFAULT_SEARCH_FILTERS).map((item) => item.id), [1, 2]);
});
