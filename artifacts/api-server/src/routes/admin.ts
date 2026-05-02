/**
 * Admin routes — protected by requireAdmin middleware.
 * Accessible at /api/admin/*
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { desc, eq, count, sql, and, gte } from "drizzle-orm";
import {
  db,
  usersTable,
  virtualNumbersTable,
  transactionsTable,
  securityEventsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { blockUser, logSecurityEvent } from "../lib/fraud-detection";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  if (!req.user.isAdmin) { res.status(403).json({ error: "Accès réservé aux administrateurs" }); return; }
  next();
}

/* ─── Platform stats ─── */
router.get("/admin/stats", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalUsersRow] = await db.select({ c: count() }).from(usersTable);
  const [totalNumbersRow] = await db.select({ c: count() }).from(virtualNumbersTable);
  const [totalTxRow] = await db.select({ c: count() }).from(transactionsTable);

  const revenueRows = await db
    .select({ amount: transactionsTable.amount })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.type, "recharge"), eq(transactionsTable.status, "completed")));
  const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);

  const todayUsers = await db
    .select({ c: count() })
    .from(usersTable)
    .where(gte(usersTable.createdAt, today));

  const weeklyTx = await db
    .select({ c: count() })
    .from(transactionsTable)
    .where(gte(transactionsTable.createdAt, weekAgo));

  const blockedUsers = await db
    .select({ c: count() })
    .from(usersTable)
    .where(eq(usersTable.status, "Bloqué"));

  const criticalEvents = await db
    .select({ c: count() })
    .from(securityEventsTable)
    .where(and(
      eq(securityEventsTable.severity, "critical"),
      gte(securityEventsTable.createdAt, weekAgo),
    ));

  res.json({
    totalUsers: totalUsersRow?.c ?? 0,
    totalNumbers: totalNumbersRow?.c ?? 0,
    totalTransactions: totalTxRow?.c ?? 0,
    totalRevenueFcfa: totalRevenue,
    newUsersToday: todayUsers[0]?.c ?? 0,
    weeklyTransactions: weeklyTx[0]?.c ?? 0,
    blockedUsers: blockedUsers[0]?.c ?? 0,
    criticalEventsThisWeek: criticalEvents[0]?.c ?? 0,
  });
});

/* ─── User list ─── */
router.get("/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const rows = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      phone: usersTable.phone,
      email: usersTable.email,
      balance: usersTable.balance,
      status: usersTable.status,
      riskScore: usersTable.riskScore,
      isAdmin: usersTable.isAdmin,
      verified: usersTable.verified,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows);
});

/* ─── Single user detail ─── */
router.get("/admin/users/:userId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

  const numbers = await db
    .select()
    .from(virtualNumbersTable)
    .where(eq(virtualNumbersTable.userId, userId))
    .orderBy(desc(virtualNumbersTable.createdAt))
    .limit(20);

  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(20);

  const securityEvents = await db
    .select()
    .from(securityEventsTable)
    .where(eq(securityEventsTable.userId, userId))
    .orderBy(desc(securityEventsTable.createdAt))
    .limit(20);

  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser, numbers, transactions, securityEvents });
});

/* ─── Block user ─── */
router.post("/admin/users/:userId/block", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  const reason = String(req.body?.reason || "Bloqué par un administrateur");

  await blockUser(userId, reason);
  await logSecurityEvent({
    userId,
    eventType: "admin_block_user",
    severity: "high",
    ip: req.ip,
    details: { reason, adminId: req.user!.id },
  });

  logger.warn({ userId, adminId: req.user!.id, reason }, "[ADMIN] User blocked");
  res.json({ success: true, message: "Utilisateur bloqué" });
});

/* ─── Unblock user ─── */
router.post("/admin/users/:userId/unblock", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  await db
    .update(usersTable)
    .set({ status: "Standard", blockedReason: null })
    .where(eq(usersTable.id, userId));

  await logSecurityEvent({
    userId,
    eventType: "admin_unblock_user",
    severity: "low",
    ip: req.ip,
    details: { adminId: req.user!.id },
  });

  res.json({ success: true, message: "Utilisateur débloqué" });
});

/* ─── Security events ─── */
router.get("/admin/security-events", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const severity = req.query.severity as string | undefined;

  const rows = await db
    .select()
    .from(securityEventsTable)
    .where(severity ? eq(securityEventsTable.severity, severity) : undefined)
    .orderBy(desc(securityEventsTable.createdAt))
    .limit(limit);

  res.json(rows);
});

/* ─── Promote user to admin ─── */
router.post("/admin/users/:userId/promote", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, userId));
  res.json({ success: true });
});

export default router;
