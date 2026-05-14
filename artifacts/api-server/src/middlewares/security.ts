/**
 * Security middleware:
 * - Maintenance mode check (503 for all non-admin routes)
 * - Blocks users whose status is "Bloqué"
 * - Blocks IP addresses in the blacklist
 * - Enforces global API rate limit per IP
 */
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, ipBlacklistTable } from "@workspace/db";
import { isRateLimited } from "../lib/rate-limiter";
import { logSecurityEvent } from "../lib/fraud-detection";
import { isMaintenanceMode } from "../lib/settings";

/* In-memory cache for blacklisted IPs — avoids DB hit on every request */
const BLACKLIST_CACHE = new Set<string>();
let lastBlacklistRefresh = 0;
const REFRESH_INTERVAL_MS = 60 * 1000; // refresh every 60s

async function refreshIpBlacklist(): Promise<void> {
  if (Date.now() - lastBlacklistRefresh < REFRESH_INTERVAL_MS) return;
  lastBlacklistRefresh = Date.now();
  try {
    const entries = await db
      .select({ value: ipBlacklistTable.value, expiresAt: ipBlacklistTable.expiresAt })
      .from(ipBlacklistTable)
      .where(eq(ipBlacklistTable.type, "ip"));
    BLACKLIST_CACHE.clear();
    for (const e of entries) {
      if (!e.expiresAt || e.expiresAt.getTime() > Date.now()) {
        BLACKLIST_CACHE.add(e.value);
      }
    }
  } catch { /* non-fatal */ }
}

/* Payment gateway webhook paths — must NEVER be blocked by maintenance / rate-limit / IP blacklist.
 * PawaPay and Clapay call these endpoints from their own servers to confirm payment completion.
 * Blocking them means payments are validated on the gateway side but never credited to users. */
const WEBHOOK_PATHS = [
  "/api/wallet/pawapay/webhook",
  "/api/wallet/pawapay/refund-webhook",
  "/api/wallet/clapay/webhook",
];

function isWebhookPath(path: string): boolean {
  return WEBHOOK_PATHS.some(p => path === p || path.startsWith(p));
}

/** Return 503 on all non-admin, non-health routes when maintenance_mode=true */
export async function checkMaintenanceMode(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (
    req.path.startsWith("/api/admin") ||
    req.path === "/api/health" ||
    req.path === "/api/healthz" ||
    isWebhookPath(req.path)
  ) {
    next();
    return;
  }
  if (await isMaintenanceMode()) {
    res.status(503).json({
      error: "La plateforme est en maintenance. Revenez dans quelques instants.",
      maintenance: true,
    });
    return;
  }
  next();
}

/** Block requests from IPs in the blacklist (skip admin + webhook routes) */
export async function checkIpBlacklist(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.path.startsWith("/api/admin") || req.path === "/api/healthz" || isWebhookPath(req.path)) {
    next();
    return;
  }
  const ip = req.ip ?? "unknown";
  await refreshIpBlacklist();
  if (BLACKLIST_CACHE.has(ip)) {
    void logSecurityEvent({
      eventType: "blacklisted_ip_attempt",
      severity: "high",
      ip,
      details: { path: req.path },
      riskScore: 90,
    });
    res.status(403).json({ error: "Accès refusé. Votre adresse IP a été bloquée." });
    return;
  }
  next();
}

/** 200 requests per minute per IP — global API guard (skips webhook paths) */
export function globalRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (isWebhookPath(req.path)) { next(); return; }
  const ip = req.ip ?? "unknown";
  if (isRateLimited(`global:${ip}`, 200, 60_000)) {
    void logSecurityEvent({
      eventType: "rate_limit_exceeded",
      severity: "medium",
      ip,
      details: { path: req.path },
      riskScore: 40,
    });
    res.status(429).json({ error: "Trop de requêtes. Veuillez patienter." });
    return;
  }
  next();
}

/** Reject requests from blocked users */
export function checkUserBlocked(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.status === "Bloqué") {
    res.status(403).json({
      error: "Votre compte a été suspendu. Contactez le support.",
      reason: req.user.blockedReason ?? "Activité suspecte détectée",
    });
    return;
  }
  next();
}
