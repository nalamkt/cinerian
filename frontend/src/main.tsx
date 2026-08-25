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
