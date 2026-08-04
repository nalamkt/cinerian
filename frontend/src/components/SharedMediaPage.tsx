import { CinerianLogo } from "./CinerianLogo";
import { MediaDetailsProvider, SharedMediaLanding } from "./MediaDetailsModal";
import type { MediaType } from "../types";

export function SharedMediaPage({
  mediaType,
  id
}: {
  mediaType: MediaType;
  id: number;
}) {
  return (
    <div className="shared-media-page">
      <div className="shared-media-page__shell">
        <header className="shared-media-page__header">
          <a href="/" className="shared-media-page__brand" aria-label="Abrir Cinerian">
            <CinerianLogo className="shared-media-page__logo" />
          </a>
          <div className="shared-media-page__copy">
            <p className="section-eyebrow">Compartido desde Cinerian</p>
            <h1>Ficha publica para compartir</h1>
            <p>
              Este detalle vive afuera del login para que puedas mandarlo por WhatsApp, redes o donde
              quieras.
            </p>
          </div>
        </header>

        <MediaDetailsProvider>
          <SharedMediaLanding item={{ id, mediaType, title: "Titulo compartido" }} />
        </MediaDetailsProvider>
      </div>
    </div>
  );
}
