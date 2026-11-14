import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { createSession, requireAuth, setSessionCookie } from "../lib/auth";
import { isEmailOtpEnabled } from "../lib/settings";
import { createOtp, isUserInactive } from "../lib/otp";
import { sendOtpEmail } from "../lib/email";
import {
  getPersistentTemporaryLockRemaining,
  isPersistentRateLimited,
  recordPersistentFailedAttemptAndLock,
  resetPersistentKey,
  resetPersistentTemporaryLock,
} from "../lib/rate-limiter";
import { toUser } from "../lib/serializers";
import { notifySuccessfulLogin } from "../lib/login-notifications";
import { sendOtpEventAlert } from "../lib/telegram";
import {
  clearAccountPin,
  getLoginTwoFactorChallengeUserId,
  getAccountSecurityStatus,
  setAccountPin,
  setAccountTwoFactor,
  verifyAccountPin,
  verifyLoginTwoFactorChallenge,
} from "../lib/account-security";

const router: IRouter = Router();
const TWO_FACTOR_MAX_FAILURES = 5;
const TWO_FACTOR_LOCKOUT_MS = 10 * 60_000;

function twoFactorLockKeys(userId: string): { attempts: string; lock: string } {
  return {
    attempts: `login_2fa_attempt_user:${userId}`,
    lock: `login_2fa_lock_user:${userId}`,
  };
}

router.get("/auth/me/security", requireAuth, async (req, res): Promise<void> => {
  const settings = await getAccountSecurityStatus(req.user!.id);
  res.json({
    ...settings,
    emailVerified: req.user!.emailVerified,
    canUseTwoFactor: Boolean(req.user!.passwordHash && req.user!.emailVerified),
  });
});

router.put("/auth/me/pin", requireAuth, async (req, res): Promise<void> => {
  const { pin } = req.body ?? {};
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: "Le PIN doit contenir exactement 6 chiffres." });
    return;
  }

  const saved = await setAccountPin(req.user!.id, pin);
  if (!saved) {
    res.status(503).json({
      error: "Les réglages de sécurité seront disponibles après la mise à jour du serveur.",
    });
    return;
  }
  res.json({ success: true, pinEnabled: true });
});

router.post("/auth/me/pin/verify", requireAuth, async (req, res): Promise<void> => {
  const { pin } = req.body ?? {};
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: "Le PIN doit contenir exactement 6 chiffres." });
    return;
  }

  const result = await verifyAccountPin(req.user!.id, pin);
  if (!result.available) {
    res.status(503).json({
      error: "La vérification du PIN sera disponible après la mise à jour du serveur.",
    });
    return;
  }
  if (!result.configured) {
    res.status(409).json({ error: "Aucun PIN n'est configuré pour ce compte." });
    return;
  }
  if (result.success) {
    res.json({ success: true, attemptsRemaining: result.attemptsRemaining });
    return;
  }

  if (result.locked) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil(result.remainingMs / 1000))));
    res.status(429).json({
      error: "Trop de tentatives. Le PIN est bloqué pendant 5 minutes.",
      locked: true,
      remainingMs: result.remainingMs,
      attemptsRemaining: 0,
    });
    return;
  }

  res.status(401).json({
    error: "PIN incorrect.",
    attemptsRemaining: result.attemptsRemaining,
  });
});

router.delete("/auth/me/pin", requireAuth, async (req, res): Promise<void> => {
  const removed = await clearAccountPin(req.user!.id);
  if (!removed) {
    res.status(503).json({
      error: "Les réglages de sécurité seront disponibles après la mise à jour du serveur.",
    });
    return;
  }
  res.json({ success: true, pinEnabled: false });
});

router.patch("/auth/me/two-factor", requireAuth, async (req, res): Promise<void> => {
  const { enabled, currentPassword } = req.body ?? {};
  if (typeof enabled !== "boolean" || typeof currentPassword !== "string" || !currentPassword) {
    res.status(400).json({
      error: "Le mot de passe actuel et l'état souhaité sont requis.",
    });
    return;
  }

  const user = req.user!;
  if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Mot de passe actuel incorrect." });
    return;
  }
  if (enabled && !user.emailVerified) {
    res.status(409).json({
      error: "Confirmez d'abord votre adresse e-mail avant d'activer la 2FA.",
    });
    return;
  }

  const saved = await setAccountTwoFactor(user.id, enabled);
  if (!saved) {
    res.status(503).json({
      error: "Les réglages de sécurité seront disponibles après la mise à jour du serveur.",
    });
    return;
  }
  res.json({ success: true, twoFactorEnabled: enabled });
});

router.post("/auth/login/2fa/verify", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";
  const userAgent = req.headers["user-agent"] ?? "";
  const { challengeId, code } = req.body ?? {};

  if (await isPersistentRateLimited(`login_2fa_verify_ip:${ip}`, 20, 15 * 60_000)) {
    void sendOtpEventAlert({
      event: "Vérification 2FA bloquée",
      purpose: "Connexion",
      ip,
      detail: "Limite de requêtes atteinte; aucune valeur de code n'est transmise.",
    });
    res.status(429).json({ error: "Trop de tentatives. Réessayez dans 15 minutes." });
    return;
  }

  if (
    typeof challengeId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)
    || typeof code !== "string"
    || !/^\d{6}$/.test(code)
  ) {
    void sendOtpEventAlert({
      event: "Tentative 2FA refusée",
      purpose: "Connexion",
      ip,
      detail: "Format de demande invalide; aucune valeur de code n'est transmise.",
    });
    res.status(400).json({ error: "Code ou session de vérification invalide." });
    return;
  }

  const userId = await getLoginTwoFactorChallengeUserId(challengeId);
  if (!userId) {
    void sendOtpEventAlert({
      event: "Tentative 2FA refusée",
      purpose: "Connexion",
      ip,
      detail: "Challenge introuvable ou déjà utilisé.",
    });
    res.status(400).json({ error: "Code expiré ou introuvable. Recommencez la connexion." });
    return;
  }

  const [challengeUser] = await db
    .select({
      fullName: usersTable.fullName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const lockKeys = twoFactorLockKeys(userId);
  const lockRemaining = await getPersistentTemporaryLockRemaining(lockKeys.lock);
  if (lockRemaining > 0) {
    void sendOtpEventAlert({
      event: "Tentative 2FA sur un compte bloqué",
      purpose: "Connexion",
      userId,
      userName: challengeUser?.fullName ?? undefined,
      email: challengeUser?.email ?? undefined,
      ip,
      detail: "Le compte reste bloqué; aucune valeur de code n'est transmise.",
    });
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil(lockRemaining / 1000))));
    res.status(429).json({ error: "Compte temporairement bloqué après plusieurs codes incorrects." });
    return;
  }

  const verification = await verifyLoginTwoFactorChallenge(challengeId, code);
  if (verification.status !== "valid") {
    if (verification.status === "invalid" || verification.status === "exhausted") {
      const lockTriggered = await recordPersistentFailedAttemptAndLock(
        lockKeys.attempts,
        lockKeys.lock,
        TWO_FACTOR_MAX_FAILURES - 1,
        TWO_FACTOR_LOCKOUT_MS,
      );
      const attemptsRemaining = await getPersistentTemporaryLockRemaining(lockKeys.lock);
      void sendOtpEventAlert({
        event: lockTriggered ? "Compte bloqué après échecs 2FA" : "Échec de vérification 2FA",
        purpose: "Connexion",
        userId,
        userName: challengeUser?.fullName ?? undefined,
        email: challengeUser?.email ?? undefined,
        ip,
        detail: "Code incorrect; la valeur saisie n'est jamais envoyée dans l'alerte.",
      });
      if (lockTriggered || attemptsRemaining > 0) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((attemptsRemaining || TWO_FACTOR_LOCKOUT_MS) / 1000))));
        res.status(429).json({ error: "Trop de codes incorrects. Réessayez dans 10 minutes." });
        return;
      }
      res.status(401).json({
        error: verification.status === "exhausted"
          ? "Trop de tentatives sur ce code. Recommencez la connexion."
          : "Code incorrect.",
        attemptsRemaining: verification.status === "invalid"
          ? verification.attemptsRemaining
          : 0,
      });
      return;
    }

    void sendOtpEventAlert({
      event: "Code 2FA expiré",
      purpose: "Connexion",
      userId,
      userName: challengeUser?.fullName ?? undefined,
      email: challengeUser?.email ?? undefined,
      ip,
      detail: "Le challenge a expiré ou a déjà été consommé.",
    });
    res.status(400).json({ error: "Code expiré ou déjà utilisé. Recommencez la connexion." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const security = await getAccountSecurityStatus(userId);
  if (
    !user
    || user.status === "Bloqué"
    || !user.emailVerified
    || !security.available
    || !security.twoFactorEnabled
  ) {
    res.status(401).json({ error: "Cette connexion ne peut plus être validée. Recommencez." });
    return;
  }

  await resetPersistentKey(lockKeys.attempts);
  await resetPersistentTemporaryLock(lockKeys.lock);
  const session = await createSession(user.id);
  setSessionCookie(res, session.id, session.expiresAt);
  const otpEnabled = await isEmailOtpEnabled();
  if (otpEnabled && isUserInactive(user.lastLoginAt ?? null)) {
    try {
      const { code: otpCode, issuanceId } = await createOtp(user.id, "inactivity_check");
      await sendOtpEmail(user.email, otpCode, "inactivity", user.fullName, issuanceId);
    } catch {
      void sendOtpEventAlert({
        event: "Échec d'envoi du code",
        purpose: "Contrôle d'inactivité",
        userId: user.id,
        userName: user.fullName,
        email: user.email,
        ip,
        detail: "Le code n'a pas pu être généré ou envoyé après la vérification 2FA.",
      });
    }
    res.json({ user: toUser(user), requiresInactivityCheck: true });
    return;
  }

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));
  notifySuccessfulLogin(user, ip, userAgent);
  res.json({ user: toUser(user) });
});

export default router;
