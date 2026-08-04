import type { MediaType } from "../types";

type ShareableMediaReference = {
  id: number;
  mediaType: MediaType;
  title: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function buildSharedMediaPath(item: { id: number; mediaType: MediaType; title: string }) {
  return `/share/${item.mediaType}/${item.id}-${slugify(item.title)}`;
}

export function buildSharedMediaUrl(item: { id: number; mediaType: MediaType; title: string }) {
  if (typeof window === "undefined") {
    return buildSharedMediaPath(item);
  }

  return new URL(buildSharedMediaPath(item), window.location.origin).toString();
}

export async function copyMediaLink(item: ShareableMediaReference) {
  const url = buildSharedMediaUrl(item);

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return url;
  }

  if (typeof window !== "undefined") {
    window.prompt("Copiá este link", url);
  }

  return url;
}

export function parseSharedMediaPath(pathname: string) {
  const match = pathname.match(/^\/share\/(movie|tv)\/([^/]+)\/?$/);
  if (!match) {
    return null;
  }

  const idMatch = match[2].match(/^(\d+)/);
  if (!idMatch) {
    return null;
  }

  return {
    mediaType: match[1] as MediaType,
    id: Number(idMatch[1])
  };
}

export async function shareMediaLink(item: ShareableMediaReference): Promise<"shared" | "copied"> {
  const url = buildSharedMediaUrl(item);
  const text = `Mira ${item.title} en Cinerian`;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: item.title,
        text,
        url
      });
      return "shared";
    } catch {
      return "copied";
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return "copied";
  }

  if (typeof window !== "undefined") {
    window.prompt("Copiá este link", url);
  }

  return "copied";
}
