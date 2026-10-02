import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  ClapayClient,
  clapayOperatorRequiresOtp,
  clapayOperatorSupportsMethod,
  type ClapayOperator,
  isClapayCancellationAcknowledged,
  normalizeClapayStatus,
  type ClapayGatewayMeta,
  getClapayOperatorPaymentUrl,
  type ClapayPaymentResponse,
} from "../src/lib/clapay";
import {
  mergeClapayGatewayMeta,
  normalizeClapayMetaFromStoredDeposit,
  validateClapayStatus,
  settleVerifiedClapayDeposit,
} from "../src/lib/clapay-settlement";
import { matchesMobileOperatorMethod } from "../src/lib/wallet-payment-classification";
import { createRotatingBatchReader } from "../src/lib/rotating-batch";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("API Wave completion supports both documented URL fields and rejects unsafe links", () => {
  const base = { country: "CI", currency: "XOF", signature: "test-signature", status_payment: "INITIATED" };
  const operatorLink = "https://pay.wave.com/test-only-operator";
  const alternativeLink = "https://pay.wave.com/test-only-alternative";
  assert.equal(getClapayOperatorPaymentUrl({ ...base, payment_url_operator: operatorLink }), operatorLink);
  assert.equal(getClapayOperatorPaymentUrl({ ...base, payment_url: alternativeLink }), alternativeLink);
  assert.equal(getClapayOperatorPaymentUrl({ ...base, payment_url_operator: operatorLink, payment_url: alternativeLink }), operatorLink);
  assert.equal(getClapayOperatorPaymentUrl({ ...base, payment_url_operator: "javascript:alert(1)", payment_url: alternativeLink }), alternativeLink);
  for (const unsafe of ["javascript:alert(1)", "http://pay.wave.com/test", "//pay.wave.com/test", "https://user:pass@pay.wave.com/test", "invalid", ""]) {
    assert.equal(getClapayOperatorPaymentUrl({ ...base, payment_url: unsafe }), null);
  }
  assert.equal(getClapayOperatorPaymentUrl(base), null);
});

test("Clapay initiation preserves flat and data-wrapped Wave completion responses", async () => {
  const response: ClapayPaymentResponse = {
    country: "CI", currency: "XOF", signature: "test-signature", status_payment: "INITIATED",
    payment_url: "https://pay.wave.com/test-only-alternative",
  };
  for (const payload of [response, { data: response }]) {
    globalThis.fetch = async (input) => {
      assert.match(new URL(String(input)).pathname, /\/init\/payment$/);
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await new ClapayClient("test-only-token").initiatePayment({
      transaction_id: "test-wave", amount: 1000, country_code: "CI", operators_code: ["WAVE"],
      callback_url: "https://example.invalid/callback", return_url: "https://example.invalid/return",
      additional_infos: { customer_phone: "0700000000" }, method: "MERCHANT", tunnel: "API",
    });
    assert.equal(result.signature, response.signature);
    assert.equal(getClapayOperatorPaymentUrl(result), response.payment_url);
  }
});

test("live BF catalogue without legacy code metadata resolves Orange Money and preserves OTP", async () => {
  const [orange] = JSON.parse(readFileSync(
    new URL("./fixtures/clapay-bf-operators.json", import.meta.url), "utf8",
  )) as ClapayOperator[];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.match(url.pathname, /\/operators\/data$/);
    assert.equal(url.searchParams.get("country"), "BF");
    return new Response(JSON.stringify([
      { ...orange, name: "MOOV MONEY", codeoperator: "MOOV", otpstarter: { MERCHANT: false } },
      orange,
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = new ClapayClient("test-only-token");
  const resolved = await client.resolveOperator("BF", "orange_money");
  assert.equal(resolved?.codeoperator, "OM");
  assert.equal(resolved?.instruction.MERCHANT, orange.instruction.MERCHANT);
  assert.equal(clapayOperatorRequiresOtp(resolved!), true);
  assert.equal(await client.resolveOperatorCode("BF", "orange_money"), "OM");
  assert.equal(clapayOperatorSupportsMethod(orange, "CASHIN"), true);
});

test("missing legacy metadata does not bypass explicit denials or inactive catalogue operators", () => {
  const operator = {
    name: "ORANGE MONEY", codeoperator: "OM", active: true,
  } as ClapayOperator;
  assert.equal(clapayOperatorSupportsMethod(operator, "MERCHANT"), true);
  assert.equal(clapayOperatorSupportsMethod({ ...operator, active: false }, "MERCHANT"), false);
  assert.equal(clapayOperatorSupportsMethod({ ...operator, active: "false" as unknown as boolean }, "MERCHANT"), false);
  assert.equal(clapayOperatorSupportsMethod({ ...operator, codeoperator: "" }, "MERCHANT"), false);
  assert.equal(clapayOperatorSupportsMethod({ ...operator, codeoperator: 1 as unknown as string }, "MERCHANT"), false);
  for (const denied of ["none", " NONE ", "", null]) {
    assert.equal(clapayOperatorSupportsMethod({ ...operator, code: { MERCHANT: denied } }, "MERCHANT"), false);
    assert.equal(clapayOperatorSupportsMethod({ ...operator, code: { CASHIN: denied } }, "CASHIN"), false);
  }
  assert.equal(clapayOperatorSupportsMethod({ ...operator, code: { MERCHANT: "ORANGEBF" } }, "MERCHANT"), true);
});

test("deposit resolution handles catalogue metadata without legacy codes across configured countries", async () => {
  const cases = [
    ["BF", "moov_money", "MOOV"], ["BF", "orange_money", "OM"], ["BF", "wave", "WAVE"],
    ["BJ", "moov_money", "MOOV"], ["BJ", "mtn_money", "MTN"],
    ["CG", "airtel_money", "AIRTEL"], ["CG", "mtn_money", "MTN"],
    ["CI", "moov_money", "MOOV"], ["CI", "mtn_money", "MTN"], ["CI", "orange_money", "OM"], ["CI", "wave", "WAVE"],
    ["CM", "mtn_money", "MTN"], ["CM", "orange_money", "OM"],
    ["GA", "airtel_money", "AIRTEL"], ["GH", "mtn_money", "MTN"],
    ["GN", "mtn_money", "MTN"], ["GN", "orange_money", "OM"],
    ["KE", "airtel_money", "AIRTEL"], ["KE", "mpesa", "MPESA"],
    ["ML", "moov_money", "MOOV"], ["ML", "orange_money", "OM"], ["ML", "wave", "WAVE"],
    ["NE", "moov_money", "MOOV"], ["RW", "airtel_money", "AIRTEL"], ["RW", "mtn_money", "MTN"],
    ["SN", "free_money", "FREEMONEY"], ["SN", "orange_money", "OM"], ["SN", "wave", "WAVE"],
    ["TG", "moov_money", "MOOV"], ["TG", "tmoney", "TMONEY"], ["TZ", "airtel_money", "AIRTEL"],
    ["GH", "airtel_money", "AIRTELTIGO"], ["TG", "flooz", "MOOV"],
  ] as const;
  for (const [country, method, shortcode] of cases) {
    const requiresOtp = shortcode === "OM" && country !== "CM";
    const name = shortcode === "OM" ? "ORANGE MONEY"
      : shortcode === "MOOV" ? "MOOV MONEY"
      : shortcode === "MTN" ? "MTN MOBILE MONEY"
      : shortcode;
    globalThis.fetch = async () => new Response(JSON.stringify([{
      name, codeoperator: shortcode, active: true,
      otpstarter: { MERCHANT: requiresOtp },
      instruction: { MERCHANT: requiresOtp ? "Code OTP requis." : null },
    }]), { status: 200, headers: { "Content-Type": "application/json" } });
    const resolved = await new ClapayClient("test-only-token").resolveOperator(country, method);
    assert.equal(resolved?.codeoperator, shortcode, `${country}/${method}`);
    assert.equal(clapayOperatorRequiresOtp(resolved!), requiresOtp, `${country}/${method}: OTP`);
  }
});

test("local brand aliases never invent identifiers or bypass country and eligibility checks", async () => {
  const client = new ClapayClient("test-only-token");
  const moov = { name: "MOOV MONEY", codeoperator: "ACTUAL-MOOV-CODE", active: true };
  const airtelTigo = { name: "AIRTELTIGO", codeoperator: "ACTUAL-AIRTELTIGO-CODE", active: true };
  let catalogue: unknown[] = [moov];
  globalThis.fetch = async () => new Response(JSON.stringify(catalogue), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
  assert.equal((await client.resolveOperator("TG", "flooz"))?.codeoperator, moov.codeoperator);
  assert.equal(await client.resolveOperator("BF", "flooz"), null);
  assert.equal(await client.resolveOperator("TG", ""), null);
  catalogue = [{ ...moov, active: false }];
  assert.equal(await client.resolveOperator("TG", "flooz"), null);
  catalogue = [{ ...moov, code: { MERCHANT: "none" } }];
  assert.equal(await client.resolveOperator("TG", "flooz"), null);
  catalogue = [airtelTigo];
  assert.equal((await client.resolveOperator("GH", "airtel_money"))?.codeoperator, airtelTigo.codeoperator);
  assert.equal(await client.resolveOperator("NG", "airtel_money"), null);
  catalogue = [];
  assert.equal(await client.resolveOperator("GH", "airtel_money"), null);
  catalogue = [{ name: "MTN MOBILE MONEY", codeoperator: "MTN", active: true }];
  assert.equal(await client.resolveOperator("CG", "orange_money"), null);
  catalogue = [{ name: "", codeoperator: "MTN", active: true }];
  assert.equal(await client.resolveOperator("CG", "orange_money"), null);
  catalogue = [{ codeoperator: "MTN", active: true }];
  assert.equal(await client.resolveOperator("CG", "orange_money"), null);
});

test("Clapay init uses API/MERCHANT and one current catalogue short operator code", async () => {
  const requested: Array<{ url: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requested.push({ url, body });
    if (url.includes("/operators/data")) {
      return new Response(JSON.stringify([
        { name: "Orange Money", codeoperator: "OM", code: { MERCHANT: "ORANGECI" }, active: true, otpstarter: { MERCHANT: true } },
        { name: "Wave", codeoperator: "WAVE", code: { MERCHANT: "none" }, active: true, otpstarter: { MERCHANT: false } },
      ]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      signature: "sig-123",
      country: "CI",
      currency: "XOF",
      status_payment: "INITIATED",
      payment_url_operator: "wave://pay",
      payment_otp: "8765",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = new ClapayClient("server-only-token");
  const operator = await client.resolveOperator("CI", "orange-money");
  assert.equal(operator?.codeoperator, "OM");
  assert.equal(clapayOperatorRequiresOtp(operator!), true);
  assert.equal(await client.resolveOperatorCode("CI", "wave"), null);
  const init = await client.initiatePayment({
    transaction_id: "track-1",
    amount: 1500.8,
    additional_infos: { customer_phone: "0700000000" },
    callback_url: "https://example.invalid/callback",
    return_url: "https://example.invalid/wallet",
    country_code: "CI",
    operators_code: ["OM"],
    method: "MERCHANT",
    tunnel: "API",
    operator_otp: "123456",
  });

  const request = requested.at(-1)!;
  assert.match(request.url, /\/nowallet\/api\/init\/payment$/);
  assert.deepEqual(request.body?.operators_code, ["OM"]);
  assert.equal(request.body?.tunnel, "API");
  assert.equal(request.body?.method, "MERCHANT");
  assert.equal(request.body?.amount, 1500);
  assert.equal(request.body?.additional_infos?.customer_phone, "0700000000");
  assert.equal("customer_phone" in (request.body ?? {}), false);
  assert.equal(request.body?.operator_otp, "123456");
  assert.equal(init.payment_url_operator, "wave://pay");
});

test("Clapay status mapping treats only verified terminal values as final", () => {
  assert.equal(normalizeClapayStatus("SUCCESS"), "completed");
  assert.equal(normalizeClapayStatus("successful"), "completed");
  assert.equal(normalizeClapayStatus("COMPLETED"), "completed");
  assert.equal(normalizeClapayStatus("UNKNOWN"), "pending");

  const meta: ClapayGatewayMeta = {
    clapaySignature: "sig-1",
    clapayCurrency: "XOF",
    clapayCountry: "CI",
    localAmount: 2500,
    operatorCode: "OM",
    trackingId: "track-1",
    method: "MERCHANT",
    initiatedAt: new Date(0).toISOString(),
  };
  const matching = validateClapayStatus({
    status: "SUCCESS",
    transaction_id: "track-1",
    signature: "sig-1",
    amount: "2500",
    currency: "XOF",
    method: "MERCHANT",
    country: "CI",
  }, meta as never, "track-1");
  assert.equal(matching.status, "completed");
  assert.deepEqual(validateClapayStatus({
    status: "PENDING",
    transaction_id: "track-1",
    signature: "sig-1",
  }, meta as never, "track-1"), { status: "pending", responseStatus: "PENDING" });
  assert.throws(() => validateClapayStatus({
    status: "PENDING",
    signature: "wrong-signature",
  }, meta as never, "track-1"), /does not match/);
  assert.throws(() => validateClapayStatus({
    status: "SUCCESS",
    transaction_id: "track-1",
    signature: "sig-1",
    amount: "2501",
    currency: "XOF",
    method: "MERCHANT",
    country: "CI",
  }, meta as never, "track-1"), /does not match/);
  assert.throws(() => validateClapayStatus({
    status: "SUCCESS",
    transaction_id: "track-1",
    signature: "sig-1",
    amount: "2500",
    currency: "XOF",
    method: "CASHIN",
    country: "CI",
  }, meta as never, "track-1"), /does not match/);
});

test("legacy XOF metadata recovers local amount and tracking ID from stored deposit only", () => {
  const normalized = normalizeClapayMetaFromStoredDeposit(
    {
      externalDepositId: "clapay:tracking-from-row",
      amount: 7250,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    } as never,
    {
      clapaySignature: "sig-legacy",
      clapayCurrency: "XOF",
      clapayCountry: "CI",
    },
  );
  assert.equal(normalized?.localAmount, 7250);
  assert.equal(normalized?.trackingId, "tracking-from-row");
  assert.equal(normalized?.method, "MERCHANT");
  assert.equal(normalizeClapayMetaFromStoredDeposit(
    {
      externalDepositId: "clapay:foreign",
      amount: 7250,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    } as never,
    { clapaySignature: "sig", clapayCountry: "CI" },
  ), null);
  const foreign = normalizeClapayMetaFromStoredDeposit(
    {
      externalDepositId: "clapay:foreign",
      amount: 7250,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    } as never,
    { clapaySignature: "sig-fx", clapayCountry: "KE" },
    { currency: "KES", localAmount: "1000.75", amountXof: "7250" },
  );
  assert.equal(foreign?.clapayCurrency, "KES");
  assert.equal(foreign?.localAmount, 1000);
});

test("mobile-money classification supports active DB operators such as MyNita", () => {
  assert.equal(matchesMobileOperatorMethod("mynita", "MyNita", "mynita", "MyNita"), true);
  assert.equal(matchesMobileOperatorMethod("my-nita-wallet", "MyNita Wallet", "mynita", "MyNita"), true);
  assert.equal(matchesMobileOperatorMethod("made-up-wallet", "Fake Voucher", "mynita", "MyNita"), false);
});

test("Clapay metadata merges preserve concurrent lifecycle actions and reject signature conflicts", () => {
  const merged = mergeClapayGatewayMeta(
    {
      clapaySignature: "sig-1",
      gatewayConfigId: "gateway-row-1",
      operatorPaymentUrl: "operator://pay",
      paymentOtp: "1234",
    },
    { clapaySignature: "sig-1", message: "confirmed pending" },
  );
  assert.equal(merged?.gatewayConfigId, "gateway-row-1");
  assert.equal(merged?.operatorPaymentUrl, "operator://pay");
  assert.equal(merged?.paymentOtp, "1234");
  assert.equal(merged?.message, "confirmed pending");
  assert.equal(mergeClapayGatewayMeta(
    { clapaySignature: "stored" },
    { clapaySignature: "callback-mismatch" },
  ), null);
});

test("404 signature status is UNKNOWN rather than payment failure", async () => {
  let checkBody: unknown;
  globalThis.fetch = async (_input, init) => {
    checkBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ message: "signature closed" }), { status: 404 });
  };
  const result = await new ClapayClient("server-only-token").checkPaymentStatus("sig-unknown");
  assert.deepEqual(checkBody, { signature: "sig-unknown" });
  assert.equal(result.status, "UNKNOWN");
});

test("cancellation uses the signature endpoint and only explicit acknowledgements count", async () => {
  let cancelBody: unknown;
  globalThis.fetch = async (_input, init) => {
    cancelBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ status: "CANCELLED" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const response = await new ClapayClient("server-only-token").cancelPayment("sig-cancel");
  assert.deepEqual(cancelBody, { signature: "sig-cancel" });
  assert.equal(isClapayCancellationAcknowledged(response), true);
  assert.equal(isClapayCancellationAcknowledged({ message: "accepted" }), false);
});

for (const legacy of [false, true]) {
test(`settlement atomically credits ${legacy ? "legacy" : "current"} deposits once`, async () => {
  const deposit = {
    id: "tx-1",
    userId: "user-1",
    type: "recharge",
    amount: 700,
    status: "pending",
    externalDepositId: "clapay:track-1",
    createdAt: new Date(0),
    gatewayMeta: JSON.stringify({
      clapaySignature: "sig-1", clapayCurrency: "XOF", clapayCountry: "CI",
      ...(legacy ? {} : { localAmount: 700, operatorCode: "OM", trackingId: "track-1", method: "MERCHANT" }),
      initiatedAt: new Date(0).toISOString(),
    }),
  };
  let credits = 0;
  const mockTransaction = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: async () => deposit.status === "pending" ? [deposit] : [],
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: { status?: string; gatewayMeta?: string }) => {
        const builder = {
          returning: async () => {
            if (values.gatewayMeta && deposit.status === "pending") {
              deposit.gatewayMeta = values.gatewayMeta;
              return [{ id: deposit.id }];
            }
            if (values.status !== "completed" || deposit.status !== "pending") return [];
            deposit.status = "completed";
            return [{ id: deposit.id }];
          },
          then: async (resolve: (value: unknown) => unknown) => {
          if (values.status === undefined && table) credits += 1;
          return resolve(undefined);
          },
        };
        return { where: () => builder };
      },
    }),
  };
  const fakeDb = {
    transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(mockTransaction),
  };

  const first = await settleVerifiedClapayDeposit("clapay:track-1", fakeDb as never);
  const second = await settleVerifiedClapayDeposit("clapay:track-1", fakeDb as never);
  assert.equal(first.settled, true);
  assert.equal(second.settled, false);
  assert.equal(deposit.status, "completed");
  assert.equal(credits, 1);
  assert.equal(JSON.parse(deposit.gatewayMeta).localAmount, 700);
  assert.equal(JSON.parse(deposit.gatewayMeta).trackingId, "track-1");
  assert.equal(JSON.parse(deposit.gatewayMeta).method, "MERCHANT");
});
}

test("legacy verification never accepts mismatched provider identity or amounts", () => {
  const deposit = { externalDepositId: "clapay:legacy-track", amount: 2500, createdAt: new Date(0) } as never;
  const source = { clapaySignature: "legacy-signature", clapayCurrency: "XOF", clapayCountry: "CI" };
  const meta = normalizeClapayMetaFromStoredDeposit(deposit, source);
  assert.ok(meta);
  const response = {
    status: "SUCCESS", transaction_id: "legacy-track", signature: "legacy-signature",
    amount: "2500", currency: "XOF", method: "MERCHANT", country: "CI",
  };
  assert.equal(validateClapayStatus(response, meta, "legacy-track").status, "completed");
  for (const mismatch of [
    { transaction_id: "other" }, { signature: "other" }, { amount: "1" },
    { currency: "USD" }, { country: "SN" }, { method: "CASHOUT" },
  ]) {
    assert.throws(() => validateClapayStatus({ ...response, ...mismatch }, meta, "legacy-track"), /does not match/);
  }
  assert.equal(normalizeClapayMetaFromStoredDeposit(deposit, { ...source, trackingId: "other" }), null);
});

test("legacy foreign-currency deposits require matching original FX evidence", () => {
  const deposit = { externalDepositId: "clapay:legacy-track", amount: 2500, createdAt: new Date(0) } as never;
  const source = { clapaySignature: "sig", clapayCurrency: "KES", clapayCountry: "KE" };
  const fx = { currency: "KES", localAmount: "600.80", amountXof: "2500" };
  assert.equal(normalizeClapayMetaFromStoredDeposit(deposit, source, fx)?.localAmount, 600);
  assert.equal(normalizeClapayMetaFromStoredDeposit(deposit, source), null);
  for (const mismatch of [{ currency: "USD" }, { localAmount: "NaN" }, { amountXof: "999" }]) {
    assert.equal(normalizeClapayMetaFromStoredDeposit(deposit, source, { ...fx, ...mismatch }), null);
  }
});

test("rotating reconciliation reaches all 121 unresolved deposits and wraps safely", async () => {
  const pending = Array.from({ length: 121 }, (_, index) => ({ id: String(index).padStart(4, "0") }));
  const read = createRotatingBatchReader(async (after, limit) =>
    pending.filter(item => after === null || item.id > after).slice(0, limit), 50);
  const first = await read();
  const second = await read();
  const third = await read();
  assert.equal(first.length, 50);
  assert.equal(second.length, 50);
  assert.equal(third.length, 21);
  assert.equal(new Set([...first, ...second, ...third].map(item => item.id)).size, 121);
  assert.deepEqual(await read(), first);
  pending.splice(0, 50);
  assert.deepEqual(await read(), second);
});