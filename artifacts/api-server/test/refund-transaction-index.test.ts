import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("only refund ledger rows are unique per virtual number", async () => {
  const schema = await readFile(
    new URL("../../../lib/db/src/schema/transactions.ts", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("../../../lib/db/drizzle/0025_refund_only_unique_number_link.sql", import.meta.url),
    "utf8",
  );
  const journal = JSON.parse(await readFile(
    new URL("../../../lib/db/drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  )) as { entries: Array<{ idx: number; tag: string }> };

  assert.match(schema, /\.where\(sql`[^`]*type[^`]*refund[^`]*virtualNumberId[^`]*IS NOT NULL/);
  assert.match(migration, /DROP INDEX IF EXISTS "idx_transactions_refund_virtual_number_unique"/);
  assert.match(migration, /CREATE UNIQUE INDEX "idx_transactions_refund_virtual_number_unique"[\s\S]*WHERE "type" = 'refund' AND "virtual_number_id" IS NOT NULL/);
  assert.deepEqual(journal.entries.at(-1), {
    idx: 25,
    version: "7",
    when: 1794686400000,
    tag: "0025_refund_only_unique_number_link",
    breakpoints: true,
  });
});
