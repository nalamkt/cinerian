import type { DiscoverMode } from "../lib/discoverTrailer";

type DiscoverModeSwitchProps = {
  mode: DiscoverMode;
  disabled: boolean;
  onChange: (mode: DiscoverMode) => void;
};

export function DiscoverModeSwitch({ mode, disabled, onChange }: DiscoverModeSwitchProps) {
  return (
    <>
      <div className="discover-mode-switch" role="group" aria-label="Modo de Descubrí">
        <button type="button" className={mode === "trailers" ? "is-active" : ""} aria-pressed={mode === "trailers"} disabled={disabled} onClick={() => onChange("trailers")}>Tráilers</button>
        <button type="button" className={mode === "cards" ? "is-active" : ""} aria-pressed={mode === "cards"} disabled={disabled} onClick={() => onChange("cards")}>Tarjetas</button>
      </div>
      <label className="discover-mode-select">
        <span className="sr-only">Modo de Descubrí</span>
        <select value={mode} disabled={disabled} onChange={(event) => onChange(event.target.value as DiscoverMode)}>
          <option value="trailers">Tráilers</option>
          <option value="cards">Tarjetas</option>
        </select>
      </label>
    </>
  );
}
