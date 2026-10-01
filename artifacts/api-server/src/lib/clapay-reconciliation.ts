/**
 * Periodically reconciles pending Clapay payments against the authoritative
 * NoWallet signature-status API. Unknown signatures and API failures remain
 * pending; age alone is never treated as evidence of a failed payment.
 */
import { and, eq, like, asc, gt } from "drizzle-orm";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { logger } from "./logger";
import { ClapayClient } from "./clapay";
import {
  failClapayDeposit,
  getClapayDepositMeta,
  getVerifiedClapayStatus,
  persistClapayDepositMeta,
  settleVerifiedClapayDeposit,
} from "./clapay-settlement";
import { resolveClapayCredentials, resolveClapayGatewayCredentials } from "./gateway-credentials";
import { creditReferralDepositCommission } from "./referral-commission";
import { createRotatingBatchReader } from "./rotating-batch";

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 50;
const readPendingBatch = createRotatingBatchReader(async (afterId, limit) =>
  db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.status, "pending"),
      eq(transactionsTable.type, "recharge"),
      like(transactionsTable.externalDepositId, "clapay:%"),
      like(transactionsTable.gatewayMeta, '%"clapaySignature"%'),
      afterId ? gt(transactionsTable.id, afterId) : undefined,
    ))
    .orderBy(asc(transactionsTable.id))
    .limit(limit), BATCH_SIZE);

async function reconcilePendingClapayTransactions(): Promise<void> {
  const pending = await readPendingBatch();

  for (const deposit of pending) {
    const externalDepositId = deposit.externalDepositId!;
    const trackingId = externalDepositId.slice("clapay:".length);
    try {
      const context = await getClapayDepositMeta(externalDepositId);
      if (!context?.meta.clapaySignature) continue;
      const meta = await persistClapayDepositMeta(externalDepositId);
      if (!meta?.clapaySignature) continue;
      const credentials = meta.gatewayConfigId
        ? await resolveClapayGatewayCredentials(meta.gatewayConfigId)
        : await resolveClapayCredentials();
      if (!credentials) continue;
      const clapay = new ClapayClient(credentials.token, credentials.baseUrl);
      const status = await getVerifiedClapayStatus(clapay, meta, trackingId);
      if (status?.status === "completed") {
        const outcome = await settleVerifiedClapayDeposit(externalDepositId);
        if (outcome.settled && outcome.userId && outcome.amount !== undefined) {
          const [owner] = await db.select({
            referredBy: usersTable.referredBy,
          }).from(usersTable).where(eq(usersTable.id, outcome.userId)).limit(1);
          void creditReferralDepositCommission({
            depositorId: outcome.userId,
            referredBy: owner?.referredBy,
            depositAmount: outcome.amount,
            sourceLabel: deposit.method ?? "Mobile Money",
          });
          logger.info({ transactionId: deposit.id }, "[Clapay Reconcile] Verified payment settled");
        }
      } else if (status?.status === "failed") {
        const updated = await failClapayDeposit(externalDepositId);
        if (updated) logger.info({ transactionId: deposit.id }, "[Clapay Reconcile] Verified payment failure recorded");
      }
    } catch (error) {
      logger.warn({ transactionId: deposit.id, error: (error as Error).message }, "[Clapay Reconcile] Status verification failed; remains pending");
    }
  }
}

let reconcileTimer: NodeJS.Timeout | null = null;
let reconcileRunning = false;

export function startClapayReconciliation(): void {
  if (reconcileTimer) return;
  logger.info({ intervalMs: RECONCILE_INTERVAL_MS }, "[Clapay Reconcile] Background reconciliation started");
  reconcileTimer = setInterval(() => {
    if (reconcileRunning) return;
    reconcileRunning = true;
    reconcilePendingClapayTransactions()
      .catch(error => logger.error({ error: (error as Error).message }, "[Clapay Reconcile] Unhandled error"))
      .finally(() => { reconcileRunning = false; });
  }, RECONCILE_INTERVAL_MS);
}

export function stopClapayReconciliation(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}
