import { useEffect, useMemo, useState } from "react";
import { type Profile, updateProfile } from "../lib/auth";
import { fetchDiscoverFilters, saveDiscoverFilters } from "../lib/discoverFilters";
import { getProviderCatalog, type ProviderOption } from "../lib/tmdb";

const GENRE_OPTIONS = [
  "Accion",
  "Animacion",
  "Aventura",
  "Belica",
  "Comedia",
  "Crimen",
  "Documental",
  "Drama",
  "Fantasia",
  "Historia",
  "Misterio",
  "Musica",
  "Romance",
  "Sci-fi",
  "Suspenso",
  "Terror",
  "Thriller",
  "Western"
];

type WelcomeOnboardingProps = {
  profile: Profile;
  onProfileUpdated: (profile: Profile) => void;
  onComplete: (profile: Profile) => void;
};

function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function WelcomeOnboarding({ profile, onProfileUpdated, onComplete }: WelcomeOnboardingProps) {
  const [step, setStep] = useState<"genres" | "providers">("genres");
  const [genres, setGenres] = useState(profile.favorite_genres);
  const [providerIds, setProviderIds] = useState<number[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providerQuery, setProviderQuery] = useState("");
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProviders() {
      try {
        const [catalog, filters] = await Promise.all([getProviderCatalog(), fetchDiscoverFilters(profile.id)]);
        if (!isMounted) {
          return;
        }

        setProviders(catalog);
        setProviderIds(filters.providerIds);
      } finally {
        if (isMounted) {
          setIsLoadingProviders(false);
        }
      }
    }

    void loadProviders();
    return () => {
      isMounted = false;
    };
  }, [profile.id]);

  const visibleProviders = useMemo(() => {
    const query = normalizeForSearch(providerQuery.trim());
    const matchingProviders = query
      ? providers.filter((provider) => normalizeForSearch(provider.name).includes(query))
      : providers;

    // Selected services stay together at the top, newest selection first.
    return [...matchingProviders].sort((left, right) => {
      const leftIndex = providerIds.indexOf(left.id);
      const rightIndex = providerIds.indexOf(right.id);
      const leftSelected = leftIndex !== -1;
      const rightSelected = rightIndex !== -1;

      if (leftSelected !== rightSelected) {
        return leftSelected ? -1 : 1;
      }

      return leftSelected ? leftIndex - rightIndex : 0;
    });
  }, [providerIds, providerQuery, providers]);

  function toggleGenre(genre: string) {
    setGenres((current) =>
      current.includes(genre)
        ? current.filter((entry) => entry !== genre)
        : [...current, genre].slice(0, 6)
    );
  }

  function toggleProvider(providerId: number) {
    setProviderIds((current) =>
      current.includes(providerId)
        ? current.filter((entry) => entry !== providerId)
        : [providerId, ...current]
    );
  }

  async function saveGenres() {
    setIsSaving(true);
    setError(null);

    try {
      const nextProfile = await updateProfile({
        userId: profile.id,
        displayName: profile.display_name,
        username: profile.username,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        bannerUrl: profile.banner_url,
        gender: profile.gender,
        birthDate: profile.birth_date,
        favoriteGenres: genres,
        favoriteTitles: profile.favorite_titles,
        featuredCollections: profile.featured_collections,
        currentWatching: profile.current_watching,
        visibilitySettings: profile.visibility_settings
      });

      onProfileUpdated(nextProfile);
      setStep("providers");
    } catch {
      setError("No pudimos guardar tus gustos. Intentá de nuevo.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProviders() {
    setIsSaving(true);
    setError(null);

    try {
      await saveDiscoverFilters(profile.id, { providerIds, contentType: "all" });
      onComplete(profile);
    } catch {
      setError("No pudimos guardar tus plataformas. Intentá de nuevo.");
    } finally {
      setIsSaving(false);
    }
  }

  const isGenreStep = step === "genres";

  return (
    <div className="welcome-onboarding" role="presentation">
      <section className="welcome-onboarding__panel" role="dialog" aria-modal="true" aria-labelledby="welcome-onboarding-title">
        <div className="welcome-onboarding__content">
          <p className="section-eyebrow">Cinerian</p>
          <p className="welcome-onboarding__step">Paso {isGenreStep ? "1" : "2"} de 3</p>

          {isGenreStep ? (
            <>
              <h1 id="welcome-onboarding-title">¿Qué te gusta mirar?</h1>
              <p className="welcome-onboarding__intro">
                Elegí hasta 6 géneros para personalizar tus recomendaciones y contarle a otros qué te gusta.
              </p>
              <div className="welcome-onboarding__chips" aria-label="Géneros favoritos">
                {GENRE_OPTIONS.map((genre) => {
                  const isSelected = genres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      className={`welcome-onboarding__chip ${isSelected ? "is-selected" : ""}`}
                      aria-pressed={isSelected}
                      onClick={() => toggleGenre(genre)}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h1 id="welcome-onboarding-title">¿Dónde ves tus series y películas?</h1>
              <p className="welcome-onboarding__intro">
                Elegí tus servicios para mostrarte contenido disponible en ellos.
              </p>
              <label className="welcome-onboarding__search">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
                <input
                  type="search"
                  value={providerQuery}
                  onChange={(event) => setProviderQuery(event.target.value)}
                  placeholder="Buscar plataforma..."
                  autoComplete="off"
                />
              </label>
              <div className="welcome-onboarding__providers" aria-label="Plataformas de streaming">
                {isLoadingProviders ? <p>Cargando plataformas...</p> : null}
                {!isLoadingProviders && visibleProviders.length === 0 ? (
                  <p>No encontramos plataformas con ese nombre.</p>
                ) : null}
                {visibleProviders.map((provider) => {
                  const isSelected = providerIds.includes(provider.id);
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className={`welcome-onboarding__provider ${isSelected ? "is-selected" : ""}`}
                      aria-pressed={isSelected}
                      onClick={() => toggleProvider(provider.id)}
                    >
                      {provider.logoUrl ? <img src={provider.logoUrl} alt="" /> : <span className="welcome-onboarding__provider-logo" />}
                      <span>{provider.name}</span>
                      <b aria-hidden="true">{isSelected ? "✓" : "+"}</b>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {error ? <p className="welcome-onboarding__error">{error}</p> : null}
        </div>

        <footer className="welcome-onboarding__footer">
          <div className="welcome-onboarding__progress" aria-label={`Paso ${isGenreStep ? "1" : "2"} de 3`}>
            <span className="is-active" />
            <span className={!isGenreStep ? "is-active" : ""} />
            <span />
          </div>
          <button
            type="button"
            className="welcome-onboarding__continue"
            disabled={isSaving || (!isGenreStep && isLoadingProviders)}
            onClick={() => void (isGenreStep ? saveGenres() : saveProviders())}
          >
            {isSaving ? "Guardando..." : "Continuar"}
            <span aria-hidden="true">→</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
