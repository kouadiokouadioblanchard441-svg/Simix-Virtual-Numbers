import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fxProfitsTable, transactionsTable } from "@workspace/db";
import { failClapayDeposit } from "../src/lib/clapay-settlement";

function fakeDatabase(failFxUpdate = false) {
  const deposit: Record<string, any> = {
    id: "tx-clapay",
    type: "recharge",
    status: "pending",
    externalDepositId: "clapay:tracking-1",
  };
  const fx = { transactionId: deposit.id, status: "pending" };
  const database = {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const priorDepositStatus = deposit.status;
      const priorFxStatus = fx.status;
      try {
        return await callback({
          select: () => ({
            from: (table: unknown) => ({
              where: () => ({
                for: async () => table === transactionsTable && deposit.status === "pending" ? [deposit] : [],
              }),
            }),
          }),
          update: (table: unknown) => ({
            set: (values: Record<string, unknown>) => {
              const builder: any = {
                returning: async () => {
                  if (table !== transactionsTable || deposit.status !== "pending") return [];
                  deposit.status = values.status;
                  return [{ id: deposit.id }];
                },
                then: (resolve: (value: unknown) => unknown, reject: (error: Error) => unknown) => {
                  if (table === fxProfitsTable) {
                    if (failFxUpdate) return reject(new Error("FX update failed"));
                    fx.status = String(values.status);
                  }
                  return resolve(undefined);
                },
              };
              builder.where = () => builder;
              return builder;
            },
          }),
        });
      } catch (error) {
        deposit.status = priorDepositStatus;
        fx.status = priorFxStatus;
        throw error;
      }
    },
  };
  return { deposit, fx, database };
}

test("Clapay failure atomically marks transaction and FX row failed once", async () => {
  const fake = fakeDatabase();
  assert.equal(await failClapayDeposit("clapay:tracking-1", fake.database as never), true);
  assert.equal(fake.deposit.status, "failed");
  assert.equal(fake.fx.status, "failed");
  assert.equal(await failClapayDeposit("clapay:tracking-1", fake.database as never), false);
});

test("Clapay FX failure rolls back the transaction failure transition", async () => {
  const fake = fakeDatabase(true);
  await assert.rejects(
    failClapayDeposit("clapay:tracking-1", fake.database as never),
    /FX update failed/,
  );
  assert.equal(fake.deposit.status, "pending");
  assert.equal(fake.fx.status, "pending");
});