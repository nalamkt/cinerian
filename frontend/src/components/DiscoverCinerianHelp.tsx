import { useRef, useState, useSyncExternalStore } from "react";
import { getPwaInstallState, getServerPwaInstallState, isAppleMobileDevice, promptPwaInstall, subscribePwaInstall } from "../lib/pwaInstall";
import { useNotificationConnection } from "./useNotificationConnection";

type DiscoverCinerianHelpProps = {
  userId: string;
  onFindPeople?: () => void;
  onOpenWatching: () => void;
  onOpenNotifications: () => void;
};

function installGuidance() {
  const userAgent = navigator.userAgent;
  const isAppleMobile = isAppleMobileDevice();
  const isAndroid = /Android/.test(userAgent);
  const isMac = /Macintosh|Mac OS X/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|Chrome|Edg|FxiOS/.test(userAgent);
  const isChromeAndroid = isAndroid && /Chrome/.test(userAgent) && !/Edg|OPR|SamsungBrowser/.test(userAgent);
  if (isAppleMobile) {
    return `${isSafari ? "En Safari" : "Abrí Cinerian en Safari"}, tocá Compartir → Agregar a pantalla de inicio, activá “Abrir como app” si aparece y tocá Agregar. Después, abrila desde el icono de inicio.`;
  }
  if (isAndroid) {
    return `${isChromeAndroid ? "En Chrome" : "Abrí Cinerian en Chrome"}, abrí el menú ⋮ y elegí “Instalar app” o “Agregar a pantalla principal”, si aparece esa opción.`;
  }
  if (isMac && isSafari) {
    return "En Safari para macOS Sonoma o posterior, abrí Compartir → Agregar al Dock. Después, abrí Cinerian desde su icono en el Dock.";
  }
  return "Abrí el menú de tu navegador y buscá “Instalar Cinerian” o “Instalar aplicación”, si está disponible.";
}

export function DiscoverCinerianHelp({ userId, onFindPeople, onOpenWatching, onOpenNotifications }: DiscoverCinerianHelpProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const install = useSyncExternalStore(subscribePwaInstall, getPwaInstallState, getServerPwaInstallState);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const notifications = useNotificationConnection(userId, helpOpen);
  const { status, connection, canActivate, isUpdating, isAppleMobile, runningAsApp } = notifications;
  const permission = status === null || status === "setup-error" ? "Sin comprobar"
    : connection?.permission === "granted" ? "Permitido"
    : connection?.permission === "denied" ? "Bloqueado"
      : connection?.permission === "default" ? "Sin decidir" : "No disponible";
  const availability = status === null ? "Comprobando" : status === "setup-error" ? "Sin comprobar"
    : status === "unsupported" ? "No compatible" : "Compatible";
  const subscription = status === null || status === "setup-error" ? "Sin comprobar"
    : status === "unsupported" ? "No disponible"
      : connection?.status === "subscribed" && connection.hasSubscription ? "Activa" : "Sin activar";
  const accountLink = status === null || status === "setup-error" ? "Sin comprobar"
    : status === "unsupported" ? "No disponible"
    : connection?.linkedToAccount ? "Vinculada" : "Sin confirmar";
  const notificationHelp = isAppleMobile && !runningAsApp
    ? "En iPhone y iPad necesitás iOS/iPadOS 16.4 o posterior. Agregá Cinerian a inicio y abrila desde el icono para activar avisos."
    : status === "denied"
      ? isAppleMobile
        ? "El permiso está bloqueado. Abrí Ajustes → Notificaciones → Cinerian en tu iPhone o iPad y habilitá los avisos."
        : "El permiso está bloqueado. Habilitá Cinerian en los ajustes de notificaciones del navegador y volvé a comprobarlo."
      : status === "unsupported"
        ? "Este navegador no ofrece notificaciones web para Cinerian."
        : status === "setup-error"
          ? "No pudimos comprobar la conexión de este dispositivo. Revisala en Ajustes."
          : status === "subscribed" && connection?.hasSubscription && connection.linkedToAccount
            ? "Este dispositivo figura suscrito y vinculado. Eso no confirma la recepción de cada aviso."
            : status === "subscribed"
              ? "El permiso figura activo, pero falta confirmar la suscripción o el vínculo con tu cuenta."
              : status === "ready"
                ? "Podés activar los avisos desde este dispositivo cuando quieras."
                : "Comprobando si este dispositivo permite activar avisos.";

  async function handleInstall() {
    setInstallMessage(null);
    const outcome = await promptPwaInstall();
    if (outcome === "accepted") {
      setInstallMessage("Instalación aceptada. Cuando aparezca el icono, abrí Cinerian desde ahí.");
    } else if (outcome === "dismissed") {
      setInstallMessage("Instalación cancelada. Podés volver a intentarlo desde el menú del navegador.");
    } else {
      setInstallMessage("El navegador ya no ofrece la instalación en esta pestaña. Probá desde su menú.");
    }
  }

  return (
    <details className="profile-discover" ref={detailsRef} onToggle={(event) => {
      if (event.target === event.currentTarget) setHelpOpen(event.currentTarget.open);
    }}>
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
          <h3>Instalá Cinerian</h3>
          {install.runningAsApp ? (
            <p role="status" className="profile-discover__app-status">Estás usando Cinerian como app.</p>
          ) : install.installedThisSession ? (
            <p role="status" className="profile-discover__app-status">Cinerian se instaló. Abrila desde su icono para usarla como app.</p>
          ) : (
            <>
              <p>Podés abrir Cinerian desde tu pantalla de inicio o escritorio, si este navegador ofrece la opción.</p>
              {install.promptAvailable ? (
                <button type="button" className="profile-discover__primary-action" onClick={() => void handleInstall()} disabled={install.prompting}>
                  {install.prompting ? "Abriendo instalación..." : "Instalar Cinerian"}
                </button>
              ) : null}
              <details className="profile-discover__install">
                <summary>Ver cómo instalar <span aria-hidden="true">→</span></summary>
                <p>{installGuidance()}</p>
              </details>
              {installMessage ? <p role="status" className="profile-discover__install-message">{installMessage}</p> : null}
            </>
          )}
        </article>
        <article className="profile-discover__card">
          <span className="profile-discover__number">04</span>
          <h3>Notificaciones</h3>
          <p>Podés recibir recomendaciones, respuestas y novedades de tus series y de tu círculo.</p>
          <dl className="profile-discover__push-facts" aria-label="Estado de notificaciones">
            <div><dt>Compatibilidad</dt><dd>{availability}</dd></div>
            <div><dt>Permiso</dt><dd>{permission}</dd></div>
            <div><dt>Suscripción</dt><dd>{subscription}</dd></div>
            <div><dt>Tu cuenta</dt><dd>{accountLink}</dd></div>
          </dl>
          <p className="profile-discover__push-help">{notificationHelp}</p>
          {canActivate ? (
            <button type="button" className="profile-discover__primary-action" onClick={() => void notifications.activate()} disabled={isUpdating}>
              {isUpdating ? "Activando..." : "Activar notificaciones"}
            </button>
          ) : null}
          {notifications.error ? <p role="alert" className="profile-discover__push-help">{notifications.error}</p> : null}
          <button type="button" onClick={() => { if (detailsRef.current) detailsRef.current.open = false; onOpenNotifications(); }}>Ver configuración <span aria-hidden="true">→</span></button>
        </article>
      </div>
    </details>
  );
}
