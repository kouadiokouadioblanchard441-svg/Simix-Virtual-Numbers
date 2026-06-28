ALTER TABLE "countries" ADD COLUMN IF NOT EXISTS "admin_price_modified" boolean NOT NULL DEFAULT false;
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "admin_price_modified" boolean NOT NULL DEFAULT false;
