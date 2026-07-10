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
} from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { logger } from "../lib/logger";

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
    })
    .from(referralWithdrawalsTable)
    .innerJoin(usersTable, eq(referralWithdrawalsTable.userId, usersTable.id))
    .leftJoin(countriesTable, eq(referralWithdrawalsTable.countryCode, countriesTable.code))
    .leftJoin(mobileOperatorsTable, eq(referralWithdrawalsTable.operatorSlug, mobileOperatorsTable.slug))
    .where(status ? eq(referralWithdrawalsTable.status, status) : undefined)
    .orderBy(desc(referralWithdrawalsTable.createdAt))
    .limit(200);

  const [pendingCountRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(referralWithdrawalsTable)
    .where(eq(referralWithdrawalsTable.status, "pending"));

  res.json({ withdrawals: rows, pendingCount: pendingCountRow?.c ?? 0 });
});

/* ─── POST /admin/referral-withdrawals/:id/approve ────────────── */
router.post("/admin/referral-withdrawals/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;

  const outcome = await db.transaction(async (tx) => {
    /* Lock the row and guard the transition atomically to avoid two concurrent
       admin actions (approve+approve or approve+reject) both succeeding. */
    const [withdrawal] = await tx
      .select()
      .from(referralWithdrawalsTable)
      .where(eq(referralWithdrawalsTable.id, id))
      .for("update");

    if (!withdrawal) return { error: "NOT_FOUND" as const };
    if (withdrawal.status !== "pending") return { error: "ALREADY_PROCESSED" as const };

    await tx.update(referralWithdrawalsTable)
      .set({ status: "paid", processedBy: adminId(req), processedAt: new Date() })
      .where(and(eq(referralWithdrawalsTable.id, id), eq(referralWithdrawalsTable.status, "pending")));

    return { withdrawal };
  });

  if (outcome.error === "NOT_FOUND") { res.status(404).json({ error: "Demande introuvable" }); return; }
  if (outcome.error === "ALREADY_PROCESSED") { res.status(400).json({ error: "Cette demande a déjà été traitée" }); return; }

  await logAdminAction(adminId(req), "referral_withdrawal_approved", req.ip, "referral_withdrawal", id, { amount: outcome.withdrawal!.amount, userId: outcome.withdrawal!.userId });

  res.json({ success: true });
});

/* ─── POST /admin/referral-withdrawals/:id/reject ─────────────── */
router.post("/admin/referral-withdrawals/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
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
  if (outcome.error === "ALREADY_PROCESSED") { res.status(400).json({ error: "Cette demande a déjà été traitée" }); return; }

  await logAdminAction(adminId(req), "referral_withdrawal_rejected", req.ip, "referral_withdrawal", id, { amount: outcome.withdrawal!.amount, userId: outcome.withdrawal!.userId, reason });

  res.json({ success: true });
});

export default router;
