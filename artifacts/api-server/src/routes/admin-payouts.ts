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
  COUNTRY_TO_PAWAPAY_PROVIDER,
  ISO2_TO_ISO3,
  COUNTRY_CURRENCY,
  buildMSISDN,
  getPawaPayOperationConfig,
  normalizePawaPayProvider,
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
import { countriesTable, db, mobileOperatorsTable } from "@workspace/db";

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

function payoutOperatorSlug(provider: string): string {
  const prefixes: Array<[string, string]> = [
    ["MTN_MOMO_", "mtn"],
    ["ORANGE_", "orange"],
    ["AIRTELTIGO_", "airtel"],
    ["AIRTEL_OAPI_", "airtel"],
    ["AIRTEL_", "airtel"],
    ["VODAFONE_", "vodafone"],
    ["VODACOM_", "vodacom"],
    ["MOBICASH_", "moov"],
    ["MPESA_", "mpesa"],
    ["WAVE_", "wave"],
    ["MOOV_", "moov"],
    ["FREE_", "free"],
    ["EXPRESSO_", "expresso"],
    ["TMONEY_", "tmoney"],
    ["FLOOZ_", "flooz"],
    ["MVOLA_", "mvola"],
    ["ECONET_", "econet"],
    ["UNITEL_", "unitel"],
    ["TNM_", "tnm"],
    ["TIGO_", "tigo"],
    ["IAM_", "iam"],
  ];
  return prefixes.find(([prefix]) => provider.startsWith(prefix))?.[1]
    ?? provider.split("_")[0].toLowerCase();
}

function payoutOperatorName(provider: string): string {
  return provider
    .replace(/_(CIV|SEN|CMR|GHA|NGA|KEN|TZA|UGA|MOZ|ZMB|RWA|GAB|COG|TCD|BFA|MLI|GIN|TGO|BEN|NER|MRT|GNB|MDG|ZWE|ZAF|AGO|ETH|MWI|EGY|MAR|SLE)$/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/* ═══════════════════════════════════════════════════════════════
 * PAWAPAY
 * ═══════════════════════════════════════════════════════════════ */

/**
 * GET /admin/payouts/pawapay/local-operators
 * Returns every locally configured operator grouped by country.
 * PawaPay's live PAYOUT configuration is attached as availability metadata,
 * but never removes an operator from the admin catalogue.
 */
router.get("/admin/payouts/pawapay/local-operators", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const [rows, countryRows] = await Promise.all([
      db
        .select()
        .from(mobileOperatorsTable)
        .where(eq(mobileOperatorsTable.active, true))
        .orderBy(asc(mobileOperatorsTable.sortOrder)),
      db
        .select({
          code: countriesTable.code,
          name: countriesTable.name,
          flag: countriesTable.flag,
          dialCode: countriesTable.dialCode,
        })
        .from(countriesTable),
    ]);
    const countryDetails = new Map(
      countryRows.map((country) => [country.code.toUpperCase(), country]),
    );
    const operatorDetails = new Map(rows.map((operator) => [operator.slug, operator]));

    /*
     * The local catalogue controls what the administrator can see. The live
     * configuration only marks whether the current merchant token can submit
     * a payout for that operator; submission is still checked server-side.
     */
    let livePayoutProviders: Map<string, Set<string>> | null = null;
    const creds = await resolvePawaPayCredentials();
    if (creds) {
      try {
        const config = await new PawaPayClient(creds.token, creds.env)
          .getActiveConfiguration({ operationType: "PAYOUT" });
        livePayoutProviders = new Map(
          config.countries.map((country) => {
            const iso2 = ISO3_TO_ISO2[country.country] ?? country.country;
            const providers = new Set(
              country.providers
                .filter((p) => p.currencies.some((c) =>
                  getPawaPayOperationConfig(c.operationTypes, "PAYOUT"),
                ))
                .map((p) => p.provider),
            );
            return [iso2, providers];
          }),
        );
      } catch (err) {
        logger.warn({ err }, "[admin-payouts] Could not load live PawaPay payout configuration; using local catalogue");
      }
    }

    /* Group by country */
    const payoutCountries: Array<{
      countryIso2: string;
      countryName: string;
      flag: string;
      dialCode: string;
      currency: string;
      operators: {
        name: string;
        slug: string;
        pawapayCode: string;
        logo: string | null;
        payoutEnabled: boolean | null;
      }[];
    }> = Object.entries(COUNTRY_TO_PAWAPAY_PROVIDER).map(([iso2, providerCodes]) => {
      const country = countryDetails.get(iso2);
      return {
        countryIso2: iso2,
        countryName: country?.name ?? iso2,
        flag: country?.flag ?? "",
        dialCode: country?.dialCode ?? "",
        currency: COUNTRY_CURRENCY[iso2] ?? "XOF",
        operators: providerCodes.map((pawapayCode) => {
          const slug = payoutOperatorSlug(pawapayCode);
          const localOperator = operatorDetails.get(slug);
          return {
            name: localOperator?.name ?? payoutOperatorName(pawapayCode),
            slug,
            pawapayCode,
            logo: localOperator?.logoUrl ?? null,
            payoutEnabled: livePayoutProviders
              ? Boolean(livePayoutProviders.get(iso2)?.has(pawapayCode))
              : null,
          };
        }),
      };
    });

    payoutCountries.sort((a, b) =>
      a.countryIso2.localeCompare(b.countryIso2),
    );

    res.json({
      countries: payoutCountries,
      source: "local",
      payoutConfigChecked: livePayoutProviders !== null,
    });
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
    const config = await client.getActiveConfiguration({ operationType: "PAYOUT" });

    const countries = config.countries
      .map((c) => {
        const iso2 = ISO3_TO_ISO2[c.country] ?? c.country;
        const currency = COUNTRY_CURRENCY[iso2] ?? "XOF";

        const providers = c.providers
          .filter((p) =>
            p.currencies.some((cur) =>
              getPawaPayOperationConfig(cur.operationTypes, "PAYOUT"),
            ),
          )
          .map((p) => {
            // Find the first currency with PAYOUT limits
            const cur = p.currencies.find((cu) =>
              getPawaPayOperationConfig(cu.operationTypes, "PAYOUT"),
            );
            const payoutConfig = cur
              ? getPawaPayOperationConfig(cur.operationTypes, "PAYOUT")
              : undefined;
            return {
              provider: p.provider,
              name: p.displayName ?? p.nameDisplayedToCustomer ?? p.provider,
              currency: cur?.currency ?? currency,
              minAmount: payoutConfig?.minTransactionLimit ?? payoutConfig?.minAmount,
              maxAmount: payoutConfig?.maxTransactionLimit ?? payoutConfig?.maxAmount,
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
 * Body: { phoneNumber, countryIso2, provider, currency, amount }
 */
router.post("/admin/payouts/pawapay", requireAdmin, async (req, res): Promise<void> => {
  const { phoneNumber, countryIso2, provider, currency, amount } = req.body as {
    phoneNumber?: string;
    countryIso2?: string;
    provider?: string;
    currency?: string;
    amount?: string | number;
  };

  if (!phoneNumber || !countryIso2 || !provider || !currency || !amount) {
    res.status(400).json({ error: "Champs requis : phoneNumber, countryIso2, provider, currency, amount" });
    return;
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: "Montant invalide" });
    return;
  }

  try {
    const iso2 = countryIso2.trim().toUpperCase();
    const [country] = await db
      .select({ dialCode: countriesTable.dialCode })
      .from(countriesTable)
      .where(eq(countriesTable.code, iso2))
      .limit(1);

    const creds = await resolvePawaPayCredentials();
    if (!creds) {
      res.status(503).json({ error: "PawaPay non configuré" });
      return;
    }

    const client = new PawaPayClient(creds.token, creds.env);
    const msisdn = buildMSISDN(phoneNumber);
    const expectedDialCode = country?.dialCode?.replace(/\D/g, "");
    if (!expectedDialCode || !msisdn.startsWith(expectedDialCode)) {
      res.status(422).json({
        error: `Le numéro doit être saisi au format international complet pour ${iso2}, par exemple ${country?.dialCode ?? "+237"}683677872.`,
      });
      return;
    }
    if (!/^[1-9][0-9]{7,17}$/.test(msisdn)) {
      res.status(422).json({
        error: "Numéro de téléphone invalide. Utilisez le format international, par exemple +237683677872.",
      });
      return;
    }

    const pawapayProvider = normalizePawaPayProvider(iso2, provider);
    const payoutCurrencyCode = currency.trim().toUpperCase();
    const amountString = String(amount).trim();
    const iso3 = ISO2_TO_ISO3[iso2] ?? iso2;

    if (!/^([0]|([1-9][0-9]{0,17}))([.][0-9]{0,3}[1-9])?$/.test(amountString)) {
      res.status(400).json({ error: "Format du montant invalide pour PawaPay" });
      return;
    }

    const predicted = await client.predictProvider(msisdn);
    if (!predicted?.phoneNumber || !predicted.provider) {
      res.status(422).json({
        error: "PawaPay n'a pas pu valider ce numéro. Vérifiez le numéro et l'indicatif du pays.",
      });
      return;
    }
    if (predicted.provider !== pawapayProvider) {
      res.status(422).json({
        error: `Ce numéro est identifié par PawaPay comme ${predicted.provider}, mais l'opérateur sélectionné est ${pawapayProvider}. Sélectionnez l'opérateur correspondant.`,
      });
      return;
    }
    const payoutPhoneNumber = predicted.phoneNumber;

    /*
     * Do not create a payout request for a provider that the merchant account
     * cannot use. This turns PawaPay's opaque 403 into an actionable admin
     * message and prevents unnecessary rejected payout IDs.
     */
    try {
      const config = await client.getActiveConfiguration({
        country: iso3,
        operationType: "PAYOUT",
      });
      const country = config.countries.find((c) =>
        c.country === iso3 || c.country === iso2,
      );
      const providerConfig = country?.providers.find((p) => p.provider === pawapayProvider);
      const payoutCurrency = providerConfig?.currencies.find((c) =>
        c.currency === payoutCurrencyCode &&
        getPawaPayOperationConfig(c.operationTypes, "PAYOUT"),
      );
      const payoutConfig = payoutCurrency
        ? getPawaPayOperationConfig(payoutCurrency.operationTypes, "PAYOUT")
        : undefined;

      if (!providerConfig || !payoutCurrency || !payoutConfig) {
        res.status(422).json({
          error: `Le retrait PawaPay n'est pas activé pour ${pawapayProvider} dans votre compte. Activez ce fournisseur dans la configuration Payouts PawaPay ou choisissez un opérateur autorisé.`,
        });
        return;
      }

      const minAmount = Number(payoutConfig.minTransactionLimit ?? payoutConfig.minAmount);
      const maxAmount = Number(payoutConfig.maxTransactionLimit ?? payoutConfig.maxAmount);
      if (Number.isFinite(minAmount) && amountNum < minAmount) {
        res.status(422).json({ error: `Le montant minimum pour ${pawapayProvider} est ${minAmount} ${payoutCurrencyCode}.` });
        return;
      }
      if (Number.isFinite(maxAmount) && amountNum > maxAmount) {
        res.status(422).json({ error: `Le montant maximum pour ${pawapayProvider} est ${maxAmount} ${payoutCurrencyCode}.` });
        return;
      }
      if (payoutConfig.decimalsInAmount === "NONE" && amountString.includes(".")) {
        res.status(422).json({ error: `Les décimales ne sont pas autorisées pour ${pawapayProvider}.` });
        return;
      }
    } catch (err) {
      logger.error({ err, provider: pawapayProvider, countryIso2: iso2 }, "[admin-payouts] PawaPay payout configuration check failed");
      res.status(503).json({
        error: "Impossible de vérifier la configuration des retraits PawaPay. Aucun retrait n'a été envoyé, veuillez réessayer.",
      });
      return;
    }

    const payoutId = crypto.randomUUID();

    logger.info({ payoutId, msisdn: payoutPhoneNumber, countryIso2, provider: pawapayProvider, currency: payoutCurrencyCode, amount: amountString }, "[admin-payouts] Initiating PawaPay payout");

    const result = await client.initiatePayout({
      payoutId,
      amount: amountString,
      currency: payoutCurrencyCode,
      recipient: {
        type: "MMO",
        accountDetails: {
          phoneNumber: payoutPhoneNumber,
          provider: pawapayProvider,
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
