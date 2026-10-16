import { createHash } from "node:crypto";

const DEFAULT_ONESIGNAL_APP_ID = "47939fb0-3234-4852-a5da-1ac4ec3d4f5a";
const DEFAULT_APP_URL = "https://www.cinerian.app";
const REACTION_WEIGHTS = { superliked: 6, liked: 3, disliked: -2 };
const RATED_REACTIONS = new Set(Object.keys(REACTION_WEIGHTS));
const RANKING_LIMIT = 20;

function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function required(name, value) {
  if (!value) {
    throw new Error(`Falta configurar ${name} en Vercel.`);
  }

  return value;
}

function asJson(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return { raw: value.slice(0, 2_000) };
  }
}

function responseDetails(response, payload) {
  const details = typeof payload === "object" && payload !== null ? JSON.stringify(payload) : String(payload ?? "");
  return `HTTP ${response.status}${details ? `: ${details.slice(0, 500)}` : ""}`;
}

function restPath(table, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });

  const query = search.toString();
  return query ? `${table}?${query}` : table;
}

function truncate(value, limit = 120) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function formatDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(date);
}

function rankSnapshotKey(entries) {
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 24);
}

export function getPushConfig() {
  const supabaseUrl = env("SUPABASE_URL", env("VITE_SUPABASE_URL")).replace(/\/$/, "");
  const publicAppUrl = env("PUBLIC_APP_URL", DEFAULT_APP_URL).replace(/\/$/, "");

  return {
    supabaseUrl: required("SUPABASE_URL", supabaseUrl),
    supabaseAnonKey: required("SUPABASE_ANON_KEY", env("SUPABASE_ANON_KEY", env("VITE_SUPABASE_ANON_KEY"))),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY", env("SUPABASE_SERVICE_ROLE_KEY")),
    oneSignalAppId: env("ONESIGNAL_APP_ID", DEFAULT_ONESIGNAL_APP_ID),
    oneSignalRestApiKey: required("ONESIGNAL_REST_API_KEY", env("ONESIGNAL_REST_API_KEY")),
    tmdbApiKey: env("TMDB_API_KEY", env("VITE_TMDB_API_KEY")),
    publicAppUrl
  };
}

export function jsonResponse(response, status, payload) {
  response.status(status).json(payload);
}

export function requestBody(request) {
  if (typeof request.body === "string") {
    return asJson(request.body) ?? {};
  }

  return request.body && typeof request.body === "object" ? request.body : {};
}

export function isCronRequestAuthorized(request) {
  const secret = env("CRON_SECRET");
  return Boolean(secret) && request.headers?.authorization === `Bearer ${secret}`;
}

export async function getAuthenticatedUserId(config, request) {
  const authorization = request.headers?.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: authorization
    }
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return typeof user?.id === "string" ? user.id : null;
}

export async function supabaseRest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const payload = asJson(await response.text());

  if (!response.ok) {
    throw new Error(`Supabase: ${responseDetails(response, payload)}`);
  }

  return payload;
}

export async function selectRows(config, table, params) {
  const result = await supabaseRest(config, restPath(table, params));
  return Array.isArray(result) ? result : [];
}

export async function selectSingleById(config, table, id, select) {
  const rows = await selectRows(config, table, {
    select,
    id: `eq.${id}`,
    limit: 1
  });
  return rows[0] ?? null;
}

function absoluteUrl(config, path) {
  return new URL(path, `${config.publicAppUrl}/`).toString();
}

async function claimDelivery(config, input) {
  const rows = await supabaseRest(
    config,
    restPath("push_notification_deliveries", { on_conflict: "event_key" }),
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        recipient_user_id: input.recipientUserId,
        event_key: input.eventKey,
        notification_type: input.notificationType,
        title: input.title,
        body: input.body,
        target_url: absoluteUrl(config, input.targetPath),
        metadata: input.metadata ?? {},
        status: "pending"
      })
    }
  );

  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function updateDelivery(config, id, payload) {
  await supabaseRest(config, restPath("push_notification_deliveries", { id: `eq.${id}` }), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload)
  });
}

async function sendOneSignal(config, input) {
  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      Authorization: `Key ${config.oneSignalRestApiKey}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      app_id: config.oneSignalAppId,
      target_channel: "push",
      include_aliases: { external_id: [input.recipientUserId] },
      headings: { es: input.title, en: input.title },
      contents: { es: input.body, en: input.body },
      web_url: absoluteUrl(config, input.targetPath),
      data: input.metadata ?? {}
    })
  });
  const payload = asJson(await response.text());

  if (!response.ok) {
    throw new Error(`OneSignal: ${responseDetails(response, payload)}`);
  }

  return payload;
}

export async function deliverPush(config, input) {
  const delivery = await claimDelivery(config, input);
  if (!delivery) {
    return { status: "duplicate" };
  }

  try {
    const providerResponse = await sendOneSignal(config, input);
    await updateDelivery(config, delivery.id, {
      status: "sent",
      provider_message_id: typeof providerResponse?.id === "string" ? providerResponse.id : null,
      provider_response: providerResponse ?? {},
      sent_at: new Date().toISOString()
    });
    return { status: "sent", providerResponse };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar la notificación.";
    await updateDelivery(config, delivery.id, {
      status: "failed",
      provider_response: { error: message }
    }).catch(() => undefined);
    return { status: "failed", error: message };
  }
}

function seriesStateFromTmdb(tmdbId, payload) {
  const next = payload?.next_episode_to_air && typeof payload.next_episode_to_air === "object"
    ? payload.next_episode_to_air
    : null;
  const nextEpisodeId = Number(next?.id);
  const nextEpisodeDate = typeof next?.air_date === "string" ? next.air_date : null;
  const nextSeasonNumber = Number(next?.season_number);
  const nextEpisodeNumber = Number(next?.episode_number);
  const nextEpisodeName = typeof next?.name === "string" ? next.name : null;
  const status = typeof payload?.status === "string" ? payload.status : null;
  const title = typeof payload?.name === "string" && payload.name.trim() ? payload.name.trim() : `Serie ${tmdbId}`;
  const fingerprint = [
    status ?? "",
    Number.isFinite(nextEpisodeId) ? nextEpisodeId : "",
    nextEpisodeDate ?? "",
    Number.isFinite(nextSeasonNumber) ? nextSeasonNumber : "",
    Number.isFinite(nextEpisodeNumber) ? nextEpisodeNumber : ""
  ].join("|");

  return {
    tmdb_show_id: tmdbId,
    title,
    status,
    next_episode_id: Number.isFinite(nextEpisodeId) ? nextEpisodeId : null,
    next_episode_name: nextEpisodeName,
    next_episode_date: nextEpisodeDate,
    next_season_number: Number.isFinite(nextSeasonNumber) ? nextSeasonNumber : null,
    next_episode_number: Number.isFinite(nextEpisodeNumber) ? nextEpisodeNumber : null,
    fingerprint
  };
}

async function fetchTmdbItem(config, tmdbId, mediaType) {
  if (!config.tmdbApiKey) {
    return null;
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?${new URLSearchParams({
      api_key: config.tmdbApiKey,
      language: "es-AR"
    })}`
  );

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function mapWithConcurrency(items, mapper, concurrency = 6) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function seriesUpdateCopy(previous, current) {
  const episode = current.next_season_number && current.next_episode_number
    ? `T${current.next_season_number}E${current.next_episode_number}`
    : "Próximo episodio";
  const date = formatDate(current.next_episode_date);
  const details = [current.next_episode_name, episode, date].filter(Boolean).join(" · ");

  if (!previous.next_episode_date && current.next_episode_date) {
    return `Ya hay novedades: ${details}.`;
  }

  if (previous.next_episode_date && !current.next_episode_date) {
    return "Cambió el estado de la serie y ya no tiene un próximo episodio confirmado.";
  }

  return details
    ? `Actualización del próximo episodio: ${details}.`
    : "Cambió el estado de esta serie.";
}

export async function syncSeriesNotifications(config) {
  const [profiles, previousStates] = await Promise.all([
    selectRows(config, "profiles", { select: "id,current_watching" }),
    selectRows(config, "series_notification_states", {
      select: "user_id,tmdb_show_id,title,status,next_episode_id,next_episode_name,next_episode_date,next_season_number,next_episode_number,fingerprint"
    })
  ]);
  const watchedByUser = profiles.flatMap((profile) => {
    const currentWatching = Array.isArray(profile.current_watching) ? profile.current_watching : [];
    return currentWatching
      .map((entry) => Number(entry?.tmdbId))
      .filter(Number.isFinite)
      .map((tmdbId) => ({ userId: profile.id, tmdbId }));
  });
  const uniqueIds = [...new Set(watchedByUser.map((entry) => entry.tmdbId))];
  const tmdbEntries = await mapWithConcurrency(uniqueIds, async (tmdbId) => {
    const payload = await fetchTmdbItem(config, tmdbId, "tv");
    return payload ? seriesStateFromTmdb(tmdbId, payload) : null;
  });
  const stateByShowId = new Map(
    tmdbEntries.filter(Boolean).map((entry) => [entry.tmdb_show_id, entry])
  );
  const previousByUserShow = new Map(
    previousStates.map((entry) => [`${entry.user_id}:${entry.tmdb_show_id}`, entry])
  );
  let sent = 0;
  let changed = 0;

  for (const watched of watchedByUser) {
    const current = stateByShowId.get(watched.tmdbId);
    if (!current) {
      continue;
    }

    const previous = previousByUserShow.get(`${watched.userId}:${watched.tmdbId}`);
    if (previous && previous.fingerprint !== current.fingerprint) {
      changed += 1;
      const result = await deliverPush(config, {
        recipientUserId: watched.userId,
        eventKey: `series:${watched.userId}:${watched.tmdbId}:${current.fingerprint}`,
        notificationType: "series_update",
        title: `${current.title} tiene novedades`,
        body: seriesUpdateCopy(previous, current),
        targetPath: "/?view=user&tab=watching",
        metadata: { type: "series_update", tmdbId: watched.tmdbId, mediaType: "tv" }
      });
      if (result.status === "sent") {
        sent += 1;
      }
    }

    await supabaseRest(
      config,
      restPath("series_notification_states", { on_conflict: "user_id,tmdb_show_id" }),
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ ...current, user_id: watched.userId, updated_at: new Date().toISOString() })
      }
    );
  }

  return { watched: watchedByUser.length, changed, sent };
}

function rankingEntriesForUser(followingIds, reactions) {
  const following = new Set(followingIds);
  const candidates = new Map();

  reactions.forEach((reaction) => {
    if (!following.has(reaction.user_id) || !RATED_REACTIONS.has(reaction.reaction)) {
      return;
    }

    const key = `${reaction.media_type}-${reaction.tmdb_id}`;
    const candidate = candidates.get(key) ?? {
      key,
      tmdbId: Number(reaction.tmdb_id),
      mediaType: reaction.media_type,
      weightSum: 0,
      watchers: 0
    };
    candidate.weightSum += REACTION_WEIGHTS[reaction.reaction];
    candidate.watchers += 1;
    candidates.set(key, candidate);
  });

  return [...candidates.values()]
    .filter((entry) => entry.weightSum / (entry.watchers + 2) > 0)
    .sort((left, right) => {
      const scoreDifference = right.weightSum / (right.watchers + 2) - left.weightSum / (left.watchers + 2);
      return scoreDifference || right.watchers - left.watchers;
    })
    .slice(0, RANKING_LIMIT)
    .map((entry, index) => ({
      key: entry.key,
      tmdbId: entry.tmdbId,
      mediaType: entry.mediaType,
      rank: index + 1,
      score: Number(((entry.weightSum / (6 * entry.watchers)) * 10).toFixed(1)),
      watchers: entry.watchers
    }));
}

function rankChanges(previousEntries, currentEntries) {
  const previousByKey = new Map(previousEntries.map((entry) => [entry.key, entry]));
  const currentByKey = new Map(currentEntries.map((entry) => [entry.key, entry]));
  const changes = [];

  currentEntries.forEach((entry) => {
    const previous = previousByKey.get(entry.key);
    if (!previous) {
      changes.push({ type: "entered", entry });
      return;
    }

    if (previous.rank !== entry.rank) {
      changes.push({ type: "moved", entry, previous });
      return;
    }

    if (previous.score !== entry.score || previous.watchers !== entry.watchers) {
      changes.push({ type: "score", entry, previous });
    }
  });

  previousEntries.forEach((entry) => {
    if (!currentByKey.has(entry.key)) {
      changes.push({ type: "left", entry });
    }
  });

  return changes.sort((left, right) => {
    const leftRank = left.entry.rank;
    const rightRank = right.entry.rank;
    return leftRank - rightRank;
  });
}

async function titleForRankingEntry(config, entry, cache) {
  if (cache.has(entry.key)) {
    return cache.get(entry.key);
  }

  const payload = await fetchTmdbItem(config, entry.tmdbId, entry.mediaType);
  const title = payload?.title ?? payload?.name ?? "Un título de tu ranking";
  cache.set(entry.key, title);
  return title;
}

async function rankingChangeCopy(config, change, titleCache) {
  const title = await titleForRankingEntry(config, change.entry, titleCache);
  if (change.type === "entered") {
    return `${title} entró al puesto #${change.entry.rank}.`;
  }

  if (change.type === "left") {
    return `${title} salió de los primeros ${RANKING_LIMIT} puestos.`;
  }

  if (change.type === "moved") {
    const direction = change.entry.rank < change.previous.rank ? "subió" : "bajó";
    return `${title} ${direction} del #${change.previous.rank} al #${change.entry.rank}.`;
  }

  return `${title} cambió su puntaje de ${change.previous.score} a ${change.entry.score}.`;
}

export async function syncRankingNotifications(config) {
  const [profiles, follows, reactions, previousStates] = await Promise.all([
    selectRows(config, "profiles", { select: "id" }),
    selectRows(config, "user_follows", { select: "follower_id,following_id" }),
    selectRows(config, "media_reactions", {
      select: "user_id,tmdb_id,media_type,reaction",
      reaction: "in.(superliked,liked,disliked)"
    }),
    selectRows(config, "ranking_notification_states", { select: "user_id,snapshot" })
  ]);
  const followingByUser = new Map(profiles.map((profile) => [profile.id, []]));
  follows.forEach((follow) => {
    const list = followingByUser.get(follow.follower_id) ?? [];
    list.push(follow.following_id);
    followingByUser.set(follow.follower_id, list);
  });
  const previousByUser = new Map(previousStates.map((state) => [state.user_id, state]));
  const titleCache = new Map();
  let changed = 0;
  let sent = 0;

  for (const [userId, followingIds] of followingByUser) {
    const currentSnapshot = rankingEntriesForUser(followingIds, reactions);
    const previousState = previousByUser.get(userId);
    const previousSnapshot = Array.isArray(previousState?.snapshot) ? previousState.snapshot : null;

    if (previousSnapshot) {
      const changes = rankChanges(previousSnapshot, currentSnapshot);
      if (changes.length) {
        changed += 1;
        const primary = await rankingChangeCopy(config, changes[0], titleCache);
        const extra = changes.length > 1 ? ` Además, hubo ${changes.length - 1} cambio${changes.length === 2 ? "" : "s"}.` : "";
        const result = await deliverPush(config, {
          recipientUserId: userId,
          eventKey: `ranking:${userId}:${rankSnapshotKey(currentSnapshot)}`,
          notificationType: "ranking_update",
          title: "Cambió tu ranking",
          body: `${primary}${extra}`,
          targetPath: "/?view=user&tab=ranking",
          metadata: { type: "ranking_update" }
        });
        if (result.status === "sent") {
          sent += 1;
        }
      }
    }

    await supabaseRest(config, restPath("ranking_notification_states", { on_conflict: "user_id" }), {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, snapshot: currentSnapshot, updated_at: new Date().toISOString() })
    });
  }

  return { users: followingByUser.size, changed, sent };
}

export async function syncReengagementNotifications(config) {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const activityRows = await selectRows(config, "notification_user_activity", {
    select: "user_id,last_opened_at,last_reengagement_notification_at",
    last_opened_at: `lt.${fiveDaysAgo}`
  });
  const eligible = activityRows.filter((activity) => {
    if (!activity.last_reengagement_notification_at) {
      return true;
    }

    return new Date(activity.last_reengagement_notification_at).getTime() < new Date(activity.last_opened_at).getTime();
  });
  if (!eligible.length) {
    return { eligible: 0, sent: 0 };
  }

  const earliestRelevant = new Date(
    Math.max(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
      Math.min(...eligible.map((activity) => new Date(activity.last_opened_at).getTime()))
    )
  ).toISOString();
  const [follows, reactions] = await Promise.all([
    selectRows(config, "user_follows", { select: "follower_id,following_id" }),
    selectRows(config, "media_reactions", {
      select: "user_id,tmdb_id,media_type,reaction,created_at",
      created_at: `gte.${earliestRelevant}`,
      reaction: "in.(superliked,liked,disliked,watchlist)"
    })
  ]);
  const followingByUser = new Map();
  follows.forEach((follow) => {
    const list = followingByUser.get(follow.follower_id) ?? [];
    list.push(follow.following_id);
    followingByUser.set(follow.follower_id, list);
  });
  let sent = 0;

  for (const activity of eligible) {
    const following = new Set(followingByUser.get(activity.user_id) ?? []);
    if (!following.size) {
      continue;
    }

    const newReactions = reactions.filter(
      (reaction) =>
        following.has(reaction.user_id) &&
        new Date(reaction.created_at).getTime() > new Date(activity.last_opened_at).getTime()
    );
    if (!newReactions.length) {
      continue;
    }

    const people = new Set(newReactions.map((reaction) => reaction.user_id)).size;
    const titles = new Set(newReactions.map((reaction) => `${reaction.media_type}-${reaction.tmdb_id}`)).size;
    const result = await deliverPush(config, {
      recipientUserId: activity.user_id,
      eventKey: `reengagement:${activity.user_id}:${activity.last_opened_at}`,
      notificationType: "reengagement",
      title: "Hay novedades en tu círculo",
      body: `${people} ${people === 1 ? "persona marcó" : "personas marcaron"} ${titles} ${
        titles === 1 ? "película o serie nueva" : "películas o series nuevas"
      } desde tu última visita.`,
      targetPath: "/?view=feed",
      metadata: { type: "reengagement" }
    });

    if (result.status === "sent" || result.status === "duplicate") {
      sent += result.status === "sent" ? 1 : 0;
      await supabaseRest(
        config,
        restPath("notification_user_activity", { user_id: `eq.${activity.user_id}` }),
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ last_reengagement_notification_at: new Date().toISOString() })
        }
      );
    }
  }

  return { eligible: eligible.length, sent };
}
