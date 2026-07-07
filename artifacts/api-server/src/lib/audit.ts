/**
 * audit.ts — Enregistrement des actions sensibles en base de données
 *
 * Fonctionne en fire-and-forget (ne bloque jamais la requête principale).
 * Toute erreur est silencieuse côté utilisateur mais loguée côté serveur.
 */
import { db, auditLogsTable } from "@workspace/db";
import { lookupIp, type GeoInfo } from "./geoip";
import { sendAuditAlert } from "./telegram";
import { logger } from "./logger";

export interface AuditEntry {
  userId?: string | null;
  userName?: string;
  action: string;
  entity?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  severity?: "info" | "warning" | "critical";
  description?: string;
  metadata?: Record<string, unknown>;
  notifyTelegram?: boolean;
}

export function auditLog(entry: AuditEntry): void {
  void (async () => {
    try {
      let geo: Partial<GeoInfo> = {};
      if (entry.ip) geo = await lookupIp(entry.ip);

      await db.insert(auditLogsTable).values({
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        ip: entry.ip ?? null,
        country: geo.country ?? null,
        city: geo.city ?? null,
        isp: geo.isp ?? null,
        userAgent: entry.userAgent ?? null,
        severity: entry.severity ?? "info",
        description: entry.description ?? null,
        metadata: entry.metadata ? (entry.metadata as Record<string, unknown>) : null,
      });

      if (entry.notifyTelegram) {
        await sendAuditAlert({
          action: entry.action,
          description: entry.description ?? entry.action,
          userId: entry.userId ?? undefined,
          userName: entry.userName,
          ip: entry.ip,
          geo,
          severity: entry.severity,
          metadata: entry.metadata,
        });
      }
    } catch (err) {
      logger.debug({ err: (err as Error).message, action: entry.action }, "[audit] log failed");
    }
  })();
}
