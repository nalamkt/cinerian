import { useEffect, useMemo, useState } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import { fetchFollowingUserIds } from "../lib/follows";
import { sendRecommendationMessage } from "../lib/inbox";
import { shareMediaLink } from "../lib/share";
import type { DiscoveryItem } from "../types";

type SendRecommendationModalProps = {
  userId: string;
  item: DiscoveryItem | null;
  onClose: () => void;
  onSent?: (recipient: Profile) => void;
};

export function SendRecommendationModal({
  userId,
  item,
  onClose,
  onSent
}: SendRecommendationModalProps) {
  const [note, setNote] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingTo, setIsSendingTo] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [shareLabel, setShareLabel] = useState("Compartir link");

  useEffect(() => {
    if (!item) {
      return;
    }

    let isMounted = true;

    async function loadRecipients() {
      try {
        setIsLoading(true);
        setStatus(null);
        const [followingIds, allProfiles] = await Promise.all([
          fetchFollowingUserIds(userId),
          listProfiles()
        ]);

        if (!isMounted) {
          return;
        }

        setProfiles(allProfiles.filter((profile) => followingIds.includes(profile.id)));
      } catch {
        if (isMounted) {
          setProfiles([]);
          setStatus("No pude cargar a quienes seguis.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRecipients();

    return () => {
      isMounted = false;
    };
  }, [item, userId]);

  const recipientCountLabel = useMemo(() => {
    if (!profiles.length) {
      return "Nadie por ahora";
    }

    return `${profiles.length} ${profiles.length === 1 ? "cineriano" : "cinerianos"}`;
  }, [profiles.length]);

  async function handleSend(profile: Profile) {
    if (!item) {
      return;
    }

    try {
      setIsSendingTo(profile.id);
      setStatus(null);
      await sendRecommendationMessage({
        senderId: userId,
        recipientId: profile.id,
        item,
        note
      });
      onSent?.(profile);
      onClose();
    } catch {
      setStatus("No pude mandar esta recomendacion.");
    } finally {
      setIsSendingTo(null);
    }
  }

  async function handleShareLink() {
    if (!item) {
      return;
    }

    const result = await shareMediaLink(item);
    setShareLabel(result === "shared" ? "Compartido" : "Link copiado");
    window.setTimeout(() => setShareLabel("Compartir link"), 1800);
  }

  if (!item) {
    return null;
  }

  return (
    <div className="review-modal__backdrop" role="presentation" onClick={onClose}>
      <div className="send-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="send-modal__header">
          <div>
            <p className="section-eyebrow">Enviar recomendacion</p>
            <h3>{item.title}</h3>
            <p className="send-modal__meta">{recipientCountLabel} en tu circulo</p>
          </div>
          <button type="button" className="review-modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <label className="send-modal__field">
          <span>Mensaje opcional</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Por que se la queres mandar?"
          />
        </label>

        <div className="send-modal__actions">
          <button type="button" className="ghost-button" onClick={() => void handleShareLink()}>
            {shareLabel}
          </button>
        </div>

        <div className="send-modal__list">
          {isLoading ? (
            <div className="empty-like-state">Buscando a quienes seguis...</div>
          ) : profiles.length ? (
            profiles.map((profile) => (
              <article className="send-modal__user" key={profile.id}>
                <div className="send-modal__avatar" aria-hidden="true">
                  {profile.display_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="send-modal__copy">
                  <strong>{profile.display_name}</strong>
                  <span>@{profile.username}</span>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  disabled={Boolean(isSendingTo)}
                  onClick={() => void handleSend(profile)}
                >
                  {isSendingTo === profile.id ? "Enviando..." : "Enviar"}
                </button>
              </article>
            ))
          ) : (
            <div className="empty-like-state">
              Segui a otros cinerianos para empezar a mandar recomendaciones por adentro de la app.
            </div>
          )}
        </div>

        {status ? <div className="inline-status">{status}</div> : null}
      </div>
    </div>
  );
}
