import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, countryPaymentConfigsTable, paymentMethodsTable } from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { getEnabledMobileOperator, resolveWalletGateway } from "../lib/wallet-gateway";
import { buildDepositDiagnostics, DepositCatalogueCache } from "../lib/deposit-diagnostics";

const router: IRouter = Router();
const cache = new DepositCatalogueCache();
let inFlight: ReturnType<typeof loadReport> | null = null;

async function loadReport() {
  // This is the same enabled country/method source used by payment-options.
  // Left join preserves broken configurations rather than hiding them.
  const methods = await db.select({
    countryCode: countryPaymentConfigsTable.countryCode,
    methodSlug: countryPaymentConfigsTable.methodSlug,
    methodName: paymentMethodsTable.name,
  }).from(countryPaymentConfigsTable)
    .leftJoin(paymentMethodsTable, eq(paymentMethodsTable.slug, countryPaymentConfigsTable.methodSlug))
    .where(eq(countryPaymentConfigsTable.enabled, true))
    .orderBy(asc(countryPaymentConfigsTable.countryCode), asc(countryPaymentConfigsTable.methodSlug));
  return buildDepositDiagnostics(methods, {
    isEnabledOperator: async method => Boolean(await getEnabledMobileOperator(method.methodSlug, method.methodName!, method.countryCode)),
    resolveGateway: resolveWalletGateway,
    cache,
  });
}

router.get("/admin/deposit-diagnostics", requireAdminJwt, async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try {
    // Re-read configuration on each report; only remote catalogues have a TTL.
    // Concurrent admin requests share the whole report and its bounded workers.
    if (!inFlight) inFlight = loadReport().finally(() => { inFlight = null; });
    res.json(await inFlight);
  } catch {
    res.status(503).json({ error: "Impossible de charger la configuration des dépôts." });
  }
});

export default router;