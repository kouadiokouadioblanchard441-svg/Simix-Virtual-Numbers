/**
 * requireAdminJwt — middleware that verifies the Admin JWT Bearer token
 * on every protected /api/admin/* route.
 */
import type { Request, Response, NextFunction } from "express";
import { verifyAdminJwt, type AdminJwtPayload } from "./admin-jwt";

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
): void {
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
  next();
}
