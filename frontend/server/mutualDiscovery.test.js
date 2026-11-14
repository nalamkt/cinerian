import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { MutualDiscovery, comparableProfiles } = await vite.ssrLoadModule("/src/components/MutualDiscovery.tsx");
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
  assert.deepEqual(comparableProfiles(profiles, "me", [], "").map((profile) => profile.id), ["friend"]);
  assert.deepEqual(comparableProfiles(profiles, "me", [], "priva"), []);
});

test("En común busca por nombre o usuario y prioriza personas seguidas", () => {
  const profiles = [person("a", "Ana"), person("b", "Berta")];
  assert.deepEqual(comparableProfiles(profiles, "me", ["b"], "").map((profile) => profile.id), ["b", "a"]);
  assert.deepEqual(comparableProfiles(profiles, "me", [], "an").map((profile) => profile.id), ["a"]);
});

test("una Watchlist privada no oculta Vistas si su dueño decidió compartirlas", () => {
  const onlyWatched = { ...person("watched", "Cinefila"), visibility_settings: normalizeProfileVisibility({ showWatchlist: false, showWatched: true }) };
  const onlyWatchlist = { ...person("watchlist", "Director"), visibility_settings: normalizeProfileVisibility({ showWatchlist: true, showWatched: false }) };
  const privateProfile = person("private", "Privado", false);
  assert.deepEqual(comparableProfiles([onlyWatched, onlyWatchlist, privateProfile], "me", [], "").map((profile) => profile.id), ["watched", "watchlist"]);
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
    userId: "me", profiles: [person("friend", "Amiga")], followingUserIds: [], onCompare: () => {}, alwaysOpen: true
  }));
  assert.match(html, /Buscar una persona/);
  assert.match(html, /@amiga/);
  assert.doesNotMatch(html, /Elegir persona/);
  assert.match(html, /mutual-discovery--standalone/);
});

test("Viendo hereda el permiso de Mi cuenta, sin requerir otra bandera remota", () => {
  const access = getAccessControl({ session: null, profile: null, enabledFeatureOverrides: ["feed"] });
  assert.equal(access.canAccessView("user"), true);
  assert.equal(access.canAccessView("watching"), true);
  assert.equal(access.canAccessView("watchlist"), true);
  assert.equal(access.canAccessView("mutual"), true);
  assert.equal(access.canAccessView("inbox"), false);
});
