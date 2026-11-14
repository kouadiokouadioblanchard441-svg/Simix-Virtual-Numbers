/**
 * Gateway credential resolution.
 *
 * PawaPay and Clapay credentials are deliberately environment-only: production
 * secrets are managed in Plesk and must never be copied into shared database
 * rows. Non-secret settings such as API base URLs may still come from the
 * selected route or system settings.
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

export async function resolvePawaPayCredentials(): Promise<PawaPayCredentials | null> {
  const token = process.env.PAWAPAY_API_TOKEN?.trim() || null;
  const rawEnv = process.env.PAWAPAY_ENV?.trim().toLowerCase();
  const env: "sandbox" | "production" = rawEnv === "production" ? "production" : "sandbox";
  if (!token) return null;
  return { token, env };
}

export async function resolveClapayCredentials(
  routeApiUrl?: string | null,
): Promise<ClapayCredentials | null> {
  const token = process.env.CLAPAY_API_TOKEN?.trim() || null;
  if (!token) return null;
  let baseUrl: string | null = routeApiUrl?.trim() || null;

  if (!baseUrl) {
    try {
      const urlRows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "clapay_base_url")).limit(1);
      baseUrl = urlRows[0]?.value?.trim() || null;
    } catch { /* non-fatal */ }
  }

  if (!baseUrl) baseUrl = process.env.CLAPAY_BASE_URL?.trim() || null;

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
    apiUrl: paymentGatewaysTable.apiUrl,
    active: paymentGatewaysTable.active,
  }).from(paymentGatewaysTable)
    .where(eq(paymentGatewaysTable.id, gatewayId))
    .limit(1);

  if (!gateway || !gateway.active || !gateway.slug.toLowerCase().includes("clapay")) {
    return null;
  }
  return resolveClapayCredentials(gateway.apiUrl);
}
