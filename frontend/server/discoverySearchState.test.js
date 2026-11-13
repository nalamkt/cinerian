import assert from "node:assert/strict";
import test from "node:test";
import { createSearchRequestGate, visibleDiscoverySearch } from "../src/lib/discoverySearchState.ts";

const item = { id: 1, title: "Título", releaseDate: "2026-01-01" };

test("búsqueda completa conserva resultados y no muestra aviso parcial", () => {
  assert.deepEqual(visibleDiscoverySearch({
    query: "Título", results: [item], isLoading: false, error: null, partial: false, scannedCount: 1
  }, "Título"), { results: [item], isLoading: false, error: null, partial: false, scannedCount: 1 });
});

test("búsqueda parcial entrega el aviso y la cantidad consultada", () => {
  const visible = visibleDiscoverySearch({
    query: "Título", results: [item], isLoading: false, error: null, partial: true, scannedCount: 100
  }, "Título");
  assert.equal(visible.partial, true);
  assert.equal(visible.scannedCount, 100);
});

test("cambiar la búsqueda limpia resultados, aviso y error anteriores", () => {
  const previous = {
    query: "Anterior", results: [item], isLoading: false, error: "Error anterior", partial: true, scannedCount: 100
  };
  assert.deepEqual(visibleDiscoverySearch(previous, "Nueva"), {
    results: [], isLoading: true, error: null, partial: false, scannedCount: 0
  });
  assert.deepEqual(visibleDiscoverySearch({ ...previous, query: "Nueva", results: [], isLoading: true, error: null, partial: false, scannedCount: 0 }, "Nueva"), {
    results: [], isLoading: true, error: null, partial: false, scannedCount: 0
  });
  assert.deepEqual(visibleDiscoverySearch({ ...previous, query: "Nueva", results: [], isLoading: false, error: "Sin resultados", partial: false, scannedCount: 0 }, "Nueva"), {
    results: [], isLoading: false, error: "Sin resultados", partial: false, scannedCount: 0
  });
});

test("una respuesta asincrónica anterior no reemplaza la búsqueda más reciente", async () => {
  const gate = createSearchRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  const applied = [];
  let resolveFirst;
  let resolveSecond;
  const oldResponse = new Promise((resolve) => { resolveFirst = resolve; }).then(() => {
    if (gate.isLatest(first)) applied.push("anterior");
  });
  const newResponse = new Promise((resolve) => { resolveSecond = resolve; }).then(() => {
    if (gate.isLatest(second)) applied.push("nueva");
  });
  resolveSecond();
  await newResponse;
  resolveFirst();
  await oldResponse;
  assert.deepEqual(applied, ["nueva"]);
  gate.cancel(second);
  assert.equal(gate.isLatest(second), false);
});
