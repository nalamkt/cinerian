import { useEffect, useState } from "react";
import {
  enableOneSignalPush,
  getOneSignalPushStatus,
  type OneSignalPushStatus
} from "../lib/oneSignal";

function statusCopy(status: OneSignalPushStatus) {
  if (status === "subscribed") {
    return "Vas a recibir avisos cuando haya novedades relevantes para vos.";
  }

  if (status === "denied") {
    return "Las notificaciones estan bloqueadas para Cinerian. Podes habilitarlas desde los ajustes del navegador.";
  }

  if (status === "unsupported") {
    return "Este navegador no permite notificaciones. En iPhone y iPad, instalá Cinerian en la pantalla de inicio y abrila desde ahí.";
  }

  return "Recibí avisos de respuestas, recomendaciones y novedades de tu círculo.";
}

export function NotificationPreferences() {
  const [status, setStatus] = useState<OneSignalPushStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getOneSignalPushStatus()
      .then((nextStatus) => {
        if (isMounted) {
          setStatus(nextStatus);
        }
      })
      .catch(() => {
        if (isMounted) {
          setStatus("unsupported");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
      <p>{status ? statusCopy(status) : "Preparando tus notificaciones..."}</p>
      {status === "ready" ? (
        <button type="button" className="profile-follow-button" onClick={() => void handleEnablePush()} disabled={isUpdating}>
          {isUpdating ? "Activando..." : "Activar notificaciones"}
        </button>
      ) : null}
      {error ? <small>{error}</small> : null}
    </div>
  );
}
