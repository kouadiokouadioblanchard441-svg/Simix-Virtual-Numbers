-- Migration 0017 : Système multi-fournisseurs email (providers, queue, send logs)

CREATE TABLE IF NOT EXISTS "email_providers" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"                text NOT NULL,
  "slug"                text NOT NULL UNIQUE,
  "priority"            integer NOT NULL DEFAULT 100,
  "active"              boolean NOT NULL DEFAULT false,
  "api_key_enc"         text,
  "api_secret_enc"      text,
  "domain"              text,
  "region"              text,
  "config"              jsonb,
  "health_status"       text NOT NULL DEFAULT 'unknown',
  "last_health_check"   timestamptz,
  "consecutive_errors"  integer NOT NULL DEFAULT 0,
  "total_sent"          integer NOT NULL DEFAULT 0,
  "total_failed"        integer NOT NULL DEFAULT 0,
  "last_error"          text,
  "last_error_at"       timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "email_queue" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key"   text NOT NULL UNIQUE,
  "to_email"          text NOT NULL,
  "from_email"        text NOT NULL,
  "subject"           text NOT NULL,
  "html"              text NOT NULL,
  "text_content"      text,
  "status"            text NOT NULL DEFAULT 'pending',
  "provider_id"       uuid REFERENCES "email_providers"("id") ON DELETE SET NULL,
  "attempts"          integer NOT NULL DEFAULT 0,
  "max_attempts"      integer NOT NULL DEFAULT 5,
  "next_retry_at"     timestamptz,
  "sent_at"           timestamptz,
  "error"             text,
  "metadata"          jsonb,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "email_send_logs" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "queue_id"      uuid REFERENCES "email_queue"("id") ON DELETE CASCADE,
  "provider_id"   uuid REFERENCES "email_providers"("id") ON DELETE SET NULL,
  "attempted_at"  timestamptz NOT NULL DEFAULT now(),
  "status"        text NOT NULL,
  "latency_ms"    integer,
  "response_id"   text,
  "error"         text,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ep_priority_active_idx"      ON "email_providers" ("priority") WHERE "active" = true;
CREATE INDEX IF NOT EXISTS "eq_status_retry_idx"         ON "email_queue" ("status", "next_retry_at") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "eq_idempotency_idx"          ON "email_queue" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "esl_queue_id_idx"            ON "email_send_logs" ("queue_id");
CREATE INDEX IF NOT EXISTS "esl_provider_id_idx"         ON "email_send_logs" ("provider_id");
CREATE INDEX IF NOT EXISTS "esl_attempted_at_idx"        ON "email_send_logs" ("attempted_at" DESC);
