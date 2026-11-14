import type { AppView } from "./access";

const LINKABLE_VIEWS: ReadonlyArray<AppView> = ["feed", "search", "recommendations", "mutual", "watching", "watchlist", "inbox", "user"];

export const MAIN_NAV_ITEMS: ReadonlyArray<{ id: AppView; label: string }> = [
  { id: "recommendations", label: "Descubrí" },
  { id: "mutual", label: "En común" },
  { id: "watching", label: "Viendo" },
  { id: "watchlist", label: "Watchlist" }
];

export const MOBILE_NAV_ITEMS: ReadonlyArray<{ id: AppView; label: string }> = [
  ...MAIN_NAV_ITEMS,
  { id: "user", label: "Perfil" }
];

export function requestedApbView(search: string): AppView | null {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === "user" && params.get("tab") === "watching") return "watching";
  if (view === "user" && params.get("tab") === "watchlist") return "watchlist";
  if (LINKABLE_VIEWS.includes(view as AppView)) return view as AppView;
  if (!view && params.get("tab") === "watching") return "watching";
  return !view && params.get("tab") === "watchlist" ? "watchlist" : null;
}

export function resolveApbView(
  view: AppView | null,
  canSearch: boolean,
  canDiscover: boolean
): AppView | null {
  if (view === "search" || view === "recommendations") {
    return canSearch || canDiscover ? "recommendations" : null;
  }

  return view;
}
