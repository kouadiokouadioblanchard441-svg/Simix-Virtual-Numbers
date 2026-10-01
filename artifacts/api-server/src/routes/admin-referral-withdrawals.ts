/**
 * Admin — Referral withdrawal requests
 *
 *   GET  /admin/referral-withdrawals            — list (filter by status)
 *   POST /admin/referral-withdrawals/:id/approve — mark as paid (funds already reserved)
 *   POST /admin/referral-withdrawals/:id/reject  — reject + refund the reserved balance
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, sql, and } from "drizzle-orm";
import {
  db,
  usersTable,
  countriesTable,
  mobileOperatorsTable,
  referralWithdrawalsTable,
  adminLogsTable,
  payoutsTable,
} from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { logger } from "../lib/logger";
import { randomUUID } from "node:crypto";
import {
  COUNTRY_CURRENCY,
  normalizePawaPayProvider,
} from "../lib/pawapay";
import {
  initiatePayout,
  refreshPayout,
  PayoutValidationError,
  resolveClapayReferralPayout,
  validatePawaPayRecipient,
  type PayoutGateway,
} from "../lib/payout-service";
import { payoutFingerprint } from "../lib/payout-ledger-core";

const router: IRouter = Router();
router.use(requireAdminJwt);

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.adminPayload) { next(); return; }
  if (!req.user?.isAdmin) { res.status(403).json({ error: "Accès réservé aux administrateurs" }); return; }
  next();
}

function adminId(req: Request): string {
  return req.adminPayload?.sub ?? req.user?.id ?? "unknown";
}

async function logAdminAction(adminId: string, action: string, ip: string | undefined, targetType?: string, targetId?: string, details?: Record<string, unknown>) {
  try {
    await db.insert(adminLogsTable).values({ adminId, action, targetType, targetId, details, ip });
  } catch (e) {
    logger.debug({ err: (e as Error).message, action }, "[admin-log] Non-critical: failed to write admin log");
  }
}

/* ─── GET /admin/referral-withdrawals ─────────────────────────── */
router.get("/admin/referral-withdrawals", requireAdmin, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  const rows = await db
    .select({
      id: referralWithdrawalsTable.id,
      userId: referralWithdrawalsTable.userId,
      amount: referralWithdrawalsTable.amount,
      countryCode: referralWithdrawalsTable.countryCode,
      operatorSlug: referralWithdrawalsTable.operatorSlug,
      phone: referralWithdrawalsTable.phone,
      status: referralWithdrawalsTable.status,
      adminNote: referralWithdrawalsTable.adminNote,
      processedBy: referralWithdrawalsTable.processedBy,
      processedAt: referralWithdrawalsTable.processedAt,
      createdAt: referralWithdrawalsTable.createdAt,
      userName: usersTable.fullName,
      userPhone: usersTable.phone,
      userEmail: usersTable.email,
      countryName: countriesTable.name,
      countryFlag: countriesTable.flag,
      operatorName: mobileOperatorsTable.name,
      operatorColor: mobileOperatorsTable.color,
      payoutId: payoutsTable.id,
      payoutGateway: payoutsTable.gateway,
      payoutStatus: payoutsTable.status,
      payoutAmount: payoutsTable.amount,
      payoutCurrency: payoutsTable.currency,
      payoutCountry: payoutsTable.country,
      payoutPhone: payoutsTable.phone,
      payoutProvider: payoutsTable.provider,
      payoutExternalId: payoutsTable.externalId,
      payoutSignature: payoutsTable.signature,
      payoutFailureReason: payoutsTable.failureReason,
      payoutCreatedAt: payoutsTable.createdAt,
      payoutUpdatedAt: payoutsTable.updatedAt,
    })
    .from(referralWithdrawalsTable)
    .innerJoin(usersTable, eq(referralWithdrawalsTable.userId, usersTable.id))
    .leftJoin(countriesTable, eq(referralWithdrawalsTable.countryCode, countriesTable.code))
    .leftJoin(mobileOperatorsTable, eq(referralWithdrawalsTable.operatorSlug, mobileOperatorsTable.slug))
    .leftJoin(payoutsTable, eq(payoutsTable.referralWithdrawalId, referralWithdrawalsTable.id))
    .where(status ? eq(referralWithdrawalsTable.status, status) : undefined)
    .orderBy(desc(referralWithdrawalsTable.createdAt))
    .limit(200);

  const [pendingCountRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(referralWithdrawalsTable)
    .where(eq(referralWithdrawalsTable.status, "pending"));

  res.json({
    withdrawals: rows.map((row) => {
      const payout = row.payoutId ? {
        id: row.payoutId,
        gateway: row.payoutGateway,
        status: row.payoutStatus,
        amount: row.payoutAmount,
        currency: row.payoutCurrency,
        countryCode: row.payoutCountry,
        phoneNumber: row.payoutPhone,
        providerCode: row.payoutProvider,
        externalId: row.payoutExternalId,
        ...(row.payoutSignature ? { signature: row.payoutSignature } : {}),
        ...(row.payoutFailureReason ? { failureReason: row.payoutFailureReason } : {}),
        createdAt: row.payoutCreatedAt,
        updatedAt: row.payoutUpdatedAt,
        referralWithdrawalId: row.id,
      } : null;
      return {
        id: row.id,
        userId: row.userId,
        amount: row.amount,
        countryCode: row.countryCode,
        operatorSlug: row.operatorSlug,
        phone: row.phone,
        status: row.status,
        adminNote: row.adminNote,
        processedBy: row.processedBy,
        processedAt: row.processedAt,
        createdAt: row.createdAt,
        userName: row.userName,
        userPhone: row.userPhone,
        userEmail: row.userEmail,
        countryName: row.countryName,
        countryFlag: row.countryFlag,
        operatorName: row.operatorName,
        operatorColor: row.operatorColor,
        payout,
        payoutInProgress: row.status === "pending" && row.payoutStatus === "pending",
      };
    }),
    pendingCount: pendingCountRow?.c ?? 0,
  });
});

/* ─── POST /admin/referral-withdrawals/:id/send ───────────────── */
router.post("/admin/referral-withdrawals/:id/send", requireAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] ?? "" : req.params.id ?? "";
  const { gateway, idempotencyKey, operatorOtp } = (req.body ?? {}) as {
    gateway?: PayoutGateway;
    idempotencyKey?: string;
    operatorOtp?: string;
  };
  if ((gateway !== "pawapay" && gateway !== "clapay") || !idempotencyKey?.trim()) {
    res.status(400).json({ error: "Champs requis : gateway (pawapay|clapay), idempotencyKey" });
    return;
  }

  try {
    const [snapshot] = await db.select().from(referralWithdrawalsTable)
      .where(eq(referralWithdrawalsTable.id, id)).limit(1);
    if (!snapshot) { res.status(404).json({ error: "Demande introuvable" }); return; }
    if (snapshot.status !== "pending") {
      res.status(409).json({ error: "Cette demande de retrait a déjà été traitée." });
      return;
    }

    let prepared: { phone: string; provider: string; country: string; currency: string; amount: string };
    let operatorRequiresOtp = false;
    if (gateway === "pawapay") {
      const country = snapshot.countryCode.toUpperCase();
      const currency = COUNTRY_CURRENCY[country];
      if (!currency) throw new PayoutValidationError("Devise PawaPay inconnue pour ce pays.", 422);
      const provider = normalizePawaPayProvider(country, snapshot.operatorSlug);
      prepared = await validatePawaPayRecipient({
        phoneNumber: snapshot.phone,
        countryIso2: country,
        provider,
        currency,
        amount: snapshot.amount,
      });
    } else {
      const clapay = await resolveClapayReferralPayout(
        snapshot.countryCode,
        snapshot.operatorSlug,
        snapshot.phone,
        snapshot.amount,
      );
      prepared = clapay;
      operatorRequiresOtp = clapay.operatorRequiresOtp;
    }
    if (operatorRequiresOtp && !operatorOtp?.trim()) {
      res.status(422).json({ error: "Un code OTP opérateur est requis pour ce payout." });
      return;
    }

    const outcome = await db.transaction(async (tx) => {
      const [withdrawal] = await tx.select().from(referralWithdrawalsTable)
        .where(eq(referralWithdrawalsTable.id, id)).for("update");
      if (!withdrawal) return { kind: "missing" as const };
      if (withdrawal.status !== "pending") return { kind: "processed" as const };
      if (withdrawal.phone !== snapshot.phone || withdrawal.amount !== snapshot.amount ||
          withdrawal.countryCode !== snapshot.countryCode || withdrawal.operatorSlug !== snapshot.operatorSlug) {
        return { kind: "changed" as const };
      }

      const [linkedPayout] = await tx.select().from(payoutsTable)
        .where(eq(payoutsTable.referralWithdrawalId, id)).limit(1);
      const identity = {
        gateway,
        actorId: adminId(req),
        idempotencyKey: idempotencyKey.trim(),
        phone: prepared.phone,
        provider: prepared.provider,
        country: prepared.country,
        currency: prepared.currency,
        amount: prepared.amount,
        referralWithdrawalId: id,
      };
      const fingerprint = payoutFingerprint(identity);
      if (linkedPayout) {
        if (linkedPayout.idempotencyKey !== identity.idempotencyKey ||
            linkedPayout.requestFingerprint !== fingerprint) {
          return { kind: "linked" as const, payout: linkedPayout };
        }
        return { kind: "existing" as const, payout: linkedPayout };
      }

      const [payout] = await tx.insert(payoutsTable).values({
        idempotencyKey: identity.idempotencyKey,
        requestFingerprint: fingerprint,
        gateway,
        externalId: randomUUID(),
        referralWithdrawalId: id,
        actorId: identity.actorId,
        phone: identity.phone,
        provider: identity.provider,
        country: identity.country.toUpperCase(),
        currency: identity.currency.toUpperCase(),
        amount: identity.amount,
        status: "pending",
      }).onConflictDoNothing().returning();
      if (payout) return { kind: "created" as const, payout };

      const [sameKey] = await tx.select().from(payoutsTable)
        .where(eq(payoutsTable.idempotencyKey, identity.idempotencyKey)).limit(1);
      if (sameKey?.requestFingerprint === fingerprint) return { kind: "existing" as const, payout: sameKey };
      return { kind: "conflict" as const };
    });

    if (outcome.kind === "missing") { res.status(404).json({ error: "Demande introuvable" }); return; }
    if (outcome.kind === "processed") { res.status(409).json({ error: "Cette demande de retrait a déjà été traitée." }); return; }
    if (outcome.kind === "changed") { res.status(409).json({ error: "Les données du retrait ont changé. Rechargez la liste." }); return; }
    if (outcome.kind === "linked") { res.status(409).json({ error: "Cette demande est déjà liée à un payout; aucun deuxième transfert ne sera créé." }); return; }
    if (outcome.kind === "conflict") { res.status(409).json({ error: "Cette clé d'idempotence a déjà été utilisée pour une autre demande." }); return; }

    if (outcome.kind === "created") {
      try {
        await initiatePayout(outcome.payout, operatorOtp?.trim());
      } catch (err) {
        logger.warn({ payoutId: outcome.payout.id, err: (err as Error).message }, "[referral-payout] Initiation outcome unknown; payout remains pending");
      }
    } else if (outcome.payout.status === "pending" && !outcome.payout.initiationClaimedAt) {
      try {
        await initiatePayout(outcome.payout, operatorOtp?.trim());
      } catch (err) {
        logger.warn({ payoutId: outcome.payout.id, err: (err as Error).message }, "[referral-payout] Unclaimed initiation outcome unknown; payout remains pending");
      }
    } else if (outcome.payout.status === "pending") {
      await refreshPayout(outcome.payout.id);
    }
    const [current] = await db.select().from(payoutsTable)
      .where(eq(payoutsTable.id, outcome.payout.id)).limit(1);
    if (outcome.kind === "created") {
      await logAdminAction(adminId(req), "referral_withdrawal_payout_sent", req.ip, "referral_withdrawal", id, {
        gateway,
        amount: snapshot.amount,
        userId: snapshot.userId,
        payoutId: outcome.payout.id,
      });
    }
    res.json(normalizeReferralPayout(current ?? outcome.payout));
  } catch (err) {
    if (err instanceof PayoutValidationError) {
      res.status(err.httpStatus).json({ error: err.message });
      return;
    }
    logger.error({ err: (err as Error).message, withdrawalId: id }, "[referral-payout] Send failed");
    res.status(503).json({ error: (err as Error).message });
  }
});

function normalizeReferralPayout(payout: typeof payoutsTable.$inferSelect) {
  return {
    id: payout.id,
    gateway: payout.gateway,
    status: payout.status,
    amount: payout.amount,
    currency: payout.currency,
    countryCode: payout.country,
    phoneNumber: payout.phone,
    providerCode: payout.provider,
    externalId: payout.externalId,
    ...(payout.signature ? { signature: payout.signature } : {}),
    ...(payout.failureReason ? { failureReason: payout.failureReason } : {}),
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
    referralWithdrawalId: payout.referralWithdrawalId,
  };
}

/* ─── POST /admin/referral-withdrawals/:id/approve ────────────── */
router.post("/admin/referral-withdrawals/:id/approve", requireAdmin, async (_req, res): Promise<void> => {
  res.status(409).json({ error: "Un retrait ne peut pas être marqué payé manuellement. Envoyez-le via l’action agrégateur." });
});

/* ─── POST /admin/referral-withdrawals/:id/reject ─────────────── */
router.post("/admin/referral-withdrawals/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] ?? "" : req.params.id ?? "";
  const { reason } = req.body ?? {};

  const outcome = await db.transaction(async (tx) => {
    /* Lock the row and guard the transition atomically — the refund must only
       ever be applied once, even under concurrent admin requests. */
    const [withdrawal] = await tx
      .select()
      .from(referralWithdrawalsTable)
      .where(eq(referralWithdrawalsTable.id, id))
      .for("update");

    if (!withdrawal) return { error: "NOT_FOUND" as const };
    if (withdrawal.status !== "pending") return { error: "ALREADY_PROCESSED" as const };
    const [activePayout] = await tx.select({ status: payoutsTable.status })
      .from(payoutsTable)
      .where(eq(payoutsTable.referralWithdrawalId, id));
    if (activePayout?.status === "pending") return { error: "PAYOUT_IN_FLIGHT" as const };

    const updated = await tx.update(referralWithdrawalsTable)
      .set({ status: "rejected", adminNote: reason ?? null, processedBy: adminId(req), processedAt: new Date() })
      .where(and(eq(referralWithdrawalsTable.id, id), eq(referralWithdrawalsTable.status, "pending")))
      .returning({ id: referralWithdrawalsTable.id });

    if (updated.length === 0) return { error: "ALREADY_PROCESSED" as const };

    /* Refund the reserved amount back to the user's referral balance */
    await tx.update(usersTable)
      .set({ referralBalance: sql`${usersTable.referralBalance} + ${withdrawal.amount}` })
      .where(eq(usersTable.id, withdrawal.userId));

    return { withdrawal };
  });

  if (outcome.error === "NOT_FOUND") { res.status(404).json({ error: "Demande introuvable" }); return; }
  if (outcome.error === "PAYOUT_IN_FLIGHT") { res.status(409).json({ error: "Un payout est en cours; il ne peut pas être rejeté manuellement." }); return; }
  if (outcome.error === "ALREADY_PROCESSED") { res.status(400).json({ error: "Cette demande a déjà été traitée" }); return; }

  await logAdminAction(adminId(req), "referral_withdrawal_rejected", req.ip, "referral_withdrawal", id, { amount: outcome.withdrawal!.amount, userId: outcome.withdrawal!.userId, reason });

  res.json({ success: true });
});

export default router;
