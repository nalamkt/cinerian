function slugifyUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_.-]/g, "");
}

export function buildSharedProfilePath(username: string) {
  return `/u/${slugifyUsername(username)}`;
}

export function buildSharedProfileUrl(username: string) {
  if (typeof window === "undefined") {
    return buildSharedProfilePath(username);
  }

  return new URL(buildSharedProfilePath(username), window.location.origin).toString();
}

export function canUseNativeShare() {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  // El share sheet nativo del SO es el patrón esperado en touch (mobile/tablet).
  // En desktop suele quedarse colgado o no mostrar nada, asi que ahi preferimos
  // copiar el link directo al portapapeles.
  return window.matchMedia("(pointer: coarse)").matches;
}

export async function shareProfileLink(username: string): Promise<"shared" | "copied" | "cancelled"> {
  const url = buildSharedProfileUrl(username);
  const text = `Mira este perfil en Cinerian: @${username}`;

  if (canUseNativeShare()) {
    try {
      await navigator.share({
        title: `@${username} en Cinerian`,
        text,
        url
      });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled";
      }
      // Si el share nativo falla por otra razon, seguimos abajo e intentamos copiar.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return "copied";
  }

  if (typeof window !== "undefined") {
    window.prompt("Copia este link", url);
  }

  return "copied";
}

export function parseSharedProfilePath(pathname: string) {
  const match = pathname.match(/^\/u\/([a-z0-9_.-]+)\/?$/i);
  if (!match) {
    return null;
  }

  return {
    username: match[1]
  };
}
