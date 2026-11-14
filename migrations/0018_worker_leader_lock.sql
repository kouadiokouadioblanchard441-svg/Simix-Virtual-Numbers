-- Migration 0018 : Verrou d'élection de leader pour les workers background
-- Empêche plusieurs processus (previews Replit, artifact api-server, prod Plesk…)
-- de faire tourner en double les jobs périodiques (5sim poller, retry email,
-- réconciliation Clapay/PawaPay) contre la même base.

CREATE TABLE IF NOT EXISTS "worker_leader_lock" (
  "id"          smallint PRIMARY KEY,
  "holder_id"   text NOT NULL DEFAULT '',
  "lease_until" timestamptz NOT NULL,
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Seed la ligne unique (id=1) avec un bail déjà expiré — le premier
-- processus qui démarre devient immédiatement leader.
INSERT INTO "worker_leader_lock" ("id", "holder_id", "lease_until")
VALUES (1, '', 'epoch'::timestamptz)
ON CONFLICT ("id") DO NOTHING;
