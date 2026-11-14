import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const inbox = readFileSync(new URL("../src/components/InboxPanel.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Descubrí ocupa el viewport visible y reserva el dock una sola vez", () => {
  const mobileDiscover = styles.slice(styles.indexOf(".app-shell--discover {\n    display: flex;"), styles.indexOf("  .admin-nav {", styles.indexOf(".app-shell--discover {\n    display: flex;")));
  assert.match(mobileDiscover, /height: 100dvh;/);
  assert.match(mobileDiscover, /\.workspace-grid \{\s*flex: 1 1 auto;\s*height: auto;\s*min-height: 0;/);
  assert.match(mobileDiscover, /\.workspace-content--recommendations \{[\s\S]*?height: 100%;[\s\S]*?padding-bottom: var\(--mobile-dock-reserve\);/);
  assert.doesNotMatch(mobileDiscover, /height: calc\(100dvh - var\(--mobile-app-top-space\)/);
  assert.match(styles, /\.app-topbar \.dock__items \{ max-width: none; padding: 6px 4px calc\(6px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});

test("el chat conserva el encabezado y desplaza solo los mensajes", () => {
  assert.match(inbox, /const container = messagesContainerRef\.current;\s*if \(container\) container\.scrollTop = container\.scrollHeight;/);
  assert.match(inbox, /className="inbox-thread-view__messages" ref=\{messagesContainerRef\}/);
  assert.doesNotMatch(inbox, /messagesEndRef|scrollIntoView\(\{ block: "end" \}\)|window\.scrollTo\(0, 0\)/);
  assert.match(inbox, /const visibleTop = Math\.round\(viewport\?\.offsetTop \?\? 0\)/);
  assert.match(inbox, /setProperty\("--inbox-viewport-top", `\$\{visibleTop\}px`\)/);
  assert.match(styles, /body\.inbox-mobile-thread-open \.app-shell--immersive \{\s*position: fixed;\s*top: var\(--inbox-viewport-top, 0px\);/);
  assert.match(styles, /\.inbox-thread-view__messages \{\s*flex: 1 1 auto;\s*min-height: 0;[\s\S]*?overflow-y: auto;/);
});

test("la búsqueda mobile evita autozoom sin impedir el zoom manual", () => {
  assert.match(app, /function closeGlobalSearch\(\) \{\s*if \(document\.activeElement instanceof HTMLInputElement && document\.activeElement\.type === "search"\) document\.activeElement\.blur\(\)/);
  assert.match(app, /function handleChangeView\(view: AppView\) \{[\s\S]*?document\.activeElement\.blur\(\)/);
  assert.match(styles, /\.app-topbar__search-slot\.is-open \.app-topbar__search-popover \{ display: flex; position: fixed;[^}]*left: 12px; right: 12px; width: auto;/);
  const viewport = index.match(/name="viewport"\s+content="([^"]+)"/)?.[1] ?? "";
  assert.doesNotMatch(viewport, /maximum-scale|user-scalable=no/);
});
