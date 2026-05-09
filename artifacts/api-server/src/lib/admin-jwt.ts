/**
 * Admin JWT — HMAC-SHA256 implementation using node:crypto only.
 * No external dependencies. Timing-safe signature verification.
 */
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const EXPIRY_SECONDS = 8 * 3600; // 8 hours

function getSecret(): string {
  const s = process.env["ADMIN_JWT_SECRET"];
  if (!s) throw new Error("ADMIN_JWT_SECRET is not set");
  return s;
}

function b64url(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}

function b64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

export interface AdminJwtPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
  jti: string;
  fingerprint: string;
}

export function signAdminJwt(
  data: Pick<AdminJwtPayload, "sub" | "email" | "name" | "fingerprint">,
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminJwtPayload = {
    ...data,
    iat: now,
    exp: now + EXPIRY_SECONDS,
    jti: randomUUID(),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyAdminJwt(token: string): AdminJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts as [string, string, string];
    const expected = createHmac("sha256", getSecret())
      .update(`${header}.${body}`)
      .digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (
      sigBuf.length !== expBuf.length ||
      !timingSafeEqual(sigBuf, expBuf)
    ) return null;
    const payload: AdminJwtPayload = JSON.parse(b64urlDecode(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAdminJwtExpiry(token: string): Date | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload: AdminJwtPayload = JSON.parse(b64urlDecode(parts[1]!));
    return new Date(payload.exp * 1000);
  } catch {
    return null;
  }
}
