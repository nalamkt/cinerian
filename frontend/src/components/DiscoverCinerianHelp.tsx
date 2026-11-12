import { useRef } from "react";

type DiscoverCinerianHelpProps = {
  onFindPeople?: () => void;
  onOpenWatching: () => void;
  onOpenNotifications: () => void;
};

function installGuidance() {
  const userAgent = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(userAgent);
  const isMac = /Macintosh|Mac OS X/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|Chrome|Edg|FxiOS/.test(userAgent);
  const isChromeAndroid = isAndroid && /Chrome/.test(userAgent) && !/Edg|OPR|SamsungBrowser/.test(userAgent);
  const isInstalled = window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isInstalled) {
    return "Ya estás usando Cinerian como aplicación en este dispositivo.";
  }
  if (isAppleMobile) {
    return `${isSafari ? "En Safari" : "Abrí Cinerian en Safari"}, tocá Compartir y elegí “Agregar a pantalla de inicio”. Después, abrila desde el nuevo icono.`;
  }
  if (isAndroid) {
    return `${isChromeAndroid ? "En Chrome" : "Abrí Cinerian en Chrome"}, abrí el menú ⋮ y elegí “Instalar app” o “Agregar a pantalla principal”, si aparece esa opción.`;
  }
  if (isMac && isSafari) {
    return "En Safari, abrí Compartir y elegí “Agregar al Dock”, si está disponible en tu versión de macOS.";
  }
  return "Abrí el menú de tu navegador y buscá “Instalar Cinerian” o “Instalar aplicación”, si está disponible.";
}

export function DiscoverCinerianHelp({ onFindPeople, onOpenWatching, onOpenNotifications }: DiscoverCinerianHelpProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  return (
    <details className="profile-discover" ref={detailsRef}>
      <summary>
        <span className="profile-discover__mark" aria-hidden="true">?</span>
        <span>
          <strong>Descubrí Cinerian</strong>
          <small>Cuatro formas de aprovechar más la app</small>
        </span>
        <span className="profile-discover__chevron" aria-hidden="true">⌄</span>
      </summary>

      <div className="profile-discover__grid">
        <article className="profile-discover__card">
          <span className="profile-discover__number">01</span>
          <h3>Encontrá lo que tienen en común</h3>
          <p>En el perfil de otra persona, “En común” compara las favoritas que ambos valoraron positivamente y sus Watchlists.</p>
          {onFindPeople ? <button type="button" onClick={onFindPeople}>Ir al buscador <span aria-hidden="true">→</span></button> : null}
        </article>
        <article className="profile-discover__card">
          <span className="profile-discover__number">02</span>
          <h3>Seguí tus series</h3>
          <p>Usá “Viendo” para consultar qué episodio se viene. Podés agregar una serie desde su ficha o desde tu perfil.</p>
          <button type="button" onClick={() => { if (detailsRef.current) detailsRef.current.open = false; onOpenWatching(); }}>Ir a Viendo <span aria-hidden="true">→</span></button>
        </article>
        <article className="profile-discover__card">
          <span className="profile-discover__number">03</span>
          <h3>Llevá Cinerian con vos</h3>
          <p>Instalala para abrirla desde la pantalla de inicio o el escritorio, cuando tu navegador lo permita.</p>
          <details className="profile-discover__install">
            <summary>Ver cómo instalar <span aria-hidden="true">→</span></summary>
            <p>{installGuidance()}</p>
          </details>
        </article>
        <article className="profile-discover__card">
          <span className="profile-discover__number">04</span>
          <h3>Enterate de las novedades</h3>
          <p>En Ajustes podés activar las notificaciones desde este dispositivo y comprobar si está conectado a tu cuenta.</p>
          <button type="button" onClick={() => { if (detailsRef.current) detailsRef.current.open = false; onOpenNotifications(); }}>Ir a notificaciones <span aria-hidden="true">→</span></button>
        </article>
      </div>
    </details>
  );
}
