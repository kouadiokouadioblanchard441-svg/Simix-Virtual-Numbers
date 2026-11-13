import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("admin provisioning requires a secret and never overwrites or logs account data", async () => {
  const script = await readFile(
    new URL("../../../lib/db/scripts/create-admin.mjs", import.meta.url),
    "utf8",
  );

  assert.match(script, /process\.env\.ADMIN_INITIAL_PASSWORD/);
  assert.match(script, /PASSWORD\.length < 16/);
  assert.doesNotMatch(script, /DELETE\s+FROM\s+users/i);
  assert.doesNotMatch(script, /console\.log\([^)]*PASSWORD/i);
  assert.doesNotMatch(script, /JSON\.stringify\(rows/);
});
