import { Router, type IRouter } from "express";
import { desc, eq, and, asc, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  referralCommissionsTable,
  referralWithdrawalsTable,
  countriesTable,
  mobileOperatorsTable,
  countryPaymentConfigsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { getReferralCommissionRate } from "../lib/settings";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ─── GET /referral/withdraw-countries ────────────────────────────
   Same African, mobile-money-enabled country list used for deposits —
   the referral bonus can only be paid out where a mobile money method exists. */
router.get("/referral/withdraw-countries", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinctOn([countriesTable.code], {
      code: countriesTable.code,
      name: countriesTable.name,
      flag: countriesTable.flag,
      dialCode: countriesTable.dialCode,
      sortOrder: countriesTable.sortOrder,
      popular: countriesTable.popular,
    })
    .from(countriesTable)
    .innerJoin(
      countryPaymentConfigsTable,
      and(eq(countryPaymentConfigsTable.countryCode, countriesTable.code), eq(countryPaymentConfigsTable.enabled, true)),
    )
    .where(eq(countriesTable.enabled, true))
    .orderBy(countriesTable.code, asc(countriesTable.sortOrder));

  res.json(rows.sort((a, b) => (Number(b.popular) - Number(a.popular)) || a.sortOrder - b.sortOrder));
});

/* ─── GET /referral/withdraw-operators?countryCode=XX ─────────────
   Mobile money operators available for the selected country. */
router.get("/referral/withdraw-operators", requireAuth, async (req, res): Promise<void> => {
  const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode.toUpperCase() : undefined;
  if (!countryCode) { res.status(400).json({ error: "countryCode requis" }); return; }

  const rows = await db
    .select()
    .from(mobileOperatorsTable)
    .where(and(
      eq(mobileOperatorsTable.active, true),
      sql`${mobileOperatorsTable.countryCodes} @> ${JSON.stringify([countryCode])}::jsonb`,
    ))
    .orderBy(asc(mobileOperatorsTable.sortOrder));

  res.json(rows.map(o => ({ slug: o.slug, name: o.name, color: o.color, logoUrl: o.logoUrl })));
});

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

  const pendingWithdrawal = await db
    .select()
    .from(referralWithdrawalsTable)
    .where(and(eq(referralWithdrawalsTable.userId, user.id), eq(referralWithdrawalsTable.status, "pending")))
    .limit(1);

  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);

  res.json({
    referralCode: user.referralCode,
    totalEarnings: user.referralEarnings,
    referralBalance: freshUser?.referralBalance ?? 0,
    commissionRate,
    referredCount: referredCount.length,
    pendingWithdrawal: pendingWithdrawal[0] ?? null,
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

/* ─── GET /referral/withdrawals ──────────────────────────────────
   History of the current user's withdrawal requests. */
router.get("/referral/withdrawals", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const rows = await db
    .select()
    .from(referralWithdrawalsTable)
    .where(eq(referralWithdrawalsTable.userId, user.id))
    .orderBy(desc(referralWithdrawalsTable.createdAt))
    .limit(50);
  res.json(rows);
});

/* ─── POST /referral/withdraw ─────────────────────────────────────
   Requests a withdrawal of the full available referral balance.
   Funds are reserved immediately (referralBalance → 0) and the
   request awaits admin validation in /admin/referral-withdrawals. */
router.post("/referral/withdraw", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const { countryCode, operatorSlug, phone } = req.body ?? {};

  if (!countryCode || typeof countryCode !== "string") {
    res.status(400).json({ error: "Pays requis" });
    return;
  }
  if (!operatorSlug || typeof operatorSlug !== "string") {
    res.status(400).json({ error: "Opérateur requis" });
    return;
  }
  if (!phone || typeof phone !== "string" || phone.replace(/\D/g, "").length < 6) {
    res.status(400).json({ error: "Numéro de retrait invalide" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [freshUser] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .for("update");

      if (!freshUser || freshUser.referralBalance <= 0) {
        throw new Error("NO_BALANCE");
      }

      const [existingPending] = await tx
        .select({ id: referralWithdrawalsTable.id })
        .from(referralWithdrawalsTable)
        .where(and(eq(referralWithdrawalsTable.userId, user.id), eq(referralWithdrawalsTable.status, "pending")))
        .limit(1);
      if (existingPending) throw new Error("ALREADY_PENDING");

      const [country] = await tx.select().from(countriesTable).where(eq(countriesTable.code, countryCode.toUpperCase())).limit(1);
      if (!country) throw new Error("INVALID_COUNTRY");

      const [operator] = await tx
        .select()
        .from(mobileOperatorsTable)
        .where(and(
          eq(mobileOperatorsTable.slug, operatorSlug.toLowerCase()),
          eq(mobileOperatorsTable.active, true),
          sql`${mobileOperatorsTable.countryCodes} @> ${JSON.stringify([country.code])}::jsonb`,
        ))
        .limit(1);
      if (!operator) throw new Error("INVALID_OPERATOR");

      const amount = freshUser.referralBalance;

      /* Reserve the funds immediately */
      await tx.update(usersTable)
        .set({ referralBalance: 0 })
        .where(eq(usersTable.id, user.id));

      const [withdrawal] = await tx.insert(referralWithdrawalsTable).values({
        userId: user.id,
        amount,
        countryCode: country.code,
        operatorSlug: operator.slug,
        phone,
      }).returning();

      return withdrawal;
    });

    res.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "NO_BALANCE") { res.status(400).json({ error: "Aucun solde de parrainage disponible" }); return; }
    if (msg === "ALREADY_PENDING") { res.status(400).json({ error: "Une demande de retrait est déjà en cours" }); return; }
    if (msg === "INVALID_COUNTRY") { res.status(400).json({ error: "Pays invalide" }); return; }
    if (msg === "INVALID_OPERATOR") { res.status(400).json({ error: "Opérateur invalide" }); return; }
    logger.error({ err: msg, userId: user.id }, "[referral] Withdrawal request failed");
    res.status(500).json({ error: "Erreur lors de la demande de retrait" });
  }
});

export default router;
