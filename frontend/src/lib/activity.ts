import type { CommentInboxNotification, RecommendationMessage } from "../types";

export type ActivityTarget =
  | { kind: "message"; id: string }
  | { kind: "comment"; id: string };

export type PendingActivity = {
  key: string;
  type: "recommendation" | "reply" | "comment";
  label: string;
  body: string;
  createdAt: string;
  createdAtLabel: string;
  target: ActivityTarget;
};

export function activityTargetCategory(target: ActivityTarget): "recommendations" | "comments" {
  return target.kind === "message" ? "recommendations" : "comments";
}

export function collectPendingActivity(
  userId: string,
  messages: RecommendationMessage[],
  comments: CommentInboxNotification[]
): PendingActivity[] {
  const activity: PendingActivity[] = [];

  for (const message of messages) {
    if (message.recipientId === userId && !message.readAt) {
      activity.push({
        key: `recommendation:${message.id}`,
        type: "recommendation",
        label: `${message.senderProfile?.display_name ?? "Alguien"} te recomendó ${message.item.title}`,
        body: message.note,
        createdAt: message.createdAt,
        createdAtLabel: message.createdAtLabel,
        target: { kind: "message", id: message.id }
      });
    }

    for (const reply of message.replies ?? []) {
      if (reply.recipientId !== userId || reply.readAt) continue;
      activity.push({
        key: `reply:${reply.id}`,
        type: "reply",
        label: `${reply.senderProfile?.display_name ?? "Alguien"} respondió sobre ${message.item.title}`,
        body: reply.body,
        createdAt: reply.createdAt,
        createdAtLabel: reply.createdAtLabel,
        target: { kind: "message", id: message.id }
      });
    }
  }

  for (const comment of comments) {
    if (comment.recipientId !== userId || comment.readAt) continue;
    activity.push({
      key: `comment:${comment.id}`,
      type: "comment",
      label: `${comment.actorProfile?.display_name ?? "Alguien"} comentó tu publicación`,
      body: comment.body || "Ver comentario",
      createdAt: comment.createdAt,
      createdAtLabel: comment.createdAtLabel,
      target: { kind: "comment", id: comment.id }
    });
  }

  return activity.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.key.localeCompare(right.key));
}
