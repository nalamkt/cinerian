import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { readFileSync } from "node:fs";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { MutualDiscovery, PreviewTitles, comparableProfiles } = await vite.ssrLoadModule("/src/components/MutualDiscovery.tsx");
const { buildMutualPreview, sharedWatchlistKeys, sortPeopleByMutualCount } = await vite.ssrLoadModule("/src/lib/mutualWatchlist.ts");
const { getAccessControl } = await vite.ssrLoadModule("/src/lib/access.ts");
const { normalizeProfileVisibility, publicComparisonSections } = await vite.ssrLoadModule("/src/lib/auth.ts");

const person = (id, name, showWatchlist = true) => ({
  id,
  username: name.toLowerCase(),
  display_name: name,
  avatar_url: null,
  visibility_settings: normalizeProfileVisibility({ showWatchlist })
});

test("En común no ofrece el perfil propio ni perfiles con Watchlist privada", () => {
  const profiles = [person("me", "Propio"), person("private", "Privado", false), person("friend", "Amiga")];
  assert.deepEqual(comparableProfiles(profiles, "me", ["friend", "private"], "").map((profile) => profile.id), ["friend"]);
  assert.deepEqual(comparableProfiles(profiles, "me", [], "priva"), []);
});

test("En común muestra por defecto solo seguidos y permite buscar a los demás", () => {
  const profiles = [person("a", "Ana"), person("b", "Berta")];
  assert.deepEqual(comparableProfiles(profiles, "me", ["b"], "").map((profile) => profile.id), ["b"]);
  assert.deepEqual(comparableProfiles(profiles, "me", [], "").map((profile) => profile.id), []);
  assert.deepEqual(comparableProfiles(profiles, "me", [], "an").map((profile) => profile.id), ["a"]);
  assert.deepEqual(comparableProfiles(profiles, "me", ["b"], "an").map((profile) => profile.id), ["a"]);
  assert.deepEqual(comparableProfiles(profiles, "me", ["b"], "  ").map((profile) => profile.id), ["b"]);
});

test("una Watchlist privada no oculta Vistas si su dueño decidió compartirlas", () => {
  const onlyWatched = { ...person("watched", "Cinefila"), visibility_settings: normalizeProfileVisibility({ showWatchlist: false, showWatched: true }) };
  const onlyWatchlist = { ...person("watchlist", "Director"), visibility_settings: normalizeProfileVisibility({ showWatchlist: true, showWatched: false }) };
  const privateProfile = person("private", "Privado", false);
  assert.deepEqual(comparableProfiles([onlyWatched, onlyWatchlist, privateProfile], "me", ["watched", "watchlist", "private"], "").map((profile) => profile.id), ["watched", "watchlist"]);
  assert.deepEqual(comparableProfiles([onlyWatched, onlyWatchlist, privateProfile], "me", [], "cine").map((profile) => profile.id), ["watched"]);
  assert.deepEqual(publicComparisonSections(onlyWatched.visibility_settings), { watched: true, watchlist: false });
  assert.deepEqual(publicComparisonSections(onlyWatchlist.visibility_settings), { watched: false, watchlist: true });
  assert.deepEqual(publicComparisonSections(privateProfile.visibility_settings), { watched: false, watchlist: false });
  assert.equal(normalizeProfileVisibility({ showWatchlist: false }).showWatched, false);
});

test("el acceso en Inicio ofrece una elección voluntaria, sin datos inventados", () => {
  const html = renderToStaticMarkup(createElement(MutualDiscovery, {
    userId: "me", profiles: [], followingUserIds: [], onCompare: () => {}
  }));
  assert.match(html, /¿Qué vemos juntos\?/);
  assert.match(html, /Elegir persona/);
  assert.doesNotMatch(html, /@amiga|@berta/);
});

test("la vista principal muestra búsqueda directa y reutiliza las mismas reglas", () => {
  const html = renderToStaticMarkup(createElement(MutualDiscovery, {
    userId: "me", profiles: [person("friend", "Amiga")], followingUserIds: ["friend"], onCompare: () => {}, alwaysOpen: true
  }));
  assert.match(html, /Buscar una persona/);
  assert.match(html, /Buscando títulos en común/);
  assert.doesNotMatch(html, /Elegir persona/);
  assert.match(html, /mutual-discovery--standalone/);
});

test("sin personas seguidas disponibles invita a buscar sin mostrar perfiles ajenos", () => {
  const html = renderToStaticMarkup(createElement(MutualDiscovery, {
    userId: "me", profiles: [person("other", "Otra persona")], followingUserIds: [], onCompare: () => {}, alwaysOpen: true
  }));
  assert.match(html, /Buscá a cualquier otra persona/);
  assert.doesNotMatch(html, /@otrapersona|mutual-discovery__person-card/);
});

test("ordena personas por coincidencias reales, dejando ceros al final y empatando por nombre", () => {
  const profiles = [person("zero", "Zoe"), person("two-b", "Berta"), person("one", "Camila"), person("two-a", "Ana"), person("zero-a", "Alba")];
  const counts = { "two-b": 2, one: 1, "two-a": 2 };
  assert.deepEqual(sortPeopleByMutualCount(profiles, counts).map((profile) => profile.id), ["two-a", "two-b", "one", "zero-a", "zero"]);
  assert.deepEqual(sortPeopleByMutualCount(profiles.slice().reverse(), counts).map((profile) => profile.id), ["two-a", "two-b", "one", "zero-a", "zero"]);
  assert.deepEqual(sortPeopleByMutualCount([person("a", "Ana"), person("b", "Ana")], {}).map((profile) => profile.id), ["a", "b"]);
});

test("Viendo hereda el permiso de Mi cuenta, sin requerir otra bandera remota", () => {
  const access = getAccessControl({ session: null, profile: null, enabledFeatureOverrides: ["feed"] });
  assert.equal(access.canAccessView("user"), true);
  assert.equal(access.canAccessView("watching"), true);
  assert.equal(access.canAccessView("watchlist"), true);
  assert.equal(access.canAccessView("mutual"), true);
  assert.equal(access.canAccessView("inbox"), false);
});

test("la vista previa usa solo la intersección real, sin duplicados y ordenada por TMDB", () => {
  const own = [1, 2, 3, 4].map((tmdbId) => ({ mediaType: "movie", tmdbId }));
  const other = [3, 2, 3, 4, 9, 1].map((tmdbId) => ({ mediaType: "movie", tmdbId }));
  const keys = sharedWatchlistKeys(own, other);
  assert.deepEqual(keys, ["movie-3", "movie-2", "movie-4", "movie-1"]);
  const titles = new Map([
    ["movie-1", { id: 1, mediaType: "movie", title: "Zorro", score: 8.5, posterUrl: "/1.jpg", year: "2024" }],
    ["movie-2", { id: 2, mediaType: "movie", title: "Amor", score: 8.5, posterUrl: "/2.jpg", year: "2024" }],
    ["movie-3", { id: 3, mediaType: "movie", title: "Menor", score: 7.1, posterUrl: "/3.jpg", year: "2020" }],
    ["movie-4", { id: 4, mediaType: "movie", title: "Mayor", score: 9.1, posterUrl: "/4.jpg", year: "2025" }]
  ]);
  const preview = buildMutualPreview(keys, titles);
  assert.equal(preview.count, 4);
  assert.deepEqual(preview.items.map((item) => item.id), [4, 2, 1]);
  assert.deepEqual(sharedWatchlistKeys(own, [{ mediaType: "tv", tmdbId: 1 }]), []);
});

test("la presentación conserva estado vacío, carga, error y privacidad", () => {
  const render = (props) => renderToStaticMarkup(createElement(PreviewTitles, props));
  assert.match(render({ preview: null, loading: true, error: false, privateWatchlist: false }), /Buscando títulos en común/);
  assert.match(render({ preview: null, loading: false, error: true, privateWatchlist: false }), /No pudimos cargar/);
  assert.match(render({ preview: { count: 0, items: [] }, loading: false, error: false, privateWatchlist: false }), /Todavía no tienen títulos/);
  assert.match(render({ preview: null, loading: false, error: false, privateWatchlist: true }), /no comparte su Watchlist/);
  assert.doesNotMatch(render({ preview: null, loading: false, error: false, privateWatchlist: true }), /póster|TMDB/);
});

test("mobile tiene acordeón nativo y carrusel; Ver más reutiliza la comparación", () => {
  const html = renderToStaticMarkup(createElement(MutualDiscovery, {
    userId: "me", profiles: [person("friend", "Amiga")], followingUserIds: ["friend"], onCompare: () => {}, alwaysOpen: true
  }));
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/components/MutualDiscovery.tsx", import.meta.url), "utf8");
  assert.match(html, /Buscando títulos en común/);
  assert.match(source, /<details className="mutual-discovery__person-accordion">/);
  assert.match(source, /className="mutual-discovery__person-card"/);
  assert.match(source, /sortPeopleByMutualCount\(matches, counts\)/);
  assert.match(source, /onCompare\(\{ userId: person\.id, username: person\.username \}\)/);
  assert.match(styles, /\.mutual-discovery__preview \{ display: flex;[^}]*overflow-x: auto;[^}]*overscroll-behavior-x: contain;/);
  assert.match(styles, /\.mutual-discovery__person-card \{ display: none; \}/);
});

test("En común principal ocupa la vista sin tarjeta exterior y conserva tarjetas individuales", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const panel = styles.match(/\.mutual-panel \{([^}]+)\}/)?.[1] ?? "";
  const standalone = styles.match(/\.mutual-panel \.mutual-discovery \{([^}]+)\}/)?.[1] ?? "";
  const grid = styles.match(/\.mutual-panel \.mutual-discovery__people \{([^}]+)\}/)?.[1] ?? "";
  assert.match(panel, /width: 100%;/);
  assert.doesNotMatch(panel, /max-width|1120px/);
  assert.match(standalone, /border: 0;/);
  assert.match(standalone, /background: none;/);
  assert.match(grid, /repeat\(auto-fill, minmax\(min\(100%, 290px\), 1fr\)\)/);
  assert.match(styles, /\.mutual-discovery__person-card \{[^}]*border: 1px/);
  assert.match(styles, /\.mutual-panel \{ padding: 18px 18px 130px; \}/);
});
