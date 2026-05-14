import { Router, type IRouter } from "express";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { createSession, setSessionCookie } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const isProd = process.env.NODE_ENV === "production";

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
  const proto = req.protocol;
  return `${proto}://${host}/api/auth/google/callback`;
}

/* Cookie options shared between set + clear so they always match exactly */
function oauthStateCookieOptions() {
  return {
    httpOnly: true,
    /* sameSite "lax" allows the cookie to be sent on top-level cross-site
     * GET redirects (which is exactly what Google's callback is).          */
    sameSite: "lax" as const,
    /* MUST be secure in production — browsers drop insecure cookies on
     * HTTPS pages, which causes the state-mismatch error.                  */
    secure: isProd,
    maxAge: 10 * 60 * 1000, // 10 min
    path: "/",
  };
}

/* ── GET /api/auth/google ──────────────────────────────────────────────
   Initiates the OAuth flow. Generates a random state token, stores it
   in an httpOnly cookie, then redirects to Google's consent screen.
──────────────────────────────────────────────────────────────────────── */
router.get("/auth/google", (req, res): void => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn("[google-auth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set");
    res.redirect("/?error=google_not_configured");
    return;
  }

  const redirectUri = getRedirectUri(req);
  logger.info({ redirectUri }, "[google-auth] Starting OAuth flow");

  const client = getOAuthClient(redirectUri);
  const state = randomBytes(16).toString("hex");

  res.cookie("oauth_state", state, oauthStateCookieOptions());

  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });

  res.redirect(url);
});

/* ── GET /api/auth/google/callback ────────────────────────────────────
   Google redirects here after user consent.
   Validates state, exchanges code for tokens, upserts user, creates
   a server-side session and sets the auth cookie.
──────────────────────────────────────────────────────────────────────── */
router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip;

  /* ── User denied consent ── */
  if (error) {
    logger.warn({ error, ip }, "[google-auth] OAuth denied by user");
    res.redirect(`/?error=google_denied&reason=${encodeURIComponent(String(error))}`);
    return;
  }

  /* ── State verification (CSRF protection) ── */
  const savedState = req.cookies?.oauth_state;

  if (!savedState) {
    logger.error({ ip }, "[google-auth] oauth_state cookie missing — possible cookie issue or expired session");
    res.redirect("/?error=google_session_expired");
    return;
  }

  if (!state || typeof state !== "string" || state !== savedState) {
    logger.error(
      { ip, stateMatch: state === savedState, hasState: !!state, hasSavedState: !!savedState },
      "[google-auth] State mismatch — possible CSRF or cookie not sent",
    );
    res.redirect("/?error=invalid_state");
    return;
  }

  /* Clear the state cookie using the SAME options it was set with */
  res.clearCookie("oauth_state", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
  });

  if (!code || typeof code !== "string") {
    logger.error({ ip }, "[google-auth] Authorization code missing");
    res.redirect("/?error=missing_code");
    return;
  }

  try {
    const redirectUri = getRedirectUri(req);
    logger.info({ redirectUri, ip }, "[google-auth] Exchanging code for tokens");

    const client = getOAuthClient(redirectUri);

    let tokens;
    try {
      const result = await client.getToken(code);
      tokens = result.tokens;
    } catch (tokenErr: unknown) {
      const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      logger.error({ err: msg, ip, redirectUri }, "[google-auth] Token exchange failed — check redirect URI matches Google Console exactly");
      res.redirect(`/?error=google_token_exchange_failed`);
      return;
    }

    client.setCredentials(tokens);

    if (!tokens.id_token) {
      logger.error({ ip }, "[google-auth] No id_token in Google response");
      res.redirect("/?error=google_no_token");
      return;
    }

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID!,
      });
      payload = ticket.getPayload();
    } catch (verifyErr: unknown) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      logger.error({ err: msg, ip }, "[google-auth] ID token verification failed");
      res.redirect("/?error=google_invalid_token");
      return;
    }

    if (!payload) {
      logger.error({ ip }, "[google-auth] Empty payload from Google");
      res.redirect("/?error=google_invalid_token");
      return;
    }

    const googleId = payload.sub;
    const email = payload.email;
    const fullName = payload.name ?? (email ? email.split("@")[0] : "Utilisateur Google");
    const avatar = payload.picture ?? null;
    const googleEmailVerified = payload.email_verified ?? false;

    if (!email) {
      logger.error({ googleId, ip }, "[google-auth] Google did not return an email address");
      res.redirect("/?error=google_no_email");
      return;
    }

    logger.info({ googleId, email, ip }, "[google-auth] Google identity verified");

    /* ── Upsert user ── */
    let [user] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.googleId, googleId), eq(usersTable.email, email)))
      .limit(1);

    if (!user) {
      /* New user — create account */
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
          emailVerified: googleEmailVerified,
          lastLoginAt: new Date(),
        })
        .returning();

      if (!created) {
        logger.error({ email, googleId, ip }, "[google-auth] User insert returned no row");
        res.redirect("/?error=google_auth_failed");
        return;
      }

      user = created;
      logger.info({ userId: user.id, email }, "[google-auth] New Google user created");

    } else {
      /* Existing user — update Google fields + last login */
      const updates: Record<string, unknown> = {
        lastLoginAt: new Date(),
      };
      if (!user.googleId) updates.googleId = googleId;
      if (!user.avatar && avatar) updates.avatar = avatar;
      if (!user.emailVerified && googleEmailVerified) updates.emailVerified = true;
      if (user.authProvider === "local" && !user.googleId) updates.authProvider = "google";

      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, user.id))
        .returning();

      if (updated) user = updated;
      logger.info({ userId: user.id, email }, "[google-auth] Existing user signed in via Google");
    }

    if (user.status === "Bloqué") {
      logger.warn({ userId: user.id, ip }, "[google-auth] Blocked user attempted login");
      res.redirect("/?error=account_blocked");
      return;
    }

    /* ── Create session & set cookie ── */
    const session = await createSession(user.id);
    setSessionCookie(res, session.id, session.expiresAt);

    logger.info({ userId: user.id, sessionId: session.id, ip }, "[google-auth] Session created — redirecting to dashboard");

    res.redirect("/dashboard");

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, ip }, "[google-auth] Unexpected error in OAuth callback");
    res.redirect("/?error=google_auth_failed");
  }
});

export default router;
