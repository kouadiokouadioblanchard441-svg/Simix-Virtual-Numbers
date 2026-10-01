CREATE TABLE IF NOT EXISTS "payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "gateway" text NOT NULL,
  "external_id" text NOT NULL,
  "signature" text,
  "gateway_config_id" uuid,
  "referral_withdrawal_id" uuid,
  "actor_id" text NOT NULL,
  "phone" text NOT NULL,
  "provider" text NOT NULL,
  "country" text NOT NULL,
  "currency" text NOT NULL,
  "amount" numeric(20, 3) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "failure_reason" text,
  "initiation_claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_idempotency_key_uidx" ON "payouts" ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_referral_withdrawal_uidx" ON "payouts" ("referral_withdrawal_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_external_id_uidx" ON "payouts" ("gateway", "external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_status_created_idx" ON "payouts" ("status", "created_at");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payouts" ADD CONSTRAINT "payouts_referral_withdrawal_id_fk"
    FOREIGN KEY ("referral_withdrawal_id") REFERENCES "public"."referral_withdrawals"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;