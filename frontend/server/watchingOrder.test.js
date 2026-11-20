import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { activeAiringDate, upcomingAiringDate, argentinaToday, orderWatchingItems } = await vite.ssrLoadModule("/src/lib/watchingOrder.ts");

const airing = (lastDate, nextDate, overrides = {}) => ({
  statusLabel: "En emisión",
  nextEpisodeLabel: "T2E4",
  nextEpisodeDate: nextDate,
  nextEpisodeDateSource: nextDate ? "tmdb" : null,
  nextEpisodeDayLabel: "viernes",
  lastEpisodeDate: lastDate,
  lastEpisodeSeasonNumber: 2,
  lastEpisodeNumber: 3,
  nextEpisodeSeasonNumber: 2,
  nextEpisodeNumber: 4,
  ...overrides
});
const watching = (tmdbId, schedule, addedAt = "2026-11-01") => ({ entry: { tmdbId, addedAt }, airing: schedule });

test("una temporada con episodio reciente y próximo confirmado es activa", () => {
  assert.equal(activeAiringDate(airing("2026-11-13", "2026-11-27"), "2026-11-20"), "2026-11-27");
  assert.equal(activeAiringDate(airing("2026-11-20", "2026-11-20"), "2026-11-20"), "2026-11-20");
  assert.equal(argentinaToday(new Date("2026-11-20T02:00:00Z")), "2026-11-19");
});

test("estado En emisión o fecha futura aislada no bastan para activar una serie", () => {
  assert.equal(activeAiringDate(airing(null, "2026-11-25"), "2026-11-20"), null);
  assert.equal(activeAiringDate(airing("2026-11-13", null), "2026-11-20"), null);
  assert.equal(activeAiringDate(airing("2026-11-13", "2026-11-25", { nextEpisodeSeasonNumber: 3, nextEpisodeNumber: 1 }), "2026-11-20"), null);
  assert.equal(activeAiringDate(airing("2026-09-01", "2026-11-25"), "2026-11-20"), null);
  assert.equal(activeAiringDate(airing("2026-11-13", "2027-01-10"), "2026-11-20"), null);
  assert.equal(activeAiringDate(airing("2026-11-13", "2026-11-25", { nextEpisodeNumber: 2 }), "2026-11-20"), null);
  assert.equal(activeAiringDate(airing("fecha-inválida", "2026-11-25"), "2026-11-20"), null);
  assert.equal(activeAiringDate(null, "2026-11-20"), null);
});

test("fechas futuras de TMDB van a próximos estrenos aunque falten meses o cambie la temporada", () => {
  assert.equal(upcomingAiringDate(airing("2026-11-13", "2027-01-14", { nextEpisodeSeasonNumber: 3, nextEpisodeNumber: 1 }), "2026-11-20"), "2027-01-14");
  assert.equal(upcomingAiringDate(airing("2026-11-13", "2027-07-08", { nextEpisodeSeasonNumber: 4, nextEpisodeNumber: 1 }), "2026-11-20"), "2027-07-08");
  assert.equal(upcomingAiringDate(airing(null, "2026-11-20"), "2026-11-20"), "2026-11-20");
});

test("una estimación o fecha inválida no se presenta como estreno confirmado", () => {
  assert.equal(upcomingAiringDate(airing(null, "2027-01-14", { nextEpisodeDateSource: "estimated" }), "2026-11-20"), null);
  assert.equal(activeAiringDate(airing("2026-11-13", "2026-11-27", { nextEpisodeDateSource: "estimated" }), "2026-11-20"), null);
  assert.equal(upcomingAiringDate(airing(null, "2027-02-30"), "2026-11-20"), null);
  assert.equal(upcomingAiringDate(airing(null, "2026-11-19"), "2026-11-20"), null);
  assert.equal(upcomingAiringDate(airing(null, null), "2026-11-20"), null);
});

test("activos, próximos y espera se ordenan sin duplicaciones", () => {
  const result = orderWatchingItems([
    watching(1, airing("2026-11-13", "2026-11-30"), "2026-11-19"),
    watching(2, airing("2026-11-13", "2026-11-22"), "2026-11-01"),
    watching(3, null, "2026-11-20"),
    watching(4, airing(null, "2027-07-08"), "2026-11-01"),
    watching(5, airing(null, "2027-01-14"), "2026-11-01"),
    watching(6, airing(null, "2027-01-14", { nextEpisodeDateSource: "estimated" }), "2026-11-02")
  ], "2026-11-20");
  assert.deepEqual(result.active.map((item) => item.entry.tmdbId), [2, 1]);
  assert.deepEqual(result.upcoming.map((item) => item.entry.tmdbId), [5, 4]);
  assert.deepEqual(result.waiting.map((item) => item.entry.tmdbId), [3, 6]);
  assert.deepEqual([...result.active, ...result.upcoming, ...result.waiting].map((item) => item.entry.tmdbId).sort(), [1, 2, 3, 4, 5, 6]);
});
