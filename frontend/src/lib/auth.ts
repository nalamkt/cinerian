import type { Session, User } from "@supabase/supabase-js";
import { trackProductEvent } from "./analytics";
import { supabase } from "./supabase";

export type ProfileCollection = {
  id: string;
  title: string;
  description: string | null;
  items: Array<{ tmdbId: number; mediaType: "movie" | "tv" }>;
};

export type CurrentWatchingEntry = {
  tmdbId: number;
  mediaType: "tv";
  addedAt: string;
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

export type Gender = "hombre" | "mujer" | "otro" | "no_dice";

export const GENDER_OPTIONS: Array<{ id: Gender; label: string }> = [
  { id: "hombre", label: "Hombre" },
  { id: "mujer", label: "Mujer" },
  { id: "otro", label: "Otro" },
  { id: "no_dice", label: "Prefiero no decir" }
];

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
  current_watching: CurrentWatchingEntry[];
  visibility_settings: ProfileVisibilitySettings;
  gender: Gender | null;
  birth_date: string | null;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  gender: string | null;
  birth_date: string | null;
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
  current_watching:
    | Array<{ tmdbId?: number | string; mediaType?: "tv" | string; addedAt?: string | null }>
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
  currentWatching: CurrentWatchingEntry[];
  visibilitySettings: ProfileVisibilitySettings;
  gender: Gender | null;
  birthDate: string | null;
};

const PROFILE_SELECT =
  "id, username, display_name, avatar_url, banner_url, bio, gender, birth_date, favorite_genres, favorite_titles, featured_collections, current_watching, visibility_settings";
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

function normalizeGender(value: string | null): Gender | null {
  return value === "hombre" || value === "mujer" || value === "otro" || value === "no_dice"
    ? value
    : null;
}

function normalizeProfileRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    banner_url: row.banner_url,
    bio: row.bio,
    gender: normalizeGender(row.gender),
    birth_date: row.birth_date,
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
    current_watching: Array.isArray(row.current_watching)
      ? row.current_watching
          .map((entry) => ({
            tmdbId: Number(entry.tmdbId),
            mediaType: "tv" as const,
            addedAt:
              typeof entry.addedAt === "string" && entry.addedAt.trim().length
                ? entry.addedAt
                : new Date().toISOString()
          }))
          .filter((entry) => Number.isFinite(entry.tmdbId))
      : [],
    visibility_settings: {
      ...defaultVisibilitySettings(),
      ...(row.visibility_settings ?? {})
    }
  };
}

function isMissingProfileColumnsError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : null;

  if (!message) {
    return false;
  }

  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("banner_url") ||
    normalizedMessage.includes("gender") ||
    normalizedMessage.includes("birth_date") ||
    normalizedMessage.includes("favorite_genres") ||
    normalizedMessage.includes("favorite_titles") ||
    normalizedMessage.includes("featured_collections") ||
    normalizedMessage.includes("current_watching") ||
    normalizedMessage.includes("visibility_settings") ||
    normalizedMessage.includes("column")
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
    gender: null,
    birth_date: null,
    favorite_genres: [],
    favorite_titles: [],
    featured_collections: [],
    current_watching: [],
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

  await trackProductEvent({
    eventName: "auth_magic_link_requested",
    metadata: {
      emailDomain: email.includes("@") ? email.split("@")[1] : null
    }
  });

  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin
    }
  });
}

export async function verifyEmailOtp(input: { email: string; token: string }) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  return supabase.auth.verifyOtp({
    email: input.email,
    token: input.token,
    type: "email"
  });
}

export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  await trackProductEvent({
    eventName: "auth_google_started"
  });

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

export type EnsureProfileResult = {
  profile: Profile;
  wasCreated: boolean;
};

export async function ensureProfile({
  user,
  username,
  displayName
}: EnsureProfileInput): Promise<EnsureProfileResult> {
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
    return { profile: existingProfile, wasCreated: false };
  }

  const payload = {
    id: user.id,
    username: safeUsername,
    display_name: safeDisplayName,
    avatar_url: safeAvatarUrl,
    banner_url: null,
    bio: null,
    gender: null,
    birth_date: null,
    favorite_genres: [],
    favorite_titles: [],
    featured_collections: [],
    current_watching: [],
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

      await trackProductEvent({
        eventName: "profile_created",
        userId: user.id
      });

      return { profile: normalizeLegacyProfileRow(legacyInsert.data), wasCreated: true };
    }

    throw error ?? new Error("No pude leer el perfil.");
  }

  await trackProductEvent({
    eventName: "profile_created",
    userId: user.id
  });

  return { profile: normalizeProfileRow(data), wasCreated: true };
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
    gender: input.gender,
    birth_date: input.birthDate?.trim() ? input.birthDate.trim() : null,
    favorite_genres: input.favoriteGenres,
    favorite_titles: input.favoriteTitles,
    featured_collections: input.featuredCollections,
    current_watching: input.currentWatching,
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
