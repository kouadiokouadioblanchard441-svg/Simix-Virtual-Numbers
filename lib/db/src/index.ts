import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    "DATABASE_URL must be set.",
  );
}

function parseDbUrl(url: string): pg.PoolConfig {
  try {
    const parsed = new URL(url);
    const ssl = parsed.searchParams.get("ssl") === "true" || parsed.searchParams.get("sslmode") === "require"
      ? { rejectUnauthorized: false }
      : parsed.hostname.includes("supabase")
        ? { rejectUnauthorized: false }
        : false;
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 5432,
      database: parsed.pathname.replace(/^\//, ""),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      ssl,
    };
  } catch {
    return { connectionString: url };
  }
}

export const pool = new Pool({
  ...parseDbUrl(dbUrl),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
