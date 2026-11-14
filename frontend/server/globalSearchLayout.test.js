import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { shouldCompactGlobalSearch } = await vite.ssrLoadModule("/src/lib/globalSearchLayout.ts");

test("la lupa responde al espacio real medido y vuelve a campo al crecer", () => {
  assert.equal(shouldCompactGlobalSearch(44), true);
  assert.equal(shouldCompactGlobalSearch(184), true);
  assert.equal(shouldCompactGlobalSearch(185), false);
  assert.equal(shouldCompactGlobalSearch(290), false);
});
