import { useEffect, useMemo, useState } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchFollowingUserIds } from "../lib/follows";
import {
  fetchReceivedMessages,
  fetchSentMessages,
  INBOX_UPDATED_EVENT,
  markInboxAsRead
} from "../lib/inbox";
import { useMediaDetails } from "./MediaDetailsModal";
import type { RecommendationMessage } from "../types";

type InboxPanelProps = {
  userId: string;
  onOpenUserProfile: (profile: { userId: string; username?: string }) => void;
};

type InboxMode = "received" | "sent";

export function InboxPanel({ userId, onOpenUserProfile }: InboxPanelProps) {
  const { openMediaDetails } = useMediaDetails();
  const [mode, setMode] = useState<InboxMode>("received");
  const [received, setReceived] = useState<RecommendationMessage[]>([]);
  const [sent, setSent] = useState<RecommendationMessage[]>([]);
  const [followingProfiles, setFollowingProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInbox() {
      setIsLoading(true);
      setErrorMessage(null);

      const [receivedResult, sentResult, followingResult, profilesResult] = await Promise.allSettled([
        fetchReceivedMessages(userId),
        fetchSentMessages(userId),
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

      if (followingResult.status === "fulfilled" && profilesResult.status === "fulfilled") {
        setFollowingProfiles(
          profilesResult.value.filter((profile) => followingResult.value.includes(profile.id))
        );
      } else {
        setFollowingProfiles([]);
      }

      const inboxFailed =
        receivedResult.status === "rejected" && sentResult.status === "rejected";

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

  useEffect(() => {
    if (mode !== "received" || !received.length) {
      return;
    }

    void markInboxAsRead(userId);
  }, [mode, received.length, userId]);

  function renderMessage(message: RecommendationMessage) {
    const counterpart = mode === "received" ? message.senderProfile : message.recipientProfile;
    const directionLabel = mode === "received" ? "Te la mando" : "Se la mandaste a";

    return (
      <article className="inbox-card" key={message.id}>
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

        <div className="timeline-card__media timeline-card__media--interactive" onClick={() => openMediaDetails(message.item)}>
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
            <p>
              {message.note?.trim()
                ? `"${message.note.trim()}"`
                : mode === "received"
                  ? "Te la recomendaron directo por Cinerian."
                  : "La mandaste sin mensaje extra."}
            </p>
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
            className={`feed-header__tab ${mode === "received" ? "is-active" : ""}`}
            onClick={() => setMode("received")}
          >
            Recibidas
          </button>
          <button
            type="button"
            className={`feed-header__tab ${mode === "sent" ? "is-active" : ""}`}
            onClick={() => setMode("sent")}
          >
            Enviadas
          </button>
        </header>

        <div className="timeline-list">
          {errorMessage ? <div className="timeline-empty">{errorMessage}</div> : null}
          {isLoading ? <div className="timeline-empty">Cargando recomendaciones...</div> : null}
          {!isLoading && !errorMessage ? (
            visibleMessages.length ? (
              visibleMessages.map(renderMessage)
            ) : (
              <div className="timeline-empty">
                {mode === "received"
                  ? "Todavia no recibiste recomendaciones internas."
                  : "Todavia no mandaste recomendaciones a otros cinerianos."}
              </div>
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
    </section>
  );
}
