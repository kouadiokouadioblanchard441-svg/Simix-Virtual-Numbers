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
import { and, eq } from "drizzle-orm";
import { db, apiProvidersTable } from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { FiveSimClient, FiveSimError } from "../lib/fivesim";
import { logger } from "../lib/logger";

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

export default router;
