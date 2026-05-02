/**
 * Admin routes — protected by requireAdmin middleware.
 * Accessible at /api/admin/*
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { desc, eq, count, sql, and, gte, like, or } from "drizzle-orm";
import {
  db,
  usersTable,
  virtualNumbersTable,
  transactionsTable,
  securityEventsTable,
  servicesTable,
  countriesTable,
  apiProvidersTable,
  systemSettingsTable,
  adminLogsTable,
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

async function logAdminAction(
  adminId: string,
  action: string,
  ip: string | undefined,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>,
) {
  await db.insert(adminLogsTable).values({ adminId, action, targetType, targetId, details, ip });
}

/* ─────────────────── DASHBOARD STATS ─────────────────── */
router.get("/admin/stats", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalUsersRow] = await db.select({ c: count() }).from(usersTable);
  const [totalNumbersRow] = await db.select({ c: count() }).from(virtualNumbersTable);
  const [totalTxRow] = await db.select({ c: count() }).from(transactionsTable);

  const revenueRows = await db
    .select({ amount: transactionsTable.amount })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.type, "recharge"), eq(transactionsTable.status, "completed")));
  const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);

  const monthlyRevenueRows = await db
    .select({ amount: transactionsTable.amount })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.type, "recharge"),
      eq(transactionsTable.status, "completed"),
      gte(transactionsTable.createdAt, monthAgo),
    ));
  const monthlyRevenue = monthlyRevenueRows.reduce((s, r) => s + r.amount, 0);

  const [newUsersToday] = await db.select({ c: count() }).from(usersTable).where(gte(usersTable.createdAt, today));
  const [weeklyTx] = await db.select({ c: count() }).from(transactionsTable).where(gte(transactionsTable.createdAt, weekAgo));
  const [blockedUsers] = await db.select({ c: count() }).from(usersTable).where(eq(usersTable.status, "Bloqué"));
  const [criticalEvents] = await db.select({ c: count() }).from(securityEventsTable)
    .where(and(eq(securityEventsTable.severity, "critical"), gte(securityEventsTable.createdAt, weekAgo)));
  const [activeNumbers] = await db.select({ c: count() }).from(virtualNumbersTable).where(eq(virtualNumbersTable.status, "waiting"));
  const [totalProviders] = await db.select({ c: count() }).from(apiProvidersTable);
  const [activeProviders] = await db.select({ c: count() }).from(apiProvidersTable).where(eq(apiProvidersTable.active, true));

  res.json({
    totalUsers: totalUsersRow?.c ?? 0,
    totalNumbers: totalNumbersRow?.c ?? 0,
    totalTransactions: totalTxRow?.c ?? 0,
    totalRevenueFcfa: totalRevenue,
    monthlyRevenueFcfa: monthlyRevenue,
    newUsersToday: newUsersToday?.c ?? 0,
    weeklyTransactions: weeklyTx?.c ?? 0,
    blockedUsers: blockedUsers?.c ?? 0,
    criticalEventsThisWeek: criticalEvents?.c ?? 0,
    activeNumbers: activeNumbers?.c ?? 0,
    totalProviders: totalProviders?.c ?? 0,
    activeProviders: activeProviders?.c ?? 0,
  });
});

/* ─────────────────── USER MANAGEMENT ─────────────────── */
router.get("/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const search = req.query.search as string | undefined;

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
    .where(search
      ? or(
          like(usersTable.fullName, `%${search}%`),
          like(usersTable.phone, `%${search}%`),
          like(usersTable.email, `%${search}%`),
        )
      : undefined)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db.select({ c: count() }).from(usersTable)
    .where(search
      ? or(
          like(usersTable.fullName, `%${search}%`),
          like(usersTable.phone, `%${search}%`),
          like(usersTable.email, `%${search}%`),
        )
      : undefined);

  res.json({ users: rows, total: totalRow?.c ?? 0 });
});

router.get("/admin/users/:userId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

  const numbers = await db.select().from(virtualNumbersTable)
    .where(eq(virtualNumbersTable.userId, userId))
    .orderBy(desc(virtualNumbersTable.createdAt)).limit(20);

  const transactions = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt)).limit(20);

  const securityEvents = await db.select().from(securityEventsTable)
    .where(eq(securityEventsTable.userId, userId))
    .orderBy(desc(securityEventsTable.createdAt)).limit(20);

  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser, numbers, transactions, securityEvents });
});

router.post("/admin/users/:userId/block", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  const reason = String(req.body?.reason || "Bloqué par un administrateur");
  await blockUser(userId, reason);
  await logSecurityEvent({ userId, eventType: "admin_block_user", severity: "high", ip: req.ip, details: { reason, adminId: req.user!.id } });
  await logAdminAction(req.user!.id, "block_user", req.ip, "user", userId, { reason });
  logger.warn({ userId, adminId: req.user!.id, reason }, "[ADMIN] User blocked");
  res.json({ success: true, message: "Utilisateur bloqué" });
});

router.post("/admin/users/:userId/unblock", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  await db.update(usersTable).set({ status: "Standard", blockedReason: null }).where(eq(usersTable.id, userId));
  await logSecurityEvent({ userId, eventType: "admin_unblock_user", severity: "low", ip: req.ip, details: { adminId: req.user!.id } });
  await logAdminAction(req.user!.id, "unblock_user", req.ip, "user", userId);
  res.json({ success: true, message: "Utilisateur débloqué" });
});

router.post("/admin/users/:userId/promote", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, userId));
  await logAdminAction(req.user!.id, "promote_admin", req.ip, "user", userId);
  res.json({ success: true });
});

router.post("/admin/users/:userId/demote", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  if (userId === req.user!.id) { res.status(400).json({ error: "Impossible de se rétrograder soi-même" }); return; }
  await db.update(usersTable).set({ isAdmin: false }).where(eq(usersTable.id, userId));
  await logAdminAction(req.user!.id, "demote_admin", req.ip, "user", userId);
  res.json({ success: true });
});

router.post("/admin/users/:userId/adjust-balance", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  const amount = Number(req.body?.amount);
  const reason = String(req.body?.reason || "Ajustement administrateur");

  if (isNaN(amount) || amount === 0) { res.status(400).json({ error: "Montant invalide" }); return; }

  const [user] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

  const newBalance = Math.max(0, user.balance + amount);
  await db.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.id, userId));
  await db.insert(transactionsTable).values({
    userId,
    type: amount > 0 ? "recharge" : "purchase",
    amount: Math.abs(amount),
    status: "completed",
    description: reason,
  });
  await logAdminAction(req.user!.id, "adjust_balance", req.ip, "user", userId, { amount, reason, newBalance });
  res.json({ success: true, newBalance });
});

router.delete("/admin/users/:userId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  if (userId === req.user!.id) { res.status(400).json({ error: "Impossible de supprimer votre propre compte" }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await logAdminAction(req.user!.id, "delete_user", req.ip, "user", userId);
  res.json({ success: true });
});

/* ─────────────────── SERVICES MANAGEMENT ─────────────────── */
router.get("/admin/services", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(servicesTable).orderBy(servicesTable.sortOrder, servicesTable.name);
  res.json(rows);
});

router.put("/admin/services/:serviceId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const serviceId = String(req.params.serviceId);
  const { name, price, available, color, category, popular, scope } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (price !== undefined) updates.price = Number(price);
  if (available !== undefined) updates.available = Number(available);
  if (color !== undefined) updates.color = String(color);
  if (category !== undefined) updates.category = String(category);
  if (popular !== undefined) updates.popular = Boolean(popular);
  if (scope !== undefined) updates.scope = String(scope);

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Aucun champ à mettre à jour" }); return; }
  await db.update(servicesTable).set(updates).where(eq(servicesTable.id, serviceId));
  await logAdminAction(req.user!.id, "update_service", req.ip, "service", serviceId, updates);
  res.json({ success: true });
});

/* ─────────────────── COUNTRIES MANAGEMENT ─────────────────── */
router.get("/admin/countries", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(countriesTable).orderBy(countriesTable.sortOrder, countriesTable.name);
  res.json(rows);
});

router.put("/admin/countries/:countryId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const countryId = String(req.params.countryId);
  const { price, available, popular } = req.body;

  const updates: Record<string, unknown> = {};
  if (price !== undefined) updates.price = Number(price);
  if (available !== undefined) updates.available = Number(available);
  if (popular !== undefined) updates.popular = Boolean(popular);

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Aucun champ à mettre à jour" }); return; }
  await db.update(countriesTable).set(updates).where(eq(countriesTable.id, countryId));
  await logAdminAction(req.user!.id, "update_country", req.ip, "country", countryId, updates);
  res.json({ success: true });
});

/* ─────────────────── ORDERS MANAGEMENT ─────────────────── */
router.get("/admin/orders", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const rows = await db
    .select({
      id: virtualNumbersTable.id,
      phoneNumber: virtualNumbersTable.phoneNumber,
      status: virtualNumbersTable.status,
      price: virtualNumbersTable.price,
      expiresAt: virtualNumbersTable.expiresAt,
      createdAt: virtualNumbersTable.createdAt,
      userId: virtualNumbersTable.userId,
      userFullName: usersTable.fullName,
      userPhone: usersTable.phone,
      serviceName: servicesTable.name,
      countryName: countriesTable.name,
      countryFlag: countriesTable.flag,
    })
    .from(virtualNumbersTable)
    .leftJoin(usersTable, eq(virtualNumbersTable.userId, usersTable.id))
    .leftJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
    .leftJoin(countriesTable, eq(virtualNumbersTable.countryId, countriesTable.id))
    .orderBy(desc(virtualNumbersTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db.select({ c: count() }).from(virtualNumbersTable);
  res.json({ orders: rows, total: totalRow?.c ?? 0 });
});

router.post("/admin/orders/:orderId/cancel", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const orderId = String(req.params.orderId);
  const [order] = await db.select().from(virtualNumbersTable).where(eq(virtualNumbersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Commande introuvable" }); return; }

  await db.update(virtualNumbersTable).set({ status: "cancelled" }).where(eq(virtualNumbersTable.id, orderId));
  await db.update(usersTable)
    .set({ balance: sql`${usersTable.balance} + ${order.price}` })
    .where(eq(usersTable.id, order.userId));
  await db.insert(transactionsTable).values({
    userId: order.userId,
    type: "refund",
    amount: order.price,
    status: "completed",
    description: `Remboursement commande ${order.phoneNumber} (annulée par admin)`,
  });
  await logAdminAction(req.user!.id, "cancel_order", req.ip, "order", orderId, { phoneNumber: order.phoneNumber, price: order.price });
  res.json({ success: true, message: "Commande annulée et remboursée" });
});

/* ─────────────────── API PROVIDERS ─────────────────── */
router.get("/admin/api-providers", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(apiProvidersTable).orderBy(apiProvidersTable.priority);
  res.json(rows);
});

router.post("/admin/api-providers", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { name, slug, apiKey, baseUrl, active, priority, markup } = req.body;
  if (!name || !slug) { res.status(400).json({ error: "Nom et slug requis" }); return; }

  const [provider] = await db.insert(apiProvidersTable).values({
    name: String(name),
    slug: String(slug),
    apiKey: String(apiKey || ""),
    baseUrl: String(baseUrl || ""),
    active: Boolean(active),
    priority: Number(priority || 1),
    markup: Number(markup || 20),
  }).returning();

  await logAdminAction(req.user!.id, "create_provider", req.ip, "provider", provider.id, { name, slug });
  res.status(201).json(provider);
});

router.put("/admin/api-providers/:providerId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const providerId = String(req.params.providerId);
  const { name, apiKey, baseUrl, active, priority, markup } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (apiKey !== undefined) updates.apiKey = String(apiKey);
  if (baseUrl !== undefined) updates.baseUrl = String(baseUrl);
  if (active !== undefined) updates.active = Boolean(active);
  if (priority !== undefined) updates.priority = Number(priority);
  if (markup !== undefined) updates.markup = Number(markup);

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Aucun champ à mettre à jour" }); return; }
  await db.update(apiProvidersTable).set(updates).where(eq(apiProvidersTable.id, providerId));
  await logAdminAction(req.user!.id, "update_provider", req.ip, "provider", providerId, updates);
  res.json({ success: true });
});

router.delete("/admin/api-providers/:providerId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const providerId = String(req.params.providerId);
  await db.delete(apiProvidersTable).where(eq(apiProvidersTable.id, providerId));
  await logAdminAction(req.user!.id, "delete_provider", req.ip, "provider", providerId);
  res.json({ success: true });
});

/* ─────────────────── SYSTEM SETTINGS ─────────────────── */
router.get("/admin/settings", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(systemSettingsTable);
  const settings: Record<string, string> = {};
  for (const row of rows) { settings[row.key] = row.value; }
  res.json(settings);
});

router.put("/admin/settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") { res.status(400).json({ error: "Données invalides" }); return; }

  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(systemSettingsTable)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(value) } });
  }
  await logAdminAction(req.user!.id, "update_settings", req.ip, "settings", undefined, updates);
  res.json({ success: true });
});

/* ─────────────────── SECURITY EVENTS ─────────────────── */
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

/* ─────────────────── ADMIN LOGS ─────────────────── */
router.get("/admin/logs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await db
    .select({
      id: adminLogsTable.id,
      action: adminLogsTable.action,
      targetType: adminLogsTable.targetType,
      targetId: adminLogsTable.targetId,
      details: adminLogsTable.details,
      ip: adminLogsTable.ip,
      createdAt: adminLogsTable.createdAt,
      adminName: usersTable.fullName,
    })
    .from(adminLogsTable)
    .leftJoin(usersTable, eq(adminLogsTable.adminId, usersTable.id))
    .orderBy(desc(adminLogsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

/* ─────────────────── TRANSACTIONS ─────────────────── */
router.get("/admin/transactions", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const rows = await db
    .select({
      id: transactionsTable.id,
      type: transactionsTable.type,
      amount: transactionsTable.amount,
      status: transactionsTable.status,
      method: transactionsTable.method,
      description: transactionsTable.description,
      createdAt: transactionsTable.createdAt,
      userFullName: usersTable.fullName,
      userPhone: usersTable.phone,
    })
    .from(transactionsTable)
    .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db.select({ c: count() }).from(transactionsTable);
  res.json({ transactions: rows, total: totalRow?.c ?? 0 });
});

export default router;
