import { useEffect, useMemo, useRef, useState } from "react";
import { demoDiscovery, demoFeed } from "../data/demoData";
import { useMediaDetails } from "./MediaDetailsModal";
import {
  createFeedComment,
  createFeedPost,
  fetchFeedComments,
  fetchFeedPosts,
  fetchFeedPostsByUsers,
  fetchUserMediaPosts
} from "../lib/feed";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchFollowingUserIds } from "../lib/follows";
import {
  getNowPlayingTitles,
  getSimilarTitles,
  getTitleById,
  getTrendingTitles,
  getUpcomingTitles,
  searchTitles
} from "../lib/tmdb";
import { fetchStoredReactions, REACTIONS_UPDATED_EVENT, type StoredReaction } from "../lib/reactions";
import type { DiscoveryItem, FeedComment, FeedEntry } from "../types";

function findMediaFromPost(body: string) {
  const lowered = body.toLowerCase();
  return demoDiscovery.find((item) => lowered.includes(item.title.toLowerCase()));
}

type FeedPanelProps = {
  userId: string;
  profile: Profile | null;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
  highlightedPost?: {
    postId: string;
    openComments?: boolean;
    focusCommentInput?: boolean;
  } | null;
  onHighlightHandled?: () => void;
};

type FeedMode = "discover" | "following";
type EditorialRail = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  items: DiscoveryItem[];
};

type TimelineItem =
  | { type: "post"; entry: FeedEntry; media: DiscoveryItem | null }
  | { type: "editorial"; rail: EditorialRail };

const COMPOSER_WORD_LIMIT = 130;

function countWords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

function parseRatingPost(body: string) {
  const fullReviewMatch = body.match(
    /^(Le gusto|No le gusto) (.+?), le dio (\d)\/5 y dijo: "([\s\S]+)"$/
  );

  if (fullReviewMatch) {
    return {
      sentiment: fullReviewMatch[1],
      title: fullReviewMatch[2],
      rating: Number(fullReviewMatch[3]),
      quote: fullReviewMatch[4]
    };
  }

  const shortReviewMatch = body.match(/^(Le gusto|No le gusto) (.+?) y le dio (\d)\/5\.$/);
  if (shortReviewMatch) {
    return {
      sentiment: shortReviewMatch[1],
      title: shortReviewMatch[2],
      quote: ""
    };
  }

  const fullReviewWithoutStarsMatch = body.match(/^(Le gusto|No le gusto) (.+?) y dijo: "([\s\S]+)"\.?$/);
  if (fullReviewWithoutStarsMatch) {
    return {
      sentiment: fullReviewWithoutStarsMatch[1],
      title: fullReviewWithoutStarsMatch[2],
      quote: fullReviewWithoutStarsMatch[3]
    };
  }

  const shortReviewWithoutStarsMatch = body.match(/^(Le gusto|No le gusto) (.+?)\.?$/);
  if (shortReviewWithoutStarsMatch) {
    return {
      sentiment: shortReviewWithoutStarsMatch[1],
      title: shortReviewWithoutStarsMatch[2],
      quote: ""
    };
  }

  return null;
}

function truncateOverview(text: string, maxLength = 220) {
  if (text.length <= maxLength) {
    return text;
  }

  const sliced = text.slice(0, maxLength);
  const safeSlice = sliced.includes(" ") ? sliced.slice(0, sliced.lastIndexOf(" ")) : sliced;
  return `${safeSlice.trim()}...`;
}

function formatSidebarRelease(dateString?: string | null) {
  if (!dateString) {
    return "Muy pronto";
  }

  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) {
    return dateString;
  }

  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(day)} ${months[Number(month) - 1] ?? month}`;
}

function extractMediaSearchTitle(entry: FeedEntry) {
  const parsedRating = entry.type === "rating" ? parseRatingPost(entry.body) : null;
  if (parsedRating?.title) {
    return parsedRating.title.trim();
  }

  const recommendationMatch = entry.body.match(/^Recomendo (.+?)(?: para| porque| y |\.|$)/i);
  if (recommendationMatch?.[1]) {
    return recommendationMatch[1].trim();
  }

  const watchlistMatch = entry.body.match(/^Guardo (.+?) en su Watchlist/i);
  if (watchlistMatch?.[1]) {
    return watchlistMatch[1].trim();
  }

  return null;
}

export function FeedPanel({
  userId,
  profile,
  onOpenUserProfile,
  highlightedPost,
  onHighlightHandled
}: FeedPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [entries, setEntries] = useState<FeedEntry[]>(demoFeed);
  const [followingEntries, setFollowingEntries] = useState<FeedEntry[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, DiscoveryItem>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, FeedComment[]>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentStatus, setCommentStatus] = useState<Record<string, string | null>>({});
  const [submittingCommentFor, setSubmittingCommentFor] = useState<string | null>(null);
  const [activeFeedMode, setActiveFeedMode] = useState<FeedMode>("discover");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editorialRails, setEditorialRails] = useState<EditorialRail[]>([]);
  const [recentMediaPosts, setRecentMediaPosts] = useState<FeedEntry[]>([]);
  const [storedReactions, setStoredReactions] = useState<StoredReaction[]>([]);
  const [composerText, setComposerText] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [composerMessage, setComposerMessage] = useState<string | null>(null);
  const postRefs = useRef<Record<string, HTMLElement | null>>({});
  const commentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const editorialRailRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const composerWordCount = useMemo(() => countWords(composerText), [composerText]);

  useEffect(() => {
    async function loadFeed() {
      const [feedResult, followingResult, profilesResult] = await Promise.allSettled([
        fetchFeedPosts(),
        fetchFollowingUserIds(userId),
        listProfiles()
      ]);

        if (feedResult.status === "fulfilled" && feedResult.value.length) {
          setEntries(feedResult.value);
        } else if (feedResult.status === "rejected") {
          setEntries(demoFeed);
        }

        if (followingResult.status === "fulfilled") {
          if (followingResult.value.length) {
            try {
              const followingFeed = await fetchFeedPostsByUsers(followingResult.value);
              setFollowingEntries(followingFeed);
            } catch {
              setFollowingEntries([]);
            }
          } else {
            setFollowingEntries([]);
          }
        } else {
          setFollowingEntries([]);
        }

        if (profilesResult.status === "fulfilled") {
          setProfiles(profilesResult.value);
        } else {
          setProfiles([]);
        }
    }

    void loadFeed();
  }, [userId]);

  useEffect(() => {
    async function loadPersonalSignals() {
      const [mediaPosts, reactions] = await Promise.allSettled([
        fetchUserMediaPosts(userId),
        fetchStoredReactions(userId)
      ]);

      if (mediaPosts.status === "fulfilled") {
        setRecentMediaPosts(mediaPosts.value);
      } else {
        setRecentMediaPosts([]);
      }

      if (reactions.status === "fulfilled") {
        setStoredReactions(reactions.value);
      } else {
        setStoredReactions([]);
      }
    }

    function handleReactionsUpdated(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) {
        return;
      }

      void loadPersonalSignals();
    }

    void loadPersonalSignals();
    window.addEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);

    return () => {
      window.removeEventListener(REACTIONS_UPDATED_EVENT, handleReactionsUpdated as EventListener);
    };
  }, [userId]);

  useEffect(() => {
    let isActive = true;

    async function loadEditorialRails() {
      try {
        const [trending, upcoming, nowPlaying] = await Promise.all([
          getTrendingTitles(),
          getUpcomingTitles(),
          getNowPlayingTitles()
        ]);

        if (!isActive) {
          return;
        }

        setEditorialRails([
          {
            id: "trending",
            eyebrow: "Tendencias",
            title: "Lo que esta prendido entre cinefilos",
            subtitle: "Titulos que vienen levantando conversacion y clicks.",
            items: trending.slice(0, 3)
          },
          {
            id: "upcoming",
            eyebrow: "Estrenos",
            title: "Para agendar esta semana",
            subtitle: "Peliculas que vienen entrando fuerte y vale la pena seguir.",
            items: upcoming.slice(0, 3)
          },
          {
            id: "now-playing",
            eyebrow: "Ahora",
            title: "Titulos que ya se estan moviendo",
            subtitle: "Una mezcla de novedad, ruido y ganas de ver que sigue.",
            items: nowPlaying.slice(0, 3)
          }
        ].filter((rail) => rail.items.length));
      } catch {
        if (!isActive) {
          return;
        }

        setEditorialRails([
          {
            id: "fallback-trending",
            eyebrow: "Tendencias",
            title: "Lo que esta prendido entre cinefilos",
            subtitle: "Arrancamos con una primera curaduria mientras TMDB responde.",
            items: demoDiscovery.slice(0, 3)
          },
          {
            id: "fallback-upcoming",
            eyebrow: "Estrenos",
            title: "Para agendar esta semana",
            subtitle: "Titulos para ir poblando el home con mas contexto de cine.",
            items: demoDiscovery.slice(3, 6)
          }
        ]);
      }
    }

    void loadEditorialRails();

    return () => {
      isActive = false;
    };
  }, []);

  const discoverProfiles = useMemo(() => {
    return profiles.filter((entry) => entry.id !== userId).slice(0, 3);
  }, [profiles, userId]);

  const visibleEntries = useMemo(() => {
    if (activeFeedMode === "following") {
      return followingEntries;
    }

    return entries;
  }, [activeFeedMode, entries, followingEntries]);

  const postsWithMedia = useMemo(
    () =>
      visibleEntries.map((entry) => {
        const fallbackMedia = findMediaFromPost(entry.body);
        const key = entry.tmdbId && entry.mediaType ? `${entry.mediaType}-${entry.tmdbId}` : null;
        const mappedMedia = key ? mediaMap[key] : undefined;
        const searchTitle = extractMediaSearchTitle(entry);
        const searchedMedia = searchTitle ? mediaMap[`search-${searchTitle.toLowerCase()}`] : undefined;
        return {
          entry,
          media: mappedMedia ?? searchedMedia ?? fallbackMedia ?? null
        };
      }),
    [mediaMap, visibleEntries]
  );

  const [becauseYouWatchedRail, setBecauseYouWatchedRail] = useState<EditorialRail | null>(null);

  const reactedKeySet = useMemo(
    () => new Set(storedReactions.map((entry) => `${entry.mediaType}-${entry.tmdbId}`)),
    [storedReactions]
  );

  const recentSignalPost = useMemo(
    () => recentMediaPosts.find((entry) => entry.tmdbId && entry.mediaType) ?? null,
    [recentMediaPosts]
  );

  const followingPostsWithMedia = useMemo(
    () =>
      followingEntries.map((entry) => {
        const fallbackMedia = findMediaFromPost(entry.body);
        const key = entry.tmdbId && entry.mediaType ? `${entry.mediaType}-${entry.tmdbId}` : null;
        const mappedMedia = key ? mediaMap[key] : undefined;
        const searchTitle = extractMediaSearchTitle(entry);
        const searchedMedia = searchTitle ? mediaMap[`search-${searchTitle.toLowerCase()}`] : undefined;
        return {
          entry,
          media: mappedMedia ?? searchedMedia ?? fallbackMedia ?? null
        };
      }),
    [followingEntries, mediaMap]
  );

  const circleRail = useMemo<EditorialRail | null>(() => {
    const counts = new Map<string, { media: DiscoveryItem; posts: number }>();

    followingPostsWithMedia.forEach(({ media }) => {
      if (!media) {
        return;
      }

      const key = `${media.mediaType}-${media.id}`;
      const current = counts.get(key);
      if (current) {
        current.posts += 1;
      } else {
        counts.set(key, { media, posts: 1 });
      }
    });

    const items = [...counts.values()]
      .sort((a, b) => b.posts - a.posts)
      .map((entry) => entry.media)
      .filter((item) => !reactedKeySet.has(`${item.mediaType}-${item.id}`))
      .slice(0, 3);

    if (!items.length) {
      return null;
    }

    return {
      id: "circle",
      eyebrow: "Tu circulo",
      title: "Lo que esta viendo tu gente",
      subtitle: "Titulos que ya estan apareciendo entre las personas que seguis.",
      items
    };
  }, [followingPostsWithMedia, reactedKeySet]);

  const effectiveEditorialRails = useMemo(
    () => [becauseYouWatchedRail, circleRail, ...editorialRails].filter(Boolean) as EditorialRail[],
    [becauseYouWatchedRail, circleRail, editorialRails]
  );

  const discoverTimeline = useMemo<TimelineItem[]>(() => {
    if (!postsWithMedia.length) {
      return effectiveEditorialRails.map((rail) => ({ type: "editorial", rail }));
    }

    const nextTimeline: TimelineItem[] = [];
    const railsQueue = [...effectiveEditorialRails];

    postsWithMedia.forEach(({ entry, media }, index) => {
      nextTimeline.push({
        type: "post",
        entry,
        media
      });

      const shouldInjectRail = railsQueue.length > 0 && (index === 0 || (index + 1) % 3 === 0);
      if (shouldInjectRail) {
        const rail = railsQueue.shift();
        if (rail) {
          nextTimeline.push({
            type: "editorial",
            rail
          });
        }
      }
    });

    railsQueue.forEach((rail) => {
      nextTimeline.push({
        type: "editorial",
        rail
      });
    });

    return nextTimeline;
  }, [effectiveEditorialRails, postsWithMedia]);

  const visibleTimeline = useMemo<TimelineItem[]>(
    () =>
      activeFeedMode === "discover"
        ? discoverTimeline
        : postsWithMedia.map(({ entry, media }) => ({
            type: "post",
            entry,
            media
          })),
    [activeFeedMode, discoverTimeline, postsWithMedia]
  );

  const conversationItems = useMemo(() => {
    const counts = new Map<
      string,
      {
        media: DiscoveryItem;
        posts: number;
      }
    >();

    postsWithMedia.forEach(({ media }) => {
      if (!media) {
        return;
      }

      const key = `${media.mediaType}-${media.id}`;
      const current = counts.get(key);

      if (current) {
        current.posts += 1;
        return;
      }

      counts.set(key, {
        media,
        posts: 1
      });
    });

    return [...counts.values()].sort((a, b) => b.posts - a.posts).slice(0, 3);
  }, [postsWithMedia]);

  useEffect(() => {
    if (!recentSignalPost?.tmdbId || !recentSignalPost.mediaType) {
      setBecauseYouWatchedRail(null);
      return;
    }

    let isActive = true;

    void getTitleById(recentSignalPost.tmdbId, recentSignalPost.mediaType)
      .then(async (sourceTitle) => {
        if (!sourceTitle) {
          if (isActive) {
            setBecauseYouWatchedRail(null);
          }
          return;
        }

        const related = await getSimilarTitles(recentSignalPost.tmdbId!, recentSignalPost.mediaType!);

        if (!isActive) {
          return;
        }

        const items = related
          .filter((item) => !reactedKeySet.has(`${item.mediaType}-${item.id}`))
          .slice(0, 3);

        if (!items.length) {
          setBecauseYouWatchedRail(null);
          return;
        }

        setBecauseYouWatchedRail({
          id: "because-you-watched",
          eyebrow: "Para vos",
          title: `Porque viste ${sourceTitle.title}`,
          subtitle: "Titulos cercanos a lo que ya marcaste en tu recorrido cineriano.",
          items
        });
      })
      .catch(() => {
        if (isActive) {
          setBecauseYouWatchedRail(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [reactedKeySet, recentSignalPost]);

  useEffect(() => {
    const ids = visibleEntries.map((entry) => entry.id);
    if (!ids.length) {
      setCommentsMap({});
      return;
    }

    void fetchFeedComments(ids)
      .then(setCommentsMap)
      .catch(() => setCommentsMap({}));
  }, [visibleEntries]);

  useEffect(() => {
    if (!highlightedPost) {
      return;
    }

    const targetExists = visibleEntries.some((entry) => entry.id === highlightedPost.postId);
    if (!targetExists) {
      if (activeFeedMode !== "discover") {
        setActiveFeedMode("discover");
      }
      return;
    }

    if (activeFeedMode !== "discover") {
      setActiveFeedMode("discover");
      return;
    }

    if (highlightedPost.openComments) {
      setExpandedComments((current) => ({
        ...current,
        [highlightedPost.postId]: true
      }));
    }

    const timeoutId = window.setTimeout(() => {
      postRefs.current[highlightedPost.postId]?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      if (highlightedPost.focusCommentInput) {
        commentInputRefs.current[highlightedPost.postId]?.focus();
      }

      onHighlightHandled?.();
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [activeFeedMode, highlightedPost, onHighlightHandled, visibleEntries]);

  useEffect(() => {
    const sourceEntries = [...entries, ...followingEntries];
    const targets = sourceEntries.filter((entry) => entry.tmdbId && entry.mediaType);
    const missing = targets.filter((entry) => !mediaMap[`${entry.mediaType}-${entry.tmdbId}`]);

    if (!missing.length) {
      return;
    }

    void Promise.all(
      missing.map(async (entry) => {
        const media = await getTitleById(entry.tmdbId!, entry.mediaType!);
        return {
          key: `${entry.mediaType}-${entry.tmdbId}`,
          media
        };
      })
    ).then((results) => {
      setMediaMap((current) => {
        const next = { ...current };
        results.forEach((result) => {
          if (result.media) {
            next[result.key] = result.media;
          }
        });
        return next;
      });
    });
  }, [entries, followingEntries, mediaMap]);

  useEffect(() => {
    const sourceEntries = [...entries, ...followingEntries];
    const unresolvedEntries = sourceEntries.filter((entry) => {
      if (entry.tmdbId && entry.mediaType) {
        return false;
      }

      if (findMediaFromPost(entry.body)) {
        return false;
      }

      return Boolean(extractMediaSearchTitle(entry));
    });

    if (!unresolvedEntries.length) {
      return;
    }

    const uniqueQueries = [
      ...new Set(unresolvedEntries.map((entry) => extractMediaSearchTitle(entry)).filter(Boolean) as string[])
    ];
    const pendingQueries = uniqueQueries.filter((query) => !mediaMap[`search-${query.toLowerCase()}`]);

    if (!pendingQueries.length) {
      return;
    }

    void Promise.all(
      pendingQueries.map(async (query) => {
        const results = await searchTitles(query);
        const lowered = query.toLowerCase();
        const bestMatch =
          results.find((item) => item.title.toLowerCase() === lowered) ??
          results.find((item) => item.title.toLowerCase().includes(lowered)) ??
          results[0] ??
          null;

        return {
          key: `search-${lowered}`,
          media: bestMatch
        };
      })
    ).then((results) => {
      setMediaMap((current) => {
        const next = { ...current };
        results.forEach((result) => {
          if (result.media) {
            next[result.key] = result.media;
          }
        });
        return next;
      });
    });
  }, [entries, followingEntries, mediaMap]);

  async function handlePublish() {
    const body = composerText.trim();
    if (!body || composerWordCount > COMPOSER_WORD_LIMIT) {
      return;
    }

    try {
      setIsPublishing(true);
      setComposerMessage(null);
      await createFeedPost({
        userId,
        body,
        postType: "watchlist"
      });

      setEntries((current) => [
        {
          id: `local-${Date.now()}`,
          userId,
          author: profile?.display_name ?? "Vos",
          username: profile?.username ?? "vos",
          body,
          createdAtLabel: "Ahora",
          type: "watchlist"
        },
        ...current
      ]);
      setComposerText("");
      setComposerMessage("Tu post ya salio en el feed.");
    } catch {
      setComposerMessage("No pude publicar tu post.");
    } finally {
      setIsPublishing(false);
    }
  }

  function openAuthorProfile(targetUserId?: string, username?: string) {
    if (!targetUserId) {
      return;
    }

    onOpenUserProfile({ userId: targetUserId, username });
  }

  function handleComposerChange(value: string) {
    if (countWords(value) > COMPOSER_WORD_LIMIT) {
      return;
    }

    setComposerText(value);
  }

  function toggleComments(postId: string) {
    setExpandedComments((current) => ({
      ...current,
      [postId]: !current[postId]
    }));
  }

  function scrollEditorialRail(railId: string, direction: "left" | "right") {
    const railNode = editorialRailRefs.current[railId];
    if (!railNode) {
      return;
    }

    const cardWidth = railNode.firstElementChild instanceof HTMLElement ? railNode.firstElementChild.offsetWidth : 0;
    const gap = 18;
    const offset = Math.max(cardWidth + gap, railNode.clientWidth * 0.82);
    railNode.scrollBy({
      left: direction === "right" ? offset : -offset,
      behavior: "smooth"
    });
  }

  async function handleCommentSubmit(postId: string) {
    const body = (commentDrafts[postId] ?? "").trim();
    if (!body) {
      return;
    }

    try {
      setSubmittingCommentFor(postId);
      setCommentStatus((current) => ({ ...current, [postId]: null }));
      await createFeedComment({
        postId,
        userId,
        body
      });

      setCommentsMap((current) => ({
        ...current,
        [postId]: [
          ...(current[postId] ?? []),
          {
            id: `local-comment-${Date.now()}`,
            postId,
            userId,
            author: profile?.display_name ?? "Vos",
            username: profile?.username ?? "vos",
            body,
            createdAtLabel: "Ahora"
          }
        ]
      }));
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setExpandedComments((current) => ({ ...current, [postId]: true }));
      setCommentStatus((current) => ({ ...current, [postId]: "Comentario publicado." }));
    } catch {
      setCommentStatus((current) => ({ ...current, [postId]: "No pude publicar tu comentario." }));
    } finally {
      setSubmittingCommentFor(null);
    }
  }

  return (
    <section className="feed-shell">
      <div className="feed-main">
        <header className="feed-header">
          <button
            type="button"
            className={`feed-header__tab ${activeFeedMode === "discover" ? "is-active" : ""}`}
            onClick={() => setActiveFeedMode("discover")}
          >
            Descubri
          </button>
          <button
            type="button"
            className={`feed-header__tab ${activeFeedMode === "following" ? "is-active" : ""}`}
            onClick={() => setActiveFeedMode("following")}
          >
            Siguiendo
          </button>
        </header>

        <section className="composer-card">
          <div className="composer-card__avatar">
            {(profile?.display_name ?? "Cinerian").slice(0, 1).toUpperCase()}
          </div>
          <div className="composer-card__body">
            <div className="composer-card__row">
              <input
                type="text"
                className="composer-card__input composer-card__input--inline"
                value={composerText}
                onChange={(event) => handleComposerChange(event.target.value)}
                placeholder="¿Que peli o serie te volo la cabeza hoy?"
                maxLength={900}
              />
              <button
                type="button"
                className="primary-button composer-card__submit"
                onClick={() => void handlePublish()}
                disabled={isPublishing || !composerText.trim() || composerWordCount > COMPOSER_WORD_LIMIT}
              >
                Publicar
              </button>
            </div>
            <div className="composer-card__footer">
              <span className={composerWordCount >= COMPOSER_WORD_LIMIT ? "composer-card__limit is-limit" : "composer-card__limit"}>
                {composerWordCount}/{COMPOSER_WORD_LIMIT}
              </span>
            </div>
            {composerMessage ? <div className="inline-status">{composerMessage}</div> : null}
          </div>
        </section>

        <div className="timeline-list">
          {visibleTimeline.length ? (
            visibleTimeline.map((item) => {
              if (item.type === "editorial") {
                return (
                  <article className="timeline-card timeline-card--editorial" key={item.rail.id}>
                    <div className="timeline-editorial">
                      <div className="timeline-editorial__header">
                        <div>
                          <p className="section-eyebrow">{item.rail.eyebrow}</p>
                          <h3>{item.rail.title}</h3>
                          <p>{item.rail.subtitle}</p>
                        </div>
                        <div className="timeline-editorial__controls">
                          <button
                            type="button"
                            className="timeline-editorial__arrow"
                            onClick={() => scrollEditorialRail(item.rail.id, "left")}
                            aria-label="Ver títulos anteriores"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            className="timeline-editorial__arrow"
                            onClick={() => scrollEditorialRail(item.rail.id, "right")}
                            aria-label="Ver más títulos"
                          >
                            →
                          </button>
                        </div>
                      </div>

                      <div
                        className="timeline-editorial__carousel"
                      >
                        <div
                          className="timeline-editorial__grid"
                          ref={(node) => {
                            editorialRailRefs.current[item.rail.id] = node;
                          }}
                        >
                        {item.rail.items.map((editorialItem) => (
                          <button
                            type="button"
                            key={`${item.rail.id}-${editorialItem.mediaType}-${editorialItem.id}`}
                            className="timeline-editorial__item"
                            onClick={() => openMediaDetails(editorialItem)}
                          >
                            <div className="detail-poster detail-poster--editorial">
                              <img
                                src={editorialItem.posterUrl}
                                alt={editorialItem.title}
                                className="timeline-editorial__poster"
                              />
                              <span className="detail-poster__hint" aria-hidden="true">
                                Ver detalles
                              </span>
                            </div>
                            <div className="timeline-editorial__copy">
                              <span className="meta-line">
                                {editorialItem.mediaType === "tv" ? "Serie" : "Pelicula"} • {editorialItem.year}
                              </span>
                              <strong>{editorialItem.title}</strong>
                              <span className="timeline-editorial__genres">
                                {editorialItem.genres.slice(0, 2).join(" • ") ||
                                  (editorialItem.mediaType === "tv" ? "Serie" : "Pelicula")}
                              </span>
                              <p>{truncateOverview(editorialItem.overview, 58)}</p>
                            </div>
                          </button>
                        ))}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              }

              const { entry, media } = item;
              const parsedRating = entry.type === "rating" ? parseRatingPost(entry.body) : null;
              const comments = commentsMap[entry.id] ?? [];
              const isCommentsOpen = Boolean(expandedComments[entry.id]);

              return (
                <article
                  className="timeline-card"
                  key={entry.id}
                  ref={(node) => {
                    postRefs.current[entry.id] = node;
                  }}
                >
                  <button
                    type="button"
                    className="timeline-card__avatar timeline-card__avatar--interactive"
                    onClick={() => openAuthorProfile(entry.userId, entry.username)}
                    aria-label={`Ver perfil de ${entry.author}`}
                  >
                    {entry.author.slice(0, 1)}
                  </button>

                  <div className="timeline-card__content">
                    <div className="timeline-card__topline">
                      <div>
                        <button
                          type="button"
                          className="timeline-card__author"
                          onClick={() => openAuthorProfile(entry.userId, entry.username)}
                        >
                          <strong>{entry.author}</strong>
                        </button>
                        <button
                          type="button"
                          className="timeline-card__handle"
                          onClick={() => openAuthorProfile(entry.userId, entry.username)}
                        >
                          @{entry.username ?? entry.author.toLowerCase()}
                        </button>
                        <span className="timeline-card__meta">· {entry.createdAtLabel}</span>
                      </div>
                    </div>

                    {parsedRating ? (
                      <>
                        <p className="timeline-card__text timeline-card__text--light">
                          {parsedRating.sentiment} {parsedRating.title}
                        </p>
                        {parsedRating.quote ? (
                          <p className="timeline-card__text timeline-card__text--featured">
                            "{parsedRating.quote}"
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="timeline-card__text">{entry.body}</p>
                    )}

                    {media ? (
                      <div className="timeline-card__media timeline-card__media--interactive" onClick={() => openMediaDetails(media)}>
                        <div className="detail-poster">
                          <img src={media.posterUrl} alt={media.title} className="timeline-card__poster" />
                          <span className="detail-poster__hint" aria-hidden="true">
                            Ver detalles
                          </span>
                        </div>
                        <div className="timeline-card__media-copy">
                          <p className="meta-line">
                            {media.mediaType === "tv" ? "Serie" : "Pelicula"} • {media.year}
                          </p>
                          <h3>{media.title}</h3>
                          {media.genres.length ? (
                            <p className="timeline-card__genres">{media.genres.join(" · ")}</p>
                          ) : null}
                          <p>{truncateOverview(media.overview)}</p>
                        </div>
                      </div>
                    ) : null}

                    <div className="timeline-card__actions">
                      <button
                        type="button"
                        className="ghost-button timeline-card__comment-toggle"
                        onClick={() => toggleComments(entry.id)}
                        aria-label={isCommentsOpen ? "Ocultar comentarios" : "Abrir comentarios"}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6.5 5.5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H10l-4 3.5V15.5h-.5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
                        </svg>
                        {comments.length ? <span>{comments.length}</span> : null}
                      </button>
                    </div>

                    {isCommentsOpen ? (
                      <div className="timeline-card__comments">
                        {comments.length ? (
                          <div className="timeline-card__comment-list">
                            {comments.map((comment) => (
                              <article className="timeline-card__comment" key={comment.id}>
                                <strong>{comment.author}</strong>
                                <span>
                                  @{comment.username ?? comment.author.toLowerCase()} · {comment.createdAtLabel}
                                </span>
                                <p>{comment.body}</p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="timeline-card__comment-empty">Todavía no hay comentarios acá.</p>
                        )}

                        <div className="timeline-card__comment-form">
                          <input
                            type="text"
                            ref={(node) => {
                              commentInputRefs.current[entry.id] = node;
                            }}
                            value={commentDrafts[entry.id] ?? ""}
                            onChange={(event) =>
                              setCommentDrafts((current) => ({
                                ...current,
                                [entry.id]: event.target.value
                              }))
                            }
                            placeholder="Deja tu comentario"
                          />
                          <button
                            type="button"
                            className="primary-button"
                            disabled={submittingCommentFor === entry.id || !(commentDrafts[entry.id] ?? "").trim()}
                            onClick={() => void handleCommentSubmit(entry.id)}
                          >
                            {submittingCommentFor === entry.id ? "Publicando..." : "Comentar"}
                          </button>
                        </div>
                        {commentStatus[entry.id] ? (
                          <div className="inline-status">{commentStatus[entry.id]}</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="timeline-empty">
              {activeFeedMode === "following"
                ? "Todavia no seguis a nadie o esa gente aun no publico en Cinerian."
                : "Todavia no hay publicaciones para descubrir."}
            </div>
          )}
        </div>
      </div>

      <aside className="feed-sidebar">
        <section className="sidebar-card">
          <p className="section-eyebrow">Estrena esta semana</p>
          {editorialRails.find((rail) => rail.id === "upcoming")?.items?.length ? (
            <div className="sidebar-premieres">
              {(editorialRails.find((rail) => rail.id === "upcoming")?.items ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="sidebar-premiere"
                  onClick={() => openMediaDetails(item)}
                >
                  <div className="detail-poster detail-poster--compact">
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      className="sidebar-media__poster sidebar-media__poster--interactive"
                    />
                    <span className="detail-poster__hint" aria-hidden="true">
                      Ver detalles
                    </span>
                  </div>
                  <div className="sidebar-premiere__copy">
                    <strong>{item.title}</strong>
                    <span>
                      {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {formatSidebarRelease(item.releaseDate)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="sidebar-empty">No encontre estrenos nuevos entre hoy, 5 de agosto de 2026, y los proximos dias.</p>
          )}
        </section>

        <section className="sidebar-card">
          <p className="section-eyebrow">En conversacion</p>
          <div className="sidebar-list">
            {conversationItems.length ? (
              conversationItems.map(({ media, posts }) => (
                <article className="sidebar-media" key={media.id}>
                  <div className="detail-poster detail-poster--compact" onClick={() => openMediaDetails(media)}>
                    <img
                      src={media.posterUrl}
                      alt={media.title}
                      className="sidebar-media__poster sidebar-media__poster--interactive"
                    />
                    <span className="detail-poster__hint" aria-hidden="true">
                      Ver detalles
                    </span>
                  </div>
                  <div>
                    <strong className="media-linklike" onClick={() => openMediaDetails(media)}>{media.title}</strong>
                    <p>
                      {posts} {posts === 1 ? "posteo" : "posteos"} en el feed
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <p className="sidebar-empty">Todavia no hay suficiente conversacion para armar tendencias.</p>
            )}
          </div>
        </section>

        <section className="sidebar-card">
          <strong>Explorar Cinerianos</strong>

          <div className="sidebar-users">
            {discoverProfiles.length ? (
              discoverProfiles.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="sidebar-user"
                  onClick={() => onOpenUserProfile({ userId: entry.id, username: entry.username })}
                >
                  <span className="sidebar-user__avatar" aria-hidden="true">
                    {entry.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="sidebar-user__copy">
                    <strong>{entry.display_name}</strong>
                    <span>@{entry.username}</span>
                  </span>
                </button>
              ))
            ) : (
              <p className="sidebar-empty">Todavia no hay suficientes cinerianos para mostrar aca.</p>
            )}
          </div>
        </section>
      </aside>
    </section>
  );
}
