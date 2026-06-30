ALTER TABLE "service_prices" ADD COLUMN IF NOT EXISTS "admin_modified" boolean DEFAULT false NOT NULL;
