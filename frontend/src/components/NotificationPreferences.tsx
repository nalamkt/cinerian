import { useEffect, useState } from "react";
import {
  enableOneSignalPush,
  getOneSignalPushStatus,
  type OneSignalPushStatus
} from "../lib/oneSignal";

type NotificationStatus = OneSignalPushStatus | "setup-error";

function statusCopy(status: NotificationStatus, origin: string) {
  if (status === "subscribed") {
    return "Vas a recibir avisos cuando haya novedades relevantes para vos.";
  }

  if (status === "denied") {
    return "Las notificaciones estan bloqueadas para Cinerian. Podes habilitarlas desde los ajustes del navegador.";
  }

  if (status === "unsupported") {
    return "Este navegador no permite notificaciones. En iPhone y iPad, instalá Cinerian en la pantalla de inicio y abrila desde ahí.";
  }

  if (status === "setup-error") {
    return `No pudimos conectar las notificaciones con ${origin}. Confirmá que OneSignal esté configurado para esta URL exacta y probá de nuevo.`;
  }

  return "Recibí avisos de respuestas, recomendaciones y novedades de tu círculo.";
}

async function readPushStatus(): Promise<NotificationStatus> {
  try {
    return await getOneSignalPushStatus();
  } catch {
    return "setup-error";
  }
}

export function NotificationPreferences() {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = window.location.origin;

  useEffect(() => {
    let isMounted = true;

    void readPushStatus().then((nextStatus) => {
      if (isMounted) {
        setStatus(nextStatus);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleRetry() {
    setIsUpdating(true);
    setError(null);
    setStatus(await readPushStatus());
    setIsUpdating(false);
  }

  async function handleEnablePush() {
    if (status !== "ready") {
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      await enableOneSignalPush();
      setStatus(await getOneSignalPushStatus());
    } catch {
      setError("No pudimos activar las notificaciones. Probá de nuevo desde este navegador.");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="profile-editor__field">
      <span>Notificaciones</span>
      <p>{status ? statusCopy(status, origin) : "Preparando tus notificaciones..."}</p>
      {status === "ready" ? (
        <button type="button" className="profile-follow-button" onClick={() => void handleEnablePush()} disabled={isUpdating}>
          {isUpdating ? "Activando..." : "Activar notificaciones"}
        </button>
      ) : null}
      {status === "setup-error" ? (
        <button type="button" className="profile-follow-button" onClick={() => void handleRetry()} disabled={isUpdating}>
          {isUpdating ? "Reintentando..." : "Reintentar"}
        </button>
      ) : null}
      {error ? <small>{error}</small> : null}
    </div>
  );
}
