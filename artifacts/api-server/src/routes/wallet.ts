import { Router, type IRouter, type Request, type Response } from "express";
import { asc, desc, eq, sql, and, inArray } from "drizzle-orm";
import {
  db,
  paymentMethodsTable,
  mobileOperatorsTable,
  transactionsTable,
  usersTable,
  countryPaymentConfigsTable,
  countriesTable,
  systemSettingsTable,
  currenciesTable,
  paymentRouteLogsTable,
} from "@workspace/db";
import { RechargeWalletBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { toPaymentMethod, toTransaction } from "../lib/serializers";
import {
  type PawaPayDepositCallback,
  generateDepositId,
  buildMSISDN,
  getProviderForCountry,
  verifyContentDigest,
  COUNTRY_CURRENCY,
} from "../lib/pawapay";
import {
  getPawaPayClientForDeposit,
  failPawaPayDeposit,
  makePawaPayGatewayMeta,
  verifyAndSettlePawaPayDeposit,
} from "../lib/pawapay-settlement";
import { createPendingDepositWithFx, isValidClapayLocalAmount } from "../lib/wallet-deposit";
import {
  makeClapayDepositId,
  isClapayDeposit,
  extractClapayTransactionId,
  serializeClapayMeta,
  parseClapayMeta,
  formatClapayPhone,
  isClapayCancellationAcknowledged,
  clapayOperatorRequiresOtp,
  getClapayOperatorPaymentUrl,
  CLAPAY_TERMINAL_SUCCESS,
  normalizeClapayStatus,
  type ClapayWebhookPayload,
} from "../lib/clapay";
import {
  failClapayDeposit,
  getClapayDepositMeta,
  getClapayActionFields,
  getVerifiedClapayStatus,
  persistClapayDepositMeta,
  settleVerifiedClapayDeposit,
  type NormalizedClapayGatewayMeta,
} from "../lib/clapay-settlement";
import { logger } from "../lib/logger";
import { getClapayClient, getEnabledMobileOperator, getPawaPayClient, resolveWalletGateway } from "../lib/wallet-gateway";
import { getMinDepositFcfa, getMaxBalanceFcfa } from "../lib/settings";
import { broadcastNotification } from "./notifications";
import { notificationsTable } from "@workspace/db";
import { sendDepositConfirmationEmail } from "../lib/email";
import { auditLog } from "../lib/audit";
import { creditReferralDepositCommission } from "../lib/referral-commission";

const router: IRouter = Router();

function serializeWalletTransaction(tx: typeof transactionsTable.$inferSelect) {
  const base = toTransaction(tx);
  if (!isClapayDeposit(tx.externalDepositId ?? "")) return base;
  const meta = parseClapayMeta(tx.gatewayMeta);
  return {
    ...base,
    ...getClapayActionFields(meta),
    ...(tx.status === "pending" && !meta?.clapaySignature
      ? {
          uncertainPaymentInstruction:
            "La confirmation Clapay est encore incertaine. Ne relancez pas le paiement; attendez le callback ou contactez le support avec cette référence.",
        }
      : {}),
  };
}

/* ── Clapay webhook secret — derived from CLAPAY_PRIVATE_KEY ──────────────
 * Appended as ?whs=<token> to the callback URL so only Clapay (who received
 * the URL) can trigger the webhook. Verification is timing-safe.            */
function getClapayWebhookSecret(): string | null {
  const key = process.env.CLAPAY_PRIVATE_KEY?.trim();
  if (!key) return null;
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(`clapay-whs:${key}`).digest("hex").slice(0, 40);
}

/* ── Clapay callback URL (set in admin settings or env) ── */
async function getClapayCallbackUrl(): Promise<string> {
  let base = process.env.CLAPAY_CALLBACK_URL?.trim() || "";
  if (!base) {
    const rows = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "clapay_callback_url")).limit(1);
    base = rows[0]?.value?.trim() ?? "";
  }
  if (!base) {
    const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "https://simix.site";
    base = `${appUrl}/api/wallet/clapay/webhook`;
  }
  const secret = getClapayWebhookSecret();
  if (!secret) return base;
  const callback = new URL(base);
  callback.searchParams.set("whs", secret);
  return callback.toString();
}

/* ── Clapay return URL (user is sent here after checkout page) ── */
async function getClapayReturnUrl(): Promise<string> {
  if (process.env.CLAPAY_RETURN_URL) return process.env.CLAPAY_RETURN_URL;

  const rows = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "clapay_return_url")).limit(1);
  if (rows[0]?.value?.trim()) return rows[0].value.trim();

  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "https://simix.site";
  return `${appUrl}/wallet`;
}

/* ────────────────────────────────────────────────────────────────
 * GET /wallet — balance
 * ──────────────────────────────────────────────────────────────── */
router.get("/wallet", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  res.json({ balance: user.balance, currency: "FCFA" });
});

router.get("/wallet/payment-options", requireAuth, async (req, res): Promise<void> => {
  const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode.trim().toUpperCase() : "";
  const methodSlug = typeof req.query.methodSlug === "string" ? req.query.methodSlug.trim() : "";
  if (!countryCode || !methodSlug) {
    res.status(400).json({ error: "countryCode et methodSlug sont requis" });
    return;
  }

  try {
    const [method] = await db.select().from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.slug, methodSlug)).limit(1);
    const [enabledMethod] = method
      ? await db.select({ id: countryPaymentConfigsTable.id }).from(countryPaymentConfigsTable)
        .where(and(
          eq(countryPaymentConfigsTable.countryCode, countryCode),
          eq(countryPaymentConfigsTable.methodSlug, methodSlug),
          eq(countryPaymentConfigsTable.enabled, true),
        )).limit(1)
      : [];
    const operator = method && enabledMethod
      ? await getEnabledMobileOperator(methodSlug, method.name, countryCode)
      : null;
    if (!method || !enabledMethod || !operator) {
      res.status(422).json({ error: "Mode Mobile Money inconnu ou non activé pour ce pays." });
      return;
    }

    const selected = await resolveWalletGateway(countryCode, methodSlug, 0);
    if (!selected.gateway) {
      res.status(503).json({
        error: selected.unavailableReason ?? "Aucune passerelle de paiement n'est configurée pour ce mode de paiement.",
      });
      return;
    }
    if (selected.gateway !== "clapay") {
      res.json({ gateway: selected.gateway, requiresOtp: false, instruction: null, operatorCode: null });
      return;
    }

    const clapayOperator = await selected.clapayCtx!.client.resolveOperator(countryCode, methodSlug);
    if (!clapayOperator) {
      res.status(422).json({ error: `Opérateur Clapay non disponible pour ${countryCode} / ${methodSlug}.` });
      return;
    }
    const operatorInstruction = clapayOperator.instruction as Record<string, unknown> | null;
    const instructionValue = operatorInstruction?.MERCHANT ?? operatorInstruction?.merchant;
    const instruction = typeof instructionValue === "string" ? instructionValue : null;
    res.json({
      gateway: "clapay",
      requiresOtp: clapayOperatorRequiresOtp(clapayOperator),
      instruction,
      operatorCode: clapayOperator.codeoperator,
    });
  } catch (error) {
    logger.warn({ countryCode, methodSlug, error: (error as Error).message }, "[Clapay] Payment options lookup failed");
    res.status(502).json({ error: "Impossible de charger les options de paiement auprès de Clapay. Réessayez plus tard." });
  }
});

/* ────────────────────────────────────────────────────────────────
 * POST /wallet/recharge
 *
 * DEPOSIT RULES (critical):
 *  - Mobile money + PawaPay configured → MUST use PawaPay, NEVER instant credit
 *  - Mobile money + PawaPay NOT configured → return 503 error, NEVER instant credit
 *  - Unverified/non-mobile methods → reject; crypto uses its dedicated verified route
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
    const currencyCode: string = typeof rawBody.currencyCode === "string" ? rawBody.currencyCode.trim().toUpperCase() : "XOF";
    const isXofCurrency = currencyCode === "XOF" || currencyCode === "XAF";

    let amountXof   = amount;          // amount in FCFA credited to user
    let localAmount = amount;          // amount in local currency sent to gateway
    let fxMeta: { realRate: number; clientRate: number; profitXof: number } | null = null;

    if (!isXofCurrency) {
      if (!countryCode) {
        res.status(400).json({ error: "Code pays requis pour convertir la devise du dépôt." });
        return;
      }
      const [currRow] = await db
        .select()
        .from(currenciesTable)
        .where(and(
          eq(currenciesTable.countryCode, countryCode.toUpperCase()),
          eq(currenciesTable.currencyCode, currencyCode),
          eq(currenciesTable.active, true),
        ))
        .limit(1);

      if (!currRow) {
        res.status(422).json({ error: `La devise ${currencyCode} n'est pas activée pour ${countryCode.toUpperCase()}.` });
        return;
      }
      const clientRate = Number(currRow.clientRate);
      const realRate   = Number(currRow.realRate);
      if (!Number.isFinite(clientRate) || clientRate <= 0 || !Number.isFinite(realRate) || realRate <= 0) {
        res.status(503).json({ error: "Les taux de conversion de cette devise ne sont pas disponibles." });
        return;
      }
      localAmount      = amount;
      amountXof        = Math.floor(amount * clientRate);
      fxMeta           = { realRate, clientRate, profitXof: Math.floor(amount * (clientRate - realRate)) };
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
    if (!method) {
      res.status(400).json({ error: "Mode de paiement inconnu." });
      return;
    }
    if (!countryCode) {
      res.status(400).json({ error: "Code pays requis pour une recharge vérifiée." });
      return;
    }

    const [enabledMethod] = await db.select({ id: countryPaymentConfigsTable.id })
      .from(countryPaymentConfigsTable)
      .where(and(
        eq(countryPaymentConfigsTable.countryCode, countryCode.toUpperCase()),
        eq(countryPaymentConfigsTable.methodSlug, methodSlug),
        eq(countryPaymentConfigsTable.enabled, true),
      ))
      .limit(1);
    if (!enabledMethod) {
      res.status(422).json({ error: "Ce mode de paiement n'est pas activé pour ce pays." });
      return;
    }

    const mobileOperator = await getEnabledMobileOperator(methodSlug, method.name, countryCode);
    if (!mobileOperator) {
      res.status(422).json({
        error: "Ce mode de paiement ne dispose pas d'un flux Mobile Money vérifié. Utilisez le dépôt crypto dédié ou contactez le support.",
      });
      return;
    }

    const phoneDisplay = phoneNumber ? ` — ${dialCode ?? ""}${phoneNumber}` : "";
    const description = `Recharge via ${method.name}${phoneDisplay}`;

    /* ════════════════════════════════════════════════════════════
     * MOBILE MONEY PATH — Gateway-aware (PawaPay v2 / Clapay)
     * Account is NEVER credited here; only webhook/poll does it.
     *
     * ROUTING PRIORITY:
     *  1. Dynamic routing via payment_routes table (admin-configurable)
     *  2. Legacy fallback via system_settings.mobile_money_gateway
     * ════════════════════════════════════════════════════════════ */
    if (mobileOperator) {
      if (!phoneNumber || !countryCode) {
        res.status(400).json({ error: "Numéro de téléphone et code pays requis pour le Mobile Money." });
        return;
      }

      /* ── Check country is enabled for deposits ── */
      const [depositCountry] = await db
        .select({ enabled: countriesTable.enabled })
        .from(countriesTable)
        .where(eq(countriesTable.code, countryCode.toUpperCase()))
        .limit(1);
      if (!depositCountry || depositCountry.enabled === false) {
        res.status(400).json({ error: "Les dépôts ne sont pas disponibles pour ce pays pour le moment." });
        return;
      }

      const {
        gateway: activeGateway,
        pawaPayCtx,
        clapayCtx,
        gatewayConfigId,
        routingSource,
        unavailableReason,
      } =
        await resolveWalletGateway(countryCode, methodSlug, amountXof);

      if (!activeGateway) {
        logger.error({ methodSlug, routingSource }, "[Payment] No gateway configured — cannot process mobile money");
        res.status(503).json({
          error: unavailableReason ?? "Le paiement Mobile Money est temporairement indisponible. Contactez le support.",
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

        const pendingTx = await createPendingDepositWithFx({
          userId: user.id, type: "recharge", amount: amountXof, status: "pending",
          method: method?.name ?? methodSlug, description, externalDepositId: depositId,
          gatewayMeta: makePawaPayGatewayMeta({
            amount: localAmount,
            currency,
            provider,
            phoneNumber: msisdn,
            countryCode,
            gatewayConfigId,
          }),
        }, fxMeta && !isXofCurrency ? {
          currency: currencyCode,
          localAmount: String(localAmount),
          realRate: String(fxMeta.realRate),
          clientRate: String(fxMeta.clientRate),
          amountXof: String(amountXof),
          profitXof: String(fxMeta.profitXof),
          status: "pending",
        } : undefined);

        auditLog({ userId: user.id, userName: user.fullName, action: "deposit_initiated", entity: "transaction", entityId: pendingTx.id, ip: req.ip ?? "unknown", userAgent: req.headers["user-agent"] ?? "", severity: "info", description: `Recharge ${amountXof} FCFA via PawaPay (${methodSlug})` });

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

          /* Only explicit client-side rejection proves initiation did not happen.
           * 5xx, timeouts and network failures are ambiguous: retain this ID and
           * let authoritative status polling reconcile it; never retry initiation. */
          const pawaStatus = Number(errMsg.match(/^PawaPay\s+(\d{3})/)?.[1]);
          const nodeStatus = Number((e as NodeJS.ErrnoException).code?.match(/^[45]\d\d$/)?.[0]);
          const isDefinitiveClientRejection =
            (Number.isFinite(pawaStatus) && pawaStatus >= 400 && pawaStatus < 500 && ![408, 425, 429].includes(pawaStatus)) ||
            (Number.isFinite(nodeStatus) && nodeStatus >= 400 && nodeStatus < 500 && ![408, 425, 429].includes(nodeStatus));
          if (isDefinitiveClientRejection) {
            await failPawaPayDeposit(depositId);
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

        if (depositRes.status === "REJECTED") {
          await failPawaPayDeposit(depositId);
          const reason = depositRes.failureReason?.failureMessage ?? depositRes.failureReason?.failureCode ?? "Rejeté par l'opérateur";
          logger.warn({ depositRes, provider, msisdn, depositId }, "[PawaPay] Deposit REJECTED");
          res.status(422).json({ error: `Dépôt refusé : ${reason}. Vérifiez votre numéro et réessayez.` });
          return;
        }

        res.status(502).json({
          error: "Réponse d'initiation incertaine. Le dépôt reste en attente; ne le soumettez pas à nouveau avant de vérifier l'historique.",
          depositId,
          pending: true,
        });
        return;
      }

      /* ── Clapay path ── */
      if (activeGateway === "clapay") {
        const { client } = clapayCtx!;
        if (!isValidClapayLocalAmount(localAmount)) {
          res.status(422).json({
            error: "Clapay accepte uniquement les montants entiers dans la devise locale. Modifiez le montant avant de réessayer.",
            code: "CLAPAY_INTEGER_AMOUNT_REQUIRED",
          });
          return;
        }

        /* Resolve an active operator from the current API catalogue. */
        const clapayT0 = Date.now();
        let operator;
        try {
          operator = await client.resolveOperator(countryCode.toUpperCase(), methodSlug);
        } catch (e) {
          logger.warn({ countryCode, methodSlug, error: (e as Error).message }, "[Clapay] Operator catalogue request failed");
          res.status(502).json({ error: "Impossible de charger les opérateurs Clapay. Réessayez plus tard." });
          return;
        }
        if (!operator) {
          await db.insert(paymentRouteLogsTable).values({
            eventType: "payment", status: "error",
            errorMessage: `Opérateur Clapay introuvable pour ${countryCode} / ${methodSlug}`,
            metadata: { gateway: "clapay", country: countryCode, methodSlug, amountXof },
          }).catch(() => {});
          res.status(422).json({
            error: `Opérateur Mobile Money non supporté via Clapay pour ce pays (${countryCode}). Essayez un autre mode de paiement.`,
          });
          return;
        }
        const operatorCode = operator.codeoperator;
        const operatorOtp = typeof (req.body as Record<string, unknown>).operatorOtp === "string"
          ? String((req.body as Record<string, unknown>).operatorOtp).trim()
          : "";
        const requiresOtp = clapayOperatorRequiresOtp(operator);
        if (requiresOtp && !operatorOtp) {
          res.status(400).json({ error: "Le code OTP opérateur est requis pour ce mode de paiement.", requiresOtp: true });
          return;
        }

        logger.info({ country: countryCode, methodSlug, operatorCode }, "[Clapay] Resolved operator code");

        /* Generate our tracking UUID (sent to Clapay as transaction_id, echoed back in webhook) */
        const trackingId = generateDepositId(); /* UUID v4 */
        const externalDepositId = makeClapayDepositId(trackingId);
        const localCurrency = currencyCode.toUpperCase();
        const clapayAmount = localAmount;
        const initialMeta = serializeClapayMeta({
          clapayCurrency: localCurrency,
          clapayCountry: countryCode.toUpperCase(),
          localAmount: clapayAmount,
          operatorCode,
          trackingId,
          method: "MERCHANT",
          initiatedAt: new Date().toISOString(),
          gatewayConfigId,
        });

        /* Create pending transaction BEFORE calling Clapay — idempotency */
        const pendingTx = await createPendingDepositWithFx({
          userId: user.id, type: "recharge", amount: amountXof, status: "pending",
          method: method?.name ?? methodSlug, description, externalDepositId, gatewayMeta: initialMeta,
        }, fxMeta && !isXofCurrency ? {
          currency: currencyCode,
          localAmount: String(localAmount),
          realRate: String(fxMeta.realRate),
          clientRate: String(fxMeta.clientRate),
          amountXof: String(amountXof),
          profitXof: String(fxMeta.profitXof),
          status: "pending",
        } : undefined);

        auditLog({ userId: user.id, userName: user.fullName, action: "deposit_initiated", entity: "transaction", entityId: pendingTx.id, ip: req.ip ?? "unknown", userAgent: req.headers["user-agent"] ?? "", severity: "info", description: `Recharge ${amountXof} FCFA via Clapay (${methodSlug})` });

        const [callbackUrl, returnUrl] = await Promise.all([getClapayCallbackUrl(), getClapayReturnUrl()]);

        let clapayRes;
        try {
          clapayRes = await client.initiatePayment({
            transaction_id: trackingId,
            additional_infos: {
              customer_phone: formatClapayPhone(phoneNumber, dialCode, countryCode),
              customer_firstname: user.fullName?.split(" ")[0] ?? undefined,
              customer_lastname: user.fullName?.split(" ").slice(1).join(" ") ?? undefined,
              customer_email: user.email ?? undefined,
            },
            amount: clapayAmount,   /* local currency amount sent to Clapay */
            callback_url: callbackUrl,
            return_url: returnUrl,
            country_code: countryCode.toUpperCase(),
            operators_code: [operatorCode],
            method: "MERCHANT",
            tunnel: "API",
            ...(requiresOtp ? { operator_otp: operatorOtp } : {}),
          });
        } catch (e) {
          const errMsg = (e as Error).message ?? "Erreur inconnue";
          logger.error({ error: errMsg, trackingId, userId: user.id }, "[Clapay] Payment initiation failed");

          /* Log failed attempt */
          await db.insert(paymentRouteLogsTable).values({
            eventType: "payment", status: "error",
            transactionId: externalDepositId,
            responseTimeMs: Date.now() - clapayT0,
            errorMessage: errMsg,
            metadata: {
              gateway: "clapay",
              country: countryCode,
              methodSlug,
              operatorCode,
              amountLocal: localAmount,
              amountXof,
              phone: `${dialCode ?? ""}${phoneNumber}`,
              trackingId,
              routingSource,
            },
          }).catch(() => {});

          const statusCode = Number((e as NodeJS.ErrnoException).code);
          const explicitClientRejection = statusCode >= 400 && statusCode < 500 &&
            ![408, 425, 429].includes(statusCode);
          if (explicitClientRejection) {
            await failClapayDeposit(externalDepositId);
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

        const initStatus = String(clapayRes.status_payment ?? "").toUpperCase();
        if (normalizeClapayStatus(initStatus) === "failed" || clapayRes.observation_error) {
          await failClapayDeposit(externalDepositId);
          const refusal = clapayRes.observation_error || clapayRes.message || `Paiement refusé (${initStatus}).`;
          res.status(422).json({ error: refusal });
          return;
        }
        const knownSuccessfulInit = CLAPAY_TERMINAL_SUCCESS.has(initStatus);
        const ambiguousInitStatus = initStatus !== "INITIATED" && !knownSuccessfulInit;

        if (!clapayRes.signature) {
          logger.error({ trackingId, userId: user.id }, "[Clapay] Init response missing a payment signature; leaving deposit pending");
          res.status(502).json({
            error: "Réponse Clapay incomplète. Votre dépôt reste incertain; ne relancez pas le paiement. Attendez le callback ou contactez le support avec cette référence.",
            depositId: externalDepositId,
            pending: true,
            uncertainPayment: true,
          });
          return;
        }

        logger.info(
          { trackingId, userId: user.id, amount: clapayAmount, amountXof, operatorCode, status: initStatus },
          "[Clapay] Payment initiated",
        );

        /* Log successful initiation */
        await db.insert(paymentRouteLogsTable).values({
          eventType: "payment", status: "success",
          transactionId: externalDepositId,
          responseTimeMs: Date.now() - clapayT0,
          metadata: {
            gateway: "clapay",
            country: countryCode,
            methodSlug,
            operatorCode,
            amountLocal: clapayAmount,
            amountXof,
            trackingId,
            status: initStatus,
            currency: localCurrency,
            routingSource,
          },
        }).catch(() => {});

        const message = clapayRes.message
          ?? (clapayRes.payment_otp
            ? `Saisissez le code ${clapayRes.payment_otp} dans votre application mobile money pour confirmer le paiement.`
            : `Confirmez le paiement sur votre téléphone (${method?.name ?? methodSlug}). Votre solde sera crédité après vérification.`);
        const persistedMeta = await persistClapayDepositMeta(externalDepositId, {
          clapaySignature: clapayRes.signature,
          operatorPaymentUrl: getClapayOperatorPaymentUrl(clapayRes),
          paymentOtp: clapayRes.payment_otp ?? null,
          message,
        });
        if (!persistedMeta) {
          const [latest] = await db.select().from(transactionsTable)
            .where(eq(transactionsTable.id, pendingTx!.id)).limit(1);
          if (latest && latest.status !== "pending") {
            res.json(serializeWalletTransaction(latest));
          } else {
            res.status(502).json({
              error: "La réponse Clapay ne correspond pas à la signature déjà associée. Le dépôt reste en attente de vérification.",
              depositId: externalDepositId,
              pending: true,
            });
          }
          return;
        }

        if (ambiguousInitStatus) {
          res.status(502).json({
            error: "Clapay a renvoyé un statut d'initialisation inconnu. Le dépôt reste en attente de vérification.",
            depositId: externalDepositId,
            pending: true,
          });
          return;
        }

        res.json({
          ...toTransaction(pendingTx!),
          pending: true,
          depositId: externalDepositId,
          gateway: "clapay",
          paymentMode: "API",
          payment_url: null,
          operatorPaymentUrl: persistedMeta.operatorPaymentUrl ?? null,
          paymentOtp: persistedMeta.paymentOtp ?? null,
          message: persistedMeta.message ?? message,
        });
        return;
      }
    }

    res.status(422).json({
      error: "Aucun flux de paiement vérifié n'est disponible pour ce mode. Le solde n'a pas été crédité.",
    });
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
 * The callback is only a hint: query PawaPay's status endpoint and process it
 * before acknowledging. Account credit is based only on verified status data.
 * ──────────────────────────────────────────────────────────────── */
router.post("/wallet/pawapay/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    /* Content-Digest verification (if signed callbacks are enabled in PawaPay dashboard) */
    const contentDigest = req.headers["content-digest"] as string | undefined;
    if (contentDigest) {
      const digestOk = Boolean(req.rawBody) && verifyContentDigest(req.rawBody!, contentDigest);
      if (!digestOk) {
        logger.error({ contentDigest, hasRawBody: !!req.rawBody }, "[PawaPay Webhook] Content-Digest MISMATCH — possible tampering, ignoring");
        res.status(400).json({ error: "Invalid Content-Digest" });
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
    res.status(200).json({ received: true });
  } catch (e) {
    logger.error({ error: (e as Error).message }, "[PawaPay Webhook] Error processing deposit callback");
    res.status(503).json({ error: "Unable to verify or process deposit status; retry later." });
  }
});

/* ── Process a single v2 deposit callback ── */
async function processDepositCallback(payload: PawaPayDepositCallback): Promise<void> {
  if (!payload || typeof payload !== "object") {
    logger.warn("[PawaPay Webhook] Invalid callback payload ignored");
    return;
  }
  const { depositId, status } = payload;

  if (!depositId || !status) {
    logger.warn({ payload }, "[PawaPay Webhook] Invalid payload — missing depositId or status");
    return;
  }

  logger.info({ depositId, status }, "[PawaPay Webhook] Callback received as a status hint");
  if (status !== "COMPLETED" && status !== "FAILED") return;

  const [deposit] = await db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.externalDepositId, depositId),
      eq(transactionsTable.type, "recharge"),
    ))
    .limit(1);
  if (!deposit || deposit.status !== "pending") {
    logger.info({ depositId }, "[PawaPay Webhook] Unknown or already processed deposit ignored");
    return;
  }

  const client = await getPawaPayClientForDeposit(deposit);
  if (!client) throw new Error("PawaPay credentials for the initiating gateway are unavailable");
  const outcome = await verifyAndSettlePawaPayDeposit(depositId, client);
  if (outcome.ignored) {
    logger.warn({ depositId }, "[PawaPay Webhook] Authoritative status did not match stored deposit evidence");
  }
  if (outcome.failed) {
    logger.warn({ depositId }, "[PawaPay Webhook] Verified failed deposit atomically marked failed");
  }
  if (!outcome.settled || !outcome.userId || outcome.amount === undefined || !outcome.transactionId) return;

  // Everything below is best-effort after the atomic credit has committed. A
  // notification/email outage must never undo or obscure the settled payment.
  try {
    const [notif] = await db.insert(notificationsTable).values({
      userId: outcome.userId,
      title: "💰 Solde rechargé",
      body: `Votre solde a été crédité de ${outcome.amount.toLocaleString("fr-FR")} FCFA avec succès.`,
      type: "deposit",
      icon: "wallet",
      link: "/wallet",
      metadata: { amount: outcome.amount, depositId, gateway: "pawapay" },
    }).returning();
    if (notif) broadcastNotification(notif);
  } catch (error) {
    logger.warn({ depositId, error: (error as Error).message }, "[PawaPay Webhook] Notification failed after settlement");
  }

  try {
    const [userRow] = await db.select({
      email: usersTable.email,
      fullName: usersTable.fullName,
      balance: usersTable.balance,
      referredBy: usersTable.referredBy,
    }).from(usersTable).where(eq(usersTable.id, outcome.userId)).limit(1);
    if (userRow?.email) {
      const phoneMatch = deposit.description?.match(/[\+\d]{8,}/);
      await sendDepositConfirmationEmail({
        userEmail: userRow.email,
        userFullName: userRow.fullName ?? "Utilisateur",
        amount: outcome.amount,
        method: deposit.method ?? "Mobile Money",
        phoneNumber: phoneMatch?.[0] ?? null,
        transactionId: outcome.transactionId,
        depositId,
        createdAt: deposit.createdAt ? new Date(deposit.createdAt) : new Date(),
        newBalance: userRow.balance,
      });
    }
    void creditReferralDepositCommission({
      depositorId: outcome.userId,
      referredBy: userRow?.referredBy,
      depositAmount: outcome.amount,
      sourceLabel: deposit.method ?? "Mobile Money",
    });
  } catch (error) {
    logger.warn({ depositId, error: (error as Error).message }, "[PawaPay Webhook] Post-settlement email/referral lookup failed");
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
  /* ── Webhook token verification (timing-safe) ──────────────────────────
   * When CLAPAY_PRIVATE_KEY is set, callback URLs include ?whs=<token>.
   * We reject any webhook that doesn't carry the correct token.
   * This prevents unauthorized actors from crediting arbitrary balances. */
  const expectedSecret = getClapayWebhookSecret();
  if (expectedSecret) {
    const { timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
    const received = String(req.query["whs"] ?? "");
    let valid = false;
    try {
      const a = Buffer.from(received.padEnd(expectedSecret.length, "\0"));
      const b = Buffer.from(expectedSecret);
      valid = a.length === b.length && timingSafeEqual(a, b);
    } catch { valid = false; }
    if (!valid) {
      logger.warn({ ip: req.ip }, "[Clapay Webhook] Invalid or missing webhook token — rejected");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  /* Respond 200 immediately — Clapay requires a fast ACK */
  res.status(200).json({ received: true });

  try {
    const payload = req.body as ClapayWebhookPayload;
    const transactionId = payload.transaction_id;
    if (!transactionId || !payload.signature) {
      logger.warn({ hasTransactionId: Boolean(transactionId), hasSignature: Boolean(payload.signature) }, "[Clapay Webhook] Invalid payload");
      return;
    }

    const externalDepositId = makeClapayDepositId(transactionId);
    const [deposit] = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.externalDepositId, externalDepositId)).limit(1);
    if (!deposit || deposit.status !== "pending") return;

    const context = await getClapayDepositMeta(externalDepositId, { clapaySignature: payload.signature });
    if (!context || context.meta.trackingId !== transactionId) {
      logger.warn({ transactionId }, "[Clapay Webhook] Callback identity does not match stored payment");
      return;
    }
    const meta = context.meta;

    const clientContext = await getClapayClient(meta.gatewayConfigId);
    if (!clientContext) {
      logger.warn({ transactionId }, "[Clapay Webhook] Cannot verify status because Clapay is not configured");
      return;
    }
    const verified = await getVerifiedClapayStatus(clientContext.client, meta, transactionId, true);
    if (!verified) {
      logger.warn({ transactionId }, "[Clapay Webhook] Signature is unknown to status API; deposit remains pending");
      return;
    }
    const persistedMeta = await persistClapayDepositMeta(externalDepositId, { clapaySignature: payload.signature });
    if (!persistedMeta) {
      logger.warn({ transactionId }, "[Clapay Webhook] Could not safely persist verified signature metadata");
      return;
    }
    if (verified.status === "failed") {
      await failClapayDeposit(externalDepositId);
      return;
    }
    if (verified.status !== "completed") return;

    const outcome = await settleVerifiedClapayDeposit(externalDepositId);
    if (!outcome.settled || !outcome.userId || outcome.amount === undefined || !outcome.transactionId) return;
    const [userRow] = await db.select({
      email: usersTable.email,
      fullName: usersTable.fullName,
      balance: usersTable.balance,
      referredBy: usersTable.referredBy,
    }).from(usersTable).where(eq(usersTable.id, outcome.userId)).limit(1);
    try {
      const [notif] = await db.insert(notificationsTable).values({
        userId: outcome.userId,
        title: "💰 Solde rechargé",
        body: `Votre solde a été crédité de ${outcome.amount.toLocaleString("fr-FR")} FCFA avec succès.`,
        type: "deposit",
        icon: "wallet",
        link: "/wallet",
        metadata: { amount: outcome.amount, depositId: transactionId, gateway: "clapay" },
      }).returning();
      if (notif) broadcastNotification(notif);
    } catch { /* Non-critical after atomic settlement. */ }
    if (userRow?.email) {
      const phoneMatch = deposit.description?.match(/[\+\d]{8,}/);
      await sendDepositConfirmationEmail({
        userEmail: userRow.email,
        userFullName: userRow.fullName ?? "Utilisateur",
        amount: outcome.amount,
        method: deposit.method ?? "Mobile Money",
        phoneNumber: phoneMatch?.[0] ?? null,
        transactionId: outcome.transactionId,
        depositId: transactionId,
        createdAt: deposit.createdAt,
        newBalance: userRow.balance,
      }).catch((e: Error) => logger.warn({ error: e.message, transactionId }, "[Clapay Webhook] Email failed"));
    }
    void creditReferralDepositCommission({
      depositorId: outcome.userId,
      referredBy: userRow?.referredBy,
      depositAmount: outcome.amount,
      sourceLabel: deposit.method ?? "Mobile Money",
    });
  } catch (e) {
    logger.error({ error: (e as Error).message }, "[Clapay Webhook] Unhandled error processing callback");
  }
});

/* ────────────────────────────────────────────────────────────────
 * POST /wallet/deposit/:depositId/cancel
 * ──────────────────────────────────────────────────────────────── */
router.post("/wallet/deposit/:depositId/cancel", requireAuth, async (req, res): Promise<void> => {
  const depositId = String(req.params.depositId);
  const [tx] = await db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.externalDepositId, depositId),
      eq(transactionsTable.userId, req.user!.id),
      eq(transactionsTable.type, "recharge"),
    ))
    .limit(1);
  if (!tx) { res.status(404).json({ error: "Dépôt introuvable" }); return; }
  if (!isClapayDeposit(depositId)) {
    res.status(400).json({ error: "L'annulation est disponible uniquement pour les paiements Clapay." });
    return;
  }
  if (tx.status !== "pending") { res.json(serializeWalletTransaction(tx)); return; }

  const meta = await persistClapayDepositMeta(depositId);
  if (!meta?.clapaySignature) { res.status(409).json({ error: "La signature ou les données vérifiables du paiement ne sont pas encore disponibles." }); return; }
  const clapayContext = await getClapayClient(meta.gatewayConfigId);
  if (!clapayContext) { res.status(503).json({ error: "Clapay n'est pas configuré." }); return; }

  try {
    const verified = await getVerifiedClapayStatus(
      clapayContext.client, meta, extractClapayTransactionId(depositId), true,
    );
    if (verified?.status === "completed") {
      await settleVerifiedClapayDeposit(depositId);
    } else if (verified?.status === "failed") {
      await failClapayDeposit(depositId);
    } else if (verified?.status === "pending") {
      const cancellation = await clapayContext.client.cancelPayment(meta.clapaySignature);
      if (!isClapayCancellationAcknowledged(cancellation)) {
        res.status(502).json({
          error: cancellation.message ?? "Clapay n'a pas confirmé l'annulation. Le paiement reste en attente.",
          pending: true,
        });
        return;
      }
      await failClapayDeposit(depositId);
    } else {
      res.status(409).json({
        error: "Clapay ne confirme pas que ce paiement est toujours initié; il n'a pas été annulé.",
        pending: true,
      });
      return;
    }
    const [updated] = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.id, tx.id)).limit(1);
    res.json(serializeWalletTransaction(updated ?? tx));
  } catch (error) {
    logger.warn({ depositId, error: (error as Error).message }, "[Clapay Cancel] Status check or cancellation failed");
    res.status(502).json({ error: "Impossible de vérifier ou d'annuler ce paiement auprès de Clapay.", pending: true });
  }
});

/* ────────────────────────────────────────────────────────────────
 * GET /wallet/deposit/:depositId/status
 * Poll the selected gateway for live deposit status.
 * ──────────────────────────────────────────────────────────────── */
router.get("/wallet/deposit/:depositId/status", requireAuth, async (req, res): Promise<void> => {
  const depositId = String(req.params.depositId);
  const user = req.user!;

  const [tx] = await db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.externalDepositId, depositId),
      eq(transactionsTable.userId, user.id),
      eq(transactionsTable.type, "recharge"),
    ))
    .limit(1);

  if (!tx) { res.status(404).json({ error: "Dépôt introuvable" }); return; }

  const clapayDeposit = isClapayDeposit(depositId);
  let clapayMeta: NormalizedClapayGatewayMeta | null = null;

  /* Only poll if transaction is still pending */
  if (tx.status === "pending") {
    if (clapayDeposit) {
      clapayMeta = await persistClapayDepositMeta(depositId);
      const clapayContext = await getClapayClient(clapayMeta?.gatewayConfigId);
      if (clapayContext && clapayMeta?.clapaySignature) {
        try {
          const trackingId = extractClapayTransactionId(depositId);
          const verified = await getVerifiedClapayStatus(clapayContext.client, clapayMeta, trackingId);
          if (verified?.status === "completed") {
            const outcome = await settleVerifiedClapayDeposit(depositId);
            if (outcome.settled && outcome.userId && outcome.amount !== undefined) {
              void creditReferralDepositCommission({
                depositorId: outcome.userId,
                referredBy: user.referredBy,
                depositAmount: outcome.amount,
                sourceLabel: tx.method ?? "Mobile Money",
              });
            }
          } else if (verified?.status === "failed") {
            await failClapayDeposit(depositId);
          }
        } catch (error) {
          logger.warn({ depositId, error: (error as Error).message }, "[Clapay Poll] Status verification failed; transaction remains pending");
        }
      }
      const [updated] = await db.select().from(transactionsTable)
        .where(eq(transactionsTable.id, tx.id)).limit(1);
      res.json(serializeWalletTransaction(updated ?? tx));
      return;
    }

    const pawaPayClient = await getPawaPayClientForDeposit(tx);
    if (pawaPayClient) {
      try {
        const outcome = await verifyAndSettlePawaPayDeposit(depositId, pawaPayClient);
        if (outcome.settled && outcome.userId && outcome.amount !== undefined) {
          void creditReferralDepositCommission({
            depositorId: outcome.userId,
            referredBy: user.referredBy,
            depositAmount: outcome.amount,
            sourceLabel: tx.method ?? "Mobile Money",
          });
        }
      } catch (e) {
        logger.warn({ error: (e as Error).message }, "[PawaPay Poll] Status check failed");
      }
    }
    const [updated] = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.id, tx.id)).limit(1);
    res.json(serializeWalletTransaction(updated ?? tx));
    return;
  }

  res.json(serializeWalletTransaction(tx));
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
    res.json(rows.map(serializeWalletTransaction));
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
          logoUrl: sql<string | null>`COALESCE(${paymentMethodsTable.logoUrl}, ${mobileOperatorsTable.logoUrl})`,
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
        .leftJoin(
          mobileOperatorsTable,
          eq(mobileOperatorsTable.slug, paymentMethodsTable.slug),
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
      .select({
        id: paymentMethodsTable.id,
        name: paymentMethodsTable.name,
        slug: paymentMethodsTable.slug,
        description: paymentMethodsTable.description,
        color: paymentMethodsTable.color,
        logoUrl: sql<string | null>`COALESCE(${paymentMethodsTable.logoUrl}, ${mobileOperatorsTable.logoUrl})`,
        recommended: paymentMethodsTable.recommended,
        sortOrder: paymentMethodsTable.sortOrder,
      })
      .from(paymentMethodsTable)
      .leftJoin(
        mobileOperatorsTable,
        eq(mobileOperatorsTable.slug, paymentMethodsTable.slug),
      )
      .orderBy(asc(paymentMethodsTable.sortOrder));
    res.json(rows.map(toPaymentMethod));
  },
);

/* ────────────────────────────────────────────────────────────────
 * GET /wallet/deposit-countries
 * Only Sub-Saharan African countries (no Maghreb / non-Africa)
 * ──────────────────────────────────────────────────────────────── */
const SUBSAHARAN_AFRICA_CODES = [
  "ZA","AO","BJ","BW","BF","BI","CM","CV","TD","KM","CG","CI",
  "DJ","SZ","ET","GA","GM","GH","GN","GQ","GW","KE","LS","LR",
  "MG","MW","ML","MU","MZ","NA","NE","NG","UG","RW","SN","SC",
  "SL","SO","SS","ST","CF","TZ","TG","ZM","ZW","ER","CD","BI",
];

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
      .where(inArray(countriesTable.code, SUBSAHARAN_AFRICA_CODES))
      .orderBy(countriesTable.code, asc(countriesTable.sortOrder));

    res.json(rows);
  },
);

export default router;
