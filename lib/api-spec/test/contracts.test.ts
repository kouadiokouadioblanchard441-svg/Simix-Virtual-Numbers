import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  cancelWalletDeposit,
  getWalletDepositStatus,
  getWalletPaymentOptions,
  rechargeWallet,
} from "../../api-client-react/src/generated/api";
import {
  CancelWalletDepositResponse,
  GetWalletDepositStatusResponse,
  GetWalletPaymentOptionsQueryParams,
  GetWalletPaymentOptionsResponse,
  ListTransactionsResponse,
  RechargeWalletBody,
  RechargeWalletResponse,
} from "../../api-zod/src/generated/api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const transaction = {
  id: "test-transaction",
  type: "recharge",
  amount: 1500,
  status: "pending",
  createdAt: "2026-10-01T00:00:00Z",
  externalDepositId: "test-external",
  pending: true,
  depositId: "test-deposit",
  gateway: "clapay",
  paymentMode: "API",
  payment_url: null,
  operatorPaymentUrl: "https://example.invalid/pay",
  paymentOtp: "test-otp",
  message: "Test only",
};

test("generated Zod 3 contracts retain OTP and reject invalid recharge amounts", () => {
  const input = {
    amount: 1500,
    methodSlug: "orange_money",
    operatorOtp: "123456",
  };
  assert.deepEqual(RechargeWalletBody.parse(input), input);
  assert.equal(
    RechargeWalletBody.safeParse({ ...input, operatorOtp: 123456 }).success,
    false,
  );
  for (const amount of [99, 1500.5]) {
    assert.equal(
      RechargeWalletBody.safeParse({ ...input, amount }).success,
      false,
    );
  }
  assert.equal(
    RechargeWalletBody.safeParse({ amount: 100, methodSlug: "wave" }).success,
    true,
  );
});

test("all deposit and transaction schemas retain the API payment action fields", () => {
  for (const schema of [
    RechargeWalletResponse,
    GetWalletDepositStatusResponse,
    CancelWalletDepositResponse,
  ]) {
    assert.deepEqual(schema.parse(transaction), {
      ...transaction,
      createdAt: new Date(transaction.createdAt),
    });
    assert.equal(
      schema.safeParse({ ...transaction, paymentMode: "DIRECT" }).success,
      false,
    );
  }
  assert.deepEqual(ListTransactionsResponse.parse([transaction]), [
    { ...transaction, createdAt: new Date(transaction.createdAt) },
  ]);
});

test("generated payment-options schemas preserve operator requirements and nullable fields", () => {
  assert.deepEqual(
    GetWalletPaymentOptionsQueryParams.parse({
      countryCode: "BF",
      methodSlug: "orange_money",
    }),
    { countryCode: "BF", methodSlug: "orange_money" },
  );
  const options = {
    gateway: "clapay",
    requiresOtp: true,
    instruction: null,
    operatorCode: null,
  };
  assert.deepEqual(GetWalletPaymentOptionsResponse.parse(options), options);
});

test("generated client uses the correct wallet routes, verbs and OTP payload (mocked fetch only)", async () => {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(transaction), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const input = {
    amount: 1500,
    methodSlug: "orange_money",
    operatorOtp: "123456",
  };
  await rechargeWallet(input);
  await getWalletPaymentOptions({
    countryCode: "BF",
    methodSlug: "orange_money",
  });
  await getWalletDepositStatus("test-deposit");
  await cancelWalletDeposit("test-deposit");
  assert.deepEqual(requests, [
    { url: "/api/wallet/recharge", method: "POST", body: input },
    {
      url: "/api/wallet/payment-options?countryCode=BF&methodSlug=orange_money",
      method: "GET",
      body: undefined,
    },
    {
      url: "/api/wallet/deposit/test-deposit/status",
      method: "GET",
      body: undefined,
    },
    {
      url: "/api/wallet/deposit/test-deposit/cancel",
      method: "POST",
      body: undefined,
    },
  ]);
});
