import { useEffect, useRef, useState } from "react";

export type WatchlistDropdownOption = {
  value: string;
  label: string;
  logoUrl?: string | null;
};

type WatchlistDropdownProps = {
  /** Nombre del filtro: se lee delante de lo elegido. */
  label: string;
  /** Texto cuando no hay nada elegido ("Todas", "Todos", "Elegir"). */
  allLabel: string;
  values: string[];
  options: WatchlistDropdownOption[];
  onChange: (values: string[]) => void;
  /** Muestra cada opcion con su logo, igual que los filtros de Descubri. */
  withLogos?: boolean;
  /** Buscador arriba de la lista, para catalogos largos. */
  searchPlaceholder?: string;
  /** Aclaracion al pie del menu. */
  note?: string;
  /** "edit" es el disparador chico que acompaña al toggle de mis plataformas. */
  variant?: "filter" | "edit";
};

/** Cuantos logos entran en el disparador antes de resumir en "+N". */
const TRIGGER_LOGO_LIMIT = 4;

function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Desplegable de seleccion multiple para los filtros de la Watchlist.
 * Reemplaza al <select> nativo, que no puede mostrar logos ni elegir varias
 * opciones comodamente. Las opciones reutilizan `.filters-platform`, el mismo
 * boton de los filtros de Descubri. Queda abierto mientras se elige.
 */
export function WatchlistDropdown({
  label,
  allLabel,
  values,
  options,
  onChange,
  withLogos = false,
  searchPlaceholder,
  note,
  variant = "filter"
}: WatchlistDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.filter((option) => values.includes(option.value));
  const normalizedQuery = normalizeForSearch(query.trim());
  const visibleOptions = normalizedQuery
    ? options.filter((option) => normalizeForSearch(option.label).includes(normalizedQuery))
    : options;

  // Escape lo maneja el handler global de App via `data-escape-dismiss`.
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
  }

  const summary = selected.length
    ? selected.map((option) => option.label).join(", ")
    : allLabel;

  return (
    <div className={`watchlist-dropdown watchlist-dropdown--${variant}`} ref={rootRef}>
      <button
        type="button"
        className={`watchlist-dropdown__trigger ${selected.length ? "has-value" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`${label}: ${summary}`}
        title={selected.length > 1 ? summary : undefined}
        data-escape-dismiss={isOpen ? "" : undefined}
      >
        {variant === "filter" ? <span className="watchlist-dropdown__label">{label}</span> : null}

        {withLogos && selected.length ? (
          <span className="watchlist-dropdown__logos" aria-hidden="true">
            {selected.slice(0, TRIGGER_LOGO_LIMIT).map((option) =>
              option.logoUrl ? (
                <img key={option.value} src={option.logoUrl} alt="" className="watchlist-dropdown__logo" />
              ) : (
                <span key={option.value} className="watchlist-dropdown__logo" />
              )
            )}
            {selected.length > TRIGGER_LOGO_LIMIT ? (
              <span className="watchlist-dropdown__more">+{selected.length - TRIGGER_LOGO_LIMIT}</span>
            ) : null}
          </span>
        ) : null}

        {variant === "edit" ? (
          <span className="watchlist-dropdown__value">{selected.length ? "Editar" : allLabel}</span>
        ) : withLogos && selected.length > 1 ? null : (
          <span className="watchlist-dropdown__value">
            {selected.length > 1 ? `${selected[0].label} +${selected.length - 1}` : summary}
          </span>
        )}

        <svg className="watchlist-dropdown__caret" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen ? (
        <div
          className={`watchlist-dropdown__menu ${withLogos ? "watchlist-dropdown__menu--logos" : ""}`}
          role="group"
          aria-label={label}
        >
          <div className="watchlist-dropdown__head">
            <strong>{label}</strong>
            <button type="button" onClick={() => onChange([])} disabled={!values.length}>
              Limpiar
            </button>
          </div>

          {searchPlaceholder ? (
            <div className="filters-search watchlist-dropdown__search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                autoComplete="off"
                autoFocus
              />
            </div>
          ) : null}

          <div className="watchlist-dropdown__options">
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={values.includes(option.value)}
                className="filters-platform"
                onClick={() => toggle(option.value)}
              >
                {withLogos ? (
                  option.logoUrl ? (
                    <img src={option.logoUrl} alt="" className="filters-platform__logo" />
                  ) : (
                    <span className="filters-platform__logo" />
                  )
                ) : null}
                <span className="filters-platform__name">{option.label}</span>
                <span className="filters-platform__check" aria-hidden="true">✓</span>
              </button>
            ))}
            {visibleOptions.length ? null : (
              <p className="filters-platforms__empty">
                {options.length ? "No hay ninguna con ese nombre." : "Cargando…"}
              </p>
            )}
          </div>

          {note ? <p className="watchlist-dropdown__note">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
