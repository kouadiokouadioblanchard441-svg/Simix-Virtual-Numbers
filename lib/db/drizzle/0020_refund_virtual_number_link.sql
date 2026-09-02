ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "virtual_number_id" uuid;

DO $$ BEGIN
  ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_virtual_number_id_virtual_numbers_id_fk"
    FOREIGN KEY ("virtual_number_id")
    REFERENCES "public"."virtual_numbers"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_transactions_refund_virtual_number_unique"
  ON "transactions" USING btree ("virtual_number_id");