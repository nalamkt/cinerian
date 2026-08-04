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

export async function shareProfileLink(username: string): Promise<"shared" | "copied"> {
  const url = buildSharedProfileUrl(username);
  const text = `Mira este perfil en Cinerian: @${username}`;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: `@${username} en Cinerian`,
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
