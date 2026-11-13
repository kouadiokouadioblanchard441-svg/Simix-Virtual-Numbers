import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { getNumberValidityMinutes } from "../src/lib/settings";

test("activation number validity is fixed at 20 minutes", async () => {
  assert.equal(await getNumberValidityMinutes(), 20);
});

test("customer and administrator cancellation endpoints are disabled", async () => {
  const numbersRoute = await readFile(new URL("../src/routes/numbers.ts", import.meta.url), "utf8");
  const adminRoute = await readFile(new URL("../src/routes/admin.ts", import.meta.url), "utf8");

  assert.doesNotMatch(numbersRoute, /router\.post\("\/numbers\/:numberId\/cancel"/);
  assert.match(adminRoute, /router\.post\("\/admin\/orders\/:orderId\/cancel"[\s\S]*?res\.status\(410\)/);
  assert.doesNotMatch(numbersRoute, /Order cancelled by user/);
  assert.doesNotMatch(adminRoute, /Commande annulée et remboursée/);
});
