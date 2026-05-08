import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set. Supabase is the primary database for this application.",
  );
}

export const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
