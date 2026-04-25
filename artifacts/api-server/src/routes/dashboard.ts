import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  countriesTable,
  servicesTable,
  smsMessagesTable,
  transactionsTable,
  virtualNumbersTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { toNumber, toTransaction } from "../lib/serializers";

const router: IRouter = Router();

router.get(
  "/dashboard/summary",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = req.user!;

    const numberRows = await db
      .select({
        n: virtualNumbersTable,
        s: servicesTable,
        c: countriesTable,
      })
      .from(virtualNumbersTable)
      .innerJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
      .innerJoin(countriesTable, eq(virtualNumbersTable.countryId, countriesTable.id))
      .where(eq(virtualNumbersTable.userId, user.id))
      .orderBy(desc(virtualNumbersTable.createdAt))
      .limit(5);

    const recentNumbers = await Promise.all(
      numberRows.map(async (r) => {
        const messages = await db
          .select()
          .from(smsMessagesTable)
          .where(eq(smsMessagesTable.numberId, r.n.id))
          .orderBy(desc(smsMessagesTable.receivedAt));
        return toNumber(r.n, r.s, r.c, messages);
      }),
    );

    const recentTx = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, user.id))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(5);

    const allTx = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, user.id));

    const totalSpent = allTx
      .filter((t) => t.type === "purchase" && t.status === "completed")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalNumbers = (
      await db
        .select()
        .from(virtualNumbersTable)
        .where(eq(virtualNumbersTable.userId, user.id))
    ).length;

    res.json({
      balance: user.balance,
      currency: "FCFA",
      totalNumbers,
      totalSpent,
      recentNumbers,
      recentTransactions: recentTx.map(toTransaction),
    });
  },
);

export default router;
