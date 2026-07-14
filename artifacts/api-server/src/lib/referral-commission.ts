/**
 * Referral deposit commission — shared helper
 *
 * Referral bonuses are credited when the REFERRED user makes a deposit
 * (recharge), not when they make a purchase. This helper is called from
 * every place a deposit transitions to "completed":
 *   - wallet.ts: instant credit path (non-mobile-money)
 *   - wallet.ts: PawaPay webhook
 *   - wallet.ts: Clapay webhook
 *   - wallet.ts: PawaPay status-poll safety net
 *   - pawapay-reconciliation.ts: background polling safety net
 *
 * Referral bonuses are NOT added to the main wallet balance — they stay
 * isolated in referralBalance/referralEarnings and are only withdrawable
 * via the "Parrainage" withdrawal request flow (admin-validated).
 */
import { eq, sql } from "drizzle-orm";
import { db, usersTable, referralCommissionsTable, transactionsTable } from "@workspace/db";
import { getReferralCommissionRate } from "./settings";
import { logger } from "./logger";

export async function creditReferralDepositCommission(params: {
  /** The user who made the deposit (referee) */
  depositorId: string;
  /** depositorId's referredBy — pass null/undefined if not referred */
  referredBy: string | null | undefined;
  /** Deposit amount in XOF/FCFA (the stored internal amount, never the gateway's local-currency amount) */
  depositAmount: number;
  /** Human-readable label for the transaction description, e.g. gateway/method name */
  sourceLabel: string;
}): Promise<void> {
  const { depositorId, referredBy, depositAmount, sourceLabel } = params;
  if (!referredBy) return;

  try {
    const commissionRate = await getReferralCommissionRate();
    const commissionAmount = Math.floor((depositAmount * commissionRate) / 100);
    if (commissionAmount <= 0) return;

    await db.update(usersTable)
      .set({
        referralEarnings: sql`${usersTable.referralEarnings} + ${commissionAmount}`,
        referralBalance: sql`${usersTable.referralBalance} + ${commissionAmount}`,
      })
      .where(eq(usersTable.id, referredBy));

    await db.insert(referralCommissionsTable).values({
      referrerId: referredBy,
      refereeId: depositorId,
      purchaseAmount: depositAmount,
      commissionAmount,
    });

    await db.insert(transactionsTable).values({
      userId: referredBy,
      type: "referral_commission",
      amount: commissionAmount,
      status: "completed",
      method: "referral",
      description: `Commission parrainage ${commissionRate}% — dépôt ${sourceLabel}`,
    });

    logger.info(
      { referrerId: referredBy, depositorId, depositAmount, commissionAmount },
      "[referral] Deposit commission credited",
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[referral] Deposit commission credit failed (non-critical)");
  }
}
