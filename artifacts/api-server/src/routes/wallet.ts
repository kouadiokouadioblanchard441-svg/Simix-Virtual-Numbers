import { Router, type IRouter, type Request, type Response } from "express";
import { asc, desc, eq, sql, and } from "drizzle-orm";
import {
  db,
  paymentMethodsTable,
  transactionsTable,
  usersTable,
  countryPaymentConfigsTable,
  countriesTable,
  systemSettingsTable,
  currenciesTable,
  fxProfitsTable,
} from "@workspace/db";
import { RechargeWalletBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { toPaymentMethod, toTransaction } from "../lib/serializers";
import {
  PawaPayClient,
  type PawaPayDepositCallback,
  generateDepositId,
  buildMSISDN,
  getProviderForCountry,
  verifyContentDigest,
  COUNTRY_CURRENCY,
} from "../lib/pawapay";
import {
  ClapayClient,
  makeClapayDepositId,
  isClapayDeposit,
  extractClapayTransactionId,
  serializeClapayMeta,
  parseClapayMeta,
  mapClapayStatusToDb,
  CLAPAY_TERMINAL_FAILURE,
  type ClapayWebhookPayload,
} from "../lib/clapay";
import { logger } from "../lib/logger";
import { resolveGateway } from "../lib/payment-router";
import { getMinDepositFcfa, getMaxBalanceFcfa } from "../lib/settings";
import { broadcastNotification } from "./notifications";
import { notificationsTable } from "@workspace/db";
import { sendDepositConfirmationEmail } from "../lib/email";

const router: IRouter = Router();

/* ── Load PawaPay client from env or DB ── */
async function getPawaPayClient(): Promise<{ client: PawaPayClient; env: string } | null> {
  let token = process.env.PAWAPAY_API_TOKEN ?? null;

  /* Normalize env — trim spaces and lowercase to handle "Production ", "SANDBOX", etc. */
  const rawEnvFromEnvVar = process.env.PAWAPAY_ENV?.trim().toLowerCase();
  let env: "sandbox" | "production" = (rawEnvFromEnvVar === "production") ? "production" : "sandbox";

  if (!token) {
    const rows = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pawapay_api_token")).limit(1);
    token = rows[0]?.value?.trim() || null;

    if (token) {
      const envRows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "pawapay_env")).limit(1);
      /* Normalize: trim + lowercase to handle "Production ", "SANDBOX", "sandbox", etc. */
      const rawDbEnv = envRows[0]?.value?.trim().toLowerCase();
      env = (rawDbEnv === "production") ? "production" : "sandbox";
    }
  }

  if (!token) return null;
  return { client: new PawaPayClient(token, env), env };
}

/* ── Load Clapay client from env or DB ── */
async function getClapayClient(): Promise<{ client: ClapayClient } | null> {
  let token = process.env.CLAPAY_API_TOKEN ?? null;
  let baseUrl = process.env.CLAPAY_BASE_URL ?? null;

  if (!token) {
    const rows = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "clapay_api_token")).limit(1);
    token = rows[0]?.value?.trim() || null;

    if (token && !baseUrl) {
      const urlRows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "clapay_base_url")).limit(1);
      baseUrl = urlRows[0]?.value?.trim() || null;
    }
  }

  if (!token) return null;
  return { client: new ClapayClient(token, baseUrl ?? undefined) };
}

/* ── Active gateway preference from env or DB ── */
type GatewayPref = "pawapay" | "clapay" | "auto_pawapay_first" | "auto_clapay_first";

async function getGatewayPreference(): Promise<GatewayPref> {
  const envPref = process.env.MOBILE_MONEY_GATEWAY;
  if (envPref) return envPref as GatewayPref;

  const rows = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "mobile_money_gateway")).limit(1);
  return (rows[0]?.value as GatewayPref) ?? "pawapay";
}

/* ── Clapay callback URL (set in admin settings or Plesk env) ── */
async function getClapayCallbackUrl(): Promise<string> {
  if (process.env.CLAPAY_CALLBACK_URL) return process.env.CLAPAY_CALLBACK_URL;

  const rows = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "clapay_callback_url")).limit(1);
  return rows[0]?.value?.trim() || "https://simix.site/api/wallet/clapay/webhook";
}

/* ── Clapay return URL (user is sent here after checkout page) ── */
async function getClapayReturnUrl(): Promise<string> {
  if (process.env.CLAPAY_RETURN_URL) return process.env.CLAPAY_RETURN_URL;

  const rows = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "clapay_return_url")).limit(1);
  return rows[0]?.value?.trim() || "https://simix.site/wallet";
}

/* ── Mobile money operator keyword detection ── */
const MOBILE_MONEY_KEYWORDS = [
  "orange", "mtn", "wave", "moov", "airtel", "mpesa", "m-pesa",
  "free", "expresso", "tmoney", "flooz", "mvola", "mobile",
];

function isMobileMoneySlug(slug: string): boolean {
  const s = slug.toLowerCase();
  return MOBILE_MONEY_KEYWORDS.some(k => s.includes(k));
}

/* ────────────────────────────────────────────────────────────────
 * GET /wallet — balance
 * ──────────────────────────────────────────────────────────────── */
router.get("/wallet", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  res.json({ balance: user.balance, currency: "FCFA" });
});

/* ────────────────────────────────────────────────────────────────
 * POST /wallet/recharge
 *
 * DEPOSIT RULES (critical):
 *  - Mobile money + PawaPay configured → MUST use PawaPay, NEVER instant credit
 *  - Mobile money + PawaPay NOT configured → return 503 error, NEVER instant credit
 *  - Non-mobile-money methods → instant credit (admin/manual confirmation flow)
 *
 * PawaPay v2 flow:
 *  1. Build MSISDN from phone + dial code
 *  2. Call predict-provider to get exact provider code (fallback: static map)
 *  3. Store depositId in DB BEFORE calling PawaPay (idempotency)
 *  4. Initiate deposit → ACCEPTED = wait for webhook
 *  5. REJECTED → return 422 with clear error, NO credit
 * ──────────────────────────────────────────────────────────────── */
router.post(
  "/wallet/recharge",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = RechargeWalletBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const user = req.user!;
    const { amount, methodSlug, phoneNumber, countryCode, dialCode } = parsed.data;

    /* ── FX conversion (multi-devise) ──
     * `amount` from the client is in LOCAL currency (e.g. 1000 KES).
     * `currencyCode` (optional) tells us which currency.
     * We convert to XOF using clientRate for balance credit
     * and track realRate profit in fx_profits. */
    const rawBody = req.body as Record<string, unknown>;
    const currencyCode: string = typeof rawBody.currencyCode === "string" ? rawBody.currencyCode.toUpperCase() : "XOF";
    const isXofCurrency = currencyCode === "XOF" || currencyCode === "XAF";

    let amountXof   = amount;          // amount in FCFA credited to user
    let localAmount = amount;          // amount in local currency sent to gateway
    let fxMeta: { realRate: number; clientRate: number; profitXof: number } | null = null;

    if (!isXofCurrency) {
      const [currRow] = await db
        .select()
        .from(currenciesTable)
        .where(eq(currenciesTable.countryCode, countryCode.toUpperCase()))
        .limit(1);

      if (currRow && currRow.active) {
        const clientRate = Number(currRow.clientRate);
        const realRate   = Number(currRow.realRate);
        localAmount      = amount;
        amountXof        = Math.floor(amount * clientRate);
        fxMeta           = { realRate, clientRate, profitXof: Math.floor(amount * (clientRate - realRate)) };
      }
    }

    /* ── Amount limits (always checked in XOF) ── */
    const minDeposit = await getMinDepositFcfa();
    if (amountXof < minDeposit) {
      const minLocal = isXofCurrency ? minDeposit : Math.ceil(minDeposit / (fxMeta?.clientRate ?? 1));
      res.status(400).json({ error: `Le montant minimum de recharge est ${minLocal.toLocaleString("fr-FR")} ${currencyCode}.` });
      return;
    }

    const maxBalance = await getMaxBalanceFcfa();
    if (user.balance + amountXof > maxBalance) {
      res.status(400).json({ error: `Ce rechargement dépasserait le solde maximum autorisé (${maxBalance} FCFA).` });
      return;
    }

    /* ── Payment method lookup ── */
    const [method] = await db
      .select()
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.slug, methodSlug))
      .limit(1);

    const phoneDisplay = phoneNumber ? ` — ${dialCode ?? ""}${phoneNumber}` : "";
    const description = method
      ? `Recharge via ${method.name}${phoneDisplay}`
      : `Recharge du portefeuille${phoneDisplay}`;

    const isMobileMoney = isMobileMoneySlug(methodSlug);

    /* ════════════════════════════════════════════════════════════
     * MOBILE MONEY PATH — Gateway-aware (PawaPay v2 / Clapay)
     * Account is NEVER credited here; only webhook/poll does it.
     *
     * ROUTING PRIORITY:
     *  1. Dynamic routing via payment_routes table (admin-configurable)
     *  2. Legacy fallback via system_settings.mobile_money_gateway
     * ════════════════════════════════════════════════════════════ */
    if (isMobileMoney) {
      if (!phoneNumber || !countryCode) {
        res.status(400).json({ error: "Numéro de téléphone et code pays requis pour le Mobile Money." });
        return;
      }

      /* ── Step 1: Try dynamic routing (PostgreSQL routing table) ── */
      let pawaPayCtx: { client: PawaPayClient; env: string } | null = null;
      let clapayCtx:  { client: ClapayClient } | null = null;
      let activeGateway: "pawapay" | "clapay" | null = null;
      let routingSource: "dynamic" | "legacy" = "legacy";

      const dynamicRoute = await resolveGateway(countryCode, methodSlug, amountXof);

      if (dynamicRoute) {
        routingSource = "dynamic";
        if (dynamicRoute.type === "pawapay") {
          pawaPayCtx = { client: dynamicRoute.client, env: process.env.PAWAPAY_ENV ?? "sandbox" };
          activeGateway = "pawapay";
        } else if (dynamicRoute.type === "clapay") {
          clapayCtx = { client: dynamicRoute.client };
          activeGateway = "clapay";
        }
        logger.info(
          { countryCode, methodSlug, gateway: activeGateway, priority: dynamicRoute.priority, routeId: dynamicRoute.routeId },
          "[Payment] Dynamic route resolved",
        );
      }

      /* ── Step 2: Legacy fallback (system_settings.mobile_money_gateway) ── */
      if (!activeGateway) {
        const gatewayPref = await getGatewayPreference();
        const isAuto = gatewayPref.startsWith("auto_");

        const legacyPawaPay = (gatewayPref === "pawapay" || isAuto) ? await getPawaPayClient() : null;
        const legacyClapay  = (gatewayPref === "clapay"  || isAuto) ? await getClapayClient()  : null;

        if (gatewayPref === "pawapay") {
          activeGateway = legacyPawaPay ? "pawapay" : null;
        } else if (gatewayPref === "clapay") {
          activeGateway = legacyClapay ? "clapay" : null;
        } else if (gatewayPref === "auto_pawapay_first") {
          activeGateway = legacyPawaPay ? "pawapay" : (legacyClapay ? "clapay" : null);
        } else if (gatewayPref === "auto_clapay_first") {
          activeGateway = legacyClapay ? "clapay" : (legacyPawaPay ? "pawapay" : null);
        }

        if (activeGateway === "pawapay" && legacyPawaPay) pawaPayCtx = legacyPawaPay;
        if (activeGateway === "clapay"  && legacyClapay)  clapayCtx  = legacyClapay;

        if (activeGateway) {
          logger.info({ countryCode, methodSlug, gateway: activeGateway, gatewayPref }, "[Payment] Legacy gateway fallback used");
        }
      }

      if (!activeGateway) {
        logger.error({ methodSlug, routingSource }, "[Payment] No gateway configured — cannot process mobile money");
        res.status(503).json({
          error: "Le paiement Mobile Money est temporairement indisponible. Contactez le support.",
        });
        return;
      }

      /* ── PawaPay v2 path ── */
      if (activeGateway === "pawapay") {
        const { client } = pawaPayCtx!;
        const currency = COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? "XOF";
        const msisdn = buildMSISDN(phoneNumber, dialCode);

        let provider: string | null = null;
        try {
          const predicted = await client.predictProvider(msisdn);
          if (predicted?.provider) {
            provider = predicted.provider;
            logger.info({ msisdn, provider }, "[PawaPay] Provider predicted via API");
          }
        } catch (e) {
          logger.warn({ error: (e as Error).message }, "[PawaPay] predict-provider failed, using static map");
        }

        if (!provider) {
          provider = getProviderForCountry(countryCode, methodSlug);
          if (provider) logger.info({ msisdn, provider, fallback: true }, "[PawaPay] Using static provider mapping");
        }

        if (!provider) {
          res.status(422).json({
            error: `Opérateur Mobile Money non supporté pour ce pays (${countryCode}). Essayez un autre mode de paiement.`,
          });
          return;
        }

        const depositId = generateDepositId();

        const [pendingTx] = await db.insert(transactionsTable).values({
          userId: user.id, type: "recharge", amount: amountXof, status: "pending",
          method: method?.name ?? methodSlug, description, externalDepositId: depositId,
        }).returning();

        /* Record pending FX profit if multi-currency */
        if (fxMeta && !isXofCurrency) {
          await db.insert(fxProfitsTable).values({
            transactionId: pendingTx.id,
            currency:      currencyCode,
            localAmount:   String(localAmount),
            realRate:      String(fxMeta.realRate),
            clientRate:    String(fxMeta.clientRate),
            amountXof:     String(amountXof),
            profitXof:     String(fxMeta.profitXof),
            status:        "pending",
          });
        }

        let depositRes;
        try {
          depositRes = await client.initiateDeposit({
            depositId,
            amount: String(localAmount),   /* local currency amount sent to gateway */
            currency,
            payer: { type: "MMO", accountDetails: { phoneNumber: msisdn, provider } },
            customerMessage: "Simix recharge",
            metadata: [{ userId: user.id }, { methodSlug }],
          });
        } catch (e) {
          const errMsg = (e as Error).message ?? "Erreur inconnue";
          logger.error({ error: errMsg, depositId, userId: user.id }, "[PawaPay] Deposit request failed");

          /* Distinguish API rejection (4xx/5xx from PawaPay) vs true network error.
           * API rejections mean the payment never started → mark as failed immediately.
           * Network errors leave the tx pending so reconciliation can catch it. */
          const isApiError = /^PawaPay\s+\d+/.test(errMsg) || (e as NodeJS.ErrnoException).code?.match(/^[345]\d\d$/) !== null;
          if (isApiError) {
            await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, pendingTx!.id));
            res.status(422).json({ error: `Dépôt refusé par l'opérateur. ${errMsg}` });
          } else {
            res.status(502).json({
              error: "Erreur de communication avec l'opérateur. Votre dépôt est en attente de confirmation — vérifiez l'historique.",
              depositId, pending: true,
            });
          }
          return;
        }

        if (depositRes.status === "ACCEPTED") {
          logger.info({ depositId, userId: user.id, amount, provider, msisdn }, "[PawaPay] Deposit ACCEPTED");
          res.json({
            ...toTransaction(pendingTx!), pending: true, depositId, provider,
            message: `Confirmez le paiement sur votre téléphone (${method?.name ?? methodSlug}). Votre solde sera crédité automatiquement.`,
          });
          return;
        }

        if (depositRes.status === "DUPLICATE_IGNORED") {
          logger.warn({ depositId }, "[PawaPay] Duplicate deposit ID");
          res.json({ ...toTransaction(pendingTx!), pending: true, depositId, message: "Ce dépôt est déjà en cours de traitement." });
          return;
        }

        await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, pendingTx!.id));
        const reason = depositRes.failureReason?.failureMessage ?? depositRes.failureReason?.failureCode ?? "Rejeté par l'opérateur";
        logger.warn({ depositRes, provider, msisdn, depositId }, "[PawaPay] Deposit REJECTED");
        res.status(422).json({ error: `Dépôt refusé : ${reason}. Vérifiez votre numéro et réessayez.` });
        return;
      }

      /* ── Clapay path ── */
      if (activeGateway === "clapay") {
        const { client } = clapayCtx!;

        /* Resolve operator code: try dynamic API lookup first, fall back to hardcoded map.
         * Dynamic resolution calls GET /nowallet/api/opérateurs/données?pays=CC to get
         * the exact codeoperator for this country, avoiding hardcoding mismatches. */
        const operatorCode = await client.resolveOperatorCode(countryCode.toUpperCase(), methodSlug);
        if (!operatorCode) {
          res.status(422).json({
            error: `Opérateur Mobile Money non supporté via Clapay pour ce pays (${countryCode}). Essayez un autre mode de paiement.`,
          });
          return;
        }

        logger.info({ country: countryCode, methodSlug, operatorCode }, "[Clapay] Resolved operator code");

        /* Generate our tracking UUID (sent to Clapay as transaction_id, echoed back in webhook) */
        const trackingId = generateDepositId(); /* UUID v4 */
        const externalDepositId = makeClapayDepositId(trackingId);

        /* Create pending transaction BEFORE calling Clapay — idempotency */
        const [pendingTx] = await db.insert(transactionsTable).values({
          userId: user.id, type: "recharge", amount: amountXof, status: "pending",
          method: method?.name ?? methodSlug, description, externalDepositId,
        }).returning();

        /* Record pending FX profit if multi-currency */
        if (fxMeta && !isXofCurrency) {
          await db.insert(fxProfitsTable).values({
            transactionId: pendingTx.id,
            currency:      currencyCode,
            localAmount:   String(localAmount),
            realRate:      String(fxMeta.realRate),
            clientRate:    String(fxMeta.clientRate),
            amountXof:     String(amountXof),
            profitXof:     String(fxMeta.profitXof),
            status:        "pending",
          });
        }

        const [callbackUrl, returnUrl] = await Promise.all([getClapayCallbackUrl(), getClapayReturnUrl()]);

        let clapayRes;
        try {
          clapayRes = await client.initiatePayment({
            transaction_id: trackingId,
            additional_infos: {
              customer_phone: `${dialCode ?? ""}${phoneNumber}`,
              customer_firstname: user.fullName?.split(" ")[0] ?? undefined,
              customer_lastname: user.fullName?.split(" ").slice(1).join(" ") ?? undefined,
              customer_email: user.email ?? undefined,
            },
            amount: localAmount,   /* local currency amount sent to Clapay */
            callback_url: callbackUrl,
            return_url: returnUrl,
            country_code: countryCode.toUpperCase(),
            operators_code: [operatorCode],
            method: "MERCHANT",
            tunnel: "CHECKOUTPAGE",
          });
        } catch (e) {
          const errMsg = (e as Error).message ?? "Erreur inconnue";
          logger.error({ error: errMsg, trackingId, userId: user.id }, "[Clapay] Payment initiation failed");

          /* Distinguish API rejection (Clapay returned 4xx/5xx) vs true network error.
           * The ClapayClient throws errors prefixed "Clapay {status}: ..." for API errors.
           * API rejections mean the payment never started → mark transaction as failed.
           * Network errors (DNS, timeout, ECONNRESET) leave tx pending for reconciliation. */
          const isClapayApiError = /^Clapay\s+\d+/.test(errMsg);
          if (isClapayApiError) {
            await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, pendingTx!.id));
            const userMsg = errMsg.replace(/^Clapay\s+\d+:\s*/, "");
            res.status(422).json({ error: `Paiement refusé par l'opérateur : ${userMsg}` });
          } else {
            res.status(502).json({
              error: "Erreur de communication avec l'opérateur. Votre dépôt est en attente de confirmation — vérifiez l'historique.",
              depositId: externalDepositId, pending: true,
            });
          }
          return;
        }

        logger.info(
          { trackingId, userId: user.id, amount: localAmount, amountXof, operatorCode, signature: clapayRes.signature, currency: clapayRes.currency },
          "[Clapay] Payment initiated",
        );

        /* Store Clapay signature in gateway_meta — required for official reconciliation
         * endpoint GET /nowallet/api/check/transactions/single/signature/:sig */
        const gatewayMeta = serializeClapayMeta({
          clapaySignature: clapayRes.signature,
          clapayCurrency: clapayRes.currency,
          clapayCountry: clapayRes.country,
          initiatedAt: new Date().toISOString(),
        });
        await db.update(transactionsTable)
          .set({ gatewayMeta })
          .where(eq(transactionsTable.id, pendingTx!.id));

        res.json({
          ...toTransaction(pendingTx!),
          pending: true,
          depositId: externalDepositId,
          gateway: "clapay",
          payment_url: clapayRes.payment_url ?? null,
          message: clapayRes.payment_url
            ? `Finalisez le paiement sur la page Clapay. Votre solde sera crédité automatiquement dès confirmation.`
            : `En attente de confirmation de paiement (${method?.name ?? methodSlug}). Votre solde sera crédité automatiquement.`,
        });
        return;
      }
    }

    /* ════════════════════════════════════════════════════════════
     * NON-MOBILE MONEY PATH — instant credit
     * (bank transfer, voucher, manual top-up, etc.)
     * ════════════════════════════════════════════════════════════ */
    await db
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${amountXof}` })
      .where(eq(usersTable.id, user.id));

    const [tx] = await db
      .insert(transactionsTable)
      .values({
        userId: user.id,
        type: "recharge",
        amount: amountXof,
        status: "completed",
        method: method?.name ?? methodSlug,
        description,
      })
      .returning();

    /* ── Send deposit confirmation email (non-mobile-money instant credit) ── */
    if (tx && user.email) {
      const newBalanceAfter = user.balance + amountXof;
      sendDepositConfirmationEmail({
        userEmail: user.email,
        userFullName: user.fullName ?? "Utilisateur",
        amount: amountXof,
        method: method?.name ?? methodSlug,
        phoneNumber: phoneNumber ? `${dialCode ?? ""}${phoneNumber}` : null,
        transactionId: String(tx.id),
        depositId: null,
        createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
        newBalance: newBalanceAfter,
      }).catch((e: Error) => logger.warn({ error: e.message }, "[email] Deposit confirmation (manual) non-critical error"));
    }

    res.json(toTransaction(tx!));
  },
);

/* ────────────────────────────────────────────────────────────────
 * POST /wallet/predict-provider
 * Predict mobile money provider from MSISDN (proxy to PawaPay v2)
 * ──────────────────────────────────────────────────────────────── */
router.post("/wallet/predict-provider", requireAuth, async (req, res): Promise<void> => {
  const { phoneNumber, dialCode } = req.body as { phoneNumber?: string; dialCode?: string };
  if (!phoneNumber) { res.status(400).json({ error: "phoneNumber requis" }); return; }

  const pawaPayCtx = await getPawaPayClient();
  if (!pawaPayCtx) { res.status(503).json({ error: "PawaPay non configuré" }); return; }

  const msisdn = buildMSISDN(phoneNumber, dialCode);

  try {
    const result = await pawaPayCtx.client.predictProvider(msisdn);
    res.json(result ?? { provider: null, phoneNumber: msisdn });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/* ────────────────────────────────────────────────────────────────
 * PawaPay v2 Webhook — Deposit Callback
 * URL: POST /api/wallet/pawapay/webhook
 *
 * PawaPay POSTs the final deposit status here.
 * Security: verify Content-Digest if present (optional signed callbacks).
 *
 * IMPORTANT: Respond 200 immediately, process asynchronously.
 * Account is ONLY credited here when status = "COMPLETED".
 * ──────────────────────────────────────────────────────────────── */
router.post("/wallet/pawapay/webhook", async (req: Request, res: Response): Promise<void> => {
  /* Respond immediately — PawaPay requires fast 2xx response */
  res.status(200).json({ received: true });

  try {
    /* Content-Digest verification (if signed callbacks are enabled in PawaPay dashboard) */
    const contentDigest = req.headers["content-digest"] as string | undefined;
    if (contentDigest) {
      /* Use the raw body captured before JSON parsing (see app.ts verify callback).
       * JSON.stringify(req.body) must NOT be used here — it re-serializes the
       * parsed object which may differ from PawaPay's original bytes (whitespace,
       * key ordering) and would always produce a mismatch on signed callbacks. */
      const rawBody = req.rawBody ?? JSON.stringify(req.body);
      const digestOk = verifyContentDigest(rawBody, contentDigest);
      if (!digestOk) {
        logger.error({ contentDigest, hasRawBody: !!req.rawBody }, "[PawaPay Webhook] Content-Digest MISMATCH — possible tampering, ignoring");
        return;
      }
      logger.info("[PawaPay Webhook] Content-Digest verified ✓");
    } else {
      logger.info("[PawaPay Webhook] No Content-Digest header — processing without signature verification");
    }

    /* PawaPay v2 sends a single object (not an array) */
    const body = req.body;
    const items: PawaPayDepositCallback[] = Array.isArray(body) ? body : [body];

    for (const item of items) {
      await processDepositCallback(item);
    }
  } catch (e) {
    logger.error({ error: (e as Error).message }, "[PawaPay Webhook] Error processing deposit callback");
  }
});

/* ── Process a single v2 deposit callback ── */
async function processDepositCallback(payload: PawaPayDepositCallback): Promise<void> {
  const { depositId, status, amount, failureReason } = payload;

  if (!depositId || !status) {
    logger.warn({ payload }, "[PawaPay Webhook] Invalid payload — missing depositId or status");
    return;
  }

  logger.info({ depositId, status, amount }, "[PawaPay Webhook] Processing deposit callback");

  if (status === "COMPLETED") {
    /* Find the pending transaction — guard against double-processing */
    const [tx] = await db.select().from(transactionsTable)
      .where(and(
        eq(transactionsTable.externalDepositId, depositId),
        eq(transactionsTable.status, "pending"),
      ))
      .limit(1);

    if (!tx) {
      logger.warn({ depositId }, "[PawaPay Webhook] Transaction not found or already processed");
      return;
    }

    /* ALWAYS use the stored XOF amount (tx.amount) — never the webhook `amount`.
     * The webhook `amount` is in the payer's LOCAL currency (e.g. KES, GHS)
     * which may differ from our internal FCFA amount after FX conversion. */
    const creditAmount = tx.amount;

    /* Atomic: update transaction + credit user balance */
    await db.update(transactionsTable)
      .set({ status: "completed" })
      .where(eq(transactionsTable.id, tx.id));

    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${creditAmount}` })
      .where(eq(usersTable.id, tx.userId));

    logger.info({ depositId, userId: tx.userId, creditAmount }, "[PawaPay Webhook] Deposit COMPLETED — balance credited ✓");

    /* ── Complete FX profit record if present ── */
    try {
      await db.update(fxProfitsTable)
        .set({ status: "completed" })
        .where(eq(fxProfitsTable.transactionId, tx.id));
    } catch { /* non-critical */ }

    /* ── Push real-time deposit notification ── */
    try {
      const [notif] = await db.insert(notificationsTable).values({
        userId: tx.userId,
        title: "💰 Solde rechargé",
        body: `Votre solde a été crédité de ${creditAmount.toLocaleString("fr-FR")} FCFA avec succès.`,
        type: "deposit",
        icon: "wallet",
        link: `/wallet`,
        metadata: { amount: creditAmount, depositId },
      }).returning();
      if (notif) broadcastNotification(notif);
    } catch { /* non-critical */ }

    /* ── Send deposit confirmation email ── */
    try {
      const [userRow] = await db.select({
        email: usersTable.email,
        fullName: usersTable.fullName,
        balance: usersTable.balance,
      }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);

      if (userRow?.email) {
        const phoneMatch = tx.description?.match(/[\+\d]{8,}/);
        await sendDepositConfirmationEmail({
          userEmail: userRow.email,
          userFullName: userRow.fullName ?? "Utilisateur",
          amount: creditAmount,
          method: tx.method ?? "Mobile Money",
          phoneNumber: phoneMatch?.[0] ?? null,
          transactionId: String(tx.id),
          depositId: tx.externalDepositId ?? depositId,
          createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
          newBalance: userRow.balance,
        });
        logger.info({ userId: tx.userId, depositId }, "[email] Deposit confirmation email sent ✓");
      }
    } catch (e) {
      logger.warn({ error: (e as Error).message, depositId }, "[email] Failed to send deposit confirmation email (non-critical)");
    }

  } else if (status === "FAILED") {
    const updated = await db.update(transactionsTable)
      .set({ status: "failed" })
      .where(and(
        eq(transactionsTable.externalDepositId, depositId),
        eq(transactionsTable.status, "pending"),
      ))
      .returning();

    if (updated.length > 0) {
      logger.warn({ depositId, failureReason }, "[PawaPay Webhook] Deposit FAILED — transaction marked failed");
    } else {
      logger.warn({ depositId }, "[PawaPay Webhook] FAILED callback — transaction not found or already processed");
    }
  } else {
    logger.info({ depositId, status }, "[PawaPay Webhook] Non-final status received, ignoring");
  }
}

/* ────────────────────────────────────────────────────────────────
 * PawaPay Refund/Payout Callback
 * URL: POST /api/wallet/pawapay/refund-webhook
 * ──────────────────────────────────────────────────────────────── */
router.post("/wallet/pawapay/refund-webhook", async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ received: true });

  try {
    const body = req.body;
    const items = Array.isArray(body) ? body : [body];

    for (const item of items) {
      const { refundId, depositId, status, amount } = item as {
        refundId?: string; depositId?: string; status?: string; amount?: string;
      };
      logger.info({ refundId, depositId, status, amount }, "[PawaPay Refund Webhook] Received");
    }
  } catch (e) {
    logger.error({ error: (e as Error).message }, "[PawaPay Refund Webhook] Error");
  }
});

/* ────────────────────────────────────────────────────────────────
 * Clapay Webhook — Payment Callback
 * URL: POST /api/wallet/clapay/webhook
 *
 * Clapay POSTs the final payment status here.
 * We match by transaction_id (our UUID sent at initiation).
 * Account is ONLY credited when status = "COMPLETED".
 *
 * IMPORTANT: Respond 200 immediately.
 * ──────────────────────────────────────────────────────────────── */
router.post("/wallet/clapay/webhook", async (req: Request, res: Response): Promise<void> => {
  /* Respond 200 immediately — Clapay requires a fast ACK */
  res.status(200).json({ received: true });

  const receivedAt = new Date().toISOString();

  try {
    const payload = req.body as ClapayWebhookPayload;
    const { status, transaction_id, amount, signature, currency } = payload;

    if (!transaction_id || !status) {
      logger.warn({ payload, receivedAt }, "[Clapay Webhook] Invalid payload — missing transaction_id or status");
      return;
    }

    /* Log the full webhook for auditability */
    logger.info(
      { transaction_id, status, amount, currency, signature, receivedAt },
      "[Clapay Webhook] Callback received",
    );

    const externalDepositId = makeClapayDepositId(transaction_id);
    const normalizedStatus = status.toUpperCase();

    if (normalizedStatus === "COMPLETED") {
      const [tx] = await db.select().from(transactionsTable)
        .where(and(
          eq(transactionsTable.externalDepositId, externalDepositId),
          eq(transactionsTable.status, "pending"),
        ))
        .limit(1);

      if (!tx) {
        logger.warn({ transaction_id, externalDepositId }, "[Clapay Webhook] Transaction not found or already processed");
        return;
      }

      /* ALWAYS use the stored XOF amount (tx.amount) — never the webhook amount.
       * The webhook `amount` is in the LOCAL currency (e.g. KES, XAF) which may
       * differ from our internal FCFA amount after FX conversion. */
      const creditAmount = tx.amount;

      const [justCompleted] = await db.update(transactionsTable)
        .set({ status: "completed" })
        .where(and(
          eq(transactionsTable.id, tx.id),
          eq(transactionsTable.status, "pending"),
        ))
        .returning();

      if (!justCompleted) {
        logger.info({ transaction_id }, "[Clapay Webhook] Already processed — skipping double-credit");
        return;
      }

      await db.update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${creditAmount}` })
        .where(eq(usersTable.id, tx.userId));

      logger.info(
        { transaction_id, userId: tx.userId, creditAmount, clapayAmount: amount, clapayCurrency: currency },
        "[Clapay Webhook] Deposit COMPLETED — balance credited ✓",
      );

      /* ── Complete FX profit record if present ── */
      try {
        await db.update(fxProfitsTable)
          .set({ status: "completed" })
          .where(eq(fxProfitsTable.transactionId, tx.id));
      } catch { /* non-critical */ }

      /* Push real-time notification */
      try {
        const [notif] = await db.insert(notificationsTable).values({
          userId: tx.userId,
          title: "💰 Solde rechargé",
          body: `Votre solde a été crédité de ${creditAmount.toLocaleString("fr-FR")} FCFA avec succès.`,
          type: "deposit",
          icon: "wallet",
          link: "/wallet",
          metadata: { amount: creditAmount, depositId: transaction_id, gateway: "clapay" },
        }).returning();
        if (notif) broadcastNotification(notif);
      } catch { /* non-critical */ }

      /* Send deposit confirmation email */
      try {
        const [userRow] = await db.select({
          email: usersTable.email, fullName: usersTable.fullName, balance: usersTable.balance,
        }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);

        if (userRow?.email) {
          const phoneMatch = tx.description?.match(/[\+\d]{8,}/);
          await sendDepositConfirmationEmail({
            userEmail: userRow.email,
            userFullName: userRow.fullName ?? "Utilisateur",
            amount: creditAmount,
            method: tx.method ?? "Mobile Money",
            phoneNumber: phoneMatch?.[0] ?? null,
            transactionId: String(tx.id),
            depositId: transaction_id,
            createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
            newBalance: userRow.balance,
          });
          logger.info({ userId: tx.userId, transaction_id }, "[Clapay Webhook] Deposit confirmation email sent ✓");
        }
      } catch (e) {
        logger.warn({ error: (e as Error).message, transaction_id }, "[Clapay Webhook] Email failed (non-critical)");
      }

    } else if (CLAPAY_TERMINAL_FAILURE.has(normalizedStatus)) {
      /* Handles: FAILED, CANCELLED, REJECTED, TIMEOUT, EXPIRED */
      const updated = await db.update(transactionsTable)
        .set({ status: "failed" })
        .where(and(
          eq(transactionsTable.externalDepositId, externalDepositId),
          eq(transactionsTable.status, "pending"),
        ))
        .returning();

      if (updated.length > 0) {
        logger.warn({ transaction_id, status: normalizedStatus }, "[Clapay Webhook] Payment terminal failure — transaction marked failed");
      } else {
        logger.warn({ transaction_id, status: normalizedStatus }, "[Clapay Webhook] Failure callback — transaction not found or already processed");
      }
    } else {
      /* PENDING or other non-terminal status — no action required */
      logger.info({ transaction_id, status: normalizedStatus }, "[Clapay Webhook] Non-terminal status received — waiting for final callback");
    }
  } catch (e) {
    logger.error({ error: (e as Error).message }, "[Clapay Webhook] Unhandled error processing callback");
  }
});

/* ────────────────────────────────────────────────────────────────
 * GET /wallet/deposit/:depositId/status
 * Poll PawaPay v2 for live deposit status (frontend polling)
 * Credits balance if COMPLETED and not yet done (reconciliation safety net).
 * ──────────────────────────────────────────────────────────────── */
router.get("/wallet/deposit/:depositId/status", requireAuth, async (req, res): Promise<void> => {
  const depositId = String(req.params.depositId);
  const user = req.user!;

  const [tx] = await db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.externalDepositId, depositId),
      eq(transactionsTable.userId, user.id),
    ))
    .limit(1);

  if (!tx) { res.status(404).json({ error: "Dépôt introuvable" }); return; }

  /* Only poll if transaction is still pending */
  if (tx.status === "pending") {
    /* Clapay deposits: Clapay V3 API does NOT provide a status polling endpoint.
     * Payment confirmation is done exclusively via webhook (callback_url).
     * This endpoint simply returns the current DB state.
     * If a webhook was missed, the reconciliation job will expire the tx after 2h. */
    if (isClapayDeposit(depositId)) {
      res.json({ ...toTransaction(tx), gateway: "clapay" });
      return;
    }

    const pawaPayCtx = await getPawaPayClient();
    if (pawaPayCtx) {
      try {
        const result = await pawaPayCtx.client.getDepositStatus(depositId);

        if (result.status === "FOUND" && result.data) {
          const depositStatus = result.data.status;

          if (depositStatus === "COMPLETED") {
            /* Safety net: credit if webhook was missed.
             * Use .returning() to detect if this update actually transitioned
             * the row from pending → completed. If it returns nothing, another
             * process (the webhook) already handled it — skip balance credit. */
            const creditAmount = result.data.amount ? Math.round(Number(result.data.amount)) : tx.amount;

            const [justCompleted] = await db.update(transactionsTable)
              .set({ status: "completed" })
              .where(and(
                eq(transactionsTable.id, tx.id),
                eq(transactionsTable.status, "pending"),
              ))
              .returning();

            if (justCompleted) {
              /* We did the transition — credit the balance */
              await db.update(usersTable)
                .set({ balance: sql`${usersTable.balance} + ${creditAmount}` })
                .where(eq(usersTable.id, user.id));
              logger.info({ depositId, userId: user.id, creditAmount }, "[PawaPay Poll] Deposit COMPLETED via polling — balance credited ✓");
            } else {
              /* Webhook already processed it — nothing to do */
              logger.info({ depositId }, "[PawaPay Poll] Already processed by webhook — skipping double-credit");
            }

            /* Re-fetch updated transaction */
            const [updated] = await db.select().from(transactionsTable)
              .where(eq(transactionsTable.id, tx.id)).limit(1);

            res.json(toTransaction(updated ?? tx));
            return;

          } else if (depositStatus === "FAILED") {
            await db.update(transactionsTable)
              .set({ status: "failed" })
              .where(eq(transactionsTable.id, tx.id));

            const [updated] = await db.select().from(transactionsTable)
              .where(eq(transactionsTable.id, tx.id)).limit(1);
            res.json(toTransaction(updated ?? { ...tx, status: "failed" }));
            return;

          } else if (depositStatus === "PROCESSING" || depositStatus === "ACCEPTED") {
            /* Still in progress — return current pending state */
            res.json({ ...toTransaction(tx), pawapayStatus: depositStatus });
            return;
          }
        }
      } catch (e) {
        logger.warn({ error: (e as Error).message }, "[PawaPay Poll] Status check failed");
      }
    }
  }

  res.json(toTransaction(tx));
});

/* ────────────────────────────────────────────────────────────────
 * GET /wallet/transactions
 * ──────────────────────────────────────────────────────────────── */
router.get(
  "/wallet/transactions",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = req.user!;
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, user.id))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(100);
    res.json(rows.map(toTransaction));
  },
);

/* ────────────────────────────────────────────────────────────────
 * GET /wallet/payment-methods
 * ──────────────────────────────────────────────────────────────── */
router.get(
  "/wallet/payment-methods",
  async (req, res): Promise<void> => {
    const countryCode = req.query.countryCode as string | undefined;

    if (countryCode) {
      const rows = await db
        .select({
          id: paymentMethodsTable.id,
          name: paymentMethodsTable.name,
          slug: paymentMethodsTable.slug,
          description: paymentMethodsTable.description,
          color: paymentMethodsTable.color,
          logoUrl: paymentMethodsTable.logoUrl,
          recommended: paymentMethodsTable.recommended,
          sortOrder: paymentMethodsTable.sortOrder,
          minDeposit: countryPaymentConfigsTable.minDeposit,
          feePercent: countryPaymentConfigsTable.feePercent,
        })
        .from(paymentMethodsTable)
        .innerJoin(
          countryPaymentConfigsTable,
          and(
            eq(countryPaymentConfigsTable.methodSlug, paymentMethodsTable.slug),
            eq(countryPaymentConfigsTable.countryCode, countryCode),
            eq(countryPaymentConfigsTable.enabled, true),
          ),
        )
        .orderBy(asc(paymentMethodsTable.sortOrder));

      res.json(rows.map(r => ({
        ...toPaymentMethod(r),
        minDeposit: r.minDeposit,
        feePercent: r.feePercent,
      })));
      return;
    }

    const rows = await db
      .select()
      .from(paymentMethodsTable)
      .orderBy(asc(paymentMethodsTable.sortOrder));
    res.json(rows.map(toPaymentMethod));
  },
);

/* ────────────────────────────────────────────────────────────────
 * GET /wallet/deposit-countries
 * ──────────────────────────────────────────────────────────────── */
router.get(
  "/wallet/deposit-countries",
  async (_req, res): Promise<void> => {
    const rows = await db
      .selectDistinctOn([countriesTable.code], {
        code: countriesTable.code,
        name: countriesTable.name,
        flag: countriesTable.flag,
        dialCode: countriesTable.dialCode,
        sortOrder: countriesTable.sortOrder,
        popular: countriesTable.popular,
      })
      .from(countriesTable)
      .innerJoin(
        countryPaymentConfigsTable,
        and(
          eq(countryPaymentConfigsTable.countryCode, countriesTable.code),
          eq(countryPaymentConfigsTable.enabled, true),
        ),
      )
      .orderBy(countriesTable.code, asc(countriesTable.sortOrder));

    res.json(rows);
  },
);

export default router;
