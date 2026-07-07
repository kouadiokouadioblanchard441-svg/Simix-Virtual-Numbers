CREATE TABLE IF NOT EXISTS "service_country_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "service_slug" text NOT NULL,
  "country_code" text NOT NULL,
  "available" integer DEFAULT 0 NOT NULL,
  "provider_price_fcfa" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "sca_service_country_unique" UNIQUE("service_slug","country_code")
);
