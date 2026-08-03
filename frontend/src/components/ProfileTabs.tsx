import { useEffect, useMemo, useState } from "react";
import {
  deleteFeedPost,
  fetchUserTextPosts,
  updateFeedPost
} from "../lib/feed";
import {
  fetchStoredReactions,
  removeStoredReaction,
  type StoredReaction
} from "../lib/reactions";
import { getTitleById } from "../lib/tmdb";
import type { DiscoveryItem, FeedEntry } from "../types";

type ProfileTabsProps = {
  userId: string;
};

type TabId = "watched" | "liked" | "posts";

const tabLabels: Record<TabId, string> = {
  watched: "Vistas",
  liked: "Me gusta",
  posts: "Posts"
};

export function ProfileTabs({ userId }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("watched");
  const [reactions, setReactions] = useState<StoredReaction[]>([]);
  const [titles, setTitles] = useState<Record<string, DiscoveryItem>>({});
  const [posts, setPosts] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadProfileMedia() {
      setIsLoading(true);

      try {
        const [results, ownPosts] = await Promise.all([
          fetchStoredReactions(userId),
          fetchUserTextPosts(userId)
        ]);
        if (!isMounted) {
          return;
        }

        setReactions(results);
        setPosts(ownPosts);

        const detailed = await Promise.all(
          results
            .filter((entry) => entry.reaction === "liked" || entry.reaction === "watched")
            .map(async (entry) => {
              const title = await getTitleById(entry.tmdbId, entry.mediaType);
              if (!title) {
                return null;
              }

              return [`${entry.mediaType}-${entry.tmdbId}`, title] as const;
            })
        );

        if (!isMounted) {
          return;
        }

        const nextTitles: Record<string, DiscoveryItem> = {};
        for (const entry of detailed) {
          if (!entry) {
            continue;
          }

          nextTitles[entry[0]] = entry[1];
        }

        setTitles(nextTitles);
        setSyncMessage(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadProfileMedia();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const tabItems = useMemo(() => {
    return reactions
      .filter((entry) => entry.reaction === activeTab)
      .map((entry) => titles[`${entry.mediaType}-${entry.tmdbId}`])
      .filter((item): item is DiscoveryItem => Boolean(item));
  }, [activeTab, reactions, titles]);

  async function handleRemove(item: DiscoveryItem) {
    if (activeTab === "posts") {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await removeStoredReaction(userId, item, activeTab);
      setReactions((current) =>
        current.filter(
          (entry) =>
            !(
              entry.tmdbId === item.id &&
              entry.mediaType === item.mediaType &&
              entry.reaction === activeTab
            )
        )
      );
    } catch {
      setSyncMessage("No pude eliminar este titulo del perfil.");
    } finally {
      setIsSyncing(false);
    }
  }

  function startEditing(post: FeedEntry) {
    setEditingPostId(post.id);
    setEditingBody(post.body);
  }

  async function handleSavePost(postId: string) {
    const body = editingBody.trim();
    if (!body) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await updateFeedPost({
        postId,
        userId,
        body
      });
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                body
              }
            : post
        )
      );
      setEditingPostId(null);
      setEditingBody("");
    } catch {
      setSyncMessage("No pude editar este post.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDeletePost(postId: string) {
    try {
      setIsSyncing(true);
      setSyncMessage(null);
      await deleteFeedPost({
        postId,
        userId
      });
      setPosts((current) => current.filter((post) => post.id !== postId));
      if (editingPostId === postId) {
        setEditingPostId(null);
        setEditingBody("");
      }
    } catch {
      setSyncMessage("No pude eliminar este post.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="profile-tabs">
      <div className="profile-tabs__switcher">
        {(["watched", "liked", "posts"] as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`profile-tabs__switch ${activeTab === tab ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {syncMessage ? <div className="inline-status">{syncMessage}</div> : null}

      {isLoading ? (
        <div className="profile-grid__empty">Cargando tu videoteca...</div>
      ) : activeTab === "posts" ? (
        posts.length ? (
          <div className="profile-posts">
            {posts.map((post) => (
              <article className="profile-post-card" key={post.id}>
                <div className="profile-post-card__topline">
                  <strong>Post propio</strong>
                  <span>{post.createdAtLabel}</span>
                </div>

                {editingPostId === post.id ? (
                  <textarea
                    className="profile-post-card__textarea"
                    value={editingBody}
                    onChange={(event) => setEditingBody(event.target.value)}
                  />
                ) : (
                  <p className="profile-post-card__text">{post.body}</p>
                )}

                <div className="profile-post-card__actions">
                  {editingPostId === post.id ? (
                    <>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={isSyncing || !editingBody.trim()}
                        onClick={() => void handleSavePost(post.id)}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={isSyncing}
                        onClick={() => {
                          setEditingPostId(null);
                          setEditingBody("");
                        }}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={isSyncing}
                        onClick={() => startEditing(post)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="profile-grid__remove"
                        disabled={isSyncing}
                        onClick={() => void handleDeletePost(post.id)}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="profile-grid__empty">Todavia no publicaste textos propios en el feed.</div>
        )
      ) : tabItems.length ? (
        <div className="profile-grid">
          {tabItems.map((item) => (
            <article className="profile-grid__item" key={`${item.mediaType}-${item.id}`}>
              <img src={item.posterUrl} alt={item.title} className="profile-grid__poster" />
              <div className="profile-grid__meta">
                <strong>{item.title}</strong>
                <span>
                  {item.mediaType === "tv" ? "Serie" : "Pelicula"} • {item.year}
                </span>
                <button
                  type="button"
                  className="profile-grid__remove"
                  disabled={isSyncing}
                  onClick={() => void handleRemove(item)}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="profile-grid__empty">
          {activeTab === "watched"
            ? "Todavia no marcaste titulos como vistos."
            : "Todavia no guardaste titulos en Me gusta."}
        </div>
      )}
    </section>
  );
}
