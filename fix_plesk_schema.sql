-- ============================================================
-- Script de correction Simix — à exécuter sur la base Plesk
-- Ajoute toutes les colonnes/tables manquantes (idempotent)
-- ============================================================

-- ── Table users : colonnes manquantes ────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_provider" text NOT NULL DEFAULT 'local';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_reason" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "risk_score" integer NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_restricted" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "max_purchases_per_min" integer NOT NULL DEFAULT 10;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "max_balance" integer NOT NULL DEFAULT 500000;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referred_by" uuid;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_earnings" integer NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "api_key" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "webhook_url" text;

-- Contraintes UNIQUE (ignorées si elles existent déjà)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_google_id_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_referral_code_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_api_key_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_api_key_unique" UNIQUE("api_key");
  END IF;
END $$;

-- ── Table transactions : colonnes manquantes ─────────────────
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "gateway_meta" text;

-- ── Table countries : colonnes manquantes ────────────────────
ALTER TABLE "countries" ADD COLUMN IF NOT EXISTS "admin_price_modified" boolean NOT NULL DEFAULT false;

-- ── Table services : colonnes manquantes ─────────────────────
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "admin_price_modified" boolean NOT NULL DEFAULT false;

-- ── Tables manquantes ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "login_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "ip" text,
  "country" text,
  "city" text,
  "region" text,
  "isp" text,
  "user_agent" text,
  "device_type" text,
  "success" text DEFAULT 'true' NOT NULL,
  "fail_reason" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_otp" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "purpose" text DEFAULT 'email_verification' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "verified" boolean DEFAULT false NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ip_blacklist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "value" text NOT NULL,
  "reason" text DEFAULT 'Banni manuellement' NOT NULL,
  "banned_by" text,
  "permanent" boolean DEFAULT true NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "type" text DEFAULT 'info' NOT NULL,
  "icon" text,
  "link" text,
  "metadata" jsonb,
  "is_global" boolean DEFAULT false NOT NULL,
  "is_read" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "scheduled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notification_reads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" uuid NOT NULL REFERENCES "notifications"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL DEFAULT '',
  "label" text DEFAULT '' NOT NULL,
  "group" text DEFAULT 'general' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "banners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "image_data" text,
  "image_url" text,
  "link_url" text,
  "link_label" text,
  "bg_from" text DEFAULT '#7C3AED' NOT NULL,
  "bg_to" text DEFAULT '#4C1D95' NOT NULL,
  "text_color" text DEFAULT '#FFFFFF' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "support_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" text NOT NULL UNIQUE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "language" text DEFAULT 'fr' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "user_name" text,
  "user_email" text,
  "is_human_takeover" boolean DEFAULT false NOT NULL,
  "agent_note" text,
  "priority" text DEFAULT 'normal' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "support_conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "image_data" text,
  "metadata" jsonb,
  "sent_by_admin" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subject" text NOT NULL,
  "html_content" text NOT NULL,
  "text_content" text,
  "template_type" text DEFAULT 'custom' NOT NULL,
  "recipients_type" text DEFAULT 'all' NOT NULL,
  "recipient_ids" jsonb,
  "status" text DEFAULT 'pending' NOT NULL,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "total_recipients" integer DEFAULT 0 NOT NULL,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid REFERENCES "email_campaigns"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "email" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "error" text,
  "message_id" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ── Mettre à jour username pour les utilisateurs existants ───
UPDATE "users"
SET "username" = 'user_' || right(regexp_replace(COALESCE("phone", "email", id::text), '[^0-9]', '', 'g'), 6)
WHERE "username" IS NULL;

-- ── Mettre à jour referral_code pour les utilisateurs existants ─
UPDATE "users"
SET "referral_code" = 'SX' || upper(substring(md5(random()::text), 1, 8))
WHERE "referral_code" IS NULL;

-- ── Mettre à jour api_key pour les utilisateurs existants ────
UPDATE "users"
SET "api_key" = 'simix_' || md5(random()::text) || md5(id::text)
WHERE "api_key" IS NULL;

-- ── email_verified : marquer les comptes existants comme vérifiés ─
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false AND "verified" = true;

-- ── Fin du script ────────────────────────────────────────────
SELECT 'Schema Plesk corrigé avec succès ✓' AS resultat;
