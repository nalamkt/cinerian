import { emitInboxUpdate } from "./inbox";
import { supabase } from "./supabase";
import type { FeedComment, FeedEntry, MediaType } from "../types";

type FeedPostRow = {
  id: string;
  user_id: string;
  body: string;
  post_type: "rating" | "recommendation" | "watchlist";
  created_at: string;
  tmdb_id: number | null;
  media_type: MediaType | null;
  profiles:
    | {
        display_name: string;
        username: string;
      }
    | {
        display_name: string;
        username: string;
      }[]
    | null;
};

type FeedCommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles:
    | {
        display_name: string;
        username: string;
      }
    | {
        display_name: string;
        username: string;
      }[]
    | null;
};

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

function extractProfile(
  profiles: FeedPostRow["profiles"]
): { display_name: string; username: string } | null {
  if (!profiles) {
    return null;
  }

  return Array.isArray(profiles) ? profiles[0] ?? null : profiles;
}

function normalizeFeedBody(body: string, type: FeedPostRow["post_type"]) {
  if (type !== "watchlist" && type !== "recommendation") {
    return body;
  }

  const legacyFavoriteMatch = body.match(/^Le gusto (.+?) y la guardo entre sus favoritas\.?$/);
  if (legacyFavoriteMatch) {
    return "La guardo en su Watchlist.";
  }

  const legacySearchMatch = body.match(/^Le gusto (.+?) y la guardo desde el buscador\.?$/);
  if (legacySearchMatch) {
    return "La guardo en su Watchlist.";
  }

  const plainWatchlistMatch = body.match(/^Guardo (.+?) en su Watchlist(?: para verla despues| desde el buscador)?\.?$/);
  if (plainWatchlistMatch) {
    return "La guardo en su Watchlist.";
  }

  return body;
}

function mapFeedRow(entry: FeedPostRow): FeedEntry {
  const profile = extractProfile(entry.profiles);

  return {
    id: entry.id,
    userId: entry.user_id,
    author: profile?.display_name ?? "Cineriano",
    username: profile?.username ?? undefined,
    body: normalizeFeedBody(entry.body, entry.post_type),
    createdAtLabel: formatRelativeLabel(entry.created_at),
    createdAt: entry.created_at,
    type: entry.post_type,
    tmdbId: entry.tmdb_id ?? undefined,
    mediaType: entry.media_type ?? undefined
  };
}

function mapFeedCommentRow(entry: FeedCommentRow): FeedComment {
  const profile = extractProfile(entry.profiles);

  return {
    id: entry.id,
    postId: entry.post_id,
    userId: entry.user_id,
    author: profile?.display_name ?? "Cineriano",
    username: profile?.username ?? undefined,
    body: entry.body,
    createdAtLabel: formatRelativeLabel(entry.created_at),
    createdAt: entry.created_at
  };
}

export async function createFeedPost(input: {
  userId: string;
  body: string;
  postType: FeedEntry["type"];
  tmdbId?: number;
  mediaType?: MediaType;
}) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("feed_posts").insert({
    user_id: input.userId,
    body: input.body,
    post_type: input.postType,
    tmdb_id: input.tmdbId ?? null,
    media_type: input.mediaType ?? null
  });

  if (error) {
    throw error;
  }
}

export async function fetchFeedPosts(): Promise<FeedEntry[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("feed_posts")
    .select("id, user_id, body, post_type, created_at, tmdb_id, media_type, profiles(display_name, username)")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    throw error;
  }

  return ((data ?? []) as FeedPostRow[]).map(mapFeedRow);
}

export async function fetchFeedPostsByUsers(userIds: string[]): Promise<FeedEntry[]> {
  if (!supabase || !userIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("feed_posts")
    .select("id, user_id, body, post_type, created_at, tmdb_id, media_type, profiles(display_name, username)")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    throw error;
  }

  return ((data ?? []) as FeedPostRow[]).map(mapFeedRow);
}

export async function fetchUserTextPosts(userId: string): Promise<FeedEntry[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("feed_posts")
    .select("id, user_id, body, post_type, created_at, tmdb_id, media_type, profiles(display_name, username)")
    .eq("user_id", userId)
    .is("tmdb_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as FeedPostRow[]).map(mapFeedRow);
}

export async function fetchUserMediaPosts(userId: string): Promise<FeedEntry[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("feed_posts")
    .select("id, user_id, body, post_type, created_at, tmdb_id, media_type, profiles(display_name, username)")
    .eq("user_id", userId)
    .not("tmdb_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as FeedPostRow[]).map(mapFeedRow);
}

export async function updateFeedPost(input: { postId: string; userId: string; body: string }) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("feed_posts")
    .update({ body: input.body })
    .eq("id", input.postId)
    .eq("user_id", input.userId);

  if (error) {
    throw error;
  }
}

export async function deleteFeedPost(input: { postId: string; userId: string }) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("feed_posts")
    .delete()
    .eq("id", input.postId)
    .eq("user_id", input.userId);

  if (error) {
    throw error;
  }
}

export async function fetchFeedComments(postIds: string[]): Promise<Record<string, FeedComment[]>> {
  if (!supabase || !postIds.length) {
    return {};
  }

  const { data, error } = await supabase
    .from("feed_post_comments")
    .select("id, post_id, user_id, body, created_at, profiles(display_name, username)")
    .in("post_id", postIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as FeedCommentRow[]).reduce<Record<string, FeedComment[]>>((accumulator, row) => {
    const mapped = mapFeedCommentRow(row);
    if (!accumulator[mapped.postId]) {
      accumulator[mapped.postId] = [];
    }
    accumulator[mapped.postId].push(mapped);
    return accumulator;
  }, {});
}

export async function createFeedComment(input: { postId: string; userId: string; body: string }) {
  if (!supabase) {
    return;
  }

  const { data: post, error: postError } = await supabase
    .from("feed_posts")
    .select("id, user_id")
    .eq("id", input.postId)
    .single();

  if (postError) {
    throw postError;
  }

  const { data: comment, error } = await supabase
    .from("feed_post_comments")
    .insert({
      post_id: input.postId,
      user_id: input.userId,
      body: input.body.trim()
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  if (post.user_id !== input.userId && comment?.id) {
    const { error: notificationError } = await supabase
      .from("feed_post_comment_notifications")
      .insert({
        comment_id: comment.id,
        post_id: input.postId,
        actor_user_id: input.userId,
        recipient_user_id: post.user_id
      });

    if (!notificationError) {
      emitInboxUpdate(post.user_id);
    }
  }
}
