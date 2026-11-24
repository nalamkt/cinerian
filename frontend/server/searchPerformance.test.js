import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createServer } from "vite";
import { scheduleSearchCommit } from "../src/lib/searchInputTiming.ts";

test("la escritura no confirma términos intermedios y conserva el último", async () => {
  const committed = [];
  let cancel = scheduleSearchCommit("X", (query) => committed.push(query));
  cancel();
  cancel = scheduleSearchCommit("X-", (query) => committed.push(query));
  cancel();
  scheduleSearchCommit("X-Men", (query) => committed.push(query));
  assert.deepEqual(committed, []);
  await new Promise((resolve) => setTimeout(resolve, 330));
  assert.deepEqual(committed, ["X-Men"]);
});

test("al cerrar o cambiar de búsqueda se cancela la confirmación pendiente", async () => {
  const committed = [];
  const cancel = scheduleSearchCommit("anterior", (query) => committed.push(query));
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 330));
  assert.deepEqual(committed, []);
});

test("el input inmediato está aislado del estado de App y la consulta usa cancelación y caché acotada", () => {
  const panel = readFileSync(new URL("../src/components/SearchPanel.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../src/hooks/useDiscovery.ts", import.meta.url), "utf8");
  assert.match(panel, /value=\{draft\}/);
  assert.match(panel, /onChange=\{\(event\) => setDraft\(event\.target\.value\)\}/);
  assert.match(panel, /scheduleSearchCommit\(draft/);
  assert.match(panel, /if \(isComposing \|\| draft === query\) return/);
  assert.match(panel, /onCompositionEnd=/);
  assert.match(hook, /new AbortController\(\)/);
  assert.match(hook, /cacheRef\.current\.get\(currentQuery\)/);
  assert.match(hook, /cacheRef\.current\.size > 10/);
});

test("las consultas TMDB aceptan una señal de cancelación", async () => {
  const originalFetch = globalThis.fetch;
  const vite = await createServer({ envFile: false, define: { "import.meta.env.VITE_TMDB_API_KEY": JSON.stringify("test-key") }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  const signals = [];
  globalThis.fetch = async (_input, options) => {
    signals.push(options?.signal);
    return Response.json({ total_pages: 1, results: [] });
  };
  try {
    const { searchTitlesPage, searchTalentPage } = await vite.ssrLoadModule("/src/lib/tmdb.ts");
    const titleController = new AbortController();
    const talentController = new AbortController();
    await searchTitlesPage("película", 1, titleController.signal);
    await searchTalentPage("actor", 1, talentController.signal);
    assert.deepEqual(signals, [titleController.signal, talentController.signal]);
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});
