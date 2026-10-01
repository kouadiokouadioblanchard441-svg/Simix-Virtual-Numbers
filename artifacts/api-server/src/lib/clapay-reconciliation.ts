/**
 * Periodically reconciles pending Clapay payments against the authoritative
 * NoWallet signature-status API. Unknown signatures and API failures remain
 * pending; age alone is never treated as evidence of a failed payment.
 */
import { and, eq, like, asc, gt, or } from "drizzle-orm";
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

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 50;
let reconcileCursor: { createdAt: Date; id: string } | null = null;

async function reconcilePendingClapayTransactions(): Promise<void> {
  const cursorCondition = reconcileCursor
    ? or(
        gt(transactionsTable.createdAt, reconcileCursor.createdAt),
        and(
          eq(transactionsTable.createdAt, reconcileCursor.createdAt),
          gt(transactionsTable.id, reconcileCursor.id),
        ),
      )
    : undefined;
  const filters = [
    eq(transactionsTable.status, "pending"),
    eq(transactionsTable.type, "recharge"),
    like(transactionsTable.externalDepositId, "clapay:%"),
    like(transactionsTable.gatewayMeta, '%"clapaySignature"%'),
  ];
  if (cursorCondition) filters.push(cursorCondition);
  const pending = await db.select().from(transactionsTable)
    .where(and(...filters))
    .orderBy(asc(transactionsTable.createdAt), asc(transactionsTable.id))
    .limit(BATCH_SIZE);

  if (!pending.length) {
    reconcileCursor = null;
    return;
  }
  const last = pending[pending.length - 1]!;
  reconcileCursor = { createdAt: last.createdAt, id: last.id };

  for (const deposit of pending) {
    const externalDepositId = deposit.externalDepositId!;
    const trackingId = externalDepositId.slice("clapay:".length);
    const context = await getClapayDepositMeta(externalDepositId);
    if (!context?.meta.clapaySignature) continue;
    const meta = await persistClapayDepositMeta(externalDepositId);
    if (!meta?.clapaySignature) continue;
    const credentials = meta.gatewayConfigId
      ? await resolveClapayGatewayCredentials(meta.gatewayConfigId)
      : await resolveClapayCredentials();
    if (!credentials) continue;
    const clapay = new ClapayClient(credentials.token, credentials.baseUrl);

    try {
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
