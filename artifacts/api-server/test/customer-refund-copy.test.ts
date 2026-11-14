import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const customerPages = [
  "../../../artifacts/simix/src/pages/number-assigned.tsx",
  "../../../artifacts/simix/src/pages/number-details.tsx",
  "../../../artifacts/simix/src/pages/landing.tsx",
  "../../../artifacts/simix/src/pages/profile-aide-centre.tsx",
  "../../../artifacts/simix/src/pages/profile-aide.tsx",
  "../../../artifacts/simix/src/pages/legal/cgu.tsx",
  "../../../artifacts/simix/src/pages/profile-api-docs.tsx",
  "../../../artifacts/api-server/src/routes/support.ts",
];

test("customer help uses Simix branding and does not promise a fixed 20-minute expiry", async () => {
  const contents = await Promise.all(customerPages.map((path) =>
    readFile(new URL(path, import.meta.url), "utf8"),
  ));
  const combined = contents.join("\n");

  assert.doesNotMatch(combined, /5sim/i);
  assert.doesNotMatch(combined, /20 minutes|20 min|validityMinutes/i);
  assert.match(combined, /Simix confirme/i);
});
