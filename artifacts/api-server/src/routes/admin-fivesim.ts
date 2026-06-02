/**
 * Admin — 5sim Vendor & Monitoring
 *
 * Donne accès aux données du compte 5sim depuis le panneau admin :
 *   GET  /admin/fivesim/profile    — profil + solde USD
 *   GET  /admin/fivesim/statistic  — statistiques vendeur (commandes, revenus)
 *   GET  /admin/fivesim/wallets    — réserves de portefeuille
 *   GET  /admin/fivesim/orders     — historique des commandes 5sim
 *   GET  /admin/fivesim/payments   — historique des paiements 5sim
 *   GET  /admin/fivesim/flash      — notifications flash de la plateforme 5sim
 *   GET  /admin/fivesim/prices     — liste des prix vendeur
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, lt, isNotNull, sql, desc, or } from "drizzle-orm";
import { db, apiProvidersTable, virtualNumbersTable, smsMessagesTable, usersTable, transactionsTable, servicesTable } from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { FiveSimClient, FiveSimError } from "../lib/fivesim";
import { logger } from "../lib/logger";
import { triggerAutoRefundSweep } from "../lib/fivesim-poller";

const router: IRouter = Router();

/* ─── Helper: get active 5sim client ──────────────────────────── */
async function get5SimClient(): Promise<FiveSimClient | null> {
  const [provider] = await db
    .select()
    .from(apiProvidersTable)
    .where(and(eq(apiProvidersTable.slug, "5sim"), eq(apiProvidersTable.active, true)))
    .limit(1);
  if (!provider?.apiKey) return null;
  return new FiveSimClient(provider.apiKey);
}

function handle5SimError(e: unknown, res: Response): void {
  if (e instanceof FiveSimError) {
    logger.warn({ status: e.status, path: e.path, body: e.body }, "[admin-5sim] API error");
    res.status(e.status === 401 ? 401 : 502).json({
      error: `Erreur 5sim (${e.status}): ${e.body}`,
    });
  } else {
    logger.error({ err: (e as Error).message }, "[admin-5sim] Unexpected error");
    res.status(500).json({ error: "Erreur serveur inattendue" });
  }
}

/* ─── Profil + solde ──────────────────────────────────────────── */
router.get("/admin/fivesim/profile", requireAdminJwt, async (req, res): Promise<void> => {
  const client = await get5SimClient();
  if (!client) { res.status(503).json({ error: "Fournisseur 5sim non configuré ou inactif" }); return; }
  try {
    const profile = await client.getProfile();
    res.json(profile);
  } catch (e) {
    handle5SimError(e, res as any);
  }
});

/* ─── Statistiques vendeur ────────────────────────────────────── */
router.get("/admin/fivesim/statistic", requireAdminJwt, async (req, res): Promise<void> => {
  const client = await get5SimClient();
  if (!client) { res.status(503).json({ error: "Fournisseur 5sim non configuré ou inactif" }); return; }
  try {
    const stat = await client.getVendorStatistic();
    res.json(stat);
  } catch (e) {
    handle5SimError(e, res as any);
  }
});

/* ─── Réserves portefeuille ───────────────────────────────────── */
router.get("/admin/fivesim/wallets", requireAdminJwt, async (req, res): Promise<void> => {
  const client = await get5SimClient();
  if (!client) { res.status(503).json({ error: "Fournisseur 5sim non configuré ou inactif" }); return; }
  try {
    const wallets = await client.getVendorWallets();
    res.json(wallets);
  } catch (e) {
    handle5SimError(e, res as any);
  }
});

/* ─── Historique commandes ────────────────────────────────────── */
router.get("/admin/fivesim/orders", requireAdminJwt, async (req, res): Promise<void> => {
  const client = await get5SimClient();
  if (!client) { res.status(503).json({ error: "Fournisseur 5sim non configuré ou inactif" }); return; }
  const category = (req.query.category as "activation" | "hosting") ?? "activation";
  const limit  = Math.min(Number(req.query.limit)  || 15, 100);
  const offset = Number(req.query.offset) || 0;
  try {
    const orders = await client.getVendorOrders({ category, limit, offset, reverse: true });
    res.json(orders);
  } catch (e) {
    handle5SimError(e, res as any);
  }
});

/* ─── Historique paiements ────────────────────────────────────── */
router.get("/admin/fivesim/payments", requireAdminJwt, async (req, res): Promise<void> => {
  const client = await get5SimClient();
  if (!client) { res.status(503).json({ error: "Fournisseur 5sim non configuré ou inactif" }); return; }
  const limit  = Math.min(Number(req.query.limit)  || 15, 100);
  const offset = Number(req.query.offset) || 0;
  try {
    const payments = await client.getVendorPayments({ limit, offset, reverse: true });
    res.json(payments);
  } catch (e) {
    handle5SimError(e, res as any);
  }
});

/* ─── Notifications flash de la plateforme ───────────────────── */
router.get("/admin/fivesim/flash", requireAdminJwt, async (req, res): Promise<void> => {
  const client = await get5SimClient();
  if (!client) { res.status(503).json({ error: "Fournisseur 5sim non configuré ou inactif" }); return; }
  const lang = (req.query.lang as "en" | "ru") ?? "en";
  try {
    const flash = await client.getFlash(lang);
    res.json(flash);
  } catch (e) {
    handle5SimError(e, res as any);
  }
});

/* ─── Prix vendeur ────────────────────────────────────────────── */
router.get("/admin/fivesim/prices", requireAdminJwt, async (req, res): Promise<void> => {
  const client = await get5SimClient();
  if (!client) { res.status(503).json({ error: "Fournisseur 5sim non configuré ou inactif" }); return; }
  const page    = Number(req.query.page)    || 1;
  const perPage = Math.min(Number(req.query.perPage) || 15, 100);
  const countryName  = req.query.country  as string | undefined;
  const productName  = req.query.product  as string | undefined;
  const operatorName = req.query.operator as string | undefined;
  try {
    const prices = await client.getVendorPrices({ page, perPage, countryName, productName, operatorName });
    res.json(prices);
  } catch (e) {
    handle5SimError(e, res as any);
  }
});

/* ─── Compte utilisateur 5sim (historique personnel) ─────────── */
router.get("/admin/fivesim/user/orders", requireAdminJwt, async (req, res): Promise<void> => {
  const client = await get5SimClient();
  if (!client) { res.status(503).json({ error: "Fournisseur 5sim non configuré ou inactif" }); return; }
  const category = (req.query.category as "activation" | "hosting") ?? "activation";
  const limit  = Math.min(Number(req.query.limit)  || 15, 100);
  const offset = Number(req.query.offset) || 0;
  try {
    const orders = await client.getUserOrders({ category, limit, offset, reverse: true });
    res.json(orders);
  } catch (e) {
    handle5SimError(e, res as any);
  }
});

router.get("/admin/fivesim/user/payments", requireAdminJwt, async (req, res): Promise<void> => {
  const client = await get5SimClient();
  if (!client) { res.status(503).json({ error: "Fournisseur 5sim non configuré ou inactif" }); return; }
  const limit  = Math.min(Number(req.query.limit)  || 15, 100);
  const offset = Number(req.query.offset) || 0;
  try {
    const payments = await client.getUserPayments({ limit, offset, reverse: true });
    res.json(payments);
  } catch (e) {
    handle5SimError(e, res as any);
  }
});

/* ─── Pending refunds: numéros bloqués en "waiting" ──────────── */

router.get("/admin/fivesim/pending-refunds", requireAdminJwt, async (_req, res): Promise<void> => {
  const cutoff30 = new Date(Date.now() - 30 * 60 * 1_000);
  try {
    const rows = await db
      .select({
        id:             virtualNumbersTable.id,
        phoneNumber:    virtualNumbersTable.phoneNumber,
        status:         virtualNumbersTable.status,
        price:          virtualNumbersTable.price,
        createdAt:      virtualNumbersTable.createdAt,
        expiresAt:      virtualNumbersTable.expiresAt,
        externalOrderId: virtualNumbersTable.externalOrderId,
        userId:         virtualNumbersTable.userId,
        userPhone:      usersTable.phone,
        userBalance:    usersTable.balance,
        smsCount:       sql<number>`(SELECT count(*)::int FROM sms_messages sm WHERE sm.number_id = ${virtualNumbersTable.id})`,
      })
      .from(virtualNumbersTable)
      .leftJoin(usersTable, eq(usersTable.id, virtualNumbersTable.userId))
      .where(
        and(
          eq(virtualNumbersTable.status, "waiting"),
          lt(virtualNumbersTable.createdAt, cutoff30),
          isNotNull(virtualNumbersTable.externalOrderId),
        ),
      )
      .orderBy(virtualNumbersTable.createdAt);

    res.json({ pendingRefunds: rows, count: rows.length });
  } catch (e) {
    logger.error({ err: (e as Error).message }, "Error fetching pending refunds");
    res.status(500).json({ error: "Erreur lors de la récupération des remboursements en attente" });
  }
});

/* ─── Manual trigger: déclencher le sweep de remboursement ────── */

router.post("/admin/fivesim/trigger-refund-sweep", requireAdminJwt, async (_req, res): Promise<void> => {
  try {
    logger.info("[admin] Manual auto-refund sweep triggered");
    const result = await triggerAutoRefundSweep();
    res.json({
      success: true,
      message: `Sweep terminé : ${result.refunded} remboursement(s) effectué(s), ${result.processed} numéro(s) traité(s), ${result.errors} erreur(s).`,
      ...result,
    });
  } catch (e) {
    logger.error({ err: (e as Error).message }, "Error in manual refund sweep");
    res.status(500).json({ error: "Erreur lors du sweep de remboursement" });
  }
});

/* ─── Historique et statistiques des remboursements automatiques ── */
router.get("/admin/fivesim/refund-stats", requireAdminJwt, async (_req, res): Promise<void> => {
  try {
    /* 1. Vue d'ensemble depuis la table transactions */
    const [overview] = await db.select({
      totalRefunds:    sql<number>`count(*) filter (where type = 'refund')::int`,
      totalAmount:     sql<number>`coalesce(sum(amount) filter (where type = 'refund'), 0)::int`,
      purchaseCount:   sql<number>`count(*) filter (where type = 'purchase')::int`,
      avgRefundAmount: sql<number>`coalesce(avg(amount) filter (where type = 'refund'), 0)::int`,
      last30Refunds:   sql<number>`count(*) filter (where type = 'refund' and created_at >= now() - interval '30 days')::int`,
      last30Amount:    sql<number>`coalesce(sum(amount) filter (where type = 'refund' and created_at >= now() - interval '30 days'), 0)::int`,
    }).from(transactionsTable);

    const successRate = (overview.purchaseCount ?? 0) > 0
      ? Math.max(0, Math.round((1 - (overview.totalRefunds ?? 0) / (overview.purchaseCount ?? 1)) * 100))
      : 100;

    /* 2. Répartition par raison (depuis le champ description) */
    const byReason = await db.select({
      description: transactionsTable.description,
      count:       sql<number>`count(*)::int`,
      amount:      sql<number>`coalesce(sum(amount), 0)::int`,
    }).from(transactionsTable)
      .where(eq(transactionsTable.type, "refund"))
      .groupBy(transactionsTable.description)
      .orderBy(desc(sql`count(*)`));

    /* 3. Derniers 50 remboursements avec info utilisateur */
    const recent = await db.select({
      id:          transactionsTable.id,
      userId:      transactionsTable.userId,
      amount:      transactionsTable.amount,
      description: transactionsTable.description,
      createdAt:   transactionsTable.createdAt,
      userName:    usersTable.fullName,
      userPhone:   usersTable.phone,
    }).from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(eq(transactionsTable.type, "refund"))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50);

    /* 4. Services les plus remboursés (numéros annulés/expirés sans SMS) */
    const topServices = await db.select({
      service:     servicesTable.name,
      serviceSlug: servicesTable.slug,
      count:       sql<number>`count(*)::int`,
      totalAmount: sql<number>`coalesce(sum(${virtualNumbersTable.price}), 0)::int`,
      avgAmount:   sql<number>`coalesce(avg(${virtualNumbersTable.price}), 0)::int`,
    }).from(virtualNumbersTable)
      .innerJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
      .where(
        and(
          or(
            eq(virtualNumbersTable.status, "cancelled"),
            eq(virtualNumbersTable.status, "expired"),
          ),
          sql`(select count(*) from sms_messages where number_id = ${virtualNumbersTable.id}) = 0`,
        )
      )
      .groupBy(servicesTable.id, servicesTable.name, servicesTable.slug)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    /* 5. Tendance journalière (30 derniers jours) */
    const dailyTrend = await db.select({
      date:   sql<string>`date(created_at at time zone 'UTC')::text`,
      count:  sql<number>`count(*)::int`,
      amount: sql<number>`coalesce(sum(amount), 0)::int`,
    }).from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "refund"),
          sql`created_at >= now() - interval '30 days'`,
        )
      )
      .groupBy(sql`date(created_at at time zone 'UTC')`)
      .orderBy(sql`date(created_at at time zone 'UTC')`);

    res.json({
      overview: {
        totalRefunds:        overview.totalRefunds        ?? 0,
        totalAmountRefunded: overview.totalAmount         ?? 0,
        purchaseCount:       overview.purchaseCount       ?? 0,
        avgRefundAmount:     overview.avgRefundAmount      ?? 0,
        successRate,
        last30DaysRefunds:   overview.last30Refunds       ?? 0,
        last30DaysAmount:    overview.last30Amount        ?? 0,
      },
      byReason,
      topServices,
      recent,
      dailyTrend,
    });
  } catch (err) {
    logger.error({ err }, "[admin] Error fetching refund stats");
    res.status(500).json({ error: "Erreur lors du chargement des statistiques de remboursement" });
  }
});

export default router;
