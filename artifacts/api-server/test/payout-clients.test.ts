import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { ClapayClient } from "../src/lib/clapay";
import { PawaPayClient } from "../src/lib/pawapay";

const savedFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = savedFetch; });

test("Clapay payout initiation uses the payment CASHIN/API contract and catalogue short code", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({
      signature: "test-signature",
      country: "CI",
      currency: "XOF",
      status_payment: "INITIATED",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = new ClapayClient("test-token");
  await client.initiateCashout({
    transaction_id: "payout-test-id",
    additional_infos: { customer_phone: "0700000000" },
    amount: 1000,
    callback_url: "https://example.invalid/payout",
    return_url: "https://example.invalid/admin",
    country_code: "CI",
    operators_code: ["OM"],
    method: "CASHIN",
    tunnel: "API",
    operator_otp: "654321",
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0]!.url, /\/nowallet\/api\/init\/payment$/);
  assert.equal(requests[0]!.body.method, "CASHIN");
  assert.equal(requests[0]!.body.tunnel, "API");
  assert.deepEqual(requests[0]!.body.operators_code, ["OM"]);
  assert.equal(requests[0]!.body.operator_otp, "654321");
});

test("PawaPay payout creation and status use the v2 endpoints", async () => {
  const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method ?? "GET");
    requests.push({
      url,
      method,
      ...(typeof init?.body === "string" ? { body: JSON.parse(init.body) as Record<string, unknown> } : {}),
    });
    const payload = url.endsWith("/v2/payouts")
      ? { payoutId: "stable-id", status: "ACCEPTED" }
      : { status: "FOUND", data: { payoutId: "stable-id", status: "PROCESSING" } };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = new PawaPayClient("test-token", "sandbox");
  const init = await client.initiatePayout({
    payoutId: "stable-id",
    amount: "100",
    currency: "XOF",
    recipient: { type: "MMO", accountDetails: { phoneNumber: "2250700000000", provider: "ORANGE_CIV" } },
  });
  const status = await client.getPayoutStatus("stable-id");

  assert.equal(init.status, "ACCEPTED");
  assert.equal(requests[0]!.method, "POST");
  assert.match(requests[0]!.url, /\/v2\/payouts$/);
  assert.equal(requests[0]!.body?.payoutId, "stable-id");
  assert.equal(status.status, "FOUND");
  assert.match(requests[1]!.url, /\/v2\/payouts\/stable-id$/);
});