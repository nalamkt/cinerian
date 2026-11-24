import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const hub = readFileSync(new URL("../src/components/DiscoveryHub.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/SearchPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("la lupa abre la pantalla dedicada sin recrear el buscador flotante", () => {
  assert.doesNotMatch(app, /app-global-search-popover|app-topbar__search-inline/);
  assert.match(hub, /showInput=\{isGlobalSearchOpen\}/);
  assert.match(panel, /id="cinerian-global-search"/);
  assert.match(panel, /<h1>Buscar<\/h1>/);
  assert.match(app, /app-shell--search/);
});

test("historial y Catálogo permanecen disponibles internamente pero ocultos", () => {
  assert.match(panel, /showRecents = false/);
  assert.match(panel, /showRecents && !hasQuery && isInputFocused/);
  assert.match(hub, /showBrowseToggle=\{false\}/);
  assert.match(panel, /persistRecentSearches\(userId, next\)/);
});

test("resultados compactos y controles legibles en mobile", () => {
  assert.doesNotMatch(panel, /Mostrando \{scannedCount\}|<h2>Peliculas y series<\/h2>|<p className="section-eyebrow">Titulos<\/p>/);
  assert.match(panel, /<section className="search-result-section" aria-label="Películas y series">/);
  assert.match(styles, /\.app-shell--search \.app-topbar \{ position: relative; top: auto; \}/);
  assert.match(styles, /\.search-panel--dedicated input\[type="checkbox"\]:focus-visible/);
});
