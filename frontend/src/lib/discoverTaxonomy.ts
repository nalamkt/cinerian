import type { MediaType } from "../types";

export type ProductionRegion = "us" | "europe" | "latin-america" | "south-korea" | "japan" | "china" | "india" | "rest";

const MOVIE_GENRES = [12, 14, 16, 18, 27, 28, 35, 36, 37, 53, 80, 99, 878, 9648, 10402, 10749, 10751, 10752, 10770];
const TV_GENRES = [16, 18, 35, 37, 80, 99, 9648, 10751, 10759, 10762, 10763, 10764, 10765, 10766, 10767, 10768];
const MOVIE_GENRE_SET = new Set(MOVIE_GENRES);
const TV_GENRE_SET = new Set(TV_GENRES);

const GENRE_LABELS: Record<number, string> = {
  12: "Aventura", 14: "Fantasía", 16: "Animación", 18: "Drama", 27: "Terror",
  28: "Acción", 35: "Comedia", 36: "Historia", 37: "Western", 53: "Suspenso",
  80: "Crimen", 99: "Documental", 878: "Ciencia ficción", 9648: "Misterio",
  10402: "Música", 10749: "Romance", 10751: "Familia", 10752: "Bélica",
  10759: "Acción y aventura", 10762: "Infantil", 10763: "Noticias", 10764: "Reality",
  10765: "Ciencia ficción y fantasía", 10766: "Telenovela", 10767: "Talk show",
  10768: "Guerra y política", 10770: "Película para TV"
};

export const DISCOVER_GENRES = [...new Set([...MOVIE_GENRES, ...TV_GENRES])]
  .map((id) => ({
    id,
    label: GENRE_LABELS[id],
    mediaTypes: [MOVIE_GENRE_SET.has(id) ? "movie" : null, TV_GENRE_SET.has(id) ? "tv" : null].filter((type): type is MediaType => type !== null)
  }))
  .sort((left, right) => left.label.localeCompare(right.label, "es"));

export function genreIdsForMedia(ids: number[], mediaType: MediaType): number[] {
  const supported = mediaType === "movie" ? MOVIE_GENRE_SET : TV_GENRE_SET;
  return [...new Set(ids)].filter((id) => supported.has(id));
}

const COUNTRIES: Record<Exclude<ProductionRegion, "rest">, string[]> = {
  us: ["US"],
  europe: ["AL", "AT", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LT", "LU", "LV", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "UA"],
  "latin-america": ["AR", "BO", "BR", "BZ", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "GY", "HN", "HT", "MX", "NI", "PA", "PE", "PR", "PY", "SR", "SV", "UY", "VE"],
  "south-korea": ["KR"],
  japan: ["JP"],
  china: ["CN"],
  india: ["IN"]
};

export const DISCOVER_REGIONS: Array<{ id: ProductionRegion; label: string }> = [
  { id: "us", label: "Estados Unidos" },
  { id: "europe", label: "Europa" },
  { id: "latin-america", label: "Latinoamérica" },
  { id: "south-korea", label: "Corea del Sur" },
  { id: "japan", label: "Japón" },
  { id: "china", label: "China" },
  { id: "india", label: "India" },
  { id: "rest", label: "Resto del mundo" }
];

const COUNTRY_REGIONS = new Map<string, ProductionRegion[]>();
for (const [region, countries] of Object.entries(COUNTRIES) as Array<[Exclude<ProductionRegion, "rest">, string[]]>) {
  for (const country of countries) COUNTRY_REGIONS.set(country, [...(COUNTRY_REGIONS.get(country) ?? []), region]);
}

export function matchesProductionRegions(countries: string[], selected: ProductionRegion[]): boolean {
  if (!selected.length) return true;
  return countries.some((country) => {
    const normalized = country.toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) return false;
    const regions = COUNTRY_REGIONS.get(normalized) ?? ["rest"];
    return regions.some((region) => selected.includes(region));
  });
}
