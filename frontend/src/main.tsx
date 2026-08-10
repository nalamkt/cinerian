import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App";
import { SharedMediaPage } from "./components/SharedMediaPage";
import { parseSharedMediaPath } from "./lib/share";
import "./styles.css";

const sharedRoute = parseSharedMediaPath(window.location.pathname);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {sharedRoute ? <SharedMediaPage mediaType={sharedRoute.mediaType} id={sharedRoute.id} /> : <App />}
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>
);
