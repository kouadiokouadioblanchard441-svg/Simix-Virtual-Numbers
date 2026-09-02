-- Migration 0021 : conserver les emails bloqués par quota/rate limit en attente

ALTER TABLE "email_queue"
  ADD COLUMN IF NOT EXISTS "retryable" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "eq_retryable_idx"
  ON "email_queue" ("next_retry_at")
  WHERE "status" = 'pending' AND "retryable" = true;