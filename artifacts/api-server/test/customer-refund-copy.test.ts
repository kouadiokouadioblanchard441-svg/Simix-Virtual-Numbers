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
];

test("customer refund pages use Simix branding, not the provider name", async () => {
  const contents = await Promise.all(customerPages.map((path) =>
    readFile(new URL(path, import.meta.url), "utf8"),
  ));
  const combined = contents.join("\n");

  assert.doesNotMatch(combined, /5sim/i);
  assert.match(combined, /Simix confirme/i);
});
