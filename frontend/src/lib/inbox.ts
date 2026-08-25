import { getTitleById } from "./tmdb";
import { listProfiles, type Profile } from "./auth";
import { trackProductEvent } from "./analytics";
import { supabase } from "./supabase";
import type {
  CommentInboxNotification,
  DiscoveryItem,
  MediaType,
  RecommendationMessage,
  RecommendationReply
} from "../types";

export const INBOX_UPDATED_EVENT = "cinerian:inbox-updated";

type RecommendationMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_url: string | null;
  year: string | null;
  note: string | null;
  created_at: string;
  read_at: string | null;
};

type RecommendationReplyRow = {
  id: string;
  message_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type CommentNotificationRow = {
  id: string;
  comment_id: string;
  post_id: string;
  actor_user_id: string;
  recipient_user_id: string;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
  feed_post_comments:
    | {
        body: string;
      }
    | {
        body: string;
      }[]
    | null;
  feed_posts:
    | {
        body: string;
        post_type: "rating" | "recommendation" | "watchlist";
        tmdb_id: number | null;
        media_type: MediaType | null;
      }
    | {
        body: string;
        post_type: "rating" | "recommendation" | "watchlist";
        tmdb_id: number | null;
        media_type: MediaType | null;
      }[]
    | null;
};

function isMissingReadAtColumn(error: { message?: string; details?: string; hint?: string } | null) {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return haystack.includes("read_at") && (haystack.includes("column") || haystack.includes("schema cache"));
}

function dispatchInboxUpdate(userId: string) {
  window.dispatchEvent(
    new CustomEvent(INBOX_UPDATED_EVENT, {
      detail: { userId }
    })
  );
}

export function emitInboxUpdate(userId: string) {
  dispatchInboxUpdate(userId);
}

function formatRelativeLabel(dateString: string) {
  const created = new Date(dateString).getTime();
  const diffMs = Date.now() - created;
  const diffMin = Math.max(0, Math.round(diffMs / 60000));

  if (diffMin < 1) {
    return "Ahora";
  }

  if (diffMin < 60) {
    return `Hace ${diffMin} min`;
  }

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Hace ${diffDays} d`;
}

function buildFallbackItem(row: RecommendationMessageRow): DiscoveryItem {
  return {
    id: row.tmdb_id,
    title: row.title,
    year: row.year ?? "Sin fecha",
    mediaType: row.media_type,
    overview: "",
    posterUrl: row.poster_url ?? "/images/base.png",
    genres: [],
    providers: [],
    score: 0
  };
}

function extractNested<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

async function hydrateItem(row: RecommendationMessageRow) {
  const fallback = buildFallbackItem(row);

  try {
    return (await getTitleById(row.tmdb_id, row.media_type)) ?? fallback;
  } catch {
    return fallback;
  }
}

async function hydrateNotificationItem(row: CommentNotificationRow) {
  const post = extractNested(row.feed_posts);
  if (!post?.tmdb_id || !post.media_type) {
    return null;
  }

  try {
    return await getTitleById(post.tmdb_id, post.media_type);
  } catch {
    return null;
  }
}

function profileMapFromList(profiles: Profile[]) {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function isMissingCommentNotificationTable(error: { message?: string; details?: string; hint?: string } | null) {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return haystack.includes("feed_post_comment_notifications") && (haystack.includes("does not exist") || haystack.includes("schema cache"));
}

async function fetchMessagesByColumn(column: "sender_id" | "recipient_id", userId: string) {
  if (!supabase) {
    return [];
  }

  const primaryQuery = await supabase
    .from("recommendation_messages")
    .select("id, sender_id, recipient_id, tmdb_id, media_type, title, poster_url, year, note, created_at, read_at")
    .eq(column, userId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (!primaryQuery.error) {
    return (primaryQuery.data ?? []) as RecommendationMessageRow[];
  }

  if (!isMissingReadAtColumn(primaryQuery.error)) {
    throw primaryQuery.error;
  }

  const fallbackQuery = await supabase
    .from("recommendation_messages")
    .select("id, sender_id, recipient_id, tmdb_id, media_type, title, poster_url, year, note, created_at")
    .eq(column, userId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (fallbackQuery.error) {
    throw fallbackQuery.error;
  }

  return ((fallbackQuery.data ?? []) as Omit<RecommendationMessageRow, "read_at">[]).map((row) => ({
    ...row,
    read_at: null
  }));
}

async function mapMessageRows(rows: RecommendationMessageRow[]): Promise<RecommendationMessage[]> {
  const [profiles, items, replies] = await Promise.all([
    listProfiles(),
    Promise.all(rows.map((row) => hydrateItem(row))),
    fetchRepliesForMessages(rows.map((row) => row.id))
  ]);

  const profileMap = profileMapFromList(profiles);
  const repliesByMessage = groupRepliesByMessage(replies, profileMap);

  return rows.map((row, index) => ({
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    readAt: row.read_at,
    senderProfile: profileMap.get(row.sender_id) ?? null,
    recipientProfile: profileMap.get(row.recipient_id) ?? null,
    note: row.note ?? "",
    createdAt: row.created_at,
    createdAtLabel: formatRelativeLabel(row.created_at),
    item: items[index],
    replies: repliesByMessage.get(row.id) ?? []
  }));
}

async function fetchRepliesForMessages(messageIds: string[]) {
  if (!supabase || !messageIds.length) {
    return [] as RecommendationReplyRow[];
  }

  const { data, error } = await supabase
    .from("recommendation_message_replies")
    .select("id, message_id, sender_id, body, created_at")
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as RecommendationReplyRow[];
}

function groupRepliesByMessage(
  rows: RecommendationReplyRow[],
  profileMap: Map<string, Profile>
) {
  const grouped = new Map<string, RecommendationReply[]>();

  rows.forEach((row) => {
    const mapped: RecommendationReply = {
      id: row.id,
      messageId: row.message_id,
      senderId: row.sender_id,
      senderProfile: profileMap.get(row.sender_id) ?? null,
      body: row.body,
      createdAt: row.created_at,
      createdAtLabel: formatRelativeLabel(row.created_at)
    };

    const current = grouped.get(row.message_id) ?? [];
    current.push(mapped);
    grouped.set(row.message_id, current);
  });

  return grouped;
}

export async function sendRecommendationMessage(input: {
  senderId: string;
  recipientId: string;
  item: DiscoveryItem;
  note?: string;
}) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("recommendation_messages").insert({
    sender_id: input.senderId,
    recipient_id: input.recipientId,
    tmdb_id: input.item.id,
    media_type: input.item.mediaType,
    title: input.item.title,
    poster_url: input.item.posterUrl,
    year: input.item.year,
    note: input.note?.trim() || null
  });

  if (error) {
    throw error;
  }

  await trackProductEvent({
    eventName: "recommendation_sent",
    userId: input.senderId,
    featureKey: "inbox",
    metadata: {
      recipientId: input.recipientId,
      tmdbId: input.item.id,
      mediaType: input.item.mediaType
    }
  });

  dispatchInboxUpdate(input.senderId);
  dispatchInboxUpdate(input.recipientId);
}

export async function fetchUnreadInboxCount(userId: string): Promise<number> {
  if (!supabase) {
    return 0;
  }

  const [recommendationResult, commentResult] = await Promise.all([
    supabase
      .from("recommendation_messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null),
    supabase
      .from("feed_post_comment_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", userId)
      .is("read_at", null)
      .is("deleted_at", null)
  ]);

  if (recommendationResult.error) {
    if (isMissingReadAtColumn(recommendationResult.error)) {
      return 0;
    }

    throw recommendationResult.error;
  }

  if (commentResult.error && !isMissingCommentNotificationTable(commentResult.error)) {
    throw commentResult.error;
  }

  return (recommendationResult.count ?? 0) + (commentResult.count ?? 0);
}

export async function fetchCommentNotifications(userId: string): Promise<CommentInboxNotification[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("feed_post_comment_notifications")
    .select(
      "id, comment_id, post_id, actor_user_id, recipient_user_id, created_at, read_at, deleted_at, feed_post_comments(body), feed_posts(body, post_type, tmdb_id, media_type)"
    )
    .eq("recipient_user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    if (isMissingCommentNotificationTable(error)) {
      return [];
    }

    throw error;
  }

  const rows = (data ?? []) as CommentNotificationRow[];
  const [profiles, items] = await Promise.all([
    listProfiles(),
    Promise.all(rows.map((row) => hydrateNotificationItem(row)))
  ]);
  const profileMap = profileMapFromList(profiles);

  return rows.map((row, index) => {
    const comment = extractNested(row.feed_post_comments);
    const post = extractNested(row.feed_posts);

    return {
      id: row.id,
      commentId: row.comment_id,
      postId: row.post_id,
      actorId: row.actor_user_id,
      recipientId: row.recipient_user_id,
      actorProfile: profileMap.get(row.actor_user_id) ?? null,
      body: comment?.body ?? "",
      createdAt: row.created_at,
      createdAtLabel: formatRelativeLabel(row.created_at),
      readAt: row.read_at,
      postBody: post?.body ?? "",
      postType: post?.post_type ?? "recommendation",
      item: items[index]
    };
  });
}

export async function markInboxAsRead(userId: string) {
  if (!supabase) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("recommendation_messages")
    .update({ read_at: now })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) {
    if (isMissingReadAtColumn(error)) {
      return;
    }

    throw error;
  }

  dispatchInboxUpdate(userId);
}

export async function markCommentNotificationsAsRead(userId: string) {
  if (!supabase) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("feed_post_comment_notifications")
    .update({ read_at: now })
    .eq("recipient_user_id", userId)
    .is("read_at", null)
    .is("deleted_at", null);

  if (error) {
    if (isMissingCommentNotificationTable(error)) {
      return;
    }

    throw error;
  }

  dispatchInboxUpdate(userId);
}

export async function setInboxMessageReadState(input: {
  messageId: string;
  userId: string;
  read: boolean;
}) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("recommendation_messages")
    .update({ read_at: input.read ? new Date().toISOString() : null })
    .eq("id", input.messageId)
    .eq("recipient_id", input.userId);

  if (error) {
    if (isMissingReadAtColumn(error)) {
      return;
    }

    throw error;
  }

  dispatchInboxUpdate(input.userId);
}

export async function setCommentNotificationReadState(input: {
  notificationId: string;
  userId: string;
  read: boolean;
}) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("feed_post_comment_notifications")
    .update({ read_at: input.read ? new Date().toISOString() : null })
    .eq("id", input.notificationId)
    .eq("recipient_user_id", input.userId);

  if (error) {
    if (isMissingCommentNotificationTable(error)) {
      return;
    }

    throw error;
  }

  dispatchInboxUpdate(input.userId);
}

export async function deleteInboxMessage(input: { messageId: string; userId: string }) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("recommendation_messages")
    .delete()
    .eq("id", input.messageId)
    .eq("recipient_id", input.userId);

  if (error) {
    throw error;
  }

  dispatchInboxUpdate(input.userId);
}

export async function deleteCommentNotification(input: { notificationId: string; userId: string }) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("feed_post_comment_notifications")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.notificationId)
    .eq("recipient_user_id", input.userId);

  if (error) {
    if (isMissingCommentNotificationTable(error)) {
      return;
    }

    throw error;
  }

  dispatchInboxUpdate(input.userId);
}

export async function sendRecommendationReply(input: {
  messageId: string;
  senderId: string;
  body: string;
  recipientId: string;
}) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("recommendation_message_replies").insert({
    message_id: input.messageId,
    sender_id: input.senderId,
    body: input.body.trim()
  });

  if (error) {
    throw error;
  }

  dispatchInboxUpdate(input.senderId);
  dispatchInboxUpdate(input.recipientId);
}

export async function fetchReceivedMessages(userId: string): Promise<RecommendationMessage[]> {
  const rows = await fetchMessagesByColumn("recipient_id", userId);
  return mapMessageRows(rows);
}

export async function fetchSentMessages(userId: string): Promise<RecommendationMessage[]> {
  const rows = await fetchMessagesByColumn("sender_id", userId);
  return mapMessageRows(rows);
}
