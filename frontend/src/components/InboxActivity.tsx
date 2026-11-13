import type { CommentInboxNotification } from "../types";

type InboxCategory = "recommendations" | "comments";

export function InboxCategoryTabs({ category, recommendationCount, commentCount, onChange }: {
  category: InboxCategory;
  recommendationCount: number;
  commentCount: number;
  onChange: (category: InboxCategory) => void;
}) {
  return (
    <div className="inbox-category-tabs" role="group" aria-label="Bandeja">
      <button type="button" aria-pressed={category === "recommendations"} className={category === "recommendations" ? "is-active" : ""} onClick={() => onChange("recommendations")}>Conversaciones{recommendationCount ? ` · ${recommendationCount}` : ""}</button>
      <button type="button" aria-pressed={category === "comments"} className={category === "comments" ? "is-active" : ""} onClick={() => onChange("comments")}>Comentarios{commentCount ? ` · ${commentCount}` : ""}</button>
    </div>
  );
}

export function InboxCommentList({ notifications, query, onQueryChange, pendingId, onOpen, onToggleRead, onDismiss }: {
  notifications: CommentInboxNotification[];
  query: string;
  onQueryChange: (value: string) => void;
  pendingId: string | null;
  onOpen: (notification: CommentInboxNotification) => void;
  onToggleRead: (notification: CommentInboxNotification) => void;
  onDismiss: (notification: CommentInboxNotification) => void;
}) {
  const term = query.trim().toLocaleLowerCase();
  const visible = notifications.filter((item) => !term || `${item.actorProfile?.display_name ?? ""} ${item.body} ${item.postBody}`.toLocaleLowerCase().includes(term));

  return (
    <div className="inbox-comments">
      <label className="inbox-search"><input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar comentarios" aria-label="Buscar comentarios" /></label>
      {visible.length ? <div className="inbox-comments__list">
        {visible.map((item) => <article key={item.id} className={`inbox-comments__item ${!item.readAt ? "is-unread" : ""}`}>
          <strong>{item.actorProfile?.display_name ?? "Cineriano"} comentó tu publicación</strong>
          <time dateTime={item.createdAt}>{item.createdAtLabel}</time>
          <p>{item.body || "El comentario ya no está disponible."}</p>
          <div className="inbox-comments__actions">
            <button type="button" onClick={() => onOpen(item)} disabled={pendingId === item.id}>Ver publicación</button>
            <button type="button" onClick={() => onToggleRead(item)} disabled={pendingId === item.id}>{item.readAt ? "Marcar no leído" : "Marcar leído"}</button>
            <button type="button" onClick={() => onDismiss(item)} disabled={pendingId === item.id}>Descartar</button>
          </div>
        </article>)}
      </div> : <p className="inbox-comments__empty">{term ? "No hay comentarios para esa búsqueda." : "Todavía no tenés comentarios en tus publicaciones."}</p>}
    </div>
  );
}
