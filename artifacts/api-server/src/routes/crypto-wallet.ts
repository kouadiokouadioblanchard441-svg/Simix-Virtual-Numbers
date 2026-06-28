import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import {
  getNowPaymentsSDK,
  getFcfaToUsdRate,
  fcfaToUsd,
  CRYPTO_NETWORKS,
  type CryptoNetwork,
} from "../lib/nowpayments";
import { getSetting } from "../lib/settings";
import { broadcastNotification } from "./notifications";
import { notificationsTable } from "@workspace/db";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

/* ── IPN callback URL (where NowPayments POSTs status updates) ── */
async function getCryptoWebhookUrl(): Promise<string> {
  if (process.env.NOWPAYMENTS_WEBHOOK_URL) return process.env.NOWPAYMENTS_WEBHOOK_URL;
  const val = await getSetting("nowpayments_webhook_url", "");
  if (val) return val;
  const domain =
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
    process.env.REPLIT_DEV_DOMAIN ||
    process.env.APP_URL?.replace(/^https?:\/\//, "");
  return domain
    ? `https://${domain}/api/wallet/crypto/webhook`
    : "https://simix.site/api/wallet/crypto/webhook";
}

/* ── externalDepositId prefix for crypto transactions ── */
const CRYPTO_PREFIX = "crypto_";

/* ── Credit user balance + update tx + send notification (idempotent) ──
 * Returns true if this call actually did the credit, false if already done. */
async function creditCryptoDeposit(
  txId: string,
  userId: string,
  amountFcfa: number,
  paymentId: string,
  partial = false,
): Promise<boolean> {
  const label = partial ? "partiel" : "confirmé";

  const [justCompleted] = await db
    .update(transactionsTable)
    .set({ status: "completed" })
    .where(
      and(
        eq(transactionsTable.id, txId),
        eq(transactionsTable.status, "pending"),
      ),
    )
    .returning();

  if (!justCompleted) return false; /* already processed */

  await db
    .update(usersTable)
    .set({ balance: sql`${usersTable.balance} + ${amountFcfa}` })
    .where(eq(usersTable.id, userId));

  const body = partial
    ? `${amountFcfa.toLocaleString("fr-FR")} FCFA crédités (paiement crypto partiel).`
    : `${amountFcfa.toLocaleString("fr-FR")} FCFA ont été crédités via crypto.`;

  await db.insert(notificationsTable).values({
    userId,
    title: `Recharge ${label} ✓`,
    body,
    type: "deposit_success",
  });

  broadcastNotification(userId, { title: `Recharge ${label} ✓`, body, type: "deposit_success" });

  logger.info({ paymentId, userId, amountFcfa, partial }, "[Crypto] Balance credited");
  return true;
}

/* ────────────────────────────────────────────────────────────────
 * POST /wallet/crypto/initiate
 *
 * Creates a direct USDT deposit address via NowPayments SDK.
 * SDK preflight (estimate + min-amount) validates the amount before
 * calling POST /v1/payment. Throws ValidationError with
 * BELOW_MINIMUM_PAYMENT_AMOUNT if the converted amount is too small.
 *
 * Returns: paymentId, payAddress, payAmount (USDT), expiresAt, …
 * ──────────────────────────────────────────────────────────────── */
router.post("/wallet/crypto/initiate", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const { amountFcfa, network } = req.body as { amountFcfa?: unknown; network?: unknown };

  if (typeof amountFcfa !== "number" || amountFcfa <= 0) {
    res.status(400).json({ error: "Montant invalide." });
    return;
  }

  const net = (typeof network === "string" ? network : "trc20") as CryptoNetwork;
  const netConfig = CRYPTO_NETWORKS[net];
  if (!netConfig) {
    res.status(400).json({ error: "Réseau crypto non supporté." });
    return;
  }

  const sdk = await getNowPaymentsSDK(await getCryptoWebhookUrl());
  if (!sdk) {
    res.status(503).json({
      error: "Le dépôt crypto est temporairement indisponible. Contactez le support.",
    });
    return;
  }

  const rate = await getFcfaToUsdRate();
  const amountUsd = fcfaToUsd(amountFcfa, rate);

  /* Guard against obviously too-small amounts before calling SDK preflight */
  if (amountUsd < 1) {
    res.status(400).json({
      error: `Montant minimum de dépôt crypto : ${Math.ceil(1 * rate).toLocaleString("fr-FR")} FCFA.`,
    });
    return;
  }

  const orderId = randomUUID();

  let payment: Awaited<ReturnType<typeof sdk.createDirectPayment>>;
  try {
    /*
     * createDirectPayment() calls preflight internally:
     *  1. GET /v1/estimate  — converts USD → USDT equivalent
     *  2. GET /v1/min-amount — fetches minimum for this currency pair
     *  3. Throws ValidationError(BELOW_MINIMUM_PAYMENT_AMOUNT) if below min
     *  4. POST /v1/payment  — creates the deposit address
     */
    payment = await sdk.createDirectPayment({
      amount:      amountUsd,
      currency:    "usd",
      payCurrency: netConfig.currency,  /* e.g. "usdttrc20" */
      orderId,
      description: `Simix ${amountFcfa.toLocaleString("fr-FR")} FCFA`,
    });
  } catch (e: unknown) {
    const err = e as Error & { code?: string; details?: Record<string, unknown> };
    logger.error(
      { error: err.message, code: err.code, userId: user.id, amountUsd, net },
      "[Crypto] createDirectPayment failed",
    );

    /* SDK preflight: amount below minimum for this currency pair */
    if (err.code === "BELOW_MINIMUM_PAYMENT_AMOUNT") {
      const min = (err.details?.minimumPayAmount as number) ?? null;
      const minFcfa = min ? Math.ceil(min * rate).toLocaleString("fr-FR") : null;
      res.status(400).json({
        error: minFcfa
          ? `Montant trop faible. Minimum requis : ≈ ${minFcfa} FCFA (${min} USDT).`
          : "Montant trop faible pour ce réseau. Augmentez le montant.",
        code: "BELOW_MINIMUM",
      });
      return;
    }

    res.status(502).json({ error: `Impossible de créer l'adresse de dépôt : ${err.message}` });
    return;
  }

  /* ── Extract fields from the normalized Payment object ── */
  const paymentId  = String(payment.payment_id ?? "");
  const payAddress = String(payment.pay_address ?? "");
  const payAmount  = Number(payment.pay_amount ?? 0);

  /* SDK normalizePayment already returns ISO strings for dates */
  const expiresAt = payment.expiration_estimate_date
    ? new Date(payment.expiration_estimate_date)
    : new Date(Date.now() + 30 * 60 * 1000);

  const externalDepositId = `${CRYPTO_PREFIX}${paymentId}`;

  /* Store pending transaction BEFORE returning — idempotency */
  const [tx] = await db
    .insert(transactionsTable)
    .values({
      userId:             user.id,
      type:               "recharge",
      amount:             amountFcfa,
      status:             "pending",
      method:             `Crypto USDT (${netConfig.chain})`,
      description:        `Recharge crypto USDT · ${netConfig.chain} — ${amountFcfa.toLocaleString("fr-FR")} FCFA`,
      externalDepositId,
      gatewayMeta: JSON.stringify({
        gateway:    "nowpayments",
        orderId,
        paymentId,
        payAddress,
        payAmount,
        network:    net,
        currency:   netConfig.currency,
        amountUsd,
        fcfaRate:   rate,
        expiresAt:  expiresAt.toISOString(),
      }),
    })
    .returning();

  logger.info(
    { paymentId, orderId, userId: user.id, amountFcfa, amountUsd, net, payAddress },
    "[Crypto] Deposit initiated",
  );

  res.json({
    paymentId,
    orderId,
    payAddress,
    payAmount,
    payAmountFormatted: `${payAmount.toFixed(6)} USDT`,
    network:            net,
    networkLabel:       netConfig.label,
    chain:              netConfig.chain,
    amountFcfa,
    amountUsd,
    expiresAt:          expiresAt.toISOString(),
    txId:               tx.id,
  });
});

/* ────────────────────────────────────────────────────────────────
 * GET /wallet/crypto/:paymentId/status
 *
 * Polls NowPayments API for the live payment status.
 * SDK statuses handled:
 *   pending / processing → return current state, keep polling
 *   paid                 → credit full FCFA amount (idempotent)
 *   partially_paid       → credit actual received amount
 *   failed / expired / cancelled / refunded → mark as failed
 * ──────────────────────────────────────────────────────────────── */
router.get("/wallet/crypto/:paymentId/status", requireAuth, async (req, res): Promise<void> => {
  const user      = req.user!;
  const { paymentId } = req.params;
  const externalDepositId = `${CRYPTO_PREFIX}${paymentId}`;

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.externalDepositId, externalDepositId),
        eq(transactionsTable.userId, user.id),
      ),
    )
    .limit(1);

  if (!tx) {
    res.status(404).json({ error: "Transaction introuvable." });
    return;
  }

  /* Already in terminal state — no need to poll */
  if (tx.status !== "pending") {
    res.json({ status: tx.status === "completed" ? "paid" : tx.status, amountFcfa: tx.amount, paymentId });
    return;
  }

  const sdk = await getNowPaymentsSDK();
  if (!sdk) {
    /* SDK not configured — return last known DB state */
    res.json({ status: "pending", amountFcfa: tx.amount, paymentId });
    return;
  }

  let sdkStatus = "pending";
  try {
    /*
     * getPaymentStatus() returns a normalized Payment object.
     * p.status is the SDK status string (see SDK_PAYMENT_STATUSES):
     *   'pending' | 'processing' | 'paid' | 'partially_paid'
     *   'failed'  | 'refunded'   | 'expired' | 'cancelled' | 'unknown'
     */
    const p = await sdk.getPaymentStatus(paymentId);
    sdkStatus = p.status;

    if (sdkStatus === "paid") {
      await creditCryptoDeposit(tx.id, user.id, tx.amount, paymentId);
    } else if (sdkStatus === "partially_paid") {
      /*
       * User sent less than required. Credit whatever was actually received
       * (NowPayments converts actually_paid to USD; we convert back to FCFA).
       * If actually_paid is unavailable, credit the full expected amount.
       */
      const meta = tx.gatewayMeta ? JSON.parse(tx.gatewayMeta) as Record<string, unknown> : {};
      const fcfaRate = typeof meta.fcfaRate === "number" ? meta.fcfaRate : await getFcfaToUsdRate();
      const actualPaidFcfa = p.actually_paid
        ? Math.floor(Number(p.actually_paid) * fcfaRate)
        : tx.amount;
      await creditCryptoDeposit(tx.id, user.id, actualPaidFcfa, paymentId, true);
    } else if (
      sdkStatus === "failed" ||
      sdkStatus === "expired" ||
      sdkStatus === "cancelled" ||
      sdkStatus === "refunded"
    ) {
      await db
        .update(transactionsTable)
        .set({ status: "failed" })
        .where(and(eq(transactionsTable.id, tx.id), eq(transactionsTable.status, "pending")));
    }
    /* 'processing' / 'pending' / 'unknown' → no action, keep polling */
  } catch (e) {
    logger.warn({ error: (e as Error).message, paymentId }, "[Crypto] Status poll failed");
  }

  res.json({ status: sdkStatus, amountFcfa: tx.amount, paymentId });
});

/* ────────────────────────────────────────────────────────────────
 * POST /wallet/crypto/webhook
 *
 * IPN (Instant Payment Notification) from NowPayments.
 *
 * Verification: sdk.parseWebhook() computes HMAC-SHA512 over
 * JSON.stringify(sortObjectDeep(payload)) and compares using
 * timingSafeEqual — same as the official ipn.js implementation.
 *
 * SDK statuses handled:
 *   paid          → credit full FCFA balance
 *   partially_paid → credit actual received amount
 *   failed / expired / cancelled / refunded → mark tx as failed
 * ──────────────────────────────────────────────────────────────── */
router.post("/wallet/crypto/webhook", async (req, res): Promise<void> => {
  const sig = req.headers["x-nowpayments-sig"] as string | undefined;

  if (!sig) {
    logger.warn("[Crypto Webhook] Missing x-nowpayments-sig header");
    res.status(400).json({ ok: false, error: "Missing signature" });
    return;
  }

  const sdk = await getNowPaymentsSDK();
  if (!sdk) {
    logger.error("[Crypto Webhook] SDK not configured — cannot verify signature");
    res.status(500).json({ ok: false });
    return;
  }

  let event: ReturnType<typeof sdk.parseWebhook>;
  try {
    /*
     * parseWebhook():
     *  1. Verifies HMAC-SHA512 signature (uses this.ipnSecret)
     *     → throws ValidationError(INVALID_WEBHOOK_SIGNATURE) on mismatch
     *     → throws ConfigurationError(MISSING_IPN_SECRET) if no secret
     *  2. Normalizes payload → { type: 'payment.status_changed', payment }
     */
    event = sdk.parseWebhook(req.body as Record<string, unknown>, sig);
  } catch (e) {
    const err = e as Error & { code?: string };
    logger.warn({ error: err.message, code: err.code }, "[Crypto Webhook] Signature verification failed");
    res.status(400).json({ ok: false, error: "Invalid or unverifiable signature" });
    return;
  }

  if (event.type !== "payment.status_changed") {
    /* Unknown webhook type — acknowledge without processing */
    res.json({ ok: true });
    return;
  }

  const payment   = event.payment;
  const paymentId = String(payment.payment_id ?? "");
  const sdkStatus = payment.status; /* SDK-normalized status string */
  const orderId   = String(payment.order_id ?? "");

  logger.info({ paymentId, orderId, sdkStatus }, "[Crypto Webhook] Received");

  const externalDepositId = `${CRYPTO_PREFIX}${paymentId}`;

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.externalDepositId, externalDepositId))
    .limit(1);

  if (!tx) {
    logger.warn({ paymentId, externalDepositId }, "[Crypto Webhook] Transaction not found — acknowledging");
    res.json({ ok: true });
    return;
  }

  if (sdkStatus === "paid") {
    await creditCryptoDeposit(tx.id, tx.userId, tx.amount, paymentId);
  } else if (sdkStatus === "partially_paid") {
    /*
     * partially_paid: user sent less than the required amount.
     * actually_paid is in the pay_currency (USDT); convert back to FCFA.
     */
    const meta = tx.gatewayMeta ? JSON.parse(tx.gatewayMeta) as Record<string, unknown> : {};
    const fcfaRate = typeof meta.fcfaRate === "number" ? meta.fcfaRate : await getFcfaToUsdRate();
    const actualPaidFcfa = payment.actually_paid
      ? Math.floor(Number(payment.actually_paid) * fcfaRate)
      : tx.amount;
    await creditCryptoDeposit(tx.id, tx.userId, actualPaidFcfa, paymentId, true);
  } else if (
    sdkStatus === "failed" ||
    sdkStatus === "expired" ||
    sdkStatus === "cancelled" ||
    sdkStatus === "refunded"
  ) {
    await db
      .update(transactionsTable)
      .set({ status: "failed" })
      .where(and(eq(transactionsTable.externalDepositId, externalDepositId), eq(transactionsTable.status, "pending")));
    logger.info({ paymentId, sdkStatus }, "[Crypto Webhook] Transaction marked as failed");
  }
  /* 'processing' / 'pending' / 'unknown' → no action, wait for next update */

  res.json({ ok: true });
});

export default router;
