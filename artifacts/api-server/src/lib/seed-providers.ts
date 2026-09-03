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
 * Plesk owns the runtime secret, while the email router reads encrypted
 * provider credentials from the shared database. Only a missing or
 * undecryptable DB key is repaired here; valid admin-configured keys and
 * active/priority settings are never overwritten on restart.
 */
export async function seedEmailProvidersFromEnv(): Promise<void> {
  const providers = [
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
        const existingKey = existing.apiKeyEnc ? decrypt(existing.apiKeyEnc) : "";
        if (existingKey) {
          logger.info({ provider: provider.slug }, "[seed-email-providers] Provider already has a usable key — nothing to do");
          continue;
        }

        await db
          .update(emailProvidersTable)
          .set({ apiKeyEnc: encrypt(apiKey) })
          .where(eq(emailProvidersTable.id, existing.id));
        logger.info({ provider: provider.slug }, "[seed-email-providers] Missing provider key restored from environment");
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
