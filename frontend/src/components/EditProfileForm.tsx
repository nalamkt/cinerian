import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  GENDER_OPTIONS,
  signOut,
  type Gender,
  type Profile,
  type ProfileVisibilitySettings,
  updateProfile
} from "../lib/auth";
import { commitAvatarChange, drawAvatarCrop, exportAvatarCrop, removeOwnedAvatar, uploadAvatar, validateAvatarFile } from "../lib/avatarUpload";
import { NotificationPreferences } from "./NotificationPreferences";

type EditProfileFormProps = {
  profile: Profile;
  onCancel: () => void;
  onSaved: (profile: Profile, message: string) => void;
  focusNotifications?: boolean;
  initialAvatarFile?: File | null;
};

type FormState = {
  displayName: string;
  username: string;
  bio: string;
  avatarUrl: string;
  gender: Gender | null;
  birthDate: string;
  visibilitySettings: ProfileVisibilitySettings;
};

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export function EditProfileForm({ profile, onCancel, onSaved, focusNotifications = false, initialAvatarFile = null }: EditProfileFormProps) {
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const selectionRef = useRef(0);
  const [form, setForm] = useState<FormState>({
    displayName: profile.display_name,
    username: profile.username,
    bio: profile.bio ?? "",
    avatarUrl: profile.avatar_url ?? "",
    gender: profile.gender,
    birthDate: profile.birth_date ?? "",
    visibilitySettings: profile.visibility_settings
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarImage, setAvatarImage] = useState<HTMLImageElement | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);

  useEffect(() => () => {
    selectionRef.current += 1;
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
  }, []);

  useEffect(() => {
    if (avatarImage && cropCanvasRef.current) {
      drawAvatarCrop(cropCanvasRef.current, avatarImage, zoom, cropX, cropY);
    }
    if (avatarImage && avatarCanvasRef.current) {
      drawAvatarCrop(avatarCanvasRef.current, avatarImage, zoom, cropX, cropY);
    }
  }, [avatarImage, zoom, cropX, cropY]);

  useEffect(() => {
    if (initialAvatarFile) void prepareAvatar(initialAvatarFile);
  }, [initialAvatarFile]);

  async function prepareAvatar(file: File) {
    const selection = ++selectionRef.current;
    setIsPreparing(true);
    setError(null);
    let objectUrl: string | null = null;
    try {
      await validateAvatarFile(file);
      objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      if (selection !== selectionRef.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) {
        throw new Error("La imagen tiene dimensiones no compatibles.");
      }
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = objectUrl;
      setAvatarImage(image);
      setAvatarRemoved(false);
      setZoom(1);
      setCropX(0);
      setCropY(0);
    } catch (cause) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (selection === selectionRef.current) setError(cause instanceof Error ? cause.message : "No pude abrir esa imagen.");
    } finally {
      if (selection === selectionRef.current) setIsPreparing(false);
    }
  }

  useEffect(() => {
    if (!focusNotifications) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      notificationsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      notificationsRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusNotifications]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const displayName = form.displayName.trim();
    const username = normalizeUsername(form.username);
    const bio = form.bio.trim();

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
      const change = avatarImage
        ? { kind: "replace" as const, blob: await exportAvatarCrop(avatarImage, zoom, cropX, cropY) }
        : avatarRemoved ? { kind: "remove" as const } : { kind: "keep" as const };
      const result = await commitAvatarChange(profile.avatar_url ?? "", change, {
        upload: (blob) => uploadAvatar(profile.id, blob),
        remove: (url) => removeOwnedAvatar(profile.id, url),
        update: (avatarUrl) => updateProfile({
        userId: profile.id,
        displayName,
        username,
        bio,
        avatarUrl,
        bannerUrl: profile.banner_url ?? "",
        gender: form.gender,
        birthDate: form.birthDate,
        favoriteTitles: profile.favorite_titles,
        featuredCollections: profile.featured_collections,
        currentWatching: profile.current_watching,
        visibilitySettings: form.visibilitySettings
        })
      });
      let message = change.kind === "remove" ? "Foto eliminada." : change.kind === "replace" ? "Foto actualizada." : "Perfil actualizado.";
      if (result.cleanupFailed) message += " No pude retirar el archivo anterior; volvé a intentarlo más tarde.";
      onSaved(result.value, message);
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
              {avatarImage ? (
                <canvas ref={avatarCanvasRef} width={96} height={96} role="img" aria-label="Vista previa circular de la foto" />
              ) : !avatarRemoved && form.avatarUrl.trim() ? (
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

          <div className="profile-editor__photo profile-editor__field--full">
            <span className="profile-editor__photo-title">Foto de perfil</span>
            <input
              ref={fileInputRef}
              className="profile-editor__file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Elegir foto de perfil"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void prepareAvatar(file);
                event.currentTarget.value = "";
              }}
            />
            <div className="profile-editor__photo-actions">
              <button type="button" className="profile-share-button" disabled={isSaving || isPreparing} onClick={() => fileInputRef.current?.click()}>
                {isPreparing ? "Preparando..." : "Cambiar foto"}
              </button>
              {(form.avatarUrl || avatarImage) && !avatarRemoved ? (
                <button type="button" className="profile-share-button" disabled={isSaving} onClick={() => { setAvatarImage(null); setAvatarRemoved(true); setError(null); }}>
                  Eliminar foto
                </button>
              ) : null}
            </div>
            {avatarImage ? (
              <div className="profile-editor__crop">
                <canvas ref={cropCanvasRef} width={240} height={240} role="img" aria-label="Vista previa del recorte cuadrado" />
                <div className="profile-editor__crop-controls">
                  <label>Zoom <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
                  <label>Horizontal <input type="range" min="-1" max="1" step="0.05" value={cropX} onChange={(event) => setCropX(Number(event.target.value))} /></label>
                  <label>Vertical <input type="range" min="-1" max="1" step="0.05" value={cropY} onChange={(event) => setCropY(Number(event.target.value))} /></label>
                </div>
              </div>
            ) : null}
            <small>JPEG, PNG o WebP, hasta 8 MB. La foto se recorta y optimiza antes de subirla.</small>
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
            <strong>Qué mostrar en tu perfil</strong>
          </div>
          <p>Elegí qué partes querés mostrar en tu perfil compartido.</p>
        </div>

        <div className="profile-editor__visibility">
          <label className="profile-editor__toggle">
            <span>Mostrar Watchlist</span>
            <input
              type="checkbox"
              checked={form.visibilitySettings.showWatchlist}
              onChange={(event) => updateVisibility("showWatchlist", event.target.checked)}
            />
          </label>

          <label className="profile-editor__toggle">
            <span>Mostrar Vistas</span>
            <input
              type="checkbox"
              checked={form.visibilitySettings.showWatched}
              onChange={(event) => updateVisibility("showWatched", event.target.checked)}
            />
          </label>

        </div>
      </div>

      <div className="profile-editor__section" ref={notificationsRef} tabIndex={-1}>
        <div className="profile-editor__section-copy">
          <div className="profile-editor__section-title">
            <span className="profile-editor__section-number">4</span>
            <strong>Mantenernos en contacto</strong>
          </div>
          <p>Elegí si querés enterarte cuando haya actividad relevante en Cinerian.</p>
        </div>

        <NotificationPreferences userId={profile.id} />
      </div>

      {error ? <div className="inline-status" role="alert">{error}</div> : null}

      <div className="profile-editor__actions">
        <button type="button" className="profile-share-button" onClick={onCancel} disabled={isSaving}>
          Cancelar
        </button>
        <button type="submit" className="profile-follow-button" disabled={isSaving || isPreparing}>
          {isSaving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {/* En mobile el dock no muestra "Salir", asi que esta es la unica salida. */}
      <div className="profile-editor__signout">
        <button type="button" onClick={() => void signOut()} disabled={isSaving}>
          Cerrar sesión
        </button>
      </div>
    </form>
  );
}
