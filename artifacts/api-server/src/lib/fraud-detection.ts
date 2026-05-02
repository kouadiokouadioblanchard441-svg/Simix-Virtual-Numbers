/**
 * Fraud & abuse detection system.
 *
 * Risk levels:
 *   0–30  → normal
 *  31–60  → suspicious (log + alert)
 *  61–100 → dangerous (block)
 */

import { db, securityEventsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getHitCount, isRateLimited } from "./rate-limiter";

export type RiskLevel = "normal" | "suspicious" | "dangerous";

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  reasons: string[];
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 61) return "dangerous";
  if (score >= 31) return "suspicious";
  return "normal";
}

/**
 * Assess risk for a number-purchase action.
 */
export async function assessPurchaseRisk(
  userId: string,
  ip: string,
): Promise<RiskAssessment> {
  const reasons: string[] = [];
  let score = 0;

  const purchasesPerMin = getHitCount(`purchase:${userId}`, 60_000);
  const purchasesPerHour = getHitCount(`purchase:${userId}`, 3_600_000);
  const purchasesFromIp = getHitCount(`purchase_ip:${ip}`, 60_000);

  if (purchasesPerMin >= 10) {
    score += 50;
    reasons.push(`${purchasesPerMin} achats en 1 minute`);
  } else if (purchasesPerMin >= 5) {
    score += 25;
    reasons.push(`${purchasesPerMin} achats en 1 minute (suspect)`);
  }

  if (purchasesPerHour >= 50) {
    score += 30;
    reasons.push(`${purchasesPerHour} achats en 1 heure`);
  } else if (purchasesPerHour >= 20) {
    score += 15;
    reasons.push(`${purchasesPerHour} achats en 1 heure (élevé)`);
  }

  if (purchasesFromIp >= 15) {
    score += 25;
    reasons.push(`${purchasesFromIp} achats depuis la même IP en 1 minute`);
  }

  const level = levelFromScore(score);
  return { score, level, reasons };
}

/**
 * Assess risk for a login attempt.
 */
export function assessLoginRisk(ip: string, identifier: string): RiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  const failedByIp = getHitCount(`login_fail_ip:${ip}`, 15 * 60_000);
  const failedByUser = getHitCount(`login_fail_user:${identifier}`, 15 * 60_000);

  if (failedByIp >= 20) {
    score += 60;
    reasons.push(`${failedByIp} tentatives échouées depuis cette IP (15 min)`);
  } else if (failedByIp >= 10) {
    score += 30;
    reasons.push(`${failedByIp} tentatives depuis cette IP`);
  }

  if (failedByUser >= 10) {
    score += 40;
    reasons.push(`${failedByUser} tentatives sur ce compte`);
  } else if (failedByUser >= 5) {
    score += 20;
    reasons.push(`${failedByUser} tentatives sur ce compte`);
  }

  return { score: Math.min(score, 100), level: levelFromScore(score), reasons };
}

/**
 * Log a security event to the database and pino logger.
 */
export async function logSecurityEvent(opts: {
  userId?: string;
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  riskScore?: number;
}): Promise<void> {
  try {
    await db.insert(securityEventsTable).values({
      userId: opts.userId ?? null,
      eventType: opts.eventType,
      severity: opts.severity,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
      details: opts.details ?? null,
      riskScore: opts.riskScore ?? 0,
    });
    logger.warn(
      { event: opts.eventType, severity: opts.severity, ip: opts.ip, userId: opts.userId },
      `[SECURITY] ${opts.eventType}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to log security event");
  }
}

/**
 * Block a user and record the reason.
 */
export async function blockUser(
  userId: string,
  reason: string,
): Promise<void> {
  await db
    .update(usersTable)
    .set({ status: "Bloqué", blockedReason: reason })
    .where(eq(usersTable.id, userId));
  logger.warn({ userId, reason }, "[SECURITY] User blocked");
}
