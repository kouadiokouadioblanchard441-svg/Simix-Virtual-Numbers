import { eq, gt, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, sessionsTable, usersTable } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";
import type { User } from "@workspace/db";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = "simix_session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
    }
  }
}

export function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{
  id: string;
  expiresAt: Date;
}> {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function getSessionUser(
  sessionId: string,
): Promise<User | null> {
  const [row] = await db
    .select({ user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(sessionsTable.id, sessionId),
        gt(sessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row?.user ?? null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
}

export function setSessionCookie(
  res: Response,
  sessionId: string,
  expiresAt: Date,
): void {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (typeof sessionId === "string" && sessionId.length > 0) {
    const user = await getSessionUser(sessionId);
    if (user) {
      req.user = user;
      req.sessionId = sessionId;
    }
  }
  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
