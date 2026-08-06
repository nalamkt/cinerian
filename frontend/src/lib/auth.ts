import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type ProfileCollection = {
  id: string;
  title: string;
  description: string | null;
  items: Array<{ tmdbId: number; mediaType: "movie" | "tv" }>;
};

export type ProfileVisibilitySettings = {
  showFollowers: boolean;
  showFollowing: boolean;
  showCollections: boolean;
  showBadges: boolean;
  showInsights: boolean;
  showActivity: boolean;
  showWatchlist: boolean;
};

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  favorite_genres: string[];
  favorite_titles: Array<{ tmdbId: number; mediaType: "movie" | "tv" }>;
  featured_collections: ProfileCollection[];
  visibility_settings: ProfileVisibilitySettings;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  favorite_genres: string[] | null;
  favorite_titles:
    | Array<{ tmdbId?: number | string; mediaType?: "movie" | "tv" | string }>
    | null;
  featured_collections:
    | Array<{
        id?: string;
        title?: string;
        description?: string | null;
        items?: Array<{ tmdbId?: number | string; mediaType?: "movie" | "tv" | string }>;
      }>
    | null;
  visibility_settings:
    | Partial<ProfileVisibilitySettings>
    | null;
};

type EnsureProfileInput = {
  user: User;
  username?: string;
  displayName?: string;
};

type UpdateProfileInput = {
  userId: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  favoriteGenres: string[];
  favoriteTitles: Array<{ tmdbId: number; mediaType: "movie" | "tv" }>;
  featuredCollections: ProfileCollection[];
  visibilitySettings: ProfileVisibilitySettings;
};

const PROFILE_SELECT =
  "id, username, display_name, avatar_url, banner_url, bio, favorite_genres, favorite_titles, featured_collections, visibility_settings";
const LEGACY_PROFILE_SELECT = "id, username, display_name, avatar_url, bio";

function defaultVisibilitySettings(): ProfileVisibilitySettings {
  return {
    showFollowers: false,
    showFollowing: false,
    showCollections: false,
    showBadges: false,
    showInsights: false,
    showActivity: false,
    showWatchlist: true
  };
}

function normalizeProfileRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    banner_url: row.banner_url,
    bio: row.bio,
    favorite_genres: Array.isArray(row.favorite_genres)
      ? row.favorite_genres.filter((genre): genre is string => typeof genre === "string")
      : [],
    favorite_titles: Array.isArray(row.favorite_titles)
      ? row.favorite_titles
          .map((entry) => ({
            tmdbId: Number(entry.tmdbId),
            mediaType: (entry.mediaType === "tv" ? "tv" : "movie") as "movie" | "tv"
          }))
          .filter((entry) => Number.isFinite(entry.tmdbId))
      : [],
    featured_collections: Array.isArray(row.featured_collections)
      ? row.featured_collections
          .map((collection) => ({
            id:
              typeof collection.id === "string" && collection.id.trim().length
                ? collection.id
                : crypto.randomUUID(),
            title:
              typeof collection.title === "string" && collection.title.trim().length
                ? collection.title.trim()
                : "",
            description:
              typeof collection.description === "string" && collection.description.trim().length
                ? collection.description.trim()
                : null,
            items: Array.isArray(collection.items)
              ? collection.items
                  .map((entry) => ({
                    tmdbId: Number(entry.tmdbId),
                    mediaType: (entry.mediaType === "tv" ? "tv" : "movie") as "movie" | "tv"
                  }))
                  .filter((entry) => Number.isFinite(entry.tmdbId))
              : []
          }))
          .filter((collection) => collection.title.length > 0 && collection.items.length > 0)
      : [],
    visibility_settings: {
      ...defaultVisibilitySettings(),
      ...(row.visibility_settings ?? {})
    }
  };
}

function isMissingProfileColumnsError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("banner_url") ||
    message.includes("favorite_genres") ||
    message.includes("favorite_titles") ||
    message.includes("featured_collections") ||
    message.includes("visibility_settings") ||
    message.includes("column")
  );
}

function normalizeLegacyProfileRow(
  row: Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url" | "bio">
): Profile {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    banner_url: null,
    bio: row.bio,
    favorite_genres: [],
    favorite_titles: [],
    featured_collections: [],
    visibility_settings: defaultVisibilitySettings()
  };
}

async function selectProfileById(userId: string): Promise<Profile | null> {
  if (!supabase) {
    return null;
  }

  const advancedResult = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (!advancedResult.error) {
    return advancedResult.data ? normalizeProfileRow(advancedResult.data) : null;
  }

  if (!isMissingProfileColumnsError(advancedResult.error)) {
    throw advancedResult.error;
  }

  const legacyResult = await supabase
    .from("profiles")
    .select(LEGACY_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle<Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url" | "bio">>();

  if (legacyResult.error) {
    throw legacyResult.error;
  }

  return legacyResult.data ? normalizeLegacyProfileRow(legacyResult.data) : null;
}

async function selectProfileByUsername(username: string): Promise<Profile | null> {
  if (!supabase) {
    return null;
  }

  const advancedResult = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .ilike("username", username)
    .maybeSingle<ProfileRow>();

  if (!advancedResult.error) {
    return advancedResult.data ? normalizeProfileRow(advancedResult.data) : null;
  }

  if (!isMissingProfileColumnsError(advancedResult.error)) {
    throw advancedResult.error;
  }

  const legacyResult = await supabase
    .from("profiles")
    .select(LEGACY_PROFILE_SELECT)
    .ilike("username", username)
    .maybeSingle<Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url" | "bio">>();

  if (legacyResult.error) {
    throw legacyResult.error;
  }

  return legacyResult.data ? normalizeLegacyProfileRow(legacyResult.data) : null;
}

async function listProfileRows(): Promise<Profile[]> {
  if (!supabase) {
    return [];
  }

  const advancedResult = await supabase.from("profiles").select(PROFILE_SELECT).order("display_name", {
    ascending: true
  });

  if (!advancedResult.error) {
    return ((advancedResult.data as ProfileRow[] | null) ?? []).map(normalizeProfileRow);
  }

  if (!isMissingProfileColumnsError(advancedResult.error)) {
    throw advancedResult.error;
  }

  const legacyResult = await supabase
    .from("profiles")
    .select(LEGACY_PROFILE_SELECT)
    .order("display_name", { ascending: true });

  if (legacyResult.error) {
    throw legacyResult.error;
  }

  return (
    (legacyResult.data as Array<
      Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url" | "bio">
    > | null) ?? []
  ).map(normalizeLegacyProfileRow);
}

function buildFallbackUsername(email: string | undefined, userId: string) {
  const base = email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
  return (base && base.length >= 3 ? base : `cinerian_${userId.slice(0, 8)}`).slice(0, 24);
}

export async function sendMagicLink(email: string) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin
    }
  });
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

  const existingProfile = await selectProfileById(user.id);
  if (existingProfile) {
    return existingProfile;
  }

  const payload = {
    id: user.id,
    username: safeUsername,
    display_name: safeDisplayName,
    avatar_url: safeAvatarUrl,
    banner_url: null,
    bio: null,
    favorite_genres: [],
    favorite_titles: [],
    featured_collections: [],
    visibility_settings: defaultVisibilitySettings()
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(payload)
    .select(PROFILE_SELECT)
    .single<ProfileRow>();

  if (error || !data) {
    if (error && isMissingProfileColumnsError(error)) {
      const legacyInsert = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          username: safeUsername,
          display_name: safeDisplayName,
          avatar_url: safeAvatarUrl,
          bio: null
        })
        .select(LEGACY_PROFILE_SELECT)
        .single<Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url" | "bio">>();

      if (legacyInsert.error || !legacyInsert.data) {
        throw legacyInsert.error ?? new Error("No pude leer el perfil.");
      }

      return normalizeLegacyProfileRow(legacyInsert.data);
    }

    throw error ?? new Error("No pude leer el perfil.");
  }

  return normalizeProfileRow(data);
}

export async function updateProfile(input: UpdateProfileInput): Promise<Profile> {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const payload = {
    username: input.username.trim(),
    display_name: input.displayName.trim(),
    bio: input.bio?.trim() ? input.bio.trim() : null,
    avatar_url: input.avatarUrl?.trim() ? input.avatarUrl.trim() : null,
    banner_url: input.bannerUrl?.trim() ? input.bannerUrl.trim() : null,
    favorite_genres: input.favoriteGenres,
    favorite_titles: input.favoriteTitles,
    featured_collections: input.featuredCollections,
    visibility_settings: input.visibilitySettings
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", input.userId)
    .select(PROFILE_SELECT)
    .single<ProfileRow>();

  if (error || !data) {
    if (error && isMissingProfileColumnsError(error)) {
      const legacyUpdate = await supabase
        .from("profiles")
        .update({
          username: input.username.trim(),
          display_name: input.displayName.trim(),
          bio: input.bio?.trim() ? input.bio.trim() : null,
          avatar_url: input.avatarUrl?.trim() ? input.avatarUrl.trim() : null
        })
        .eq("id", input.userId)
        .select(LEGACY_PROFILE_SELECT)
        .single<Pick<ProfileRow, "id" | "username" | "display_name" | "avatar_url" | "bio">>();

      if (legacyUpdate.error || !legacyUpdate.data) {
        throw legacyUpdate.error ?? new Error("No pude actualizar el perfil.");
      }

      return normalizeLegacyProfileRow(legacyUpdate.data);
    }

    throw error ?? new Error("No pude actualizar el perfil.");
  }

  return normalizeProfileRow(data);
}

export async function getProfileById(userId: string): Promise<Profile | null> {
  return selectProfileById(userId);
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  return selectProfileByUsername(username);
}

export async function listProfiles(): Promise<Profile[]> {
  return listProfileRows();
}
