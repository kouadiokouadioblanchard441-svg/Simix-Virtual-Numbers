import { Router, type IRouter } from "express";
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
  generateDepositId,
  normalizeMSISDN,
  getCorrespondentForCountry,
  COUNTRY_CURRENCY,
} from "../lib/pawapay";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function getPawaPayClient(): Promise<{ client: PawaPayClient; env: string } | null> {
  /* 1. Try environment variable first */
  let token = process.env.PAWAPAY_API_TOKEN ?? null;
  let env: "sandbox" | "production" = (process.env.PAWAPAY_ENV as "sandbox" | "production") ?? "sandbox";

  /* 2. Fall back to DB system settings */
  if (!token) {
    const rows = await db.select().from(systemSettingsTable).where(
      eq(systemSettingsTable.key, "pawapay_api_token")
    ).limit(1);
    token = rows[0]?.value ?? null;

    if (token) {
      const envRows = await db.select().from(systemSettingsTable).where(
        eq(systemSettingsTable.key, "pawapay_env")
      ).limit(1);
      env = (envRows[0]?.value as "sandbox" | "production") ?? "sandbox";
    }
  }

  if (!token) return null;
  return { client: new PawaPayClient(token, env), env };
}

router.get("/wallet", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  res.json({ balance: user.balance, currency: "FCFA" });
});

/* ── Initiate recharge — with optional PawaPay ── */
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

    const [method] = await db
      .select()
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.slug, methodSlug))
      .limit(1);

    const description = method
      ? `Recharge via ${method.name}`
      : "Recharge du portefeuille";

    /* ── Try PawaPay for mobile money methods ── */
    const isMobileMoney = methodSlug && ["orange", "mtn", "wave", "moov", "airtel", "mpesa"].some(k => methodSlug.toLowerCase().includes(k));

    if (isMobileMoney && phoneNumber && countryCode) {
      const pawaPayCtx = await getPawaPayClient();
      if (pawaPayCtx) {
        const { client } = pawaPayCtx;
        const correspondent = getCorrespondentForCountry(countryCode, methodSlug);
        const currency = COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? "XOF";

        if (correspondent) {
          try {
            const depositId = generateDepositId();
            /* Prepend country dial code if not already present */
            const rawPhone = dialCode
              ? `${dialCode.replace(/^\+/, "")}${phoneNumber.replace(/^\+/, "").replace(/^0+/, "")}`
              : phoneNumber;
            const msisdn = normalizeMSISDN(rawPhone);

            const depositRes = await client.initiateDeposit({
              depositId,
              amount: String(amount),
              currency,
              correspondent,
              payer: { type: "MSISDN", address: { value: msisdn } },
              customerTimestamp: new Date().toISOString(),
              statementDescription: `Simix ${description}`.slice(0, 22),
              metadata: [
                { fieldName: "userId", fieldValue: user.id, isPII: false },
                { fieldName: "methodSlug", fieldValue: methodSlug },
              ],
            });

            if (depositRes.status === "ACCEPTED") {
              /* Create pending transaction */
              const [tx] = await db.insert(transactionsTable).values({
                userId: user.id,
                type: "recharge",
                amount,
                status: "pending",
                method: method?.name ?? methodSlug,
                description,
                externalDepositId: depositId,
              }).returning();

              logger.info({ depositId, userId: user.id, amount, correspondent }, "[PawaPay] Deposit initiated");

              res.json({
                ...toTransaction(tx!),
                pending: true,
                depositId,
                correspondent,
                message: `Paiement initié. Confirmez sur votre téléphone (${method?.name ?? methodSlug}).`,
              });
              return;
            } else {
              logger.warn({ depositRes }, "[PawaPay] Deposit rejected");
            }
          } catch (e) {
            logger.warn({ error: (e as Error).message }, "[PawaPay] Failed, falling back to instant credit");
          }
        }
      }
    }

    /* ── Fallback: instant credit ── */
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

/* ── Predict correspondent from MSISDN ── */
router.post("/wallet/predict-correspondent", requireAuth, async (req, res): Promise<void> => {
  const { msisdn } = req.body as { msisdn?: string };
  if (!msisdn) { res.status(400).json({ error: "msisdn required" }); return; }

  const pawaPayCtx = await getPawaPayClient();
  if (!pawaPayCtx) { res.status(503).json({ error: "PawaPay not configured" }); return; }

  try {
    const result = await pawaPayCtx.client.predictCorrespondent(msisdn);
    res.json(result ?? { correspondent: null });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/* ── PawaPay webhook — called by PawaPay when payment confirmed ── */
router.post("/wallet/pawapay/webhook", async (req, res): Promise<void> => {
  try {
    const { depositId, status, depositedAmount } = req.body;

    if (!depositId || !status) {
      res.status(400).json({ error: "Invalid webhook payload" });
      return;
    }

    logger.info({ depositId, status }, "[PawaPay] Webhook received");

    if (status === "COMPLETED") {
      const [tx] = await db.select().from(transactionsTable)
        .where(and(
          eq(transactionsTable.externalDepositId, depositId),
          eq(transactionsTable.status, "pending"),
        ))
        .limit(1);

      if (tx) {
        const actualAmount = depositedAmount ? Math.round(Number(depositedAmount)) : tx.amount;
        await db.update(transactionsTable)
          .set({ status: "completed" })
          .where(eq(transactionsTable.id, tx.id));

        await db.update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${actualAmount}` })
          .where(eq(usersTable.id, tx.userId));

        logger.info({ depositId, userId: tx.userId, amount: actualAmount }, "[PawaPay] Deposit completed, balance credited");
      }
    } else if (status === "FAILED") {
      await db.update(transactionsTable)
        .set({ status: "failed" })
        .where(eq(transactionsTable.externalDepositId, depositId));
    }

    res.status(200).json({ received: true });
  } catch (e) {
    logger.error({ error: (e as Error).message }, "[PawaPay] Webhook error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ── Check PawaPay deposit status ── */
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

  /* Poll PawaPay for live status */
  const pawaPayCtx = await getPawaPayClient();
  if (pawaPayCtx && tx.status === "pending") {
    try {
      const statuses = await pawaPayCtx.client.getDepositStatus(depositId);
      const latest = statuses[0];
      if (latest?.status === "COMPLETED") {
        const actualAmount = latest.depositedAmount ? Math.round(Number(latest.depositedAmount)) : tx.amount;
        await db.update(transactionsTable).set({ status: "completed" }).where(eq(transactionsTable.id, tx.id));
        await db.update(usersTable).set({ balance: sql`${usersTable.balance} + ${actualAmount}` }).where(eq(usersTable.id, user.id));
        tx.status = "completed";
      } else if (latest?.status === "FAILED") {
        await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, tx.id));
        tx.status = "failed";
      }
    } catch (e) {
      logger.warn({ error: (e as Error).message }, "[PawaPay] Status check failed");
    }
  }

  res.json(toTransaction(tx));
});

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

/* ── List payment methods (optionally filtered by countryCode) ── */
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

/* ── Countries that have at least one enabled payment method ── */
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
