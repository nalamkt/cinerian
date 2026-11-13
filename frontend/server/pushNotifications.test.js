import assert from "node:assert/strict";
import test from "node:test";
import { deliverPush, episodesAiringToday, reservePushTest, selectRows, syncSeriesNotifications } from "./pushNotifications.js";
import diagnosticsHandler from "../api/push/diagnostics.js";

test("distingue consulta vacía, respuesta inválida y error HTTP de Supabase", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json([]);
    assert.deepEqual(await selectRows(pushConfig, "push_notification_deliveries", {}), []);
    for (const payload of [{}, null, "<html>error</html>"]) {
      globalThis.fetch = async () => new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" }
      });
      await assert.rejects(selectRows(pushConfig, "push_notification_deliveries", {}), /respuesta inválida/i);
    }
    globalThis.fetch = async () => Response.json({ message: "error" }, { status: 503 });
    await assert.rejects(selectRows(pushConfig, "push_notification_deliveries", {}), /HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("el diagnóstico no informa ausencia de envíos si Supabase responde inválido", async () => {
  const originalFetch = globalThis.fetch;
  const previous = Object.fromEntries(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ONESIGNAL_REST_API_KEY"]
    .map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SUPABASE_URL: "https://supabase.test", SUPABASE_ANON_KEY: "anon-test",
    SUPABASE_SERVICE_ROLE_KEY: "service-test", ONESIGNAL_REST_API_KEY: "rest-test"
  });
  globalThis.fetch = async (input) => new URL(input).pathname === "/auth/v1/user"
    ? Response.json({ id: "00000000-0000-0000-0000-000000000001" })
    : Response.json({ unexpected: true });
  const response = {
    statusCode: 0, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await diagnosticsHandler({ method: "GET", headers: { authorization: "Bearer session-test" } }, response);
    assert.equal(response.statusCode, 500);
    assert.match(response.payload.error, /servidor de notificaciones/i);
    assert.equal("deliveries" in response.payload, false);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("dos solicitudes de prueba concurrentes solo envían la reserva concedida", async () => {
  const originalFetch = globalThis.fetch;
  let reservations = 0;
  let sends = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/rpc/reserve_push_test")) {
      reservations += 1;
      return Response.json(reservations === 1 ? "00000000-0000-0000-0000-000000000001" : null);
    }
    if (url.hostname === "api.onesignal.com") {
      sends += 1;
      return Response.json({ id: "provider-1", recipients: 1 });
    }
    if (options.method === "PATCH") return Response.json(null);
    throw new Error(`Solicitud inesperada: ${url}`);
  };
  try {
    const [first, second] = await Promise.all([
      reservePushTest(pushConfig, pushInput, "Bearer user-token"),
      reservePushTest(pushConfig, pushInput, "Bearer user-token")
    ]);
    assert.ok(first);
    assert.equal(second, null);
    await Promise.all([first && deliverPush(pushConfig, pushInput, first), second && deliverPush(pushConfig, pushInput, second)]);
    assert.equal(sends, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const pushConfig = {
  supabaseUrl: "https://supabase.test",
  supabaseAnonKey: "anon-key",
  supabaseServiceRoleKey: "service-role",
  oneSignalAppId: "app-id",
  oneSignalRestApiKey: "rest-key",
  publicAppUrl: "https://cinerian.test"
};
const pushInput = {
  recipientUserId: "user-1",
  eventKey: "test:user-1:1",
  notificationType: "inbox_message",
  title: "Prueba",
  body: "Prueba",
  targetPath: "/"
};

const testUserId = "00000000-0000-0000-0000-000000000001";
const otherUserId = "00000000-0000-0000-0000-000000000002";

function mockHttpResponse() {
  return {
    statusCode: 0, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

async function withPushServerEnv(run) {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const keys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ONESIGNAL_REST_API_KEY"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SUPABASE_URL: pushConfig.supabaseUrl,
    SUPABASE_ANON_KEY: pushConfig.supabaseAnonKey,
    SUPABASE_SERVICE_ROLE_KEY: pushConfig.supabaseServiceRoleKey,
    ONESIGNAL_REST_API_KEY: pushConfig.oneSignalRestApiKey
  });
  console.error = () => {};
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("JWT válido reserva con identidad verificada y credenciales públicas", async () => {
  await withPushServerEnv(async () => {
    let sent = 0;
    let reservations = 0;
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      if (url.pathname === "/auth/v1/user") {
        assert.equal(options.headers.Authorization, "Bearer valid-token");
        return Response.json({ id: testUserId });
      }
      if (url.pathname.endsWith("/rpc/reserve_push_test")) {
        reservations += 1;
        assert.equal(options.headers.Authorization, "Bearer valid-token");
        assert.equal(options.headers.apikey, pushConfig.supabaseAnonKey);
        assert.notEqual(options.headers.apikey, pushConfig.supabaseServiceRoleKey);
        assert.equal(JSON.parse(options.body).p_user_id, testUserId);
        return Response.json("00000000-0000-0000-0000-000000000003");
      }
      if (url.hostname === "api.onesignal.com") {
        sent += 1;
        return Response.json({ id: "provider-1", recipients: 1 });
      }
      if (options.method === "PATCH") return Response.json(null);
      throw new Error(`Solicitud inesperada: ${url}`);
    };
    const response = mockHttpResponse();
    await diagnosticsHandler({
      method: "POST", headers: { authorization: "Bearer valid-token" },
      body: { userId: otherUserId, recipientUserId: otherUserId }
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.status, "sent");
    assert.equal(reservations, 1);
    assert.equal(sent, 1);
  });
});

test("JWT ausente o inválido no reserva ni envía", async () => {
  await withPushServerEnv(async () => {
    let requests = 0;
    globalThis.fetch = async (input) => {
      requests += 1;
      assert.equal(new URL(input).pathname, "/auth/v1/user");
      return Response.json({ error: "invalid token" }, { status: 401 });
    };
    const missing = mockHttpResponse();
    await diagnosticsHandler({ method: "POST", headers: {} }, missing);
    assert.equal(missing.statusCode, 401);
    assert.equal(requests, 0);
    const invalid = mockHttpResponse();
    await diagnosticsHandler({ method: "POST", headers: { authorization: "Bearer invalid-token" } }, invalid);
    assert.equal(invalid.statusCode, 401);
    assert.equal(requests, 1);
  });
});

test("una reserva para otro usuario recibe 403 y nunca envía", async () => {
  await withPushServerEnv(async () => {
    let sent = 0;
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      if (url.pathname === "/auth/v1/user") return Response.json({ id: testUserId });
      if (url.pathname.endsWith("/rpc/reserve_push_test")) {
        assert.equal(JSON.parse(options.body).p_user_id, testUserId);
        return Response.json({ code: "42501", message: "No autorizado" }, { status: 403 });
      }
      if (url.hostname === "api.onesignal.com") sent += 1;
      throw new Error(`Solicitud inesperada: ${url}`);
    };
    const response = mockHttpResponse();
    await diagnosticsHandler({ method: "POST", headers: { authorization: "Bearer valid-token" }, body: { userId: otherUserId } }, response);
    assert.equal(response.statusCode, 403);
    assert.equal(sent, 0);
  });
});

test("dos POST simultáneos conceden una reserva y rechazan el otro con 429", async () => {
  await withPushServerEnv(async () => {
    let reservations = 0;
    let sent = 0;
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      if (url.pathname === "/auth/v1/user") return Response.json({ id: testUserId });
      if (url.pathname.endsWith("/rpc/reserve_push_test")) {
        reservations += 1;
        assert.equal(options.headers.Authorization, "Bearer valid-token");
        return Response.json(reservations === 1 ? "00000000-0000-0000-0000-000000000003" : null);
      }
      if (url.hostname === "api.onesignal.com") {
        sent += 1;
        return Response.json({ id: "provider-1", recipients: 1 });
      }
      if (options.method === "PATCH") return Response.json(null);
      throw new Error(`Solicitud inesperada: ${url}`);
    };
    const responses = [mockHttpResponse(), mockHttpResponse()];
    await Promise.all(responses.map((response) => diagnosticsHandler({ method: "POST", headers: { authorization: "Bearer valid-token" } }, response)));
    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 429]);
    assert.equal(reservations, 2);
    assert.equal(sent, 1);
  });
});

test("errores de la RPC y reservas malformadas no llegan a OneSignal", async () => {
  await withPushServerEnv(async () => {
    let sent = 0;
    let rpcResponse = Response.json({ code: "401" }, { status: 401 });
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      if (url.pathname === "/auth/v1/user") return Response.json({ id: testUserId });
      if (url.pathname.endsWith("/rpc/reserve_push_test")) return rpcResponse;
      if (url.hostname === "api.onesignal.com") sent += 1;
      throw new Error(`Solicitud inesperada: ${url}`);
    };
    for (const [upstream, expected] of [[401, 401], [403, 403], [503, 502]]) {
      rpcResponse = Response.json({ code: String(upstream) }, { status: upstream });
      const response = mockHttpResponse();
      await diagnosticsHandler({ method: "POST", headers: { authorization: "Bearer valid-token" } }, response);
      assert.equal(response.statusCode, expected);
    }
    rpcResponse = Response.json({ unexpected: true });
    const invalid = mockHttpResponse();
    await diagnosticsHandler({ method: "POST", headers: { authorization: "Bearer valid-token" } }, invalid);
    assert.equal(invalid.statusCode, 502);
    assert.equal(sent, 0);
  });
});

test("reintenta solo la reserva transitoria, nunca el envío al proveedor", async () => {
  const originalFetch = globalThis.fetch;
  let claims = 0;
  let sends = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === "api.onesignal.com") {
      sends += 1;
      return Response.json({ id: "push-1", recipients: 1 });
    }
    if (options.method === "POST") {
      claims += 1;
      assert.equal(JSON.parse(options.body).event_key, pushInput.eventKey);
      return claims === 1 ? Response.json({}, { status: 503 }) : Response.json([{ id: "delivery-1" }]);
    }
    if (options.method === "PATCH") return Response.json(null);
    throw new Error(`URL inesperada: ${url}`);
  };
  try {
    assert.equal((await deliverPush(pushConfig, pushInput)).status, "sent");
    assert.equal(claims, 2);
    assert.equal(sends, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("si la primera reserva se confirmó pero se perdió la respuesta, no envía duplicado", async () => {
  const originalFetch = globalThis.fetch;
  let claims = 0;
  let sends = 0;
  globalThis.fetch = async (input, options = {}) => {
    if (new URL(input).hostname === "api.onesignal.com") {
      sends += 1;
      return Response.json({ id: "push-1" });
    }
    if (options.method === "POST") {
      claims += 1;
      if (claims === 1) throw new Error("respuesta perdida");
      return Response.json([]);
    }
    throw new Error("Solicitud inesperada");
  };
  try {
    assert.equal((await deliverPush(pushConfig, pushInput)).status, "duplicate");
    assert.equal(claims, 2);
    assert.equal(sends, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("un resultado incierto se registra pendiente y no se reenvía", async () => {
  const originalFetch = globalThis.fetch;
  let sends = 0;
  let claims = 0;
  let update = null;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === "api.onesignal.com") {
      sends += 1;
      throw new Error("timeout");
    }
    if (options.method === "POST") {
      claims += 1;
      return Response.json(claims === 1 ? [{ id: "delivery-1" }] : []);
    }
    if (options.method === "PATCH") {
      update = JSON.parse(options.body);
      return Response.json(null);
    }
    throw new Error(`URL inesperada: ${url}`);
  };
  try {
    assert.equal((await deliverPush(pushConfig, pushInput)).status, "uncertain");
    assert.equal(update.status, "pending");
    assert.equal(update.provider_response.outcome, "uncertain");
    assert.equal((await deliverPush(pushConfig, pushInput)).status, "duplicate");
    assert.equal(sends, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("distingue rechazo definitivo y límite temporal sin reenviar", async () => {
  const originalFetch = globalThis.fetch;
  let status = 400;
  let update = null;
  let sends = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === "api.onesignal.com") {
      sends += 1;
      return Response.json({ errors: ["dato privado"] }, { status });
    }
    if (options.method === "POST") return Response.json([{ id: "delivery-1" }]);
    if (options.method === "PATCH") {
      update = JSON.parse(options.body);
      return Response.json(null);
    }
    throw new Error(`URL inesperada: ${url}`);
  };
  try {
    assert.equal((await deliverPush(pushConfig, pushInput)).status, "failed");
    assert.equal(update.provider_response.outcome, "definitive");
    assert.doesNotMatch(update.provider_response.error, /dato privado/);
    status = 429;
    assert.equal((await deliverPush(pushConfig, { ...pushInput, eventKey: "test:user-1:2" })).status, "failed");
    assert.equal(update.provider_response.outcome, "temporary");
    assert.equal(sends, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("registra un fallo si OneSignal no encuentra dispositivos suscritos", async () => {
  const originalFetch = globalThis.fetch;
  let updatedStatus = null;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === "api.onesignal.com") {
      return Response.json({ id: "push-1", recipients: 0 });
    }
    if (url.pathname.endsWith("/push_notification_deliveries") && options.method === "POST") {
      return Response.json([{ id: "delivery-1" }]);
    }
    if (url.pathname.endsWith("/push_notification_deliveries") && options.method === "PATCH") {
      updatedStatus = JSON.parse(options.body).status;
      return Response.json(null);
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  try {
    const result = await deliverPush({
      supabaseUrl: "https://supabase.test",
      supabaseServiceRoleKey: "service-role",
      oneSignalAppId: "app-id",
      oneSignalRestApiKey: "rest-key",
      publicAppUrl: "https://cinerian.test"
    }, {
      recipientUserId: "user-1",
      eventKey: "push-test:user-1:1",
      notificationType: "inbox_message",
      title: "Prueba",
      body: "Prueba",
      targetPath: "/"
    });
    assert.equal(result.status, "failed");
    assert.equal(updatedStatus, "failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
