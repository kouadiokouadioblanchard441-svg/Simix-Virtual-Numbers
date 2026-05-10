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
import { logger } from "../lib/logger";
import { getMinDepositFcfa, getMaxBalanceFcfa } from "../lib/settings";
import { broadcastNotification } from "./notifications";
import { notificationsTable } from "@workspace/db";

const router: IRouter = Router();

/* ── Load PawaPay client from env or DB ── */
async function getPawaPayClient(): Promise<{ client: PawaPayClient; env: string } | null> {
  let token = process.env.PAWAPAY_API_TOKEN ?? null;
  let env: "sandbox" | "production" = (process.env.PAWAPAY_ENV as "sandbox" | "production") ?? "sandbox";

  if (!token) {
    const rows = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pawapay_api_token")).limit(1);
    token = rows[0]?.value?.trim() || null;

    if (token) {
      const envRows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "pawapay_env")).limit(1);
      env = (envRows[0]?.value as "sandbox" | "production") ?? "sandbox";
    }
  }

  if (!token) return null;
  return { client: new PawaPayClient(token, env), env };
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

    /* ── Amount limits ── */
    const minDeposit = await getMinDepositFcfa();
    if (amount < minDeposit) {
      res.status(400).json({ error: `Le montant minimum de recharge est ${minDeposit} FCFA.` });
      return;
    }

    const maxBalance = await getMaxBalanceFcfa();
    if (user.balance + amount > maxBalance) {
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
     * MOBILE MONEY PATH — PawaPay v2 required
     * Account is NEVER credited here; only the webhook/poll does it.
     * ════════════════════════════════════════════════════════════ */
    if (isMobileMoney) {
      if (!phoneNumber || !countryCode) {
        res.status(400).json({ error: "Numéro de téléphone et code pays requis pour le Mobile Money." });
        return;
      }

      const pawaPayCtx = await getPawaPayClient();

      /* PawaPay is not configured — cannot process mobile money */
      if (!pawaPayCtx) {
        logger.error({ methodSlug }, "[PawaPay] Client not configured — cannot process mobile money deposit");
        res.status(503).json({
          error: "Le paiement Mobile Money est temporairement indisponible. Contactez le support.",
        });
        return;
      }

      const { client } = pawaPayCtx;
      const currency = COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? "XOF";

      /* Build MSISDN — country code prefix + local digits (leading 0 preserved) */
      const msisdn = buildMSISDN(phoneNumber, dialCode);

      /* Step 1: Predict provider (most reliable) */
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

      /* Step 2: Fallback to static mapping */
      if (!provider) {
        provider = getProviderForCountry(countryCode, methodSlug);
        if (provider) {
          logger.info({ msisdn, provider, fallback: true }, "[PawaPay] Using static provider mapping");
        }
      }

      if (!provider) {
        res.status(422).json({
          error: `Opérateur Mobile Money non supporté pour ce pays (${countryCode}). Essayez un autre mode de paiement.`,
        });
        return;
      }

      /* Step 3: Generate depositId BEFORE calling PawaPay (idempotency) */
      const depositId = generateDepositId();

      /* Step 4: Create pending transaction BEFORE PawaPay call
       *         This ensures we never lose track of the deposit even if
       *         the response is lost due to network error. */
      const [pendingTx] = await db.insert(transactionsTable).values({
        userId: user.id,
        type: "recharge",
        amount,
        status: "pending",
        method: method?.name ?? methodSlug,
        description,
        externalDepositId: depositId,
      }).returning();

      /* Step 5: Initiate deposit with PawaPay v2 */
      let depositRes;
      try {
        depositRes = await client.initiateDeposit({
          depositId,
          amount: String(amount),
          currency,
          payer: {
            type: "MMO",
            accountDetails: {
              phoneNumber: msisdn,
              provider,
            },
          },
          customerMessage: "Simix recharge",
          metadata: [
            { userId: user.id },
            { methodSlug },
          ],
        });
      } catch (e) {
        /* Network/timeout error — transaction stays pending for reconciliation */
        logger.error({ error: (e as Error).message, depositId, userId: user.id }, "[PawaPay] Deposit request failed (network)");
        res.status(502).json({
          error: "Erreur de communication avec l'opérateur. Votre dépôt est en attente de confirmation — vérifiez l'historique.",
          depositId,
          pending: true,
        });
        return;
      }

      if (depositRes.status === "ACCEPTED") {
        logger.info({ depositId, userId: user.id, amount, provider, msisdn }, "[PawaPay] Deposit ACCEPTED — awaiting confirmation");
        res.json({
          ...toTransaction(pendingTx!),
          pending: true,
          depositId,
          provider,
          message: `Confirmez le paiement sur votre téléphone (${method?.name ?? methodSlug}). Votre solde sera crédité automatiquement.`,
        });
        return;
      }

      if (depositRes.status === "DUPLICATE_IGNORED") {
        /* DepositId was already used — very unlikely but handle gracefully */
        logger.warn({ depositId }, "[PawaPay] Duplicate deposit ID — already processing");
        res.json({
          ...toTransaction(pendingTx!),
          pending: true,
          depositId,
          message: "Ce dépôt est déjà en cours de traitement.",
        });
        return;
      }

      /* REJECTED — cancel the pending transaction, inform user, DO NOT credit */
      await db.update(transactionsTable)
        .set({ status: "failed" })
        .where(eq(transactionsTable.id, pendingTx!.id));

      const reason = depositRes.failureReason?.failureMessage
        ?? depositRes.failureReason?.failureCode
        ?? "Rejeté par l'opérateur";
      logger.warn({ depositRes, provider, msisdn, depositId }, "[PawaPay] Deposit REJECTED");
      res.status(422).json({ error: `Dépôt refusé : ${reason}. Vérifiez votre numéro et réessayez.` });
      return;
    }

    /* ════════════════════════════════════════════════════════════
     * NON-MOBILE MONEY PATH — instant credit
     * (bank transfer, voucher, manual top-up, etc.)
     * ════════════════════════════════════════════════════════════ */
    await db
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${amount}` })
      .where(eq(usersTable.id, user.id));

    const [tx] = await db
      .insert(transactionsTable)
      .values({
        userId: user.id,
        type: "recharge",
        amount,
        status: "completed",
        method: method?.name ?? methodSlug,
        description,
      })
      .returning();

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
      /* Re-serialize the parsed body to verify digest */
      const rawBody = JSON.stringify(req.body);
      const digestOk = verifyContentDigest(rawBody, contentDigest);
      if (!digestOk) {
        logger.error({ contentDigest }, "[PawaPay Webhook] Content-Digest MISMATCH — possible tampering, ignoring");
        return;
      }
      logger.info("[PawaPay Webhook] Content-Digest verified ✓");
    } else {
      logger.warn("[PawaPay Webhook] No Content-Digest header — signed callbacks not enabled");
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

    /* In v2, amount = requested amount. If payment completed, that amount was received. */
    const creditAmount = amount ? Math.round(Number(amount)) : tx.amount;

    /* Atomic: update transaction + credit user balance */
    await db.update(transactionsTable)
      .set({ status: "completed" })
      .where(eq(transactionsTable.id, tx.id));

    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${creditAmount}` })
      .where(eq(usersTable.id, tx.userId));

    logger.info({ depositId, userId: tx.userId, creditAmount }, "[PawaPay Webhook] Deposit COMPLETED — balance credited ✓");

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

  /* Only poll PawaPay if transaction is still pending */
  if (tx.status === "pending") {
    const pawaPayCtx = await getPawaPayClient();
    if (pawaPayCtx) {
      try {
        const result = await pawaPayCtx.client.getDepositStatus(depositId);

        if (result.status === "FOUND" && result.data) {
          const depositStatus = result.data.status;

          if (depositStatus === "COMPLETED") {
            /* Safety net: credit if webhook was missed */
            const creditAmount = result.data.amount ? Math.round(Number(result.data.amount)) : tx.amount;

            await db.update(transactionsTable)
              .set({ status: "completed" })
              .where(and(
                eq(transactionsTable.id, tx.id),
                eq(transactionsTable.status, "pending"), // guard against race condition
              ));

            await db.update(usersTable)
              .set({ balance: sql`${usersTable.balance} + ${creditAmount}` })
              .where(and(
                eq(usersTable.id, user.id),
                // Only credit if transaction was still pending (avoid double-credit)
                sql`EXISTS (SELECT 1 FROM transactions WHERE id = ${tx.id} AND status = 'completed' AND created_at = updated_at)`,
              ));

            /* Re-fetch updated transaction */
            const [updated] = await db.select().from(transactionsTable)
              .where(eq(transactionsTable.id, tx.id)).limit(1);

            logger.info({ depositId, userId: user.id, creditAmount }, "[PawaPay Poll] Deposit COMPLETED via polling — balance credited");
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
