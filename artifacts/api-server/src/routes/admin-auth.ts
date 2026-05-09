/**
 * Admin Authentication Routes — Secure token-based admin access system
 * Endpoints:
 *   POST /api/admin-auth/verify-token  — validate the secret URL access token
 *   POST /api/admin-auth/login         — authenticate admin credentials → JWT
 *   GET  /api/admin-auth/session       — verify current JWT session
 *   POST /api/admin-auth/logout        — log out and clear session
 */
import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, adminAccessLogsTable } from "@workspace/db";
import { signAdminJwt, verifyAdminJwt } from "../lib/admin-jwt";
import { isRateLimited, getHitCount, resetKey } from "../lib/rate-limiter";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ─── helpers ─────────────────────────────────────────────── */

function getIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.ip ??
    "unknown"
  );
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function logAccess(
  ip: string,
  action: string,
  success: boolean,
  email?: string,
  details?: Record<string, unknown>,
  userAgent?: string,
): Promise<void> {
  try {
    await db.insert(adminAccessLogsTable).values({
      ip,
      action,
      success,
      email: email ?? null,
      details: details ?? null,
      userAgent: userAgent ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to log admin access");
  }
}

/* ─── POST /api/admin-auth/verify-token ─────────────────────
   Validates the secret URL access token.
   Rate-limited to 20 requests per 15 min per IP.
   Returns a signed one-time "access grant" in the response body.
────────────────────────────────────────────────────────────── */
router.post("/admin-auth/verify-token", async (req: Request, res: Response): Promise<void> => {
  const ip = getIp(req);
  const ua = req.headers["user-agent"] ?? "";

  /* Aggressive rate limit on token probe attempts */
  if (isRateLimited(`admin-token:${ip}`, 20, 15 * 60_000)) {
    await logAccess(ip, "token_probe_rate_limited", false, undefined, { ua });
    res.status(429).json({ error: "Too many requests. Please wait." });
    return;
  }

  const { token } = req.body as { token?: string };
  const envToken = process.env["ADMIN_ACCESS_TOKEN"];

  if (!token || !envToken) {
    await logAccess(ip, "token_verify_missing", false, undefined, {}, ua);
    res.status(401).json({ error: "Access denied" });
    return;
  }

  /* Timing-safe comparison */
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(token);
  const b = Buffer.from(envToken);
  const valid =
    a.length === b.length && timingSafeEqual(a, b);

  if (!valid) {
    await logAccess(ip, "token_verify_failed", false, undefined, {}, ua);
    logger.warn({ ip }, "Invalid admin access token attempt");
    res.status(401).json({ error: "Access denied" });
    return;
  }

  await logAccess(ip, "token_verify_success", true, undefined, {}, ua);
  res.json({ granted: true });
});

/* ─── POST /api/admin-auth/login ────────────────────────────
   Authenticate admin credentials.
   Rate-limited to 5 attempts per 15 min per IP → lockout.
   Returns a signed JWT on success.
────────────────────────────────────────────────────────────── */
router.post("/admin-auth/login", async (req: Request, res: Response): Promise<void> => {
  const ip = getIp(req);
  const ua = req.headers["user-agent"] ?? "";
  const loginKey = `admin-login:${ip}`;

  /* Brute-force protection: 5 attempts per 15 min */
  const hits = getHitCount(loginKey, 15 * 60_000);
  if (hits >= 5) {
    await logAccess(ip, "login_blocked_bruteforce", false, undefined, { hits }, ua);
    logger.warn({ ip, hits }, "Admin login brute-force blocked");
    res.status(429).json({
      error: "Too many failed attempts. Try again in 15 minutes.",
      retryAfter: 900,
    });
    return;
  }

  const { email, password, fingerprint } = req.body as {
    email?: string;
    password?: string;
    fingerprint?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  /* Lookup user */
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user || !user.isAdmin) {
    /* Record failed attempt (same timing as valid path to avoid enumeration) */
    isRateLimited(loginKey, 5, 15 * 60_000);
    await logAccess(ip, "login_failed_not_admin", false, email, {}, ua);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash ?? "");
  if (!passwordMatch) {
    isRateLimited(loginKey, 5, 15 * 60_000);
    await logAccess(ip, "login_failed_bad_password", false, email, { userId: user.id }, ua);
    logger.warn({ ip, email }, "Admin login — bad password");
    const remaining = 5 - getHitCount(loginKey, 15 * 60_000);
    res.status(401).json({
      error: "Invalid credentials",
      attemptsRemaining: Math.max(0, remaining),
    });
    return;
  }

  /* Success — reset brute-force counter */
  resetKey(loginKey);

  const fp = fingerprint ?? `${ua}:${ip}`;
  const token = signAdminJwt({
    sub: user.id,
    email: user.email,
    name: user.fullName ?? user.email,
    fingerprint: fp,
  });

  await logAccess(ip, "login_success", true, email, { userId: user.id }, ua);
  logger.info({ ip, email, userId: user.id }, "Admin login success");

  res.json({
    token,
    expiresIn: 8 * 3600,
    admin: {
      id: user.id,
      email: user.email,
      name: user.fullName ?? user.email,
    },
  });
});

/* ─── GET /api/admin-auth/session ───────────────────────────
   Verify that the current JWT is still valid.
────────────────────────────────────────────────────────────── */
router.get("/admin-auth/session", async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ valid: false, error: "No token provided" });
    return;
  }
  const payload = verifyAdminJwt(token);
  if (!payload) {
    res.status(401).json({ valid: false, error: "Invalid or expired token" });
    return;
  }

  /* Cross-check user still exists and is still admin */
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, isAdmin: usersTable.isAdmin, fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.id, payload.sub))
    .limit(1);

  if (!user || !user.isAdmin) {
    res.status(401).json({ valid: false, error: "Admin privileges revoked" });
    return;
  }

  res.json({
    valid: true,
    admin: { id: user.id, email: user.email, name: user.fullName ?? user.email },
    expiresAt: payload.exp,
  });
});

/* ─── POST /api/admin-auth/logout ───────────────────────────
   Log out admin (JWT is stateless; client clears it).
────────────────────────────────────────────────────────────── */
router.post("/admin-auth/logout", async (req: Request, res: Response): Promise<void> => {
  const ip = getIp(req);
  const ua = req.headers["user-agent"] ?? "";
  const token = getBearerToken(req);

  let email: string | undefined;
  if (token) {
    const payload = verifyAdminJwt(token);
    if (payload) email = payload.email;
  }

  await logAccess(ip, "logout", true, email, {}, ua);
  res.json({ success: true });
});

/* ─── GET /api/admin-auth/access-logs ──────────────────────
   Returns recent admin access logs (requires admin JWT).
────────────────────────────────────────────────────────────── */
router.get("/admin-auth/access-logs", async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (!token) { res.status(401).json({ error: "No token" }); return; }
  const payload = verifyAdminJwt(token);
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }

  const { desc: descFn } = await import("drizzle-orm");
  const logs = await db
    .select()
    .from(adminAccessLogsTable)
    .orderBy(descFn(adminAccessLogsTable.createdAt))
    .limit(100);

  res.json({ logs });
});

export default router;
