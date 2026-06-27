import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { logger } from "./logger";

export async function seedDemoUser(): Promise<void> {
  try {
    const phone = "+2250701234567";
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);

    if (existing) {
      await db
        .update(usersTable)
        .set({ isAdmin: true, emailVerified: true, lastLoginAt: new Date() })
        .where(eq(usersTable.id, existing.id));
      logger.info("[seed-demo] Demo user already exists — ensured admin + emailVerified");
      return;
    }

    const passwordHash = await bcrypt.hash("simix2026", 10);
    const [user] = await db
      .insert(usersTable)
      .values({
        fullName: "Kouassi David",
        phone,
        countryCode: "+225",
        username: "kouassi_david",
        email: "kouassidavid@gmail.com",
        passwordHash,
        balance: 12_450,
        verified: true,
        emailVerified: true,
        lastLoginAt: new Date(),
        status: "Standard",
        isAdmin: true,
      })
      .returning();

    if (!user) return;

    const seedTx = [
      { type: "recharge" as const, amount: 5000, method: "Orange Money", description: "Recharge Orange Money" },
      { type: "purchase" as const, amount: 150, method: "wallet", description: "Numéro WhatsApp - Côte d'Ivoire" },
      { type: "recharge" as const, amount: 10000, method: "MTN Mobile Money", description: "Recharge MTN" },
    ];

    for (const t of seedTx) {
      await db.insert(transactionsTable).values({
        userId: user.id,
        type: t.type,
        amount: t.amount,
        status: "completed",
        method: t.method,
        description: t.description,
      });
    }

    logger.info("[seed-demo] Demo user created ✓");
  } catch (err) {
    logger.warn({ err }, "[seed-demo] Demo user seed failed (non-blocking)");
  }
}
