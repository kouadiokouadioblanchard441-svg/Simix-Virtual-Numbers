import { Router, type IRouter } from "express";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { createSession, setSessionCookie } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getOAuthClient(redirectUri: string) {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

function getRedirectUri(req: { headers: { host?: string }; protocol: string }): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) return `https://${replitDomain}/api/auth/google/callback`;
  const host = req.headers.host ?? "localhost:8080";
  return `${req.protocol}://${host}/api/auth/google/callback`;
}

router.get("/auth/google", (req, res): void => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.redirect("/?error=google_not_configured");
    return;
  }

  const redirectUri = getRedirectUri(req);
  const client = getOAuthClient(redirectUri);
  const state = randomBytes(16).toString("hex");

  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });

  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });

  res.redirect(url);
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query;

  if (error) {
    logger.warn({ error }, "Google OAuth denied by user");
    res.redirect("/?error=google_denied");
    return;
  }

  const savedState = req.cookies?.oauth_state;
  if (!state || typeof state !== "string" || state !== savedState) {
    logger.warn("Google OAuth invalid state parameter");
    res.redirect("/?error=invalid_state");
    return;
  }

  res.clearCookie("oauth_state", { path: "/" });

  if (!code || typeof code !== "string") {
    res.redirect("/?error=missing_code");
    return;
  }

  try {
    const redirectUri = getRedirectUri(req);
    const client = getOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    if (!tokens.id_token) {
      res.redirect("/?error=google_no_token");
      return;
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID!,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      res.redirect("/?error=google_invalid_token");
      return;
    }

    const googleId = payload.sub;
    const email = payload.email ?? `google_${googleId}@simix.app`;
    const fullName = payload.name ?? email.split("@")[0];
    const avatar = payload.picture ?? null;

    let [user] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.googleId, googleId), eq(usersTable.email, email)))
      .limit(1);

    if (!user) {
      const username = `user_${randomBytes(4).toString("hex")}`;
      const [created] = await db
        .insert(usersTable)
        .values({
          fullName,
          email,
          phone: null,
          countryCode: "+225",
          passwordHash: null,
          googleId,
          authProvider: "google",
          avatar,
          username,
          balance: 0,
          verified: true,
        })
        .returning();
      user = created!;
      logger.info({ userId: user.id }, "New Google user created");
    } else if (!user.googleId) {
      const [updated] = await db
        .update(usersTable)
        .set({
          googleId,
          avatar: avatar ?? user.avatar ?? null,
          authProvider: "google",
        })
        .where(eq(usersTable.id, user.id))
        .returning();
      user = updated!;
      logger.info({ userId: user.id }, "Google account linked to existing user");
    }

    if (user.status === "Bloqué") {
      res.redirect("/?error=account_blocked");
      return;
    }

    const session = await createSession(user.id);
    setSessionCookie(res, session.id, session.expiresAt);

    res.redirect("/dashboard");
  } catch (err) {
    logger.error({ err }, "Google OAuth callback error");
    res.redirect("/?error=google_auth_failed");
  }
});

export default router;
