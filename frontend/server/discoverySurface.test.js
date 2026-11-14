import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { MAIN_NAV_ITEMS, MOBILE_NAV_ITEMS, requestedApbView, resolveApbView } from "../src/lib/apbNavigation.ts";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { DiscoverySurface } = await vite.ssrLoadModule("/src/components/DiscoverySurface.tsx");

function render(showDeck) {
  return renderToStaticMarkup(createElement(DiscoverySurface, {
    search: createElement("div", { "data-testid": "results" }, "Búsqueda y resultados"),
    deck: createElement("div", { "data-testid": "deck" }, "Filtros y tarjeta actual"),
    showDeck
  }));
}

test("escribir sustituye las tarjetas sin desmontar el mazo; limpiar lo restaura", () => {
  const before = render(true);
  const searching = render(false);
  const after = render(true);

  assert.match(before, /<div class="discover-hub__deck"><div data-testid="deck">Filtros y tarjeta actual<\/div><\/div>/);
  assert.match(searching, /<div class="discover-hub__deck" hidden=""><div data-testid="deck">Filtros y tarjeta actual<\/div><\/div>/);
  assert.match(searching, /data-testid="results"/);
  assert.equal(after, before);
});

test("Buscar antiguo se abre en Descubrí sin habilitar funciones bloqueadas", () => {
  assert.equal(resolveApbView("search", true, true), "recommendations");
  assert.equal(resolveApbView("search", true, false), "recommendations");
  assert.equal(resolveApbView("search", false, true), "recommendations");
  assert.equal(resolveApbView("search", false, false), null);
  assert.equal(resolveApbView("inbox", false, false), "inbox");
});

test("la navegación principal conserva cuatro destinos; Inicio e Inbox siguen accesibles fuera del dock", () => {
  assert.deepEqual(MAIN_NAV_ITEMS.map(({ id }) => id), ["recommendations", "mutual", "watching", "watchlist"]);
  assert.deepEqual(MOBILE_NAV_ITEMS.map(({ id }) => id), ["recommendations", "mutual", "watching", "watchlist", "user"]);
  assert.equal(resolveApbView("inbox", true, true), "inbox");
  assert.equal(resolveApbView("feed", true, true), "feed");
  assert.equal(resolveApbView("mutual", true, true), "mutual");
  assert.equal(resolveApbView("search", true, true), "recommendations");
});

test("enlaces antiguos de Inbox y Viendo conservan su destino", () => {
  assert.equal(requestedApbView("?view=inbox"), "inbox");
  assert.equal(requestedApbView("?tab=watching"), "watching");
  assert.equal(requestedApbView("?view=user&tab=watching"), "watching");
  assert.equal(requestedApbView("?view=invalid&tab=watching"), null);
  assert.equal(requestedApbView("?view=watchlist"), "watchlist");
  assert.equal(requestedApbView("?view=user&tab=watchlist"), "watchlist");
  assert.equal(requestedApbView("?tab=watchlist"), "watchlist");
  assert.equal(requestedApbView("?view=user"), "user");
});

test("el campo integrado busca sin exigir una categoría previa", async () => {
  const { SearchPanel } = await vite.ssrLoadModule("/src/components/SearchPanel.tsx");
  const { MediaDetailsProvider } = await vite.ssrLoadModule("/src/components/MediaDetailsModal.tsx");
  const html = renderToStaticMarkup(createElement(MediaDetailsProvider, { userId: "test-user" },
    createElement(SearchPanel, {
      userId: "test-user",
      query: "Neagley",
      onQueryChange: () => {},
      isBrowsing: false,
      canDiscover: true,
      onToggleBrowse: () => {},
      onOpenUserProfile: () => {}
    })
  ));
  assert.match(html, /Buscar películas, series, usuarios o actores/);
  assert.match(html, /Buscando títulos y talentos/);
  assert.doesNotMatch(html, /role="tablist"/);
});

test("la búsqueda global reutiliza los resultados de Descubrí sin duplicar el campo", async () => {
  const { SearchPanel } = await vite.ssrLoadModule("/src/components/SearchPanel.tsx");
  const { MediaDetailsProvider } = await vite.ssrLoadModule("/src/components/MediaDetailsModal.tsx");
  const html = renderToStaticMarkup(createElement(MediaDetailsProvider, { userId: "test-user" },
    createElement(SearchPanel, {
      userId: "test-user", query: "Neagley", onQueryChange: () => {}, isBrowsing: false,
      canDiscover: true, onToggleBrowse: () => {}, onOpenUserProfile: () => {}, showInput: false
    })
  ));
  assert.doesNotMatch(html, /aria-label="Buscar películas, series, usuarios o actores"/);
  assert.match(html, /Buscando títulos y talentos/);
});
