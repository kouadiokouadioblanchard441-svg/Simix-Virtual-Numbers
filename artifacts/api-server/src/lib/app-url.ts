/**
 * Returns the public URL of the app (e.g. "https://simix.site").
 *
 * Priority:
 *   1. APP_URL environment variable (set in Plesk / .env / Replit userenv)
 *   2. Value preloaded from system_settings.app_url at startup (via setAppUrl)
 *   3. Hardcoded fallback: "https://simix.site"
 *
 * setAppUrl() is called once during server startup after the DB is ready.
 * clearAppUrlCache() is called by the admin settings route when app_url is updated.
 */

let _dbUrl: string | null = null;

/**
 * Called at startup after reading system_settings.app_url from the DB.
 * Also called by the admin settings route when app_url is changed live.
 */
export function setAppUrl(url: string): void {
  _dbUrl = url.replace(/\/$/, "");
}

/** Called when admin updates settings so the new URL takes effect immediately. */
export function clearAppUrlCache(): void {
  _dbUrl = null;
}

/** Synchronous — safe to call anywhere. */
export function getAppUrl(): string {
  const env = process.env["APP_URL"];
  if (env) return env.replace(/\/$/, "");
  if (_dbUrl) return _dbUrl;
  return "https://simix.site";
}
