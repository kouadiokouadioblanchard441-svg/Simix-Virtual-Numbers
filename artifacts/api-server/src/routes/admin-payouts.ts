/**
 * Admin Payouts — Merchant withdrawal routes
 *
 *  GET  /admin/payouts/pawapay/config              — PawaPay countries/providers supporting PAYOUT
 *  POST /admin/payouts/pawapay                     — Initiate PawaPay payout
 *  GET  /admin/payouts/pawapay/status/:payoutId    — Check PawaPay payout status
 *  GET  /admin/payouts/clapay/countries            — Clapay supported countries
 *  GET  /admin/payouts/clapay/operators/:country   — Clapay operators supporting CASHIN payout
 *  POST /admin/payouts/clapay                      — Initiate Clapay payout
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc, desc } from "drizzle-orm";
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
  clapayOperatorSupportsMethod,
  formatClapayPhone,
} from "../lib/clapay";
import {
  resolvePawaPayCredentials,
  resolveClapayCredentials,
} from "../lib/gateway-credentials";
import { logger } from "../lib/logger";
import { countriesTable, db, mobileOperatorsTable, payoutsTable } from "@workspace/db";
import {
  getPayoutById,
  initiatePayout,
  normalizePayoutRecord,
  registerPayout,
  refreshPayout,
  validatePawaPayRecipient,
  PayoutValidationError,
} from "../lib/payout-service";

const router: IRouter = Router();

/* Public callbacks are only reconciliation hints. Never settle a payout from
   webhook contents: the provider's authenticated status API is authoritative. */
router.post("/payouts/clapay/webhook", async (req, res): Promise<void> => {
  const payload = (req.body ?? {}) as Record<string, unknown>;
  const transactionId = String(payload.transaction_id ?? "");
  const signature = String(payload.signature ?? "");
  const [payout] = await db.select().from(payoutsTable).where(
    transactionId
      ? eq(payoutsTable.externalId, transactionId)
      : eq(payoutsTable.signature, signature),
  ).limit(1);
  if (payout?.gateway === "clapay") {
    await refreshPayout(payout.id, signature || undefined);
  }
  res.status(202).json({ received: true });
});

router.post("/payouts/pawapay/webhook", async (req, res): Promise<void> => {
  const payload = (req.body ?? {}) as Record<string, unknown>;
  const payoutId = String(payload.payoutId ?? payload.payout_id ?? "");
  const [payout] = payoutId
    ? await db.select().from(payoutsTable).where(eq(payoutsTable.externalId, payoutId)).limit(1)
    : [];
  if (payout?.gateway === "pawapay") await refreshPayout(payout.id);
  res.status(202).json({ received: true });
});

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
 * Body: { phoneNumber, countryIso2, provider, currency, amount, idempotencyKey }
 */
router.post("/admin/payouts/pawapay", requireAdmin, async (req, res): Promise<void> => {
  const { phoneNumber, countryIso2, provider, currency, amount, idempotencyKey } = (req.body ?? {}) as {
    phoneNumber?: string;
    countryIso2?: string;
    provider?: string;
    currency?: string;
    amount?: string | number;
    idempotencyKey?: string;
  };

  if (!phoneNumber || !countryIso2 || !provider || !currency || amount === undefined || !idempotencyKey?.trim()) {
    res.status(400).json({ error: "Champs requis : phoneNumber, countryIso2, provider, currency, amount, idempotencyKey" });
    return;
  }

  try {
    const prepared = await validatePawaPayRecipient({
      phoneNumber, countryIso2, provider, currency, amount,
    });
    const registered = await registerPayout({
      ...prepared,
      gateway: "pawapay",
      actorId: req.adminPayload?.sub ?? req.user?.id ?? "unknown",
      idempotencyKey: idempotencyKey.trim(),
    });
    if (registered.kind === "conflict") {
      res.status(409).json({ error: "Cette clé d'idempotence a déjà été utilisée pour une demande différente." });
      return;
    }
    if (registered.kind === "created" && registered.payout.status === "pending") {
      try {
        /* Reusing the persisted PawaPay UUID is safe, including after an
           ambiguous timeout; never generate a new ID for the same key. */
        await initiatePayout(registered.payout);
      } catch (err) {
        logger.warn({ payoutId: registered.payout.externalId, err: (err as Error).message }, "[admin-payouts] PawaPay outcome unknown; record remains pending");
      }
    } else if (registered.payout.status === "pending") {
      await refreshPayout(registered.payout.id);
    }
    const payout = await getPayoutById(registered.payout.id);
    res.json(normalizePayoutRecord(payout ?? registered.payout));
  } catch (err) {
    if (err instanceof PayoutValidationError) {
      res.status(err.httpStatus).json({ error: err.message });
      return;
    }
    logger.error({ err: (err as Error).message }, "[admin-payouts] PawaPay payout validation failed");
    res.status(503).json({ error: "Impossible de valider la configuration PawaPay. Aucun payout n'a été enregistré." });
  }
});

/**
 * GET /admin/payouts/pawapay/status/:payoutId
 * Check the status of a previously initiated PawaPay payout.
 */
router.get("/admin/payouts/pawapay/status/:payoutId", requireAdmin, async (req, res): Promise<void> => {
  const payoutId = Array.isArray(req.params.payoutId) ? req.params.payoutId[0] ?? "" : req.params.payoutId ?? "";
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
 * Returns operators for a country that support payout/CASHIN.
 */
router.get("/admin/payouts/clapay/operators/:country", requireAdmin, async (req, res): Promise<void> => {
  const country = Array.isArray(req.params.country) ? req.params.country[0] ?? "" : req.params.country ?? "";
  try {
    const creds = await resolveClapayCredentials();
    if (!creds) {
      res.status(503).json({ error: "Clapay non configuré" });
      return;
    }
    const client = new ClapayClient(creds.token, creds.baseUrl);
    const all = await client.getOperators(country);
    const payoutOperators = all
      .filter((op) => op.active)
      .map((op) => ({
        name: op.name,
        codeoperator: op.codeoperator,
        operatorCode: op.codeoperator,
        payoutCode: op.codeoperator,
        cashinCode: (op.code?.CASHIN && op.code.CASHIN !== "none") ? op.code.CASHIN : null,
        cashoutCode: (op.code?.CASHOUT && op.code.CASHOUT !== "none") ? op.code.CASHOUT : null,
        merchantCode: (op.code?.MERCHANT && op.code.MERCHANT !== "none") ? op.code.MERCHANT : null,
        logo: op.logo,
        requiresOtp: op.otpstarter?.CASHIN ?? false,
        supportsPayout: clapayOperatorSupportsMethod(op, "CASHIN"),
        supportsCashout: clapayOperatorSupportsMethod(op, "CASHOUT"),
      }));
    res.json({ operators: payoutOperators });
  } catch (err) {
    logger.error({ err, country }, "[admin-payouts] Clapay operators fetch failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /admin/payouts/clapay
 * Initiate a Clapay payout (merchant → recipient mobile money).
 *
 * Body: { phoneNumber, dialCode, countryCode, operatorCode, amount, idempotencyKey, operatorOtp? }
 */
router.post("/admin/payouts/clapay", requireAdmin, async (req, res): Promise<void> => {
  const { phoneNumber, dialCode, countryCode, operatorCode, amount, idempotencyKey, operatorOtp } = (req.body ?? {}) as {
    phoneNumber?: string;
    dialCode?: string;
    countryCode?: string;
    operatorCode?: string;
    amount?: string | number;
    idempotencyKey?: string;
    operatorOtp?: string;
  };

  if (!phoneNumber || !countryCode || !operatorCode || amount === undefined || !idempotencyKey?.trim()) {
    res.status(400).json({ error: "Champs requis : phoneNumber, countryCode, operatorCode, amount, idempotencyKey" });
    return;
  }

  const amountNum = Number(amount);
  if (!Number.isSafeInteger(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: "Le montant Clapay doit être un entier positif." });
    return;
  }

  try {
    const creds = await resolveClapayCredentials();
    if (!creds) {
      res.status(503).json({ error: "Clapay non configuré" });
      return;
    }

    const client = new ClapayClient(creds.token, creds.baseUrl);
    const countryCodeNormalized = countryCode.trim().toUpperCase();
    const operators = await client.getOperators(countryCodeNormalized);
    const operator = operators.find(op => op.active && op.codeoperator.toLowerCase() === operatorCode.trim().toLowerCase());
    if (!operator || !clapayOperatorSupportsMethod(operator, "CASHIN")) {
      res.status(422).json({ error: "L'opérateur sélectionné ne prend pas en charge les payouts CASHIN." });
      return;
    }
    if (operator.otpstarter?.CASHIN && !operatorOtp?.trim()) {
      res.status(422).json({ error: "Un code OTP opérateur est requis pour ce payout." });
      return;
    }
    const countries = await client.getCountries(countryCodeNormalized);
    const country = countries.find(item => item.code.toUpperCase() === countryCodeNormalized);
    if (!country?.currency) {
      res.status(422).json({ error: "Clapay ne fournit aucune devise pour ce pays." });
      return;
    }
    const formattedPhone = formatClapayPhone(phoneNumber, dialCode, countryCodeNormalized);
    const registered = await registerPayout({
      gateway: "clapay",
      actorId: req.adminPayload?.sub ?? req.user?.id ?? "unknown",
      idempotencyKey: idempotencyKey.trim(),
      phone: formattedPhone,
      provider: operator.codeoperator,
      country: countryCodeNormalized,
      currency: country.currency.toUpperCase(),
      amount: String(amountNum),
    });
    if (registered.kind === "conflict") {
      res.status(409).json({ error: "Cette clé d'idempotence a déjà été utilisée pour une demande différente." });
      return;
    }
    if (registered.kind === "created") {
      try {
        await initiatePayout(registered.payout, operatorOtp?.trim());
      } catch (err) {
        logger.warn({ payoutId: registered.payout.id, err: (err as Error).message }, "[admin-payouts] Clapay outcome unknown; record remains pending");
      }
    } else if (registered.payout.status === "pending" && !registered.payout.initiationClaimedAt) {
      try {
        /* A null claim proves no attempt was started before a process crash.
           The atomic claim still permits only one replay to send. */
        await initiatePayout(registered.payout, operatorOtp?.trim());
      } catch (err) {
        logger.warn({ payoutId: registered.payout.id, err: (err as Error).message }, "[admin-payouts] Clapay first attempt outcome unknown; record remains pending");
      }
    } else if (registered.payout.status === "pending") {
      await refreshPayout(registered.payout.id);
    }
    const payout = await getPayoutById(registered.payout.id);
    res.json(normalizePayoutRecord(payout ?? registered.payout));
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[admin-payouts] Clapay payout validation failed");
    res.status(503).json({ error: (err as Error).message });
  }
});

router.get("/admin/payouts/history", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(payoutsTable)
    .orderBy(desc(payoutsTable.createdAt)).limit(250);
  res.json({ payouts: rows.map(normalizePayoutRecord) });
});

router.post("/admin/payouts/:id/refresh", requireAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] ?? "" : req.params.id ?? "";
  const payout = await refreshPayout(id);
  if (!payout) {
    res.status(404).json({ error: "Payout introuvable" });
    return;
  }
  res.json(normalizePayoutRecord(payout));
});

export default router;
