/**
 * In-memory sliding-window rate limiter.
 * No external dependencies — works per process instance.
 */

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

/** Cleans old timestamps every 5 min to avoid memory leaks */
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
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
