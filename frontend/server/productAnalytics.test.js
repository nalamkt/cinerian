import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { ACTIVITY_TIMEOUT_MS, advanceActivitySession, readActivitySession, recordEventWith, verifiedPushClickId } = await vite.ssrLoadModule("/src/lib/analyticsSession.ts");
const { analyticsEnvironment, analyticsPlatform, minimalEventMetadata } = await vite.ssrLoadModule("/src/lib/analytics.ts");

test("el runner marca el proceso para impedir eventos reales durante pruebas", () => {
  assert.ok(process.env.NODE_TEST_CONTEXT);
});

function recorder() {
  const sessions = new Map();
  const events = [];
  let now = 1_000_000;
  let currentUser = "user-1";
  let sequence = 0;
  const dependencies = {
    getUserId: async () => currentUser,
    read: (userId) => sessions.get(userId) ?? null,
    write: (userId, session) => sessions.set(userId, session),
    insert: (eventName, userId, sessionId) => events.push({ eventName, userId, sessionId }),
    now: () => now,
    createId: () => `session-${++sequence}`
  };
  return { sessions, events, dependencies, setNow: (value) => { now = value; }, setUser: (value) => { currentUser = value; } };
}

test("una sesion de 30 minutos registra apertura una sola vez, incluso entre navegaciones", async () => {
  const state = recorder();
  await recordEventWith({ eventName: "app_opened", userId: "user-1" }, state.dependencies);
  await recordEventWith({ eventName: "discovery_opened", userId: "user-1" }, state.dependencies);
  state.setNow(1_000_000 + ACTIVITY_TIMEOUT_MS - 1);
  await recordEventWith({ eventName: "app_opened", userId: "user-1" }, state.dependencies);
  assert.deepEqual(state.events.map((event) => event.eventName), ["app_opened", "discovery_opened"]);
  state.setNow(1_000_000 + 2 * ACTIVITY_TIMEOUT_MS);
  await recordEventWith({ eventName: "mutual_discovery_opened", userId: "user-1" }, state.dependencies);
  assert.deepEqual(state.events.map((event) => event.eventName), ["app_opened", "discovery_opened", "app_opened", "mutual_discovery_opened"]);
  assert.notEqual(state.events[0].sessionId, state.events[2].sessionId);
});

test("sin autenticacion o con identidad equivocada no se registra ningun evento", async () => {
  const state = recorder();
  state.setUser(null);
  await recordEventWith({ eventName: "title_saved" }, state.dependencies);
  state.setUser("user-1");
  await recordEventWith({ eventName: "title_saved", userId: "user-2" }, state.dependencies);
  assert.equal(state.events.length, 0);
  assert.equal(state.sessions.size, 0);
});

test("los fallos de almacenamiento y red no afectan la accion del usuario", async () => {
  const state = recorder();
  const badStorage = { ...state.dependencies, write: () => { throw new Error("storage"); } };
  await assert.doesNotReject(recordEventWith({ eventName: "title_saved" }, badStorage));
  const badNetwork = { ...state.dependencies, insert: () => { throw new Error("network"); } };
  await assert.doesNotReject(recordEventWith({ eventName: "title_saved" }, badNetwork));
});

test("separacion de localhost, preview y produccion; propiedades sin datos personales", () => {
  assert.equal(analyticsEnvironment("localhost"), "development");
  assert.equal(analyticsEnvironment("cinerian.app"), "production");
  assert.equal(analyticsEnvironment("feature-cinerian.vercel.app"), "preview");
  assert.equal(analyticsPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"), "ios");
  assert.equal(analyticsPlatform("Mozilla/5.0 (Linux; Android 15)"), "android");
  assert.deepEqual(minimalEventMetadata({ emailDomain: "private.test", tmdbId: 123, mediaType: "movie", targetUserId: "uuid" }, "cinerian.app", "Desktop"), {
    environment: "production", platform: "desktop", mediaType: "movie"
  });
});

test("el clic push requiere un ID verificable y la migracion deduplica por usuario", async () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(verifiedPushClickId(id.toUpperCase()), id);
  assert.equal(verifiedPushClickId(null), null);
  assert.equal(verifiedPushClickId("/?view=inbox"), null);
  const sql = await readFile(new URL("../../supabase/product_events.sql", import.meta.url), "utf8");
  assert.match(sql, /unique index if not exists product_events_dedupe_idx on public\.product_events \(user_id, event_name, dedupe_key\)/i);
  const source = await readFile(new URL("../src/lib/oneSignal.ts", import.meta.url), "utf8");
  assert.match(source, /Notifications\.addEventListener\("click", trackVerifiedPushClick\)/);
});

test("la migracion define RLS propietario, solo insercion y sin escritura de timestamps", async () => {
  const sql = await readFile(new URL("../../supabase/product_events.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for insert to authenticated with check \(auth\.uid\(\) = user_id\)/i);
  assert.match(sql, /for select to authenticated using \(auth\.uid\(\) = user_id\)/i);
  assert.match(sql, /grant insert \(id, user_id, event_name, session_id, feature_key, dedupe_key, metadata\)/i);
  assert.doesNotMatch(sql, /grant (update|delete)\b/i);
});

test("los eventos de guardar, Viendo y filtros se emiten despues del guardado exitoso", async () => {
  const reactions = await readFile(new URL("../src/lib/reactions.ts", import.meta.url), "utf8");
  const watching = await readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
  const discover = await readFile(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  const saveReaction = reactions.slice(reactions.indexOf("export async function saveStoredReaction"));
  const saveWatching = watching.slice(watching.indexOf("export async function saveCurrentWatchingEntries"));
  const saveFilters = discover.slice(discover.indexOf("async function persistFilters"));
  assert.ok(saveReaction.indexOf("else if (upsertError)") < saveReaction.indexOf('eventName: "title_saved"'));
  assert.ok(saveWatching.indexOf("if (error || !data)") < saveWatching.indexOf('eventName: "watching_title_added"'));
  assert.ok(saveFilters.indexOf("await saveDiscoverFilters(userId, next)") < saveFilters.indexOf('eventName: "discover_filters_applied"'));
});

test("lectura de sesiones invalidas no genera falsas aperturas previas", () => {
  assert.equal(readActivitySession("no-json"), null);
  assert.equal(readActivitySession('{"id":"bad","lastActivity":3}'), null);
  assert.deepEqual(advanceActivitySession(null, 10, () => "new"), { session: { id: "new", lastActivity: 10 }, opened: true });
});
