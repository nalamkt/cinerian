const PRODUCTION_ORIGIN = "https://cinerian.app";

export function authRedirectUrl(location: Pick<Location, "origin" | "protocol" | "hostname"> | null): string {
  if (!location) return PRODUCTION_ORIGIN;

  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol === "https:" || (isLocal && location.protocol === "http:")) {
    return location.origin;
  }

  return PRODUCTION_ORIGIN;
}
