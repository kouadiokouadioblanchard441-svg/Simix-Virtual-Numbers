CREATE TABLE IF NOT EXISTS "security_rate_limits" (
  "key_hash" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "hit_count" integer NOT NULL DEFAULT 0,
  "locked_until" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_security_rate_limits_updated_at"
  ON "security_rate_limits" ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_access_logs_logout_jti"
  ON "admin_access_logs" (("details"->>'jti'))
  WHERE "action" = 'logout';
