export function canonicalDestination(requestURL: string, configuredOrigin: string | undefined, production: boolean): URL | null {
  if (!production || !configuredOrigin) return null;

  try {
    const origin = new URL(configuredOrigin);
    const request = new URL(requestURL);

    if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/"
      || request.origin === origin.origin) return null;

    origin.pathname = request.pathname;
    origin.search = request.search;

    return origin;
  } catch {
    return null;
  }
}
import "server-only";

export function configuredCanonicalDestination(requestURL: string) {
  return canonicalDestination(requestURL, process.env.BETTER_AUTH_URL, process.env.VERCEL_ENV === "production");
}
