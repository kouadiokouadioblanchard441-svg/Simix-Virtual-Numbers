import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { getNumberExpiryOutcome } from "../src/lib/number-expiry-policy";
import { getNumberValidityMinutes } from "../src/lib/settings";

test("activation number validity is fixed at 20 minutes", async () => {
  assert.equal(await getNumberValidityMinutes(), 20);
});

test("local-expiry fallback requires the 20-minute deadline and no saved SMS", () => {
  const purchasedAt = new Date("2026-11-13T12:00:00Z");
  const expiry = new Date(purchasedAt.getTime() + 20 * 60_000);

  assert.equal(
    getNumberExpiryOutcome(expiry, new Date(expiry.getTime() - 1), 0),
    "still_active",
  );
  assert.equal(
    getNumberExpiryOutcome(expiry, expiry, 0),
    "expired_without_sms",
  );
  assert.equal(
    getNumberExpiryOutcome(expiry, expiry, 1),
    "expired_with_sms",
  );
});

test("user cancellation and paid extension endpoints are absent", async () => {
  const numbersRoute = await readFile(new URL("../src/routes/numbers.ts", import.meta.url), "utf8");
  const adminRoute = await readFile(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
  const poller = await readFile(new URL("../src/lib/fivesim-poller.ts", import.meta.url), "utf8");
  const openapi = await readFile(new URL("../../../lib/api-spec/openapi.yaml", import.meta.url), "utf8");
  const assignedPage = await readFile(new URL("../../simix/src/pages/number-assigned.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(numbersRoute, /router\.post\("\/numbers\/:numberId\/cancel"/);
  assert.doesNotMatch(numbersRoute, /router\.post\("\/numbers\/:numberId\/extend"/);
  assert.doesNotMatch(openapi, /\/numbers\/\{numberId\}\/extend/);
  assert.doesNotMatch(assignedPage, /useExtendNumber|onExtend|Prolonger le temps/);
  assert.match(adminRoute, /router\.post\("\/admin\/orders\/:orderId\/cancel"[\s\S]*?res\.status\(410\)/);
  assert.doesNotMatch(numbersRoute, /Order cancelled by user/);
  assert.doesNotMatch(adminRoute, /Commande annulée et remboursée/);
  assert.doesNotMatch(poller, /REFUND_TIMEOUT_MS|createdAt,\s*cutoff/);
  assert.match(poller, /getNumberExpiryOutcome\(current\.expiresAt/);
  assert.match(
    poller,
    /eq\(virtualNumbersTable\.numberType, "activation"\)[\s\S]*?gt\(virtualNumbersTable\.expiresAt/,
    "activation orders must continue polling after the local countdown reaches zero",
  );
  const expiryHandler = poller.slice(
    poller.indexOf("async function handleExpiredOrder"),
    poller.indexOf("async function handleCancelledOrder"),
  );
  assert.doesNotMatch(expiryHandler, /still_active|current\.expiresAt/);
  assert.match(poller, /export async function pollNumberNow/);
  assert.match(assignedPage, /refetchInterval:[\s\S]*?4000/);
  assert.match(assignedPage, /Commande terminée — remboursement effectué/);
  const activationPoll = poller.slice(
    poller.indexOf("async function pollActivationOrder"),
    poller.indexOf("async function pollHostingOrder"),
  );
  assert.ok(
    activationPoll.indexOf("saveNewSmsMessages") < activationPoll.indexOf('order.status === "TIMEOUT"'),
    "terminal provider responses must save any included SMS before refund handling",
  );
});
