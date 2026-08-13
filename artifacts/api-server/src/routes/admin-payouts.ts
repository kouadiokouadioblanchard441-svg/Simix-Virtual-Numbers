/**
 * Admin Payouts — Merchant withdrawal routes
 *
 *  GET  /admin/payouts/pawapay/config              — PawaPay countries/providers supporting PAYOUT
 *  POST /admin/payouts/pawapay                     — Initiate PawaPay payout
 *  GET  /admin/payouts/pawapay/status/:payoutId    — Check PawaPay payout status
 *  GET  /admin/payouts/clapay/countries            — Clapay supported countries
 *  GET  /admin/payouts/clapay/operators/:country   — Clapay operators for a country (with CASHOUT code)
 *  POST /admin/payouts/clapay                      — Initiate Clapay cashout
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc } from "drizzle-orm";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import {
  PawaPayClient,
  ISO2_TO_ISO3,
  COUNTRY_CURRENCY,
  buildMSISDN,
} from "../lib/pawapay";
import {
  ClapayClient,
  formatClapayPhone,
} from "../lib/clapay";
import {
  resolvePawaPayCredentials,
  resolveClapayCredentials,
} from "../lib/gateway-credentials";
import { logger } from "../lib/logger";
import { db, mobileOperatorsTable } from "@workspace/db";

const router: IRouter = Router();
router.use(requireAdminJwt);

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.adminPayload) { next(); return; }
  if (!(req as unknown as { user?: { isAdmin?: boolean } }).user?.isAdmin) {
    res.status(403).json({ error: "Accès réservé aux administrateurs" });
    return;
  }
  next();
}

/* ── ISO-3 → ISO-2 reverse map (for PawaPay active config) ─────── */
const ISO3_TO_ISO2: Record<string, string> = Object.fromEntries(
  Object.entries(ISO2_TO_ISO3).map(([iso2, iso3]) => [iso3, iso2]),
);

/* ═══════════════════════════════════════════════════════════════
 * PAWAPAY
 * ═══════════════════════════════════════════════════════════════ */

/**
 * GET /admin/payouts/pawapay/local-operators
 * Returns operators from local mobile_operators table, grouped by country.
 * Used as primary source for PawaPay payout form (avoids relying on /v2/active-configuration).
 * PawaPay provider code is derived from operator slug: "orange-civ" → "ORANGE_CIV".
 */
router.get("/admin/payouts/pawapay/local-operators", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(mobileOperatorsTable)
      .where(eq(mobileOperatorsTable.active, true))
      .orderBy(asc(mobileOperatorsTable.sortOrder));

    /* Group by country */
    const byCountry = new Map<string, {
      countryIso2: string;
      currency: string;
      operators: { name: string; slug: string; pawapayCode: string; logo: string | null }[];
    }>();

    for (const op of rows) {
      const codes = (op.countryCodes as string[]) ?? [];
      for (const iso2 of codes) {
        if (!byCountry.has(iso2)) {
          byCountry.set(iso2, {
            countryIso2: iso2,
            currency: COUNTRY_CURRENCY[iso2] ?? "XOF",
            operators: [],
          });
        }
        /* Derive PawaPay provider code from slug: orange-civ → ORANGE_CIV */
        const pawapayCode = op.slug.toUpperCase().replace(/-/g, "_");
        byCountry.get(iso2)!.operators.push({
          name: op.name,
          slug: op.slug,
          pawapayCode,
          logo: op.logoUrl,
        });
      }
    }

    const countries = [...byCountry.values()].sort((a, b) =>
      a.countryIso2.localeCompare(b.countryIso2),
    );

    res.json({ countries, source: "local" });
  } catch (err) {
    logger.error({ err }, "[admin-payouts] local operators fetch failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /admin/payouts/pawapay/config
 * Returns countries and providers that support PAYOUT operations (from PawaPay live API).
 */
router.get("/admin/payouts/pawapay/config", requireAdmin, async (req, res): Promise<void> => {
  try {
    const creds = await resolvePawaPayCredentials();
    if (!creds) {
      res.status(503).json({ error: "PawaPay non configuré — ajoutez un token PawaPay dans les paramètres" });
      return;
    }

    const client = new PawaPayClient(creds.token, creds.env);
    const config = await client.getActiveConfiguration();

    const countries = config.countries
      .map((c) => {
        const iso2 = ISO3_TO_ISO2[c.country] ?? c.country;
        const currency = COUNTRY_CURRENCY[iso2] ?? "XOF";

        const providers = c.providers
          .filter((p) =>
            p.currencies.some((cur) => cur.operationTypes?.PAYOUT),
          )
          .map((p) => {
            // Find the first currency with PAYOUT limits
            const cur = p.currencies.find((cu) => cu.operationTypes?.PAYOUT);
            return {
              provider: p.provider,
              name: p.nameDisplayedToCustomer,
              currency: cur?.currency ?? currency,
              minAmount: cur?.operationTypes?.PAYOUT?.minAmount,
              maxAmount: cur?.operationTypes?.PAYOUT?.maxAmount,
            };
          });

        return { countryIso3: c.country, countryIso2: iso2, currency, providers };
      })
      .filter((c) => c.providers.length > 0);

    res.json({ countries, env: creds.env });
  } catch (err) {
    logger.error({ err }, "[admin-payouts] PawaPay config fetch failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /admin/payouts/pawapay
 * Initiate a PawaPay payout (merchant → recipient mobile money).
 *
 * Body: { phoneNumber, dialCode, provider, currency, amount }
 */
router.post("/admin/payouts/pawapay", requireAdmin, async (req, res): Promise<void> => {
  const { phoneNumber, dialCode, provider, currency, amount } = req.body as {
    phoneNumber?: string;
    dialCode?: string;
    provider?: string;
    currency?: string;
    amount?: string | number;
  };

  if (!phoneNumber || !provider || !currency || !amount) {
    res.status(400).json({ error: "Champs requis : phoneNumber, provider, currency, amount" });
    return;
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: "Montant invalide" });
    return;
  }

  try {
    const creds = await resolvePawaPayCredentials();
    if (!creds) {
      res.status(503).json({ error: "PawaPay non configuré" });
      return;
    }

    const client = new PawaPayClient(creds.token, creds.env);
    const msisdn = buildMSISDN(phoneNumber, dialCode);
    const payoutId = crypto.randomUUID();

    logger.info({ payoutId, msisdn, provider, currency, amount: String(amountNum) }, "[admin-payouts] Initiating PawaPay payout");

    const result = await client.initiatePayout({
      payoutId,
      amount: String(Math.floor(amountNum)),
      currency,
      recipient: {
        type: "MMO",
        accountDetails: {
          phoneNumber: msisdn,
          provider,
        },
      },
      customerMessage: "Simix retrait",
      metadata: [{ type: "admin_payout" }],
    });

    logger.info({ payoutId, status: result.status }, "[admin-payouts] PawaPay payout initiated");
    res.json({ payoutId, status: result.status, created: result.created, failureReason: result.failureReason });
  } catch (err) {
    logger.error({ err }, "[admin-payouts] PawaPay payout failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /admin/payouts/pawapay/status/:payoutId
 * Check the status of a previously initiated PawaPay payout.
 */
router.get("/admin/payouts/pawapay/status/:payoutId", requireAdmin, async (req, res): Promise<void> => {
  const { payoutId } = req.params;
  try {
    const creds = await resolvePawaPayCredentials();
    if (!creds) {
      res.status(503).json({ error: "PawaPay non configuré" });
      return;
    }
    const client = new PawaPayClient(creds.token, creds.env);
    const result = await client.getPayoutStatus(payoutId);
    res.json(result);
  } catch (err) {
    logger.error({ err, payoutId }, "[admin-payouts] PawaPay status check failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ═══════════════════════════════════════════════════════════════
 * CLAPAY
 * ═══════════════════════════════════════════════════════════════ */

/**
 * GET /admin/payouts/clapay/countries
 * Returns all Clapay-supported countries.
 */
router.get("/admin/payouts/clapay/countries", requireAdmin, async (req, res): Promise<void> => {
  try {
    const creds = await resolveClapayCredentials();
    if (!creds) {
      res.status(503).json({ error: "Clapay non configuré — ajoutez un token Clapay dans les paramètres" });
      return;
    }
    const client = new ClapayClient(creds.token, creds.baseUrl);
    const countries = await client.getCountries();
    res.json({ countries });
  } catch (err) {
    logger.error({ err }, "[admin-payouts] Clapay countries fetch failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /admin/payouts/clapay/operators/:country
 * Returns operators for a country that support CASHOUT.
 */
router.get("/admin/payouts/clapay/operators/:country", requireAdmin, async (req, res): Promise<void> => {
  const { country } = req.params;
  try {
    const creds = await resolveClapayCredentials();
    if (!creds) {
      res.status(503).json({ error: "Clapay non configuré" });
      return;
    }
    const client = new ClapayClient(creds.token, creds.baseUrl);
    const all = await client.getOperators(country);
    // Return operators that are active and have a CASHOUT code
    /* Show all active operators; cashoutCode may be "none" when not supported */
    const cashoutOps = all
      .filter((op) => op.active)
      .map((op) => ({
        name: op.name,
        codeoperator: op.codeoperator,
        cashoutCode: (op.code?.CASHOUT && op.code.CASHOUT !== "none") ? op.code.CASHOUT : null,
        merchantCode: (op.code?.MERCHANT && op.code.MERCHANT !== "none") ? op.code.MERCHANT : null,
        logo: op.logo,
        requiresOtp: op.otpstarter?.CASHOUT ?? false,
        supportsCashout: !!(op.code?.CASHOUT && op.code.CASHOUT !== "none"),
      }));
    res.json({ operators: cashoutOps });
  } catch (err) {
    logger.error({ err, country }, "[admin-payouts] Clapay operators fetch failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /admin/payouts/clapay
 * Initiate a Clapay cashout (merchant → recipient mobile money).
 *
 * Body: { phoneNumber, dialCode, countryCode, cashoutCode, amount }
 */
router.post("/admin/payouts/clapay", requireAdmin, async (req, res): Promise<void> => {
  const { phoneNumber, dialCode, countryCode, cashoutCode, amount } = req.body as {
    phoneNumber?: string;
    dialCode?: string;
    countryCode?: string;
    cashoutCode?: string;
    amount?: string | number;
  };

  if (!phoneNumber || !countryCode || !cashoutCode || !amount) {
    res.status(400).json({ error: "Champs requis : phoneNumber, countryCode, cashoutCode, amount" });
    return;
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: "Montant invalide" });
    return;
  }

  try {
    const creds = await resolveClapayCredentials();
    if (!creds) {
      res.status(503).json({ error: "Clapay non configuré" });
      return;
    }

    const client = new ClapayClient(creds.token, creds.baseUrl);
    const formattedPhone = formatClapayPhone(phoneNumber, dialCode, countryCode);
    const transactionId = crypto.randomUUID();

    logger.info({ transactionId, formattedPhone, countryCode, cashoutCode, amount: amountNum }, "[admin-payouts] Initiating Clapay cashout");

    const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "https://simix.site";
    const result = await client.initiateCashout({
      transaction_id: transactionId,
      additional_infos: { customer_phone: formattedPhone },
      amount: amountNum,
      callback_url: `${appUrl}/api/wallet/clapay/webhook`,
      return_url: `${appUrl}/admin/payouts`,
      country_code: countryCode.toUpperCase(),
      operators_code: [cashoutCode],
      method: "CASHOUT",
    });

    logger.info({ transactionId, signature: result.signature }, "[admin-payouts] Clapay cashout initiated");
    res.json({ transactionId, signature: result.signature, currency: result.currency, status: result.status });
  } catch (err) {
    logger.error({ err }, "[admin-payouts] Clapay cashout failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
