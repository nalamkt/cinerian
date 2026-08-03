import { supabase } from "./supabase";
import type { FeedEntry, MediaType } from "../types";

type FeedPostRow = {
  id: string;
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
    .select("id, body, post_type, created_at, tmdb_id, media_type, profiles(display_name, username)")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    throw error;
  }

  return ((data ?? []) as FeedPostRow[]).map((entry) => {
    const profile = extractProfile(entry.profiles);

    return {
      id: entry.id,
      author: profile?.display_name ?? "Cineriano",
      body: entry.body,
      createdAtLabel: formatRelativeLabel(entry.created_at),
      type: entry.post_type,
      tmdbId: entry.tmdb_id ?? undefined,
      mediaType: entry.media_type ?? undefined
    };
  });
}
