import assert from "node:assert/strict";
import { test } from "node:test";
import { beginPayoutAttempt, updatePayoutAttempt } from "./payout-attempts";

function resetSessionStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      crypto: globalThis.crypto,
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
    },
  });
}

test("repeated requests for one normalized payload retain its session idempotency key", async () => {
  resetSessionStorage();
  const normalizedPayload = {
    gateway: "clapay",
    countryCode: "CI",
    phoneNumber: "0701234567",
    amount: 5000,
  };

  const first = await beginPayoutAttempt("merchant", normalizedPayload);
  const repeated = await beginPayoutAttempt("merchant", normalizedPayload);
  assert.equal(repeated.idempotencyKey, first.idempotencyKey);

  await updatePayoutAttempt("merchant", normalizedPayload, { status: "pending", recordId: "payout-1" });
  const afterAcceptedPending = await beginPayoutAttempt("merchant", normalizedPayload);
  assert.equal(afterAcceptedPending.idempotencyKey, first.idempotencyKey);
});

test("a changed normalized payload receives an independent idempotency key", async () => {
  resetSessionStorage();
  const original = await beginPayoutAttempt("merchant", {
    gateway: "pawapay",
    countryIso2: "CM",
    phoneNumber: "+237683677872",
    amount: 50000,
  });
  const changed = await beginPayoutAttempt("merchant", {
    gateway: "pawapay",
    countryIso2: "CM",
    phoneNumber: "+237683677872",
    amount: 50001,
  });

  assert.notEqual(changed.idempotencyKey, original.idempotencyKey);
});