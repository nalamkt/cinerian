import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteFeedComment, fetchFeedComments } from "../lib/feed";
import {
  deleteInboxMessage,
  deleteRecommendationReply,
  editRecommendationNote,
  editRecommendationReply,
  fetchReceivedMessages,
  fetchSentMessages,
  INBOX_UPDATED_EVENT,
  markRecommendationRepliesAsRead,
  sendRecommendationReply,
  setCommentNotificationReadState,
  setInboxMessageReadState,
  setRecommendationReplyReadState
} from "../lib/inbox";
import { useMediaDetails } from "./MediaDetailsModal";
import { LoadingState } from "./LoadingState";
import type {
  CommentInboxNotification,
  FeedComment,
  RecommendationMessage,
  RecommendationReply
} from "../types";

type InboxPanelProps = {
  userId: string;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
  onStartRecommendation?: () => void;
};

const QUICK_REPLIES = ["Ya la vi", "Me la guardo", "La estoy viendo", "No es para mí"];

function formatDaySeparator(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const diffDays = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86400000);

  if (diffDays <= 0) {
    return "Hoy";
  }
  if (diffDays === 1) {
    return "Ayer";
  }
  if (diffDays < 7) {
    return `Hace ${diffDays} días`;
  }

  return date.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

function formatClock(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function CommentPostPreviewModal({
  notification,
  comments,
  userId,
  onClose,
  onOpenTitle,
  onDeleteComment
}: {
  notification: CommentInboxNotification | null;
  comments: FeedComment[];
  userId: string;
  onClose: () => void;
  onOpenTitle: (item: NonNullable<CommentInboxNotification["item"]>) => void;
  onDeleteComment: (comment: FeedComment) => void;
}) {
  if (!notification) {
    return null;
  }

  return createPortal(
    <div className="review-modal__backdrop" role="presentation" onClick={onClose}>
      <section
        className="review-modal inbox-post-preview"
        role="dialog"
        aria-modal="true"
        aria-label="Publicación comentada"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="review-modal__close" onClick={onClose} aria-label="Cerrar" data-escape-dismiss>
          ×
        </button>
        <p className="review-modal__kicker">Publicación</p>
        {notification.item ? (
          <div className="review-modal__head">
            <img src={notification.item.posterUrl} alt="" className="review-modal__thumb" />
            <div className="review-modal__head-copy">
              <h3>{notification.item.title}</h3>
              <p>{notification.item.mediaType === "tv" ? "Serie" : "Película"}</p>
            </div>
          </div>
        ) : null}
        <article className="inbox-post-preview__post">
          <p>{notification.postBody || "Esta publicación ya no está disponible."}</p>
        </article>
        <div className="inbox-post-preview__comments">
          <p className="review-modal__kicker">Comentarios</p>
          {comments.map((comment) => (
            <article className="inbox-post-preview__comment" key={comment.id}>
              <div className="inbox-post-preview__comment-meta">
                <span>
                  <strong>{comment.author}</strong>
                  {comment.username ? ` · @${comment.username}` : ""} · {comment.createdAtLabel}
                </span>
                {comment.userId === userId ? (
                  <button type="button" onClick={() => onDeleteComment(comment)} aria-label="Eliminar comentario">
                    Eliminar
                  </button>
                ) : null}
              </div>
              <p>{comment.body}</p>
            </article>
          ))}
        </div>
        {notification.item ? (
          <button
            type="button"
            className="primary-button inbox-post-preview__title-action"
            onClick={() => {
              onOpenTitle(notification.item!);
              onClose();
            }}
          >
            Ver título
          </button>
        ) : null}
      </section>
    </div>,
    document.body
  );
}

export function InboxPanel({ userId, onOpenUserProfile, onStartRecommendation }: InboxPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false
  );
  // Inbox is reserved for recommendation conversations. Post comments live in their post.
  const [category] = useState<"recommendations" | "comments">("recommendations");
  const [received, setReceived] = useState<RecommendationMessage[]>([]);
  const [sent, setSent] = useState<RecommendationMessage[]>([]);
  const [commentNotifications, setCommentNotifications] = useState<CommentInboxNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, FeedComment[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [groupByFriend, setGroupByFriend] = useState(false);
  const composerRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [swipedMessageId, setSwipedMessageId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [threadSwipeOffset, setThreadSwipeOffset] = useState(0);
  const [isThreadSwipeAnimating, setIsThreadSwipeAnimating] = useState(false);
  const [postPreviewNotification, setPostPreviewNotification] = useState<CommentInboxNotification | null>(null);
  const manuallyUnreadReplyMessageIds = useRef(new Set<string>());
  const manuallyUnreadCommentIds = useRef(new Set<string>());
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

    async function loadInbox(options?: { silent?: boolean }) {
      const silent = options?.silent ?? false;
      if (!silent) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      const [receivedResult, sentResult] = await Promise.allSettled([
        fetchReceivedMessages(userId),
        fetchSentMessages(userId)
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

      const inboxFailed =
        receivedResult.status === "rejected" &&
        sentResult.status === "rejected";

      if (inboxFailed) {
        setErrorMessage("No pude cargar tu inbox todavia.");
      }

      if (!silent) {
        setIsLoading(false);
      }
    }

    function handleInboxUpdated(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) {
        return;
      }

      void loadInbox({ silent: true });
    }

    void loadInbox();
    window.addEventListener(INBOX_UPDATED_EVENT, handleInboxUpdated as EventListener);

    return () => {
      isMounted = false;
      window.removeEventListener(INBOX_UPDATED_EVENT, handleInboxUpdated as EventListener);
    };
  }, [userId]);

  const visibleMessages = useMemo(() => {
    const byId = new Map<string, RecommendationMessage>();
    [...received, ...sent].forEach((message) => byId.set(message.id, message));

    return [...byId.values()].sort((left, right) => {
      const leftActivity = left.replies?.[left.replies.length - 1]?.createdAt ?? left.createdAt;
      const rightActivity = right.replies?.[right.replies.length - 1]?.createdAt ?? right.createdAt;
      return rightActivity.localeCompare(leftActivity);
    });
  }, [received, sent]);

  const activeMessage = useMemo(
    () => visibleMessages.find((message) => message.id === activeMessageId) ?? null,
    [activeMessageId, visibleMessages]
  );

  const activeComment = useMemo(
    () => commentNotifications.find((notification) => notification.id === activeCommentId) ?? null,
    [activeCommentId, commentNotifications]
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const isMessageUnread = (message: RecommendationMessage) => {
    const isSent = message.senderId === userId;
    const hasUnreadReply = Boolean(
      message.replies?.some((reply) => reply.recipientId === userId && !reply.readAt)
    );
    return (!isSent && !message.readAt) || hasUnreadReply;
  };

  const unreadCount = useMemo(
    () => visibleMessages.filter(isMessageUnread).length,
    [visibleMessages, userId]
  );

  const filteredMessages = useMemo(() => {
    let result = visibleMessages;

    if (unreadOnly) {
      result = result.filter(isMessageUnread);
    }

    if (!normalizedSearchQuery) {
      return result;
    }

    return result.filter((message) => {
      const counterpart =
        message.senderId === userId ? message.recipientProfile?.display_name : message.senderProfile?.display_name;
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
  }, [normalizedSearchQuery, unreadOnly, userId, visibleMessages]);

  const groupedMessages = useMemo(() => {
    if (!groupByFriend) {
      return null;
    }

    const groups = new Map<string, { label: string; username: string; messages: RecommendationMessage[] }>();
    filteredMessages.forEach((message) => {
      const counterpart = message.senderId === userId ? message.recipientProfile : message.senderProfile;
      const key = counterpart?.id ?? "desconocido";
      if (!groups.has(key)) {
        groups.set(key, {
          label: counterpart?.display_name ?? "Cineriano",
          username: counterpart?.username ?? "cineriano",
          messages: []
        });
      }
      groups.get(key)!.messages.push(message);
    });

    return [...groups.values()];
  }, [filteredMessages, groupByFriend, userId]);

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
    setEditingEntryId(null);
    setEditDraft("");
  }, [activeMessage?.id]);

  useEffect(() => {
    if (activeMessage && !isMobile) {
      const timer = window.setTimeout(() => composerRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    }
  }, [activeMessage?.id, isMobile]);

  useEffect(() => {
    if (!activeMessage) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeMessage?.id, activeMessage?.replies?.length]);

  useEffect(() => {
    manuallyUnreadReplyMessageIds.current.clear();
  }, [activeMessageId]);

  useEffect(() => {
    manuallyUnreadCommentIds.current.clear();
  }, [activeCommentId]);

  useEffect(() => {
    if (!activeMessage) {
      return;
    }

    if (activeMessage.recipientId === userId && !activeMessage.readAt) {
      void handleSetReadState(activeMessage, true);
    }

    if (
      !manuallyUnreadReplyMessageIds.current.has(activeMessage.id) &&
      activeMessage.replies?.some((reply) => reply.recipientId === userId && !reply.readAt)
    ) {
      void markRecommendationRepliesAsRead({ messageId: activeMessage.id, userId });
    }
  }, [activeMessage, userId]);

  useEffect(() => {
    if (!activeComment) {
      return;
    }

    let isMounted = true;
    void fetchFeedComments([activeComment.postId])
      .then((comments) => {
        if (isMounted) {
          setCommentsByPostId((current) => ({ ...current, ...comments }));
        }
      })
      .catch(() => {
        // The notification remains usable even if the historical thread cannot load.
      });

    return () => {
      isMounted = false;
    };
  }, [activeComment?.id, activeComment?.postId]);

  useEffect(() => {
    if (
      activeComment &&
      !activeComment.readAt &&
      !manuallyUnreadCommentIds.current.has(activeComment.id)
    ) {
      void handleSetCommentReadState(activeComment, true);
    }
  }, [activeComment]);

  useEffect(() => {
    setActiveMessageId(null);
    setActiveCommentId(null);
  }, [category, isMobile]);

  useEffect(() => {
    setSearchQuery("");
  }, [category]);

  useEffect(() => {
    setSwipedMessageId(null);
    setSwipeOffset(0);
  }, [activeMessageId, category, isMobile]);

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

  function getLastIncomingReply(message: RecommendationMessage) {
    const lastReply = message.replies?.[message.replies.length - 1];
    return lastReply && lastReply.senderId !== userId ? lastReply : null;
  }

  function isLastMessageIncoming(message: RecommendationMessage) {
    const lastReply = message.replies?.[message.replies.length - 1];
    return lastReply ? lastReply.senderId !== userId : message.senderId !== userId;
  }

  async function handleToggleLastMessageRead(message: RecommendationMessage) {
    const lastIncomingReply = getLastIncomingReply(message);
    if (!lastIncomingReply) {
      await handleToggleRead(message);
      return;
    }

    const nextRead = !lastIncomingReply.readAt;
    try {
      setPendingMessageId(message.id);
      if (!nextRead) {
        manuallyUnreadReplyMessageIds.current.add(message.id);
      }
      await setRecommendationReplyReadState({
        replyId: lastIncomingReply.id,
        userId,
        read: nextRead
      });

      const updateReplies = (entries: RecommendationMessage[]) =>
        entries.map((entry) =>
          entry.id === message.id
            ? {
                ...entry,
                replies: entry.replies?.map((reply) =>
                  reply.id === lastIncomingReply.id
                    ? { ...reply, readAt: nextRead ? new Date().toISOString() : null }
                    : reply
                )
              }
            : entry
        );

      setReceived(updateReplies);
      setSent(updateReplies);
    } catch {
      manuallyUnreadReplyMessageIds.current.delete(message.id);
      setErrorMessage("No pude cambiar el estado de lectura.");
    } finally {
      setPendingMessageId(null);
    }
  }

  async function handleDelete(message: RecommendationMessage) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `¿Eliminar la conversación sobre "${message.item.title}"? No se puede deshacer.`
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      setPendingMessageId(message.id);
      await deleteInboxMessage({
        messageId: message.id,
        userId
      });
      setReceived((current) => current.filter((entry) => entry.id !== message.id));
      setSent((current) => current.filter((entry) => entry.id !== message.id));
      setActiveMessageId((current) => (current === message.id ? null : current));
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

  async function handleSetCommentReadState(notification: CommentInboxNotification, read: boolean) {
    try {
      setPendingMessageId(notification.id);
      if (!read) {
        manuallyUnreadCommentIds.current.add(notification.id);
      }
      await setCommentNotificationReadState({
        notificationId: notification.id,
        userId,
        read
      });
      setCommentNotifications((current) =>
        current.map((entry) =>
          entry.id === notification.id
            ? {
                ...entry,
                readAt: read ? new Date().toISOString() : null
              }
            : entry
        )
      );
    } catch {
      manuallyUnreadCommentIds.current.delete(notification.id);
      setErrorMessage("No pude cambiar el estado del comentario.");
    } finally {
      setPendingMessageId(null);
    }
  }

  async function handleReplySubmit(message: RecommendationMessage, body: string) {
    if (!body.trim()) {
      return;
    }

    const recipientId =
      userId === message.senderId ? message.recipientId : message.senderId;

    const trimmedBody = body.trim();
    const optimisticId = `temp-${Date.now()}`;
    const optimisticReply: RecommendationReply = {
      id: optimisticId,
      messageId: message.id,
      senderId: userId,
      recipientId,
      readAt: null,
      senderProfile: null,
      body: trimmedBody,
      createdAt: new Date().toISOString(),
      createdAtLabel: "Ahora"
    };

    const appendOptimistic = (entries: RecommendationMessage[]) =>
      entries.map((entry) =>
        entry.id === message.id
          ? { ...entry, replies: [...(entry.replies ?? []), optimisticReply] }
          : entry
      );
    const removeOptimistic = (entries: RecommendationMessage[]) =>
      entries.map((entry) =>
        entry.id === message.id
          ? { ...entry, replies: (entry.replies ?? []).filter((reply) => reply.id !== optimisticId) }
          : entry
      );

    setReplyDraft("");
    setReceived(appendOptimistic);
    setSent(appendOptimistic);

    try {
      setPendingMessageId(message.id);
      await sendRecommendationReply({
        messageId: message.id,
        senderId: userId,
        recipientId,
        body: trimmedBody
      });
    } catch {
      setReceived(removeOptimistic);
      setSent(removeOptimistic);
      setReplyDraft(trimmedBody);
      setErrorMessage("No pude mandar la respuesta.");
    } finally {
      setPendingMessageId(null);
    }
  }

  function getCounterpartId(message: RecommendationMessage) {
    return userId === message.senderId ? message.recipientId : message.senderId;
  }

  function startEditEntry(entryId: string, initialBody: string) {
    setEditingEntryId(entryId);
    setEditDraft(initialBody);
  }

  function cancelEditEntry() {
    setEditingEntryId(null);
    setEditDraft("");
  }

  async function handleSaveEdit(
    message: RecommendationMessage,
    entry: { id: string; isRoot: boolean }
  ) {
    const trimmed = editDraft.trim();
    if (!trimmed && !entry.isRoot) {
      return;
    }

    if (entry.id.startsWith("temp-")) {
      setErrorMessage("Esperá un segundo a que se termine de enviar el mensaje.");
      return;
    }

    const recipientId = getCounterpartId(message);
    const previousReceived = received;
    const previousSent = sent;

    const applyEdit = (entries: RecommendationMessage[]) =>
      entries.map((item) => {
        if (item.id !== message.id) {
          return item;
        }
        if (entry.isRoot) {
          return { ...item, note: trimmed };
        }
        return {
          ...item,
          replies: item.replies?.map((reply) =>
            reply.id === entry.id ? { ...reply, body: trimmed } : reply
          )
        };
      });

    setReceived(applyEdit);
    setSent(applyEdit);
    setEditingEntryId(null);
    setEditDraft("");

    try {
      setPendingMessageId(message.id);
      if (entry.isRoot) {
        await editRecommendationNote({ messageId: message.id, userId, recipientId, note: trimmed });
      } else {
        await editRecommendationReply({ replyId: entry.id, userId, recipientId, body: trimmed });
      }
    } catch {
      setReceived(previousReceived);
      setSent(previousSent);
      setErrorMessage("No pude editar el mensaje.");
    } finally {
      setPendingMessageId(null);
    }
  }

  async function handleDeleteReply(message: RecommendationMessage, replyId: string) {
    if (replyId.startsWith("temp-")) {
      setErrorMessage("Esperá un segundo a que se termine de enviar el mensaje.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm("¿Eliminar este mensaje? No se puede deshacer.");
      if (!confirmed) {
        return;
      }
    }

    const recipientId = getCounterpartId(message);
    const previousReceived = received;
    const previousSent = sent;

    const applyDelete = (entries: RecommendationMessage[]) =>
      entries.map((item) =>
        item.id === message.id
          ? { ...item, replies: (item.replies ?? []).filter((reply) => reply.id !== replyId) }
          : item
      );

    setReceived(applyDelete);
    setSent(applyDelete);

    try {
      setPendingMessageId(message.id);
      await deleteRecommendationReply({ replyId, userId, recipientId });
    } catch {
      setReceived(previousReceived);
      setSent(previousSent);
      setErrorMessage("No pude eliminar el mensaje.");
    } finally {
      setPendingMessageId(null);
    }
  }

  async function handleDeletePostComment(comment: FeedComment) {
    try {
      setPendingMessageId(comment.id);
      await deleteFeedComment({ commentId: comment.id, userId });
      setCommentsByPostId((current) => ({
        ...current,
        [comment.postId]: (current[comment.postId] ?? []).filter((entry) => entry.id !== comment.id)
      }));
    } catch {
      setErrorMessage("No pude eliminar el comentario.");
    } finally {
      setPendingMessageId(null);
    }
  }

  function renderMessageListItem(message: RecommendationMessage) {
    const isSent = message.senderId === userId;
    const counterpart = isSent ? message.recipientProfile : message.senderProfile;
    const hasUnreadReply = Boolean(
      message.replies?.some((reply) => reply.recipientId === userId && !reply.readAt)
    );
    const isUnread = (!isSent && !message.readAt) || hasUnreadReply;
    const supportsThreadActions = true;
    const isSwiped = supportsThreadActions && swipedMessageId === message.id;
    const currentOffset = isSwiped ? swipeOffset : 0;
    const lastReply = message.replies?.[message.replies.length - 1];
    const lastMessageIsIncoming = isLastMessageIncoming(message);
    const lastMessageReadAt = lastReply && lastMessageIsIncoming ? lastReply.readAt : message.readAt;
    const activityLabel = lastReply?.createdAtLabel ?? message.createdAtLabel;
    const lastSenderId = lastReply ? lastReply.senderId : message.senderId;
    const previewBody =
      lastReply?.body?.trim() ||
      message.note?.trim() ||
      (message.senderId === userId
        ? "Le mandaste esta recomendación."
        : "Te recomendó este título.");
    const previewIsOwn = lastSenderId === userId;

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
            {lastMessageIsIncoming ? (
              <button
                type="button"
                className="inbox-thread-swipe__action inbox-thread-swipe__action--read"
                onClick={() => {
                  closeSwipeActions();
                  void handleToggleLastMessageRead(message);
                }}
              >
                <span aria-hidden="true">{lastMessageReadAt ? "◐" : "◉"}</span>
                <span>{lastMessageReadAt ? "No leído" : "Leído"}</span>
              </button>
            ) : (
              <button
                type="button"
                className="inbox-thread-swipe__action inbox-thread-swipe__action--delete-right"
                onClick={() => {
                  closeSwipeActions();
                  void handleDelete(message);
                }}
              >
                <span aria-hidden="true">✕</span>
                <span>Eliminar</span>
              </button>
            )}
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
              {activityLabel}
              {isUnread ? <span className="inbox-thread-item__dot" aria-hidden="true" /> : null}
            </span>
          </div>
          <div className="inbox-thread-item__identity">
            <span
              className={`inbox-thread-item__arrow ${isSent ? "is-sent" : "is-received"}`}
              aria-label={isSent ? "Enviado" : "Recibido"}
            >
              {isSent ? "↗" : "↙"}
            </span>
            <span className="inbox-thread-item__profile">
              <span className="inbox-thread-item__profile-avatar" aria-hidden="true">
                {counterpart?.avatar_url ? (
                  <img src={counterpart.avatar_url} alt="" />
                ) : (
                  (counterpart?.display_name ?? "C").slice(0, 1).toUpperCase()
                )}
              </span>
              <span>@{counterpart?.username ?? "cineriano"}</span>
            </span>
          </div>
          <p className="inbox-thread-item__preview">
            {previewIsOwn ? <span className="inbox-thread-item__preview-prefix">Vos: </span> : null}
            {previewBody}
          </p>
        </div>
      </button>
      </div>
    );
  }

  function renderActiveMessage(message: RecommendationMessage) {
    const isSent = message.senderId === userId;
    const counterpart = isSent ? message.recipientProfile : message.senderProfile;
    const isPending = pendingMessageId === message.id;
    const conversation = [
      {
        id: `${message.id}-root`,
        senderId: message.senderId,
        createdAt: message.createdAt,
        createdAtLabel: message.createdAtLabel,
        readAt: message.readAt ?? null,
        body:
          message.note?.trim() ||
          (isSent ? "Le mandaste esta recomendación por Cinerian." : "Te recomendó este título por Cinerian.")
      },
      ...(message.replies ?? []).map((reply) => ({
        id: reply.id,
        senderId: reply.senderId,
        createdAt: reply.createdAt,
        createdAtLabel: reply.createdAtLabel,
        readAt: reply.readAt ?? null,
        body: reply.body
      }))
    ];
    const lastOwnIndex = conversation.reduce(
      (acc, entry, index) => (entry.senderId === userId ? index : acc),
      -1
    );

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
            <button
              type="button"
              className="inbox-thread-view__poster-button"
              onClick={() => openMediaDetails(message.item)}
              aria-label={`Ver detalle de ${message.item.title}`}
            >
              <img
                src={message.item.posterUrl}
                alt={message.item.title}
                className="inbox-thread-view__poster"
              />
            </button>
            <div className="inbox-thread-view__header-copy">
              <span className="inbox-thread-view__kicker">
                {message.item.mediaType === "movie" ? "PELÍCULA" : "SERIE"}
                {message.item.year ? ` • ${message.item.year}` : ""}
              </span>
              <button
                type="button"
                className="inbox-thread-view__title-button"
                onClick={() => openMediaDetails(message.item)}
              >
                <strong className="inbox-thread-view__title">{message.item.title}</strong>
              </button>
              <div className="inbox-thread-view__identity">
                <span className="sidebar-user__avatar inbox-thread-view__avatar" aria-hidden="true">
                  {counterpart?.avatar_url ? (
                    <img src={counterpart.avatar_url} alt="" className="sidebar-user__avatar-image" />
                  ) : (
                    (counterpart?.display_name ?? "C").slice(0, 1).toUpperCase()
                  )}
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
                    {isSent ? "Se la mandaste" : "Te la mandó"} • @{counterpart?.username ?? "cineriano"}
                  </span>
                </div>
              </div>
            </div>
            <div className="inbox-thread-view__header-side">
              {isLastMessageIncoming(message) ? (
                <button
                  type="button"
                  className="inbox-thread-view__action"
                  disabled={isPending}
                  aria-label={
                    (getLastIncomingReply(message)?.readAt ?? message.readAt)
                      ? "Marcar como no leído"
                      : "Marcar como leído"
                  }
                  title={
                    (getLastIncomingReply(message)?.readAt ?? message.readAt)
                      ? "Marcar como no leído"
                      : "Marcar como leído"
                  }
                  onClick={() => void handleToggleLastMessageRead(message)}
                >
                  <span aria-hidden="true">
                    {(getLastIncomingReply(message)?.readAt ?? message.readAt) ? "◐" : "◉"}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className="inbox-thread-view__action"
                aria-label="Ver título"
                title="Ver título"
                onClick={() => openMediaDetails(message.item)}
              >
                <span aria-hidden="true">↗</span>
              </button>
              <button
                type="button"
                className="inbox-thread-view__action inbox-thread-view__action--danger"
                disabled={isPending}
                aria-label="Eliminar conversación"
                title="Eliminar conversación"
                onClick={() => void handleDelete(message)}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </div>

        </div>

        <div className="inbox-thread-view__messages">
          {conversation.map((entry, index) => {
            const isOwn = entry.senderId === userId;
            const daySeparator = formatDaySeparator(entry.createdAt);
            const previousDaySeparator =
              index > 0 ? formatDaySeparator(conversation[index - 1].createdAt) : null;
            const showDaySeparator = Boolean(daySeparator) && daySeparator !== previousDaySeparator;
            const showSeen =
              isOwn &&
              index === lastOwnIndex &&
              index === conversation.length - 1 &&
              Boolean(entry.readAt);
            const timeLabel = formatClock(entry.createdAt) || entry.createdAtLabel;
            const isRoot = entry.id === `${message.id}-root`;
            const isLastOwn = isOwn && index === conversation.length - 1;
            const isEditing = editingEntryId === entry.id;

            return (
              <div key={entry.id} className="inbox-thread-bubble-row">
                {showDaySeparator ? (
                  <div className="inbox-thread-day">
                    <span>{daySeparator}</span>
                  </div>
                ) : null}
                <article className={`inbox-thread-bubble ${isOwn ? "is-own" : "is-other"}`}>
                  {!isOwn ? (
                    <span className="inbox-thread-bubble__avatar" aria-hidden="true">
                      {counterpart?.avatar_url ? (
                        <img src={counterpart.avatar_url} alt="" />
                      ) : (
                        (counterpart?.display_name ?? "C").slice(0, 1).toUpperCase()
                      )}
                    </span>
                  ) : null}
                  <div className="inbox-thread-bubble__content">
                    {isEditing ? (
                      <div className="inbox-bubble-edit">
                        <input
                          type="text"
                          value={editDraft}
                          autoFocus
                          onChange={(event) => setEditDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void handleSaveEdit(message, { id: entry.id, isRoot });
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelEditEntry();
                            }
                          }}
                        />
                        <div className="inbox-bubble-edit__actions">
                          <button type="button" className="inbox-bubble-edit__cancel" onClick={cancelEditEntry}>
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            disabled={!editDraft.trim() && !isRoot}
                            onClick={() => void handleSaveEdit(message, { id: entry.id, isRoot })}
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="inbox-thread-bubble__message">
                          {entry.body}
                          <span className="inbox-thread-bubble__time">{timeLabel}</span>
                        </p>
                        {showSeen ? (
                          <span className="inbox-thread-bubble__seen">
                            <span aria-hidden="true">✓✓</span> Visto
                          </span>
                        ) : null}
                        {isLastOwn ? (
                          <div className="inbox-bubble-actions">
                            <button
                              type="button"
                              onClick={() =>
                                startEditEntry(entry.id, isRoot ? message.note?.trim() ?? "" : entry.body)
                              }
                            >
                              Editar
                            </button>
                            {!isRoot ? (
                              <button
                                type="button"
                                className="inbox-bubble-actions__danger"
                                onClick={() => void handleDeleteReply(message, entry.id)}
                              >
                                Eliminar
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </article>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="inbox-thread-view__composer">
          <div className="inbox-thread-view__quick-replies">
            {QUICK_REPLIES.map((quickReply) => (
              <button
                key={quickReply}
                type="button"
                className="inbox-thread-view__quick-reply"
                disabled={isPending}
                onClick={() => void handleReplySubmit(message, quickReply)}
              >
                {quickReply}
              </button>
            ))}
          </div>
          <div className="inbox-thread-view__composer-row">
            <input
              id="inbox-reply-composer"
              ref={composerRef}
              type="text"
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && replyDraft.trim() && !isPending) {
                  event.preventDefault();
                  void handleReplySubmit(message, replyDraft);
                }
              }}
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

  return (
    <>
      <section className={`feed-shell inbox-shell ${isShowingMobileThread ? "is-thread-open-mobile" : ""}`}>
      <div className="feed-main inbox-main">
        <div className={`inbox-body ${isShowingMobileThread ? "is-mobile-thread-open" : ""}`}>
          {errorMessage ? <div className="timeline-empty">{errorMessage}</div> : null}
          {isLoading ? (
            <LoadingState
              label="Cargando recomendaciones..."
            />
          ) : null}
          {!isLoading && !errorMessage ? (
            visibleMessages.length ? (
                <div className={`inbox-layout ${isMobile ? "is-mobile" : ""}`}>
                  <div className={`inbox-thread-column ${isShowingMobileThread ? "is-hidden-mobile" : ""}`}>
                    <div className="inbox-thread-list__header">
                      <label className="inbox-search">
                        <span aria-hidden="true">⌕</span>
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Buscar conversaciones"
                        />
                      </label>
                      <div className="inbox-thread-list__controls">
                        <div className="inbox-filter-chips" role="group" aria-label="Filtrar conversaciones">
                          <button
                            type="button"
                            className={`inbox-filter-chip ${!unreadOnly ? "is-active" : ""}`}
                            onClick={() => setUnreadOnly(false)}
                          >
                            Todos
                          </button>
                          <button
                            type="button"
                            className={`inbox-filter-chip ${unreadOnly ? "is-active" : ""}`}
                            onClick={() => setUnreadOnly(true)}
                          >
                            No leídos{unreadCount ? ` (${unreadCount})` : ""}
                          </button>
                          <button
                            type="button"
                            className={`inbox-filter-chip ${groupByFriend ? "is-active" : ""}`}
                            aria-pressed={groupByFriend}
                            onClick={() => setGroupByFriend((current) => !current)}
                          >
                            Agrupar por amigo
                          </button>
                        </div>
                        {onStartRecommendation ? (
                          <button
                            type="button"
                            className="inbox-new-recommendation"
                            onClick={onStartRecommendation}
                          >
                            <span aria-hidden="true">+</span>
                            <span>Nueva recomendación</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="inbox-thread-list">
                      {filteredMessages.length ? (
                        groupedMessages ? (
                          groupedMessages.map((group) => (
                            <div className="inbox-friend-group" key={`${group.username}-${group.messages.length}`}>
                              <div className="inbox-friend-group__header">
                                <strong>{group.label}</strong>
                                <span>@{group.username}</span>
                              </div>
                              {group.messages.map(renderMessageListItem)}
                            </div>
                          ))
                        ) : (
                          filteredMessages.map(renderMessageListItem)
                        )
                      ) : (
                        <div className="inbox-list-empty">
                          {unreadOnly
                            ? "No tenés conversaciones sin leer."
                            : "No encontré conversaciones con esa búsqueda."}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`inbox-thread-panel ${isShowingMobileThread ? "is-visible-mobile" : ""}`}>
                    {activeMessage ? (
                      renderActiveMessage(activeMessage)
                    ) : (
                      <div className="inbox-empty-state">
                        <span className="inbox-empty-state__icon" aria-hidden="true">💬</span>
                        <p>Elegí una conversación para abrir el chat completo.</p>
                      </div>
                    )}
                  </div>
                </div>
            ) : (
              <div className="inbox-first-use">
                <span className="inbox-first-use__icon" aria-hidden="true">🎬</span>
                <h3>Todavía no tenés conversaciones</h3>
                <p>Recomendá una peli o serie a un amigo y arrancá el debate acá.</p>
                {onStartRecommendation ? (
                  <button type="button" className="primary-button" onClick={onStartRecommendation}>
                    Recomendá una peli a un amigo
                  </button>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      </div>
      </section>
      <CommentPostPreviewModal
        notification={postPreviewNotification}
        comments={
          postPreviewNotification
            ? commentsByPostId[postPreviewNotification.postId] ?? [
                {
                  id: postPreviewNotification.commentId,
                  postId: postPreviewNotification.postId,
                  userId: postPreviewNotification.actorId,
                  author: postPreviewNotification.actorProfile?.display_name ?? "Cineriano",
                  username: postPreviewNotification.actorProfile?.username,
                  body: postPreviewNotification.body,
                  createdAtLabel: postPreviewNotification.createdAtLabel
                }
              ]
            : []
        }
        userId={userId}
        onClose={() => setPostPreviewNotification(null)}
        onOpenTitle={openMediaDetails}
        onDeleteComment={(comment) => void handleDeletePostComment(comment)}
      />
    </>
  );
}
