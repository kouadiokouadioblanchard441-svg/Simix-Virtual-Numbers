import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fxProfitsTable, transactionsTable } from "@workspace/db";
import { createPendingDepositWithFx, isValidClapayLocalAmount } from "../src/lib/wallet-deposit";

test("Clapay accepts only positive integer local amounts without changing Pawa decimal support", () => {
  assert.equal(isValidClapayLocalAmount(100), true);
  assert.equal(isValidClapayLocalAmount(0), false);
  assert.equal(isValidClapayLocalAmount(-1), false);
  assert.equal(isValidClapayLocalAmount(100.25), false);
  assert.equal(isValidClapayLocalAmount(Number.NaN), false);
  assert.equal(Number.isFinite(100.25), true); // PawaPay continues accepting numeric decimals.
});

function fakeTransactionalDatabase(failFxInsert: boolean) {
  const state: { transactions: Array<Record<string, unknown>>; fx: Array<Record<string, unknown>> } = {
    transactions: [],
    fx: [],
  };
  let nextId = 0;
  const transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    const beforeTransactions = [...state.transactions];
    const beforeFx = [...state.fx];
    try {
      return await callback({
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown>) => {
            if (table === transactionsTable) {
              return {
                returning: async () => {
                  const row = { id: `tx-${++nextId}`, ...values };
                  state.transactions.push(row);
                  return [row];
                },
              };
            }
            if (table === fxProfitsTable) {
              return Promise.resolve().then(() => {
                if (failFxInsert) throw new Error("FX insert failed");
                state.fx.push(values);
              });
            }
            throw new Error("Unexpected table");
          },
        }),
      });
    } catch (error) {
      state.transactions = beforeTransactions;
      state.fx = beforeFx;
      throw error;
    }
  };
  return { state, database: { transaction } };
}

test("pending transaction and FX row are created together and transaction rolls back if FX insert fails", async () => {
  const transaction = {
    userId: "user-1",
    type: "recharge",
    amount: 2500,
    status: "pending",
    externalDepositId: "clapay:tracking-1",
  } as never;
  const fxProfit = {
    currency: "KES",
    localAmount: "1000",
    realRate: "2.4",
    clientRate: "2.5",
    amountXof: "2500",
    profitXof: "100",
    status: "pending",
  } as never;

  const successDb = fakeTransactionalDatabase(false);
  const deposit = await createPendingDepositWithFx(transaction, fxProfit, successDb.database as never);
  assert.equal(successDb.state.transactions.length, 1);
  assert.equal(successDb.state.fx.length, 1);
  assert.equal(successDb.state.fx[0].transactionId, deposit.id);

  const rollbackDb = fakeTransactionalDatabase(true);
  await assert.rejects(
    createPendingDepositWithFx(transaction, fxProfit, rollbackDb.database as never),
    /FX insert failed/,
  );
  assert.equal(rollbackDb.state.transactions.length, 0);
  assert.equal(rollbackDb.state.fx.length, 0);
});