import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("la búsqueda obtiene páginas independientes, conserva versión traducida y no duplica títulos", async () => {
  const originalFetch = globalThis.fetch;
  const vite = await createServer({ envFile: false, define: { "import.meta.env.VITE_TMDB_API_KEY": JSON.stringify("test-key") }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  const requested = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const page = Number(url.searchParams.get("page"));
    requested.push(page);
    if (url.pathname.endsWith("/search/person")) return Response.json({ total_pages: 2, results: [{ id: 100 + page, name: `Talento ${page}`, known_for: [] }] });
    return Response.json({ total_pages: 3, results: page === 1
      ? [{ id: 1, media_type: "movie", title: "Hombres X", original_title: "X-Men", release_date: "2000-01-01", genre_ids: [28], popularity: 20 }]
      : [{ id: page, media_type: "tv", name: `X-Men ${page}`, original_name: `X-Men ${page}`, first_air_date: "2020-01-01", genre_ids: [16], popularity: 5 }] });
  };
  try {
    const { searchTitlesPage, searchTalentPage } = await vite.ssrLoadModule("/src/lib/tmdb.ts");
    const first = await searchTitlesPage("X-Men", 1);
    const second = await searchTitlesPage("X-Men", 2);
    const talent = await searchTalentPage("Talento", 2);
    assert.deepEqual(requested, [1, 2, 2]);
    assert.equal(first.totalPages, 3);
    assert.equal(first.items[0].originalTitle, "X-Men");
    assert.deepEqual(second.items[0].genreIds, [16]);
    assert.equal(new Set([...first.items, ...second.items].map((item) => `${item.mediaType}-${item.id}`)).size, 2);
    assert.equal(talent.totalPages, 2);
    assert.equal(talent.items[0].name, "Talento 2");
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});
