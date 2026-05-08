import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error("SUPABASE_DATABASE_URL must be set. Supabase is the primary database.");
}

function buildCleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const user = encodeURIComponent(decodeURIComponent(parsed.username));
    const pass = encodeURIComponent(decodeURIComponent(parsed.password));
    return `${parsed.protocol}//${user}:${pass}@${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: buildCleanUrl(process.env.SUPABASE_DATABASE_URL),
  },
});
