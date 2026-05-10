/**
 * Seed / sync API providers from environment variables.
 * Called once at server startup — idempotent (upsert by slug).
 *
 * Supported env vars:
 *   FIVESIM_API_KEY  — activates the 5sim provider automatically
 */

import { db, apiProvidersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

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
        markup: 20,
      });
      logger.info("[seed-providers] 5sim provider created from FIVESIM_API_KEY env var");
    }
  } catch (err) {
    logger.error({ err }, "[seed-providers] Failed to seed 5sim provider — continuing startup");
  }
}
