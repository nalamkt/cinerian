import { CinerianLogo } from "./CinerianLogo";
import { UserProfilePage } from "./UserProfilePage";

export function SharedUserPage({ username }: { username: string }) {
  return (
    <div className="shared-media-page">
      <div className="shared-media-page__shell">
        <header className="shared-media-page__header">
          <a href="/" className="shared-media-page__brand" aria-label="Abrir Cinerian">
            <CinerianLogo className="shared-media-page__logo" />
          </a>
          <div className="shared-media-page__copy">
            <p className="section-eyebrow">Perfil compartido desde Cinerian</p>
            <h1>Perfil publico cineriano</h1>
            <p>
              Este perfil vive afuera del login para que puedas compartir actividad, gustos y
              recomendaciones con cualquiera.
            </p>
          </div>
        </header>

        <UserProfilePage currentUserId="" username={username} onBack={() => window.history.back()} />
      </div>
    </div>
  );
}
