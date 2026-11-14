import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { resolvePawaPayCredentials } from "../src/lib/gateway-credentials";

const originalToken = process.env.PAWAPAY_API_TOKEN;
const originalEnv = process.env.PAWAPAY_ENV;

afterEach(() => {
  if (originalToken === undefined) delete process.env.PAWAPAY_API_TOKEN;
  else process.env.PAWAPAY_API_TOKEN = originalToken;

  if (originalEnv === undefined) delete process.env.PAWAPAY_ENV;
  else process.env.PAWAPAY_ENV = originalEnv;
});

test("PawaPay credentials are unavailable without the Plesk environment token", async () => {
  delete process.env.PAWAPAY_API_TOKEN;
  process.env.PAWAPAY_ENV = "production";

  assert.equal(await resolvePawaPayCredentials(), null);
});

test("PawaPay credentials and mode come only from environment variables", async () => {
  process.env.PAWAPAY_API_TOKEN = "test-only-pawapay-token";
  process.env.PAWAPAY_ENV = " PRODUCTION ";

  assert.deepEqual(await resolvePawaPayCredentials(), {
    token: "test-only-pawapay-token",
    env: "production",
  });
});

test("PawaPay defaults to sandbox when the environment mode is absent or invalid", async () => {
  process.env.PAWAPAY_API_TOKEN = "test-only-pawapay-token";
  process.env.PAWAPAY_ENV = "unexpected";

  assert.deepEqual(await resolvePawaPayCredentials(), {
    token: "test-only-pawapay-token",
    env: "sandbox",
  });
});
