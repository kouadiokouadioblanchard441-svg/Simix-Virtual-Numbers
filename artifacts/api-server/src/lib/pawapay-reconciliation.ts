/**
 * PawaPay Reconciliation Job
 *
 * PawaPay supports two ways to get deposit status:
 *  1. Webhook callbacks (optional — requires a callback URL configured in PawaPay dashboard)
 *  2. Polling via GET /v2/deposits/:depositId  ← this job uses this
 *
 * Since webhooks are optional (not required), this background job ensures that
 * every pending PawaPay deposit is eventually confirmed, even if no webhook is
 * configured in the PawaPay dashboard. It polls the PawaPay API every 30 seconds
 * for deposits pending between 30s and 24h.
 *
 * CRITICAL: Always credit tx.amount (stored XOF/FCFA), never the API `amount` field
 * (which is in the payer's LOCAL currency after FX conversion).
 */

import { and, eq, gte, lt, sql, not, like } from "drizzle-orm";
import { db, transactionsTable, usersTable, notificationsTable, systemSettingsTable } from "@workspace/db";
import { logger } from "./logger";
import { PawaPayClient } from "./pawapay";
import { broadcastNotification } from "../routes/notifications";
import { sendDepositConfirmationEmail } from "./email";

const RECONCILE_INTERVAL_MS = 30 * 1000;      // poll every 30 seconds
const MIN_AGE_MS             = 30 * 1000;      // skip deposits < 30s old (may still be processing)
const MAX_AGE_MS             = 24 * 60 * 60 * 1000; // skip deposits > 24h old (stale)

/* ── Load PawaPay client (mirrors wallet.ts logic) ── */
async function getPawaPayClientForReconcile(): Promise<PawaPayClient | null> {
  let token = process.env.PAWAPAY_API_TOKEN ?? null;
  let env: "sandbox" | "production" = "sandbox";

  const rawEnv = process.env.PAWAPAY_ENV?.trim().toLowerCase();
  if (rawEnv === "sandbox" || rawEnv === "production") env = rawEnv;

  if (!token) {
    try {
      const rows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "pawapay_api_token")).limit(1);
      token = rows[0]?.value?.trim() || null;

      if (token) {
        const envRows = await db.select().from(systemSettingsTable)
          .where(eq(systemSettingsTable.key, "pawapay_env")).limit(1);
        const dbEnv = envRows[0]?.value?.trim().toLowerCase();
        if (dbEnv === "sandbox" || dbEnv === "production") env = dbEnv;
      }
    } catch { /* non-fatal */ }
  }

  if (!token) return null;
  return new PawaPayClient(token, env);
}

async function reconcilePendingPawaPayTransactions(): Promise<void> {
  const client = await getPawaPayClientForReconcile();
  if (!client) return; // PawaPay not configured — skip silently

  const now = new Date();
  const minCreatedAt = new Date(now.getTime() - MAX_AGE_MS);
  const maxCreatedAt = new Date(now.getTime() - MIN_AGE_MS);

  /* Find pending PawaPay transactions in the age window.
   * PawaPay depositIds are plain UUIDs (no prefix).
   * Clapay deposits are prefixed with "clapay:" — exclude those. */
  const pending = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.status, "pending"),
        eq(transactionsTable.type, "recharge"),
        not(like(transactionsTable.externalDepositId, "clapay:%")),
        gte(transactionsTable.createdAt, minCreatedAt),
        lt(transactionsTable.createdAt, maxCreatedAt),
      ),
    )
    .limit(50);

  const pawaPayPending = pending.filter(tx =>
    tx.externalDepositId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tx.externalDepositId),
  );

  if (pawaPayPending.length === 0) return;

  logger.info({ count: pawaPayPending.length }, "[PawaPay Reconcile] Checking pending deposits");

  for (const tx of pawaPayPending) {
    const depositId = tx.externalDepositId!;

    try {
      const result = await client.getDepositStatus(depositId);

      if (result.status !== "FOUND" || !result.data) {
        logger.debug({ depositId }, "[PawaPay Reconcile] Deposit not found — will retry next cycle");
        continue;
      }

      const depositStatus = result.data.status;

      if (depositStatus === "COMPLETED") {
        /* ALWAYS use stored XOF amount — not the API amount (which is in LOCAL currency) */
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
          logger.info({ depositId }, "[PawaPay Reconcile] Already processed by webhook — skipping");
          continue;
        }

        await db
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${creditAmount}` })
          .where(eq(usersTable.id, tx.userId));

        logger.info(
          { depositId, userId: tx.userId, creditAmount },
          "[PawaPay Reconcile] Deposit COMPLETED via polling — balance credited ✓",
        );

        /* Push real-time notification */
        try {
          const [notif] = await db.insert(notificationsTable).values({
            userId: tx.userId,
            title: "💰 Solde rechargé",
            body: `Votre solde a été crédité de ${creditAmount.toLocaleString("fr-FR")} FCFA avec succès.`,
            type: "deposit",
            icon: "wallet",
            link: "/wallet",
            metadata: { amount: creditAmount, depositId, gateway: "pawapay", source: "reconciliation" },
          }).returning();
          if (notif) broadcastNotification(notif);
        } catch { /* non-critical */ }

        /* Send confirmation email */
        try {
          const [userRow] = await db.select({
            email: usersTable.email,
            fullName: usersTable.fullName,
            balance: usersTable.balance,
          }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);

          if (userRow?.email) {
            const phoneMatch = tx.description?.match(/[\+\d]{8,}/);
            await sendDepositConfirmationEmail({
              userEmail: userRow.email,
              userFullName: userRow.fullName ?? "Utilisateur",
              amount: creditAmount,
              method: tx.method ?? "Mobile Money",
              phoneNumber: phoneMatch?.[0] ?? null,
              transactionId: String(tx.id),
              depositId,
              createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
              newBalance: userRow.balance,
            });
          }
        } catch { /* non-critical */ }

      } else if (depositStatus === "FAILED" || depositStatus === "IN_RECONCILIATION") {
        if (depositStatus === "FAILED") {
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
              { depositId, pawaPayStatus: depositStatus },
              "[PawaPay Reconcile] Deposit FAILED — transaction marked failed",
            );
          }
        } else {
          /* IN_RECONCILIATION = PawaPay is investigating — leave pending, retry later */
          logger.info({ depositId }, "[PawaPay Reconcile] Deposit IN_RECONCILIATION — will retry");
        }
      } else {
        /* ACCEPTED / PROCESSING — still in progress */
        logger.debug({ depositId, pawaPayStatus: depositStatus }, "[PawaPay Reconcile] Still in progress — will retry");
      }
    } catch (e) {
      logger.warn(
        { error: (e as Error).message, depositId, txId: tx.id },
        "[PawaPay Reconcile] Error checking deposit",
      );
    }
  }
}

let reconcileTimer: NodeJS.Timeout | null = null;

export function startPawaPayReconciliation(): void {
  if (reconcileTimer) return; // already running
  logger.info(
    { intervalMs: RECONCILE_INTERVAL_MS },
    "[PawaPay Reconcile] Background polling started (no webhook required)",
  );
  reconcileTimer = setInterval(() => {
    reconcilePendingPawaPayTransactions().catch(e =>
      logger.error({ error: (e as Error).message }, "[PawaPay Reconcile] Unhandled error"),
    );
  }, RECONCILE_INTERVAL_MS);

  /* First run after 60s (give new deposits time to reach ACCEPTED status) */
  setTimeout(() => {
    reconcilePendingPawaPayTransactions().catch(e =>
      logger.error({ error: (e as Error).message }, "[PawaPay Reconcile] Startup run error"),
    );
  }, 60_000);
}

export function stopPawaPayReconciliation(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}
