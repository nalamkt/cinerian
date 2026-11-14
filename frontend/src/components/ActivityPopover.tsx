import { useEffect, useRef, useState } from "react";
import { collectPendingActivity, type ActivityTarget, type PendingActivity } from "../lib/activity";
import { fetchCommentNotifications, fetchReceivedMessages, fetchSentMessages, INBOX_UPDATED_EVENT } from "../lib/inbox";

type ActivityPopoverProps = {
  userId: string;
  pendingCount: number;
  onClose: () => void;
  onOpenEvent: (target: ActivityTarget) => void;
  onOpenInbox: () => void;
};

export function ActivityPopover({ userId, pendingCount, onClose, onOpenEvent, onOpenInbox }: ActivityPopoverProps) {
  const [events, setEvents] = useState<PendingActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    let active = true;

    async function load() {
      const request = ++requestRef.current;
      try {
        const [received, sent, comments] = await Promise.all([
          fetchReceivedMessages(userId),
          fetchSentMessages(userId),
          fetchCommentNotifications(userId)
        ]);
        if (active && request === requestRef.current) {
          const messages = [...new Map([...received, ...sent].map((message) => [message.id, message])).values()];
          setEvents(collectPendingActivity(userId, messages, comments));
          setError(false);
        }
      } catch {
        if (active && request === requestRef.current) setError(true);
      } finally {
        if (active && request === requestRef.current) setLoading(false);
      }
    }

    function handleUpdate(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId) void load();
    }

    void load();
    window.addEventListener(INBOX_UPDATED_EVENT, handleUpdate);
    return () => {
      active = false;
      window.removeEventListener(INBOX_UPDATED_EVENT, handleUpdate);
    };
  }, [userId]);

  return (
    <section className="activity-popover" role="dialog" aria-label="Actividad" aria-modal="false">
      <div className="activity-popover__header">
        <div><span className="section-eyebrow">TU CÍRCULO</span><h2>Actividad</h2></div>
        <button type="button" className="activity-popover__close" onClick={onClose} aria-label="Cerrar actividad" data-escape-dismiss>×</button>
      </div>
      <div className="activity-popover__list" aria-live="polite">
        {loading ? <p role="status">Cargando actividad...</p> : null}
        {error ? <p role="alert">No pudimos cargar tu actividad. Probá de nuevo más tarde.</p> : null}
        {!loading && !error && events.length === 0 && pendingCount === 0 ? <p>Estás al día. No tenés actividad pendiente.</p> : null}
        {!loading && !error && events.length === 0 && pendingCount > 0 ? <p>Hay pendientes que no pudimos mostrar. Revisá tus conversaciones.</p> : null}
        {!loading && !error ? events.map((event) => (
          <button key={event.key} type="button" className="activity-popover__event" onClick={() => onOpenEvent(event.target)}>
            <span className="activity-popover__event-type">{event.type === "recommendation" ? "Recomendación" : event.type === "reply" ? "Respuesta" : "Comentario"}</span>
            <strong>{event.label}</strong>
            {event.body ? <span className="activity-popover__event-body">{event.body}</span> : null}
            <time dateTime={event.createdAt}>{event.createdAtLabel}</time>
          </button>
        )) : null}
      </div>
      <button type="button" className="activity-popover__all" onClick={onOpenInbox}>Ver conversaciones <span aria-hidden="true">→</span></button>
    </section>
  );
}
