import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  partialCryptoAmountToFcfa,
  settleCryptoDepositAtomically,
  type CryptoSettlementDatabase,
} from "../src/lib/crypto-settlement-core";

function fakeDatabase(failBalanceCredit = false) {
  const state = { status: "pending", userId: "user-1", balance: 100 };
  const database: CryptoSettlementDatabase = {
    transaction: async (operation) => {
      const before = { ...state };
      try {
        return await operation({
          markPendingCompleted: async (transactionId) => {
            if (transactionId !== "deposit-1" || state.status !== "pending") return false;
            state.status = "completed";
            return true;
          },
          creditUserBalance: async (userId, amountFcfa) => {
            if (failBalanceCredit || userId !== state.userId) return false;
            state.balance += amountFcfa;
            return true;
          },
        });
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  };
  return { database, state };
}

test("crypto settlement completes and credits exactly once", async () => {
  const fake = fakeDatabase();
  const input = {
    transactionId: "deposit-1",
    userId: "user-1",
    amountFcfa: 250,
  };

  assert.equal(await settleCryptoDepositAtomically(fake.database, input), true);
  assert.equal(fake.state.status, "completed");
  assert.equal(fake.state.balance, 350);
  assert.equal(await settleCryptoDepositAtomically(fake.database, input), false);
  assert.equal(fake.state.balance, 350);
});

test("crypto settlement rolls back completion if the wallet credit fails", async () => {
  const fake = fakeDatabase(true);

  await assert.rejects(
    settleCryptoDepositAtomically(fake.database, {
      transactionId: "deposit-1",
      userId: "user-1",
      amountFcfa: 250,
    }),
    /rolling back settlement/,
  );
  assert.equal(fake.state.status, "pending");
  assert.equal(fake.state.balance, 100);
});

test("partial crypto credit fails closed when amount or rate is missing or invalid", () => {
  for (const [amount, rate] of [
    [undefined, 610],
    [0, 610],
    [-1, 610],
    ["not-a-number", 610],
    [1, 0],
    [1, Number.NaN],
  ] as const) {
    assert.equal(partialCryptoAmountToFcfa(amount, rate), null);
  }

  assert.equal(partialCryptoAmountToFcfa("1.234", 610), 752);
});
