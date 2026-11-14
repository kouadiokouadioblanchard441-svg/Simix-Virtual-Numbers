import { decrypt } from "./crypto";

export type ProviderApiKeySource = "environment" | "database" | "none";

export interface ResolvedProviderApiKey {
  apiKey: string | null;
  source: ProviderApiKeySource;
}

export function getProviderEnvironmentApiKey(slug: string): string | null {
  if (slug.toLowerCase() === "brevo") {
    return process.env.BREVO_API_KEY?.trim() || null;
  }
  return null;
}

/**
 * Prefer server environment credentials when configured. Keep the encrypted
 * database value as a compatibility fallback for other deployments.
 */
export function resolveProviderApiKey(
  slug: string,
  encryptedDatabaseKey?: string | null,
): ResolvedProviderApiKey {
  const environmentKey = getProviderEnvironmentApiKey(slug);
  if (environmentKey) return { apiKey: environmentKey, source: "environment" };

  const databaseKey = encryptedDatabaseKey ? decrypt(encryptedDatabaseKey).trim() : "";
  if (databaseKey) return { apiKey: databaseKey, source: "database" };
  return { apiKey: null, source: "none" };
}
