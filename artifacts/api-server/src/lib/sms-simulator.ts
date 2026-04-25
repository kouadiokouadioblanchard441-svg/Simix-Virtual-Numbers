/**
 * Mock SMS provider. Schedules a realistic verification SMS to "arrive"
 * a few seconds after the number is requested. In production this would be
 * replaced with a real provider (e.g. PawaPay, SMS-Activate, etc.).
 */
import { db, smsMessagesTable, virtualNumbersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function scheduleSimulatedSms(
  numberId: string,
  serviceName: string,
): void {
  const delayMs = 8_000 + Math.floor(Math.random() * 12_000); // 8-20s
  setTimeout(() => {
    void deliverMessage(numberId, serviceName);
  }, delayMs);
}

async function deliverMessage(
  numberId: string,
  serviceName: string,
): Promise<void> {
  const [vn] = await db
    .select()
    .from(virtualNumbersTable)
    .where(eq(virtualNumbersTable.id, numberId))
    .limit(1);

  if (!vn) return;
  if (vn.status !== "waiting") return;
  if (vn.expiresAt.getTime() < Date.now()) return;

  const code = String(Math.floor(100_000 + Math.random() * 900_000));
  const sender = senderForService(serviceName);
  const body = bodyForService(serviceName, code);

  await db.insert(smsMessagesTable).values({
    numberId,
    sender,
    body,
    code,
  });

  await db
    .update(virtualNumbersTable)
    .set({ status: "received" })
    .where(eq(virtualNumbersTable.id, numberId));
}

function senderForService(name: string): string {
  const map: Record<string, string> = {
    WhatsApp: "WhatsApp",
    Telegram: "Telegram",
    Google: "Google",
    Facebook: "Facebook",
    Instagram: "Instagram",
    "Twitter / X": "X",
    TikTok: "TikTok",
  };
  return map[name] ?? name;
}

function bodyForService(name: string, code: string): string {
  if (name === "WhatsApp") {
    return `Votre code WhatsApp: ${code}. Ne le partagez avec personne. rJbA/XP1K+V`;
  }
  if (name === "Telegram") {
    return `Telegram code: ${code}. Login code: ${code}. Do not give this code to anyone.`;
  }
  if (name === "Google") {
    return `G-${code} est votre code de validation Google.`;
  }
  return `Votre code de vérification ${name}: ${code}`;
}
