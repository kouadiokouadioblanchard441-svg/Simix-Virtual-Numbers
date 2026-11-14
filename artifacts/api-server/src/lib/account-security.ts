import bcrypt from "bcryptjs";
import { and, eq, isNull, lt } from "drizzle-orm";
import {
  accountSecurityTable,
  db,
  loginTwoFactorChallengesTable,
} from "@workspace/db";
import { randomInt } from "node:crypto";

const PIN_LENGTH = 6;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 5 * 60_000;
const TWO_FACTOR_CODE_TTL_MS = 10 * 60_000;
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const IS_REPLIT_DEV_ENVIRONMENT = Boolean(
  process.env["REPL_ID"] || process.env["REPLIT_DEV_DOMAIN"],
);

let warnedAboutMissingPreviewSchema = false;

function postgresErrorCode(error: unknown): string | undefined {
  const wrapped = error as { code?: string; cause?: { code?: string } } | null;
  return wrapped?.code ?? wrapped?.cause?.code;
}

function isMissingSecuritySchema(error: unknown): boolean {
  return postgresErrorCode(error) === "42P01";
}

function warnMissingPreviewSchema(): void {
  if (warnedAboutMissingPreviewSchema) return;
  warnedAboutMissingPreviewSchema = true;
  console.warn(
    "[security] Account security is unavailable in Replit preview until Plesk applies migration 0024; preview will not migrate the shared database.",
  );
}

export interface AccountSecurityStatus {
  available: boolean;
  pinEnabled: boolean;
  pinAttemptsRemaining: number;
  pinLockRemainingMs: number;
  twoFactorEnabled: boolean;
}

export async function getAccountSecurityStatus(
  userId: string,
): Promise<AccountSecurityStatus> {
  try {
    const [row] = await db
      .select()
      .from(accountSecurityTable)
      .where(eq(accountSecurityTable.userId, userId))
      .limit(1);

    return {
      available: true,
      pinEnabled: Boolean(row?.pinHash),
      pinAttemptsRemaining: Math.max(
        0,
        PIN_MAX_ATTEMPTS - (row?.pinFailedAttempts ?? 0),
      ),
      pinLockRemainingMs: row?.pinLockedUntil
        ? Math.max(0, row.pinLockedUntil.getTime() - Date.now())
        : 0,
      twoFactorEnabled: row?.twoFactorEnabled ?? false,
    };
  } catch (error) {
    if (IS_REPLIT_DEV_ENVIRONMENT && isMissingSecuritySchema(error)) {
      warnMissingPreviewSchema();
      return {
        available: false,
        pinEnabled: false,
        pinAttemptsRemaining: PIN_MAX_ATTEMPTS,
        pinLockRemainingMs: 0,
        twoFactorEnabled: false,
      };
    }
    throw error;
  }
}

async function ensureAccountSecurityRow(
  userId: string,
): Promise<boolean> {
  try {
    await db
      .insert(accountSecurityTable)
      .values({ userId })
      .onConflictDoNothing({ target: accountSecurityTable.userId });
    return true;
  } catch (error) {
    if (IS_REPLIT_DEV_ENVIRONMENT && isMissingSecuritySchema(error)) {
      warnMissingPreviewSchema();
      return false;
    }
    throw error;
  }
}

export async function setAccountPin(
  userId: string,
  pin: string,
): Promise<boolean> {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw new Error("Le PIN doit contenir exactement 6 chiffres.");
  }

  const pinHash = await bcrypt.hash(pin, 12);
  const available = await ensureAccountSecurityRow(userId);
  if (!available) return false;

  await db
    .update(accountSecurityTable)
    .set({
      pinHash,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(accountSecurityTable.userId, userId));
  return true;
}

export async function clearAccountPin(userId: string): Promise<boolean> {
  const available = await ensureAccountSecurityRow(userId);
  if (!available) return false;

  await db
    .update(accountSecurityTable)
    .set({
      pinHash: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(accountSecurityTable.userId, userId));
  return true;
}

export type PinVerificationResult =
  | { available: false }
  | { available: true; configured: false }
  | {
      available: true;
      configured: true;
      success: boolean;
      locked: boolean;
      attemptsRemaining: number;
      remainingMs: number;
    };

export async function verifyAccountPin(
  userId: string,
  pin: string,
): Promise<PinVerificationResult> {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw new Error("Le PIN doit contenir exactement 6 chiffres.");
  }

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(accountSecurityTable)
        .where(eq(accountSecurityTable.userId, userId))
        .for("update")
        .limit(1);

      if (!row?.pinHash) return { available: true, configured: false };

      const now = new Date();
      if (row.pinLockedUntil && row.pinLockedUntil.getTime() > now.getTime()) {
        return {
          available: true,
          configured: true,
          success: false,
          locked: true,
          attemptsRemaining: 0,
          remainingMs: row.pinLockedUntil.getTime() - now.getTime(),
        };
      }

      const failedAttempts =
        row.pinLockedUntil && row.pinLockedUntil.getTime() <= now.getTime()
          ? 0
          : row.pinFailedAttempts;

      if (await bcrypt.compare(pin, row.pinHash)) {
        await tx
          .update(accountSecurityTable)
          .set({
            pinFailedAttempts: 0,
            pinLockedUntil: null,
            updatedAt: now,
          })
          .where(eq(accountSecurityTable.userId, userId));
        return {
          available: true,
          configured: true,
          success: true,
          locked: false,
          attemptsRemaining: PIN_MAX_ATTEMPTS,
          remainingMs: 0,
        };
      }

      const nextAttempts = failedAttempts + 1;
      const locked = nextAttempts >= PIN_MAX_ATTEMPTS;
      const lockedUntil = locked
        ? new Date(now.getTime() + PIN_LOCKOUT_MS)
        : null;
      await tx
        .update(accountSecurityTable)
        .set({
          pinFailedAttempts: nextAttempts,
          pinLockedUntil: lockedUntil,
          updatedAt: now,
        })
        .where(eq(accountSecurityTable.userId, userId));

      return {
        available: true,
        configured: true,
        success: false,
        locked,
        attemptsRemaining: Math.max(0, PIN_MAX_ATTEMPTS - nextAttempts),
        remainingMs: locked ? PIN_LOCKOUT_MS : 0,
      };
    });
  } catch (error) {
    if (IS_REPLIT_DEV_ENVIRONMENT && isMissingSecuritySchema(error)) {
      warnMissingPreviewSchema();
      return { available: false };
    }
    throw error;
  }
}

export async function setAccountTwoFactor(
  userId: string,
  enabled: boolean,
): Promise<boolean> {
  const available = await ensureAccountSecurityRow(userId);
  if (!available) return false;

  await db
    .insert(accountSecurityTable)
    .values({ userId, twoFactorEnabled: enabled })
    .onConflictDoUpdate({
      target: accountSecurityTable.userId,
      set: { twoFactorEnabled: enabled, updatedAt: new Date() },
    });

  if (!enabled) {
    await db
      .update(loginTwoFactorChallengesTable)
      .set({ consumedAt: new Date() })
      .where(and(
        eq(loginTwoFactorChallengesTable.userId, userId),
        isNull(loginTwoFactorChallengesTable.consumedAt),
      ));
  }
  return true;
}

export async function createLoginTwoFactorChallenge(
  userId: string,
): Promise<{ challengeId: string; code: string } | null> {
  const code = String(randomInt(100_000, 1_000_000));
  const codeHash = await bcrypt.hash(code, 12);
  const now = new Date();

  const challengeId = await db.transaction(async (tx) => {
    const [settings] = await tx
      .select({ enabled: accountSecurityTable.twoFactorEnabled })
      .from(accountSecurityTable)
      .where(eq(accountSecurityTable.userId, userId))
      .for("update")
      .limit(1);
    if (!settings?.enabled) return null;

    await tx
      .delete(loginTwoFactorChallengesTable)
      .where(and(
        eq(loginTwoFactorChallengesTable.userId, userId),
        lt(
          loginTwoFactorChallengesTable.createdAt,
          new Date(now.getTime() - 24 * 60 * 60_000),
        ),
      ));

    await tx
      .update(loginTwoFactorChallengesTable)
      .set({ consumedAt: now })
      .where(and(
        eq(loginTwoFactorChallengesTable.userId, userId),
        isNull(loginTwoFactorChallengesTable.consumedAt),
      ));

    const [created] = await tx
      .insert(loginTwoFactorChallengesTable)
      .values({
        userId,
        codeHash,
        expiresAt: new Date(now.getTime() + TWO_FACTOR_CODE_TTL_MS),
      })
      .returning({ id: loginTwoFactorChallengesTable.id });

    return created?.id ?? null;
  });

  return challengeId ? { challengeId, code } : null;
}

export type LoginTwoFactorVerification =
  | { status: "missing" }
  | { status: "expired"; userId: string }
  | { status: "exhausted"; userId: string }
  | { status: "invalid"; userId: string; attemptsRemaining: number }
  | { status: "valid"; userId: string };

export async function verifyLoginTwoFactorChallenge(
  challengeId: string,
  code: string,
): Promise<LoginTwoFactorVerification> {
  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(loginTwoFactorChallengesTable)
      .where(eq(loginTwoFactorChallengesTable.id, challengeId))
      .for("update")
      .limit(1);

    if (!challenge || challenge.consumedAt) return { status: "missing" };
    if (challenge.expiresAt.getTime() <= Date.now()) {
      await tx
        .update(loginTwoFactorChallengesTable)
        .set({ consumedAt: new Date() })
        .where(eq(loginTwoFactorChallengesTable.id, challenge.id));
      return { status: "expired", userId: challenge.userId };
    }
    if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      return { status: "exhausted", userId: challenge.userId };
    }

    const matches = await bcrypt.compare(code, challenge.codeHash);
    if (!matches) {
      const attempts = challenge.attempts + 1;
      await tx
        .update(loginTwoFactorChallengesTable)
        .set({ attempts })
        .where(eq(loginTwoFactorChallengesTable.id, challenge.id));
      return attempts >= TWO_FACTOR_MAX_ATTEMPTS
        ? { status: "exhausted", userId: challenge.userId }
        : {
            status: "invalid",
            userId: challenge.userId,
            attemptsRemaining: TWO_FACTOR_MAX_ATTEMPTS - attempts,
          };
    }

    await tx
      .update(loginTwoFactorChallengesTable)
      .set({ consumedAt: new Date() })
      .where(eq(loginTwoFactorChallengesTable.id, challenge.id));
    return { status: "valid", userId: challenge.userId };
  });
}

export function maskEmailAddress(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export async function getLoginTwoFactorChallengeUserId(
  challengeId: string,
): Promise<string | null> {
  const [challenge] = await db
    .select({ userId: loginTwoFactorChallengesTable.userId })
    .from(loginTwoFactorChallengesTable)
    .where(eq(loginTwoFactorChallengesTable.id, challengeId))
    .limit(1);
  return challenge?.userId ?? null;
}
