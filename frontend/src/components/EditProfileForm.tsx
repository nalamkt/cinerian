import { useEffect, useState, type FormEvent } from "react";
import { type Profile, type ProfileVisibilitySettings, updateProfile } from "../lib/auth";
import {
  defaultEditorialPreferences,
  fetchUserEditorialPreferences,
  saveUserEditorialPreferences
} from "../lib/editorial";
import type { EditorialPreferences } from "../types";
import { EditorialPreferencesPicker } from "./EditorialPreferencesPicker";

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
    favoriteGenres: profile.favorite_genres ?? [],
    visibilitySettings: profile.visibility_settings
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorialPreferences, setEditorialPreferences] = useState<EditorialPreferences>(
    defaultEditorialPreferences()
  );
  const [isLoadingEditorial, setIsLoadingEditorial] = useState(true);

  useEffect(() => {
    void fetchUserEditorialPreferences(profile.id)
      .then((preferences) => {
        setEditorialPreferences(preferences ?? defaultEditorialPreferences());
      })
      .catch(() => {
        setEditorialPreferences(defaultEditorialPreferences());
      })
      .finally(() => {
        setIsLoadingEditorial(false);
      });
  }, [profile.id]);

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

  function updatePeopleVisibility(value: boolean) {
    setForm((current) => ({
      ...current,
      visibilitySettings: {
        ...current.visibilitySettings,
        showFollowers: value,
        showFollowing: value
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
        favoriteGenres: form.favoriteGenres,
        favoriteTitles: profile.favorite_titles,
        featuredCollections: profile.featured_collections,
        currentWatching: profile.current_watching,
        visibilitySettings: form.visibilitySettings
      });
      await saveUserEditorialPreferences({
        userId: profile.id,
        preferences: {
          ...editorialPreferences,
          completedOnboarding: true
        }
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

      <div className="profile-editor__grid">
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

        <div className="profile-editor__preview-card">
          <span className="profile-editor__preview-label">Preview avatar</span>
          <div className="profile-editor__avatar-preview">
            {form.avatarUrl.trim() ? (
              <img src={form.avatarUrl} alt="Preview avatar" className="profile-avatar__image" />
            ) : (
              <span>{form.displayName.trim().slice(0, 1).toUpperCase() || "C"}</span>
            )}
          </div>
        </div>

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

      <div className="profile-editor__section">
        <div className="profile-editor__section-copy">
          <strong>Visibilidad del perfil</strong>
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
            <span>Mostrar red del perfil</span>
            <input
              type="checkbox"
              checked={
                form.visibilitySettings.showFollowers || form.visibilitySettings.showFollowing
              }
              onChange={(event) => updatePeopleVisibility(event.target.checked)}
            />
          </label>

          {[
            ["showCollections", "Mostrar colecciones"],
            ["showBadges", "Mostrar badges"],
            ["showActivity", "Mostrar extras del perfil"],
            ["showInsights", "Mostrar insights"]
          ].map(([key, label]) => {
            const visibilityKey = key as keyof ProfileVisibilitySettings;

            return (
              <label key={key} className="profile-editor__toggle">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={form.visibilitySettings[visibilityKey]}
                  onChange={(event) => updateVisibility(visibilityKey, event.target.checked)}
                />
              </label>
            );
          })}
        </div>
      </div>

      <div className="profile-editor__section">
        <div className="profile-editor__section-copy">
          <strong>Generos favoritos</strong>
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
        {isLoadingEditorial ? (
          <div className="inline-status">Cargando tu radar editorial...</div>
        ) : (
          <EditorialPreferencesPicker
            preferences={editorialPreferences}
            onChange={setEditorialPreferences}
            compact
          />
        )}
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
