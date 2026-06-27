/**
 * PIN cryptography — all hashing done client-side using Web Crypto API.
 * The raw PIN is NEVER stored or transmitted.
 */

async function sha256hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes = 16): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash a PIN with a fresh random salt. Returns both for storage. */
export async function createPinHash(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = randomHex(16);
  const hash = await sha256hex(pin + salt);
  return { hash, salt };
}

/** Verify a PIN against a stored hash + salt. */
export async function verifyPinHash(
  pin: string,
  storedHash: string,
  salt: string,
): Promise<boolean> {
  if (!pin || !storedHash || !salt) return false;
  const hash = await sha256hex(pin + salt);
  return hash === storedHash;
}
