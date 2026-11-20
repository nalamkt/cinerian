import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { passesFilters } = await vite.ssrLoadModule("/src/lib/recommendations.ts");
const { genreIdsForMedia, matchesProductionRegions } = await vite.ssrLoadModule("/src/lib/discoverTaxonomy.ts");
const { trailerProgressStorageKey } = await vite.ssrLoadModule("/src/lib/trailerProgress.ts");
const { DiscoverFiltersModal } = await vite.ssrLoadModule("/src/components/DiscoverFiltersModal.tsx");

const all = { providerIds: [], contentType: "all", genreIds: [], productionRegions: [] };
const movie = { item: { mediaType: "movie" }, providerIds: [8], seriesType: null, genreIds: [28, 53], productionCountries: ["US", "FR"] };
const series = { item: { mediaType: "tv" }, providerIds: [22], seriesType: "Scripted", genreIds: [18, 10759], productionCountries: ["KR"] };

test("sin género ni región conserva el filtro de plataformas y tipo", () => {
  assert.equal(passesFilters(movie, all), true);
  assert.equal(passesFilters(movie, { ...all, providerIds: [22] }), false);
  assert.equal(passesFilters(series, { ...all, contentType: "movie" }), false);
  assert.equal(passesFilters(series, { ...all, contentType: "series" }), true);
});

test("géneros y regiones aplican OR dentro de cada grupo y AND entre grupos", () => {
  assert.equal(passesFilters(movie, { ...all, genreIds: [18, 53], productionRegions: ["japan", "europe"] }), true);
  assert.equal(passesFilters(movie, { ...all, genreIds: [18], productionRegions: ["us", "europe"] }), false);
  assert.equal(passesFilters(movie, { ...all, genreIds: [28], productionRegions: ["japan"] }), false);
  assert.equal(passesFilters(series, { ...all, genreIds: [18], productionRegions: ["south-korea"], providerIds: [22] }), true);
  assert.equal(passesFilters(series, { ...all, genreIds: [18], productionRegions: ["south-korea"], providerIds: [8] }), false);
});

test("una coproducción puede pertenecer a varias regiones y los datos faltantes no se inventan", () => {
  assert.equal(matchesProductionRegions(["US", "FR"], ["us"]), true);
  assert.equal(matchesProductionRegions(["US", "FR"], ["europe"]), true);
  assert.equal(matchesProductionRegions(["JP"], ["rest"]), false);
  assert.equal(matchesProductionRegions(["AU"], ["rest"]), true);
  assert.equal(matchesProductionRegions([], ["rest"]), false);
  assert.equal(passesFilters({ ...movie, productionCountries: [] }, { ...all, productionRegions: ["us"] }), false);
  assert.equal(passesFilters({ ...movie, genreIds: [] }, { ...all, genreIds: [28] }), false);
});

test("los IDs de género se acotan al catálogo oficial de cada medio", () => {
  assert.deepEqual(genreIdsForMedia([28, 10759, 28], "movie"), [28]);
  assert.deepEqual(genreIdsForMedia([28, 10759], "tv"), [10759]);
});

test("cada combinación de filtros conserva un progreso independiente y estable", () => {
  const base = trailerProgressStorageKey("user", "all", [8]);
  assert.equal(base, trailerProgressStorageKey("user", "all", [8], [], []));
  assert.equal(trailerProgressStorageKey("user", "all", [8], [28, 18], ["us", "europe"]),
    trailerProgressStorageKey("user", "all", [8], [18, 28], ["europe", "us"]));
  assert.notEqual(base, trailerProgressStorageKey("user", "all", [8], [28], []));
  assert.notEqual(base, trailerProgressStorageKey("user", "all", [8], [], ["us"]));
});

test("el panel ofrece selección múltiple, limpieza por categoría y limpieza total", () => {
  const html = renderToStaticMarkup(createElement(DiscoverFiltersModal, {
    isOpen: true,
    filters: { ...all, genreIds: [28], productionRegions: ["us"] },
    onClose: () => {}, onApply: () => {}
  }));
  assert.match(html, /<fieldset[^>]*><legend[^>]*>Género<\/legend>/);
  assert.match(html, /<legend[^>]*>Región de producción<\/legend>/);
  assert.match(html, /type="checkbox"[^>]*checked=""/);
  assert.match(html, /Limpiar género|Limpiar región|Limpiar filtros/);
});
