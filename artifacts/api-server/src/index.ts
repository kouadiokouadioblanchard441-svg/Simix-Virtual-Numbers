import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import app from "./app";
import { db, systemSettingsTable } from "@workspace/db";
import { logger } from "./lib/logger";
import { startFiveSimPoller } from "./lib/fivesim-poller";
import { getEmailManager } from "./lib/email-router";
import { startFiveSimSyncScheduler, syncFiveSimCountries, syncFiveSimProducts } from "./lib/fivesim-sync";
import { startClapayReconciliation } from "./lib/clapay-reconciliation";
import { startPawaPayReconciliation } from "./lib/pawapay-reconciliation";
import { seedPaymentMethods } from "./lib/seed-payment-methods";
import { seedProvidersFromEnv } from "./lib/seed-providers";
import { seedRoutingData } from "./lib/seed-routing";
import { seedCountryPaymentConfigs } from "./lib/seed-country-payment-configs";
import { setAppUrl, getAppUrl } from "./lib/app-url";
import { electLeaderAndRun } from "./lib/leader-lock";
import { eq } from "drizzle-orm";

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
     * Common case: constraint/table already exists from a previous push.
     * Log at info level and continue — app works correctly with existing schema. */
    const msg = (err as Error)?.message ?? "";
    const isAlreadyExists = msg.includes("already exists") || msg.includes("duplicate");
    if (isAlreadyExists) {
      logger.info("[startup] Schema already up to date — no new migrations needed");
    } else {
      logger.warn({ err }, "[startup] Migration skipped (schema already up to date)");
    }
  }

  /* ── Preload app_url from DB (priority: env var > DB > hardcoded) ──
   * Must happen before any request is served so CORS and emails have
   * the correct URL from the very first hit.                          */
  try {
    const [row] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "app_url"))
      .limit(1);

    if (row?.value) {
      setAppUrl(row.value);
      logger.info({ url: getAppUrl() }, "[startup] app_url loaded from DB ✓");
    } else {
      /* Seed the default into DB so it's visible and editable in admin panel */
      const defaultUrl = process.env["APP_URL"] ?? "https://simix.site";
      await db
        .insert(systemSettingsTable)
        .values({ key: "app_url", value: defaultUrl, description: "URL publique de l'application (ex: https://simix.site)" })
        .onConflictDoNothing();
      setAppUrl(defaultUrl);
      logger.info({ url: defaultUrl }, "[startup] app_url seeded in DB ✓");
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[startup] app_url DB load failed — using env/default");
  }

  /* ── Seed reference data AFTER migrations complete ─────────────── */
  void seedPaymentMethods();
  void seedCountryPaymentConfigs();
  void seedRoutingData();

  /* ── Ce process tourne-t-il dans l'espace de développement Replit ? ──
   * Simix est hébergé uniquement sur Plesk (production) — Replit n'est
   * qu'un environnement de développement/preview qui peut, en cours de
   * travail, pointer sur la MÊME base Supabase que la production (pour
   * tester avec des vraies données). Sans ce garde-fou, ce process
   * concourrait pour le leader-lock (voir lib/leader-lock.ts) et pourrait
   * se mettre à exécuter les workers de fond de production (envoi de
   * vrais emails, vrais achats 5sim, vraie réconciliation de paiements)
   * à la place — ou en concurrence avec — le vrai serveur Plesk.
   * REPL_ID / REPLIT_DEV_DOMAIN ne sont définis que sur Replit ; le
   * serveur Plesk de production ne les a jamais. */
  const isReplitDevEnvironment = Boolean(process.env["REPL_ID"] || process.env["REPLIT_DEV_DOMAIN"]);

  if (isReplitDevEnvironment) {
    logger.warn(
      "[startup] Environnement Replit détecté — workers de fond (5sim, emails, réconciliation) désactivés pour éviter tout conflit avec le serveur de production Plesk"
    );
  } else {
    void seedProvidersFromEnv().then(() => {
      /* ── Élection de leader ──────────────────────────────────────
       * Plusieurs processus de production (ex: redémarrage pm2 qui
       * chevauche l'ancien processus) peuvent tourner brièvement contre
       * la même base. Seul le leader élu démarre les workers périodiques
       * — évite les doubles envois/remboursements. */
      electLeaderAndRun(() => {
        startFiveSimPoller();
        startFiveSimSyncScheduler();
        startClapayReconciliation();
        startPawaPayReconciliation();
        getEmailManager().startBackgroundWorkers();

        void (async () => {
          try {
            const result = await syncFiveSimCountries();
            logger.info({ added: result.added, updated: result.updated, total: result.total }, "[startup] 5sim countries synced");
          } catch (e) {
            logger.warn({ err: (e as Error).message }, "[startup] 5sim countries sync skipped");
          }

          try {
            const result = await syncFiveSimProducts();
            logger.info({ added: result.added, updated: result.updated, total: result.total }, "[startup] 5sim products synced");
          } catch (e) {
            logger.warn({ err: (e as Error).message }, "[startup] 5sim products sync skipped");
          }
        })();
      });
    });
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
