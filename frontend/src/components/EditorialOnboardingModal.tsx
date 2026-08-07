import { useState } from "react";
import { defaultEditorialPreferences, saveUserEditorialPreferences } from "../lib/editorial";
import type { EditorialPreferences } from "../types";
import { EditorialPreferencesPicker } from "./EditorialPreferencesPicker";

type EditorialOnboardingModalProps = {
  userId: string;
  onComplete: (preferences: EditorialPreferences) => void;
};

export function EditorialOnboardingModal({
  userId,
  onComplete
}: EditorialOnboardingModalProps) {
  const [preferences, setPreferences] = useState<EditorialPreferences>(defaultEditorialPreferences());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persistPreferences(nextPreferences: EditorialPreferences) {
    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        ...nextPreferences,
        completedOnboarding: true
      };

      await saveUserEditorialPreferences({
        userId,
        preferences: payload
      });

      onComplete(payload);
    } catch {
      setError("No pude guardar tu radar editorial.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="review-modal__backdrop" role="presentation">
      <div className="editorial-onboarding" role="dialog" aria-modal="true">
        <div className="editorial-onboarding__hero">
          <p className="section-eyebrow">Radar editorial</p>
          <h2>Elegi que mundo del cine queres seguir</h2>
          <p>
            Vamos a mezclar noticias, estrenos y movimientos de industria con tu home social de
            Cinerian para que no veas lo mismo que todo el mundo.
          </p>
        </div>

        <EditorialPreferencesPicker preferences={preferences} onChange={setPreferences} />

        {error ? <div className="inline-status">{error}</div> : null}

        <div className="editorial-onboarding__actions">
          <button
            type="button"
            className="profile-share-button"
            disabled={isSaving}
            onClick={() => void persistPreferences(defaultEditorialPreferences())}
          >
            {isSaving ? "Guardando..." : "Usar una selección sugerida"}
          </button>
          <button
            type="button"
            className="profile-follow-button"
            disabled={isSaving || !preferences.selectedTopics.length}
            onClick={() => void persistPreferences(preferences)}
          >
            {isSaving ? "Guardando..." : "Activar mi radar"}
          </button>
        </div>
      </div>
    </div>
  );
}
