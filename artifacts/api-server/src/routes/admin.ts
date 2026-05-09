/**
 * Admin routes — protected by requireAdmin middleware.
 * Accessible at /api/admin/*
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { desc, eq, count, sql, and, gte, like, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
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
  paymentMethodsTable,
  sessionsTable,
  countryPaymentConfigsTable,
} from "@workspace/db";

import { blockUser, logSecurityEvent } from "../lib/fraud-detection";
import { logger } from "../lib/logger";
import { clearSettingsCache } from "../lib/settings";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";

const router: IRouter = Router();

/* JWT must be verified first on all admin routes */
router.use(requireAdminJwt);

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  /* requireAdminJwt already verified the JWT — if adminPayload is set, access is granted */
  if (req.adminPayload) { next(); return; }
  /* Fallback: legacy session-based check */
  if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  if (!req.user.isAdmin) { res.status(403).json({ error: "Accès réservé aux administrateurs" }); return; }
  next();
}

function adminId(req: Request): string {
  return req.adminPayload?.sub ?? req.user?.id ?? "unknown";
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
router.get("/admin/stats", requireAdmin, async (req, res): Promise<void> => {
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
  const [restrictedUsers] = await db.select({ c: count() }).from(usersTable).where(eq(usersTable.isRestricted, true));

  res.json({
    totalUsers: totalUsersRow?.c ?? 0,
    totalNumbers: totalNumbersRow?.c ?? 0,
    totalTransactions: totalTxRow?.c ?? 0,
    totalRevenueFcfa: totalRevenue,
    monthlyRevenueFcfa: monthlyRevenue,
    newUsersToday: newUsersToday?.c ?? 0,
    weeklyTransactions: weeklyTx?.c ?? 0,
    blockedUsers: blockedUsers?.c ?? 0,
    restrictedUsers: restrictedUsers?.c ?? 0,
    criticalEventsThisWeek: criticalEvents?.c ?? 0,
    activeNumbers: activeNumbers?.c ?? 0,
    totalProviders: totalProviders?.c ?? 0,
    activeProviders: activeProviders?.c ?? 0,
  });
});

/* ─────────────────── USER MANAGEMENT ─────────────────── */
router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const search = req.query.search as string | undefined;

  const rows = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      username: usersTable.username,
      phone: usersTable.phone,
      email: usersTable.email,
      country: usersTable.country,
      balance: usersTable.balance,
      status: usersTable.status,
      riskScore: usersTable.riskScore,
      isAdmin: usersTable.isAdmin,
      verified: usersTable.verified,
      isRestricted: usersTable.isRestricted,
      maxPurchasesPerMin: usersTable.maxPurchasesPerMin,
      maxBalance: usersTable.maxBalance,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(search
      ? or(
          like(usersTable.fullName, `%${search}%`),
          like(usersTable.phone, `%${search}%`),
          like(usersTable.email, `%${search}%`),
          like(usersTable.username, `%${search}%`),
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

router.get("/admin/users/:userId", requireAdmin, async (req, res): Promise<void> => {
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

router.post("/admin/users/:userId/block", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  const reason = String(req.body?.reason || "Bloqué par un administrateur");
  await blockUser(userId, reason);
  await logSecurityEvent({ userId, eventType: "admin_block_user", severity: "high", ip: req.ip, details: { reason, adminId: req.user!.id } });
  await logAdminAction(adminId(req), "block_user", req.ip, "user", userId, { reason });
  logger.warn({ userId, adminId: req.user!.id, reason }, "[ADMIN] User blocked");
  res.json({ success: true, message: "Utilisateur bloqué" });
});

router.post("/admin/users/:userId/unblock", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  await db.update(usersTable).set({ status: "Standard", blockedReason: null }).where(eq(usersTable.id, userId));
  await logSecurityEvent({ userId, eventType: "admin_unblock_user", severity: "low", ip: req.ip, details: { adminId: req.user!.id } });
  await logAdminAction(adminId(req), "unblock_user", req.ip, "user", userId);
  res.json({ success: true, message: "Utilisateur débloqué" });
});

router.post("/admin/users/:userId/promote", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, userId));
  await logAdminAction(adminId(req), "promote_admin", req.ip, "user", userId);
  res.json({ success: true });
});

router.post("/admin/users/:userId/demote", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  if (userId === req.user!.id) { res.status(400).json({ error: "Impossible de se rétrograder soi-même" }); return; }
  await db.update(usersTable).set({ isAdmin: false }).where(eq(usersTable.id, userId));
  await logAdminAction(adminId(req), "demote_admin", req.ip, "user", userId);
  res.json({ success: true });
});

router.post("/admin/users/:userId/adjust-balance", requireAdmin, async (req, res): Promise<void> => {
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
  await logAdminAction(adminId(req), "adjust_balance", req.ip, "user", userId, { amount, reason, newBalance });
  res.json({ success: true, newBalance });
});

router.post("/admin/users/:userId/set-limits", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  const { maxPurchasesPerMin, maxBalance, isRestricted } = req.body;

  const updates: Record<string, unknown> = {};
  if (maxPurchasesPerMin !== undefined) updates.maxPurchasesPerMin = Math.max(1, Number(maxPurchasesPerMin));
  if (maxBalance !== undefined) updates.maxBalance = Math.max(0, Number(maxBalance));
  if (isRestricted !== undefined) updates.isRestricted = Boolean(isRestricted);

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Aucun champ à mettre à jour" }); return; }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));
  await logAdminAction(adminId(req), "set_user_limits", req.ip, "user", userId, updates);
  res.json({ success: true, limits: updates });
});

router.post("/admin/users/:userId/reset-password", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);

  const [user] = await db.select({ id: usersTable.id, fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!";
  const newPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));
  await logAdminAction(adminId(req), "reset_password", req.ip, "user", userId, { note: "Password was reset by admin" });
  logger.warn({ userId, adminId: req.user!.id }, "[ADMIN] User password reset");

  res.json({ success: true, newPassword, message: `Le mot de passe de ${user.fullName} a été réinitialisé` });
});

router.post("/admin/users/:userId/force-logout", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);

  const [user] = await db.select({ id: usersTable.id, fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
  await logAdminAction(adminId(req), "force_logout", req.ip, "user", userId);
  res.json({ success: true, message: `${user.fullName} a été déconnecté de force` });
});

router.delete("/admin/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId);
  if (userId === req.user!.id) { res.status(400).json({ error: "Impossible de supprimer votre propre compte" }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await logAdminAction(adminId(req), "delete_user", req.ip, "user", userId);
  res.json({ success: true });
});

/* ─────────────────── SERVICES MANAGEMENT ─────────────────── */
router.get("/admin/services", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(servicesTable).orderBy(servicesTable.sortOrder, servicesTable.name);
  res.json(rows);
});

router.put("/admin/services/:serviceId", requireAdmin, async (req, res): Promise<void> => {
  const serviceId = String(req.params.serviceId);
  const { name, price, providerPrice, margin, available, color, category, popular, scope, enabled } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (price !== undefined) updates.price = Number(price);
  if (providerPrice !== undefined) updates.providerPrice = Number(providerPrice);
  if (margin !== undefined) updates.margin = Number(margin);
  if (available !== undefined) updates.available = Number(available);
  if (color !== undefined) updates.color = String(color);
  if (category !== undefined) updates.category = String(category);
  if (popular !== undefined) updates.popular = Boolean(popular);
  if (scope !== undefined) updates.scope = String(scope);
  if (enabled !== undefined) updates.enabled = Boolean(enabled);

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Aucun champ à mettre à jour" }); return; }

  if (updates.providerPrice !== undefined && updates.margin !== undefined) {
    const pp = Number(updates.providerPrice);
    const m = Number(updates.margin);
    if (pp > 0) updates.price = Math.round(pp + pp * (m / 100));
  }

  await db.update(servicesTable).set(updates).where(eq(servicesTable.id, serviceId));
  await logAdminAction(adminId(req), "update_service", req.ip, "service", serviceId, updates);
  res.json({ success: true });
});

/* ─────────────────── COUNTRIES MANAGEMENT ─────────────────── */
router.get("/admin/countries", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(countriesTable).orderBy(countriesTable.sortOrder, countriesTable.name);
  res.json(rows);
});

router.put("/admin/countries/:countryId", requireAdmin, async (req, res): Promise<void> => {
  const countryId = String(req.params.countryId);
  const { price, available, popular } = req.body;

  const updates: Record<string, unknown> = {};
  if (price !== undefined) updates.price = Number(price);
  if (available !== undefined) updates.available = Number(available);
  if (popular !== undefined) updates.popular = Boolean(popular);

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Aucun champ à mettre à jour" }); return; }
  await db.update(countriesTable).set(updates).where(eq(countriesTable.id, countryId));
  await logAdminAction(adminId(req), "update_country", req.ip, "country", countryId, updates);
  res.json({ success: true });
});

/* ─────────────────── AFRICAN COUNTRIES SEEDING ─────────────────── */
router.post("/admin/countries/seed-africa", requireAdmin, async (req, res): Promise<void> => {
  const AFRICAN_COUNTRIES = [
    { code: "CI", name: "Côte d'Ivoire",        dialCode: "+225", popular: true,  sortOrder: 1 },
    { code: "SN", name: "Sénégal",               dialCode: "+221", popular: true,  sortOrder: 2 },
    { code: "BF", name: "Burkina Faso",           dialCode: "+226", popular: true,  sortOrder: 3 },
    { code: "ML", name: "Mali",                   dialCode: "+223", popular: true,  sortOrder: 4 },
    { code: "GN", name: "Guinée",                 dialCode: "+224", popular: false, sortOrder: 5 },
    { code: "TG", name: "Togo",                   dialCode: "+228", popular: false, sortOrder: 6 },
    { code: "BJ", name: "Bénin",                  dialCode: "+229", popular: false, sortOrder: 7 },
    { code: "NE", name: "Niger",                  dialCode: "+227", popular: false, sortOrder: 8 },
    { code: "CM", name: "Cameroun",               dialCode: "+237", popular: true,  sortOrder: 9 },
    { code: "CD", name: "RD Congo",               dialCode: "+243", popular: true,  sortOrder: 10 },
    { code: "CG", name: "Congo-Brazzaville",      dialCode: "+242", popular: false, sortOrder: 11 },
    { code: "GA", name: "Gabon",                  dialCode: "+241", popular: false, sortOrder: 12 },
    { code: "TD", name: "Tchad",                  dialCode: "+235", popular: false, sortOrder: 13 },
    { code: "CF", name: "Centrafrique",           dialCode: "+236", popular: false, sortOrder: 14 },
    { code: "GH", name: "Ghana",                  dialCode: "+233", popular: true,  sortOrder: 15 },
    { code: "NG", name: "Nigeria",                dialCode: "+234", popular: true,  sortOrder: 16 },
    { code: "KE", name: "Kenya",                  dialCode: "+254", popular: true,  sortOrder: 17 },
    { code: "TZ", name: "Tanzanie",               dialCode: "+255", popular: false, sortOrder: 18 },
    { code: "UG", name: "Ouganda",                dialCode: "+256", popular: false, sortOrder: 19 },
    { code: "RW", name: "Rwanda",                 dialCode: "+250", popular: false, sortOrder: 20 },
    { code: "ZA", name: "Afrique du Sud",         dialCode: "+27",  popular: true,  sortOrder: 21 },
    { code: "ZM", name: "Zambie",                 dialCode: "+260", popular: false, sortOrder: 22 },
    { code: "MZ", name: "Mozambique",             dialCode: "+258", popular: false, sortOrder: 23 },
    { code: "MG", name: "Madagascar",             dialCode: "+261", popular: false, sortOrder: 24 },
    { code: "MU", name: "Maurice",                dialCode: "+230", popular: false, sortOrder: 25 },
    { code: "DZ", name: "Algérie",                dialCode: "+213", popular: false, sortOrder: 26 },
    { code: "MA", name: "Maroc",                  dialCode: "+212", popular: true,  sortOrder: 27 },
    { code: "TN", name: "Tunisie",                dialCode: "+216", popular: false, sortOrder: 28 },
    { code: "EG", name: "Égypte",                 dialCode: "+20",  popular: true,  sortOrder: 29 },
    { code: "ET", name: "Éthiopie",               dialCode: "+251", popular: false, sortOrder: 30 },
    { code: "AO", name: "Angola",                 dialCode: "+244", popular: false, sortOrder: 31 },
    { code: "GW", name: "Guinée-Bissau",          dialCode: "+245", popular: false, sortOrder: 32 },
    { code: "SL", name: "Sierra Leone",           dialCode: "+232", popular: false, sortOrder: 33 },
    { code: "LR", name: "Liberia",                dialCode: "+231", popular: false, sortOrder: 34 },
    { code: "GM", name: "Gambie",                 dialCode: "+220", popular: false, sortOrder: 35 },
    { code: "MR", name: "Mauritanie",             dialCode: "+222", popular: false, sortOrder: 36 },
    { code: "NA", name: "Namibie",                dialCode: "+264", popular: false, sortOrder: 37 },
    { code: "BW", name: "Botswana",               dialCode: "+267", popular: false, sortOrder: 38 },
    { code: "SD", name: "Soudan",                 dialCode: "+249", popular: false, sortOrder: 39 },
    { code: "SS", name: "Soudan du Sud",          dialCode: "+211", popular: false, sortOrder: 40 },
    { code: "SO", name: "Somalie",                dialCode: "+252", popular: false, sortOrder: 41 },
    { code: "DJ", name: "Djibouti",               dialCode: "+253", popular: false, sortOrder: 42 },
    { code: "ER", name: "Érythrée",               dialCode: "+291", popular: false, sortOrder: 43 },
    { code: "BI", name: "Burundi",                dialCode: "+257", popular: false, sortOrder: 44 },
    { code: "ZW", name: "Zimbabwe",               dialCode: "+263", popular: false, sortOrder: 45 },
    { code: "MW", name: "Malawi",                 dialCode: "+265", popular: false, sortOrder: 46 },
    { code: "KM", name: "Comores",                dialCode: "+269", popular: false, sortOrder: 47 },
    { code: "CV", name: "Cap-Vert",               dialCode: "+238", popular: false, sortOrder: 48 },
    { code: "GQ", name: "Guinée équatoriale",     dialCode: "+240", popular: false, sortOrder: 49 },
    { code: "ST", name: "São Tomé-et-Príncipe",   dialCode: "+239", popular: false, sortOrder: 50 },
    { code: "SC", name: "Seychelles",             dialCode: "+248", popular: false, sortOrder: 51 },
    { code: "LY", name: "Libye",                  dialCode: "+218", popular: false, sortOrder: 52 },
    { code: "SZ", name: "Eswatini",               dialCode: "+268", popular: false, sortOrder: 53 },
    { code: "LS", name: "Lesotho",                dialCode: "+266", popular: false, sortOrder: 54 },
  ];

  function flagEmoji(code: string): string {
    return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join("");
  }

  let inserted = 0;
  let skipped = 0;

  for (const c of AFRICAN_COUNTRIES) {
    const existing = await db.select({ id: countriesTable.id }).from(countriesTable).where(eq(countriesTable.code, c.code));
    if (existing.length > 0) {
      await db.update(countriesTable).set({
        name: c.name, dialCode: c.dialCode, flag: flagEmoji(c.code), popular: c.popular, sortOrder: c.sortOrder,
      }).where(eq(countriesTable.code, c.code));
      skipped++;
    } else {
      await db.insert(countriesTable).values({
        code: c.code, name: c.name, dialCode: c.dialCode, flag: flagEmoji(c.code),
        popular: c.popular, sortOrder: c.sortOrder, available: 0, price: 0,
      });
      inserted++;
    }
  }

  await logAdminAction(adminId(req), "seed_african_countries", req.ip, "countries", "bulk", { inserted, updated: skipped });
  res.json({ success: true, inserted, updated: skipped, total: AFRICAN_COUNTRIES.length });
});

/* ─────────────────── PAYMENT METHODS MANAGEMENT ─────────────────── */
router.get("/admin/payment-methods", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(paymentMethodsTable).orderBy(paymentMethodsTable.sortOrder, paymentMethodsTable.name);
  res.json(rows);
});

router.post("/admin/payment-methods", requireAdmin, async (req, res): Promise<void> => {
  const { name, slug, description, color, logoUrl, recommended, sortOrder } = req.body;
  if (!name || !slug) { res.status(400).json({ error: "Nom et slug requis" }); return; }

  const existing = await db.select({ id: paymentMethodsTable.id }).from(paymentMethodsTable).where(eq(paymentMethodsTable.slug, String(slug))).limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "Ce slug existe déjà" }); return; }

  const [method] = await db.insert(paymentMethodsTable).values({
    name: String(name),
    slug: String(slug),
    description: String(description || ""),
    color: String(color || "#7C3AED"),
    logoUrl: logoUrl ? String(logoUrl) : null,
    recommended: Boolean(recommended),
    sortOrder: Number(sortOrder || 100),
  }).returning();

  await logAdminAction(adminId(req), "create_payment_method", req.ip, "payment_method", method.id, { name, slug });
  res.status(201).json(method);
});

router.put("/admin/payment-methods/:methodId", requireAdmin, async (req, res): Promise<void> => {
  const methodId = String(req.params.methodId);
  const { name, description, color, logoUrl, recommended, sortOrder } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (description !== undefined) updates.description = String(description);
  if (color !== undefined) updates.color = String(color);
  if (logoUrl !== undefined) updates.logoUrl = logoUrl ? String(logoUrl) : null;
  if (recommended !== undefined) updates.recommended = Boolean(recommended);
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Aucun champ à mettre à jour" }); return; }

  await db.update(paymentMethodsTable).set(updates).where(eq(paymentMethodsTable.id, methodId));
  await logAdminAction(adminId(req), "update_payment_method", req.ip, "payment_method", methodId, updates);
  res.json({ success: true });
});

router.delete("/admin/payment-methods/:methodId", requireAdmin, async (req, res): Promise<void> => {
  const methodId = String(req.params.methodId);
  await db.delete(paymentMethodsTable).where(eq(paymentMethodsTable.id, methodId));
  await logAdminAction(adminId(req), "delete_payment_method", req.ip, "payment_method", methodId);
  res.json({ success: true });
});

/* ─────────────────── COUNTRY PAYMENT CONFIGS ─────────────────── */
router.get("/admin/payment-configs", requireAdmin, async (_req, res): Promise<void> => {
  const configs = await db.select().from(countryPaymentConfigsTable);
  const countries = await db.select({
    code: countriesTable.code,
    name: countriesTable.name,
    flag: countriesTable.flag,
  }).from(countriesTable).orderBy(countriesTable.sortOrder, countriesTable.name);
  const methods = await db.select().from(paymentMethodsTable).orderBy(paymentMethodsTable.sortOrder);
  res.json({ configs, countries, methods });
});

router.put("/admin/payment-configs", requireAdmin, async (req, res): Promise<void> => {
  const { countryCode, methodSlug, enabled, minDeposit, feePercent } = req.body;

  if (!countryCode || !methodSlug) {
    res.status(400).json({ error: "countryCode et methodSlug sont requis" });
    return;
  }

  const values = {
    countryCode: String(countryCode),
    methodSlug: String(methodSlug),
    enabled: enabled !== undefined ? Boolean(enabled) : true,
    minDeposit: minDeposit !== undefined ? Number(minDeposit) : 500,
    feePercent: feePercent !== undefined ? Number(feePercent) : 0,
  };

  await db
    .insert(countryPaymentConfigsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [countryPaymentConfigsTable.countryCode, countryPaymentConfigsTable.methodSlug],
      set: { enabled: values.enabled, minDeposit: values.minDeposit, feePercent: values.feePercent },
    });

  await logAdminAction(adminId(req), "update_payment_config", req.ip, "payment_config", undefined, values);
  res.json({ success: true });
});

/* ─────────────────── ORDERS MANAGEMENT ─────────────────── */
router.get("/admin/orders", requireAdmin, async (req, res): Promise<void> => {
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

router.post("/admin/orders/:orderId/cancel", requireAdmin, async (req, res): Promise<void> => {
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
  await logAdminAction(adminId(req), "cancel_order", req.ip, "order", orderId, { phoneNumber: order.phoneNumber, price: order.price });
  res.json({ success: true, message: "Commande annulée et remboursée" });
});

/* ─────────────────── ANALYTICS ─────────────────── */
router.get("/admin/analytics", requireAdmin, async (req, res): Promise<void> => {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  /* Daily revenue + orders */
  const allTx = await db.select({
    amount: transactionsTable.amount,
    type: transactionsTable.type,
    status: transactionsTable.status,
    createdAt: transactionsTable.createdAt,
  }).from(transactionsTable).where(and(gte(transactionsTable.createdAt, since)));

  const dailyMap: Record<string, { revenue: number; orders: number }> = {};
  const userDayMap: Record<string, number> = {};

  for (const tx of allTx) {
    const day = tx.createdAt.toISOString().slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { revenue: 0, orders: 0 };
    if (tx.type === "purchase" && tx.status === "completed") {
      dailyMap[day].revenue += tx.amount;
      dailyMap[day].orders += 1;
    }
  }

  const dailyRevenue = Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    return { date: key, ...(dailyMap[key] ?? { revenue: 0, orders: 0 }) };
  });

  /* Top services */
  const allOrders = await db.select({
    price: virtualNumbersTable.price,
    serviceName: servicesTable.name,
  }).from(virtualNumbersTable)
    .leftJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
    .where(gte(virtualNumbersTable.createdAt, since));

  const svcMap: Record<string, { count: number; revenue: number }> = {};
  for (const o of allOrders) {
    const name = o.serviceName ?? "Inconnu";
    if (!svcMap[name]) svcMap[name] = { count: 0, revenue: 0 };
    svcMap[name].count += 1;
    svcMap[name].revenue += o.price;
  }
  const topServices = Object.entries(svcMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  /* Top countries */
  const allCountryOrders = await db.select({
    countryName: countriesTable.name,
    countryFlag: countriesTable.flag,
  }).from(virtualNumbersTable)
    .leftJoin(countriesTable, eq(virtualNumbersTable.countryId, countriesTable.id))
    .where(gte(virtualNumbersTable.createdAt, since));

  const cntMap: Record<string, { name: string; flag: string; count: number }> = {};
  for (const o of allCountryOrders) {
    const name = o.countryName ?? "Inconnu";
    if (!cntMap[name]) cntMap[name] = { name, flag: o.countryFlag ?? "🌍", count: 0 };
    cntMap[name].count += 1;
  }
  const topCountries = Object.values(cntMap).sort((a, b) => b.count - a.count).slice(0, 8);

  /* Transaction breakdown */
  const txBreakdown = { recharge: 0, purchase: 0, refund: 0 };
  for (const tx of allTx) {
    if (tx.status === "completed") {
      if (tx.type === "recharge") txBreakdown.recharge++;
      else if (tx.type === "purchase") txBreakdown.purchase++;
      else if (tx.type === "refund") txBreakdown.refund++;
    }
  }

  /* User growth */
  const newUsers = await db.select({ createdAt: usersTable.createdAt }).from(usersTable).where(gte(usersTable.createdAt, since));
  const userDayMapFull: Record<string, number> = {};
  for (const u of newUsers) {
    const day = u.createdAt.toISOString().slice(0, 10);
    userDayMapFull[day] = (userDayMapFull[day] ?? 0) + 1;
  }
  const userGrowth = Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    return { date: key, newUsers: userDayMapFull[key] ?? 0 };
  });

  const totalRevenue30d = dailyRevenue.reduce((s, d) => s + d.revenue, 0);
  const totalOrders30d = dailyRevenue.reduce((s, d) => s + d.orders, 0);
  const avgOrderValue = totalOrders30d > 0 ? Math.round(totalRevenue30d / totalOrders30d) : 0;

  res.json({ dailyRevenue, topServices, topCountries, txBreakdown, userGrowth, totalRevenue30d, totalOrders30d, avgOrderValue });
});

/* ─────────────────── API PROVIDERS ─────────────────── */
router.get("/admin/api-providers", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(apiProvidersTable).orderBy(apiProvidersTable.priority);
  res.json(rows);
});

router.post("/admin/api-providers", requireAdmin, async (req, res): Promise<void> => {
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

  await logAdminAction(adminId(req), "create_provider", req.ip, "provider", provider.id, { name, slug });
  res.status(201).json(provider);
});

router.put("/admin/api-providers/:providerId", requireAdmin, async (req, res): Promise<void> => {
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
  await logAdminAction(adminId(req), "update_provider", req.ip, "provider", providerId, updates);
  res.json({ success: true });
});

router.delete("/admin/api-providers/:providerId", requireAdmin, async (req, res): Promise<void> => {
  const providerId = String(req.params.providerId);
  await db.delete(apiProvidersTable).where(eq(apiProvidersTable.id, providerId));
  await logAdminAction(adminId(req), "delete_provider", req.ip, "provider", providerId);
  res.json({ success: true });
});

/* ─── Test provider connection ─── */
router.post("/admin/api-providers/:providerId/test", requireAdmin, async (req, res): Promise<void> => {
  const providerId = String(req.params.providerId);
  const [provider] = await db.select().from(apiProvidersTable).where(eq(apiProvidersTable.id, providerId)).limit(1);
  if (!provider) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  if (provider.slug === "5sim") {
    if (!provider.apiKey) {
      res.json({ success: false, message: "Clé API non configurée" });
      return;
    }
    const { FiveSimClient } = await import("../lib/fivesim");
    const client = new FiveSimClient(provider.apiKey);
    const start = Date.now();
    try {
      const profile = await client.getProfile();
      const latencyMs = Date.now() - start;
      await logAdminAction(adminId(req), "test_provider", req.ip, "provider", providerId, { success: true, latencyMs });
      res.json({
        success: true,
        message: `Connexion réussie (${latencyMs}ms)`,
        latencyMs,
        balance: profile.balance,
        details: { email: profile.email, vendor: profile.vendor, rating: profile.rating },
      });
    } catch (e) {
      res.json({ success: false, message: (e as Error).message, latencyMs: Date.now() - start });
    }
    return;
  }

  /* Generic HTTP ping */
  const baseUrl = provider.baseUrl || "https://api.example.com";
  const start = Date.now();
  try {
    const resp = await fetch(baseUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    const latencyMs = Date.now() - start;
    res.json({ success: resp.ok || resp.status < 500, message: `HTTP ${resp.status} (${latencyMs}ms)`, latencyMs });
  } catch (e) {
    res.json({ success: false, message: (e as Error).message, latencyMs: Date.now() - start });
  }
});

/* ─── Get provider balance ─── */
router.get("/admin/api-providers/:providerId/balance", requireAdmin, async (req, res): Promise<void> => {
  const providerId = String(req.params.providerId);
  const [provider] = await db.select().from(apiProvidersTable).where(eq(apiProvidersTable.id, providerId)).limit(1);
  if (!provider) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  if (provider.slug === "5sim" && provider.apiKey) {
    const { FiveSimClient } = await import("../lib/fivesim");
    const client = new FiveSimClient(provider.apiKey);
    try {
      const profile = await client.getProfile();
      res.json({ balance: profile.balance, currency: "USD" });
      return;
    } catch (e) {
      res.status(503).json({ error: (e as Error).message });
      return;
    }
  }

  res.json(null);
});

/* ─── Sync 5sim products ─── */
router.post("/admin/api-providers/:providerId/sync-products", requireAdmin, async (req, res): Promise<void> => {
  const providerId = String(req.params.providerId);
  const [provider] = await db.select().from(apiProvidersTable).where(eq(apiProvidersTable.id, providerId)).limit(1);
  if (!provider) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  if (provider.slug !== "5sim" || !provider.apiKey) {
    res.status(400).json({ error: "Synchronisation uniquement disponible pour 5sim avec une clé API" });
    return;
  }

  const { FiveSimClient } = await import("../lib/fivesim");
  const client = new FiveSimClient(provider.apiKey);

  try {
    const products = await client.getProducts("france", "any");
    const productNames = Object.keys(products);
    let synced = 0;

    for (const productName of productNames.slice(0, 50)) {
      const existing = await db.select({ id: servicesTable.id }).from(servicesTable)
        .where(eq(servicesTable.slug, productName)).limit(1);
      if (existing.length === 0) {
        const productInfo = products[productName];
        await db.insert(servicesTable).values({
          name: productName.charAt(0).toUpperCase() + productName.slice(1),
          slug: productName,
          price: Math.round((productInfo?.Price ?? 0) * 655 * (1 + provider.markup / 100)),
          providerPrice: Math.round((productInfo?.Price ?? 0) * 655),
          margin: provider.markup,
          available: productInfo?.Qty ?? 100,
          enabled: true,
          sortOrder: 100,
        }).onConflictDoNothing();
        synced++;
      }
    }

    await logAdminAction(adminId(req), "sync_products", req.ip, "provider", providerId, { synced, total: productNames.length });
    res.json({ synced, message: `${synced} nouveaux services synchronisés depuis 5sim` });
  } catch (e) {
    res.status(503).json({ error: (e as Error).message });
  }
});

/* ─────────────────── SYSTEM SETTINGS ─────────────────── */
router.get("/admin/settings", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(systemSettingsTable);
  const settings: Record<string, string> = {};
  for (const row of rows) { settings[row.key] = row.value; }
  res.json(settings);
});

router.put("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") { res.status(400).json({ error: "Données invalides" }); return; }

  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(systemSettingsTable)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(value) } });
  }

  /* Invalidate settings cache so changes apply within 30s */
  clearSettingsCache();

  await logAdminAction(adminId(req), "update_settings", req.ip, "settings", undefined, updates);
  res.json({ success: true });
});

/* ─────────────────── SECURITY EVENTS ─────────────────── */
router.get("/admin/security-events", requireAdmin, async (req, res): Promise<void> => {
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
router.get("/admin/logs", requireAdmin, async (req, res): Promise<void> => {
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
router.get("/admin/transactions", requireAdmin, async (req, res): Promise<void> => {
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
