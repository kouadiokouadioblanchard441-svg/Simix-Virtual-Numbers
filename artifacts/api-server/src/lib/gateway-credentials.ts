/**
 * Unified gateway credential resolution — PawaPay & Clapay.
 *
 * This is the SINGLE source of truth for how API tokens/URLs are resolved,
 * used by every code path that talks to PawaPay or Clapay (legacy wallet
 * routes, the dynamic payment router, both reconciliation jobs, and the
 * admin "test connection" endpoint).
 *
 * Priority order (documented once, applied everywhere):
 *   1. Route-specific override (payment_gateways.apiKey/apiUrl) — only
 *      relevant when called from the dynamic payment router with a
 *      resolved route for a specific country/operator.
 *   2. system_settings in the database — this is what the admin panel
 *      writes to (Paramètres → pawapay_api_token / clapay_api_token).
 *      This is the authoritative, live-rotatable source.
 *   3. Environment variable — last-resort fallback, only used when
 *      nothing has been configured in the database yet (e.g. a brand
 *      new deployment before an admin visits the settings page).
 *
 * IMPORTANT: The database always wins over the environment variable.
 * This app can run on multiple hosts sharing the same database (e.g. a
 * Replit dev environment and a separate Plesk production server) — if a
 * host-local env var were allowed to override the DB, the two hosts
 * could silently use different credentials for the same gateway, making
 * bugs very hard to diagnose. Keep the DB authoritative.
 */
import { eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";

export interface PawaPayCredentials {
  token: string;
  env: "sandbox" | "production";
}

export interface ClapayCredentials {
  token: string;
  baseUrl?: string;
}

export async function resolvePawaPayCredentials(
  routeApiKey?: string | null,
): Promise<PawaPayCredentials | null> {
  let token: string | null = routeApiKey?.trim() || null;
  let env: "sandbox" | "production" | null = null;

  if (!token) {
    try {
      const rows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "pawapay_api_token")).limit(1);
      token = rows[0]?.value?.trim() || null;
    } catch { /* non-fatal — fall through to env */ }
  }

  try {
    const envRows = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pawapay_env")).limit(1);
    const dbEnv = envRows[0]?.value?.trim().toLowerCase();
    if (dbEnv === "sandbox" || dbEnv === "production") env = dbEnv;
  } catch { /* non-fatal */ }

  if (!token) token = process.env.PAWAPAY_API_TOKEN?.trim() || null;
  if (!env) {
    const rawEnvVar = process.env.PAWAPAY_ENV?.trim().toLowerCase();
    env = rawEnvVar === "production" ? "production" : "sandbox";
  }

  if (!token) return null;
  return { token, env };
}

export async function resolveClapayCredentials(
  routeApiKey?: string | null,
  routeApiUrl?: string | null,
): Promise<ClapayCredentials | null> {
  let token: string | null = routeApiKey?.trim() || null;
  let baseUrl: string | null = routeApiUrl?.trim() || null;

  if (!token) {
    try {
      const rows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "clapay_api_token")).limit(1);
      token = rows[0]?.value?.trim() || null;
    } catch { /* non-fatal — fall through to env */ }
  }

  if (!baseUrl) {
    try {
      const urlRows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "clapay_base_url")).limit(1);
      baseUrl = urlRows[0]?.value?.trim() || null;
    } catch { /* non-fatal */ }
  }

  if (!token) token = process.env.CLAPAY_API_TOKEN?.trim() || null;
  if (!baseUrl) baseUrl = process.env.CLAPAY_BASE_URL?.trim() || null;

  if (!token) return null;
  return { token, baseUrl: baseUrl ?? undefined };
}
