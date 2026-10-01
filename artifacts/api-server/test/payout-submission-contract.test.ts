import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { build } from "esbuild";

test("PawaPay admin form and API client submit the backend idempotencyKey contract", async () => {
  const frontendApi = new URL("../../simix/src/lib/admin-api.ts", import.meta.url);
  const page = await readFile(new URL("../../simix/src/pages/admin/payouts.tsx", import.meta.url), "utf8");
  assert.match(page, /initiatePawapayPayout\(\{[^}]*idempotencyKey:\s*attempt\.idempotencyKey/);
  assert.doesNotMatch(page, /idempotencyKeyUUID/);

  const compiled = await build({
    entryPoints: [frontendApi.pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
  });
  const { adminApi } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const calls: Array<{ url: string; method?: string; body: Record<string, unknown> }> = [];
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: { getItem: () => null },
  });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ id: "test-payout", status: "pending" }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const input = {
      phoneNumber: "2250700000000", countryIso2: "CI", provider: "TEST_PROVIDER",
      currency: "XOF", amount: 1000, idempotencyKey: "test-stable-attempt-key",
    };
    await adminApi.initiatePawapayPayout(input);
    await adminApi.initiatePawapayPayout(input);
    for (const call of calls) {
      assert.equal(call.url, "/api/admin/payouts/pawapay");
      assert.equal(call.method, "POST");
      assert.deepEqual(call.body, input);
      assert.equal(call.body.idempotencyKeyUUID, undefined);
    }
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (storageDescriptor) Object.defineProperty(globalThis, "sessionStorage", storageDescriptor);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});