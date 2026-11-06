import assert from "node:assert/strict";
import test from "node:test";
import { episodesAiringToday, syncSeriesNotifications } from "./pushNotifications.js";

test("detecta un estreno según la fecha de Argentina", () => {
  const now = new Date("2026-11-07T01:30:00Z");
  const episodes = episodesAiringToday({
    next_episode_to_air: { id: 11, season_number: 2, episode_number: 3, air_date: "2026-11-06" }
  }, now);

  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].episodeNumber, 3);
});

test("detecta el episodio cuando TMDB ya lo movió a último emitido", () => {
  const episodes = episodesAiringToday({
    next_episode_to_air: { id: 12, season_number: 2, episode_number: 4, air_date: "2026-11-13" },
    last_episode_to_air: { id: 11, season_number: 2, episode_number: 3, air_date: "2026-11-06" }
  }, new Date("2026-11-06T13:00:00Z"));

  assert.deepEqual(episodes.map((episode) => episode.episodeNumber), [3]);
});

test("no duplica un episodio que figura como próximo y último", () => {
  const episode = { id: 11, season_number: 2, episode_number: 3, air_date: "2026-11-06" };
  const episodes = episodesAiringToday({
    next_episode_to_air: episode,
    last_episode_to_air: episode
  }, new Date("2026-11-06T13:00:00Z"));

  assert.equal(episodes.length, 1);
});

test("ignora episodios de otro día", () => {
  const episodes = episodesAiringToday({
    next_episode_to_air: { id: 11, season_number: 2, episode_number: 3, air_date: "2026-11-07" }
  }, new Date("2026-11-06T13:00:00Z"));

  assert.deepEqual(episodes, []);
});

test("envía una sola notificación por estreno aunque el cron se repita", async () => {
  const originalFetch = globalThis.fetch;
  const deliveries = new Map();
  let state = null;
  let pushCount = 0;
  const config = {
    supabaseUrl: "https://supabase.test",
    supabaseServiceRoleKey: "service-role",
    tmdbApiKey: "tmdb-key",
    oneSignalAppId: "app-id",
    oneSignalRestApiKey: "rest-key",
    publicAppUrl: "https://cinerian.test"
  };

  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.hostname === "api.themoviedb.org") {
      return Response.json({
        name: "Serie de prueba",
        status: "Returning Series",
        next_episode_to_air: { id: 123, season_number: 1, episode_number: 5, air_date: "2026-11-06" }
      });
    }
    if (url.hostname === "api.onesignal.com") {
      pushCount += 1;
      assert.match(body.contents.es, /Hoy se estrena el capítulo T1E5 de Serie de prueba/);
      return Response.json({ id: `push-${pushCount}` });
    }
    if (url.pathname.endsWith("/profiles")) {
      return Response.json([{ id: "user-1", current_watching: [{ tmdbId: 42 }] }]);
    }
    if (url.pathname.endsWith("/series_notification_states")) {
      if (options.method === "POST") {
        state = body;
        return Response.json(null);
      }
      return Response.json(state ? [state] : []);
    }
    if (url.pathname.endsWith("/push_notification_deliveries")) {
      if (options.method === "PATCH") return Response.json(null);
      if (deliveries.has(body.event_key)) return Response.json([]);
      const delivery = { id: "delivery-1", ...body };
      deliveries.set(body.event_key, delivery);
      return Response.json([delivery]);
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  try {
    const now = new Date("2026-11-06T13:00:00Z");
    const first = await syncSeriesNotifications(config, now);
    const second = await syncSeriesNotifications(config, now);
    assert.equal(first.releasedToday, 1);
    assert.equal(second.releasedToday, 0);
    assert.equal(pushCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
