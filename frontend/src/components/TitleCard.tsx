import { useEffect, useRef, useState } from "react";
import { isRatedReaction, type RatedReaction, type RecommendationReaction } from "../lib/reactions";
import { WatchNowRow } from "./WatchNowRow";
import type { ProfileSummary } from "../lib/auth";
import type { DiscoveryItem } from "../types";

/** Accion directa sobre el poster, visible al pasar el mouse (Watchlist desktop). */
export type TitleCardQuickAction = {
  id: string;
  label: string;
  tone?: "primary" | "ghost";
  onClick: () => void;
};

type TitleCardProps = {
  item: DiscoveryItem;
  reaction?: RecommendationReaction;
  onOpenDetails: () => void;
  onChangeRating?: (reaction: RatedReaction) => void;
  onRemove?: () => void;
  removeLabel?: string;
  isRemoving?: boolean;
  /** De quien es el puntaje del poster ("TMDB"): sin esto es solo una estrella. */
  scoreSource?: string;
  /** Duracion o temporadas: lo que ayuda a decidir si la mirás hoy. */
  showLength?: boolean;
  /** Personas que seguis y que tambien la tienen guardada. */
  friends?: ProfileSummary[];
  quickActions?: TitleCardQuickAction[];
  isHighlighted?: boolean;
  /** Pasa la fila "Ver en" al modo compacto, con estas plataformas primero. */
  preferredProviderIds?: number[];
  /** Mobile: el boton "···" abre un panel inferior en vez del menu chico. */
  onOpenActions?: () => void;
  /** Mobile: plataformas y amigos van sobre el pie del poster. */
  posterFooter?: boolean;
};

export function describeLength(item: DiscoveryItem) {
  if (item.mediaType === "movie") {
    if (!item.runtimeMinutes) {
      return null;
    }

    const hours = Math.floor(item.runtimeMinutes / 60);
    const minutes = item.runtimeMinutes % 60;
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  if (item.seriesType === "Miniseries" && item.episodeCount) {
    return `${item.episodeCount} ${item.episodeCount === 1 ? "episodio" : "episodios"}`;
  }

  return item.seasonCount
    ? `${item.seasonCount} ${item.seasonCount === 1 ? "temporada" : "temporadas"}`
    : null;
}

export function describeType(item: DiscoveryItem) {
  if (item.mediaType === "movie") {
    return "Película";
  }

  return item.seriesType === "Miniseries" ? "Miniserie" : "Serie";
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const THUMB_PATH =
  "M7 10v10M7 10l3.5-6a2.5 2.5 0 0 1 2.4 3.2L12 10h6a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7";

const RATING_OPTIONS: Array<{ id: RatedReaction; label: string }> = [
  { id: "superliked", label: "Me encantó" },
  { id: "liked", label: "Me gustó" },
  { id: "disliked", label: "No me gustó" }
];

function Thumbs({ reaction }: { reaction: RatedReaction }) {
  const count = reaction === "superliked" ? 2 : 1;

  return (
    <span
      className={`title-card__thumbs ${reaction === "disliked" ? "title-card__thumbs--down" : ""}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <svg key={index} viewBox="0 0 24 24" aria-hidden="true">
          <path d={THUMB_PATH} />
        </svg>
      ))}
    </span>
  );
}

export function TitleCard({
  item,
  reaction,
  onOpenDetails,
  onChangeRating,
  onRemove,
  removeLabel = "Quitar",
  isRemoving = false,
  scoreSource,
  showLength = false,
  friends = [],
  quickActions = [],
  isHighlighted = false,
  preferredProviderIds,
  onOpenActions,
  posterFooter = false
}: TitleCardProps) {
  const [menuState, setMenuState] = useState<"closed" | "menu" | "confirm">("closed");
  const cardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (menuState === "closed") {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setMenuState("closed");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuState("closed");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuState]);

  // "Elegí por mí" puede caer en una tarjeta que esta fuera de pantalla.
  useEffect(() => {
    if (isHighlighted) {
      cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [isHighlighted]);

  const ratedReaction = reaction && isRatedReaction(reaction) ? reaction : null;
  const canRate = Boolean(onChangeRating && ratedReaction);
  const canRemove = Boolean(onRemove);
  const currentLabel = ratedReaction
    ? RATING_OPTIONS.find((option) => option.id === ratedReaction)?.label
    : null;
  const length = showLength ? describeLength(item) : null;
  const shownFriends = friends.slice(0, 3);

  function pickRating(next: RatedReaction) {
    setMenuState("closed");
    if (next !== ratedReaction) {
      onChangeRating?.(next);
    }
  }

  function confirmRemove() {
    setMenuState("closed");
    onRemove?.();
  }

  return (
    <article
      ref={cardRef}
      className={`title-card ${menuState !== "closed" ? "is-menu-open" : ""} ${
        quickActions.length ? "has-quick-actions" : ""
      } ${isHighlighted ? "is-highlighted" : ""}`}
    >
      <div className="title-card__poster-wrap">
        <img
          src={item.posterUrl}
          alt={item.title}
          className="title-card__poster"
          onClick={onOpenDetails}
        />

        {item.score > 0 ? (
          <span
            className="title-card__score"
            title={scoreSource === "TMDB" ? "Puntaje de TMDB (The Movie Database)" : undefined}
          >
            {scoreSource ? (
              <span className="title-card__score-source">{scoreSource}</span>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7-5.4-4.7 7.1-.6z" />
              </svg>
            )}
            {item.score.toFixed(1)}
          </span>
        ) : null}

        {posterFooter ? (
          <div className="title-card__poster-footer">
            <WatchNowRow item={item} preferredProviderIds={preferredProviderIds} limit={2} />
            {shownFriends.length ? (
              <span
                className="title-card__friends-avatars"
                title={`También en la Watchlist de ${friends.map((friend) => friend.displayName).join(", ")}`}
              >
                {shownFriends.map((friend) =>
                  friend.avatarUrl ? (
                    <img key={friend.id} src={friend.avatarUrl} alt="" loading="lazy" />
                  ) : (
                    <span key={friend.id}>{initialsOf(friend.displayName)}</span>
                  )
                )}
              </span>
            ) : null}
          </div>
        ) : null}

        {quickActions.length ? (
          <div className="title-card__quick">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`title-card__quick-button ${
                  action.tone === "primary" ? "title-card__quick-button--primary" : ""
                }`}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <strong className="title-card__title media-linklike" onClick={onOpenDetails}>
        {item.title}
      </strong>
      <span className="title-card__meta">
        {describeType(item)} • {item.year}
        {length ? ` • ${length}` : ""}
      </span>

      {canRate || canRemove || onOpenActions ? (
        <button
          type="button"
          className={`title-card__reaction ${ratedReaction === "disliked" ? "is-muted" : ""}`}
          onClick={() =>
            onOpenActions
              ? onOpenActions()
              : setMenuState((current) => (current === "closed" ? "menu" : "closed"))
          }
          aria-haspopup={onOpenActions ? "dialog" : "menu"}
          aria-expanded={menuState !== "closed"}
          aria-label={currentLabel ? `Tu puntuación: ${currentLabel}` : `Opciones de ${item.title}`}
        >
          {ratedReaction ? (
            <Thumbs reaction={ratedReaction} />
          ) : (
            <svg className="title-card__reaction-dots" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          )}
          <svg className="title-card__reaction-caret" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ) : null}

      {posterFooter ? null : <WatchNowRow item={item} preferredProviderIds={preferredProviderIds} />}

      {shownFriends.length && !posterFooter ? (
        <p
          className="title-card__friends"
          title={`También en la Watchlist de ${friends.map((friend) => friend.displayName).join(", ")}`}
        >
          <span className="title-card__friends-avatars" aria-hidden="true">
            {shownFriends.map((friend) =>
              friend.avatarUrl ? (
                <img key={friend.id} src={friend.avatarUrl} alt="" loading="lazy" />
              ) : (
                <span key={friend.id}>{initialsOf(friend.displayName)}</span>
              )
            )}
          </span>
          {friends.length === 1
            ? `${friends[0].displayName.split(" ")[0]} también la quiere ver`
            : `${friends.length} amigos también la quieren ver`}
        </p>
      ) : null}

      {menuState === "menu" ? (
        <div className="title-card__menu" role="menu">
          {canRate ? (
            <>
              <p className="title-card__menu-label">Tu puntuación</p>
              {RATING_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.id === ratedReaction}
                  className={`title-card__menu-option ${option.id === ratedReaction ? "is-current" : ""}`}
                  onClick={() => pickRating(option.id)}
                >
                  <Thumbs reaction={option.id} />
                  {option.label}
                  <svg className="title-card__menu-check" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </button>
              ))}
            </>
          ) : null}

          {canRate && canRemove ? <div className="title-card__menu-separator" /> : null}

          {canRemove ? (
            <button
              type="button"
              role="menuitem"
              className="title-card__menu-option title-card__menu-option--danger"
              onClick={() => setMenuState("confirm")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6 18 18" />
                <path d="M18 6 6 18" />
              </svg>
              {removeLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {menuState === "confirm" ? (
        <div className="title-card__menu" role="dialog" aria-modal="false">
          <p className="title-card__confirm-title">¿{removeLabel}?</p>
          <p className="title-card__confirm-body">
            {ratedReaction
              ? "Se va a desmarcar como vista y vas a perder la puntuación que le pusiste."
              : "Se va a sacar de tu lista."}
          </p>
          <div className="title-card__confirm-actions">
            <button
              type="button"
              className="title-card__confirm-button"
              onClick={() => setMenuState("menu")}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="title-card__confirm-button title-card__confirm-button--danger"
              disabled={isRemoving}
              onClick={confirmRemove}
            >
              Sí, quitar
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
