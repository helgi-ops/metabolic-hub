// Absolute base URL for auth-email redirect links (signup confirm, password
// reset). It MUST be a real, reachable origin: in some in-app / email browsers
// `window.location.origin` is the string "null", which produced broken
// "null is unreachable" confirmation links. Prefer a valid current origin
// (covers localhost in dev and the live domain in prod), then an explicit
// override, then the production fallback.

const FALLBACK = "https://www.metabolic.is";

export function siteUrl(): string {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin && origin !== "null" && /^https?:\/\//.test(origin)) {
      return origin.replace(/\/$/, "");
    }
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return FALLBACK;
}
