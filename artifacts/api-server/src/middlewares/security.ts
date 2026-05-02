/**
 * Security middleware:
 * - Blocks users whose status is "Bloqué"
 * - Enforces global API rate limit per IP
 */
import type { Request, Response, NextFunction } from "express";
import { isRateLimited } from "../lib/rate-limiter";
import { logSecurityEvent } from "../lib/fraud-detection";

/** 200 requests per minute per IP — global API guard */
export function globalRateLimit(req: Request, res: Response, next: NextFunction): void {
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
