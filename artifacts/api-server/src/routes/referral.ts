import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, usersTable, referralCommissionsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { getReferralCommissionRate } from "../lib/settings";

const router: IRouter = Router();

/* ─── GET /referral/me ─────────────────────────────────────────── */
router.get("/referral/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;

  const commissionRate = await getReferralCommissionRate();

  const commissions = await db
    .select({
      id: referralCommissionsTable.id,
      commissionAmount: referralCommissionsTable.commissionAmount,
      purchaseAmount: referralCommissionsTable.purchaseAmount,
      createdAt: referralCommissionsTable.createdAt,
      refereeName: usersTable.fullName,
      refereePhone: usersTable.phone,
    })
    .from(referralCommissionsTable)
    .innerJoin(usersTable, eq(referralCommissionsTable.refereeId, usersTable.id))
    .where(eq(referralCommissionsTable.referrerId, user.id))
    .orderBy(desc(referralCommissionsTable.createdAt))
    .limit(100);

  const referredCount = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.referredBy, user.id));

  res.json({
    referralCode: user.referralCode,
    totalEarnings: user.referralEarnings,
    commissionRate,
    referredCount: referredCount.length,
    commissions: commissions.map(c => ({
      id: c.id,
      commissionAmount: c.commissionAmount,
      purchaseAmount: c.purchaseAmount,
      createdAt: c.createdAt,
      refereeName: c.refereeName,
      refereePhone: c.refereePhone ? `...${c.refereePhone.slice(-4)}` : null,
    })),
  });
});

export default router;
