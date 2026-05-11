import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import app from "./app";
import { db } from "@workspace/db";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  /* ── Auto-migrate: apply any pending SQL migrations before boot ──
   * drizzle-orm migrator tracks applied migrations in __drizzle_migrations.
   * Fresh DB  → creates all tables.
   * Existing DB → only applies new migrations, skips already-applied ones.
   * ───────────────────────────────────────────────────────────────── */
  const currentDir = (globalThis as { __dirname?: string }).__dirname ?? __dirname;
  const migrationsFolder = path.join(currentDir, "migrations");

  try {
    logger.info({ migrationsFolder }, "[startup] Running database migrations…");
    await migrate(db, { migrationsFolder });
    logger.info("[startup] Database migrations applied ✓");
  } catch (err) {
    /* Non-fatal: tables may already exist (e.g. after drizzle-kit push).
     * Log and continue — app works correctly with existing schema. */
    logger.warn({ err }, "[startup] Migration skipped (schema already up to date)");
  }

  /* ── Start HTTP server ─────────────────────────────────────────── */
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

start().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
