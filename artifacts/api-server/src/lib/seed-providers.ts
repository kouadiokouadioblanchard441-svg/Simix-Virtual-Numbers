/**
 * Seed / sync API providers from environment variables.
 * Called once at server startup — idempotent (upsert by slug).
 *
 * Supported env vars:
 *   FIVESIM_API_KEY  — activates the 5sim provider automatically
 */

import { db, apiProvidersTable, emailProvidersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { decrypt, encrypt } from "./email-router/crypto";

export async function seedProvidersFromEnv(): Promise<void> {
  const fivesimKey = process.env.FIVESIM_API_KEY;

  if (!fivesimKey) {
    logger.debug("[seed-providers] FIVESIM_API_KEY not set — skipping 5sim provider seed");
    return;
  }

  try {
    const [existing] = await db
      .select({ id: apiProvidersTable.id, apiKey: apiProvidersTable.apiKey, active: apiProvidersTable.active })
      .from(apiProvidersTable)
      .where(eq(apiProvidersTable.slug, "5sim"))
      .limit(1);

    if (existing) {
      if (existing.apiKey === fivesimKey && existing.active) {
        logger.info("[seed-providers] 5sim provider already configured and active — nothing to do");
        return;
      }
      await db
        .update(apiProvidersTable)
        .set({ apiKey: fivesimKey, active: true })
        .where(eq(apiProvidersTable.id, existing.id));
      logger.info("[seed-providers] 5sim provider updated from FIVESIM_API_KEY env var");
    } else {
      await db.insert(apiProvidersTable).values({
        name: "5sim",
        slug: "5sim",
        apiKey: fivesimKey,
        baseUrl: "https://5sim.net/v1",
        active: true,
        priority: 1,
        markup: 400,
      });
      logger.info("[seed-providers] 5sim provider created from FIVESIM_API_KEY env var");
    }
  } catch (err) {
    logger.error({ err }, "[seed-providers] Failed to seed 5sim provider — continuing startup");
  }
}

/**
 * Bootstrap transactional email providers from Plesk environment variables.
 *
 * The database is the source of truth for provider credentials. Environment
 * variables are bootstrap-only: they may create a missing provider or fill a
 * provider row that has no credential, but they must never overwrite an
 * existing database credential. This prevents Replit/Plesk values from
 * fighting each other when both environments share the database.
 */
export async function seedEmailProvidersFromEnv(): Promise<void> {
  const providers = [
    // Resend est le fournisseur actuellement préféré. Ces priorités ne
    // remplacent jamais un réglage déjà enregistré par l'administrateur.
    { slug: "resend", name: "Resend", envKey: "RESEND_API_KEY", priority: 1 },
    { slug: "brevo", name: "Brevo", envKey: "BREVO_API_KEY", priority: 2 },
  ] as const;

  for (const provider of providers) {
    const apiKey = process.env[provider.envKey]?.trim();
    if (!apiKey) {
      logger.debug({ provider: provider.slug }, "[seed-email-providers] API key not set — skipping provider bootstrap");
      continue;
    }

    try {
      const [existing] = await db
        .select({
          id: emailProvidersTable.id,
          apiKeyEnc: emailProvidersTable.apiKeyEnc,
        })
        .from(emailProvidersTable)
        .where(eq(emailProvidersTable.slug, provider.slug))
        .limit(1);

      if (existing) {
        if (existing.apiKeyEnc) {
          const existingKey = decrypt(existing.apiKeyEnc).trim();
          if (existingKey) {
            logger.info({ provider: provider.slug }, "[seed-email-providers] Database credential is authoritative — nothing to do");
          } else {
            logger.error(
              { provider: provider.slug },
              "[seed-email-providers] Database credential is not decryptable — replace it from the admin panel; environment value will not overwrite it",
            );
          }
          continue;
        }
        await db
          .update(emailProvidersTable)
          .set({ apiKeyEnc: encrypt(apiKey) })
          .where(eq(emailProvidersTable.id, existing.id));
        logger.info({ provider: provider.slug }, "[seed-email-providers] Missing database credential restored from bootstrap environment");
        continue;
      }

      await db.insert(emailProvidersTable).values({
        name: provider.name,
        slug: provider.slug,
        priority: provider.priority,
        active: true,
        apiKeyEnc: encrypt(apiKey),
      });
      logger.info({ provider: provider.slug }, "[seed-email-providers] Provider created from environment");
    } catch (err) {
      logger.error({ err, provider: provider.slug }, "[seed-email-providers] Failed to bootstrap provider — continuing startup");
    }
  }
}
