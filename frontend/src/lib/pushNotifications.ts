import { supabase } from "./supabase";

const ACTIVITY_HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;
const ACTIVITY_STORAGE_PREFIX = "cinerian:notification-activity:";

type InboxPushEvent =
  | { type: "recommendation"; messageId: string }
  | { type: "reply"; replyId: string };

function lastActivityKey(userId: string) {
  return `${ACTIVITY_STORAGE_PREFIX}${userId}`;
}

function lastRecordedActivity(userId: string) {
  try {
    return Number(window.localStorage.getItem(lastActivityKey(userId)) ?? 0);
  } catch {
    return 0;
  }
}

function rememberActivity(userId: string, timestamp: number) {
  try {
    window.localStorage.setItem(lastActivityKey(userId), String(timestamp));
  } catch {
    // The database write remains enough when storage is unavailable.
  }
}

export async function recordNotificationActivity(userId: string) {
  if (!supabase || typeof window === "undefined") {
    return;
  }

  const now = Date.now();
  if (now - lastRecordedActivity(userId) < ACTIVITY_HEARTBEAT_INTERVAL_MS) {
    return;
  }

  const { error } = await supabase.from("notification_user_activity").upsert(
    {
      user_id: userId,
      last_opened_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString()
    },
    { onConflict: "user_id" }
  );

  if (!error) {
    rememberActivity(userId, now);
    return;
  }

  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (!message.includes("notification_user_activity")) {
    console.warn("[push] No se pudo registrar la actividad del usuario.", error);
  }
}

export async function queueInboxPushNotification(event: InboxPushEvent) {
  if (!supabase) {
    return;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return;
  }

  try {
    const response = await fetch("/api/push/dispatch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event),
      keepalive: true
    });

    if (!response.ok) {
      console.warn("[push] No se pudo encolar la notificación de Inbox.");
    }
  } catch {
    // A message is already persisted in Supabase. A transient push failure must
    // never make the Inbox appear to have failed for the sender.
  }
}
