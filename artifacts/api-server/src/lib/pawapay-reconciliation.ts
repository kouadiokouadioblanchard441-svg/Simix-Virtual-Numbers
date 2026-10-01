/**
 * Reconciles pending PawaPay deposits through the same authoritative status
 * verification and atomic settlement used by callbacks and user polling.
 */
import { and, asc, eq, gt, like, lt, not } from "drizzle-orm";
import { db, transactionsTable, usersTable, notificationsTable } from "@workspace/db";
import { logger } from "./logger";
import { getPawaPayClientForDeposit, verifyAndSettlePawaPayDeposit } from "./pawapay-settlement";
import { broadcastNotification } from "../routes/notifications";
import { sendDepositConfirmationEmail } from "./email";
import { creditReferralDepositCommission } from "./referral-commission";

const RECONCILE_INTERVAL_MS = 30 * 1000;
const MIN_AGE_MS = 30 * 1000;
const BATCH_SIZE = 50;
const DEPOSIT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let reconcileTimer: NodeJS.Timeout | null = null;
let cursor: string | null = null;

async function notifySettledDeposit(tx: typeof transactionsTable.$inferSelect, amount: number): Promise<void> {
  try {
    const [notif] = await db.insert(notificationsTable).values({
      userId: tx.userId,
      title: "💰 Solde rechargé",
      body: `Votre solde a été crédité de ${amount.toLocaleString("fr-FR")} FCFA avec succès.`,
      type: "deposit",
      icon: "wallet",
      link: "/wallet",
      metadata: { amount, depositId: tx.externalDepositId, gateway: "pawapay", source: "reconciliation" },
    }).returning();
    if (notif) broadcastNotification(notif);
  } catch (error) {
    logger.warn({ depositId: tx.externalDepositId, error: (error as Error).message }, "[PawaPay Reconcile] Notification failed after settlement");
  }

  try {
    const [userRow] = await db.select({
      email: usersTable.email,
      fullName: usersTable.fullName,
      balance: usersTable.balance,
      referredBy: usersTable.referredBy,
    }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
    if (userRow?.email) {
      const phoneMatch = tx.description?.match(/[\+\d]{8,}/);
      await sendDepositConfirmationEmail({
        userEmail: userRow.email,
        userFullName: userRow.fullName ?? "Utilisateur",
        amount,
        method: tx.method ?? "Mobile Money",
        phoneNumber: phoneMatch?.[0] ?? null,
        transactionId: String(tx.id),
        depositId: tx.externalDepositId ?? "",
        createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
        newBalance: userRow.balance,
      });
    }
    void creditReferralDepositCommission({
      depositorId: tx.userId,
      referredBy: userRow?.referredBy,
      depositAmount: amount,
      sourceLabel: tx.method ?? "Mobile Money",
    });
  } catch (error) {
    logger.warn({ depositId: tx.externalDepositId, error: (error as Error).message }, "[PawaPay Reconcile] Post-settlement email/referral lookup failed");
  }
}

async function reconcilePendingPawaPayTransactions(): Promise<void> {
  const cutoff = new Date(Date.now() - MIN_AGE_MS);
  const conditions = [
    eq(transactionsTable.status, "pending"),
    eq(transactionsTable.type, "recharge"),
    not(like(transactionsTable.externalDepositId, "clapay:%")),
    lt(transactionsTable.createdAt, cutoff),
  ];
  if (cursor) {
    conditions.push(gt(transactionsTable.id, cursor));
  }

  const pending = await db.select().from(transactionsTable)
    .where(and(...conditions))
    .orderBy(asc(transactionsTable.id))
    .limit(BATCH_SIZE);

  if (pending.length === 0) {
    cursor = null;
    return;
  }

  const last = pending[pending.length - 1];
  cursor = last.id;
  if (pending.length < BATCH_SIZE) cursor = null;

  const pawaPayPending = pending.filter(tx =>
    tx.externalDepositId && DEPOSIT_ID_PATTERN.test(tx.externalDepositId),
  );
  if (!pawaPayPending.length) return;

  logger.info({ count: pawaPayPending.length }, "[PawaPay Reconcile] Checking pending deposits");
  for (const tx of pawaPayPending) {
    const depositId = tx.externalDepositId!;
    try {
      const client = await getPawaPayClientForDeposit(tx);
      if (!client) {
        logger.warn({ depositId }, "[PawaPay Reconcile] Initiating gateway credentials unavailable; deposit remains pending");
        continue;
      }
      const outcome = await verifyAndSettlePawaPayDeposit(depositId, client);
      if (outcome.settled && outcome.amount !== undefined) {
        logger.info({ depositId, userId: tx.userId, creditAmount: outcome.amount }, "[PawaPay Reconcile] Deposit settled atomically");
        await notifySettledDeposit(tx, outcome.amount);
      } else if (outcome.failed) {
        logger.warn({ depositId }, "[PawaPay Reconcile] Verified deposit failure marked atomically");
      }
      // NOT_FOUND, in-progress and mismatched evidence remain pending for a
      // later authoritative status query; age alone never changes status.
    } catch (error) {
      logger.warn({ error: (error as Error).message, depositId, txId: tx.id }, "[PawaPay Reconcile] Status check failed; deposit remains pending");
    }
  }
}

export function startPawaPayReconciliation(): void {
  if (reconcileTimer) return;
  logger.info({ intervalMs: RECONCILE_INTERVAL_MS }, "[PawaPay Reconcile] Background polling started (no webhook required)");
  reconcileTimer = setInterval(() => {
    reconcilePendingPawaPayTransactions().catch(error =>
      logger.error({ error: (error as Error).message }, "[PawaPay Reconcile] Unhandled error"),
    );
  }, RECONCILE_INTERVAL_MS);

  setTimeout(() => {
    reconcilePendingPawaPayTransactions().catch(error =>
      logger.error({ error: (error as Error).message }, "[PawaPay Reconcile] Startup run error"),
    );
  }, 60_000);
}

export function stopPawaPayReconciliation(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
  cursor = null;
}