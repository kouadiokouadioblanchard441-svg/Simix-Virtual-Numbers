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
 * Bootstrap the transactional email provider from Plesk environment variables.
 *
 * Plesk owns the runtime secret, while the email router reads encrypted
 * provider credentials from the shared database. Only a missing or
 * undecryptable DB key is repaired here; a valid admin-configured key and
 * active/priority settings are never overwritten on restart.
 */
export async function seedEmailProvidersFromEnv(): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();

  if (!resendKey) {
    logger.debug("[seed-email-providers] RESEND_API_KEY not set — skipping email provider bootstrap");
    return;
  }

  try {
    const [existing] = await db
      .select({
        id: emailProvidersTable.id,
        apiKeyEnc: emailProvidersTable.apiKeyEnc,
      })
      .from(emailProvidersTable)
      .where(eq(emailProvidersTable.slug, "resend"))
      .limit(1);

    if (existing) {
      const existingKey = existing.apiKeyEnc ? decrypt(existing.apiKeyEnc) : "";
      if (existingKey) {
        logger.info("[seed-email-providers] Resend provider already has a usable key — nothing to do");
        return;
      }

      await db
        .update(emailProvidersTable)
        .set({ apiKeyEnc: encrypt(resendKey) })
        .where(eq(emailProvidersTable.id, existing.id));
      logger.info("[seed-email-providers] Missing Resend key restored from RESEND_API_KEY");
      return;
    }

    await db.insert(emailProvidersTable).values({
      name: "Resend",
      slug: "resend",
      priority: 1,
      active: true,
      apiKeyEnc: encrypt(resendKey),
    });
    logger.info("[seed-email-providers] Resend provider created from RESEND_API_KEY");
  } catch (err) {
    logger.error({ err }, "[seed-email-providers] Failed to bootstrap Resend — continuing startup");
  }
}
