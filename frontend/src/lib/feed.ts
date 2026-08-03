import { supabase } from "./supabase";
import type { FeedEntry, MediaType } from "../types";

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

function mapFeedRow(entry: FeedPostRow): FeedEntry {
  const profile = extractProfile(entry.profiles);

  return {
    id: entry.id,
    userId: entry.user_id,
    author: profile?.display_name ?? "Cineriano",
    username: profile?.username ?? undefined,
    body: entry.body,
    createdAtLabel: formatRelativeLabel(entry.created_at),
    createdAt: entry.created_at,
    type: entry.post_type,
    tmdbId: entry.tmdb_id ?? undefined,
    mediaType: entry.media_type ?? undefined
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
    .limit(30);

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
