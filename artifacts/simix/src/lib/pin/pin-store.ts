/**
 * PIN storage — manages all localStorage / sessionStorage keys for the PIN system.
 * Keys are scoped per userId so multi-account devices work correctly.
 */
import { createPinHash, verifyPinHash } from "./pin-crypto";

// ── Key helpers ─────────────────────────────────────────────────────────────
const K = {
  hash: (id: string) => `simix_pin_hash_${id}`,
  salt: (id: string) => `simix_pin_salt_${id}`,
  attempts: (id: string) => `simix_pin_attempts_${id}`,
  user: () => "simix_pin_user",
  lastActive: () => "simix_pin_last_active",
  unlocked: () => "simix_pin_unlocked", // sessionStorage — cleared on app close
};

// ── Types ────────────────────────────────────────────────────────────────────
export interface PinUser {
  id: string;
  fullName: string;
  email: string;
}

interface AttemptRecord {
  count: number;
  lockedUntil: number; // ms timestamp
}

// ── Constants ────────────────────────────────────────────────────────────────
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
export const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── PIN setup ────────────────────────────────────────────────────────────────
export function hasPinSetup(userId: string): boolean {
  try {
    return !!(
      localStorage.getItem(K.hash(userId)) && localStorage.getItem(K.salt(userId))
    );
  } catch {
    return false;
  }
}

export async function savePin(userId: string, pin: string): Promise<void> {
  const { hash, salt } = await createPinHash(pin);
  localStorage.setItem(K.hash(userId), hash);
  localStorage.setItem(K.salt(userId), salt);
  clearAttempts(userId);
}

export async function checkPin(userId: string, pin: string): Promise<boolean> {
  try {
    const hash = localStorage.getItem(K.hash(userId));
    const salt = localStorage.getItem(K.salt(userId));
    if (!hash || !salt) return false;
    return verifyPinHash(pin, hash, salt);
  } catch {
    return false;
  }
}

export function clearPin(userId: string): void {
  localStorage.removeItem(K.hash(userId));
  localStorage.removeItem(K.salt(userId));
  clearAttempts(userId);
}

// ── User cache ───────────────────────────────────────────────────────────────
export function savePinUser(user: PinUser): void {
  try {
    localStorage.setItem(K.user(), JSON.stringify(user));
  } catch { /* ignore quota errors */ }
}

export function getPinUser(): PinUser | null {
  try {
    const raw = localStorage.getItem(K.user());
    return raw ? (JSON.parse(raw) as PinUser) : null;
  } catch {
    return null;
  }
}

export function clearPinUser(): void {
  try {
    localStorage.removeItem(K.user());
  } catch { /* ignore */ }
}

// ── Session / activity tracking ──────────────────────────────────────────────
export function updateLastActive(): void {
  try {
    localStorage.setItem(K.lastActive(), Date.now().toString());
  } catch { /* ignore */ }
}

/**
 * Clear the last-active timestamp so that isLocalSessionExpired() returns false
 * on the next check. Call this when the session expires so that after a fresh
 * login the user is taken to the PIN screen instead of looping back to /login.
 */
export function clearLastActive(): void {
  try {
    localStorage.removeItem(K.lastActive());
  } catch { /* ignore */ }
}

export function isLocalSessionExpired(): boolean {
  try {
    const ts = localStorage.getItem(K.lastActive());
    if (!ts) return false; // no timestamp → treated as fresh session
    return Date.now() - parseInt(ts, 10) > SESSION_EXPIRY_MS;
  } catch {
    return false;
  }
}

// ── Unlock state (sessionStorage — survives hot-reload, cleared on app close) ─
export function markUnlocked(): void {
  try {
    sessionStorage.setItem(K.unlocked(), "true");
    updateLastActive();
  } catch { /* ignore */ }
}

export function clearUnlocked(): void {
  try {
    sessionStorage.removeItem(K.unlocked());
  } catch { /* ignore */ }
}

export function isUnlockedThisSession(): boolean {
  try {
    return sessionStorage.getItem(K.unlocked()) === "true";
  } catch {
    return false;
  }
}

// ── Brute-force protection ───────────────────────────────────────────────────
function getAttempts(userId: string): AttemptRecord {
  try {
    const raw = localStorage.getItem(K.attempts(userId));
    return raw ? (JSON.parse(raw) as AttemptRecord) : { count: 0, lockedUntil: 0 };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function setAttempts(userId: string, record: AttemptRecord): void {
  try {
    localStorage.setItem(K.attempts(userId), JSON.stringify(record));
  } catch { /* ignore */ }
}

export function clearAttempts(userId: string): void {
  try {
    localStorage.removeItem(K.attempts(userId));
  } catch { /* ignore */ }
}

export interface LockoutStatus {
  locked: boolean;
  remainingMs: number;
  failedCount: number;
}

export function getLockoutStatus(userId: string): LockoutStatus {
  const rec = getAttempts(userId);

  // Expired lockout — auto-reset
  if (rec.lockedUntil > 0 && rec.lockedUntil <= Date.now()) {
    clearAttempts(userId);
    return { locked: false, remainingMs: 0, failedCount: 0 };
  }

  if (rec.lockedUntil > Date.now()) {
    return { locked: true, remainingMs: rec.lockedUntil - Date.now(), failedCount: rec.count };
  }

  return { locked: false, remainingMs: 0, failedCount: rec.count };
}

export function recordFailedAttempt(userId: string): LockoutStatus {
  const rec = getAttempts(userId);
  const count = rec.count + 1;
  const shouldLock = count >= MAX_ATTEMPTS;
  const lockedUntil = shouldLock ? Date.now() + LOCKOUT_MS : rec.lockedUntil;

  setAttempts(userId, { count, lockedUntil });

  return {
    locked: shouldLock,
    remainingMs: shouldLock ? LOCKOUT_MS : 0,
    failedCount: count,
  };
}

export function resetFailedAttempts(userId: string): void {
  clearAttempts(userId);
}
