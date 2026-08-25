import { listProfiles, type Profile } from "./auth";
import { supabase } from "./supabase";
import type { AppView, ProductFeature } from "./access";

export type AdminMetric = {
  label: string;
  value: string;
  delta: string;
  tone: "neutral" | "positive" | "warning";
};

export type AdminModuleStatus = {
  label: string;
  status: "online" | "degraded" | "offline";
  detail: string;
};

export type AdminLogEntry = {
  id: string;
  level: "info" | "warning" | "error";
  title: string;
  detail: string;
  timestamp: string;
  source: string;
  actorName?: string | null;
};

export type AdminFeatureToggle = {
  id: ProductFeature;
  label: string;
  defaultLabel: string;
  description: string;
  audience: string;
  enabled: boolean;
};

export type AdminActivityPoint = {
  date: string;
  label: string;
  events: number;
  users: number;
};

export type AdminFeatureUsageStat = {
  id: string;
  label: string;
  events: number;
  users: number;
  detail: string;
  averageTimeSeconds: number;
  averageTimeLabel: string;
  totalTimeSeconds: number;
  totalTimeLabel: string;
  trendDelta: number;
  trendLabel: string;
  trendDirection: "up" | "down" | "flat";
};

export type AdminRetentionStat = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type AdminFunnelStep = {
  id: string;
  label: string;
  users: number;
  detail: string;
};

export type AdminAlertEntry = {
  id: string;
  level: "info" | "warning" | "error";
  title: string;
  detail: string;
};

export type AdminAccessMember = {
  userId: string;
  username: string;
  displayName: string;
  role: "operator" | "admin";
  createdAt: string;
};

export type AdminFlagAuditEntry = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  actorName?: string | null;
};

export type AdminDashboardSnapshot = {
  metrics: AdminMetric[];
  modules: AdminModuleStatus[];
  logs: AdminLogEntry[];
  toggles: AdminFeatureToggle[];
  activity: AdminActivityPoint[];
  signupActivity: AdminActivityPoint[];
  featureUsage: AdminFeatureUsageStat[];
  retention: AdminRetentionStat[];
  funnel: AdminFunnelStep[];
  alerts: AdminAlertEntry[];
  adminMembers: AdminAccessMember[];
  flagAudit: AdminFlagAuditEntry[];
  lastUpdatedAt: string;
  mode: "live" | "preview";
};

type CountResult = {
  count: number | null;
  status: "ok" | "missing";
};

type ActivityRow = {
  userId: string;
  createdAt: string;
};

type ProductEventRow = {
  userId: string;
  eventName: string;
  featureKey: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type TableQueryResult<T> = {
  rows: T[];
  status: "ok" | "missing";
};

type AdminLogInsert = {
  source: string;
  level: AdminLogEntry["level"];
  title: string;
  detail: string;
  context?: Record<string, unknown>;
  createdBy?: string | null;
};

type AdminAccessRow = {
  user_id: string;
  role: "operator" | "admin";
  created_at: string;
};

type AdminFeatureFlagRow = {
  feature_key: ProductFeature;
  enabled: boolean;
  display_name: string | null;
};

type AdminLogRow = {
  id: string;
  level: string;
  title: string;
  detail: string;
  source: string;
  created_at: string;
  created_by: string | null;
};

const FEATURE_DEFINITIONS: Array<Omit<AdminFeatureToggle, "enabled">> = [
  {
    id: "feed",
    label: "Feed social",
    defaultLabel: "Feed social",
    description: "Timeline principal y composer para cuentas publicas.",
    audience: "Publico"
  },
  {
    id: "search",
    label: "Buscador",
    defaultLabel: "Buscador",
    description: "Exploracion de titulos, personas y talento.",
    audience: "Publico"
  },
  {
    id: "recommendations",
    label: "Descubri",
    defaultLabel: "Descubri",
    description: "Recomendaciones y acciones de guardado.",
    audience: "Publico"
  },
  {
    id: "inbox",
    label: "Inbox",
    defaultLabel: "Inbox",
    description: "Mensajeria y comentarios sociales.",
    audience: "Publico"
  },
  {
    id: "editorial",
    label: "Capa editorial",
    defaultLabel: "Capa editorial",
    description: "Picks y noticias combinadas con el feed.",
    audience: "Publico"
  },
  {
    id: "premieres",
    label: "Estrenos",
    defaultLabel: "Estrenos",
    description: "Bloques de novedades y proximos lanzamientos.",
    audience: "Publico"
  }
];

const MODULE_USAGE_DEFINITIONS: Array<{
  id: AppView;
  label: string;
  description: string;
}> = [
  {
    id: "feed",
    label: "Inicio",
    description: "Feed principal, publicaciones y exploracion social."
  },
  {
    id: "search",
    label: "Buscador",
    description: "Busqueda de titulos, personas y talento."
  },
  {
    id: "recommendations",
    label: "Descubri",
    description: "Modulo de recomendaciones y hallazgos."
  },
  {
    id: "inbox",
    label: "Inbox",
    description: "Mensajes, recomendaciones y conversaciones."
  },
  {
    id: "user",
    label: "Mi cuenta",
    description: "Perfil propio y vistas de perfil."
  }
];

const VALID_FEATURES = new Set<ProductFeature>([
  "feed",
  "search",
  "recommendations",
  "inbox",
  "user",
  "editorial",
  "premieres"
]);

let telemetryAttached = false;
let lastTelemetryUserId: string | null = null;
const telemetryDedup = new Map<string, number>();

function formatCompactCount(value: number) {
  return new Intl.NumberFormat("es-AR", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value);
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
}

export function formatAdminTimestamp(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function isKnownMissingTableError(error: { message?: string; details?: string; hint?: string } | null) {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return haystack.includes("does not exist") || haystack.includes("schema cache") || haystack.includes("permission denied");
}

function isValidFeature(value: string): value is ProductFeature {
  return VALID_FEATURES.has(value as ProductFeature);
}

function extractRole(value: string): "operator" | "admin" {
  return value === "admin" ? "admin" : "operator";
}

function profileMapFromList(profiles: Profile[]) {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

async function fetchTableCount(table: string): Promise<CountResult> {
  if (!supabase) {
    return { count: null, status: "missing" };
  }

  const result = await supabase.from(table).select("*", { count: "exact", head: true });
  if (result.error) {
    return { count: null, status: "missing" };
  }

  return { count: result.count ?? 0, status: "ok" };
}

async function fetchActivityRows(
  table: string,
  userColumn: string,
  sinceIso: string
): Promise<TableQueryResult<ActivityRow>> {
  if (!supabase) {
    return { rows: [], status: "missing" };
  }

  const { data, error } = await supabase.from(table).select("*").gte("created_at", sinceIso);
  if (error) {
    return { rows: [], status: isKnownMissingTableError(error) ? "missing" : "missing" };
  }

  return {
    rows: (data ?? [])
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        return {
          userId: typeof row[userColumn] === "string" ? (row[userColumn] as string) : "",
          createdAt: typeof row.created_at === "string" ? row.created_at : ""
        };
      })
      .filter((entry) => entry.userId.length > 0 && entry.createdAt.length > 0),
    status: "ok"
  };
}

async function fetchProductEventRows(sinceIso: string): Promise<TableQueryResult<ProductEventRow>> {
  if (!supabase) {
    return { rows: [], status: "missing" };
  }

  const { data, error } = await supabase
    .from("product_events")
    .select("user_id, event_name, feature_key, created_at, metadata")
    .gte("created_at", sinceIso);

  if (error) {
    return { rows: [], status: isKnownMissingTableError(error) ? "missing" : "missing" };
  }

  return {
    rows: (data ?? [])
      .map((entry) => ({
        userId: typeof entry.user_id === "string" ? entry.user_id : "",
        eventName: typeof entry.event_name === "string" ? entry.event_name : "",
        featureKey: typeof entry.feature_key === "string" ? entry.feature_key : null,
        createdAt: typeof entry.created_at === "string" ? entry.created_at : "",
        metadata:
          entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
            ? (entry.metadata as Record<string, unknown>)
            : {}
      }))
      .filter((entry) => entry.createdAt.length > 0),
    status: "ok"
  };
}

function buildActivity(events: ActivityRow[], days = 7): AdminActivityPoint[] {
  const dayList = Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - 1 - index));
    return date;
  });

  return dayList.map((date) => {
    const isoDate = date.toISOString().slice(0, 10);
    const dayEvents = events.filter((entry) => entry.createdAt.slice(0, 10) === isoDate);
    return {
      date: isoDate,
      label: formatDateLabel(date.toISOString()),
      events: dayEvents.length,
      users: new Set(dayEvents.map((entry) => entry.userId)).size
    };
  });
}

function countUniqueUsersSince(events: ActivityRow[], days: number) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days + 1);
  threshold.setHours(0, 0, 0, 0);

  return new Set(
    events
      .filter((entry) => new Date(entry.createdAt).getTime() >= threshold.getTime())
      .map((entry) => entry.userId)
  ).size;
}

function countEventsSince(events: ActivityRow[], days: number) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days + 1);
  threshold.setHours(0, 0, 0, 0);
  return events.filter((entry) => new Date(entry.createdAt).getTime() >= threshold.getTime()).length;
}

function countEventsBetween(events: ActivityRow[], startDaysAgoInclusive: number, endDaysAgoInclusive: number) {
  const start = new Date();
  start.setDate(start.getDate() - startDaysAgoInclusive);
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setDate(end.getDate() - endDaysAgoInclusive);
  end.setHours(23, 59, 59, 999);

  return events.filter((entry) => {
    const time = new Date(entry.createdAt).getTime();
    return time >= start.getTime() && time <= end.getTime();
  }).length;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function formatTrendLabel(delta: number) {
  if (delta === 0) {
    return "Sin cambio vs. la semana previa";
  }

  return `${delta > 0 ? "+" : ""}${delta}% vs. los 7 dias previos`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDurationLabel(totalSeconds: number) {
  if (totalSeconds <= 0) {
    return "--";
  }

  if (totalSeconds < 60) {
    return `${Math.round(totalSeconds)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function readDurationSeconds(metadata: Record<string, unknown>) {
  const rawSeconds = metadata.durationSeconds;
  if (typeof rawSeconds === "number" && Number.isFinite(rawSeconds) && rawSeconds >= 0) {
    return rawSeconds;
  }

  const rawMs = metadata.durationMs;
  if (typeof rawMs === "number" && Number.isFinite(rawMs) && rawMs >= 0) {
    return rawMs / 1000;
  }

  return 0;
}

function buildFallbackLogs(): AdminLogEntry[] {
  const now = Date.now();
  return [
    {
      id: "fallback-admin-log-1",
      level: "warning",
      title: "Tabla admin_logs pendiente",
      detail: "Todavia no hay eventos persistidos. El panel esta listo para leerlos cuando corras la migracion de Supabase.",
      timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
      source: "panel"
    }
  ];
}

async function fetchAdminFeatureFlagRows() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("admin_feature_flags")
    .select("feature_key, enabled, display_name");

  if (error) {
    return null;
  }

  return (data ?? []).filter(
    (entry) => typeof entry.feature_key === "string" && isValidFeature(entry.feature_key)
  ) as AdminFeatureFlagRow[];
}

export async function fetchPublicFeatureFlags() {
  const rows = await fetchAdminFeatureFlagRows();
  if (!rows) {
    return null;
  }

  return rows.filter((entry) => entry.enabled).map((entry) => entry.feature_key);
}

export async function insertAdminLog(input: AdminLogInsert) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("admin_logs").insert({
    source: input.source,
    level: input.level,
    title: input.title,
    detail: input.detail,
    context: input.context ?? {},
    created_by: input.createdBy ?? null
  });

  if (error && !isKnownMissingTableError(error)) {
    throw error;
  }
}

export async function persistPublicFeatureFlags(input: {
  toggles: Array<Pick<AdminFeatureToggle, "id" | "enabled" | "label">>;
  updatedBy: string;
}) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const previousRows = await fetchAdminFeatureFlagRows();
  const previousMap = new Map((previousRows ?? []).map((row) => [row.feature_key, row]));
  const nextToggleMap = new Map(input.toggles.map((toggle) => [toggle.id, toggle]));

  const payload = FEATURE_DEFINITIONS.map((feature) => ({
    feature_key: feature.id,
    enabled: nextToggleMap.get(feature.id)?.enabled ?? true,
    display_name: (nextToggleMap.get(feature.id)?.label ?? feature.label).trim() || feature.defaultLabel,
    updated_by: input.updatedBy,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase.from("admin_feature_flags").upsert(payload, {
    onConflict: "feature_key"
  });

  if (error) {
    throw error;
  }

  const changeLogs = payload.flatMap((entry) => {
    const previous = previousMap.get(entry.feature_key);
    const changes: string[] = [];

    if (!previous || previous.enabled !== entry.enabled) {
      changes.push(entry.enabled ? "se activo" : "se desactivo");
    }

    const previousName = previous?.display_name?.trim() || FEATURE_DEFINITIONS.find((item) => item.id === entry.feature_key)?.defaultLabel;
    if ((previousName ?? "") !== entry.display_name) {
      changes.push(`renombre a "${entry.display_name}"`);
    }

    if (!changes.length) {
      return [];
    }

    return [
      {
        title: `Flag ${entry.feature_key} actualizada`,
        detail: changes.join(" y ")
      }
    ];
  });

  if (changeLogs.length === 0) {
    changeLogs.push({
      title: "Feature flags actualizados",
      detail: `Se guardaron ${payload.filter((entry) => entry.enabled).length} features publicas activas.`
    });
  }

  await Promise.all(
    changeLogs.map((entry) =>
      insertAdminLog({
        source: "feature-flags",
        level: "info",
        title: entry.title,
        detail: entry.detail,
        context: {
          toggles: payload
        },
        createdBy: input.updatedBy
      })
    )
  );
}

export function attachAdminTelemetry(userId: string | null) {
  lastTelemetryUserId = userId;

  if (telemetryAttached || typeof window === "undefined") {
    return;
  }

  telemetryAttached = true;

  function shouldLog(signature: string) {
    const now = Date.now();
    const lastLoggedAt = telemetryDedup.get(signature) ?? 0;
    if (now - lastLoggedAt < 15_000) {
      return false;
    }

    telemetryDedup.set(signature, now);
    return true;
  }

  window.addEventListener("error", (event) => {
    const message = event.message || "Error no capturado";
    const signature = `error:${message}`;
    if (!shouldLog(signature)) {
      return;
    }

    void insertAdminLog({
      source: "frontend",
      level: "error",
      title: "window.error",
      detail: message,
      context: {
        file: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        path: window.location.pathname
      },
      createdBy: lastTelemetryUserId
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.message
        : typeof event.reason === "string"
          ? event.reason
          : "Promise rechazada sin handler";
    const signature = `rejection:${reason}`;
    if (!shouldLog(signature)) {
      return;
    }

    void insertAdminLog({
      source: "frontend",
      level: "error",
      title: "unhandledrejection",
      detail: reason,
      context: {
        reason: event.reason instanceof Error ? event.reason.stack : event.reason,
        path: window.location.pathname
      },
      createdBy: lastTelemetryUserId
    });
  });
}

async function fetchAdminLogs(): Promise<TableQueryResult<AdminLogEntry>> {
  if (!supabase) {
    return { rows: [], status: "missing" };
  }

  const [profiles, result] = await Promise.all([
    listProfiles().catch(() => []),
    supabase
      .from("admin_logs")
      .select("id, level, title, detail, source, created_at, created_by")
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  if (result.error) {
    return { rows: [], status: "missing" };
  }

  const profileMap = profileMapFromList(profiles);
  return {
    rows: ((result.data ?? []) as AdminLogRow[]).map((entry) => ({
      id: String(entry.id),
      level:
        entry.level === "info" || entry.level === "warning" || entry.level === "error"
          ? entry.level
          : "info",
      title: String(entry.title ?? "Evento"),
      detail: String(entry.detail ?? ""),
      source: String(entry.source ?? "sistema"),
      timestamp: String(entry.created_at ?? new Date().toISOString()),
      actorName: entry.created_by ? profileMap.get(entry.created_by)?.display_name ?? null : null
    })),
    status: "ok"
  };
}

export async function fetchAdminAccessMembers(): Promise<AdminAccessMember[]> {
  if (!supabase) {
    return [];
  }

  const [profiles, result] = await Promise.all([
    listProfiles().catch(() => []),
    supabase.from("admin_access").select("user_id, role, created_at").order("created_at", { ascending: true })
  ]);

  if (result.error) {
    if (isKnownMissingTableError(result.error)) {
      return [];
    }
    throw result.error;
  }

  const profileMap = profileMapFromList(profiles);
  return ((result.data ?? []) as AdminAccessRow[])
    .map((entry) => {
      const profile = profileMap.get(entry.user_id);
      if (!profile) {
        return null;
      }

      return {
        userId: entry.user_id,
        username: profile.username,
        displayName: profile.display_name,
        role: extractRole(entry.role),
        createdAt: entry.created_at
      };
    })
    .filter((entry): entry is AdminAccessMember => Boolean(entry));
}

export async function hasAdminAccess(userId: string) {
  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase
    .from("admin_access")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.user_id);
}

export async function addAdminAccessMember(input: {
  userId: string;
  role: "operator" | "admin";
  addedBy: string;
}) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const { error } = await supabase.from("admin_access").upsert(
    {
      user_id: input.userId,
      role: input.role
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw error;
  }

  await insertAdminLog({
    source: "admin-access",
    level: "info",
    title: "Acceso admin actualizado",
    detail: `Se asigno el rol ${input.role} al usuario ${input.userId}.`,
    createdBy: input.addedBy
  });
}

export async function removeAdminAccessMember(input: { userId: string; removedBy: string }) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const { error } = await supabase.from("admin_access").delete().eq("user_id", input.userId);
  if (error) {
    throw error;
  }

  await insertAdminLog({
    source: "admin-access",
    level: "warning",
    title: "Acceso admin removido",
    detail: `Se quito acceso admin al usuario ${input.userId}.`,
    createdBy: input.removedBy
  });
}

export async function fetchAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const since30d = new Date();
  since30d.setDate(since30d.getDate() - 29);
  since30d.setHours(0, 0, 0, 0);
  const sinceIso = since30d.toISOString();

  const [
    profiles,
    feedPosts,
    reactions,
    inboxMessages,
    editorialNews,
    flagRows,
    logs,
    adminMembers,
    productEvents,
    feedActivity,
    reactionActivity,
    inboxActivity,
    commentActivity,
    signupActivity
  ] = await Promise.all([
    fetchTableCount("profiles"),
    fetchTableCount("feed_posts"),
    fetchTableCount("media_reactions"),
    fetchTableCount("recommendation_messages"),
    fetchTableCount("news_items"),
    fetchAdminFeatureFlagRows(),
    fetchAdminLogs(),
    fetchAdminAccessMembers(),
    fetchProductEventRows(sinceIso),
    fetchActivityRows("feed_posts", "user_id", sinceIso),
    fetchActivityRows("media_reactions", "user_id", sinceIso),
    fetchActivityRows("recommendation_messages", "sender_id", sinceIso),
    fetchActivityRows("feed_post_comments", "user_id", sinceIso),
    fetchActivityRows("profiles", "id", sinceIso)
  ]);

  const hasDedicatedEvents = productEvents.status === "ok" && productEvents.rows.length > 0;

  const activityEvents = hasDedicatedEvents
    ? productEvents.rows
        .filter((entry) => entry.userId.length > 0)
        .map((entry) => ({
          userId: entry.userId,
          createdAt: entry.createdAt
        }))
    : [
        ...feedActivity.rows,
        ...reactionActivity.rows,
        ...inboxActivity.rows,
        ...commentActivity.rows
      ];

  const activity = buildActivity(activityEvents);
  const signups = buildActivity(signupActivity.rows);
  const dau = countUniqueUsersSince(activityEvents, 1);
  const mau = countUniqueUsersSince(activityEvents, 30);
  const last7dEvents = countEventsSince(activityEvents, 7);
  const previous7dEvents = countEventsBetween(activityEvents, 14, 8);
  const activityTrendDelta = percentChange(last7dEvents, previous7dEvents);

  const productEventFilter = (eventName: string) =>
    productEvents.rows.filter((entry) => entry.eventName === eventName && entry.userId.length > 0);

  const trackedReactionEvents = productEventFilter("reaction_saved");
  const trackedPostEvents = productEventFilter("feed_post_created");
  const trackedInboxEvents = productEventFilter("recommendation_sent");
  const trackedCommentEvents = productEventFilter("feed_comment_created");
  const trackedProfileCreated = productEventFilter("profile_created");
  const trackedViewSessions = productEvents.rows.filter(
    (entry) => entry.eventName === "view_session_recorded" && entry.featureKey !== null
  );

  const reactionBaseRows = hasDedicatedEvents ? trackedReactionEvents : reactionActivity.rows;
  const postBaseRows = hasDedicatedEvents ? trackedPostEvents : feedActivity.rows;
  const inboxBaseRows = hasDedicatedEvents ? trackedInboxEvents : inboxActivity.rows;
  const commentBaseRows = hasDedicatedEvents ? trackedCommentEvents : commentActivity.rows;
  const signupBaseRows = hasDedicatedEvents ? trackedProfileCreated : signupActivity.rows;

  const reactionUsers30 = new Set(reactionBaseRows.map((entry) => entry.userId)).size;
  const postUsers30 = new Set(postBaseRows.map((entry) => entry.userId)).size;
  const inboxUsers30 = new Set(inboxBaseRows.map((entry) => entry.userId)).size;

  const d1Candidates = signupBaseRows.filter((entry) => {
    const created = new Date(entry.createdAt).getTime();
    const daysAgo = Math.floor((Date.now() - created) / 86_400_000);
    return daysAgo >= 2 && daysAgo <= 8;
  });
  const d7Candidates = signupBaseRows.filter((entry) => {
    const created = new Date(entry.createdAt).getTime();
    const daysAgo = Math.floor((Date.now() - created) / 86_400_000);
    return daysAgo >= 8 && daysAgo <= 30;
  });

  const d1Retained = d1Candidates.filter((candidate) =>
    activityEvents.some(
      (event) =>
        event.userId === candidate.userId &&
        new Date(event.createdAt).getTime() >= new Date(candidate.createdAt).getTime() + 86_400_000
    )
  ).length;
  const d7Retained = d7Candidates.filter((candidate) =>
    activityEvents.some((event) => {
      if (event.userId !== candidate.userId) {
        return false;
      }

      const signupTime = new Date(candidate.createdAt).getTime();
      const eventTime = new Date(event.createdAt).getTime();
      return eventTime >= signupTime + 86_400_000 && eventTime <= signupTime + 7 * 86_400_000;
    })
  ).length;

  const featureUsage: AdminFeatureUsageStat[] = MODULE_USAGE_DEFINITIONS.map((module) => {
    const sessionRows = trackedViewSessions.filter((entry) => entry.featureKey === module.id);
    const fallbackRows =
      module.id === "feed"
        ? [...postBaseRows, ...commentBaseRows, ...reactionBaseRows]
        : module.id === "inbox"
          ? inboxBaseRows
          : module.id === "user"
            ? productEventFilter("profile_opened")
            : [];
    const usageRows = sessionRows.length > 0 ? sessionRows : fallbackRows;
    const totalTimeSeconds = sessionRows.reduce((sum, entry) => sum + readDurationSeconds(entry.metadata), 0);
    const averageTimeSeconds = sessionRows.length > 0 ? totalTimeSeconds / sessionRows.length : 0;
    const trendDelta = percentChange(countEventsSince(usageRows, 7), countEventsBetween(usageRows, 14, 8));
    const eventLabel =
      sessionRows.length > 0
        ? `${sessionRows.length} sesiones en los ultimos 30 dias.`
        : usageRows.length > 0
          ? `${usageRows.length} eventos recientes. El tiempo promedio empieza a medirse desde ahora.`
          : "Sin uso registrado todavia en los ultimos 30 dias.";

    return {
      id: module.id,
      label: module.label,
      events: usageRows.length,
      users: new Set(usageRows.map((entry) => entry.userId)).size,
      detail: `${module.description} ${eventLabel}`,
      averageTimeSeconds,
      averageTimeLabel: formatDurationLabel(averageTimeSeconds),
      totalTimeSeconds,
      totalTimeLabel: formatDurationLabel(totalTimeSeconds),
      trendDelta,
      trendLabel: formatTrendLabel(trendDelta),
      trendDirection: trendDelta > 0 ? "up" : trendDelta < 0 ? "down" : "flat"
    };
  });

  const featureUsageByTime = [...featureUsage].sort((a, b) => {
    if (b.totalTimeSeconds !== a.totalTimeSeconds) {
      return b.totalTimeSeconds - a.totalTimeSeconds;
    }

    if (b.averageTimeSeconds !== a.averageTimeSeconds) {
      return b.averageTimeSeconds - a.averageTimeSeconds;
    }

    return b.events - a.events;
  });
  const topModuleByTime = featureUsageByTime[0];
  const averageSessionSeconds =
    trackedViewSessions.length > 0
      ? trackedViewSessions.reduce((sum, entry) => sum + readDurationSeconds(entry.metadata), 0) / trackedViewSessions.length
      : 0;

  const retention: AdminRetentionStat[] = [
    {
      id: "d1",
      label: "Retencion D1",
      value: d1Candidates.length ? formatPercent((d1Retained / d1Candidates.length) * 100) : "--",
      detail: "Usuarios que volvieron al menos 1 dia despues de registrarse."
    },
    {
      id: "d7",
      label: "Retencion D7",
      value: d7Candidates.length ? formatPercent((d7Retained / d7Candidates.length) * 100) : "--",
      detail: "Usuarios que tuvieron actividad dentro de su primera semana."
    }
  ];

  const funnel: AdminFunnelStep[] = [
    {
      id: "registered",
      label: "Registrados",
      users: profiles.count ?? 0,
      detail: "Base total de perfiles."
    },
    {
      id: "active30",
      label: "Activos 30d",
      users: mau,
      detail: "Tuvieron al menos un evento en los ultimos 30 dias."
    },
    {
      id: "reacted30",
      label: "Reaccionaron",
      users: reactionUsers30,
      detail: "Likes, vistas o valoraciones recientes."
    },
    {
      id: "posted30",
      label: "Postearon",
      users: postUsers30,
      detail: "Publicaron en el feed."
    },
    {
      id: "messaged30",
      label: "Mandaron inbox",
      users: inboxUsers30,
      detail: "Enviaron un mensaje/recomendacion."
    }
  ];

  const metrics: AdminMetric[] = [
    {
      label: "Clientes registrados",
      value: profiles.count !== null ? formatCompactCount(profiles.count) : "--",
      delta: profiles.status === "ok" ? `${formatCompactCount(countEventsSince(signupBaseRows, 7))} altas en 7 dias` : "Tabla no disponible",
      tone: profiles.status === "ok" ? "positive" : "warning"
    },
    {
      label: "DAU",
      value: formatCompactCount(dau),
      delta: "Usuarios unicos con actividad hoy",
      tone: dau > 0 ? "positive" : "neutral"
    },
    {
      label: "MAU",
      value: formatCompactCount(mau),
      delta: "Usuarios unicos con actividad en 30 dias",
      tone: mau > 0 ? "positive" : "neutral"
    },
    {
      label: "Eventos 7 dias",
      value: formatCompactCount(last7dEvents),
      delta: `${activityTrendDelta > 0 ? "+" : ""}${activityTrendDelta}% vs. semana previa`,
      tone: last7dEvents > 0 ? "positive" : "neutral"
    },
    {
      label: "Modulo mas usado",
      value: topModuleByTime?.totalTimeSeconds ? topModuleByTime.label : "--",
      delta: topModuleByTime?.totalTimeSeconds
        ? `${topModuleByTime.totalTimeLabel} acumulado · promedio ${topModuleByTime.averageTimeLabel}`
        : "Todavia no hay sesiones suficientes para medir permanencia",
      tone: topModuleByTime?.totalTimeSeconds ? "positive" : "warning"
    },
    {
      label: "Tiempo promedio por sesion",
      value: formatDurationLabel(averageSessionSeconds),
      delta:
        trackedViewSessions.length > 0
          ? `${formatCompactCount(trackedViewSessions.length)} sesiones medidas en 30 dias`
          : "Se habilita cuando haya sesiones registradas",
      tone: trackedViewSessions.length > 0 ? "positive" : "warning"
    }
  ];

  const modules: AdminModuleStatus[] = [
    {
      label: "Supabase Auth + perfiles",
      status: profiles.status === "ok" ? "online" : "degraded",
      detail:
        profiles.status === "ok"
          ? "Perfiles accesibles para autenticacion y analitica."
          : "No pude leer public.profiles desde esta instancia."
    },
    {
      label: "Feature flags persistentes",
      status: flagRows ? "online" : "degraded",
      detail: flagRows
        ? `Se cargaron ${flagRows.length} flags desde admin_feature_flags.`
        : "El panel sigue con fallback si la tabla admin_feature_flags no existe."
    },
    {
      label: "Telemetria de producto",
      status: activityEvents.length > 0 ? "online" : "degraded",
      detail:
        activityEvents.length > 0
          ? hasDedicatedEvents
            ? "DAU, MAU y uso por feature se calculan sobre product_events."
            : "DAU, MAU y uso por feature se infieren desde tablas operativas."
          : "Todavia no hay suficiente actividad o faltan tablas para medir uso."
    },
    {
      label: "Errores y auditoria",
      status: logs.status === "ok" ? "online" : "offline",
      detail:
        logs.status === "ok"
          ? "admin_logs responde y almacena eventos del frontend y del panel."
          : "Falta correr la migracion para tener log central persistido."
    },
    {
      label: "Capa editorial",
      status: editorialNews.status === "ok" ? "online" : "offline",
      detail:
        editorialNews.status === "ok"
          ? `Hay ${formatCompactCount(editorialNews.count ?? 0)} items editoriales disponibles.`
          : "No se detecto la tabla news_items o no hay acceso."
    }
  ];

  const flagRowMap = new Map((flagRows ?? []).map((entry) => [entry.feature_key, entry]));
  const toggles = FEATURE_DEFINITIONS.map((feature) => ({
    ...feature,
    label: flagRowMap.get(feature.id)?.display_name?.trim() || feature.defaultLabel,
    enabled: flagRowMap.get(feature.id)?.enabled ?? true
  }));

  const auditLogs = (logs.status === "ok" ? logs.rows : []).filter((entry) => entry.source === "feature-flags");
  const systemLogs = (logs.status === "ok" ? logs.rows : []).filter((entry) => entry.source !== "feature-flags");
  const flagAudit = auditLogs.map((entry) => ({
    id: entry.id,
    title: entry.title,
    detail: entry.detail,
    timestamp: entry.timestamp,
    actorName: entry.actorName
  }));

  const liveSources = [
    profiles.status,
    feedPosts.status,
    reactions.status,
    inboxMessages.status,
    logs.status
  ].filter((entry) => entry === "ok").length;

  const alerts: AdminAlertEntry[] = [];

  if (dau === 0) {
    alerts.push({
      id: "dau-zero",
      level: "warning",
      title: "Sin actividad hoy",
      detail: "No hubo usuarios activos en las ultimas 24 horas."
    });
  }

  if (logs.status !== "ok") {
    alerts.push({
      id: "logs-offline",
      level: "error",
      title: "Logging incompleto",
      detail: "El panel no esta pudiendo leer admin_logs."
    });
  }

  if ((flagRows ?? []).length === 0) {
    alerts.push({
      id: "flags-missing",
      level: "warning",
      title: "Flags sin sincronizar",
      detail: "No se cargaron flags persistentes desde admin_feature_flags."
    });
  }

  if (adminMembers.length < 2) {
    alerts.push({
      id: "admins-low",
      level: "info",
      title: "Pocos admins operativos",
      detail: "Conviene tener al menos dos usuarios en admin_access."
    });
  }

  if (featureUsage.every((item) => item.events === 0)) {
    alerts.push({
      id: "usage-empty",
      level: "warning",
      title: "Sin señales de uso",
      detail: "No hay eventos recientes para feed, reacciones, inbox o comentarios."
    });
  }

  if (!hasDedicatedEvents) {
    alerts.push({
      id: "events-fallback",
      level: "info",
      title: "Analytics en modo fallback",
      detail: "El panel sigue infiriendo metricas desde tablas operativas hasta que product_events empiece a poblarse."
    });
  }

  return {
    metrics,
    modules,
    logs: systemLogs.length > 0 ? systemLogs : buildFallbackLogs(),
    toggles,
    activity,
    signupActivity: signups,
    featureUsage,
    retention,
    funnel,
    alerts,
    adminMembers,
    flagAudit,
    lastUpdatedAt: new Date().toISOString(),
    mode: liveSources >= 3 ? "live" : "preview"
  };
}
