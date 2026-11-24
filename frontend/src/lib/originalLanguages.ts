export const FEATURED_ORIGINAL_LANGUAGES = ["en", "es", "fr", "it", "de", "pt", "ko", "ja", "zh", "hi"];
export const PRIMARY_ORIGINAL_LANGUAGES = FEATURED_ORIGINAL_LANGUAGES.slice(0, 8);

export function visibleOriginalLanguages(
  catalog: Array<{ id: string; label: string }>,
  selected: string[],
  expanded: boolean
): Array<{ id: string; label: string }> {
  const known = new Set(catalog.map((language) => language.id));
  const available = [
    ...catalog,
    ...selected.filter((id) => !known.has(id)).map((id) => ({ id, label: originalLanguageLabel(id) }))
  ];
  if (expanded) return available;
  const visible = new Set([...PRIMARY_ORIGINAL_LANGUAGES, ...selected]);
  return available.filter((language) => visible.has(language.id));
}

export function normalizeOriginalLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return /^[a-z]{2}$/.test(code) ? code : null;
}

export function matchesOriginalLanguages(originalLanguage: unknown, selected: string[]): boolean {
  if (!selected.length) return true;
  const code = normalizeOriginalLanguage(originalLanguage);
  return Boolean(code && selected.includes(code));
}

export function originalLanguageLabel(code: string): string {
  try {
    return new Intl.DisplayNames(["es"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
