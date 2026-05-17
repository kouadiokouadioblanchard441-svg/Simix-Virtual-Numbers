/**
 * Clapay Reconciliation Job
 *
 * Background job that runs every 5 minutes to handle Clapay pending transactions.
 *
 * IMPORTANT — Clapay V3 does NOT provide a transaction status polling endpoint.
 * Payment confirmation is done exclusively via webhook callbacks (callback_url).
 *
 * What this job does:
 *  1. TIMEOUT CLEANUP — marks transactions pending for > FAIL_AFTER_MS as "failed".
 *     Clapay webhooks typically arrive within 2-3 minutes. If a transaction is still
 *     pending after FAIL_AFTER_MS, it's safe to assume it failed silently (user
 *     cancelled, timeout, network error, etc.).
 *  2. MERCHANT HEALTH CHECK — pings Clapay's balance endpoint to verify connectivity.
 *     Logs a warning if the API is unreachable.
 *
 * If you believe a specific payment was completed but not credited, check:
 *  a) The webhook endpoint: POST /api/wallet/clapay/webhook is publicly reachable
 *  b) The callback_url stored in system_settings (clapay_callback_url)
 *  c) The Clapay merchant dashboard for the transaction status
 *
 * CRITICAL: Always credit tx.amount (stored XOF/FCFA), never the API amount.
 */

import { and, eq, lt, sql, like } from "drizzle-orm";
import { db, transactionsTable, usersTable, notificationsTable, systemSettingsTable } from "@workspace/db";
import { logger } from "./logger";
import { ClapayClient, isClapayDeposit } from "./clapay";
import { broadcastNotification } from "../routes/notifications";

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;      // run every 5 minutes
const FAIL_AFTER_MS          = 2 * 60 * 60 * 1000; // mark as failed after 2 hours pending
const HEALTH_CHECK_COUNTRY   = "CI";               // country used for balance health check

/* ── Load Clapay client from env or DB ── */
async function getClapayClientForReconcile(): Promise<ClapayClient | null> {
  let token = process.env.CLAPAY_API_TOKEN ?? null;
  let baseUrl = process.env.CLAPAY_BASE_URL ?? null;

  if (!token) {
    try {
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
  if (!clapay) return; // Clapay not configured — skip silently

  const now = new Date();

  /* ── STEP 1: Timeout cleanup ─────────────────────────────────────────────
   * Mark Clapay deposits pending for > FAIL_AFTER_MS as failed.
   * Clapay webhooks arrive within minutes; anything older than 2h is stale.
   * We do NOT refund the user (no money was taken — the transaction never
   * completed on Clapay's side). The user can try again.                   */
  const failBefore = new Date(now.getTime() - FAIL_AFTER_MS);

  const stale = await db
    .select({ id: transactionsTable.id, userId: transactionsTable.userId, amount: transactionsTable.amount })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.status, "pending"),
        eq(transactionsTable.type, "recharge"),
        like(transactionsTable.externalDepositId, "clapay:%"),
        lt(transactionsTable.createdAt, failBefore),
      ),
    )
    .limit(50);

  if (stale.length > 0) {
    logger.warn({ count: stale.length }, "[Clapay Reconcile] Expiring stale pending transactions (> 2h)");

    for (const tx of stale) {
      const [updated] = await db
        .update(transactionsTable)
        .set({ status: "failed" })
        .where(and(
          eq(transactionsTable.id, tx.id),
          eq(transactionsTable.status, "pending"),  // guard against race with webhook
        ))
        .returning();

      if (updated) {
        logger.info({ txId: tx.id, userId: tx.userId }, "[Clapay Reconcile] Stale transaction marked failed");

        /* Push notification — transaction expired */
        try {
          const [notif] = await db.insert(notificationsTable).values({
            userId: tx.userId,
            title: "⏱ Paiement expiré",
            body: `Votre tentative de recharge de ${tx.amount.toLocaleString("fr-FR")} FCFA n'a pas abouti. Veuillez réessayer.`,
            type: "deposit",
            icon: "alert",
            link: "/wallet",
            metadata: { amount: tx.amount, txId: tx.id, gateway: "clapay", source: "timeout" },
          }).returning();
          if (notif) broadcastNotification(notif);
        } catch { /* non-critical */ }
      }
    }
  }

  /* ── STEP 2: Merchant balance health check ────────────────────────────────
   * Ping Clapay API to ensure connectivity. This also validates the token.
   * Logs a warning if unreachable — does NOT affect payments or user data.  */
  try {
    await clapay.getBalance(HEALTH_CHECK_COUNTRY);
    logger.debug("[Clapay Reconcile] Merchant balance health check OK");
  } catch (e) {
    const msg = (e as Error).message ?? "";
    /* 400 COUNTRY_CODE_NOT_FOUND just means CI isn't configured — still connected */
    if (!msg.includes("400")) {
      logger.warn({ error: msg }, "[Clapay Reconcile] Health check failed — Clapay may be unreachable");
    }
  }
}

let reconcileTimer: NodeJS.Timeout | null = null;

export function startClapayReconciliation(): void {
  if (reconcileTimer) return;
  logger.info(
    { intervalMs: RECONCILE_INTERVAL_MS, failAfterMs: FAIL_AFTER_MS },
    "[Clapay Reconcile] Background reconciliation started",
  );
  reconcileTimer = setInterval(() => {
    reconcilePendingClapayTransactions().catch(e =>
      logger.error({ error: (e as Error).message }, "[Clapay Reconcile] Unhandled error"),
    );
  }, RECONCILE_INTERVAL_MS);
}

export function stopClapayReconciliation(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}
