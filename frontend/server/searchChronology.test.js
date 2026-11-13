import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { searchReleaseDate, sortSearchResultsByDate } from "../src/lib/searchChronology.ts";

test("ordena versiones de películas y series por estreno descendente", () => {
  const items = [
    { id: 1, media_type: "movie", title: "Versión", release_date: "1990-04-10" },
    { id: 2, media_type: "tv", name: "Versión", first_air_date: "2025-02-01" },
    { id: 3, media_type: "movie", title: "Versión", release_date: "2010-08-20" }
  ];
  assert.deepEqual(sortSearchResultsByDate(items).map((item) => item.id), [2, 3, 1]);
});

test("fechas iguales conservan el orden y las inválidas quedan al final", () => {
  const items = [
    { id: 1, media_type: "movie", release_date: "" },
    { id: 2, media_type: "tv", first_air_date: "2024-03-20" },
    { id: 3, media_type: "movie", release_date: "2024-03-20" },
    { id: 4, media_type: "movie", release_date: "2024-02-30" },
    { id: 5, media_type: "tv", first_air_date: "sin fecha" }
  ];
  assert.deepEqual(sortSearchResultsByDate(items).map((item) => item.id), [2, 3, 1, 4, 5]);
  assert.equal(searchReleaseDate(items[3]), null);
});

test("consulta páginas sucesivas y avisa cuando la clasificación es parcial", async () => {
  const originalFetch = globalThis.fetch;
  const vite = await createServer({
    envFile: false,
    define: { "import.meta.env.VITE_TMDB_API_KEY": JSON.stringify("test-key") },
    server: { middlewareMode: true, hmr: false },
    appType: "custom"
  });
  const requestedPages = [];
  globalThis.fetch = async (input) => {
    const page = Number(new URL(input).searchParams.get("page"));
    requestedPages.push(page);
    return Response.json({ total_pages: 6, results: [{
      id: page, media_type: page % 2 ? "movie" : "tv", title: "Versión",
      release_date: `202${page}-01-01`, first_air_date: `202${page}-01-01`
    }] });
  };
  try {
    const { searchTitlesByDate } = await vite.ssrLoadModule("/src/lib/tmdb.ts");
    const result = await searchTitlesByDate("Versión");
    assert.deepEqual(requestedPages.sort(), [1, 2, 3, 4, 5]);
    assert.deepEqual(result.items.map((item) => item.id), [5, 4, 3, 2, 1]);
    assert.equal(result.partial, true);
    assert.equal(result.scannedCount, 5);
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});
