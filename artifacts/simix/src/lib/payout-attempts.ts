export type PayoutAttemptStatus = "unknown" | "pending" | "completed" | "failed";

export interface PayoutAttempt {
  idempotencyKey: string;
  status: PayoutAttemptStatus;
  recordId?: string;
  updatedAt: number;
}

const STORAGE_PREFIX = "simix:admin-payout-attempt:";

async function payloadFingerprint(payload: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function storageKey(scope: string, fingerprint: string): string {
  return `${STORAGE_PREFIX}${scope}:${fingerprint}`;
}

export async function getPayoutAttempt(
  scope: string,
  normalizedPayload: unknown,
): Promise<PayoutAttempt | null> {
  const key = storageKey(scope, await payloadFingerprint(normalizedPayload));
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PayoutAttempt;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export async function beginPayoutAttempt(
  scope: string,
  normalizedPayload: unknown,
): Promise<PayoutAttempt> {
  const fingerprint = await payloadFingerprint(normalizedPayload);
  const key = storageKey(scope, fingerprint);
  const previousRaw = window.sessionStorage.getItem(key);
  if (previousRaw) {
    try {
      const previous = JSON.parse(previousRaw) as PayoutAttempt;
      if (previous.status === "unknown" || previous.status === "pending") return previous;
    } catch {
      window.sessionStorage.removeItem(key);
    }
  }

  if (!window.crypto.randomUUID) {
    throw new Error("Ce navigateur ne permet pas de créer une clé de paiement sécurisée.");
  }
  const attempt: PayoutAttempt = {
    idempotencyKey: window.crypto.randomUUID(),
    status: "unknown",
    updatedAt: Date.now(),
  };
  window.sessionStorage.setItem(key, JSON.stringify(attempt));
  return attempt;
}

export async function updatePayoutAttempt(
  scope: string,
  normalizedPayload: unknown,
  update: Partial<PayoutAttempt>,
): Promise<void> {
  const key = storageKey(scope, await payloadFingerprint(normalizedPayload));
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return;
  const current = JSON.parse(raw) as PayoutAttempt;
  window.sessionStorage.setItem(
    key,
    JSON.stringify({ ...current, ...update, updatedAt: Date.now() } satisfies PayoutAttempt),
  );
}