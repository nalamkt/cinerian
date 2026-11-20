import { supabase } from "./supabase";
import type { ProductFeature } from "./access";
import { readActivitySession, recordEventWith } from "./analyticsSession";

export type ProductEventName =
  | "app_opened"
  | "discovery_opened"
  | "title_saved"
  | "watching_title_added"
  | "mutual_discovery_opened"
  | "discover_filters_applied"
  | "push_opened"
  | "profile_created"
  | "auth_magic_link_requested"
  | "auth_google_started"
  | "auth_apple_started"
  | "reaction_saved"
  | "feed_post_created"
  | "feed_comment_created"
  | "recommendation_sent"
  | "profile_opened"
  | "view_session_recorded";

const STORAGE_PREFIX = "cinerian:activity-session:v1:";
const SAFE_PROPERTIES = new Set(["mediaType", "reaction", "postType", "durationMs", "durationSeconds", "reason", "view"]);
let lastActivityCheck = 0;
let lastActivityUserId: string | null = null;
let deliveryQueue: Promise<void> = Promise.resolve();

export function analyticsEnvironment(hostname: string): "development" | "preview" | "production" {
  if (hostname === "cinerian.app" || hostname === "www.cinerian.app") return "production";
  if (hostname === "localhost" || hostname === "127.0.0.1") return "development";
  return "preview";
}

export function analyticsPlatform(userAgent: string): "ios" | "android" | "desktop" {
  if (/iPad|iPhone|iPod|Macintosh.*Mobile/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

export function minimalEventMetadata(input: Record<string, unknown> | undefined, hostname: string, userAgent: string) {
  const metadata: Record<string, string | number> = {
    environment: analyticsEnvironment(hostname), platform: analyticsPlatform(userAgent)
  };
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!SAFE_PROPERTIES.has(key)) continue;
    if (typeof value === "string" && value.length <= 40) metadata[key] = value;
    if (typeof value === "number" && Number.isFinite(value)) metadata[key] = value;
  }
  return metadata;
}

function automatedTest() {
  const nodeTestContext = (globalThis as { process?: { env?: { NODE_TEST_CONTEXT?: string } } }).process?.env?.NODE_TEST_CONTEXT;
  return import.meta.env.MODE === "test" || import.meta.env.VITE_DISABLE_PRODUCT_ANALYTICS === "true" ||
    Boolean(import.meta.env.VITEST) || Boolean(nodeTestContext) ||
    (typeof navigator !== "undefined" && navigator.webdriver);
}

type EventInput = {
  eventName: ProductEventName;
  userId?: string | null;
  featureKey?: ProductFeature | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
};

async function insertEvent(input: EventInput, userId: string, sessionId: string) {
  if (!supabase) return;
  try {
    await supabase.from("product_events").insert({
      id: crypto.randomUUID(), user_id: userId, event_name: input.eventName,
      session_id: sessionId, feature_key: input.featureKey ?? null,
      dedupe_key: input.dedupeKey ?? null,
      metadata: minimalEventMetadata(input.metadata, window.location.hostname, navigator.userAgent)
    });
  } catch {
    // La medición nunca bloquea una acción del usuario.
  }
}

function queueEvent(input: EventInput, userId: string, sessionId: string) {
  deliveryQueue = deliveryQueue.then(() => insertEvent(input, userId, sessionId)).catch(() => undefined);
}

export async function trackProductEvent(input: EventInput): Promise<void> {
  const client = supabase;
  if (!client || automatedTest() || typeof window === "undefined") return;
  if (document.visibilityState === "hidden" && input.eventName !== "push_opened") {
    if (input.eventName !== "view_session_recorded") return;
    try {
      const userId = (await client.auth.getSession()).data.session?.user.id;
      if (!userId || (input.userId && input.userId !== userId)) return;
      const current = readActivitySession(window.sessionStorage.getItem(`${STORAGE_PREFIX}${userId}`));
      if (current) queueEvent(input, userId, current.id);
    } catch {
      // La telemetria de cierre tampoco bloquea el navegador.
    }
    return;
  }
  await recordEventWith(input, {
    getUserId: async () => (await client.auth.getSession()).data.session?.user.id ?? null,
    read: (userId) => readActivitySession(window.sessionStorage.getItem(`${STORAGE_PREFIX}${userId}`)),
    write: (userId, session) => window.sessionStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(session)),
    insert: (eventName, userId, sessionId) => {
      queueEvent(eventName === "app_opened" ? { eventName: "app_opened" } : input, userId, sessionId);
    },
    now: () => Date.now(),
    createId: () => crypto.randomUUID()
  });
}

export function recordAppActivity(userId: string) {
  const now = Date.now();
  if (lastActivityUserId === userId && now - lastActivityCheck < 60_000) return;
  lastActivityCheck = now;
  lastActivityUserId = userId;
  void trackProductEvent({ eventName: "app_opened", userId });
}
