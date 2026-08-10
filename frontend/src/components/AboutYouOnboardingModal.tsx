import { useState } from "react";
import { GENDER_OPTIONS, type Gender, type Profile, updateProfile } from "../lib/auth";

type AboutYouOnboardingModalProps = {
  profile: Profile;
  onComplete: (profile: Profile) => void;
};

export function AboutYouOnboardingModal({ profile, onComplete }: AboutYouOnboardingModalProps) {
  const [gender, setGender] = useState<Gender | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(nextGender: Gender, nextBirthDate: string) {
    setIsSaving(true);
    setError(null);

    try {
      const nextProfile = await updateProfile({
        userId: profile.id,
        displayName: profile.display_name,
        username: profile.username,
        bio: profile.bio ?? "",
        avatarUrl: profile.avatar_url ?? "",
        bannerUrl: profile.banner_url ?? "",
        gender: nextGender,
        birthDate: nextBirthDate,
        favoriteGenres: profile.favorite_genres,
        favoriteTitles: profile.favorite_titles,
        featuredCollections: profile.featured_collections,
        currentWatching: profile.current_watching,
        visibilitySettings: profile.visibility_settings
      });

      if (nextProfile.gender === null) {
        setError(
          "No se guardó — parece que a la base de datos le falta una actualización reciente. Avisale a quien administra Cinerian."
        );
        return;
      }

      onComplete(nextProfile);
    } catch {
      setError("No pude guardar esto por ahora.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="review-modal__backdrop" role="presentation">
      <div className="editorial-onboarding" role="dialog" aria-modal="true">
        <div className="editorial-onboarding__hero">
          <p className="section-eyebrow">🔒 Privado</p>
          <h2>Contanos un poco sobre vos</h2>
          <p>
            Esto no se muestra en tu perfil público — nos ayuda a entender mejor a la comunidad de
            Cinerian. Podés cambiarlo cuando quieras desde "Editar perfil".
          </p>
        </div>

        <div className="profile-editor__field">
          <span>Género</span>
          <div className="profile-editor__segmented">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`profile-editor__segmented-option ${gender === option.id ? "is-active" : ""}`}
                onClick={() => setGender(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="profile-editor__field">
          <span>Fecha de nacimiento</span>
          <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
        </label>

        {error ? <div className="inline-status">{error}</div> : null}

        <div className="editorial-onboarding__actions">
          <button
            type="button"
            className="profile-share-button"
            disabled={isSaving}
            onClick={() => void persist("no_dice", "")}
          >
            {isSaving ? "Guardando..." : "Prefiero no decir"}
          </button>
          <button
            type="button"
            className="profile-follow-button"
            disabled={isSaving || !gender}
            onClick={() => gender && void persist(gender, birthDate)}
          >
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
