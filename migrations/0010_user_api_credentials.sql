ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "api_key" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "webhook_url" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_api_key_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_api_key_unique" UNIQUE("api_key");
  END IF;
END$$;

UPDATE "users"
SET "api_key" = 'simix_' || md5(random()::text) || md5(id::text)
WHERE "api_key" IS NULL;
