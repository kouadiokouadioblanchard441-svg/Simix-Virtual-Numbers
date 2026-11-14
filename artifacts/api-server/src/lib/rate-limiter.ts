/**
 * In-memory sliding-window rate limiter.
 * No external dependencies — works per process instance.
 *
 * Durable variants below are used for authentication, sensitive uploads, and
 * other controls that must survive process restarts and multiple Plesk workers.
 */
import { createHmac } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, securityRateLimitsTable } from "@workspace/db";

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();
const temporaryLocks = new Map<string, number>();
let lastPersistentCleanupAt = 0;
let warnedAboutPreviewFallback = false;
const PERSISTENT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PERSISTENT_ENTRY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const IS_REPLIT_DEV_ENVIRONMENT = Boolean(
  process.env["REPL_ID"] || process.env["REPLIT_DEV_DOMAIN"],
);

function usePreviewRateLimitFallback(): boolean {
  if (!IS_REPLIT_DEV_ENVIRONMENT) return false;
  if (!warnedAboutPreviewFallback) {
    warnedAboutPreviewFallback = true;
    console.warn(
      "[security] Replit preview uses in-memory limits because it must not migrate the Plesk-shared database; Plesk applies durable limits after migration 0023.",
    );
  }
  return true;
}

function previewCounterKey(key: string): string {
  return `replit-preview:${key}`;
}

/** Cleans old timestamps every 5 min to avoid memory leaks */
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
  for (const [key, lockedUntil] of temporaryLocks) {
    if (lockedUntil <= Date.now()) temporaryLocks.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Returns true if the key has exceeded the limit within windowMs.
 * Records the hit regardless.
 */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const entry = store.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
  entry.timestamps.push(now);
  store.set(key, entry);
  return entry.timestamps.length > limit;
}

/**
 * Returns the number of hits in the window without recording a new one.
 */
export function getHitCount(key: string, windowMs: number): number {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) return 0;
  return entry.timestamps.filter((t) => t > now - windowMs).length;
}

/** Removes all hits for a key (e.g. successful login resets brute-force counter) */
export function resetKey(key: string): void {
  store.delete(key);
}

/** Starts a temporary lockout for the supplied key. */
export function setTemporaryLock(key: string, durationMs: number): void {
  if (durationMs <= 0) {
    temporaryLocks.delete(key);
    return;
  }
  temporaryLocks.set(key, Date.now() + durationMs);
}

/** Returns the remaining lock time in milliseconds and clears expired locks. */
export function getTemporaryLockRemaining(key: string): number {
  const lockedUntil = temporaryLocks.get(key);
  if (lockedUntil === undefined) return 0;
  const remaining = lockedUntil - Date.now();
  if (remaining <= 0) {
    temporaryLocks.delete(key);
    return 0;
  }
  return remaining;
}

export function resetTemporaryLock(key: string): void {
  temporaryLocks.delete(key);
}

/**
 * Records a failed authentication attempt and starts a timed lock after the
 * configured number of failures within the window.
 */
export function recordFailedAttemptAndLock(
  attemptsKey: string,
  lockKey: string,
  maxFailedAttempts: number,
  lockDurationMs: number,
): boolean {
  if (!isRateLimited(attemptsKey, maxFailedAttempts, lockDurationMs)) return false;
  setTemporaryLock(lockKey, lockDurationMs);
  resetKey(attemptsKey);
  return true;
}

function hashPersistentKey(key: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for persistent rate limiting");
  }
  return createHmac("sha256", secret)
    .update("simix-security-rate-limit-v1:")
    .update(key)
    .digest("hex");
}

async function prunePersistentRateLimitRows(): Promise<void> {
  const now = Date.now();
  if (now - lastPersistentCleanupAt < PERSISTENT_CLEANUP_INTERVAL_MS) return;
  lastPersistentCleanupAt = now;

  try {
    await db.delete(securityRateLimitsTable).where(
      lt(
        securityRateLimitsTable.updatedAt,
        new Date(now - PERSISTENT_ENTRY_RETENTION_MS),
      ),
    );
  } catch {
    /* Cleanup is best-effort; rate-limit operations remain fail-closed. */
  }
}

/** Atomically records a hit in the shared database and returns limit status. */
export async function isPersistentRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (!Number.isInteger(limit) || limit < 0 || !Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Invalid persistent rate limit configuration");
  }
  if (usePreviewRateLimitFallback()) {
    return isRateLimited(previewCounterKey(key), limit, windowMs);
  }
  await prunePersistentRateLimitRows();

  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const keyHash = hashPersistentKey(key);
  const [entry] = await db
    .insert(securityRateLimitsTable)
    .values({
      keyHash,
      windowStartedAt: now,
      hitCount: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: securityRateLimitsTable.keyHash,
      set: {
        windowStartedAt: sql`CASE
          WHEN ${securityRateLimitsTable.windowStartedAt} <= ${cutoff}
          THEN ${now}
          ELSE ${securityRateLimitsTable.windowStartedAt}
        END`,
        hitCount: sql`CASE
          WHEN ${securityRateLimitsTable.windowStartedAt} <= ${cutoff}
          THEN 1
          WHEN ${securityRateLimitsTable.hitCount} > ${limit}
          THEN ${securityRateLimitsTable.hitCount}
          ELSE ${securityRateLimitsTable.hitCount} + 1
        END`,
        updatedAt: now,
      },
    })
    .returning({ hitCount: securityRateLimitsTable.hitCount });

  return (entry?.hitCount ?? limit + 1) > limit;
}

/** Returns the shared hit count without recording another attempt. */
export async function getPersistentHitCount(
  key: string,
  windowMs: number,
): Promise<number> {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Invalid persistent rate limit window");
  }
  if (usePreviewRateLimitFallback()) {
    return getHitCount(previewCounterKey(key), windowMs);
  }
  const [entry] = await db
    .select({ hitCount: securityRateLimitsTable.hitCount })
    .from(securityRateLimitsTable)
    .where(and(
      eq(securityRateLimitsTable.keyHash, hashPersistentKey(key)),
      gt(securityRateLimitsTable.windowStartedAt, new Date(Date.now() - windowMs)),
    ))
    .limit(1);
  return entry?.hitCount ?? 0;
}

/** Clears a shared counter, for example after a successful login. */
export async function resetPersistentKey(key: string): Promise<void> {
  if (usePreviewRateLimitFallback()) {
    resetKey(previewCounterKey(key));
    return;
  }
  await db
    .delete(securityRateLimitsTable)
    .where(eq(securityRateLimitsTable.keyHash, hashPersistentKey(key)));
}

/** Starts a lock that remains active across workers and restarts. */
export async function setPersistentTemporaryLock(
  key: string,
  durationMs: number,
): Promise<void> {
  if (usePreviewRateLimitFallback()) {
    setTemporaryLock(previewCounterKey(key), durationMs);
    return;
  }
  const keyHash = hashPersistentKey(key);
  if (durationMs <= 0) {
    await resetPersistentTemporaryLock(key);
    return;
  }
  const now = new Date();
  await db
    .insert(securityRateLimitsTable)
    .values({
      keyHash,
      windowStartedAt: now,
      hitCount: 0,
      lockedUntil: new Date(now.getTime() + durationMs),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: securityRateLimitsTable.keyHash,
      set: {
        lockedUntil: new Date(now.getTime() + durationMs),
        updatedAt: now,
      },
    });
}

/** Returns the durable lock time remaining, or zero when unlocked. */
export async function getPersistentTemporaryLockRemaining(key: string): Promise<number> {
  if (usePreviewRateLimitFallback()) {
    return getTemporaryLockRemaining(previewCounterKey(key));
  }
  const [entry] = await db
    .select({ lockedUntil: securityRateLimitsTable.lockedUntil })
    .from(securityRateLimitsTable)
    .where(eq(securityRateLimitsTable.keyHash, hashPersistentKey(key)))
    .limit(1);
  return entry?.lockedUntil
    ? Math.max(0, entry.lockedUntil.getTime() - Date.now())
    : 0;
}

export async function resetPersistentTemporaryLock(key: string): Promise<void> {
  if (usePreviewRateLimitFallback()) {
    resetTemporaryLock(previewCounterKey(key));
    return;
  }
  await db
    .update(securityRateLimitsTable)
    .set({ lockedUntil: null, updatedAt: new Date() })
    .where(eq(securityRateLimitsTable.keyHash, hashPersistentKey(key)));
}

/** Persists a failed-authentication counter and starts a durable lock at threshold. */
export async function recordPersistentFailedAttemptAndLock(
  attemptsKey: string,
  lockKey: string,
  maxFailedAttempts: number,
  lockDurationMs: number,
): Promise<boolean> {
  const reachedLimit = await isPersistentRateLimited(
    attemptsKey,
    maxFailedAttempts,
    lockDurationMs,
  );
  if (!reachedLimit) return false;

  await setPersistentTemporaryLock(lockKey, lockDurationMs);
  await resetPersistentKey(attemptsKey);
  return true;
}
