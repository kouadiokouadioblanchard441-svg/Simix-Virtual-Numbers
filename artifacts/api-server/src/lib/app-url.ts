/**
 * Returns the public URL of the app (e.g. "https://simix.site").
 * Priority:
 *   1. APP_URL environment variable (set in Plesk or .env)
 *   2. Fallback: "https://simix.site"
 *
 * Used for email links, OAuth redirects, etc.
 */
export function getAppUrl(): string {
  const url = process.env["APP_URL"];
  if (url) return url.replace(/\/$/, ""); // strip trailing slash
  return "https://simix.site";
}
