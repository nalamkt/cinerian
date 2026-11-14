import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { createServer } from "vite";

const search = readFileSync(new URL("../src/components/SearchPanel.tsx", import.meta.url), "utf8");
const inbox = readFileSync(new URL("../src/components/InboxPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { isImeConfirmingEnter } = await vite.ssrLoadModule("/src/lib/ime.ts");

test("los resultados tienen un botón de ficha independiente de las reacciones", () => {
  const card = search.slice(search.indexOf("<article\n              className=\"media-card media-card--interactive\""), search.indexOf("</article>", search.indexOf("<article\n              className=\"media-card media-card--interactive\"")));
  assert.match(card, /<button type="button" className="media-card__open" aria-label={`Ver detalles de \$\{item\.title\}`} onClick=\{\(\) => openMediaDetails\(item\)\} \/>/);
  assert.doesNotMatch(card.slice(0, card.indexOf("<button")), /onClick=/);
  assert.match(card, /<div className="action-row">[\s\S]*?handleReaction\(item, "watchlist"\)/);
  assert.match(styles, /\.search-result-section \.media-card__open:focus-visible\s*\{[^}]*outline:/);
  assert.match(styles, /\.search-result-section \.media-card--interactive \.action-row\s*\{[^}]*z-index: 2;/);
});

test("el historial usa dos botones hermanos que permanecen accesibles al tabular", () => {
  const row = search.slice(search.indexOf("<div key={term} className=\"search-panel__recent\">"), search.indexOf("</div>", search.indexOf("<div key={term} className=\"search-panel__recent\">")));
  assert.match(row, /className="search-panel__recent-choice"[\s\S]*?onClick=\{\(\) => onQueryChange\(term\)\}/);
  assert.match(row, /<\/button>\s*<button type="button" aria-label={`Eliminar \$\{term\}`} className="search-panel__recent-remove"/);
  assert.doesNotMatch(row, /role="button"/);
  assert.match(search, /if \(!event\.currentTarget\.contains\(event\.relatedTarget\)\) setIsInputFocused\(false\)/);
  assert.match(styles, /\.search-panel__recent-choice:focus-visible,[\s\S]*?\.search-panel__recent-remove:focus-visible/);
});

test("Enter de composición no envía ni guarda prematuramente en Inbox", () => {
  assert.equal(isImeConfirmingEnter({ isComposing: true, keyCode: 13 }), true);
  assert.equal(isImeConfirmingEnter({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isImeConfirmingEnter({ isComposing: false, keyCode: 13 }), false);
  assert.match(inbox, /event\.key === "Enter" && !event\.shiftKey && !isImeConfirmingEnter\(event\.nativeEvent\)[\s\S]*?handleSaveEdit/);
  assert.match(inbox, /event\.key === "Enter" && !event\.shiftKey && !isImeConfirmingEnter\(event\.nativeEvent\) && replyDraft\.trim\(\) && !isPending[\s\S]*?handleReplySubmit/);
});

test("viewport permite zoom y conserva las áreas seguras", () => {
  const viewport = index.match(/name="viewport"\s+content="([^"]+)"/)?.[1] ?? "";
  assert.match(viewport, /width=device-width/);
  assert.match(viewport, /viewport-fit=cover/);
  assert.doesNotMatch(viewport, /maximum-scale|user-scalable=no/);
});
