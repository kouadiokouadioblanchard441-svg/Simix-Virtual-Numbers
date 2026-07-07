CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "full_name" text NOT NULL,
        "username" text,
        "phone" text,
        "email" text NOT NULL,
        "country" text,
        "country_code" text DEFAULT '+225' NOT NULL,
        "password_hash" text,
        "google_id" text,
        "auth_provider" text DEFAULT 'local' NOT NULL,
        "avatar" text,
        "balance" integer DEFAULT 0 NOT NULL,
        "verified" boolean DEFAULT false NOT NULL,
        "status" text DEFAULT 'Standard' NOT NULL,
        "blocked_reason" text,
        "risk_score" integer DEFAULT 0 NOT NULL,
        "is_admin" boolean DEFAULT false NOT NULL,
        "is_restricted" boolean DEFAULT false NOT NULL,
        "max_purchases_per_min" integer DEFAULT 10 NOT NULL,
        "max_balance" integer DEFAULT 500000 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "users_username_unique" UNIQUE("username"),
        CONSTRAINT "users_phone_unique" UNIQUE("phone"),
        CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "services" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "scope" text DEFAULT 'Global' NOT NULL,
        "price" integer NOT NULL,
        "provider_price" integer DEFAULT 0 NOT NULL,
        "margin" integer DEFAULT 20 NOT NULL,
        "available" integer DEFAULT 1000 NOT NULL,
        "color" text DEFAULT '#7C3AED' NOT NULL,
        "category" text DEFAULT 'Messagerie' NOT NULL,
        "popular" boolean DEFAULT false NOT NULL,
        "enabled" boolean DEFAULT true NOT NULL,
        "sort_order" integer DEFAULT 100 NOT NULL,
        CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "countries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "code" text NOT NULL,
        "dial_code" text NOT NULL,
        "flag" text NOT NULL,
        "available" integer DEFAULT 0 NOT NULL,
        "price" integer NOT NULL,
        "popular" boolean DEFAULT false NOT NULL,
        "sort_order" integer DEFAULT 100 NOT NULL,
        CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_methods" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "description" text NOT NULL,
        "color" text DEFAULT '#7C3AED' NOT NULL,
        "logo_url" text,
        "recommended" boolean DEFAULT false NOT NULL,
        "sort_order" integer DEFAULT 100 NOT NULL,
        CONSTRAINT "payment_methods_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "virtual_numbers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        "country_id" uuid NOT NULL,
        "phone_number" text NOT NULL,
        "status" text DEFAULT 'waiting' NOT NULL,
        "price" integer NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "sms_scheduled_at" timestamp with time zone,
        "external_order_id" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sms_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "number_id" uuid NOT NULL,
        "sender" text NOT NULL,
        "body" text NOT NULL,
        "code" text DEFAULT '' NOT NULL,
        "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "conversation_id" integer NOT NULL,
        "role" text NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "type" text NOT NULL,
        "amount" integer NOT NULL,
        "status" text DEFAULT 'completed' NOT NULL,
        "method" text,
        "description" text,
        "external_deposit_id" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" uuid NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid,
        "event_type" text NOT NULL,
        "severity" text DEFAULT 'low' NOT NULL,
        "ip" text,
        "user_agent" text,
        "details" jsonb,
        "risk_score" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_providers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "api_key" text DEFAULT '' NOT NULL,
        "base_url" text DEFAULT '' NOT NULL,
        "active" boolean DEFAULT false NOT NULL,
        "priority" integer DEFAULT 1 NOT NULL,
        "markup" integer DEFAULT 20 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "api_providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_settings" (
        "key" text PRIMARY KEY NOT NULL,
        "value" text NOT NULL,
        "description" text,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "admin_id" uuid,
        "action" text NOT NULL,
        "target_type" text,
        "target_id" text,
        "details" jsonb,
        "ip" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "country_payment_configs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "country_code" text NOT NULL,
        "method_slug" text NOT NULL,
        "enabled" boolean DEFAULT true NOT NULL,
        "min_deposit" integer DEFAULT 500 NOT NULL,
        "fee_percent" integer DEFAULT 0 NOT NULL,
        CONSTRAINT "country_payment_configs_country_code_method_slug_unique" UNIQUE("country_code","method_slug")
);
--> statement-breakpoint
ALTER TABLE "virtual_numbers" ADD CONSTRAINT "virtual_numbers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_numbers" ADD CONSTRAINT "virtual_numbers_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_numbers" ADD CONSTRAINT "virtual_numbers_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_number_id_virtual_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."virtual_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;