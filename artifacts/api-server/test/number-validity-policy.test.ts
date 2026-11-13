import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { getNumberExpiryOutcome } from "../src/lib/number-expiry-policy";
import { getNumberValidityMinutes } from "../src/lib/settings";

test("activation number validity is fixed at 20 minutes", async () => {
  assert.equal(await getNumberValidityMinutes(), 20);
});

test("refund waits for the latest expiry and requires no saved SMS", () => {
  const purchasedAt = new Date("2026-11-13T12:00:00Z");
  const firstExpiry = new Date(purchasedAt.getTime() + 20 * 60_000);
  const extendedExpiry = new Date(purchasedAt.getTime() + 30 * 60_000);

  assert.equal(
    getNumberExpiryOutcome(extendedExpiry, firstExpiry, 0),
    "still_active",
  );
  assert.equal(
    getNumberExpiryOutcome(extendedExpiry, extendedExpiry, 0),
    "expired_without_sms",
  );
  assert.equal(
    getNumberExpiryOutcome(extendedExpiry, extendedExpiry, 1),
    "expired_with_sms",
  );
});

test("customer and administrator cancellation endpoints are disabled", async () => {
  const numbersRoute = await readFile(new URL("../src/routes/numbers.ts", import.meta.url), "utf8");
  const adminRoute = await readFile(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
  const poller = await readFile(new URL("../src/lib/fivesim-poller.ts", import.meta.url), "utf8");

  assert.doesNotMatch(numbersRoute, /router\.post\("\/numbers\/:numberId\/cancel"/);
  assert.match(adminRoute, /router\.post\("\/admin\/orders\/:orderId\/cancel"[\s\S]*?res\.status\(410\)/);
  assert.doesNotMatch(numbersRoute, /Order cancelled by user/);
  assert.doesNotMatch(adminRoute, /Commande annulée et remboursée/);
  assert.doesNotMatch(poller, /REFUND_TIMEOUT_MS|createdAt,\s*cutoff/);
  assert.match(poller, /getNumberExpiryOutcome\(current\.expiresAt/);
  const activationPoll = poller.slice(
    poller.indexOf("async function pollActivationOrder"),
    poller.indexOf("async function pollHostingOrder"),
  );
  assert.ok(
    activationPoll.indexOf("saveNewSmsMessages") < activationPoll.indexOf('order.status === "TIMEOUT"'),
    "terminal provider responses must save any included SMS before refund handling",
  );
});
