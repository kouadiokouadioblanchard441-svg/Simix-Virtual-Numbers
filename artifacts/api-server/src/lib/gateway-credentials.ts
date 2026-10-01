/**
 * Gateway credential resolution — PawaPay and legacy/global Clapay.
 *
 * This is the single resolver for global/legacy credentials. Dynamic Clapay
 * payments use resolveClapayGatewayCredentials so a persisted gateway row
 * identity cannot silently fall back to another credential source.
 *
 * Global/legacy resolver priority order:
 *   1. Route-specific override (payment_gateways.apiKey/apiUrl) — used by
 *      PawaPay routes and legacy callers that explicitly request an override.
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
import { db, paymentGatewaysTable, systemSettingsTable } from "@workspace/db";

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

/**
 * Resolve credentials from the exact non-secret gateway identity persisted
 * on a new dynamic-route deposit. Do not fall back to another gateway's
 * credentials when that selected gateway has been removed or disabled.
 */
export async function resolveClapayGatewayCredentials(
  gatewayId: string,
): Promise<ClapayCredentials | null> {
  const [gateway] = await db.select({
    id: paymentGatewaysTable.id,
    slug: paymentGatewaysTable.slug,
    apiKey: paymentGatewaysTable.apiKey,
    apiUrl: paymentGatewaysTable.apiUrl,
    active: paymentGatewaysTable.active,
  }).from(paymentGatewaysTable)
    .where(eq(paymentGatewaysTable.id, gatewayId))
    .limit(1);

  if (!gateway || !gateway.active || !gateway.slug.toLowerCase().includes("clapay") || !gateway.apiKey?.trim()) {
    return null;
  }
  return { token: gateway.apiKey.trim(), baseUrl: gateway.apiUrl?.trim() || undefined };
}
