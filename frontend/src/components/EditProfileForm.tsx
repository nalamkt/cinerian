import { useState, type FormEvent } from "react";
import {
  GENDER_OPTIONS,
  type Gender,
  type Profile,
  type ProfileVisibilitySettings,
  updateProfile
} from "../lib/auth";

type EditProfileFormProps = {
  profile: Profile;
  onCancel: () => void;
  onSaved: (profile: Profile) => void;
};

type FormState = {
  displayName: string;
  username: string;
  bio: string;
  avatarUrl: string;
  gender: Gender | null;
  birthDate: string;
  favoriteGenres: string[];
  visibilitySettings: ProfileVisibilitySettings;
};

const GENRE_OPTIONS = [
  "Accion",
  "Animacion",
  "Aventura",
  "Belica",
  "Comedia",
  "Crimen",
  "Documental",
  "Drama",
  "Fantasia",
  "Historia",
  "Misterio",
  "Musica",
  "Romance",
  "Sci-fi",
  "Suspenso",
  "Terror",
  "Thriller",
  "Western"
];

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export function EditProfileForm({ profile, onCancel, onSaved }: EditProfileFormProps) {
  const [form, setForm] = useState<FormState>({
    displayName: profile.display_name,
    username: profile.username,
    bio: profile.bio ?? "",
    avatarUrl: profile.avatar_url ?? "",
    gender: profile.gender,
    birthDate: profile.birth_date ?? "",
    favoriteGenres: profile.favorite_genres ?? [],
    visibilitySettings: profile.visibility_settings
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateVisibility<Key extends keyof ProfileVisibilitySettings>(
    key: Key,
    value: ProfileVisibilitySettings[Key]
  ) {
    setForm((current) => ({
      ...current,
      visibilitySettings: {
        ...current.visibilitySettings,
        [key]: value
      }
    }));
  }

  function updateInsightsVisibility(value: boolean) {
    setForm((current) => ({
      ...current,
      visibilitySettings: {
        ...current.visibilitySettings,
        showActivity: value,
        showInsights: value
      }
    }));
  }

  function toggleGenre(genre: string) {
    setForm((current) => ({
      ...current,
      favoriteGenres: current.favoriteGenres.includes(genre)
        ? current.favoriteGenres.filter((entry) => entry !== genre)
        : [...current.favoriteGenres, genre].slice(0, 6)
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const displayName = form.displayName.trim();
    const username = normalizeUsername(form.username);
    const bio = form.bio.trim();
    const avatarUrl = form.avatarUrl.trim();

    if (displayName.length < 2) {
      setError("El nombre visible tiene que tener al menos 2 caracteres.");
      return;
    }

    if (username.length < 3) {
      setError("El username tiene que tener al menos 3 caracteres validos.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const nextProfile = await updateProfile({
        userId: profile.id,
        displayName,
        username,
        bio,
        avatarUrl,
        bannerUrl: profile.banner_url ?? "",
        gender: form.gender,
        birthDate: form.birthDate,
        favoriteGenres: form.favoriteGenres,
        favoriteTitles: profile.favorite_titles,
        featuredCollections: profile.featured_collections,
        currentWatching: profile.current_watching,
        visibilitySettings: form.visibilitySettings
      });

      onSaved(nextProfile);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "No pude guardar los cambios del perfil.";
      setError(
        message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique")
          ? "Ese username ya esta en uso. Probemos con otro."
          : message
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="profile-editor" onSubmit={handleSubmit}>
      <div className="profile-editor__header">
        <div>
          <p className="section-eyebrow">Editar perfil</p>
          <h3>Hagamos que tu perfil se sienta mas tuyo</h3>
        </div>
      </div>

      <div className="profile-editor__section">
        <div className="profile-editor__section-copy">
          <div className="profile-editor__section-title">
            <span className="profile-editor__section-number">1</span>
            <strong>Identidad pública</strong>
          </div>
          <p>Lo que cualquiera ve en tu perfil.</p>
        </div>

        <div className="profile-editor__grid">
          <div className="profile-editor__identity-row">
            <div className="profile-editor__avatar-preview">
              {form.avatarUrl.trim() ? (
                <img src={form.avatarUrl} alt="Preview avatar" className="profile-avatar__image" />
              ) : (
                <span>{form.displayName.trim().slice(0, 1).toUpperCase() || "C"}</span>
              )}
            </div>

            <label className="profile-editor__field">
              <span>Nombre visible</span>
              <input
                type="text"
                value={form.displayName}
                onChange={(event) => updateField("displayName", event.target.value)}
                maxLength={40}
                placeholder="Como queres aparecer en Cinerian"
              />
            </label>

            <label className="profile-editor__field">
              <span>Username</span>
              <input
                type="text"
                value={form.username}
                onChange={(event) => updateField("username", event.target.value)}
                maxLength={24}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="tu_handle"
              />
              <small>Solo letras, numeros y guiones bajos.</small>
            </label>
          </div>

          <label className="profile-editor__field profile-editor__field--full">
            <span>Avatar</span>
            <input
              type="url"
              value={form.avatarUrl}
              onChange={(event) => updateField("avatarUrl", event.target.value)}
              placeholder="https://..."
            />
            <small>Por ahora usamos una URL de imagen para que ya puedas personalizarlo.</small>
          </label>

          <label className="profile-editor__field profile-editor__field--full">
            <span>Bio</span>
            <textarea
              value={form.bio}
              onChange={(event) => updateField("bio", event.target.value)}
              rows={4}
              maxLength={240}
              placeholder="Conta que miras, que recomendas o cual es tu obsesion audiovisual."
            />
          </label>
        </div>
      </div>

      <div className="profile-editor__section">
        <div className="profile-editor__section-copy">
          <div className="profile-editor__section-title-row">
            <div className="profile-editor__section-title">
              <span className="profile-editor__section-number">2</span>
              <strong>Sobre vos</strong>
            </div>
            <span className="profile-editor__private-badge">🔒 Privado</span>
          </div>
          <p>Nunca se muestra en tu perfil público — nos ayuda a entender mejor a la comunidad de Cinerian.</p>
        </div>

        <div className="profile-editor__field">
          <span>Género</span>
          <div className="profile-editor__segmented">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`profile-editor__segmented-option ${form.gender === option.id ? "is-active" : ""}`}
                onClick={() => updateField("gender", option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="profile-editor__field">
          <span>Fecha de nacimiento</span>
          <input
            type="date"
            value={form.birthDate}
            onChange={(event) => updateField("birthDate", event.target.value)}
          />
        </label>
      </div>

      <div className="profile-editor__section">
        <div className="profile-editor__section-copy">
          <div className="profile-editor__section-title">
            <span className="profile-editor__section-number">3</span>
            <strong>Gustos</strong>
          </div>
          <p>Elegí hasta 6 para que el perfil cuente rapido tus gustos.</p>
        </div>

        <div className="profile-editor__chips">
          {GENRE_OPTIONS.map((genre) => {
            const isActive = form.favoriteGenres.includes(genre);

            return (
              <button
                key={genre}
                type="button"
                className={`profile-editor__chip ${isActive ? "is-active" : ""}`}
                onClick={() => toggleGenre(genre)}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>

      <div className="profile-editor__section">
        <div className="profile-editor__section-copy">
          <div className="profile-editor__section-title">
            <span className="profile-editor__section-number">4</span>
            <strong>Qué mostrar en tu perfil</strong>
          </div>
          <p>Elegí qué partes querés mostrar en tu perfil compartido.</p>
        </div>

        <div className="profile-editor__visibility">
          <label className="profile-editor__toggle">
            <span>Mostrar watchlist y vistas</span>
            <input
              type="checkbox"
              checked={form.visibilitySettings.showWatchlist}
              onChange={(event) => updateVisibility("showWatchlist", event.target.checked)}
            />
          </label>

          <label className="profile-editor__toggle">
            <span>Mostrar badges</span>
            <input
              type="checkbox"
              checked={form.visibilitySettings.showBadges}
              onChange={(event) => updateVisibility("showBadges", event.target.checked)}
            />
          </label>

          <label className="profile-editor__toggle">
            <span>Mostrar pestaña de Insights</span>
            <input
              type="checkbox"
              checked={form.visibilitySettings.showActivity}
              onChange={(event) => updateInsightsVisibility(event.target.checked)}
            />
          </label>
        </div>
      </div>

      {error ? <div className="inline-status">{error}</div> : null}

      <div className="profile-editor__actions">
        <button type="button" className="profile-share-button" onClick={onCancel} disabled={isSaving}>
          Cancelar
        </button>
        <button type="submit" className="profile-follow-button" disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
