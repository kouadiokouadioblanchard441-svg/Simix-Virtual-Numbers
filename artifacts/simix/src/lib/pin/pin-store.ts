const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const UNLOCKED_KEY = (userId: string) => `simix_pin_unlock_v2_${userId}`;

export interface PinUser {
  id: string;
  fullName?: string;
  email?: string;
}

export interface PinSettings {
  available: boolean;
  pinEnabled: boolean;
  pinAttemptsRemaining: number;
  pinLockRemainingMs: number;
  twoFactorEnabled: boolean;
  emailVerified?: boolean;
  canUseTwoFactor?: boolean;
}

export interface PinVerificationResult {
  success: boolean;
  locked: boolean;
  attemptsRemaining: number;
  remainingMs: number;
  error?: string;
}

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60 * 1000;

async function securityRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${BASE}/api/auth/me${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    [key: string]: unknown;
  };
  if (!response.ok) {
    throw new Error(result.error ?? "Impossible de vérifier la sécurité du compte.");
  }
  return result as T;
}

export function getPinSettings(): Promise<PinSettings> {
  return securityRequest("GET", "/security");
}

export async function savePin(_userId: string, pin: string): Promise<void> {
  await securityRequest("PUT", "/pin", { pin });
}

export async function checkPin(
  _userId: string,
  pin: string,
): Promise<PinVerificationResult> {
  const response = await fetch(`${BASE}/api/auth/me/pin/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  const result = await response.json().catch(() => ({})) as {
    success?: boolean;
    locked?: boolean;
    attemptsRemaining?: number;
    remainingMs?: number;
    error?: string;
  };

  if (response.status === 401 || response.status === 429) {
    return {
      success: false,
      locked: result.locked ?? response.status === 429,
      attemptsRemaining: result.attemptsRemaining ?? 0,
      remainingMs: result.remainingMs ?? 0,
      error: result.error,
    };
  }
  if (!response.ok) {
    throw new Error(result.error ?? "Impossible de vérifier le PIN.");
  }
  return {
    success: true,
    locked: false,
    attemptsRemaining: result.attemptsRemaining ?? MAX_ATTEMPTS,
    remainingMs: 0,
  };
}

export async function clearPin(_userId: string): Promise<void> {
  await securityRequest("DELETE", "/pin");
}

export function clearLegacyPinStorage(): void {
  try {
    const legacyPrefixes = [
      "simix_pin_hash_",
      "simix_pin_salt_",
      "simix_pin_attempts_",
    ];
    const legacyKeys = new Set([
      "simix_pin_user",
      "simix_pin_last_active",
      "simix_2fa_enabled",
    ]);
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (
        key
        && (legacyKeys.has(key) || legacyPrefixes.some((prefix) => key.startsWith(prefix)))
      ) {
        localStorage.removeItem(key);
      }
    }
    sessionStorage.removeItem("simix_pin_unlocked");
  } catch {
    /* Storage may be unavailable in private browsing; server checks still apply. */
  }
}

export function markUnlocked(userId: string): void {
  try {
    sessionStorage.setItem(UNLOCKED_KEY(userId), "true");
  } catch {
    /* The PIN is verified by the server; this only remembers the current UI state. */
  }
}

export function clearUnlocked(userId: string): void {
  try {
    sessionStorage.removeItem(UNLOCKED_KEY(userId));
  } catch {
    /* ignore unavailable session storage */
  }
}

export function isUnlockedThisSession(userId: string): boolean {
  try {
    return sessionStorage.getItem(UNLOCKED_KEY(userId)) === "true";
  } catch {
    return false;
  }
}
