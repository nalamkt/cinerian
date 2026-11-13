import { useEffect, useState } from "react";
import type { OneSignalConnectionStatus, OneSignalPushStatus } from "../lib/oneSignal";
import { fetchPushDiagnostics, sendTestPush, type PushDiagnostics } from "../lib/pushNotifications";
import { PushResponseError } from "../lib/pushDiagnosticsResponse";
import { useNotificationConnection } from "./useNotificationConnection";

type NotificationStatus = OneSignalPushStatus | "setup-error";

function statusCopy(status: NotificationStatus, origin: string) {
  if (status === "subscribed") {
    return "Este dispositivo figura suscrito. El envío y la recepción se comprueban por separado.";
  }

  if (status === "denied") {
    return "Las notificaciones estan bloqueadas para Cinerian. Podes habilitarlas desde los ajustes del navegador.";
  }

  if (status === "unsupported") {
    return "Este navegador no permite notificaciones. En iPhone y iPad necesitás iOS/iPadOS 16.4 o posterior: agregá Cinerian a inicio y abrila desde su icono.";
  }

  if (status === "setup-error") {
    return `No pudimos conectar las notificaciones con ${origin}. Confirmá que OneSignal esté configurado para esta URL exacta y probá de nuevo.`;
  }

  return "Recibí avisos de respuestas, recomendaciones y novedades de tu círculo.";
}

function permissionCopy(permission: OneSignalConnectionStatus["permission"]) {
  if (permission === "granted") return "Permitido";
  if (permission === "denied") return "Bloqueado";
  if (permission === "default") return "Sin decidir";
  return "No compatible";
}

export function NotificationDiagnosticsSummary({
  diagnostics,
  serverError
}: {
  diagnostics: PushDiagnostics | null;
  serverError: string | null;
}) {
  const latestDelivery = diagnostics?.deliveries?.[0] ?? null;

  if (!diagnostics) {
    return serverError ? <p role="status">Diagnóstico no disponible. {serverError}</p> : null;
  }

  const deliveryCopy = latestDelivery?.outcome === "uncertain"
    ? "Resultado del último envío incierto. No se reenviará automáticamente para evitar duplicados."
    : latestDelivery?.status === "sent"
      ? "El proveedor aceptó el último envío; esto no confirma que haya llegado al dispositivo."
      : latestDelivery?.status === "failed"
        ? "El último envío no se completó."
        : latestDelivery
          ? "El último envío sigue pendiente de confirmación."
          : "Todavía no hay envíos registrados para tu cuenta.";

  return (
    <div role="status">
      <p>{deliveryCopy}{latestDelivery ? ` (${new Date(latestDelivery.createdAt).toLocaleString("es-AR")})` : ""}</p>
      {diagnostics.watchingCount > 0 ? (
        <p>{diagnostics.seriesCronLastSeenAt
          ? `Última actualización registrada de tus series: ${new Date(diagnostics.seriesCronLastSeenAt).toLocaleString("es-AR")}.`
          : "Todavía no hay una actualización registrada de tus series."}</p>
      ) : null}
    </div>
  );
}

export function NotificationPreferences({ userId }: { userId: string }) {
  const { status, connection, isUpdating, canActivate, error, refresh, activate } = useNotificationConnection(userId, false);
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const origin = window.location.origin;

  async function checkNotifications() {
    setIsChecking(true);
    setServerError(null);
    try {
      await refresh();
      setDiagnostics(await fetchPushDiagnostics());
    } catch (checkError) {
      setServerError(checkError instanceof PushResponseError ? checkError.message : "No pudimos comprobar el servidor.");
      setDiagnostics(null);
    } finally {
      setIsChecking(false);
    }
  }

  useEffect(() => {
    void checkNotifications();
  }, [userId]);

  async function handleTestPush() {
    setIsTesting(true);
    setTestMessage(null);
    try {
      const result = await sendTestPush();
      setTestMessage(result.status === "sent"
        ? "El proveedor aceptó la prueba; comprobá si llegó a este dispositivo."
        : result.status === "uncertain"
          ? "No pudimos confirmar el resultado. No repetimos la prueba automáticamente para evitar duplicados."
          : result.status === "duplicate"
            ? "La prueba ya se había solicitado y no se envió de nuevo."
            : "El servidor no pudo completar la prueba. Revisá el diagnóstico.");
      await checkNotifications();
    } catch (testError) {
      setTestMessage(testError instanceof PushResponseError ? testError.message : "No pudimos comprobar el envío de la prueba.");
      await checkNotifications();
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="profile-editor__field">
      <span>Notificaciones</span>
      <p>{status ? statusCopy(status, origin) : "Preparando tus notificaciones..."}</p>
      {canActivate ? (
        <button type="button" className="profile-follow-button" onClick={() => void activate()} disabled={isUpdating}>
          {isUpdating ? "Activando..." : "Activar notificaciones"}
        </button>
      ) : null}
      {status === "setup-error" ? (
        <p>La conexión de este dispositivo necesita revisión.</p>
      ) : null}
      {status === "subscribed" ? (
        <p>
          {connection?.linkedToAccount && connection.hasSubscription
            ? "Suscripción activa y vinculada a tu cuenta."
            : "La suscripción o el vínculo con tu cuenta no están confirmados. Probá comprobar de nuevo."}
        </p>
      ) : null}
      {connection ? (
        <p>Permiso del navegador: {permissionCopy(connection.permission)}. Suscripción OneSignal: {connection.status === "subscribed" && connection.hasSubscription ? "activa" : "no confirmada"}. Vínculo con tu cuenta: {connection.linkedToAccount ? "activo" : "no confirmado"}.</p>
      ) : null}
      <NotificationDiagnosticsSummary diagnostics={diagnostics} serverError={serverError} />
      <button type="button" className="profile-follow-button" onClick={() => void checkNotifications()} disabled={isChecking || isTesting}>
        {isChecking ? "Comprobando..." : "Comprobar notificaciones"}
      </button>
      {status === "subscribed" && connection?.permission === "granted" && connection.linkedToAccount && connection.hasSubscription && diagnostics ? (
        <button type="button" className="profile-follow-button" onClick={() => void handleTestPush()} disabled={isTesting || isChecking}>
          {isTesting ? "Enviando prueba..." : "Enviar notificación de prueba"}
        </button>
      ) : null}
      {testMessage ? <small>{testMessage}</small> : null}
      {error ? <small>{error}</small> : null}
    </div>
  );
}
