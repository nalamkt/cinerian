import { useEffect, useMemo, useRef, useState } from "react";
import { createFeedComment } from "../lib/feed";
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
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false
  );
  const [category, setCategory] = useState<InboxCategory>("recommendations");
  const [mode, setMode] = useState<InboxMode>("received");
  const [received, setReceived] = useState<RecommendationMessage[]>([]);
  const [sent, setSent] = useState<RecommendationMessage[]>([]);
  const [commentNotifications, setCommentNotifications] = useState<CommentInboxNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [commentReplyDraft, setCommentReplyDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [swipedMessageId, setSwipedMessageId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [threadSwipeOffset, setThreadSwipeOffset] = useState(0);
  const [isThreadSwipeAnimating, setIsThreadSwipeAnimating] = useState(false);
  const swipeRef = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    dragging: boolean;
    hasLockedDirection: boolean;
    isHorizontal: boolean;
  }>({
    id: null,
    startX: 0,
    startY: 0,
    dragging: false,
    hasLockedDirection: false,
    isHorizontal: false
  });
  const threadSwipeRef = useRef<{
    startX: number;
    startY: number;
    tracking: boolean;
    hasLockedDirection: boolean;
    isHorizontal: boolean;
  }>({
    startX: 0,
    startY: 0,
    tracking: false,
    hasLockedDirection: false,
    isHorizontal: false
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInbox() {
      setIsLoading(true);
      setErrorMessage(null);

      const [receivedResult, sentResult, commentsResult] = await Promise.allSettled([
        fetchReceivedMessages(userId),
        fetchSentMessages(userId),
        fetchCommentNotifications(userId)
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

  const activeMessage = useMemo(
    () => visibleMessages.find((message) => message.id === activeMessageId) ?? null,
    [activeMessageId, visibleMessages]
  );

  const activeComment = useMemo(
    () => commentNotifications.find((notification) => notification.id === activeCommentId) ?? null,
    [activeCommentId, commentNotifications]
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredMessages = useMemo(() => {
    if (!normalizedSearchQuery) {
      return visibleMessages;
    }

    return visibleMessages.filter((message) => {
      const counterpart =
        mode === "received" ? message.senderProfile?.display_name : message.recipientProfile?.display_name;
      const preview =
        message.note?.trim() ||
        message.replies?.[message.replies.length - 1]?.body ||
        message.item.title;

      const haystack = [
        counterpart ?? "",
        message.item.title,
        preview,
        message.senderProfile?.username ?? "",
        message.recipientProfile?.username ?? ""
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearchQuery);
    });
  }, [mode, normalizedSearchQuery, visibleMessages]);

  const filteredCommentNotifications = useMemo(() => {
    if (!normalizedSearchQuery) {
      return commentNotifications;
    }

    return commentNotifications.filter((notification) => {
      const haystack = [
        notification.actorProfile?.display_name ?? "",
        notification.actorProfile?.username ?? "",
        notification.body,
        notification.postBody,
        notification.item?.title ?? ""
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearchQuery);
    });
  }, [commentNotifications, normalizedSearchQuery]);

  const isShowingMobileThread =
    isMobile &&
    ((category === "recommendations" && Boolean(activeMessage)) ||
      (category === "comments" && Boolean(activeComment)));

  useEffect(() => {
    if (category !== "recommendations") {
      return;
    }

    if (!filteredMessages.length || (activeMessageId && !filteredMessages.some((message) => message.id === activeMessageId))) {
      setActiveMessageId(null);
    }
  }, [activeMessageId, category, filteredMessages]);

  useEffect(() => {
    if (category !== "comments") {
      return;
    }

    if (
      !filteredCommentNotifications.length ||
      (activeCommentId &&
        !filteredCommentNotifications.some((notification) => notification.id === activeCommentId))
    ) {
      setActiveCommentId(null);
    }
  }, [activeCommentId, category, filteredCommentNotifications]);

  useEffect(() => {
    if (!activeMessage) {
      setReplyDraft("");
    }
  }, [activeMessage?.id]);

  useEffect(() => {
    if (!activeMessage || mode !== "received" || activeMessage.readAt) {
      return;
    }

    void handleSetReadState(activeMessage, true);
  }, [activeMessage, mode]);

  useEffect(() => {
    if (!activeComment) {
      setCommentReplyDraft("");
    }
  }, [activeComment?.id]);

  useEffect(() => {
    setActiveMessageId(null);
    setActiveCommentId(null);
  }, [category, mode, isMobile]);

  useEffect(() => {
    setSearchQuery("");
  }, [category, mode]);

  useEffect(() => {
    setSwipedMessageId(null);
    setSwipeOffset(0);
  }, [activeMessageId, category, mode, isMobile]);

  useEffect(() => {
    if (!isShowingMobileThread) {
      setThreadSwipeOffset(0);
      setIsThreadSwipeAnimating(false);
    }
  }, [isShowingMobileThread]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.classList.toggle("inbox-mobile-thread-open", isShowingMobileThread);

    return () => {
      document.body.classList.remove("inbox-mobile-thread-open");
    };
  }, [isShowingMobileThread]);

  async function handleSetReadState(message: RecommendationMessage, read: boolean) {
    try {
      setPendingMessageId(message.id);
      await setInboxMessageReadState({
        messageId: message.id,
        userId,
        read
      });
      setReceived((current) =>
        current.map((entry) =>
          entry.id === message.id
            ? {
                ...entry,
                readAt: read ? new Date().toISOString() : null
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

  async function handleToggleRead(message: RecommendationMessage) {
    await handleSetReadState(message, !message.readAt);
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

  function beginSwipe(messageId: string, clientX: number, clientY: number) {
    if (!isMobile) {
      return;
    }

    swipeRef.current = {
      id: messageId,
      startX: clientX,
      startY: clientY,
      dragging: true,
      hasLockedDirection: false,
      isHorizontal: false
    };
  }

  function moveSwipe(clientX: number, clientY: number) {
    if (!swipeRef.current.dragging || !swipeRef.current.id) {
      return;
    }

    const deltaX = clientX - swipeRef.current.startX;
    const deltaY = clientY - swipeRef.current.startY;

    if (!swipeRef.current.hasLockedDirection) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
        return;
      }

      swipeRef.current.hasLockedDirection = true;
      swipeRef.current.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
    }

    if (!swipeRef.current.isHorizontal) {
      return;
    }

    const delta = deltaX;
    if (Math.abs(delta) < 18) {
      setSwipedMessageId(null);
      setSwipeOffset(0);
      return;
    }

    if (swipedMessageId !== swipeRef.current.id) {
      setSwipedMessageId(swipeRef.current.id);
    }

    const clamped = Math.max(-104, Math.min(104, delta));
    setSwipeOffset(clamped);
  }

  function endSwipe() {
    if (!swipeRef.current.id) {
      return;
    }

    const finalOffset = swipeOffset > 44 ? 92 : swipeOffset < -44 ? -92 : 0;
    setSwipeOffset(finalOffset);

    if (finalOffset === 0) {
      setSwipedMessageId(null);
    }

    swipeRef.current = {
      id: null,
      startX: 0,
      startY: 0,
      dragging: false,
      hasLockedDirection: false,
      isHorizontal: false
    };
  }

  function closeSwipeActions() {
    setSwipedMessageId(null);
    setSwipeOffset(0);
    swipeRef.current = {
      id: null,
      startX: 0,
      startY: 0,
      dragging: false,
      hasLockedDirection: false,
      isHorizontal: false
    };
  }

  function closeMobileThread() {
    setThreadSwipeOffset(0);
    setIsThreadSwipeAnimating(false);
    setActiveMessageId(null);
    setActiveCommentId(null);
  }

  function beginThreadSwipe(clientX: number, clientY: number) {
    if (!isMobile || clientX > 32) {
      return;
    }

    threadSwipeRef.current = {
      startX: clientX,
      startY: clientY,
      tracking: true,
      hasLockedDirection: false,
      isHorizontal: false
    };
    setIsThreadSwipeAnimating(false);
    setThreadSwipeOffset(0);
  }

  function moveThreadSwipe(clientX: number, clientY: number) {
    if (!threadSwipeRef.current.tracking) {
      return;
    }

    const deltaX = clientX - threadSwipeRef.current.startX;
    const deltaY = clientY - threadSwipeRef.current.startY;

    if (!threadSwipeRef.current.hasLockedDirection) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
        return;
      }

      threadSwipeRef.current.hasLockedDirection = true;
      threadSwipeRef.current.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
    }

    if (!threadSwipeRef.current.isHorizontal || deltaX <= 0) {
      setThreadSwipeOffset(0);
      return;
    }

    setThreadSwipeOffset(Math.min(deltaX, 140));
  }

  function endThreadSwipe(clientX?: number, clientY?: number) {
    if (!threadSwipeRef.current.tracking) {
      return;
    }

    const endX = clientX ?? threadSwipeRef.current.startX;
    const endY = clientY ?? threadSwipeRef.current.startY;
    const deltaX = endX - threadSwipeRef.current.startX;
    const deltaY = endY - threadSwipeRef.current.startY;
    const shouldClose =
      threadSwipeRef.current.isHorizontal && deltaX > 72 && Math.abs(deltaY) < Math.abs(deltaX);

    threadSwipeRef.current = {
      startX: 0,
      startY: 0,
      tracking: false,
      hasLockedDirection: false,
      isHorizontal: false
    };

    if (shouldClose) {
      setIsThreadSwipeAnimating(true);
      setThreadSwipeOffset(220);
      window.setTimeout(() => {
        closeMobileThread();
      }, 180);
      return;
    }

    setIsThreadSwipeAnimating(true);
    setThreadSwipeOffset(0);
    window.setTimeout(() => {
      setIsThreadSwipeAnimating(false);
    }, 180);
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

  async function handleReplySubmit(message: RecommendationMessage, body: string) {
    if (!body.trim()) {
      return;
    }

    const recipientId =
      userId === message.senderId ? message.recipientId : message.senderId;

    try {
      setPendingMessageId(message.id);
      await sendRecommendationReply({
        messageId: message.id,
        senderId: userId,
        recipientId,
        body
      });
      setReplyDraft("");
    } catch {
      setErrorMessage("No pude mandar la respuesta.");
    } finally {
      setPendingMessageId(null);
    }
  }

  async function handleCommentReplySubmit(notification: CommentInboxNotification, body: string) {
    if (!body.trim()) {
      return;
    }

    try {
      setPendingMessageId(notification.id);
      await createFeedComment({
        postId: notification.postId,
        userId,
        body
      });
      setCommentReplyDraft("");
      await openCommentNotification(notification, { focusCommentInput: true });
    } catch {
      setErrorMessage("No pude mandar tu respuesta.");
    } finally {
      setPendingMessageId(null);
    }
  }

  function renderMessageListItem(message: RecommendationMessage) {
    const counterpart = mode === "received" ? message.senderProfile : message.recipientProfile;
    const isUnread = mode === "received" && !message.readAt;
    const supportsThreadActions = mode === "received";
    const isSwiped = supportsThreadActions && swipedMessageId === message.id;
    const currentOffset = isSwiped ? swipeOffset : 0;
    const preview =
      message.note?.trim() ||
      (message.replies?.length
        ? message.replies[message.replies.length - 1]?.body
        : mode === "received"
          ? "Te la recomendaron directo por Cinerian."
          : "La mandaste sin mensaje extra.");

    return (
      <div
        key={message.id}
        className={`inbox-thread-swipe ${isSwiped && currentOffset !== 0 ? "is-open" : ""} ${
          currentOffset > 0 ? "is-revealing-delete" : ""
        } ${currentOffset < 0 ? "is-revealing-read" : ""}`}
      >
        {supportsThreadActions ? (
          <>
            <button
              type="button"
              className="inbox-thread-swipe__action inbox-thread-swipe__action--delete"
              onClick={() => {
                closeSwipeActions();
                void handleDelete(message);
              }}
            >
              <span aria-hidden="true">✕</span>
              <span>Eliminar</span>
            </button>
            <button
              type="button"
              className="inbox-thread-swipe__action inbox-thread-swipe__action--read"
              onClick={() => {
                closeSwipeActions();
                void handleToggleRead(message);
              }}
            >
              <span aria-hidden="true">{message.readAt ? "◐" : "◉"}</span>
              <span>{message.readAt ? "No leído" : "Leído"}</span>
            </button>
          </>
        ) : null}
        <button
          type="button"
          className={`inbox-thread-item ${isUnread ? "is-unread" : ""} ${
            activeMessage?.id === message.id ? "is-active" : ""
          }`}
          style={isMobile ? { transform: `translateX(${currentOffset}px)` } : undefined}
          onTouchStart={(event) =>
            supportsThreadActions
              ? beginSwipe(
                  message.id,
                  event.touches[0]?.clientX ?? 0,
                  event.touches[0]?.clientY ?? 0
                )
              : undefined
          }
          onTouchMove={(event) =>
            supportsThreadActions
              ? moveSwipe(event.touches[0]?.clientX ?? 0, event.touches[0]?.clientY ?? 0)
              : undefined
          }
          onTouchEnd={supportsThreadActions ? endSwipe : undefined}
          onTouchCancel={supportsThreadActions ? endSwipe : undefined}
          onClick={() => {
            if (isSwiped && currentOffset !== 0) {
              closeSwipeActions();
              return;
            }
            setActiveMessageId(message.id);
          }}
        >
          <img src={message.item.posterUrl} alt={message.item.title} className="inbox-thread-item__poster" />
          <div className="inbox-thread-item__copy">
          <div className="inbox-thread-item__topline">
            <strong>{message.item.title}</strong>
            <span>
              {message.createdAtLabel}
              {mode === "received" && isUnread ? <span className="inbox-thread-item__dot" aria-hidden="true" /> : null}
            </span>
          </div>
          <div className="inbox-thread-item__identity">
            <span>
              {mode === "received" ? "De" : "Para"} @{counterpart?.username ?? "cineriano"}
            </span>
          </div>
          <p>{preview}</p>
        </div>
      </button>
      </div>
    );
  }

  function renderActiveMessage(message: RecommendationMessage) {
    const counterpart = mode === "received" ? message.senderProfile : message.recipientProfile;
    const isPending = pendingMessageId === message.id;
    const conversation = [
      {
        id: `${message.id}-root`,
        senderId: message.senderId,
        author: message.senderProfile?.display_name ?? "Cineriano",
        createdAtLabel: message.createdAtLabel,
        body:
          message.note?.trim() ||
          (mode === "received"
            ? "Te recomendó este título por Cinerian."
            : "Le mandaste esta recomendación por Cinerian.")
      },
      ...(message.replies ?? []).map((reply) => ({
        id: reply.id,
        senderId: reply.senderId,
        author: reply.senderProfile?.display_name ?? "Cineriano",
        createdAtLabel: reply.createdAtLabel,
        body: reply.body
      }))
    ];

    return (
      <article
        className="inbox-thread-view"
        style={
          isMobile
            ? {
                transform: `translateX(${threadSwipeOffset}px)`,
                opacity: 1 - Math.min(threadSwipeOffset / 260, 0.22),
                transition: isThreadSwipeAnimating ? "transform 180ms ease, opacity 180ms ease" : "none"
              }
            : undefined
        }
        onTouchStart={(event) => beginThreadSwipe(event.touches[0]?.clientX ?? 0, event.touches[0]?.clientY ?? 0)}
        onTouchMove={(event) => moveThreadSwipe(event.touches[0]?.clientX ?? 0, event.touches[0]?.clientY ?? 0)}
        onTouchEnd={(event) =>
          endThreadSwipe(event.changedTouches[0]?.clientX ?? 0, event.changedTouches[0]?.clientY ?? 0)
        }
        onTouchCancel={() => endThreadSwipe()}
      >
        <div className="inbox-thread-view__summary">
          {isMobile ? (
            <button
              type="button"
              className="inbox-thread-view__back"
              onClick={() => setActiveMessageId(null)}
            >
              <span aria-hidden="true">←</span>
              <span>Volver</span>
            </button>
          ) : null}
          <div className="inbox-thread-view__header">
            <div className="inbox-thread-view__header-copy">
              <span className="inbox-thread-view__kicker">
                {message.item.mediaType === "movie" ? "PELICULA" : "SERIE"} • {message.item.year}
              </span>
              <strong className="inbox-thread-view__title">{message.item.title}</strong>
              <div className="inbox-thread-view__identity">
                <span className="sidebar-user__avatar inbox-thread-view__avatar" aria-hidden="true">
                  {(counterpart?.display_name ?? "C").slice(0, 1).toUpperCase()}
                </span>
                <div className="inbox-thread-view__identity-copy">
                  <button
                    type="button"
                    className="timeline-card__author inbox-thread-view__author"
                    onClick={() =>
                      counterpart
                        ? onOpenUserProfile({ userId: counterpart.id, username: counterpart.username })
                        : undefined
                    }
                  >
                    {counterpart?.display_name ?? "Cineriano"}
                  </button>
                  <span>
                    {mode === "received" ? "Te la mandó" : "Se la mandaste"} • @{counterpart?.username ?? "cineriano"}
                  </span>
                </div>
              </div>
            </div>
            <div className="inbox-thread-view__header-side">
              <div className="inbox-thread-view__actions inbox-thread-view__actions--header">
                {!isMobile && mode === "received" ? (
                  <button
                    type="button"
                    className="inbox-card__action-button"
                    disabled={isPending}
                    onClick={() => void handleToggleRead(message)}
                  >
                    <span className="inbox-card__action-icon" aria-hidden="true">
                      {message.readAt ? "◐" : "◉"}
                    </span>
                    <span>{message.readAt ? "No leído" : "Marcar leído"}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inbox-card__action-button"
                  onClick={() => openMediaDetails(message.item)}
                >
                  <span className="inbox-card__action-icon" aria-hidden="true">
                    ↗
                  </span>
                    <span>Ver título</span>
                  </button>
                {!isMobile && mode === "received" ? (
                  <button
                    type="button"
                    className="inbox-card__action-button inbox-card__action-button--danger"
                    disabled={isPending}
                    onClick={() => void handleDelete(message)}
                  >
                    <span className="inbox-card__action-icon" aria-hidden="true">
                      ✕
                    </span>
                    <span>Eliminar</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

        </div>

        <div className="inbox-thread-view__messages">
          {conversation.map((entry) => {
            const isOwn = entry.senderId === userId;
            return (
              <article
                key={entry.id}
                className={`inbox-thread-bubble ${isOwn ? "is-own" : "is-other"}`}
              >
                <div className="inbox-thread-bubble__topline">
                  <strong>{entry.author}</strong>
                  <span>{entry.createdAtLabel}</span>
                </div>
                <p>{entry.body}</p>
              </article>
            );
          })}
        </div>

        <div className="inbox-thread-view__composer">
          <div className="inbox-thread-view__composer-row">
            <input
              id="inbox-reply-composer"
              type="text"
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              placeholder='Ej: "ya la vi" o "me la guardo para el finde"'
            />
            <button
              type="button"
              className="primary-button"
              disabled={isPending || !replyDraft.trim()}
              onClick={() => void handleReplySubmit(message, replyDraft)}
            >
              {isPending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      </article>
    );
  }

  function renderCommentNotificationListItem(notification: CommentInboxNotification) {
    const isUnread = !notification.readAt;
    const postPreview =
      notification.body.length > 90 ? `${notification.body.slice(0, 90).trimEnd()}...` : notification.body;

    return (
      <button
        type="button"
        className={`inbox-thread-item ${isUnread ? "is-unread" : ""} ${
          activeComment?.id === notification.id ? "is-active" : ""
        }`}
        key={notification.id}
        onClick={() => setActiveCommentId(notification.id)}
      >
        <span className="sidebar-user__avatar inbox-thread-item__avatar" aria-hidden="true">
          {(notification.actorProfile?.display_name ?? "C").slice(0, 1).toUpperCase()}
        </span>
        <div className="inbox-thread-item__copy">
          <div className="inbox-thread-item__topline">
            <strong>{notification.actorProfile?.display_name ?? "Cineriano"}</strong>
            <span>{notification.createdAtLabel}</span>
          </div>
          <div className="inbox-thread-item__meta">
            <span className="inbox-thread-item__title">Comentario nuevo</span>
            {isUnread ? <span className="inbox-thread-item__dot" aria-hidden="true" /> : null}
          </div>
          <p>{`"${postPreview}"`}</p>
        </div>
      </button>
    );
  }

  function renderActiveComment(notification: CommentInboxNotification) {
    const isPending = pendingMessageId === notification.id;
    const postPreview =
      notification.postBody.length > 220
        ? `${notification.postBody.slice(0, 220).trimEnd()}...`
        : notification.postBody;

    return (
      <article
        className="inbox-thread-view"
        style={
          isMobile
            ? {
                transform: `translateX(${threadSwipeOffset}px)`,
                opacity: 1 - Math.min(threadSwipeOffset / 260, 0.22),
                transition: isThreadSwipeAnimating ? "transform 180ms ease, opacity 180ms ease" : "none"
              }
            : undefined
        }
        onTouchStart={(event) => beginThreadSwipe(event.touches[0]?.clientX ?? 0, event.touches[0]?.clientY ?? 0)}
        onTouchMove={(event) => moveThreadSwipe(event.touches[0]?.clientX ?? 0, event.touches[0]?.clientY ?? 0)}
        onTouchEnd={(event) =>
          endThreadSwipe(event.changedTouches[0]?.clientX ?? 0, event.changedTouches[0]?.clientY ?? 0)
        }
        onTouchCancel={() => endThreadSwipe()}
      >
        <div className="inbox-thread-view__summary">
          {isMobile ? (
            <button
              type="button"
              className="inbox-thread-view__back"
              onClick={() => setActiveCommentId(null)}
            >
              <span aria-hidden="true">←</span>
              <span>Volver</span>
            </button>
          ) : null}
          <div className="inbox-thread-view__header">
            <div className="inbox-thread-view__header-copy">
              <div className="inbox-thread-view__identity">
                <span className="sidebar-user__avatar inbox-thread-view__avatar" aria-hidden="true">
                  {(notification.actorProfile?.display_name ?? "C").slice(0, 1).toUpperCase()}
                </span>
                <div className="inbox-thread-view__identity-copy">
                  <button
                    type="button"
                    className="timeline-card__author inbox-thread-view__author"
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
                  <span>@{notification.actorProfile?.username ?? "cineriano"}</span>
                </div>
              </div>
              <p>Comentó una de tus publicaciones</p>
            </div>
            <div className="inbox-thread-view__header-side">
              <div className="inbox-thread-view__actions inbox-thread-view__actions--header">
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
                  onClick={() => (notification.item ? openMediaDetails(notification.item) : void openCommentNotification(notification))}
                >
                  <span className="inbox-card__action-icon" aria-hidden="true">
                    ↗
                  </span>
                  <span>Ver título</span>
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
                  <span>{notification.readAt ? "No leído" : "Marcar leído"}</span>
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
          </div>

        </div>

        <div className="inbox-thread-view__messages">
          <article className="inbox-thread-bubble is-own">
            <div className="inbox-thread-bubble__topline">
              <strong>Tu publicación</strong>
            </div>
            <p>{postPreview}</p>
          </article>

          <article className="inbox-thread-bubble is-other">
            <div className="inbox-thread-bubble__topline">
              <strong>{notification.actorProfile?.display_name ?? "Cineriano"}</strong>
              <span>{notification.createdAtLabel}</span>
            </div>
            <p>{notification.body}</p>
          </article>
        </div>

        <div className="inbox-thread-view__composer">
          <div className="inbox-thread-view__composer-row">
            <input
              id="inbox-comment-composer"
              type="text"
              value={commentReplyDraft}
              onChange={(event) => setCommentReplyDraft(event.target.value)}
              placeholder='Ej: "yo también la vi" o "banco fuerte esta recomendación"'
            />
            <button
              type="button"
              className="primary-button"
              disabled={isPending || !commentReplyDraft.trim()}
              onClick={() => void handleCommentReplySubmit(notification, commentReplyDraft)}
            >
              {isPending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className={`feed-shell inbox-shell ${isShowingMobileThread ? "is-thread-open-mobile" : ""}`}>
      <div className="feed-main inbox-main">
        {!isShowingMobileThread ? (
          <>
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

          <div className="inbox-mobile-toolbar">
            <div className="inbox-mobile-toolbar__copy">
              <strong>{category === "recommendations" ? "Inbox cineriano" : "Comentarios"}</strong>
              <span>
                {category === "recommendations"
                  ? "Busca recomendaciones y respuestas"
                  : "Busca actividad sobre tus publicaciones"}
              </span>
            </div>
            <label className="inbox-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={category === "recommendations" ? "Buscar conversaciones" : "Buscar comentarios"}
              />
            </label>
            </div>
          </>
        ) : null}

        <div className={`inbox-body ${isShowingMobileThread ? "is-mobile-thread-open" : ""}`}>
          {errorMessage ? <div className="timeline-empty">{errorMessage}</div> : null}
          {isLoading ? (
            <div className="timeline-empty">
              {category === "recommendations" ? "Cargando recomendaciones..." : "Cargando comentarios..."}
            </div>
          ) : null}
          {!isLoading && !errorMessage ? (
            category === "recommendations" ? (
              filteredMessages.length ? (
                <div className={`inbox-layout ${isMobile ? "is-mobile" : ""}`}>
                  <div className={`inbox-thread-list ${isShowingMobileThread ? "is-hidden-mobile" : ""}`}>
                    {filteredMessages.map(renderMessageListItem)}
                  </div>
                  <div className={`inbox-thread-panel ${isShowingMobileThread ? "is-visible-mobile" : ""}`}>
                    {activeMessage ? (
                      renderActiveMessage(activeMessage)
                    ) : (
                      <div className="inbox-empty-state">Elegí una conversación para abrir el chat completo.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="timeline-empty">
                  {normalizedSearchQuery
                    ? "No encontré conversaciones con esa búsqueda."
                    : mode === "received"
                    ? "Todavia no recibiste recomendaciones internas."
                    : "Todavia no mandaste recomendaciones a otros cinerianos."}
                </div>
              )
            ) : filteredCommentNotifications.length ? (
              <div className={`inbox-layout ${isMobile ? "is-mobile" : ""}`}>
                <div className={`inbox-thread-list ${isShowingMobileThread ? "is-hidden-mobile" : ""}`}>
                  {filteredCommentNotifications.map(renderCommentNotificationListItem)}
                </div>
                <div className={`inbox-thread-panel ${isShowingMobileThread ? "is-visible-mobile" : ""}`}>
                  {activeComment ? (
                    renderActiveComment(activeComment)
                  ) : (
                    <div className="inbox-empty-state">Elegí un comentario para abrir el hilo completo.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="timeline-empty">
                {normalizedSearchQuery
                  ? "No encontré comentarios con esa búsqueda."
                  : "Todavía nadie comentó tus publicaciones."}
              </div>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
