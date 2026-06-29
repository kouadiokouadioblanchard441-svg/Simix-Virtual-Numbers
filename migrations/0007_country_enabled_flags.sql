-- Add enabled (registration + deposit) and numbers_enabled (5sim) flags to countries
ALTER TABLE "countries" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "countries" ADD COLUMN IF NOT EXISTS "numbers_enabled" boolean DEFAULT true NOT NULL;
