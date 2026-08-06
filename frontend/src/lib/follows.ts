import { supabase } from "./supabase";

export async function fetchFollowerCount(userId: string): Promise<number> {
  if (!supabase) {
    return 0;
  }

  const { count, error } = await supabase
    .from("user_follows")
    .select("following_id", { count: "exact", head: true })
    .eq("following_id", userId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function isFollowingUser(followerId: string, followingId: string): Promise<boolean> {
  if (!supabase || followerId === followingId) {
    return false;
  }

  const { data, error } = await supabase
    .from("user_follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function followUser(followerId: string, followingId: string) {
  if (!supabase || followerId === followingId) {
    return;
  }

  const { error } = await supabase.from("user_follows").upsert(
    {
      follower_id: followerId,
      following_id: followingId
    },
    { onConflict: "follower_id,following_id" }
  );

  if (error) {
    throw error;
  }
}

export async function unfollowUser(followerId: string, followingId: string) {
  if (!supabase || followerId === followingId) {
    return;
  }

  const { error } = await supabase
    .from("user_follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);

  if (error) {
    throw error;
  }
}

export async function fetchFollowingUserIds(userId: string): Promise<string[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => entry.following_id as string);
}

export async function fetchFollowerUserIds(userId: string): Promise<string[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_follows")
    .select("follower_id")
    .eq("following_id", userId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => entry.follower_id as string);
}
