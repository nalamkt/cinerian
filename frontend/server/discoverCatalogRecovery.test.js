import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createServer } from "vite";

function title(id, language = "fr") {
  return { id, title: `Título ${id}`, overview: "Sinopsis disponible", poster_path: "/poster.jpg", original_language: language, vote_average: 8, vote_count: 100, release_date: "2025-01-01" };
}

test("Descubrí usa títulos verificados aunque falle una ficha secundaria y mantiene idioma y plataforma", async () => {
  const originalFetch = globalThis.fetch;
  const vite = await createServer({ envFile: false, define: { "import.meta.env.VITE_TMDB_API_KEY": JSON.stringify("test-key"), "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("") }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.startsWith("/3/discover/movie")) return Response.json({ results: [title(101), title(102, "en"), title(103)] });
    if (url.pathname.startsWith("/3/discover/tv")) return new Response("", { status: 400 });
    if (url.pathname.endsWith("/101")) return Response.json({ ...title(101), genres: [{ id: 18, name: "Drama" }], "watch/providers": { results: { AR: { flatrate: [{ provider_id: 8 }] } } } });
    if (url.pathname.endsWith("/102")) return Response.json({ ...title(102, "en"), genres: [{ id: 18, name: "Drama" }], "watch/providers": { results: { AR: { flatrate: [{ provider_id: 8 }] } } } });
    if (url.pathname.endsWith("/103")) return new Response("", { status: 503 });
    throw new Error(`Solicitud inesperada: ${url.pathname}`);
  };
  try {
    const { fetchSocialRecommendations } = await vite.ssrLoadModule("/src/lib/recommendations.ts");
    const filters = { providerIds: [8], contentType: "all", genreIds: [18], originalLanguages: ["fr"] };
    const results = await fetchSocialRecommendations("test-user", 1, 12, filters, []);
    assert.deepEqual(results.map((entry) => entry.item.id), [101]);
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});

test("TMDB distingue red caída, HTTP definitivo y reintento temporal acotado", async () => {
  const originalFetch = globalThis.fetch;
  const vite = await createServer({ envFile: false, define: { "import.meta.env.VITE_TMDB_API_KEY": JSON.stringify("test-key") }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { fetchTmdbWithRetry, getRecommendationTitlesByPage } = await vite.ssrLoadModule("/src/lib/tmdb.ts");
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return calls === 1 ? new Response("", { status: 503 }) : Response.json({ results: [] }); };
    assert.equal((await fetchTmdbWithRetry("https://example.test/catalog")).status, 200);
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => { calls += 1; return new Response("", { status: 429, headers: { "Retry-After": "30" } }); };
    assert.equal((await fetchTmdbWithRetry("https://example.test/catalog")).status, 429);
    assert.equal(calls, 1);
    globalThis.fetch = async (input) => new URL(input).pathname.endsWith("/discover/movie")
      ? Response.json({ results: [] }) : new Response("", { status: 400 });
    await assert.rejects(getRecommendationTitlesByPage(1), /parcial/);
    globalThis.fetch = async () => { throw new TypeError("network offline"); };
    await assert.rejects(getRecommendationTitlesByPage(1), /catálogo|catalogo/);
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});

test("si ninguna disponibilidad puede verificarse, no ofrece títulos sin validar los filtros", async () => {
  const originalFetch = globalThis.fetch;
  const vite = await createServer({ envFile: false, define: { "import.meta.env.VITE_TMDB_API_KEY": JSON.stringify("test-key"), "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("") }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.startsWith("/3/discover/movie")) return Response.json({ results: [title(201)] });
    if (url.pathname.startsWith("/3/discover/tv")) return Response.json({ results: [] });
    return new Response("", { status: 503 });
  };
  try {
    const { fetchSocialRecommendations } = await vite.ssrLoadModule("/src/lib/recommendations.ts");
    await assert.rejects(fetchSocialRecommendations("test-user", 1, 12, { providerIds: [8], contentType: "all", genreIds: [], originalLanguages: ["fr"] }, []), /verificar/);
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});

test("el error conserva acceso a Filtros y el mazo anterior solo para los mismos filtros", () => {
  const panel = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /entriesScope\?\.startsWith\(`\$\{progressScope\}:`\)/);
  assert.match(panel, /deckLoadError && !hasCompatibleEntries/);
  assert.match(panel, /className="discover-filterbar__button" onClick=\{\(\) => setIsFiltersOpen\(true\)\} aria-label="Abrir filtros"/);
  assert.match(panel, /deckLoadError && hasCompatibleEntries/);
  assert.match(panel, /setDeckReloadKey\(\(value\) => value \+ 1\)/);
});

test("la caché de filtros pertenece a cada cuenta y la región antigua no se convierte en idioma", async () => {
  const originalWindow = globalThis.window;
  const values = new Map([
    ["cinerian:discover-profile-filters:v1:user-a", JSON.stringify({ providerIds: [8], contentType: "series" })],
    ["cinerian:discover-extra-filters:v1:user-a", JSON.stringify({ genreIds: [18], productionRegions: ["us"] })]
  ]);
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  const vite = await createServer({ envFile: false, define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("") }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { fetchDiscoverFilters } = await vite.ssrLoadModule("/src/lib/discoverFilters.ts");
    assert.deepEqual(await fetchDiscoverFilters("user-a"), { providerIds: [8], contentType: "series", genreIds: [18], originalLanguages: [] });
    assert.deepEqual(await fetchDiscoverFilters("user-b"), { providerIds: [], contentType: "all", genreIds: [], originalLanguages: [] });
  } finally {
    globalThis.window = originalWindow;
    await vite.close();
  }
});

test("un fallo remoto conserva los filtros confirmados o impide cargar un mazo sin conocerlos", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const values = new Map([["cinerian:discover-profile-filters:v1:user-a", JSON.stringify({ providerIds: [8], contentType: "movie" })]]);
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, location: { href: "https://cinerian.app/" }, addEventListener: () => {}, removeEventListener: () => {} };
  globalThis.fetch = async () => Response.json({ message: "unavailable" }, { status: 503 });
  const vite = await createServer({ envFile: false, define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://supabase.test"), "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-key") }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { fetchDiscoverFilters } = await vite.ssrLoadModule("/src/lib/discoverFilters.ts");
    assert.deepEqual(await fetchDiscoverFilters("user-a"), { providerIds: [8], contentType: "movie", genreIds: [], originalLanguages: [] });
    await assert.rejects(fetchDiscoverFilters("user-b"));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    await vite.close();
  }
});
