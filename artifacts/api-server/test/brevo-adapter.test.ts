import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { brevoAdapter } from "../src/lib/email-router/adapters/brevo";
import { ProviderSendError } from "../src/lib/email-router/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Brevo sends transactional email through its HTTP API with the API key header", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ messageId: "test-message-id" }), { status: 201 });
  }) as typeof fetch;

  const result = await brevoAdapter.send({
    to: "recipient@example.test",
    from: "Simix <no-reply@example.test>",
    subject: "Test",
    html: "<p>Test</p>",
    text: "Test",
    idempotencyKey: "test-idempotency-key",
  }, { apiKey: "test-api-key" });

  assert.equal(requestUrl, "https://api.brevo.com/v3/smtp/email");
  assert.equal(requestInit?.method, "POST");
  assert.equal(new Headers(requestInit?.headers).get("api-key"), "test-api-key");
  assert.equal(new Headers(requestInit?.headers).get("Idempotency-Key"), "test-idempotency-key");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    sender: { email: "no-reply@example.test", name: "Simix" },
    to: [{ email: "recipient@example.test" }],
    subject: "Test",
    htmlContent: "<p>Test</p>",
    textContent: "Test",
  });
  assert.equal(result.messageId, "test-message-id");
});

test("Brevo reports an IP authorization 401 without hiding the provider message", async () => {
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ message: "Unrecognised IP address" }),
    { status: 401 },
  )) as typeof fetch;

  await assert.rejects(
    () => brevoAdapter.send({
      to: "recipient@example.test",
      from: "no-reply@example.test",
      subject: "Test",
      html: "<p>Test</p>",
    }, { apiKey: "test-api-key" }),
    (error: unknown) => error instanceof ProviderSendError
      && error.status === 401
      && error.kind === "temporary"
      && error.message.includes("Unrecognised IP address"),
  );
});

test("Brevo health check calls the account endpoint with the environment-resolved key", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ email: "account@example.test" }), { status: 200 });
  }) as typeof fetch;

  const result = await brevoAdapter.healthCheck({ apiKey: "test-api-key" });

  assert.equal(requestUrl, "https://api.brevo.com/v3/account");
  assert.equal(requestHeaders?.get("api-key"), "test-api-key");
  assert.equal(result.healthy, true);
});

test("Brevo refuses to send when no API key is configured", async () => {
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 500 });
  }) as typeof fetch;

  await assert.rejects(
    () => brevoAdapter.send({
      to: "recipient@example.test",
      from: "no-reply@example.test",
      subject: "Test",
      html: "<p>Test</p>",
    }, {}),
    (error: unknown) => error instanceof ProviderSendError
      && error.kind === "definitive"
      && error.code === "MISSING_API_KEY",
  );
  assert.equal(fetchCalled, false);
});
