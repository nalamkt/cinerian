import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { InboxCategoryTabs, InboxCommentList } = await vite.ssrLoadModule("/src/components/InboxActivity.tsx");

test("la bandeja distingue conversaciones y comentarios pendientes", () => {
  const html = renderToStaticMarkup(createElement(InboxCategoryTabs, {
    category: "recommendations", recommendationCount: 2, commentCount: 3, onChange: () => {}
  }));
  assert.match(html, /Conversaciones · 2/);
  assert.match(html, /Comentarios · 3/);
  assert.match(html, /aria-pressed="true"/);
});

test("cada comentario pendiente tiene acceso a su publicación y acciones de gestión", () => {
  const html = renderToStaticMarkup(createElement(InboxCommentList, {
    notifications: [{ id: "comment-1", actorProfile: { display_name: "Ana" }, body: "Me gustó", postBody: "Película", createdAt: "2026-11-13T12:00:00Z", createdAtLabel: "Hoy", readAt: null }],
    query: "", onQueryChange: () => {}, pendingId: null, onOpen: () => {}, onToggleRead: () => {}, onDismiss: () => {}
  }));
  assert.match(html, /Ana comentó tu publicación/);
  assert.match(html, /Me gustó/);
  assert.match(html, /Ver publicación/);
  assert.match(html, /Marcar leído/);
  assert.match(html, /Descartar/);
});

test("sin comentarios no inventa avisos", () => {
  const html = renderToStaticMarkup(createElement(InboxCommentList, {
    notifications: [], query: "", onQueryChange: () => {}, pendingId: null, onOpen: () => {}, onToggleRead: () => {}, onDismiss: () => {}
  }));
  assert.match(html, /Todavía no tenés comentarios/);
  assert.doesNotMatch(html, /comentó tu publicación/);
});
