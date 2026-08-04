import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
};

type EnsureProfileInput = {
  user: User;
  username?: string;
  displayName?: string;
};

function buildFallbackUsername(email: string | undefined, userId: string) {
  const base = email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
  return (base && base.length >= 3 ? base : `cinerian_${userId.slice(0, 8)}`).slice(0, 24);
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  username: string;
  displayName: string;
}) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  return supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        username: input.username,
        display_name: input.displayName
      }
    }
  });
}

export async function signInWithEmail(input: { email: string; password: string }) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  return supabase.auth.signInWithPassword(input);
}

export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin
    }
  });
}

export async function signOut() {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function ensureProfile({
  user,
  username,
  displayName
}: EnsureProfileInput): Promise<Profile> {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const email = user.email;
  const safeUsername =
    username ||
    (typeof user.user_metadata.username === "string" ? user.user_metadata.username : undefined) ||
    buildFallbackUsername(email, user.id);
  const safeDisplayName =
    displayName ||
    (typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : undefined) ||
    (typeof user.user_metadata.name === "string" ? user.user_metadata.name : undefined) ||
    (typeof user.user_metadata.display_name === "string"
      ? user.user_metadata.display_name
      : undefined) ||
    safeUsername;
  const safeAvatarUrl =
    typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : null;

  const payload = {
    id: user.id,
    username: safeUsername,
    display_name: safeDisplayName,
    avatar_url: safeAvatarUrl,
    bio: null
  };

  const { error: upsertError } = await supabase.from("profiles").upsert(payload);
  if (upsertError) {
    throw upsertError;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    throw error ?? new Error("No pude leer el perfil.");
  }

  return data as Profile;
}

export async function getProfileById(userId: string): Promise<Profile | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as Profile | null) ?? null;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .ilike("username", username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as Profile | null) ?? null;
}

export async function listProfiles(): Promise<Profile[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .order("display_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as Profile[] | null) ?? [];
}
