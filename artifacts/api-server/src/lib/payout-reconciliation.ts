import { asc, eq } from "drizzle-orm";
import { db, payoutsTable } from "@workspace/db";
import { logger } from "./logger";
import { refreshPayout } from "./payout-service";

const RECONCILE_INTERVAL_MS = 30_000;
const BATCH_SIZE = 100;
let reconcileTimer: NodeJS.Timeout | null = null;
let reconciling = false;

async function reconcilePendingPayouts(): Promise<void> {
  if (reconciling) return;
  reconciling = true;
  try {
    /* Updating updated_at after each attempt makes the oldest unvisited items
       rotate through the batch instead of letting a large queue starve later
       payouts. No age cutoff is used: pending payouts are durable indefinitely. */
    const pending = await db.select({ id: payoutsTable.id }).from(payoutsTable)
      .where(eq(payoutsTable.status, "pending"))
      .orderBy(asc(payoutsTable.updatedAt), asc(payoutsTable.createdAt))
      .limit(BATCH_SIZE);
    for (const item of pending) {
      await refreshPayout(item.id);
    }
  } catch (error) {
    logger.error({ err: (error as Error).message }, "[payout-reconcile] Scan failed");
  } finally {
    reconciling = false;
  }
}

export function startPayoutReconciliation(): void {
  if (reconcileTimer) return;
  logger.info({ intervalMs: RECONCILE_INTERVAL_MS }, "[payout-reconcile] Background reconciliation started");
  void reconcilePendingPayouts();
  reconcileTimer = setInterval(() => void reconcilePendingPayouts(), RECONCILE_INTERVAL_MS);
}

export function stopPayoutReconciliation(): void {
  if (reconcileTimer) clearInterval(reconcileTimer);
  reconcileTimer = null;
}