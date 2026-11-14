import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { isAppView } from "../src/lib/access.ts";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());

const { AppViewStack } = await vite.ssrLoadModule("/src/components/AppViewStack.tsx");
const panel = (name, content) => createElement("section", { "data-panel": name }, content);
const views = {
  feed: panel("feed", "Inicio"),
  recommendations: panel("recommendations", "consulta: Neagley; resultados: 12; filtros: 11; tarjeta: 7"),
  mutual: panel("mutual", "Personas para comparar"),
  inbox: panel("inbox", "Conversaciones"),
  user: panel("user", "Mi cuenta"),
  profile: panel("profile", "Perfil ajeno")
};

function render(activeView, showProfile, overrides = {}) {
  return renderToStaticMarkup(createElement(AppViewStack, {
    activeView,
    showProfile,
    ...views,
    ...overrides
  }));
}

test("buscar y sus resultados siguen montados al visitar un perfil y volver", () => {
  const before = render("recommendations", false);
  const visiting = render("recommendations", true);
  const afterReturn = render("recommendations", false);

  assert.match(before, /<div><section data-panel="recommendations">consulta: Neagley; resultados: 12; filtros: 11; tarjeta: 7<\/section><\/div>/);
  assert.match(visiting, /<div hidden=""><section data-panel="recommendations">consulta: Neagley; resultados: 12; filtros: 11; tarjeta: 7<\/section><\/div>/);
  assert.match(visiting, /<section data-panel="profile">Perfil ajeno<\/section>/);
  assert.equal(afterReturn, before);
});

test("filtros y posición del mazo permanecen en el árbol al cambiar de vista y abrir perfiles", () => {
  const searching = render("recommendations", false);
  const visiting = render("recommendations", true);
  const discovering = render("recommendations", false);

  for (const html of [searching, visiting, discovering]) {
    assert.match(html, /<section data-panel="recommendations">consulta: Neagley; resultados: 12; filtros: 11; tarjeta: 7<\/section>/);
  }
  assert.match(discovering, /<div><section data-panel="recommendations">consulta: Neagley; resultados: 12; filtros: 11; tarjeta: 7<\/section><\/div>/);
  assert.doesNotMatch(discovering, /data-panel="profile"/);
});

test("las vistas no habilitadas no se montan y los enlaces existentes siguen reconocidos", () => {
  const html = render("feed", false, { recommendations: null, inbox: null });
  assert.doesNotMatch(html, /data-panel="recommendations"|data-panel="inbox"/);
  assert.match(html, /data-panel="feed"/);
  for (const view of ["feed", "search", "recommendations", "mutual", "watching", "watchlist", "inbox", "user"]) {
    assert.equal(isAppView(view), true);
  }
});

test("En común es una vista propia sin desmontar Inicio ni Descubrí", () => {
  const mutual = render("mutual", false);
  const feedAfter = render("feed", false);
  assert.match(mutual, /<div><section data-panel="mutual">Personas para comparar<\/section><\/div>/);
  assert.match(mutual, /<div hidden=""><section data-panel="feed">Inicio<\/section><\/div>/);
  assert.match(mutual, /<div hidden=""><section data-panel="recommendations">consulta: Neagley/);
  assert.match(feedAfter, /<div><section data-panel="feed">Inicio<\/section><\/div>/);
  assert.match(feedAfter, /<div hidden=""><section data-panel="mutual">Personas para comparar<\/section><\/div>/);
});

test("Viendo reutiliza el perfil propio y conserva Descubrí al regresar", () => {
  const discoveringBefore = render("recommendations", false);
  const watching = render("watching", false);
  const discoveringAfter = render("recommendations", false);
  assert.match(watching, /<div><section data-panel="user">Mi cuenta<\/section><\/div>/);
  assert.match(watching, /<div hidden=""><section data-panel="recommendations">consulta: Neagley/);
  assert.equal(discoveringAfter, discoveringBefore);
});

test("Watchlist es una vista propia sin desmontar el mazo ni duplicar el perfil", () => {
  const discoveringBefore = render("recommendations", false);
  const watchlist = render("watchlist", false);
  assert.match(watchlist, /<div><section data-panel="user">Mi cuenta<\/section><\/div>/);
  assert.equal((watchlist.match(/data-panel="user"/g) ?? []).length, 1);
  assert.match(watchlist, /<div hidden=""><section data-panel="recommendations">consulta: Neagley/);
  assert.equal(render("recommendations", false), discoveringBefore);
});
