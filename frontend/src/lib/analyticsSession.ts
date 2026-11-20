export const ACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

export type ActivitySession = { id: string; lastActivity: number };

export function advanceActivitySession(previous: ActivitySession | null, now: number, createId: () => string): { session: ActivitySession; opened: boolean } {
  if (!previous || !Number.isFinite(previous.lastActivity) || now < previous.lastActivity || now - previous.lastActivity >= ACTIVITY_TIMEOUT_MS) {
    return { session: { id: createId(), lastActivity: now }, opened: true };
  }
  return { session: { ...previous, lastActivity: now }, opened: false };
}

export function readActivitySession(raw: string | null): ActivitySession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && "id" in value && "lastActivity" in value &&
      typeof value.id === "string" && /^[0-9a-f-]{36}$/i.test(value.id) && typeof value.lastActivity === "number") {
      return { id: value.id, lastActivity: value.lastActivity };
    }
  } catch {
    // Almacenamiento corrupto: comienza una sesión nueva.
  }
  return null;
}

export function verifiedPushClickId(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : null;
}

export async function recordEventWith(
  input: { eventName: string; userId?: string | null },
  dependencies: {
    getUserId: () => Promise<string | null>;
    read: (userId: string) => ActivitySession | null;
    write: (userId: string, session: ActivitySession) => void;
    insert: (eventName: string, userId: string, sessionId: string) => void;
    now: () => number;
    createId: () => string;
  }
): Promise<void> {
  try {
    const userId = await dependencies.getUserId();
    if (!userId || (input.userId && input.userId !== userId)) return;
    const { session, opened } = advanceActivitySession(dependencies.read(userId), dependencies.now(), dependencies.createId);
    dependencies.write(userId, session);
    if (opened) dependencies.insert("app_opened", userId, session.id);
    if (input.eventName !== "app_opened") dependencies.insert(input.eventName, userId, session.id);
  } catch {
    // La analítica es best effort y no interrumpe la acción de producto.
  }
}
