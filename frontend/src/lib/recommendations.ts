import { getProfileById } from "./auth";
import { fetchFollowingUserIds } from "./follows";
import { fetchRatedReactionsForUserIds, fetchStoredReactions } from "./reactions";
import { getRecommendationTitlesByPage, getTitleById } from "./tmdb";
import type { DiscoveryItem, MediaType } from "../types";

const LIKED_WEIGHT = 3;
const DISLIKED_WEIGHT = -2;
const GENRE_BONUS_WEIGHT = 1.5;
const OWN_GENRE_SAMPLE_LIMIT = 15;

function candidateKey(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}-${tmdbId}`;
}

function normalizeGenreLabel(value: string) {
  return value.trim().toLowerCase();
}

async function buildOwnGenreAffinity(userId: string): Promise<Set<string>> {
  const [ownReactions, ownProfile] = await Promise.all([
    fetchStoredReactions(userId),
    getProfileById(userId)
  ]);

  const ownLiked = ownReactions
    .filter((reaction) => reaction.reaction === "liked")
    .slice(0, OWN_GENRE_SAMPLE_LIMIT);

  if (ownLiked.length < 3) {
    return new Set((ownProfile?.favorite_genres ?? []).map(normalizeGenreLabel));
  }

  const ownItems = await Promise.all(
    ownLiked.map((reaction) => getTitleById(reaction.tmdbId, reaction.mediaType))
  );

  const genreCounts = new Map<string, number>();
  ownItems.forEach((item) => {
    item?.genres.forEach((genre) => {
      const key = normalizeGenreLabel(genre);
      genreCounts.set(key, (genreCounts.get(key) ?? 0) + 1);
    });
  });

  const topGenres = [...genreCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([genre]) => genre);

  return new Set(topGenres);
}

export async function fetchSocialRecommendations(
  userId: string,
  page: number,
  limit = 12
): Promise<DiscoveryItem[]> {
  const followingIds = await fetchFollowingUserIds(userId);

  if (followingIds.length === 0) {
    return getRecommendationTitlesByPage(page);
  }

  const [followedRated, ownReactions, genreAffinity] = await Promise.all([
    fetchRatedReactionsForUserIds(followingIds),
    fetchStoredReactions(userId),
    buildOwnGenreAffinity(userId)
  ]);

  const excludedKeys = new Set(
    ownReactions.map((reaction) => candidateKey(reaction.mediaType, reaction.tmdbId))
  );

  const socialCandidates = new Map<
    string,
    { tmdbId: number; mediaType: MediaType; socialScore: number; watcherCount: number }
  >();

  followedRated.forEach((reaction) => {
    const key = candidateKey(reaction.mediaType, reaction.tmdbId);
    if (excludedKeys.has(key)) {
      return;
    }

    const entry = socialCandidates.get(key) ?? {
      tmdbId: reaction.tmdbId,
      mediaType: reaction.mediaType,
      socialScore: 0,
      watcherCount: 0
    };

    entry.watcherCount += 1;
    entry.socialScore += reaction.reaction === "liked" ? LIKED_WEIGHT : DISLIKED_WEIGHT;

    socialCandidates.set(key, entry);
  });

  const detailedCandidates = await Promise.all(
    [...socialCandidates.values()].map(async (candidate) => {
      const item = await getTitleById(candidate.tmdbId, candidate.mediaType);
      if (!item) {
        return null;
      }

      const genreBonus =
        item.genres.filter((genre) => genreAffinity.has(normalizeGenreLabel(genre))).length *
        GENRE_BONUS_WEIGHT;

      return {
        item,
        watcherCount: candidate.watcherCount,
        totalScore: candidate.socialScore + genreBonus
      };
    })
  );

  const ranked = detailedCandidates
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }
      if (right.watcherCount !== left.watcherCount) {
        return right.watcherCount - left.watcherCount;
      }
      return right.item.score - left.item.score;
    })
    .map((entry) => entry.item);

  if (ranked.length >= limit) {
    return ranked.slice(0, limit);
  }

  const backfill = await getRecommendationTitlesByPage(page);
  const seenKeys = new Set(ranked.map((item) => candidateKey(item.mediaType, item.id)));
  const filler = backfill
    .filter((item) => {
      const key = candidateKey(item.mediaType, item.id);
      return !seenKeys.has(key) && !excludedKeys.has(key);
    })
    .slice(0, Math.max(0, limit - ranked.length));

  return [...ranked, ...filler].slice(0, limit);
}
