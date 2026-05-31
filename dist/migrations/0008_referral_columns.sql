ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" text UNIQUE;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referred_by" uuid;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_earnings" integer NOT NULL DEFAULT 0;
