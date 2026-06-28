import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, transactionsTable, usersTable, systemSettingsTable } from "@workspace/db";
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

/* ── IPN callback URL (where NowPayments sends webhook) ── */
async function getCryptoWebhookUrl(): Promise<string> {
  if (process.env.NOWPAYMENTS_WEBHOOK_URL) return process.env.NOWPAYMENTS_WEBHOOK_URL;
  const val = await getSetting("nowpayments_webhook_url", "");
  if (val) return val;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
    || process.env.REPLIT_DEV_DOMAIN
    || process.env.APP_URL?.replace(/^https?:\/\//, "");
  return domain ? `https://${domain}/api/wallet/crypto/webhook` : "https://simix.site/api/wallet/crypto/webhook";
}

/* ── Prefix used for externalDepositId on crypto transactions ── */
const CRYPTO_PREFIX = "crypto_";

/* ────────────────────────────────────────────────────────────────
 * POST /wallet/crypto/initiate
 *
 * Creates a crypto deposit address (USDT on selected network).
 * Returns pay_address, pay_amount (USDT), paymentId, expiration.
 * The user sends USDT to pay_address; the webhook/polling credits FCFA.
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
    res.status(503).json({ error: "Le dépôt crypto est temporairement indisponible. Contactez le support." });
    return;
  }

  const rate = await getFcfaToUsdRate();
  const amountUsd = fcfaToUsd(amountFcfa, rate);

  if (amountUsd < 2) {
    res.status(400).json({ error: `Montant minimum de dépôt crypto : ${Math.ceil(2 * rate)} FCFA.` });
    return;
  }

  const orderId = randomUUID();

  let payment: Awaited<ReturnType<typeof sdk.createDirectPayment>>;
  try {
    payment = await sdk.createDirectPayment({
      amount: amountUsd,
      currency: "usd",
      payCurrency: netConfig.currency,
      orderId,
      description: `Recharge Simix ${amountFcfa.toLocaleString("fr-FR")} FCFA`,
    });
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "Erreur inconnue";
    logger.error({ error: msg, userId: user.id, amountUsd, net }, "[Crypto] createDirectPayment failed");
    res.status(502).json({ error: `Impossible de créer l'adresse de dépôt : ${msg}` });
    return;
  }

  const paymentId = String(payment.payment_id ?? "");
  const payAddress = String(payment.pay_address ?? "");
  const payAmount = Number(payment.pay_amount ?? 0);
  const expiresAt = payment.expiration_estimate_date
    ? new Date(payment.expiration_estimate_date)
    : new Date(Date.now() + 30 * 60 * 1000);

  const externalDepositId = `${CRYPTO_PREFIX}${paymentId}`;

  const [tx] = await db.insert(transactionsTable).values({
    userId: user.id,
    type: "recharge",
    amount: amountFcfa,
    status: "pending",
    method: `Crypto USDT (${netConfig.chain})`,
    description: `Recharge crypto USDT · ${netConfig.chain} — ${amountFcfa.toLocaleString("fr-FR")} FCFA`,
    externalDepositId,
    gatewayMeta: JSON.stringify({
      gateway: "nowpayments",
      orderId,
      paymentId,
      payAddress,
      payAmount,
      network: net,
      currency: netConfig.currency,
      amountUsd,
      fcfaRate: rate,
      expiresAt: expiresAt.toISOString(),
    }),
  }).returning();

  logger.info({ paymentId, userId: user.id, amountFcfa, amountUsd, net, payAddress }, "[Crypto] Deposit initiated");

  res.json({
    paymentId,
    orderId,
    payAddress,
    payAmount,
    payAmountFormatted: `${payAmount.toFixed(6)} USDT`,
    network: net,
    networkLabel: netConfig.label,
    chain: netConfig.chain,
    amountFcfa,
    amountUsd,
    expiresAt: expiresAt.toISOString(),
    txId: tx.id,
  });
});

/* ────────────────────────────────────────────────────────────────
 * GET /wallet/crypto/:paymentId/status
 *
 * Polls NowPayments for the current payment status.
 * If paid and not yet credited → credits balance (safety net).
 * ──────────────────────────────────────────────────────────────── */
router.get("/wallet/crypto/:paymentId/status", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const { paymentId } = req.params;

  const externalDepositId = `${CRYPTO_PREFIX}${paymentId}`;

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.externalDepositId, externalDepositId),
      eq(transactionsTable.userId, user.id),
    ))
    .limit(1);

  if (!tx) {
    res.status(404).json({ error: "Transaction introuvable." });
    return;
  }

  if (tx.status !== "pending") {
    res.json({ status: tx.status, amountFcfa: tx.amount, paymentId });
    return;
  }

  const sdk = await getNowPaymentsSDK();
  if (!sdk) {
    res.json({ status: "pending", amountFcfa: tx.amount, paymentId });
    return;
  }

  let sdkStatus = "pending";
  try {
    const p = await sdk.getPaymentStatus(paymentId);
    sdkStatus = p.status;

    if (sdkStatus === "paid") {
      const [justCompleted] = await db
        .update(transactionsTable)
        .set({ status: "completed" })
        .where(and(
          eq(transactionsTable.id, tx.id),
          eq(transactionsTable.status, "pending"),
        ))
        .returning();

      if (justCompleted) {
        await db.update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${tx.amount}` })
          .where(eq(usersTable.id, user.id));

        await db.insert(notificationsTable).values({
          userId: user.id,
          title: "Recharge confirmée ✓",
          body: `${tx.amount.toLocaleString("fr-FR")} FCFA ont été crédités via crypto.`,
          type: "deposit_success",
        });

        broadcastNotification(user.id, {
          title: "Recharge confirmée ✓",
          body: `${tx.amount.toLocaleString("fr-FR")} FCFA crédités.`,
          type: "deposit_success",
        });

        logger.info({ paymentId, userId: user.id, amount: tx.amount }, "[Crypto] Balance credited via polling");
      }
    } else if (sdkStatus === "failed" || sdkStatus === "expired" || sdkStatus === "cancelled") {
      await db.update(transactionsTable)
        .set({ status: "failed" })
        .where(and(eq(transactionsTable.id, tx.id), eq(transactionsTable.status, "pending")));
    }
  } catch (e) {
    logger.warn({ error: (e as Error).message, paymentId }, "[Crypto] Status poll failed");
  }

  res.json({ status: sdkStatus, amountFcfa: tx.amount, paymentId });
});

/* ────────────────────────────────────────────────────────────────
 * POST /wallet/crypto/webhook
 *
 * IPN webhook from NowPayments.
 * Verifies HMAC-SHA512 signature, credits balance on `finished`.
 * ──────────────────────────────────────────────────────────────── */
router.post("/wallet/crypto/webhook", async (req, res): Promise<void> => {
  const sig = req.headers["x-nowpayments-sig"] as string | undefined;

  if (!sig) {
    logger.warn("[Crypto Webhook] Missing signature header");
    res.status(400).json({ ok: false, error: "Missing signature" });
    return;
  }

  const sdk = await getNowPaymentsSDK();
  if (!sdk) {
    logger.error("[Crypto Webhook] SDK not configured");
    res.status(500).json({ ok: false });
    return;
  }

  let event: ReturnType<typeof sdk.parseWebhook>;
  try {
    event = sdk.parseWebhook(req.body, sig);
  } catch (e) {
    logger.warn({ error: (e as Error).message }, "[Crypto Webhook] Invalid signature");
    res.status(400).json({ ok: false, error: "Invalid signature" });
    return;
  }

  if (event.type !== "payment.status_changed") {
    res.json({ ok: true });
    return;
  }

  const payment = event.payment;
  const paymentId = String(payment.payment_id ?? "");
  const orderId = String((payment as Record<string, unknown>).order_id ?? "");
  const sdkStatus = payment.status;

  logger.info({ paymentId, orderId, sdkStatus }, "[Crypto Webhook] Status update received");

  if (sdkStatus !== "paid") {
    if (sdkStatus === "failed" || sdkStatus === "expired" || sdkStatus === "cancelled") {
      const externalDepositId = `${CRYPTO_PREFIX}${paymentId}`;
      await db.update(transactionsTable)
        .set({ status: "failed" })
        .where(and(
          eq(transactionsTable.externalDepositId, externalDepositId),
          eq(transactionsTable.status, "pending"),
        ));
    }
    res.json({ ok: true });
    return;
  }

  const externalDepositId = `${CRYPTO_PREFIX}${paymentId}`;

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.externalDepositId, externalDepositId))
    .limit(1);

  if (!tx) {
    logger.warn({ paymentId, externalDepositId }, "[Crypto Webhook] Transaction not found");
    res.json({ ok: true });
    return;
  }

  const [justCompleted] = await db
    .update(transactionsTable)
    .set({ status: "completed" })
    .where(and(
      eq(transactionsTable.id, tx.id),
      eq(transactionsTable.status, "pending"),
    ))
    .returning();

  if (justCompleted) {
    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${tx.amount}` })
      .where(eq(usersTable.id, tx.userId));

    await db.insert(notificationsTable).values({
      userId: tx.userId,
      title: "Recharge confirmée ✓",
      body: `${tx.amount.toLocaleString("fr-FR")} FCFA ont été crédités via crypto.`,
      type: "deposit_success",
    });

    broadcastNotification(tx.userId, {
      title: "Recharge confirmée ✓",
      body: `${tx.amount.toLocaleString("fr-FR")} FCFA crédités.`,
      type: "deposit_success",
    });

    logger.info({ paymentId, userId: tx.userId, amount: tx.amount }, "[Crypto Webhook] Balance credited via webhook");
  } else {
    logger.info({ paymentId }, "[Crypto Webhook] Already processed — skipping double credit");
  }

  res.json({ ok: true });
});

export default router;
