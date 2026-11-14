/**
 * requireAdminJwt — middleware that verifies the HttpOnly admin session cookie
 * on every protected /api/admin/* route.
 */
import type { Request, Response, NextFunction } from "express";
import { and, eq, sql } from "drizzle-orm";
import { adminAccessLogsTable, db, usersTable } from "@workspace/db";
import { verifyAdminJwt, type AdminJwtPayload } from "./admin-jwt";
import { sendAuditAlert } from "./telegram";
import { logger } from "./logger";

declare global {
  namespace Express {
    interface Request {
      adminPayload?: AdminJwtPayload;
    }
  }
}

export function requireAdminJwt(
  req: Request,
  res: Response,
  next: NextFunction,
): void | Promise<void> {
  const token = req.cookies?.["simix_admin_session"];
  if (typeof token !== "string" || !token) {
    res.status(401).json({ error: "Admin session required. Please log in." });
    return;
  }
  const payload = verifyAdminJwt(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired admin session." });
    return;
  }

  return (async () => {
    let activeAdmin: { isAdmin: boolean } | undefined;
    let revokedToken: { id: string } | undefined;
    try {
      [activeAdmin] = await db
        .select({ isAdmin: usersTable.isAdmin })
        .from(usersTable)
        .where(eq(usersTable.id, payload.sub))
        .limit(1);
      [revokedToken] = await db
        .select({ id: adminAccessLogsTable.id })
        .from(adminAccessLogsTable)
        .where(and(
          eq(adminAccessLogsTable.action, "logout"),
          sql`${adminAccessLogsTable.details}->>'jti' = ${payload.jti}`,
        ))
        .limit(1);
    } catch (error) {
      logger.error({ err: error, adminId: payload.sub }, "[admin-auth] Could not confirm current admin access");
      res.status(503).json({ error: "Impossible de vérifier la session administrateur." });
      return;
    }

    if (!activeAdmin?.isAdmin) {
      res.status(401).json({ error: "Session administrateur révoquée. Veuillez vous reconnecter." });
      return;
    }
    if (revokedToken) {
      res.status(401).json({ error: "Cette session administrateur a été déconnectée." });
      return;
    }

    req.adminPayload = payload;

    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) {
      res.once("finish", () => {
        const status = res.statusCode;
        const route = req.originalUrl.split("?")[0] || req.path;
        void sendAuditAlert({
          action: `Admin ${req.method.toUpperCase()}`,
          description: `${route} — HTTP ${status}`,
          userId: payload.sub,
          userName: payload.name || payload.email,
          ip: req.ip,
          severity: status >= 500 ? "critical" : status >= 400 ? "warning" : "info",
        });
      });
    }

    next();
  })();
}
