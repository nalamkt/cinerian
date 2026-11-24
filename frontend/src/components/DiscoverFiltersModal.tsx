import { useEffect, useId, useMemo, useState } from "react";
import { CONTENT_TYPE_LABEL } from "../lib/discoverFilters";
import { DISCOVER_GENRES } from "../lib/discoverTaxonomy";
import { getOriginalLanguageCatalog, getProviderCatalog, NO_FILTERS, type DiscoverFilters, type ProviderOption } from "../lib/tmdb";
import { FEATURED_ORIGINAL_LANGUAGES, PRIMARY_ORIGINAL_LANGUAGES, originalLanguageLabel, visibleOriginalLanguages } from "../lib/originalLanguages";

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
  const [languages, setLanguages] = useState<Array<{ id: string; label: string }>>(() => FEATURED_ORIGINAL_LANGUAGES.map((id) => ({ id, label: originalLanguageLabel(id) })));
  const [areLanguagesExpanded, setAreLanguagesExpanded] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!isOpen) setAreLanguagesExpanded(false);
  }, [isOpen]);

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
    if (!isOpen) return;
    let current = true;
    void getOriginalLanguageCatalog().then((items) => { if (current) setLanguages(items); });
    return () => { current = false; };
  }, [isOpen]);

  const visibleProviders = useMemo(() => {
    const normalized = normalizeForSearch(query.trim());
    if (!normalized) {
      return catalog;
    }

    return catalog.filter((provider) => normalizeForSearch(provider.name).includes(normalized));
  }, [catalog, query]);
  const visibleLanguages = visibleOriginalLanguages(languages, draft.originalLanguages ?? [], areLanguagesExpanded);
  const hasMoreLanguages = languages.some((language) => !PRIMARY_ORIGINAL_LANGUAGES.includes(language.id));

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

  function toggleGenre(id: number) {
    setDraft((current) => ({
      ...current,
      genreIds: (current.genreIds ?? []).includes(id)
        ? (current.genreIds ?? []).filter((entry) => entry !== id)
        : [...(current.genreIds ?? []), id]
    }));
  }

  function toggleLanguage(id: string) {
    setDraft((current) => ({
      ...current,
      originalLanguages: (current.originalLanguages ?? []).includes(id)
        ? (current.originalLanguages ?? []).filter((entry) => entry !== id)
        : [...(current.originalLanguages ?? []), id]
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
        <button type="button" className="filters-modal__close" onClick={onClose} aria-label="Cerrar" data-escape-dismiss>
          ×
        </button>

        <h3 className="filters-modal__title">Filtros</h3>
        <p className="filters-modal__sub">Se guardan para la próxima vez que entres.</p>

        <div className="filters-modal__body">
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

        <fieldset className="filters-group filters-group--choices">
          <legend className="filters-group__label">Género</legend>
          <div className="filters-group__actions">
            <p className="filters-group__help">Podés elegir varios. Sin selección, aparecen todos.</p>
            <button type="button" className="filters-modal__clear" onClick={() => setDraft((current) => ({ ...current, genreIds: [] }))} disabled={!draft.genreIds?.length}>Limpiar género</button>
          </div>
          <div className="filters-choice-grid">
            {DISCOVER_GENRES.map((genre) => (
              <div className="filters-choice" key={genre.id}>
                <input id={`${id}-genre-${genre.id}`} type="checkbox" checked={(draft.genreIds ?? []).includes(genre.id)} onChange={() => toggleGenre(genre.id)} />
                <label htmlFor={`${id}-genre-${genre.id}`}>
                  {genre.label}{genre.mediaTypes.length === 1 ? ` · ${genre.mediaTypes[0] === "movie" ? "Películas" : "Series"}` : ""}
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="filters-group filters-group--choices">
          <legend className="filters-group__label">Idioma original</legend>
          <div className="filters-group__actions">
            <p className="filters-group__help">Idioma en que se creó el título, no doblaje ni país. Podés elegir varios.</p>
            <button type="button" className="filters-modal__clear" onClick={() => setDraft((current) => ({ ...current, originalLanguages: [] }))} disabled={!draft.originalLanguages?.length}>Limpiar idioma</button>
          </div>
          <div className="filters-choice-grid" id={`${id}-languages`}>
            {visibleLanguages.map((language) => (
              <div className="filters-choice" key={language.id}>
                <input id={`${id}-language-${language.id}`} type="checkbox" checked={(draft.originalLanguages ?? []).includes(language.id)} onChange={() => toggleLanguage(language.id)} />
                <label htmlFor={`${id}-language-${language.id}`}>{language.label}</label>
              </div>
            ))}
          </div>
          {hasMoreLanguages ? <button
            type="button"
            className="filters-modal__clear filters-modal__languages-toggle"
            aria-controls={`${id}-languages`}
            aria-expanded={areLanguagesExpanded}
            onClick={() => setAreLanguagesExpanded((current) => !current)}
          >{areLanguagesExpanded ? "Ver menos" : "Ver más idiomas"}</button> : null}
        </fieldset>

        <div className="filters-group">
          <p className="filters-group__label">Tus plataformas</p>
          <p className="filters-group__help">
            Solo te vamos a recomendar títulos incluidos con suscripción en Argentina. Sin ninguna
            marcada, te mostramos los disponibles en cualquier plataforma.
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
                    aria-label={provider.name}
                    aria-pressed={draft.providerIds.includes(provider.id)}
                    onClick={() => toggleProvider(provider.id)}
                  >
                    {provider.logoUrl ? (
                      <img src={provider.logoUrl} alt="" className="filters-platform__logo" />
                    ) : (
                      <span className="filters-platform__logo" />
                    )}
                    <span className="filters-platform__name">{provider.name}</span>
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
        </div>

        <div className="filters-modal__foot">
          <button
            type="button"
            className="filters-modal__clear"
            onClick={() => setDraft({ ...NO_FILTERS, providerIds: [], genreIds: [], originalLanguages: [] })}
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
