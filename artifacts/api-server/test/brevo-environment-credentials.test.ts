import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { resolveProviderApiKey } from "../src/lib/email-router/provider-credentials";

const originalBrevoKey = process.env.BREVO_API_KEY;

afterEach(() => {
  if (originalBrevoKey === undefined) delete process.env.BREVO_API_KEY;
  else process.env.BREVO_API_KEY = originalBrevoKey;
});

test("Brevo prefers the server environment key without decrypting a database value", () => {
  process.env.BREVO_API_KEY = "test-only-brevo-env-key";

  assert.deepEqual(resolveProviderApiKey("brevo", "invalid-database-ciphertext"), {
    apiKey: "test-only-brevo-env-key",
    source: "environment",
  });
});

test("Brevo reports no key when neither environment nor database key exists", () => {
  delete process.env.BREVO_API_KEY;

  assert.deepEqual(resolveProviderApiKey("brevo"), {
    apiKey: null,
    source: "none",
  });
});
