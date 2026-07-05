import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db, usersTable, loginHistoryTable, ipBlacklistTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import {
  createSession,
  deleteSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from "../lib/auth";
import { toUser } from "../lib/serializers";
import { logger } from "../lib/logger";
import { isRateLimited, resetKey } from "../lib/rate-limiter";
import { assessLoginRisk, logSecurityEvent } from "../lib/fraud-detection";
import { isRegistrationEnabled, isEmailOtpEnabled } from "../lib/settings";
import { createOtp, isUserInactive } from "../lib/otp";
import { sendOtpEmail } from "../lib/email";
import { requireTurnstile } from "../middlewares/turnstile";

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

const router: IRouter = Router();

router.post("/auth/register", requireTurnstile, async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  /* Check if registration is currently enabled */
  if (!(await isRegistrationEnabled())) {
    res.status(503).json({ error: "Les inscriptions sont temporairement désactivées. Réessayez plus tard." });
    return;
  }

  /* 5 registrations per hour per IP */
  if (isRateLimited(`register:${ip}`, 5, 60 * 60_000)) {
    res.status(429).json({ error: "Trop de tentatives d'inscription. Réessayez plus tard." });
    return;
  }

  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fullName, phone, password, countryCode, email } = parsed.data;
  const normalizedPhone = phone.replace(/\s+/g, "");

  /* Optional referral code (not in Zod schema, read directly) */
  const referralCodeInput = typeof req.body.referralCode === "string"
    ? req.body.referralCode.trim().toUpperCase()
    : null;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone))
    .limit(1);

  if (existing) {
    res.status(400).json({ error: "Un compte existe déjà pour ce numéro de téléphone." });
    return;
  }

  /* Resolve referrer if code provided */
  let referrerId: string | null = null;
  if (referralCodeInput) {
    const [referrer] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, referralCodeInput))
      .limit(1);
    if (referrer) referrerId = referrer.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const username = `user_${normalizedPhone.replace(/[^0-9]/g, "").slice(-6)}`;
  const safeEmail =
    email && email.trim().length > 0 ? email.trim() : `${username}@simix.site`;

  const newReferralCode = await uniqueReferralCode();

  const [user] = await db
    .insert(usersTable)
    .values({
      fullName,
      phone: normalizedPhone,
      countryCode: countryCode ?? "+225",
      passwordHash,
      username,
      email: safeEmail,
      balance: 0,
      verified: false,
      emailVerified: false,
      referralCode: newReferralCode,
      referredBy: referrerId ?? undefined,
    })
    .returning();

  if (!user) {
    res.status(500).json({ error: "Création de compte échouée" });
    return;
  }

  const session = await createSession(user.id);
  setSessionCookie(res, session.id, session.expiresAt);

  /* Skip OTP if email verification is disabled by admin */
  if (!await isEmailOtpEnabled()) {
    await db.update(usersTable).set({ emailVerified: true, lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    res.json({ user: { ...toUser(user), emailVerified: true }, token: session.id });
    return;
  }

  try {
    const otpCode = await createOtp(user.id, "email_verification");
    await sendOtpEmail(safeEmail, otpCode, "register", user.fullName);
  } catch (emailErr) {
    logger.error({ err: emailErr }, "[auth] registration OTP email error");
  }

  res.json({ user: toUser(user), token: session.id, requiresEmailVerification: true });
});

router.post("/auth/login", requireTurnstile, async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";
  const ua = req.headers["user-agent"] ?? "";

  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { identifier, password } = parsed.data;
  const normalized = identifier.replace(/\s+/g, "");

  /* ── Brute-force check BEFORE hitting the DB ── */
  const risk = assessLoginRisk(ip, normalized);
  if (risk.level === "dangerous") {
    await logSecurityEvent({
      eventType: "brute_force_detected",
      severity: "critical",
      ip,
      userAgent: ua,
      details: { identifier: normalized, reasons: risk.reasons },
      riskScore: risk.score,
    });
    res.status(429).json({
      error: "Trop de tentatives de connexion. Compte temporairement bloqué pendant 15 minutes.",
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      or(eq(usersTable.phone, normalized), eq(usersTable.username, normalized)),
    )
    .limit(1);

  if (!user) {
    /* Record failed attempt */
    isRateLimited(`login_fail_ip:${ip}`, 99999, 15 * 60_000);
    isRateLimited(`login_fail_user:${normalized}`, 99999, 15 * 60_000);
    res.status(401).json({ error: "Identifiants invalides" });
    return;
  }

  /* Blocked user check */
  if (user.status === "Bloqué") {
    res.status(403).json({
      error: "Votre compte a été suspendu.",
      reason: user.blockedReason ?? "Activité suspecte détectée",
    });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({
      error: "Ce compte utilise la connexion Google. Veuillez vous connecter avec Google.",
    });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    isRateLimited(`login_fail_ip:${ip}`, 99999, 15 * 60_000);
    isRateLimited(`login_fail_user:${normalized}`, 99999, 15 * 60_000);

    if (risk.level === "suspicious") {
      await logSecurityEvent({
        userId: user.id,
        eventType: "login_failed_suspicious",
        severity: "medium",
        ip,
        userAgent: ua,
        details: { reasons: risk.reasons },
        riskScore: risk.score,
      });
    }
    res.status(401).json({ error: "Identifiants invalides" });
    return;
  }

  /* Success — reset fail counters */
  resetKey(`login_fail_ip:${ip}`);
  resetKey(`login_fail_user:${normalized}`);

  const session = await createSession(user.id);
  setSessionCookie(res, session.id, session.expiresAt);

  const otpEnabled = await isEmailOtpEnabled();

  /* Check if email is not yet verified */
  if (!user.emailVerified) {
    if (!otpEnabled) {
      /* OTP disabled — auto-verify the account and proceed normally */
      await db.update(usersTable).set({ emailVerified: true, lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
      res.json({ user: { ...toUser(user), emailVerified: true }, token: session.id });
      return;
    }
    try {
      const otpCode = await createOtp(user.id, "email_verification");
      await sendOtpEmail(user.email, otpCode, "register", user.fullName);
    } catch (emailErr) {
      logger.error({ err: emailErr }, "[auth] email verification OTP error");
    }
    res.json({ user: toUser(user), token: session.id, requiresEmailVerification: true });
    return;
  }

  /* Check inactivity (10+ days) — also skip if OTP disabled */
  if (otpEnabled && isUserInactive(user.lastLoginAt ?? null)) {
    try {
      const otpCode = await createOtp(user.id, "inactivity_check");
      await sendOtpEmail(user.email, otpCode, "inactivity", user.fullName);
    } catch (emailErr) {
      logger.error({ err: emailErr }, "[auth] inactivity OTP email error");
    }
    res.json({ user: toUser(user), token: session.id, requiresInactivityCheck: true });
    return;
  }

  /* Normal login — update last login timestamp + log history */
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  /* Log login history (fire-and-forget) */
  void (async () => {
    try {
      const ua = req.headers["user-agent"] ?? "";
      const deviceType = /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop";
      await db.insert(loginHistoryTable).values({
        userId: user.id,
        ip,
        userAgent: ua,
        deviceType,
        success: "true",
      });
    } catch { /* non-fatal */ }
  })();

  res.json({ user: toUser(user), token: session.id });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  if (req.sessionId) await deleteSession(req.sessionId);
  clearSessionCookie(res);
  res.json({ success: true });
});

router.patch("/auth/me/password", requireAuth, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || typeof currentPassword !== "string") {
    res.status(400).json({ error: "Mot de passe actuel requis" });
    return;
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères" });
    return;
  }
  const user = req.user!;
  if (!user.passwordHash) {
    res.status(400).json({ error: "Impossible de changer le mot de passe pour ce compte" });
    return;
  }
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Mot de passe actuel incorrect" });
    return;
  }
  const newHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));
  res.json({ success: true });
});

router.post("/ratings", requireAuth, async (req, res): Promise<void> => {
  const { score } = req.body;
  if (!score || typeof score !== "number" || score < 1 || score > 5) {
    res.status(400).json({ error: "Note invalide (1-5 requis)" });
    return;
  }
  res.json({ success: true, score });
});

router.patch("/auth/me/avatar", requireAuth, async (req, res): Promise<void> => {
  const { avatar } = req.body;
  if (!avatar || typeof avatar !== "string") {
    res.status(400).json({ error: "Avatar requis" });
    return;
  }
  const isDataUrl = avatar.startsWith("data:image/");
  const isHttps = avatar.startsWith("https://");
  if (!isDataUrl && !isHttps) {
    res.status(400).json({ error: "Format invalide. Utilisez une image ou URL HTTPS." });
    return;
  }
  if (isDataUrl && avatar.length > 3_000_000) {
    res.status(400).json({ error: "Image trop grande (max 2MB)" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ avatar })
    .where(eq(usersTable.id, req.user!.id))
    .returning();
  if (!user) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }
  res.json({ avatar: user.avatar });
});

router.patch("/auth/me/profile", requireAuth, async (req, res): Promise<void> => {
  const { fullName, email, username } = req.body;
  const updates: Record<string, unknown> = {};
  if (fullName && typeof fullName === "string") updates.fullName = fullName.trim();
  if (email && typeof email === "string" && email.includes("@")) updates.email = email.trim().toLowerCase();
  if (username && typeof username === "string") {
    const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean.length >= 3) updates.username = clean;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Aucun champ valide à mettre à jour" });
    return;
  }
  try {
    const [user] = await db
      .update(usersTable)
      .set(updates as any)
      .where(eq(usersTable.id, req.user!.id))
      .returning();
    if (!user) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }
    res.json({ user: toUser(user) });
  } catch (err: unknown) {
    /* Postgres unique constraint violation → code 23505 */
    const pgCode = (err as { code?: string })?.code;
    const pgDetail: string = (err as { detail?: string })?.detail ?? "";
    if (pgCode === "23505") {
      if (pgDetail.includes("username")) {
        res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris. Veuillez en choisir un autre." });
      } else if (pgDetail.includes("email")) {
        res.status(409).json({ error: "Cette adresse e-mail est déjà utilisée par un autre compte." });
      } else {
        res.status(409).json({ error: "Ces informations sont déjà utilisées par un autre compte." });
      }
      return;
    }
    /* Any other DB error — log it but never expose raw SQL to the client */
    const { logger } = await import("../lib/logger");
    logger.error({ err }, "[profile] Unexpected error updating user profile");
    res.status(500).json({ error: "Une erreur est survenue lors de la mise à jour du profil. Réessayez." });
  }
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const allTx = await db
    .select()
    .from(
      (await import("@workspace/db")).transactionsTable,
    )
    .where(eq((await import("@workspace/db")).transactionsTable.userId, user.id));
  const totalSpent = allTx
    .filter((t) => t.type === "purchase" && t.status === "completed")
    .reduce((sum: number, t) => sum + t.amount, 0);
  res.json(toUser(user, { totalSpent, transactionsCount: allTx.length }));
});

/* ─── API Key management ─────────────────────────────────────────────── */

function generateApiKey(): string {
  return "simix_" + crypto.randomBytes(24).toString("hex");
}

router.get("/auth/me/api-key", requireAuth, async (req, res): Promise<void> => {
  let user = req.user!;
  if (!user.apiKey) {
    const newKey = generateApiKey();
    const [updated] = await db
      .update(usersTable)
      .set({ apiKey: newKey })
      .where(eq(usersTable.id, user.id))
      .returning();
    user = updated;
  }
  res.json({ apiKey: user.apiKey });
});

router.post("/auth/me/api-key/regenerate", requireAuth, async (req, res): Promise<void> => {
  const newKey = generateApiKey();
  const [updated] = await db
    .update(usersTable)
    .set({ apiKey: newKey })
    .where(eq(usersTable.id, req.user!.id))
    .returning();
  res.json({ apiKey: updated.apiKey });
});

/* ─── Webhook URL management ─────────────────────────────────────────── */

router.get("/auth/me/webhook", requireAuth, async (req, res): Promise<void> => {
  res.json({ webhookUrl: req.user!.webhookUrl ?? null });
});

router.patch("/auth/me/webhook", requireAuth, async (req, res): Promise<void> => {
  const { webhookUrl } = req.body as { webhookUrl?: string | null };

  if (webhookUrl) {
    try {
      const url = new URL(webhookUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        res.status(400).json({ error: "URL invalide — utilisez http:// ou https://" });
        return;
      }
    } catch {
      res.status(400).json({ error: "URL webhook invalide" });
      return;
    }
  }

  const [updated] = await db
    .update(usersTable)
    .set({ webhookUrl: webhookUrl?.trim() || null })
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  res.json({ webhookUrl: updated.webhookUrl ?? null });
});

router.post("/auth/me/webhook/test", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const webhookUrl = user.webhookUrl;

  if (!webhookUrl) {
    res.status(400).json({ error: "Aucune URL webhook configurée" });
    return;
  }

  const payload = {
    event: "webhook.test",
    timestamp: new Date().toISOString(),
    data: {
      message: "Ceci est un événement de test envoyé depuis votre panel Simix.",
      userId: user.id,
    },
  };

  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", user.apiKey ?? "no-key")
    .update(body)
    .digest("hex");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Simix-Signature": signature,
        "X-Simix-Event": "webhook.test",
        "User-Agent": "Simix-Webhook/1.0",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (r.ok || (r.status >= 200 && r.status < 300)) {
      res.json({ ok: true, status: r.status });
    } else {
      res.status(422).json({ error: `Serveur webhook a répondu ${r.status}` });
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      res.status(408).json({ error: "Timeout — votre serveur n'a pas répondu dans les 8 secondes" });
    } else {
      res.status(502).json({ error: "Impossible de joindre l'URL webhook" });
    }
  }
});

export default router;
