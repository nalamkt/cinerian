import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { passesFilters } = await vite.ssrLoadModule("/src/lib/recommendations.ts");
const { genreIdsForMedia } = await vite.ssrLoadModule("/src/lib/discoverTaxonomy.ts");
const { matchesOriginalLanguages, normalizeOriginalLanguage, PRIMARY_ORIGINAL_LANGUAGES, visibleOriginalLanguages } = await vite.ssrLoadModule("/src/lib/originalLanguages.ts");
const { trailerProgressStorageKey } = await vite.ssrLoadModule("/src/lib/trailerProgress.ts");
const { DiscoverFiltersModal } = await vite.ssrLoadModule("/src/components/DiscoverFiltersModal.tsx");
const { parseExtraFilters } = await vite.ssrLoadModule("/src/lib/discoverFilters.ts");

const all = { providerIds: [], contentType: "all", genreIds: [], originalLanguages: [] };
const movie = { item: { mediaType: "movie" }, providerIds: [8], seriesType: null, genreIds: [28, 53], originalLanguage: "fr" };
const series = { item: { mediaType: "tv" }, providerIds: [22], seriesType: "Scripted", genreIds: [18, 10759], originalLanguage: "ko" };

test("sin género ni idioma conserva el filtro de plataformas y tipo", () => {
  assert.equal(passesFilters(movie, all), true);
  assert.equal(passesFilters(movie, { ...all, providerIds: [22] }), false);
  assert.equal(passesFilters(series, { ...all, contentType: "movie" }), false);
  assert.equal(passesFilters(series, { ...all, contentType: "series" }), true);
});

test("géneros e idiomas aplican OR dentro de cada grupo y AND entre grupos", () => {
  assert.equal(passesFilters(movie, { ...all, genreIds: [18, 53], originalLanguages: ["ja", "fr"] }), true);
  assert.equal(passesFilters(movie, { ...all, genreIds: [18], originalLanguages: ["fr", "en"] }), false);
  assert.equal(passesFilters(movie, { ...all, genreIds: [28], originalLanguages: ["ja"] }), false);
  assert.equal(passesFilters(series, { ...all, genreIds: [18], originalLanguages: ["ko"], providerIds: [22] }), true);
  assert.equal(passesFilters(series, { ...all, genreIds: [18], originalLanguages: ["ko"], providerIds: [8] }), false);
});

test("el idioma original admite variantes y los datos faltantes no se inventan", () => {
  assert.equal(normalizeOriginalLanguage("pt-BR"), "pt");
  assert.equal(normalizeOriginalLanguage("zh_CN"), "zh");
  assert.equal(matchesOriginalLanguages("pt-BR", ["pt", "en"]), true);
  assert.equal(matchesOriginalLanguages("ko", ["ja"]), false);
  assert.equal(matchesOriginalLanguages(null, ["en"]), false);
  assert.equal(passesFilters({ ...movie, originalLanguage: null }, { ...all, originalLanguages: ["fr"] }), false);
  assert.equal(passesFilters({ ...movie, genreIds: [] }, { ...all, genreIds: [28] }), false);
});

test("Idioma original muestra ocho principales y preserva seleccionados adicionales al contraer", () => {
  assert.deepEqual(PRIMARY_ORIGINAL_LANGUAGES, ["en", "es", "fr", "it", "de", "pt", "ko", "ja"]);
  const catalog = [...PRIMARY_ORIGINAL_LANGUAGES, "zh", "hi", "ar"].map((id) => ({ id, label: id }));
  assert.deepEqual(visibleOriginalLanguages(catalog, [], false).map((item) => item.id), PRIMARY_ORIGINAL_LANGUAGES);
  assert.deepEqual(visibleOriginalLanguages(catalog, ["zh", "ar"], false).map((item) => item.id), [...PRIMARY_ORIGINAL_LANGUAGES, "zh", "ar"]);
  assert.deepEqual(visibleOriginalLanguages(catalog, ["zh"], true).map((item) => item.id), catalog.map((item) => item.id));
  assert.deepEqual(visibleOriginalLanguages(catalog, ["zh"], false).map((item) => item.id), [...PRIMARY_ORIGINAL_LANGUAGES, "zh"]);
  assert.equal(visibleOriginalLanguages(catalog, ["ru"], false).at(-1).id, "ru");
});

test("el panel arranca contraído sin ocultar idiomas adicionales seleccionados", () => {
  const html = renderToStaticMarkup(createElement(DiscoverFiltersModal, {
    isOpen: true,
    filters: { ...all, originalLanguages: ["zh"] },
    onClose: () => {}, onApply: () => {}
  }));
  assert.match(html, /Ver más idiomas/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /-language-zh" type="checkbox" checked=""/);
  assert.doesNotMatch(html, /-language-hi" type="checkbox"/);
});

test("los IDs de género se acotan al catálogo oficial de cada medio", () => {
  assert.deepEqual(genreIdsForMedia([28, 10759, 28], "movie"), [28]);
  assert.deepEqual(genreIdsForMedia([28, 10759], "tv"), [10759]);
});

test("cada combinación de filtros conserva un progreso independiente y estable", () => {
  const base = trailerProgressStorageKey("user", "all", [8]);
  assert.equal(base, trailerProgressStorageKey("user", "all", [8], [], []));
  assert.equal(trailerProgressStorageKey("user", "all", [8], [28, 18], ["fr", "en"]),
    trailerProgressStorageKey("user", "all", [8], [18, 28], ["en", "fr"]));
  assert.notEqual(base, trailerProgressStorageKey("user", "all", [8], [28], []));
  assert.notEqual(base, trailerProgressStorageKey("user", "all", [8], [], ["en"]));
});

test("el panel ofrece selección múltiple, limpieza por categoría y limpieza total", () => {
  const html = renderToStaticMarkup(createElement(DiscoverFiltersModal, {
    isOpen: true,
    filters: { ...all, genreIds: [28], originalLanguages: ["en"] },
    onClose: () => {}, onApply: () => {}
  }));
  assert.match(html, /<fieldset[^>]*><legend[^>]*>Género<\/legend>/);
  assert.match(html, /<legend[^>]*>Idioma original<\/legend>/);
  assert.match(html, /type="checkbox"[^>]*checked=""/);
  assert.match(html, /Limpiar género|Limpiar idioma|Limpiar filtros/);
});

test("preferencias antiguas descartan regiones sin perder géneros", () => {
  assert.deepEqual(parseExtraFilters(JSON.stringify({ genreIds: [28, 99999], productionRegions: ["us"] })), { genreIds: [28], originalLanguages: [] });
  assert.deepEqual(parseExtraFilters(JSON.stringify({ genreIds: [18], originalLanguages: ["pt-BR", "zh_CN", "pt"] })), { genreIds: [18], originalLanguages: ["pt", "zh"] });
});
