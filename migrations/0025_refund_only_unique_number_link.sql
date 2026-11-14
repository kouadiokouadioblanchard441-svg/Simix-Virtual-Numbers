DROP INDEX IF EXISTS "idx_transactions_refund_virtual_number_unique";

CREATE UNIQUE INDEX "idx_transactions_refund_virtual_number_unique"
  ON "transactions" ("virtual_number_id")
  WHERE "type" = 'refund' AND "virtual_number_id" IS NOT NULL;
