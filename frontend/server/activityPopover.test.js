import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { collectPendingActivity, activityTargetCategory } = await vite.ssrLoadModule("/src/lib/activity.ts");

const message = {
  id: "message-1", senderId: "sender", recipientId: "me", readAt: null,
  senderProfile: { display_name: "Mauro" },
  item: { title: "Neagley" }, note: "Mirá esta serie", createdAt: "2026-11-12T12:00:00Z", createdAtLabel: "Ayer",
  replies: [{ id: "reply-1", messageId: "message-1", senderId: "sender", recipientId: "me", readAt: null,
    senderProfile: { display_name: "Mauro" }, body: "¿La viste?", createdAt: "2026-11-13T12:00:00Z", createdAtLabel: "Hoy" }]
};
const comment = {
  id: "notice-1", commentId: "comment-1", postId: "post-1", actorId: "sender", recipientId: "me", readAt: null,
  actorProfile: { display_name: "Mauro" }, body: "Muy buena", createdAt: "2026-11-13T13:00:00Z", createdAtLabel: "Hoy"
};

test("Actividad muestra solo los pendientes reales y ordenados, cada uno con su destino", () => {
  const result = collectPendingActivity("me", [message], [comment]);
  assert.deepEqual(result.map((event) => event.type), ["comment", "reply", "recommendation"]);
  assert.deepEqual(result.map((event) => event.target), [
    { kind: "comment", id: "notice-1" },
    { kind: "message", id: "message-1" },
    { kind: "message", id: "message-1" }
  ]);
  assert.equal(activityTargetCategory(result[0].target), "comments");
  assert.equal(activityTargetCategory(result[1].target), "recommendations");
});

test("Actividad excluye leídos y avisos de otros usuarios", () => {
  const result = collectPendingActivity("me", [
    { ...message, readAt: "2026-11-13T14:00:00Z", replies: [{ ...message.replies[0], readAt: "2026-11-13T14:00:00Z" }] },
    { ...message, id: "other", recipientId: "other", replies: [] }
  ], [{ ...comment, recipientId: "other" }]);
  assert.deepEqual(result, []);
});

test("las respuestas a conversaciones iniciadas por el usuario también aparecen", () => {
  const sent = { ...message, senderId: "me", recipientId: "sender", replies: message.replies };
  const result = collectPendingActivity("me", [sent], []);
  assert.deepEqual(result.map((event) => event.type), ["reply"]);
});
