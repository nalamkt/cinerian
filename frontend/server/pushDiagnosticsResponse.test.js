import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { parsePushDiagnosticsResponse, parseTestPushResponse, PushResponseError } from "../src/lib/pushDiagnosticsResponse.ts";

const valid = { configured: true, watchingCount: 0, seriesCronLastSeenAt: null, deliveries: [] };
const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json" }
});

test("rechaza HTML aunque responda HTTP 200", async () => {
  await assert.rejects(parsePushDiagnosticsResponse(new Response("<html>App</html>", {
    headers: { "Content-Type": "text/html" }
  })), PushResponseError);
});

test("rechaza JSON inválido, vacío y estructuras incompletas", async () => {
  const responses = [
    new Response("{", { headers: { "Content-Type": "application/json" } }),
    json({}),
    json({ ...valid, deliveries: null }),
    json({ ...valid, deliveries: [{}] }),
    json({ ...valid, configured: false })
  ];
  for (const response of responses) {
    await assert.rejects(parsePushDiagnosticsResponse(response), PushResponseError);
  }
});

test("rechaza errores HTTP sin procesar el cuerpo", async () => {
  await assert.rejects(parsePushDiagnosticsResponse(json(valid, 500)), PushResponseError);
  await assert.rejects(parsePushDiagnosticsResponse(json(valid, 401)), /sesión venció/i);
  await assert.rejects(parseTestPushResponse(json({ status: "sent", recipients: 1 }, 502)), PushResponseError);
});

test("acepta un diagnóstico sin entregas, no lo confunde con respuesta vacía", async () => {
  assert.deepEqual(await parsePushDiagnosticsResponse(json(valid)), valid);
  await assert.rejects(parseTestPushResponse(json({})), PushResponseError);
});

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());

test("renderiza diagnóstico no disponible sin entregas", async () => {
  const { NotificationDiagnosticsSummary } = await vite.ssrLoadModule("/src/components/NotificationPreferences.tsx");
  const unavailable = renderToStaticMarkup(createElement(NotificationDiagnosticsSummary, {
    diagnostics: null,
    serverError: "No pudimos comprobar el servidor."
  }));
  assert.match(unavailable, /Diagnóstico no disponible/);
  const noDelivery = renderToStaticMarkup(createElement(NotificationDiagnosticsSummary, {
    diagnostics: valid,
    serverError: null
  }));
  assert.match(noDelivery, /Todavía no hay envíos registrados/);
});

test("renderiza preferencias completas sin diagnóstico", async () => {
  const { NotificationPreferences } = await vite.ssrLoadModule("/src/components/NotificationPreferences.tsx");
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: "https://cinerian.test" } };
  try {
    const html = renderToStaticMarkup(createElement(NotificationPreferences, { userId: "user-1" }));
    assert.match(html, /Preparando tus notificaciones/);
    assert.match(html, /Comprobar notificaciones/);
    assert.doesNotMatch(html, /undefined|NaN/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("solo ofrece activación con soporte real y gesto del usuario", async () => {
  const { canActivateNotificationConnection } = await vite.ssrLoadModule("/src/components/useNotificationConnection.ts");
  const ready = { status: "ready", permission: "default", hasSubscription: false, linkedToAccount: false };
  assert.equal(canActivateNotificationConnection(ready, false, false), true);
  assert.equal(canActivateNotificationConnection(ready, true, false), false);
  assert.equal(canActivateNotificationConnection(ready, true, true), true);
  assert.equal(canActivateNotificationConnection({ ...ready, status: "denied", permission: "denied" }, false, false), false);
  assert.equal(canActivateNotificationConnection({ ...ready, status: "unsupported", permission: "unsupported" }, false, false), false);
  assert.equal(canActivateNotificationConnection(null, false, false), false);
});
