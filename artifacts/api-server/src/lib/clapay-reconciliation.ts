/**
 * Clapay Reconciliation Job
 *
 * Background job that periodically checks pending Clapay transactions.
 * If a webhook was missed (network error, server restart, etc.), this job
 * queries the Clapay API for the transaction status and credits the user
 * balance if the payment was actually completed.
 *
 * Runs every 5 minutes. Only processes transactions pending for > 2 minutes
 * (to avoid racing with in-flight webhooks) and < 24 hours (stale cleanup).
 *
 * Lookup order (per transaction):
 *  1. By stored Clapay signature — official endpoint (primary)
 *  2. By our transaction_id — undocumented fallback
 *
 * CRITICAL: Always credit tx.amount (XOF), never the API-returned amount
 * (which is in the LOCAL currency and may differ after FX conversion).
 */

import { and, eq, gte, lt, sql, like } from "drizzle-orm";
import { db, transactionsTable, usersTable, notificationsTable } from "@workspace/db";
import { logger } from "./logger";
import {
  ClapayClient,
  extractClapayTransactionId,
  isClapayDeposit,
  parseClapayMeta,
  CLAPAY_TERMINAL_FAILURE,
  mapClapayStatusToDb,
} from "./clapay";
import { broadcastNotification } from "../routes/notifications";

const RECONCILE_INTERVAL_MS  = 5 * 60 * 1000;   // every 5 minutes
const MIN_AGE_MS              = 2 * 60 * 1000;    // skip transactions < 2min old (webhook may still arrive)
const MAX_AGE_MS              = 24 * 60 * 60 * 1000; // skip transactions > 24h old (too stale)

/* ── Load Clapay client from env or DB (mirrors wallet.ts logic) ── */
async function getClapayClientForReconcile(): Promise<ClapayClient | null> {
  let token = process.env.CLAPAY_API_TOKEN ?? null;
  let baseUrl = process.env.CLAPAY_BASE_URL ?? null;

  if (!token) {
    try {
      const { systemSettingsTable } = await import("@workspace/db");
      const rows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "clapay_api_token")).limit(1);
      token = rows[0]?.value?.trim() || null;

      if (token && !baseUrl) {
        const urlRows = await db.select().from(systemSettingsTable)
          .where(eq(systemSettingsTable.key, "clapay_base_url")).limit(1);
        baseUrl = urlRows[0]?.value?.trim() || null;
      }
    } catch { /* non-fatal */ }
  }

  if (!token) return null;
  return new ClapayClient(token, baseUrl ?? undefined);
}

async function reconcilePendingClapayTransactions(): Promise<void> {
  const clapay = await getClapayClientForReconcile();
  if (!clapay) {
    return; // Clapay not configured — skip silently
  }

  const now = new Date();
  const minCreatedAt = new Date(now.getTime() - MAX_AGE_MS);
  const maxCreatedAt = new Date(now.getTime() - MIN_AGE_MS);

  /* Find pending Clapay transactions in the age window.
   * Filter at SQL level using LIKE 'clapay:%' to avoid loading non-Clapay rows. */
  const clapayPending = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.status, "pending"),
        eq(transactionsTable.type, "recharge"),
        like(transactionsTable.externalDepositId, "clapay:%"),
        gte(transactionsTable.createdAt, minCreatedAt),
        lt(transactionsTable.createdAt, maxCreatedAt),
      ),
    )
    .limit(50);

  if (clapayPending.length === 0) return;

  logger.info({ count: clapayPending.length }, "[Clapay Reconcile] Checking pending transactions");

  for (const tx of clapayPending) {
    try {
      const transactionId = extractClapayTransactionId(tx.externalDepositId!);

      /* ── Step 1: Try lookup by stored Clapay signature (OFFICIAL endpoint) ── */
      const meta = parseClapayMeta(tx.gatewayMeta);
      let statusResult = meta?.clapaySignature
        ? await clapay.getTransactionStatus(meta.clapaySignature)
        : null;

      if (statusResult) {
        logger.debug({ transactionId, signature: meta?.clapaySignature }, "[Clapay Reconcile] Status fetched via signature (official)");
      }

      /* ── Step 2: Fallback — lookup by our transaction_id (undocumented) ── */
      if (!statusResult) {
        statusResult = await clapay.getTransactionByExternalId(transactionId);
        if (statusResult) {
          logger.debug({ transactionId }, "[Clapay Reconcile] Status fetched via transaction_id (fallback)");
        }
      }

      if (!statusResult) {
        logger.debug({ transactionId }, "[Clapay Reconcile] No status result — will retry next cycle");
        continue;
      }

      const rawStatus = statusResult.status?.toUpperCase() ?? "";
      const dbStatus = mapClapayStatusToDb(rawStatus);

      if (dbStatus === "completed") {
        /* ALWAYS use stored XOF amount — never the API-returned amount
         * (which is in LOCAL currency and may differ after FX conversion). */
        const creditAmount = tx.amount;

        /* Atomic transition pending → completed (guards against race with webhook) */
        const [justCompleted] = await db
          .update(transactionsTable)
          .set({ status: "completed" })
          .where(and(
            eq(transactionsTable.id, tx.id),
            eq(transactionsTable.status, "pending"),
          ))
          .returning();

        if (!justCompleted) {
          logger.info({ transactionId }, "[Clapay Reconcile] Already processed by webhook — skipping");
          continue;
        }

        await db
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${creditAmount}` })
          .where(eq(usersTable.id, tx.userId));

        logger.info(
          { transactionId, userId: tx.userId, creditAmount },
          "[Clapay Reconcile] Deposit COMPLETED via reconciliation — balance credited ✓",
        );

        /* Push notification */
        try {
          const [notif] = await db.insert(notificationsTable).values({
            userId: tx.userId,
            title: "💰 Solde rechargé",
            body: `Votre solde a été crédité de ${creditAmount.toLocaleString("fr-FR")} FCFA avec succès.`,
            type: "deposit",
            icon: "wallet",
            link: "/wallet",
            metadata: { amount: creditAmount, depositId: transactionId, gateway: "clapay", source: "reconciliation" },
          }).returning();
          if (notif) broadcastNotification(notif);
        } catch { /* non-critical */ }

      } else if (dbStatus === "failed") {
        /* Handles: FAILED, CANCELLED, REJECTED, TIMEOUT, EXPIRED */
        const [updated] = await db
          .update(transactionsTable)
          .set({ status: "failed" })
          .where(and(
            eq(transactionsTable.id, tx.id),
            eq(transactionsTable.status, "pending"),
          ))
          .returning();

        if (updated) {
          logger.warn(
            { transactionId, clapayStatus: rawStatus },
            "[Clapay Reconcile] Payment terminal failure — transaction marked failed",
          );
        }
      } else {
        /* Still PENDING / PROCESSING — retry next cycle */
        logger.debug(
          { transactionId, clapayStatus: rawStatus },
          "[Clapay Reconcile] Status still pending/processing — will retry",
        );
      }
    } catch (e) {
      logger.warn(
        { error: (e as Error).message, txId: tx.id },
        "[Clapay Reconcile] Error checking transaction",
      );
    }
  }
}

let reconcileTimer: NodeJS.Timeout | null = null;

export function startClapayReconciliation(): void {
  if (reconcileTimer) return; // already running
  logger.info(
    { intervalMs: RECONCILE_INTERVAL_MS },
    "[Clapay Reconcile] Background reconciliation started",
  );
  reconcileTimer = setInterval(() => {
    reconcilePendingClapayTransactions().catch(e =>
      logger.error({ error: (e as Error).message }, "[Clapay Reconcile] Unhandled error"),
    );
  }, RECONCILE_INTERVAL_MS);

  /* Also run once at startup after a short delay */
  setTimeout(() => {
    reconcilePendingClapayTransactions().catch(e =>
      logger.error({ error: (e as Error).message }, "[Clapay Reconcile] Startup run error"),
    );
  }, 30_000);
}

export function stopClapayReconciliation(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}
