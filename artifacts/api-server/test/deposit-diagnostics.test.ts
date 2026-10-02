import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { ClapayClient, type ClapayOperator } from "../src/lib/clapay";
import { buildDepositDiagnostics, classifyDepositOperator, DepositCatalogueCache } from "../src/lib/deposit-diagnostics";

// Sanitized metadata shape from the live BF regression: no legacy code object.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/clapay-bf-operators.json", import.meta.url), "utf8")) as ClapayOperator[];
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const classify = (ops: ClapayOperator[]) => classifyDepositOperator("BF", "orange_money", ops);

test("live metadata without code remains catalogue eligible with OTP, not payment verified", () => {
  assert.deepEqual(classify(fixture), {
    status: "catalogue_available", operatorCode: "OM", metadataMissing: true, requiresOtp: true,
  });
  const { otpstarter: _, ...withoutOtp } = fixture[0];
  assert.equal(classify([withoutOtp as ClapayOperator]).requiresOtp, null);
});

test("missing operator, inactive, missing identifier and explicit denials stay distinct", () => {
  assert.equal(classify([]).status, "operator_missing");
  assert.equal(classify([{ ...fixture[0], active: false }]).status, "operator_inactive");
  assert.equal(classify([{ ...fixture[0], codeoperator: "" }]).status, "operator_code_missing");
  for (const value of ["none", " NONE ", "", null]) {
    const result = classify([{ ...fixture[0], code: { MERCHANT: value } }]);
    assert.equal(result.status, "method_denied");
    assert.equal(result.metadataMissing, false);
  }
  assert.equal(classify([{ ...fixture[0], code: { CASHIN: "none" } }]).status, "catalogue_available");
});

test("diagnostics match the deposit eligible-first resolution and country-scoped aliases", () => {
  assert.equal(classify([{ ...fixture[0], active: false }, fixture[0]]).status, "catalogue_available");
  const moov = { ...fixture[0], name: "MOOV MONEY", codeoperator: "MOOV" };
  assert.equal(classifyDepositOperator("TG", "flooz", [moov]).status, "catalogue_available");
  assert.equal(classifyDepositOperator("BF", "flooz", [moov]).status, "operator_missing");
});

test("catalogue calls are GET-only and share per-account/country cache across methods and requests", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    const url = new URL(String(input));
    calls.push(url.pathname);
    return response(url.pathname.endsWith("/countries/data") ? [{ code: "BF" }] : fixture);
  };
  const cache = new DepositCatalogueCache();
  const client = new ClapayClient("fixture-account");
  const [a, b] = await Promise.all([cache.check(client, "BF", "orange_money"), cache.check(client, "BF", "moov_money")]);
  assert.equal(a.status, "catalogue_available");
  assert.equal(b.status, "operator_missing");
  await cache.check(new ClapayClient("fixture-account"), "BF", "orange_money");
  assert.equal(calls.length, 2);
});

test("account, credential rotation and base URL changes partition the cache", async () => {
  let calls = 0;
  globalThis.fetch = async input => {
    calls++;
    return response(String(input).includes("/countries/data") ? [{ code: "BF" }] : fixture);
  };
  const cache = new DepositCatalogueCache();
  for (const client of [
    new ClapayClient("account-a"), new ClapayClient("account-b"),
    new ClapayClient("account-a", "https://other.example"),
  ]) assert.equal((await cache.check(client, "BF", "orange_money")).status, "catalogue_available");
  assert.equal(calls, 6);
});

test("access errors are sanitized, cached then retried after TTL; no absent-operator claim", async () => {
  let calls = 0;
  let now = 0;
  globalThis.fetch = async () => { calls++; throw new Error("secret provider payload https://private.example"); };
  const cache = new DepositCatalogueCache(60_000, 3, 200, () => now);
  const client = new ClapayClient("fixture-account");
  const first = await cache.check(client, "BF", "orange_money");
  assert.equal(first.status, "catalogue_access_failed");
  assert.doesNotMatch(JSON.stringify(first), /secret|private|fixture-account/);
  now = 59_999;
  await cache.check(client, "BF", "orange_money");
  assert.equal(calls, 1);
  now = 60_001;
  await cache.check(client, "BF", "orange_money");
  assert.equal(calls, 2);
});

test("country absent avoids operator lookup, HTTP and malformed catalogue failures are not denials", async () => {
  const client = new ClapayClient("fixture-account");
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response([{ code: "CI" }]); };
  assert.equal((await new DepositCatalogueCache().check(client, "BF", "orange_money")).status, "country_missing");
  assert.equal(calls, 1);
  for (const body of [null, { message: "unexpected catalogue" }]) {
    globalThis.fetch = async () => response(body);
    assert.equal((await new DepositCatalogueCache().check(client, "BF", "orange_money")).status, "catalogue_access_failed");
  }
  globalThis.fetch = async input => response(String(input).includes("/countries/data") ? [{ code: "BF" }] : { error: "denied" }, String(input).includes("/countries/data") ? 200 : 403);
  assert.equal((await new DepositCatalogueCache().check(client, "BF", "orange_money")).status, "catalogue_access_failed");
  globalThis.fetch = async input => response(String(input).includes("/countries/data") ? [{ code: "BF" }] : { error: "unexpected successful response" });
  assert.equal((await new DepositCatalogueCache().check(client, "BF", "orange_money")).status, "catalogue_access_failed");
});

test("cache enforces global outbound concurrency and a bounded in-flight key count", async () => {
  let active = 0;
  let peak = 0;
  globalThis.fetch = async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return response([]);
  };
  const cache = new DepositCatalogueCache(60_000, 3, 6);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => cache.check(new ClapayClient(`fixture-${i}`), "BF", "orange_money")));
  assert.ok(peak <= 3);
  assert.equal(results.filter(r => r.status === "catalogue_access_failed").length, 6);
});

test("report covers enabled methods with actual resolver, leaves PawaPay alone, never confirms payment", async () => {
  const resolved: string[] = [];
  const methods = ["orange_money", "pawapay_only", "blocked_route", "disabled_local", "missing_method", "resolver_error"].map(methodSlug => ({
    countryCode: "BF", methodSlug, methodName: methodSlug === "missing_method" ? null : methodSlug,
  }));
  const client = new ClapayClient("route-account", "https://route.example");
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).origin, "https://route.example");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer route-account");
    return response(String(input).includes("/countries/data") ? [{ code: "BF" }] : fixture);
  };
  const report = await buildDepositDiagnostics(methods, {
    isEnabledOperator: async m => m.methodSlug !== "disabled_local",
    resolveGateway: async (country, method, amount) => {
      assert.equal(amount, 0);
      resolved.push(`${country}/${method}`);
      if (method === "resolver_error") throw new Error("credential payload");
      return {
        gateway: method === "pawapay_only" ? "pawapay" : method === "blocked_route" ? null : "clapay",
        routingSource: "dynamic", clapayCtx: { client },
      };
    },
    cache: new DepositCatalogueCache(),
  });
  assert.deepEqual(report.rows.map(r => r.status), [
    "catalogue_available", "not_clapay", "route_unavailable", "configuration_unavailable", "configuration_unavailable", "route_unavailable",
  ]);
  assert.equal(resolved.length, 4);
  assert.equal(report.paymentVerified, false);
  assert.equal(report.readOnly, true);
  assert.doesNotMatch(JSON.stringify(report), /route-account|route\.example|Authorization|credential payload/);
});

test("admin endpoint is JWT-protected, read-only and shares the exact wallet resolver", () => {
  const route = readFileSync(new URL("../src/routes/admin-deposit-diagnostics.ts", import.meta.url), "utf8");
  assert.match(route, /router\.get\("\/admin\/deposit-diagnostics", requireAdminJwt/);
  assert.match(route, /resolveGateway: resolveWalletGateway/);
  assert.match(route, /eq\(countryPaymentConfigsTable\.enabled, true\)/);
  assert.doesNotMatch(route, /router\.(post|put|patch|delete)|db\.(insert|update|delete)|initiate|credit|refund/i);
});