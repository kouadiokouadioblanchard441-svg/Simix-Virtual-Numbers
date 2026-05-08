import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import {
  createSession,
  deleteSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from "../lib/auth";
import { toUser } from "../lib/serializers";
import { isRateLimited, resetKey } from "../lib/rate-limiter";
import { assessLoginRisk, logSecurityEvent } from "../lib/fraud-detection";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

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

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone))
    .limit(1);

  if (existing) {
    res.status(400).json({ error: "Un compte existe déjà pour ce numéro de téléphone." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const username = `user_${normalizedPhone.replace(/[^0-9]/g, "").slice(-6)}`;
  const safeEmail =
    email && email.trim().length > 0 ? email.trim() : `${username}@simix.app`;

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
    })
    .returning();

  if (!user) {
    res.status(500).json({ error: "Création de compte échouée" });
    return;
  }

  const session = await createSession(user.id);
  setSessionCookie(res, session.id, session.expiresAt);
  res.json({ user: toUser(user), token: session.id });
});

router.post("/auth/login", async (req, res): Promise<void> => {
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
  res.json({ user: toUser(user), token: session.id });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  if (req.sessionId) await deleteSession(req.sessionId);
  clearSessionCookie(res);
  res.json({ success: true });
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
  const [user] = await db
    .update(usersTable)
    .set(updates as any)
    .where(eq(usersTable.id, req.user!.id))
    .returning();
  if (!user) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }
  res.json({ user: toUser(user) });
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
    .reduce((sum, t) => sum + t.amount, 0);
  res.json(toUser(user, { totalSpent, transactionsCount: allTx.length }));
});

export default router;
