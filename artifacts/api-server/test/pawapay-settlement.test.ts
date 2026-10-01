import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fxProfitsTable, transactionsTable, usersTable } from "@workspace/db";
import {
  makePawaPayGatewayMeta,
  normalizePawaPayExpected,
  pawaPayStatusMatches,
  failPawaPayDeposit,
  settleVerifiedPawaPayDeposit,
  verifyAndSettlePawaPayDeposit,
} from "../src/lib/pawapay-settlement";
import type { PawaPayDepositData } from "../src/lib/pawapay";

const depositId = "a1b2c3d4-e5f6-4789-abcd-0123456789ab";

function completedStatus(overrides: Partial<PawaPayDepositData> = {}): PawaPayDepositData {
  return {
    depositId,
    status: "COMPLETED",
    amount: "1000",
    currency: "KES",
    country: "KEN",
    payer: { type: "MMO", accountDetails: { phoneNumber: "254700000000", provider: "MPESA_KEN" } },
    created: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("stored expected Pawa tuple verifies exact transaction, amount, currency, provider, phone and country", () => {
  const meta = makePawaPayGatewayMeta({
    amount: 1000,
    currency: "KES",
    provider: "MPESA_KEN",
    phoneNumber: "254700000000",
    countryCode: "KE",
    gatewayConfigId: "gateway-pawa-ke",
  });
  const deposit = {
    externalDepositId: depositId,
    amount: 4500,
    gatewayMeta: meta,
    createdAt: new Date(0),
  } as never;
  const expected = normalizePawaPayExpected(deposit);
  assert.ok(expected);
  assert.equal(expected.amount, 1000);
  assert.equal(pawaPayStatusMatches(depositId, expected, completedStatus()), true);
  assert.equal(pawaPayStatusMatches(depositId, expected, completedStatus({ amount: "4500" })), false);
  assert.equal(pawaPayStatusMatches(depositId, expected, completedStatus({ payer: {
    type: "MMO",
    accountDetails: { phoneNumber: "254711111111", provider: "MPESA_KEN" },
  } })), false);
  assert.equal(pawaPayStatusMatches(depositId, expected, completedStatus({ country: "UGA" })), false);
  assert.equal(pawaPayStatusMatches(depositId, expected, completedStatus({ depositId: "wrong-id" })), false);
});

test("legacy FX evidence derives gateway amount/currency without using stored FCFA as gateway amount", () => {
  const expected = normalizePawaPayExpected({
    externalDepositId: depositId,
    amount: 5000,
    gatewayMeta: null,
    createdAt: new Date(0),
  } as never, { currency: "KES", localAmount: "1000.50" });
  assert.equal(expected?.amount, 1000.5);
  assert.equal(expected?.currency, "KES");
  assert.equal(expected?.requireAllEvidence, false);
  assert.equal(pawaPayStatusMatches(depositId, expected!, completedStatus({ amount: "1000.5" })), true);
  assert.equal(pawaPayStatusMatches(depositId, expected!, completedStatus({ amount: "5000" })), false);
});

test("NOT_FOUND and mismatched authoritative status do not mutate a pending deposit", async () => {
  let transactionCalls = 0;
  const noResultDb = {
    transaction: async () => {
      transactionCalls += 1;
      throw new Error("NOT_FOUND must not open a settlement transaction");
    },
  };
  const notFound = await verifyAndSettlePawaPayDeposit(depositId, {
    getDepositStatus: async () => ({ status: "NOT_FOUND" }),
  }, noResultDb as never);
  assert.equal(notFound.settled, false);
  assert.equal(transactionCalls, 0);

  const deposit = {
    id: "tx-mismatch",
    userId: "user-1",
    type: "recharge",
    amount: 5000,
    status: "pending",
    externalDepositId: depositId,
    gatewayMeta: makePawaPayGatewayMeta({
      amount: 1000, currency: "KES", provider: "MPESA_KEN",
      phoneNumber: "254700000000", countryCode: "KE",
    }),
    createdAt: new Date(0),
  };
  const fake = fakeDatabase(deposit);
  const outcome = await settleVerifiedPawaPayDeposit(
    depositId,
    completedStatus({ amount: "999" }),
    fake.database as never,
  );
  assert.equal(outcome.ignored, true);
  assert.equal(deposit.status, "pending");
  assert.equal(fake.effects.credits, 0);
});

function fakeDatabase(deposit: Record<string, any>, fx: Record<string, any> | null = null) {
  const effects = { credits: 0, fxStatuses: [] as string[] };
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          for: async () => table === transactionsTable && deposit.status === "pending" ? [deposit] : [],
          orderBy: () => ({ limit: async () => table === fxProfitsTable && fx ? [fx] : [] }),
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, any>) => {
        const builder: any = {
          returning: async () => {
            if (table !== transactionsTable || values.status !== "completed" && values.status !== "failed" || deposit.status !== "pending") {
              return [];
            }
            deposit.status = values.status;
            return [{ id: deposit.id }];
          },
          then: async (resolve: (value: unknown) => unknown) => {
            if (table === usersTable) effects.credits += 1;
            if (table === fxProfitsTable && values.status) {
              effects.fxStatuses.push(values.status);
              if (fx) fx.status = values.status;
            }
            return resolve(undefined);
          },
        };
        builder.where = () => builder;
        return builder;
      },
    }),
  };
  return {
    effects,
    database: { transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(tx) },
  };
}

test("completion atomically settles once, credits stored FCFA, and completes FX record", async () => {
  const deposit = {
    id: "tx-1",
    userId: "user-1",
    type: "recharge",
    amount: 5000,
    status: "pending",
    externalDepositId: depositId,
    gatewayMeta: makePawaPayGatewayMeta({
      amount: 1000, currency: "KES", provider: "MPESA_KEN",
      phoneNumber: "254700000000", countryCode: "KE",
    }),
    createdAt: new Date(0),
  };
  const fx = { currency: "KES", localAmount: "1000", status: "pending" };
  const fake = fakeDatabase(deposit, fx);
  const fakeProvider = { getDepositStatus: async (id: string) => {
    assert.equal(id, depositId);
    return { status: "FOUND" as const, data: completedStatus() };
  } };

  const first = await verifyAndSettlePawaPayDeposit(depositId, fakeProvider, fake.database as never);
  const duplicate = await verifyAndSettlePawaPayDeposit(depositId, fakeProvider, fake.database as never);
  assert.equal(first.settled, true);
  assert.equal(first.amount, 5000);
  assert.equal(duplicate.settled, false);
  assert.equal(deposit.status, "completed");
  assert.equal(fake.effects.credits, 1);
  assert.deepEqual(fake.effects.fxStatuses, ["completed"]);
});

test("verified failure atomically updates the transaction and FX record without credit", async () => {
  const deposit = {
    id: "tx-fail",
    userId: "user-1",
    type: "recharge",
    amount: 5000,
    status: "pending",
    externalDepositId: depositId,
    gatewayMeta: makePawaPayGatewayMeta({
      amount: 1000, currency: "KES", provider: "MPESA_KEN",
      phoneNumber: "254700000000", countryCode: "KE",
    }),
    createdAt: new Date(0),
  };
  const fx = { currency: "KES", localAmount: "1000", status: "pending" };
  const fake = fakeDatabase(deposit, fx);
  const outcome = await settleVerifiedPawaPayDeposit(depositId, completedStatus({ status: "FAILED" }), fake.database as never);
  assert.equal(outcome.failed, true);
  assert.equal(deposit.status, "failed");
  assert.equal(fx.status, "failed");
  assert.equal(fake.effects.credits, 0);
});

test("definitive Pawa initiation failure atomically fails pending transaction and FX record once", async () => {
  const deposit = {
    id: "tx-init-fail",
    userId: "user-1",
    type: "recharge",
    amount: 5000,
    status: "pending",
    externalDepositId: depositId,
    gatewayMeta: makePawaPayGatewayMeta({
      amount: 1000, currency: "KES", provider: "MPESA_KEN",
      phoneNumber: "254700000000", countryCode: "KE",
    }),
    createdAt: new Date(0),
  };
  const fx = { currency: "KES", localAmount: "1000", status: "pending" };
  const fake = fakeDatabase(deposit, fx);
  assert.equal(await failPawaPayDeposit(depositId, fake.database as never), true);
  assert.equal(await failPawaPayDeposit(depositId, fake.database as never), false);
  assert.equal(deposit.status, "failed");
  assert.deepEqual(fake.effects.fxStatuses, ["failed"]);
  assert.equal(fake.effects.credits, 0);
});