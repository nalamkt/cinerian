import { randomUUID } from "node:crypto";
import {
  deliverPush,
  getAuthenticatedUserId,
  getPushConfig,
  jsonResponse,
  reservePushTest,
  selectRows,
  selectSingleById
} from "../../server/pushNotifications.js";

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    jsonResponse(response, 405, { error: "Método no permitido." });
    return;
  }

  try {
    const config = getPushConfig();
    const userId = await getAuthenticatedUserId(config, request);
    if (!userId) {
      jsonResponse(response, 401, { error: "Sesión inválida." });
      return;
    }

    if (request.method === "GET") {
      const [deliveries, seriesStates, profile] = await Promise.all([
        selectRows(config, "push_notification_deliveries", {
          select: "created_at,status,notification_type,provider_response,metadata",
          recipient_user_id: `eq.${userId}`,
          order: "created_at.desc",
          limit: 5
        }),
        selectRows(config, "series_notification_states", {
          select: "updated_at",
          user_id: `eq.${userId}`,
          order: "updated_at.desc",
          limit: 1
        }),
        selectSingleById(config, "profiles", userId, "current_watching")
      ]);
      jsonResponse(response, 200, {
        configured: true,
        watchingCount: Array.isArray(profile?.current_watching) ? profile.current_watching.length : 0,
        seriesCronLastSeenAt: seriesStates[0]?.updated_at ?? null,
        deliveries: deliveries.map((entry) => ({
          createdAt: entry.created_at,
          status: entry.status,
          type: entry.metadata?.type ?? entry.notification_type,
          outcome: ["definitive", "temporary", "uncertain"].includes(entry.provider_response?.outcome)
            ? entry.provider_response.outcome
            : null,
          recipients: typeof entry.provider_response?.recipients === "number"
            ? entry.provider_response.recipients
            : null,
          error: null
        }))
      });
      return;
    }

    const input = {
      recipientUserId: userId,
      eventKey: `push-test:${userId}:${randomUUID()}`,
      notificationType: "inbox_message",
      title: "Prueba de notificaciones",
      body: "Si ves este aviso, Cinerian puede enviarte notificaciones en este dispositivo.",
      targetPath: "/?view=user",
      metadata: { type: "push_test" }
    };
    const claimedDeliveryId = await reservePushTest(config, input, request.headers?.authorization);
    if (!claimedDeliveryId) {
      jsonResponse(response, 429, { error: "Esperá un minuto antes de repetir la prueba." });
      return;
    }

    const result = await deliverPush(config, input, claimedDeliveryId);
    jsonResponse(response, result.status === "failed" ? 502 : result.status === "uncertain" ? 202 : 200, {
      status: result.status,
      recipients: typeof result.providerResponse?.recipients === "number"
        ? result.providerResponse.recipients
        : null,
      error: null
    });
  } catch (error) {
    console.error("[push] Falló el diagnóstico de notificaciones.", error);
    const status = request.method === "POST" && error?.httpStatus === 401 ? 401
      : request.method === "POST" && error?.httpStatus === 403 ? 403
        : request.method === "POST" && error?.httpStatus ? 502 : 500;
    jsonResponse(response, status, {
      error: status === 401 ? "Tu sesión venció. Volvé a iniciar sesión."
        : status === 403 ? "No tenés permiso para reservar esta prueba."
          : "No pudimos comprobar el servidor de notificaciones."
    });
  }
}
