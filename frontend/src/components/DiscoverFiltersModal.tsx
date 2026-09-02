import { useEffect, useMemo, useState } from "react";
import { CONTENT_TYPE_LABEL } from "../lib/discoverFilters";
import { getProviderCatalog, type DiscoverFilters, type ProviderOption } from "../lib/tmdb";

type DiscoverFiltersModalProps = {
  isOpen: boolean;
  filters: DiscoverFilters;
  isSaving?: boolean;
  onClose: () => void;
  onApply: (filters: DiscoverFilters) => void;
};

const CONTENT_TYPES: DiscoverFilters["contentType"][] = ["all", "movie", "series", "mini"];

/** Sin acentos y en minuscula, para que "apple" encuentre "Apple TV". */
function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function DiscoverFiltersModal({
  isOpen,
  filters,
  isSaving = false,
  onClose,
  onApply
}: DiscoverFiltersModalProps) {
  const [draft, setDraft] = useState<DiscoverFilters>(filters);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<ProviderOption[]>([]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setDraft(filters);
    setQuery("");
  }, [isOpen, filters]);

  useEffect(() => {
    if (!isOpen || catalog.length) {
      return;
    }

    let isMounted = true;
    void getProviderCatalog().then((results) => {
      if (isMounted) {
        setCatalog(results);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, catalog.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const visibleProviders = useMemo(() => {
    const normalized = normalizeForSearch(query.trim());
    if (!normalized) {
      return catalog;
    }

    return catalog.filter((provider) => normalizeForSearch(provider.name).includes(normalized));
  }, [catalog, query]);

  if (!isOpen) {
    return null;
  }

  function toggleProvider(id: number) {
    setDraft((current) => ({
      ...current,
      providerIds: current.providerIds.includes(id)
        ? current.providerIds.filter((entry) => entry !== id)
        : [...current.providerIds, id]
    }));
  }

  return (
    <div className="filters-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="filters-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Filtros de Descubri"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="filters-modal__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>

        <h3 className="filters-modal__title">Filtros</h3>
        <p className="filters-modal__sub">Se guardan para la próxima vez que entres.</p>

        <div className="filters-group">
          <p className="filters-group__label">Qué querés ver</p>
          <p className="filters-group__help">Elegí uno.</p>
          <div className="filters-segmented" role="group" aria-label="Tipo de contenido">
            {CONTENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="filters-seg"
                aria-pressed={draft.contentType === type}
                onClick={() => setDraft((current) => ({ ...current, contentType: type }))}
              >
                {CONTENT_TYPE_LABEL[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="filters-group">
          <p className="filters-group__label">Tus plataformas</p>
          <p className="filters-group__help">
            Solo te vamos a recomendar cosas que puedas ver acá. Sin ninguna marcada, te mostramos
            todo.
          </p>

          <div className="filters-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar plataforma…"
              autoComplete="off"
            />
          </div>

          {catalog.length ? (
            <>
              <div className="filters-platforms">
                {visibleProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className="filters-platform"
                    aria-pressed={draft.providerIds.includes(provider.id)}
                    onClick={() => toggleProvider(provider.id)}
                  >
                    {provider.logoUrl ? (
                      <img src={provider.logoUrl} alt="" className="filters-platform__logo" />
                    ) : (
                      <span className="filters-platform__logo" />
                    )}
                    {provider.name}
                    <span className="filters-platform__check" aria-hidden="true">
                      ✓
                    </span>
                  </button>
                ))}
              </div>
              {visibleProviders.length ? null : (
                <p className="filters-platforms__empty">No hay ninguna con ese nombre.</p>
              )}
            </>
          ) : (
            <p className="filters-platforms__empty">Cargando plataformas…</p>
          )}
        </div>

        <div className="filters-modal__foot">
          <button
            type="button"
            className="filters-modal__clear"
            onClick={() => setDraft({ providerIds: [], contentType: "all" })}
            disabled={isSaving}
          >
            Limpiar filtros
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onApply(draft)}
            disabled={isSaving}
          >
            {isSaving ? "Guardando…" : "Listo"}
          </button>
        </div>
      </div>
    </div>
  );
}
