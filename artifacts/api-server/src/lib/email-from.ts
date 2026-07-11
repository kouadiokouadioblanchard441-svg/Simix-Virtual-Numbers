/**
 * Utilitaire partagé — adresse expéditeur par défaut
 * Utilisé par email.ts ET admin-email-providers.ts
 */
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAppUrl } from "./app-url";

export async function getFromEmail(): Promise<string> {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  try {
    const rows = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "email_from")).limit(1);
    const val = rows[0]?.value?.trim();
    if (val) return val;
  } catch {
    /* DB non disponible — fallback */
  }
  const appUrl = getAppUrl();
  const domain = appUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return `Simix <noreply@${domain}>`;
}
