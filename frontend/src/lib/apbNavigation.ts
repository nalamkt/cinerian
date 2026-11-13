import type { AppView } from "./access";

export const MAIN_NAV_ITEMS: ReadonlyArray<{ id: AppView; label: string }> = [
  { id: "feed", label: "Inicio" },
  { id: "recommendations", label: "Descubrí" },
  { id: "watching", label: "Viendo" },
  { id: "user", label: "Mi cuenta" }
];

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
