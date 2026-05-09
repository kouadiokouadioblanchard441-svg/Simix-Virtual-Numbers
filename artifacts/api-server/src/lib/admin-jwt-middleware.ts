/**
 * requireAdminJwt — middleware that verifies the Admin JWT Bearer token
 * on every protected /api/admin/* route.
 * Also populates req.user from DB so that requireAuth + requireAdmin work seamlessly.
 */
import type { Request, Response, NextFunction } from "express";
import { verifyAdminJwt, type AdminJwtPayload } from "./admin-jwt";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      adminPayload?: AdminJwtPayload;
    }
  }
}

export async function requireAdminJwt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin session required. Please log in." });
    return;
  }
  const token = auth.slice(7);
  const payload = verifyAdminJwt(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired admin session." });
    return;
  }
  req.adminPayload = payload;

  /* Populate req.user so that requireAuth + requireAdmin pass */
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.sub))
      .limit(1);
    if (user) {
      req.user = user;
    }
  } catch {
    /* non-fatal — requireAdmin will reject if req.user is missing */
  }

  next();
}
