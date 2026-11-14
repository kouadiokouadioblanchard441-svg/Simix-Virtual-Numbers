import { randomInt } from "node:crypto";
import { eq, and, gt, desc } from "drizzle-orm";
import { db, emailOtpTable, usersTable } from "@workspace/db";

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
export const INACTIVITY_DAYS = 10;

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

export async function createOtp(
  userId: string,
  purpose: "email_verification" | "inactivity_check" | "password_reset",
): Promise<{ code: string; issuanceId: string }> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  const [created] = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update")
      .limit(1);
    if (!user) throw new Error("Cannot issue OTP for an unknown user");

    await tx
      .update(emailOtpTable)
      .set({ verified: true })
      .where(
        and(
          eq(emailOtpTable.userId, userId),
          eq(emailOtpTable.purpose, purpose),
          eq(emailOtpTable.verified, false),
        ),
      );

    return tx.insert(emailOtpTable).values({
      userId,
      code,
      purpose,
      attempts: 0,
      verified: false,
      expiresAt,
    }).returning({ id: emailOtpTable.id });
  });

  return { code, issuanceId: created.id };
}

export async function verifyOtp(
  userId: string,
  code: string,
  purpose: "email_verification" | "inactivity_check" | "password_reset",
): Promise<{ success: boolean; error?: string }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update")
      .limit(1);
    if (!user) {
      return { success: false, error: "Code expiré ou introuvable. Demandez un nouveau code." };
    }

    const [otp] = await tx
      .select()
      .from(emailOtpTable)
      .where(
        and(
          eq(emailOtpTable.userId, userId),
          eq(emailOtpTable.purpose, purpose),
          eq(emailOtpTable.verified, false),
          gt(emailOtpTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(emailOtpTable.createdAt))
      .limit(1)
      .for("update");

    if (!otp) {
      return { success: false, error: "Code expiré ou introuvable. Demandez un nouveau code." };
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      return { success: false, error: "Trop de tentatives. Demandez un nouveau code." };
    }

    const attempts = otp.attempts + 1;
    await tx
      .update(emailOtpTable)
      .set({ attempts })
      .where(eq(emailOtpTable.id, otp.id));

    if (otp.code !== code) {
      const remaining = MAX_ATTEMPTS - attempts;
      return {
        success: false,
        error:
          remaining > 0
            ? `Code incorrect. Il vous reste ${remaining} tentative${remaining > 1 ? "s" : ""}.`
            : "Trop de tentatives. Demandez un nouveau code.",
      };
    }

    await tx
      .update(emailOtpTable)
      .set({ verified: true })
      .where(eq(emailOtpTable.id, otp.id));

    return { success: true };
  });
}

export function isVerifiedActiveOtp(
  otp: Pick<typeof emailOtpTable.$inferSelect, "code" | "verified" | "expiresAt"> | undefined,
  code: string,
  now = new Date(),
): boolean {
  return Boolean(
    otp
    && otp.verified
    && otp.code === code
    && otp.expiresAt.getTime() > now.getTime(),
  );
}

export async function hasRecentOtp(
  userId: string,
  purpose: "email_verification" | "inactivity_check" | "password_reset",
  cooldownSeconds = 60,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
  const [recent] = await db
    .select()
    .from(emailOtpTable)
    .where(
      and(
        eq(emailOtpTable.userId, userId),
        eq(emailOtpTable.purpose, purpose),
        gt(emailOtpTable.createdAt, cutoff),
      ),
    )
    .limit(1);
  return !!recent;
}

export function isUserInactive(lastLoginAt: Date | null): boolean {
  if (!lastLoginAt) return true;
  const diffMs = Date.now() - lastLoginAt.getTime();
  return diffMs >= INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
}
