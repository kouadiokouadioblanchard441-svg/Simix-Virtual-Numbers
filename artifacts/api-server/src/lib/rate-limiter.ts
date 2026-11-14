/**
 * In-memory sliding-window rate limiter.
 * No external dependencies — works per process instance.
 */

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();
const temporaryLocks = new Map<string, number>();

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
