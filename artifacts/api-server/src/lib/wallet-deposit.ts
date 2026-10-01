import { db, fxProfitsTable, transactionsTable } from "@workspace/db";

type PendingTransaction = typeof transactionsTable.$inferInsert;
type PendingFxProfit = Omit<typeof fxProfitsTable.$inferInsert, "transactionId">;

export function isValidClapayLocalAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && Number.isInteger(amount);
}

/** Insert a pending transaction and its optional FX record as one unit. */
export async function createPendingDepositWithFx(
  transaction: PendingTransaction,
  fxProfit?: PendingFxProfit,
  database: typeof db | any = db,
): Promise<typeof transactionsTable.$inferSelect> {
  return database.transaction(async (tx: any) => {
    const [deposit] = await tx.insert(transactionsTable).values(transaction).returning();
    if (!deposit) throw new Error("Pending deposit transaction was not created");
    if (fxProfit) {
      await tx.insert(fxProfitsTable).values({ ...fxProfit, transactionId: deposit.id });
    }
    return deposit;
  });
}