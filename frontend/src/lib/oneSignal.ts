import OneSignal from "react-onesignal";

const ONE_SIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID ?? "47939fb0-3234-4852-a5da-1ac4ec3d4f5a";
const SERVICE_WORKER_PATH = "/push/onesignal/OneSignalSDKWorker.js";
const SERVICE_WORKER_SCOPE = "/push/onesignal/";

export type OneSignalPushStatus = "unsupported" | "denied" | "ready" | "subscribed";

let initializationTask: Promise<void> | null = null;

function canUseWebPush() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export async function initializeOneSignal() {
  if (!canUseWebPush()) {
    return false;
  }

  if (!initializationTask) {
    initializationTask = OneSignal.init({
      appId: ONE_SIGNAL_APP_ID,
      autoResubscribe: true,
      // El opt-in se solicita desde Ajustes, nunca durante la carga de la app.
      promptOptions: {
        slidedown: {
          prompts: [
            {
              type: "push",
              autoPrompt: false,
              delay: {}
            }
          ]
        }
      },
      serviceWorkerPath: SERVICE_WORKER_PATH,
      serviceWorkerParam: { scope: SERVICE_WORKER_SCOPE }
    }).catch((error) => {
      initializationTask = null;
      throw error;
    });
  }

  await initializationTask;
  return true;
}

export async function identifyOneSignalUser(userId: string) {
  const isAvailable = await initializeOneSignal();
  if (!isAvailable) {
    return;
  }

  await OneSignal.login(userId);
}

export async function clearOneSignalUser() {
  const isAvailable = await initializeOneSignal();
  if (!isAvailable) {
    return;
  }

  await OneSignal.logout();
}

export async function getOneSignalPushStatus(): Promise<OneSignalPushStatus> {
  const isAvailable = await initializeOneSignal();
  if (!isAvailable || !OneSignal.Notifications.isPushSupported()) {
    return "unsupported";
  }

  if (OneSignal.Notifications.permissionNative === "denied") {
    return "denied";
  }

  return OneSignal.User.PushSubscription.optedIn ? "subscribed" : "ready";
}

export async function enableOneSignalPush() {
  // Esta funcion se llama directamente desde el click del usuario para que el
  // navegador, especialmente Safari en iOS, acepte mostrar el permiso nativo.
  await OneSignal.User.PushSubscription.optIn();
}
