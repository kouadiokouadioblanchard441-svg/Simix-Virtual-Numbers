ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_balance" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_withdrawals" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"amount" integer NOT NULL,
"country_code" text NOT NULL,
"operator_slug" text NOT NULL,
"phone" text NOT NULL,
"status" text DEFAULT 'pending' NOT NULL,
"admin_note" text,
"processed_by" text,
"processed_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral_withdrawals" ADD CONSTRAINT "referral_withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_withdrawals_user_id_idx" ON "referral_withdrawals" ("user_id");
CREATE INDEX IF NOT EXISTS "referral_withdrawals_status_idx" ON "referral_withdrawals" ("status");
