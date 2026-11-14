CREATE TABLE IF NOT EXISTS "account_security" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pin_hash" text,
  "pin_failed_attempts" integer NOT NULL DEFAULT 0,
  "pin_locked_until" timestamp with time zone,
  "two_factor_enabled" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_two_factor_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_two_factor_challenges_user_created"
  ON "login_two_factor_challenges" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_two_factor_challenges_expires"
  ON "login_two_factor_challenges" ("expires_at");
