type InstallChoice = { outcome: "accepted" | "dismissed" };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

export type PwaInstallState = {
  runningAsApp: boolean;
  promptAvailable: boolean;
  prompting: boolean;
  installedThisSession: boolean;
};

export function isAppleMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

const listeners = new Set<() => void>();
const emptyState: PwaInstallState = {
  runningAsApp: false,
  promptAvailable: false,
  prompting: false,
  installedThisSession: false
};
let state = emptyState;
let pendingPrompt: InstallPromptEvent | null = null;
let initialized = false;

function isRunningAsApp() {
  if (typeof window === "undefined") return false;
  const displayModes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];
  return displayModes.some((mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://");
}

function updateState(next: Partial<PwaInstallState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function getPwaInstallState() {
  return state;
}

export function getServerPwaInstallState() {
  return emptyState;
}

export function subscribePwaInstall(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function initializePwaInstall() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  updateState({ runningAsApp: isRunningAsApp() });

  window.addEventListener("beforeinstallprompt", (event) => {
    if (isRunningAsApp() || state.installedThisSession) return;
    event.preventDefault();
    pendingPrompt = event as InstallPromptEvent;
    updateState({ promptAvailable: true });
  });
  window.addEventListener("appinstalled", () => {
    pendingPrompt = null;
    updateState({ installedThisSession: true, promptAvailable: false, prompting: false });
  });

  for (const mode of ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"]) {
    window.matchMedia?.(`(display-mode: ${mode})`).addEventListener?.("change", () => {
      const runningAsApp = isRunningAsApp();
      if (runningAsApp) pendingPrompt = null;
      updateState({ runningAsApp, promptAvailable: runningAsApp ? false : Boolean(pendingPrompt) });
    });
  }
}

export async function promptPwaInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = pendingPrompt;
  if (!event || state.prompting || state.runningAsApp) return "unavailable";
  pendingPrompt = null;
  updateState({ promptAvailable: false, prompting: true });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return "unavailable";
  } finally {
    updateState({ prompting: false });
  }
}
