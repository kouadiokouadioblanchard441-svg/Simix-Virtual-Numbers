import { Router, type IRouter } from "express";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { createSession, setSessionCookie } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SX";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode();
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.referralCode, code)).limit(1);
    if (!existing) return code;
  }
  return "SX" + Date.now().toString(36).toUpperCase().slice(-8);
}

function getOAuthClient(redirectUri: string) {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

function getRedirectUri(req: { headers: { host?: string | undefined; "x-forwarded-host"?: string | string[] | undefined; "x-forwarded-proto"?: string | string[] | undefined }; protocol?: string; secure: boolean }): string {
  /* Explicit override always wins — set GOOGLE_REDIRECT_URI in production env only
   * (not in shared) so dev falls through to REPLIT_DEV_DOMAIN automatically. */
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  /* Replit dev workspace: use the proxied external domain so the callback
   * reaches this server rather than the production URL. */
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) return `https://${replitDomain}/api/auth/google/callback`;
  /* Fallback: derive from the incoming request (works on any plain server). */
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:3000";
  const proto = (req.secure || req.headers["x-forwarded-proto"] === "https") ? "https" : "http";
  return `${proto}://${host}/api/auth/google/callback`;
}

/* Determine if the current request is over HTTPS (trust-proxy aware).
 * We use this to set the Secure flag on cookies so that:
 *   - dev over plain HTTP  → secure: false (local testing without TLS)
 *   - dev on Replit (HTTPS via proxy) → secure: true
 *   - production → secure: true
 * NOTE: requires `app.set("trust proxy", 1)` to be in place.             */
// Accept express.Request via structural subtyping — headers is a superset of what we need
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSecureRequest(req: any): boolean {
  const proto = req.headers["x-forwarded-proto"] as string | string[] | undefined;
  return (req.secure as boolean) || proto === "https" || (Array.isArray(proto) && proto[0] === "https");
}

/* Cookie options — secure flag is dynamic so it works in all environments */
function oauthStateCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    /* sameSite "lax" allows the cookie to be sent on top-level cross-site
     * GET redirects (which is exactly what Google's callback is).          */
    sameSite: "lax" as const,
    secure,
    maxAge: 10 * 60 * 1000, // 10 min
    path: "/",
  };
}

/* ── GET /api/auth/google/debug-redirect ──────────────────────────────
   Returns the redirect URI that would be sent to Google.
   Used to diagnose redirect_uri_mismatch errors in production.
──────────────────────────────────────────────────────────────────────── */
router.get("/auth/google/debug-redirect", (req, res): void => {
  const redirectUri = getRedirectUri(req);
  res.json({
    redirectUri,
    source: process.env.GOOGLE_REDIRECT_URI
      ? "GOOGLE_REDIRECT_URI env var"
      : process.env.REPLIT_DEV_DOMAIN
      ? "REPLIT_DEV_DOMAIN env var"
      : "derived from request headers",
    headers: {
      host: req.headers.host,
      "x-forwarded-host": req.headers["x-forwarded-host"],
      "x-forwarded-proto": req.headers["x-forwarded-proto"],
    },
    GOOGLE_REDIRECT_URI_set: !!process.env.GOOGLE_REDIRECT_URI,
    REPLIT_DEV_DOMAIN_set: !!process.env.REPLIT_DEV_DOMAIN,
  });
});

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

  res.cookie("oauth_state", state, oauthStateCookieOptions(isSecureRequest(req)));

  /* Persist incoming referral code across the OAuth redirect so we can
   * attribute the new Google user to the correct referrer on callback.  */
  const rawRefCode = typeof req.query.ref === "string" ? req.query.ref.trim().toUpperCase() : "";
  const refCode = /^SX[A-Z2-9]{8}$/.test(rawRefCode) ? rawRefCode : null;
  if (refCode) {
    /* This is a short-lived referral attribution cookie, not an auth/session
     * identifier. Its value is restricted to Simix's referral-code format. */
    // nosemgrep: javascript.express.session-fixation.session-fixation
    res.cookie("oauth_ref", refCode, oauthStateCookieOptions(isSecureRequest(req)));
  }

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
    res.redirect("/?error=google_denied");
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
    secure: isSecureRequest(req),
    path: "/",
  });

  /* Read & clear the referral code cookie (set before the OAuth redirect) */
  const incomingRefCode: string | null = typeof req.cookies?.oauth_ref === "string"
    ? req.cookies.oauth_ref.trim().toUpperCase()
    : null;
  if (incomingRefCode) {
    res.clearCookie("oauth_ref", { httpOnly: true, sameSite: "lax", secure: isSecureRequest(req), path: "/" });
  }

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
      /* Extract Google's specific error code (e.g. redirect_uri_mismatch, invalid_client) */
      const googleCode = (tokenErr as Record<string, unknown>)?.response
        ? JSON.stringify((tokenErr as Record<string, { data?: unknown }>).response?.data ?? {})
        : msg;
      logger.error({ err: msg, googleCode, ip, redirectUri }, "[google-auth] Token exchange failed");
      const reason = encodeURIComponent(googleCode.slice(0, 120));
      res.redirect(`/?error=google_token_exchange_failed&reason=${reason}`);
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
      /* New user — resolve referrer then create account */
      let referrerId: string | null = null;
      if (incomingRefCode) {
        const [referrer] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.referralCode, incomingRefCode))
          .limit(1);
        if (referrer) referrerId = referrer.id;
      }

      const newReferralCode = await uniqueReferralCode();
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
          referralCode: newReferralCode,
          referredBy: referrerId ?? undefined,
          lastLoginAt: new Date(),
        })
        .returning();

      if (!created) {
        logger.error({ email, googleId, ip }, "[google-auth] User insert returned no row");
        res.redirect("/?error=google_auth_failed");
        return;
      }

      user = created;
      logger.info({ userId: user.id, email, referralCode: newReferralCode, referredBy: referrerId }, "[google-auth] New Google user created");

    } else {
      /* Existing user — update Google fields + last login */
      const updates: Record<string, unknown> = {
        lastLoginAt: new Date(),
      };
      if (!user.googleId) updates.googleId = googleId;
      if (!user.avatar && avatar) updates.avatar = avatar;
      if (!user.emailVerified && googleEmailVerified) updates.emailVerified = true;
      if (user.authProvider === "local" && !user.googleId) updates.authProvider = "google";
      /* Backfill referral code for existing Google users who never received one */
      if (!user.referralCode) updates.referralCode = await uniqueReferralCode();

      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, user.id))
        .returning();

      if (updated) user = updated;
      logger.info({ userId: user.id, email, referralCode: user.referralCode }, "[google-auth] Existing user signed in via Google");
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
