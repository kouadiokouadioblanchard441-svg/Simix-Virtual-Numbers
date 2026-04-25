import { Router, type IRouter } from "express";
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  paymentMethodsTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import { RechargeWalletBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { toPaymentMethod, toTransaction } from "../lib/serializers";

const router: IRouter = Router();

router.get("/wallet", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  res.json({ balance: user.balance, currency: "FCFA" });
});

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
    const { amount, methodSlug } = parsed.data;

    const [method] = await db
      .select()
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.slug, methodSlug))
      .limit(1);

    const description = method
      ? `Recharge via ${method.name}`
      : "Recharge du portefeuille";

    // Mock payment: always succeeds
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

router.get(
  "/wallet/payment-methods",
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(paymentMethodsTable)
      .orderBy(asc(paymentMethodsTable.sortOrder));
    res.json(rows.map(toPaymentMethod));
  },
);

export default router;
