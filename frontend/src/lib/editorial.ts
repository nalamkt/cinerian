import { supabase } from "./supabase";
import type {
  EditorialBadge,
  EditorialGenre,
  EditorialNewsItem,
  EditorialPreferences,
  EditorialTopic
} from "../types";

export const EDITORIAL_PREFERENCES_UPDATED_EVENT = "cinerian:editorial-preferences-updated";

export const EDITORIAL_TOPIC_OPTIONS: Array<{ id: EditorialTopic; label: string; description: string }> = [
  { id: "movies", label: "Cine", description: "Noticias de peliculas, autores y rodajes." },
  { id: "series", label: "Series", description: "Streaming, temporadas, renovaciones y finales." },
  { id: "releases", label: "Estrenos", description: "Lanzamientos en cines y plataformas." },
  { id: "trailers", label: "Trailers", description: "Avances, teasers y primeros vistazos." },
  { id: "awards", label: "Premios / Festivales", description: "Oscar, Cannes, Venecia, Goya y más." },
  { id: "casting", label: "Casting / Anuncios", description: "Fichajes, rodajes y nuevos proyectos." },
  { id: "mainstream", label: "Mainstream / Franquicias", description: "Marvel, sagas, blockbusters y fenómenos." },
  { id: "auteur", label: "Cine de autor", description: "Directores, festivales y miradas más cinéfilas." }
];

export const EDITORIAL_GENRE_OPTIONS: Array<{ id: EditorialGenre; label: string }> = [
  { id: "action", label: "Accion" },
  { id: "animation", label: "Animacion / Anime" },
  { id: "comedy", label: "Comedia" },
  { id: "documentary", label: "Documental" },
  { id: "drama", label: "Drama" },
  { id: "fantasy", label: "Fantasia" },
  { id: "horror", label: "Terror" },
  { id: "romance", label: "Romance" },
  { id: "scifi", label: "Sci-fi" },
  { id: "thriller", label: "Thriller" }
];

type UserNewsPreferencesRow = {
  user_id: string;
  selected_topics: string[] | null;
  selected_genres: string[] | null;
  onboarding_completed: boolean | null;
  updated_at: string | null;
};

type NewsItemRow = {
  id: string;
  title: string;
  url: string;
  summary: string;
  image_url: string | null;
  author: string | null;
  source_section: string | null;
  source_label: string;
  media_scope: "movie" | "series" | "mixed" | "tv";
  badge: EditorialBadge;
  editorial_tags: string[] | null;
  genre_tags: string[] | null;
  published_at: string;
  editorial_sources:
    | {
        source_key: string;
      }
    | {
        source_key: string;
      }[]
    | null;
};

function extractSourceKey(value: NewsItemRow["editorial_sources"]) {
  if (!value) {
    return "sensacine-all";
  }

  return Array.isArray(value) ? value[0]?.source_key ?? "sensacine-all" : value.source_key;
}

function formatRelativeLabel(dateString: string) {
  const created = new Date(dateString).getTime();
  const diffMs = Date.now() - created;
  const diffMin = Math.max(0, Math.round(diffMs / 60000));

  if (diffMin < 60) {
    return diffMin < 1 ? "Ahora" : `Hace ${diffMin} min`;
  }

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Hace ${diffDays} d`;
}

function isMissingEditorialTablesError(error: { message?: string; details?: string; hint?: string } | null) {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return (
    haystack.includes("user_news_preferences") ||
    haystack.includes("news_items") ||
    haystack.includes("editorial_sources") ||
    haystack.includes("does not exist") ||
    haystack.includes("schema cache")
  );
}

function normalizeTopics(values: string[] | null | undefined): EditorialTopic[] {
  const allowed = new Set(EDITORIAL_TOPIC_OPTIONS.map((entry) => entry.id));
  return (values ?? []).filter((value): value is EditorialTopic => allowed.has(value as EditorialTopic));
}

function normalizeGenres(values: string[] | null | undefined): EditorialGenre[] {
  const allowed = new Set(EDITORIAL_GENRE_OPTIONS.map((entry) => entry.id));
  return (values ?? []).filter((value): value is EditorialGenre => allowed.has(value as EditorialGenre));
}

function mapPreferences(row: UserNewsPreferencesRow | null): EditorialPreferences | null {
  if (!row) {
    return null;
  }

  return {
    selectedTopics: normalizeTopics(row.selected_topics),
    selectedGenres: normalizeGenres(row.selected_genres),
    completedOnboarding: Boolean(row.onboarding_completed),
    updatedAt: row.updated_at
  };
}

function mapNewsItem(row: NewsItemRow): EditorialNewsItem {
  return {
    id: row.id,
    sourceKey: extractSourceKey(row.editorial_sources),
    title: row.title,
    url: row.url,
    summary: row.summary,
    imageUrl: row.image_url,
    author: row.author,
    sourceLabel: row.source_label,
    sourceSection: row.source_section,
    publishedAt: row.published_at,
    publishedAtLabel: formatRelativeLabel(row.published_at),
    mediaScope: row.media_scope,
    badge: row.badge,
    editorialTags: normalizeTopics(row.editorial_tags),
    genreTags: normalizeGenres(row.genre_tags)
  };
}

function normalizeNewsKey(item: EditorialNewsItem) {
  const normalizedUrl = item.url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/[?#].*$/, "");

  const normalizedTitle = item.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalizedUrl || normalizedTitle;
}

export function defaultEditorialPreferences(): EditorialPreferences {
  return {
    selectedTopics: ["movies", "series", "releases", "trailers", "mainstream"],
    selectedGenres: [],
    completedOnboarding: false,
    updatedAt: null
  };
}

function dispatchEditorialPreferencesUpdated(userId: string) {
  window.dispatchEvent(
    new CustomEvent(EDITORIAL_PREFERENCES_UPDATED_EVENT, {
      detail: { userId }
    })
  );
}

export async function fetchUserEditorialPreferences(userId: string): Promise<EditorialPreferences | null> {
  if (!supabase) {
    return defaultEditorialPreferences();
  }

  const { data, error } = await supabase
    .from("user_news_preferences")
    .select("user_id, selected_topics, selected_genres, onboarding_completed, updated_at")
    .eq("user_id", userId)
    .maybeSingle<UserNewsPreferencesRow>();

  if (error) {
    if (isMissingEditorialTablesError(error)) {
      return null;
    }

    throw error;
  }

  return mapPreferences(data ?? null);
}

export async function saveUserEditorialPreferences(input: {
  userId: string;
  preferences: EditorialPreferences;
}) {
  if (!supabase) {
    return;
  }

  const payload = {
    user_id: input.userId,
    selected_topics: input.preferences.selectedTopics,
    selected_genres: input.preferences.selectedGenres,
    onboarding_completed: input.preferences.completedOnboarding,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("user_news_preferences").upsert(payload, {
    onConflict: "user_id"
  });

  if (error) {
    throw error;
  }

  dispatchEditorialPreferencesUpdated(input.userId);
}

function scoreNewsItem(item: EditorialNewsItem, preferences: EditorialPreferences) {
  let score = 0;
  const topicSet = new Set(preferences.selectedTopics);
  const genreSet = new Set(preferences.selectedGenres);

  if (item.mediaScope === "movie" && topicSet.has("movies")) {
    score += 4;
  }

  if ((item.mediaScope === "series" || item.mediaScope === "tv") && topicSet.has("series")) {
    score += 4;
  }

  item.editorialTags.forEach((tag) => {
    if (topicSet.has(tag)) {
      score += tag === "mainstream" || tag === "auteur" ? 3 : 5;
    }
  });

  item.genreTags.forEach((tag) => {
    if (genreSet.has(tag)) {
      score += 2;
    }
  });

  if (!item.editorialTags.length && topicSet.has("movies") && item.mediaScope === "movie") {
    score += 1;
  }

  if (!item.editorialTags.length && topicSet.has("series") && (item.mediaScope === "series" || item.mediaScope === "tv")) {
    score += 1;
  }

  const ageHours = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 3600000);
  score += Math.max(0, 3 - ageHours / 24);

  return score;
}

export async function fetchPersonalizedEditorialNews(
  userId: string,
  preferencesOverride?: EditorialPreferences,
  limit = 12
): Promise<EditorialNewsItem[]> {
  const preferences = preferencesOverride ?? (await fetchUserEditorialPreferences(userId)) ?? defaultEditorialPreferences();

  if (!supabase) {
    return [];
  }

  const fiveDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString();
  const { data, error } = await supabase
    .from("news_items")
    .select(
      "id, title, url, summary, image_url, author, source_section, source_label, media_scope, badge, editorial_tags, genre_tags, published_at, editorial_sources(source_key)"
    )
    .gte("published_at", fiveDaysAgo)
    .order("published_at", { ascending: false })
    .limit(80);

  if (error) {
    if (isMissingEditorialTablesError(error)) {
      return [];
    }

    throw error;
  }

  const mapped = ((data ?? []) as NewsItemRow[]).map(mapNewsItem);
  const deduped = mapped.filter((item, index, collection) => {
    const key = normalizeNewsKey(item);
    return collection.findIndex((candidate) => normalizeNewsKey(candidate) === key) === index;
  });
  const ranked = deduped
    .map((item) => ({
      item,
      score: scoreNewsItem(item, preferences)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.item.publishedAt).getTime() - new Date(left.item.publishedAt).getTime();
    })
    .map((entry) => entry.item);

  if (ranked.length >= limit) {
    return ranked.slice(0, limit);
  }

  const seenIds = new Set(ranked.map((item) => item.id));
  const filler = deduped.filter((item) => !seenIds.has(item.id)).slice(0, Math.max(0, limit - ranked.length));
  return [...ranked, ...filler].slice(0, limit);
}
