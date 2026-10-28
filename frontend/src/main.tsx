import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App";
import { AdminPanelPage } from "./components/AdminPanelPage";
import { SharedMediaPage } from "./components/SharedMediaPage";
import { parseSharedMediaPath } from "./lib/share";
import "./styles.css";

const sharedRoute = parseSharedMediaPath(window.location.pathname);
const isAdminPanelRoute = window.location.pathname === "/panel" || window.location.pathname.startsWith("/panel/");

/*
  ScreenOrientation.lock no esta declarado en lib.dom: la API existe en Chrome y
  Android pero Safari no la implementa, asi que TypeScript no la tipa. El guard
  de abajo ya cubre el caso en tiempo de ejecucion; esto solo se lo explica al
  compilador, sin recurrir a any.
*/
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "any" | "portrait" | "landscape") => Promise<void>;
};

document.addEventListener("fullscreenchange", () => {
  const orientation = window.screen.orientation as LockableOrientation | undefined;
  if (typeof orientation?.lock !== "function") return;

  const isTrailerFullscreen = document.fullscreenElement?.matches(".media-modal__trailer iframe") ?? false;
  void orientation.lock(isTrailerFullscreen ? "any" : "portrait").catch(() => {
    // El manifest y el aviso horizontal cubren navegadores que rechazan el bloqueo.
  });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {sharedRoute ? (
      <SharedMediaPage mediaType={sharedRoute.mediaType} id={sharedRoute.id} />
    ) : isAdminPanelRoute ? (
      <AdminPanelPage />
    ) : (
      <App />
    )}
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>
);
