import {
  deliverPush,
  getAuthenticatedUserId,
  getPushConfig,
  jsonResponse,
  requestBody,
  selectSingleById
} from "../../server/pushNotifications.js";

async function profileName(config, userId) {
  const profile = await selectSingleById(config, "profiles", userId, "display_name,username");
  return profile?.display_name || profile?.username || "Alguien de tu círculo";
}

async function buildRecommendationPush(config, messageId, senderId) {
  const message = await selectSingleById(
    config,
    "recommendation_messages",
    messageId,
    "id,sender_id,recipient_id,title,note"
  );
  if (!message || message.sender_id !== senderId) {
    return null;
  }

  const senderName = await profileName(config, senderId);
  const note = message.note ? `: “${String(message.note).replace(/\s+/g, " ").trim().slice(0, 90)}”` : "";
  return {
    recipientUserId: message.recipient_id,
    eventKey: `inbox:recommendation:${message.id}`,
    notificationType: "inbox_message",
    title: "Nueva recomendación",
    body: `${senderName} te recomendó ${message.title}${note}`,
    targetPath: "/?view=inbox",
    metadata: { type: "inbox_recommendation", messageId: message.id }
  };
}

async function buildReplyPush(config, replyId, senderId) {
  const reply = await selectSingleById(
    config,
    "recommendation_message_replies",
    replyId,
    "id,message_id,sender_id,recipient_id,body"
  );
  if (!reply || reply.sender_id !== senderId) {
    return null;
  }

  const message = await selectSingleById(
    config,
    "recommendation_messages",
    reply.message_id,
    "id,sender_id,recipient_id,title"
  );
  if (!message || (message.sender_id !== senderId && message.recipient_id !== senderId)) {
    return null;
  }

  const recipientUserId = reply.recipient_id || (message.sender_id === senderId ? message.recipient_id : message.sender_id);
  if (!recipientUserId || recipientUserId === senderId) {
    return null;
  }

  const senderName = await profileName(config, senderId);
  return {
    recipientUserId,
    eventKey: `inbox:reply:${reply.id}`,
    notificationType: "inbox_message",
    title: `Nueva respuesta sobre ${message.title}`,
    body: `${senderName}: “${String(reply.body).replace(/\s+/g, " ").trim().slice(0, 110)}”`,
    targetPath: "/?view=inbox",
    metadata: { type: "inbox_reply", messageId: message.id, replyId: reply.id }
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    jsonResponse(response, 405, { error: "Método no permitido." });
    return;
  }

  try {
    const config = getPushConfig();
    const senderId = await getAuthenticatedUserId(config, request);
    if (!senderId) {
      jsonResponse(response, 401, { error: "Sesión inválida." });
      return;
    }

    const body = requestBody(request);
    const notification =
      body.type === "recommendation" && typeof body.messageId === "string"
        ? await buildRecommendationPush(config, body.messageId, senderId)
        : body.type === "reply" && typeof body.replyId === "string"
          ? await buildReplyPush(config, body.replyId, senderId)
          : null;

    if (!notification) {
      jsonResponse(response, 404, { error: "No encontré un mensaje válido para notificar." });
      return;
    }

    const result = await deliverPush(config, notification);
    jsonResponse(response, 202, { status: result.status });
  } catch (error) {
    console.error("[push] No se pudo procesar el evento de Inbox.", error);
    jsonResponse(response, 500, { error: "No se pudo procesar la notificación." });
  }
}
