import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { resolveClapayCredentials } from "../src/lib/gateway-credentials";

const originalToken = process.env.CLAPAY_API_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.CLAPAY_API_TOKEN;
  else process.env.CLAPAY_API_TOKEN = originalToken;
});

test("Clapay credentials are unavailable without the Plesk environment token", async () => {
  delete process.env.CLAPAY_API_TOKEN;

  assert.equal(await resolveClapayCredentials("https://clapay.invalid/api"), null);
});

test("Clapay uses the server environment token with a non-secret route URL", async () => {
  process.env.CLAPAY_API_TOKEN = " test-only-clapay-token ";

  assert.deepEqual(await resolveClapayCredentials("https://clapay.invalid/api"), {
    token: "test-only-clapay-token",
    baseUrl: "https://clapay.invalid/api",
  });
});
