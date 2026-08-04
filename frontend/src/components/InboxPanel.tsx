import { useEffect, useMemo, useState } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchFollowingUserIds } from "../lib/follows";
import {
  deleteCommentNotification,
  deleteInboxMessage,
  fetchCommentNotifications,
  fetchReceivedMessages,
  fetchSentMessages,
  INBOX_UPDATED_EVENT,
  sendRecommendationReply,
  setCommentNotificationReadState,
  setInboxMessageReadState
} from "../lib/inbox";
import { useMediaDetails } from "./MediaDetailsModal";
import type { CommentInboxNotification, RecommendationMessage } from "../types";

type InboxPanelProps = {
  userId: string;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
  onOpenFeedPost?: (target: { postId: string; focusCommentInput?: boolean }) => void;
};

type InboxMode = "received" | "sent";
type InboxCategory = "recommendations" | "comments";

export function InboxPanel({ userId, onOpenUserProfile, onOpenFeedPost }: InboxPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [category, setCategory] = useState<InboxCategory>("recommendations");
  const [mode, setMode] = useState<InboxMode>("received");
  const [received, setReceived] = useState<RecommendationMessage[]>([]);
  const [sent, setSent] = useState<RecommendationMessage[]>([]);
  const [commentNotifications, setCommentNotifications] = useState<CommentInboxNotification[]>([]);
  const [followingProfiles, setFollowingProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [replyingMessage, setReplyingMessage] = useState<RecommendationMessage | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadInbox() {
      setIsLoading(true);
      setErrorMessage(null);

      const [receivedResult, sentResult, commentsResult, followingResult, profilesResult] = await Promise.allSettled([
        fetchReceivedMessages(userId),
        fetchSentMessages(userId),
        fetchCommentNotifications(userId),
        fetchFollowingUserIds(userId),
        listProfiles()
      ]);

      if (!isMounted) {
        return;
      }

      if (receivedResult.status === "fulfilled") {
        setReceived(receivedResult.value);
      } else {
        setReceived([]);
      }

      if (sentResult.status === "fulfilled") {
        setSent(sentResult.value);
      } else {
        setSent([]);
      }

      if (commentsResult.status === "fulfilled") {
        setCommentNotifications(commentsResult.value);
      } else {
        setCommentNotifications([]);
      }

      if (followingResult.status === "fulfilled" && profilesResult.status === "fulfilled") {
        setFollowingProfiles(
          profilesResult.value.filter((profile) => followingResult.value.includes(profile.id))
        );
      } else {
        setFollowingProfiles([]);
      }

      const inboxFailed =
        receivedResult.status === "rejected" &&
        sentResult.status === "rejected" &&
        commentsResult.status === "rejected";

      if (inboxFailed) {
        setErrorMessage("No pude cargar tu inbox todavia.");
      }

      setIsLoading(false);
    }

    function handleInboxUpdated(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) {
        return;
      }

      void loadInbox();
    }

    void loadInbox();
    window.addEventListener(INBOX_UPDATED_EVENT, handleInboxUpdated as EventListener);

    return () => {
      isMounted = false;
      window.removeEventListener(INBOX_UPDATED_EVENT, handleInboxUpdated as EventListener);
    };
  }, [userId]);

  const visibleMessages = useMemo(
    () => (mode === "received" ? received : sent),
    [mode, received, sent]
  );

  const hasUnreadComments = useMemo(
    () => commentNotifications.some((notification) => !notification.readAt),
    [commentNotifications]
  );

  async function handleToggleRead(message: RecommendationMessage) {
    const nextRead = !message.readAt;

    try {
      setPendingMessageId(message.id);
      await setInboxMessageReadState({
        messageId: message.id,
        userId,
        read: nextRead
      });
      setReceived((current) =>
        current.map((entry) =>
          entry.id === message.id
            ? {
                ...entry,
                readAt: nextRead ? new Date().toISOString() : null
              }
            : entry
        )
      );
    } catch {
      setErrorMessage("No pude cambiar el estado de lectura.");
    } finally {
      setPendingMessageId(null);
    }
  }

  async function handleDelete(message: RecommendationMessage) {
    try {
      setPendingMessageId(message.id);
      await deleteInboxMessage({
        messageId: message.id,
        userId
      });
      setReceived((current) => current.filter((entry) => entry.id !== message.id));
    } catch {
      setErrorMessage("No pude eliminar este mensaje.");
    } finally {
      setPendingMessageId(null);
    }
  }

  async function handleToggleCommentRead(notification: CommentInboxNotification) {
    const nextRead = !notification.readAt;

    try {
      setPendingMessageId(notification.id);
      await setCommentNotificationReadState({
        notificationId: notification.id,
        userId,
        read: nextRead
      });
      setCommentNotifications((current) =>
        current.map((entry) =>
          entry.id === notification.id
            ? {
                ...entry,
                readAt: nextRead ? new Date().toISOString() : null
              }
            : entry
        )
      );
    } catch {
      setErrorMessage("No pude cambiar el estado del comentario.");
    } finally {
      setPendingMessageId(null);
    }
  }

  async function handleDeleteComment(notification: CommentInboxNotification) {
    try {
      setPendingMessageId(notification.id);
      await deleteCommentNotification({
        notificationId: notification.id,
        userId
      });
      setCommentNotifications((current) => current.filter((entry) => entry.id !== notification.id));
    } catch {
      setErrorMessage("No pude eliminar esta notificacion.");
    } finally {
      setPendingMessageId(null);
    }
  }

  async function openCommentNotification(
    notification: CommentInboxNotification,
    options?: { focusCommentInput?: boolean }
  ) {
    try {
      if (!notification.readAt) {
        await setCommentNotificationReadState({
          notificationId: notification.id,
          userId,
          read: true
        });
        setCommentNotifications((current) =>
          current.map((entry) =>
            entry.id === notification.id
              ? {
                  ...entry,
                  readAt: new Date().toISOString()
                }
              : entry
          )
        );
      }
    } catch {
      setErrorMessage("No pude actualizar este comentario.");
    }

    onOpenFeedPost?.({
      postId: notification.postId,
      focusCommentInput: options?.focusCommentInput
    });
  }

  async function handleReplySubmit(body: string) {
    if (!replyingMessage) {
      return;
    }

    const recipientId =
      userId === replyingMessage.senderId ? replyingMessage.recipientId : replyingMessage.senderId;

    try {
      setPendingMessageId(replyingMessage.id);
      setExpandedThreads((current) =>
        current.includes(replyingMessage.id) ? current : [...current, replyingMessage.id]
      );
      await sendRecommendationReply({
        messageId: replyingMessage.id,
        senderId: userId,
        recipientId,
        body
      });
      setReplyingMessage(null);
    } catch {
      setErrorMessage("No pude mandar la respuesta.");
    } finally {
      setPendingMessageId(null);
    }
  }

  function toggleThread(messageId: string) {
    setExpandedThreads((current) =>
      current.includes(messageId)
        ? current.filter((entry) => entry !== messageId)
        : [...current, messageId]
    );
  }

  function renderMessage(message: RecommendationMessage) {
    const counterpart = mode === "received" ? message.senderProfile : message.recipientProfile;
    const directionLabel = mode === "received" ? "Te la mando" : "Se la mandaste a";
    const isUnread = mode === "received" && !message.readAt;
    const isPending = pendingMessageId === message.id;
    const hasReplies = Boolean(message.replies?.length);
    const isExpanded = expandedThreads.includes(message.id);

    return (
      <article className={`inbox-card ${isUnread ? "is-unread" : ""}`} key={message.id}>
        <div className="inbox-card__topline">
          <div>
            <strong>{directionLabel}</strong>{" "}
            <button
              type="button"
              className="timeline-card__author"
              onClick={() =>
                counterpart
                  ? onOpenUserProfile({ userId: counterpart.id, username: counterpart.username })
                  : undefined
              }
            >
              {counterpart?.display_name ?? "Cineriano"}
            </button>
          </div>
          <span>{message.createdAtLabel}</span>
        </div>

        <div className="inbox-card__body">
          <div
            className="timeline-card__media timeline-card__media--interactive inbox-card__media"
            onClick={() => openMediaDetails(message.item)}
          >
            <div className="detail-poster">
              <img src={message.item.posterUrl} alt={message.item.title} className="timeline-card__poster" />
              <span className="detail-poster__hint" aria-hidden="true">
                Ver detalles
              </span>
            </div>
            <div className="timeline-card__media-copy">
              <p className="meta-line">
                {message.item.mediaType === "tv" ? "Serie" : "Pelicula"} • {message.item.year}
              </p>
              <h3>{message.item.title}</h3>
              <p className="timeline-card__note">
                {message.note?.trim()
                  ? `"${message.note.trim()}"`
                  : mode === "received"
                    ? "Te la recomendaron directo por Cinerian."
                    : "La mandaste sin mensaje extra."}
              </p>
            </div>
          </div>

          {mode === "received" ? (
            <div className="inbox-card__actions">
              <button
                type="button"
                className="inbox-card__action-button"
                disabled={isPending}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleToggleRead(message);
                }}
              >
                <span className="inbox-card__action-icon" aria-hidden="true">
                  {message.readAt ? "◐" : "◉"}
                </span>
                <span>{message.readAt ? "No leido" : "Leido"}</span>
              </button>
              <button
                type="button"
                className="inbox-card__action-button"
                disabled={isPending}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedThreads((current) =>
                    current.includes(message.id) ? current : [...current, message.id]
                  );
                  setReplyingMessage(message);
                }}
              >
                <span className="inbox-card__action-icon" aria-hidden="true">
                  ↩
                </span>
                <span>Responder</span>
              </button>
              <button
                type="button"
                className="inbox-card__action-button inbox-card__action-button--danger"
                disabled={isPending}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDelete(message);
                }}
              >
                <span className="inbox-card__action-icon" aria-hidden="true">
                  ✕
                </span>
                <span>Eliminar</span>
              </button>
            </div>
          ) : null}
        </div>

        {hasReplies ? (
          <>
            <button
              type="button"
              className="inbox-card__thread-toggle"
              onClick={() => toggleThread(message.id)}
            >
              <span>{isExpanded ? "Ocultar respuestas" : "Ver respuestas"}</span>
              <strong>{message.replies?.length}</strong>
            </button>

            {isExpanded ? (
              <div className="inbox-card__thread">
                {message.replies?.map((reply) => {
                  const isOwnReply = reply.senderId === userId;
                  return (
                    <article
                      key={reply.id}
                      className={`inbox-card__reply ${isOwnReply ? "is-own" : ""}`}
                    >
                      <div className="inbox-card__reply-topline">
                        <strong>{reply.senderProfile?.display_name ?? "Cineriano"}</strong>
                        <span>{reply.createdAtLabel}</span>
                      </div>
                      <p>{reply.body}</p>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </article>
    );
  }

  function renderCommentNotification(notification: CommentInboxNotification) {
    const isUnread = !notification.readAt;
    const isPending = pendingMessageId === notification.id;
    const postPreview =
      notification.postBody.length > 180
        ? `${notification.postBody.slice(0, 180).trimEnd()}...`
        : notification.postBody;

    return (
      <article className={`inbox-card ${isUnread ? "is-unread" : ""}`} key={notification.id}>
        <div className="inbox-card__topline">
          <div>
            <strong>Comentó tu publicación</strong>{" "}
            <button
              type="button"
              className="timeline-card__author"
              onClick={() =>
                notification.actorProfile
                  ? onOpenUserProfile({
                      userId: notification.actorProfile.id,
                      username: notification.actorProfile.username
                    })
                  : undefined
              }
            >
              {notification.actorProfile?.display_name ?? "Cineriano"}
            </button>
          </div>
          <span>{notification.createdAtLabel}</span>
        </div>

        <div className="inbox-card__body">
          {notification.item ? (
            <div
              className="timeline-card__media timeline-card__media--interactive inbox-card__media"
              onClick={() => openMediaDetails(notification.item!)}
            >
              <div className="detail-poster">
                <img
                  src={notification.item.posterUrl}
                  alt={notification.item.title}
                  className="timeline-card__poster"
                />
                <span className="detail-poster__hint" aria-hidden="true">
                  Ver detalles
                </span>
              </div>
              <div className="timeline-card__media-copy">
                <p className="meta-line">
                  {notification.item.mediaType === "tv" ? "Serie" : "Pelicula"} • {notification.item.year}
                </p>
                <h3>{notification.item.title}</h3>
                <p className="inbox-card__comment-quote">“{notification.body}”</p>
                <p className="inbox-card__post-preview">{postPreview}</p>
              </div>
            </div>
          ) : (
            <div className="inbox-card__comment-fallback">
              <p className="inbox-card__comment-quote">“{notification.body}”</p>
              <p className="inbox-card__post-preview">{postPreview}</p>
            </div>
          )}

          <div className="inbox-card__actions">
            <button
              type="button"
              className="inbox-card__action-button"
              onClick={() => void openCommentNotification(notification)}
            >
              <span className="inbox-card__action-icon" aria-hidden="true">
                ↗
              </span>
              <span>Ver post</span>
            </button>
            <button
              type="button"
              className="inbox-card__action-button"
              onClick={() => void openCommentNotification(notification, { focusCommentInput: true })}
            >
              <span className="inbox-card__action-icon" aria-hidden="true">
                ↩
              </span>
              <span>Responder</span>
            </button>
            <button
              type="button"
              className="inbox-card__action-button"
              disabled={isPending}
              onClick={() => void handleToggleCommentRead(notification)}
            >
              <span className="inbox-card__action-icon" aria-hidden="true">
                {notification.readAt ? "◐" : "◉"}
              </span>
              <span>{notification.readAt ? "No leido" : "Leido"}</span>
            </button>
            <button
              type="button"
              className="inbox-card__action-button inbox-card__action-button--danger"
              disabled={isPending}
              onClick={() => void handleDeleteComment(notification)}
            >
              <span className="inbox-card__action-icon" aria-hidden="true">
                ✕
              </span>
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className="feed-shell">
      <div className="feed-main">
        <header className="feed-header">
          <button
            type="button"
            className={`feed-header__tab ${category === "recommendations" ? "is-active" : ""}`}
            onClick={() => setCategory("recommendations")}
          >
            Recomendaciones
          </button>
          <button
            type="button"
            className={`feed-header__tab ${category === "comments" ? "is-active" : ""}`}
            onClick={() => setCategory("comments")}
          >
            Comentarios
          </button>
        </header>

        {category === "recommendations" ? (
          <div className="inbox-subtabs">
            <button
              type="button"
              className={`inbox-subtabs__button ${mode === "received" ? "is-active" : ""}`}
              onClick={() => setMode("received")}
            >
              Recibidas
            </button>
            <button
              type="button"
              className={`inbox-subtabs__button ${mode === "sent" ? "is-active" : ""}`}
              onClick={() => setMode("sent")}
            >
              Enviadas
            </button>
          </div>
        ) : (
          <div className="inbox-subtabs inbox-subtabs--summary">
            <span className="inbox-subtabs__summary">
              {hasUnreadComments
                ? "Tenés comentarios nuevos en tus publicaciones"
                : "Tus comentarios recibidos aparecen acá"}
            </span>
          </div>
        )}

        <div className="timeline-list">
          {errorMessage ? <div className="timeline-empty">{errorMessage}</div> : null}
          {isLoading ? (
            <div className="timeline-empty">
              {category === "recommendations" ? "Cargando recomendaciones..." : "Cargando comentarios..."}
            </div>
          ) : null}
          {!isLoading && !errorMessage ? (
            category === "recommendations" ? (
              visibleMessages.length ? (
                visibleMessages.map(renderMessage)
              ) : (
                <div className="timeline-empty">
                  {mode === "received"
                    ? "Todavia no recibiste recomendaciones internas."
                    : "Todavia no mandaste recomendaciones a otros cinerianos."}
                </div>
              )
            ) : commentNotifications.length ? (
              commentNotifications.map(renderCommentNotification)
            ) : (
              <div className="timeline-empty">Todavía nadie comentó tus publicaciones.</div>
            )
          ) : null}
        </div>
      </div>

      <aside className="feed-sidebar">
        <section className="sidebar-card">
          <p className="section-eyebrow">Siguiendo</p>
          <h3 className="sidebar-card__title">Tu gente cineriana</h3>
          <div className="sidebar-users">
            {followingProfiles.length ? (
              followingProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className="sidebar-user"
                  onClick={() => onOpenUserProfile({ userId: profile.id, username: profile.username })}
                >
                  <span className="sidebar-user__avatar" aria-hidden="true">
                    {profile.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="sidebar-user__copy">
                    <strong>{profile.display_name}</strong>
                    <span>@{profile.username}</span>
                  </span>
                </button>
              ))
            ) : (
              <p className="sidebar-empty">Cuando sigas a otros cinerianos, te los dejo listados aca.</p>
            )}
          </div>
        </section>
      </aside>

      <ReplyRecommendationModal
        message={replyingMessage}
        isSending={Boolean(replyingMessage && pendingMessageId === replyingMessage.id)}
        onClose={() => setReplyingMessage(null)}
        onSubmit={(body) => void handleReplySubmit(body)}
      />
    </section>
  );
}

function ReplyRecommendationModal({
  message,
  isSending,
  onClose,
  onSubmit
}: {
  message: RecommendationMessage | null;
  isSending: boolean;
  onClose: () => void;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!message) {
      setBody("");
    }
  }, [message]);

  if (!message) {
    return null;
  }

  return (
    <div className="review-modal__backdrop" role="presentation" onClick={onClose}>
      <div className="send-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="send-modal__header">
          <div>
            <p className="section-eyebrow">Responder recomendacion</p>
            <h3>{message.item.title}</h3>
            <p className="send-modal__meta">Tu respuesta queda dentro de esta recomendacion</p>
          </div>
          <button type="button" className="review-modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <label className="send-modal__field">
          <span>Tu respuesta</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder='Ej: "ya la vi" o "me la guardo para el finde"'
          />
        </label>

        <div className="review-modal__actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={isSending || !body.trim()}
            onClick={() => onSubmit(body)}
          >
            {isSending ? "Enviando..." : "Responder"}
          </button>
        </div>
      </div>
    </div>
  );
}
