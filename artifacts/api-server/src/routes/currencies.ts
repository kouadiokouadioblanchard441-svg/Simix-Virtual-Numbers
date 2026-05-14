/**
 * Currencies routes — Multi-devise FX system
 *
 * Public:
 *   GET  /api/currencies              — liste toutes les devises actives
 *   GET  /api/currencies/country/:cc  — devise pour un pays donné
 *   POST /api/payment/preview         — calcul de conversion en temps réel
 *
 * Admin (JWT requis):
 *   GET    /api/admin/currencies           — toutes les devises (avec inactives)
 *   POST   /api/admin/currencies           — créer une devise
 *   PUT    /api/admin/currencies/:id       — modifier une devise
 *   DELETE /api/admin/currencies/:id       — supprimer une devise
 *
 *   GET  /api/admin/fx-profits             — liste des profits FX avec stats
 *   GET  /api/admin/fx-profits/summary     — totaux par devise + global
 */

import { Router, type IRouter } from "express";
import { eq, desc, sum, count, sql } from "drizzle-orm";
import { db, currenciesTable, fxProfitsTable } from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ── Taux de change XOF (pas de conversion) ──
 * Ces pays utilisent le XOF — taux = 1 par définition.
 * La table currencies peut aussi les avoir en DB (rate = 1). */
export const XOF_COUNTRY_CODES = new Set([
  "CI", "SN", "ML", "BF", "BJ", "NE", "TG", "GW",  // UEMOA
  "CM", "CF", "CG", "GA", "GQ", "TD",                // CEMAC (XAF ≈ XOF mais séparé)
]);

/* ── Récupérer le taux pour un pays (avec fallback XOF) ── */
export async function getCurrencyForCountry(countryCode: string): Promise<{
  currencyCode: string;
  currencyName: string;
  realRate: number;
  clientRate: number;
  isXof: boolean;
} | null> {
  const [row] = await db
    .select()
    .from(currenciesTable)
    .where(eq(currenciesTable.countryCode, countryCode.toUpperCase()))
    .limit(1);

  if (!row || !row.active) return null;

  return {
    currencyCode: row.currencyCode,
    currencyName: row.currencyName,
    realRate:     Number(row.realRate),
    clientRate:   Number(row.clientRate),
    isXof:        row.currencyCode === "XOF" || row.currencyCode === "XAF",
  };
}

/* ══════════════════════════════════════════════════════════════
 * PUBLIC ROUTES
 * ══════════════════════════════════════════════════════════════ */

/* GET /api/currencies — liste des devises actives */
router.get("/currencies", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(currenciesTable)
    .where(eq(currenciesTable.active, true))
    .orderBy(currenciesTable.countryCode);
  res.json(rows.map(r => ({
    id:           r.id,
    countryCode:  r.countryCode,
    currencyCode: r.currencyCode,
    currencyName: r.currencyName,
    clientRate:   Number(r.clientRate),
  })));
});

/* GET /api/currencies/country/:cc — devise d'un pays */
router.get("/currencies/country/:cc", async (req, res): Promise<void> => {
  const cc = req.params.cc?.toUpperCase();
  if (!cc) { res.status(400).json({ error: "Code pays requis" }); return; }

  const [row] = await db
    .select()
    .from(currenciesTable)
    .where(eq(currenciesTable.countryCode, cc))
    .limit(1);

  if (!row || !row.active) {
    /* Fallback — XOF natif (ex : CI, SN) */
    res.json({
      countryCode:  cc,
      currencyCode: "XOF",
      currencyName: "Franc CFA UEMOA",
      clientRate:   1,
      realRate:     1,
      isXof:        true,
    });
    return;
  }

  res.json({
    countryCode:  row.countryCode,
    currencyCode: row.currencyCode,
    currencyName: row.currencyName,
    clientRate:   Number(row.clientRate),
    realRate:     Number(row.realRate),
    isXof:        row.currencyCode === "XOF" || row.currencyCode === "XAF",
  });
});

/* POST /api/payment/preview — prévisualisation de la conversion */
router.post("/payment/preview", async (req, res): Promise<void> => {
  const { country, currency: currencyCode, amount } = req.body as {
    country?: string;
    currency?: string;
    amount?: number;
  };

  if (!country || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "country et amount requis" });
    return;
  }

  const cc = String(country).toUpperCase();
  const localAmount = Number(amount);

  const [row] = await db
    .select()
    .from(currenciesTable)
    .where(eq(currenciesTable.countryCode, cc))
    .limit(1);

  /* Pas de conversion si XOF ou devise non configurée */
  if (!row || !row.active || row.currencyCode === "XOF" || row.currencyCode === "XAF") {
    res.json({
      success: true,
      data: {
        amount_local:  localAmount,
        currency_local: row?.currencyCode ?? "XOF",
        client_rate:   1,
        amount_xof:    Math.floor(localAmount),
        needs_conversion: false,
      },
    });
    return;
  }

  const clientRate = Number(row.clientRate);
  const amountXof  = Math.floor(localAmount * clientRate);

  res.json({
    success: true,
    data: {
      amount_local:     localAmount,
      currency_local:   row.currencyCode,
      currency_name:    row.currencyName,
      client_rate:      clientRate,
      amount_xof:       amountXof,
      needs_conversion: true,
    },
  });
});

/* ══════════════════════════════════════════════════════════════
 * ADMIN ROUTES
 * ══════════════════════════════════════════════════════════════ */

/* GET /api/admin/currencies */
router.get("/admin/currencies", requireAdminJwt, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(currenciesTable)
    .orderBy(currenciesTable.countryCode);
  res.json(rows.map(r => ({
    ...r,
    realRate:   Number(r.realRate),
    clientRate: Number(r.clientRate),
  })));
});

/* POST /api/admin/currencies */
router.post("/admin/currencies", requireAdminJwt, async (req, res): Promise<void> => {
  const { countryCode, currencyCode, currencyName, realRate, clientRate, active } = req.body as {
    countryCode: string;
    currencyCode: string;
    currencyName: string;
    realRate: number;
    clientRate: number;
    active?: boolean;
  };

  if (!countryCode || !currencyCode || !currencyName || realRate == null || clientRate == null) {
    res.status(400).json({ error: "Tous les champs sont requis" });
    return;
  }

  const [created] = await db
    .insert(currenciesTable)
    .values({
      countryCode:  countryCode.toUpperCase(),
      currencyCode: currencyCode.toUpperCase(),
      currencyName,
      realRate:     String(realRate),
      clientRate:   String(clientRate),
      active:       active ?? true,
    })
    .returning();

  logger.info({ countryCode, currencyCode }, "[Admin] Currency created");
  res.status(201).json({ ...created, realRate: Number(created.realRate), clientRate: Number(created.clientRate) });
});

/* PUT /api/admin/currencies/:id */
router.put("/admin/currencies/:id", requireAdminJwt, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { countryCode, currencyCode, currencyName, realRate, clientRate, active } = req.body as {
    countryCode?: string;
    currencyCode?: string;
    currencyName?: string;
    realRate?: number;
    clientRate?: number;
    active?: boolean;
  };

  const updates: Partial<typeof currenciesTable.$inferInsert> = {};
  if (countryCode  != null) updates.countryCode  = countryCode.toUpperCase();
  if (currencyCode != null) updates.currencyCode = currencyCode.toUpperCase();
  if (currencyName != null) updates.currencyName = currencyName;
  if (realRate     != null) updates.realRate      = String(realRate);
  if (clientRate   != null) updates.clientRate    = String(clientRate);
  if (active       != null) updates.active        = active;

  const [updated] = await db
    .update(currenciesTable)
    .set(updates)
    .where(eq(currenciesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Devise introuvable" }); return; }

  logger.info({ id }, "[Admin] Currency updated");
  res.json({ ...updated, realRate: Number(updated.realRate), clientRate: Number(updated.clientRate) });
});

/* DELETE /api/admin/currencies/:id */
router.delete("/admin/currencies/:id", requireAdminJwt, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(currenciesTable).where(eq(currenciesTable.id, id));
  logger.info({ id }, "[Admin] Currency deleted");
  res.json({ success: true });
});

/* ── FX Profits ── */

/* GET /api/admin/fx-profits — liste paginée */
router.get("/admin/fx-profits", requireAdminJwt, async (req, res): Promise<void> => {
  const limit  = Math.min(Number(req.query.limit)  || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const rows = await db
    .select()
    .from(fxProfitsTable)
    .orderBy(desc(fxProfitsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(fxProfitsTable);

  res.json({
    profits: rows.map(r => ({
      ...r,
      localAmount: Number(r.localAmount),
      realRate:    Number(r.realRate),
      clientRate:  Number(r.clientRate),
      amountXof:   Number(r.amountXof),
      profitXof:   Number(r.profitXof),
    })),
    total,
  });
});

/* GET /api/admin/fx-profits/summary — totaux par devise + global */
router.get("/admin/fx-profits/summary", requireAdminJwt, async (_req, res): Promise<void> => {
  const byCurrency = await db
    .select({
      currency:        fxProfitsTable.currency,
      totalProfit:     sum(fxProfitsTable.profitXof),
      totalVolume:     sum(fxProfitsTable.amountXof),
      totalLocalVolume:sum(fxProfitsTable.localAmount),
      transactionCount: count(),
    })
    .from(fxProfitsTable)
    .where(eq(fxProfitsTable.status, "completed"))
    .groupBy(fxProfitsTable.currency)
    .orderBy(desc(sum(fxProfitsTable.profitXof)));

  const [global] = await db
    .select({
      totalProfit:      sum(fxProfitsTable.profitXof),
      totalVolume:      sum(fxProfitsTable.amountXof),
      transactionCount: count(),
    })
    .from(fxProfitsTable)
    .where(eq(fxProfitsTable.status, "completed"));

  res.json({
    global: {
      totalProfit:      Number(global?.totalProfit ?? 0),
      totalVolume:      Number(global?.totalVolume ?? 0),
      transactionCount: Number(global?.transactionCount ?? 0),
    },
    byCurrency: byCurrency.map(r => ({
      currency:         r.currency,
      totalProfit:      Number(r.totalProfit ?? 0),
      totalVolume:      Number(r.totalVolume ?? 0),
      totalLocalVolume: Number(r.totalLocalVolume ?? 0),
      transactionCount: Number(r.transactionCount ?? 0),
    })),
  });
});

export default router;
