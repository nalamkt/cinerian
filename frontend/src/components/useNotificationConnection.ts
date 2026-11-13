import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  enableOneSignalPush,
  getOneSignalConnectionStatus,
  identifyOneSignalUser,
  type OneSignalConnectionStatus,
  type OneSignalPushStatus
} from "../lib/oneSignal";
import { getPwaInstallState, getServerPwaInstallState, isAppleMobileDevice, subscribePwaInstall } from "../lib/pwaInstall";

type NotificationStatus = OneSignalPushStatus | "setup-error";

export function canActivateNotificationConnection(
  connection: OneSignalConnectionStatus | null,
  isAppleMobile: boolean,
  runningAsApp: boolean
) {
  return connection?.status === "ready" && connection.permission !== "denied" &&
    (!isAppleMobile || runningAsApp);
}

export function useNotificationConnection(userId: string, active = true) {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [connection, setConnection] = useState<OneSignalConnectionStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const install = useSyncExternalStore(subscribePwaInstall, getPwaInstallState, getServerPwaInstallState);
  const canActivate = status === "ready" &&
    canActivateNotificationConnection(connection, isAppleMobileDevice(), install.runningAsApp);

  async function refresh() {
    const currentRequest = ++requestId.current;
    setIsChecking(true);
    try {
      let next = await getOneSignalConnectionStatus(userId);
      if (next.status === "subscribed" && !next.linkedToAccount) {
        await identifyOneSignalUser(userId).catch(() => undefined);
        next = await getOneSignalConnectionStatus(userId);
      }
      if (requestId.current === currentRequest) {
        setConnection(next);
        setStatus(next.status);
      }
    } catch {
      if (requestId.current === currentRequest) {
        setConnection(null);
        setStatus("setup-error");
      }
    } finally {
      if (requestId.current === currentRequest) setIsChecking(false);
    }
  }

  useEffect(() => {
    if (active) void refresh();
    return () => { requestId.current += 1; };
  }, [active, userId]);

  async function activate() {
    if (!canActivate || isUpdating) return;
    setIsUpdating(true);
    setError(null);
    try {
      await enableOneSignalPush();
      await refresh();
    } catch {
      setError("No pudimos activar las notificaciones. Revisá los ajustes de este dispositivo.");
    } finally {
      setIsUpdating(false);
    }
  }

  return { status, connection, isChecking, isUpdating, error, canActivate, refresh, activate, isAppleMobile: isAppleMobileDevice(), runningAsApp: install.runningAsApp };
}
