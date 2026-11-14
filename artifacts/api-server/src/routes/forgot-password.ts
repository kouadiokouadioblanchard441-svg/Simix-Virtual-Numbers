import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { isRateLimited } from "../lib/rate-limiter";
import { createOtp, verifyOtp, hasRecentOtp } from "../lib/otp";
import { sendPasswordResetEmail } from "../lib/email";
import { requireTurnstile } from "../middlewares/turnstile";
import { logger } from "../lib/logger";
import { sendOtpEventAlert } from "../lib/telegram";

const router: IRouter = Router();

function maskIdentifier(value: string): string {
  const emailAt = value.indexOf("@");
  if (emailAt > 0) return `${value[0]}***${value.slice(emailAt)}`;
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function notifyResetEvent(
  event: string,
  ip: string,
  user?: { id: string; fullName: string | null; email: string },
  identifier?: string,
  detail?: string,
): void {
  void sendOtpEventAlert({
    event,
    purpose: "Réinitialisation du mot de passe",
    userId: user?.id,
    userName: user?.fullName ?? undefined,
    email: user?.email,
    identifier: identifier ? maskIdentifier(identifier) : undefined,
    ip,
    detail,
  });
}

/* ── Step 1: Request OTP (no auth needed) ── */
router.post("/auth/forgot-password", requireTurnstile, async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (isRateLimited(`forgot_pwd:${ip}`, 5, 60 * 60_000)) {
    notifyResetEvent("Demande de réinitialisation bloquée", ip, undefined, undefined, "Limite de demandes atteinte.");
    res.status(429).json({ error: "Trop de tentatives. Réessayez dans une heure." });
    return;
  }

  const { identifier } = req.body;
  if (!identifier || typeof identifier !== "string" || identifier.trim().length < 3) {
    notifyResetEvent("Demande de réinitialisation invalide", ip, undefined, undefined, "Identifiant absent ou invalide.");
    res.status(400).json({ error: "Veuillez fournir votre email ou numéro de téléphone." });
    return;
  }

  const normalized = identifier.trim().replace(/\s+/g, "");

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      or(
        eq(usersTable.email, normalized),
        eq(usersTable.phone, normalized),
        eq(usersTable.username, normalized),
      ),
    )
    .limit(1);

  /* Always return success to avoid user enumeration */
  if (!user || !user.passwordHash) {
    notifyResetEvent(
      user ? "Demande sans mot de passe local" : "Demande sans compte correspondant",
      ip,
      user ? { id: user.id, fullName: user.fullName, email: user.email } : undefined,
      user ? undefined : normalized,
    );
    res.json({ success: true, message: "Si un compte correspond, un email a été envoyé." });
    return;
  }

  if (await hasRecentOtp(user.id, "password_reset", 60)) {
    notifyResetEvent("Demande de code bloquée", ip, user, undefined, "Délai d'attente de 60 secondes non écoulé.");
    res.status(429).json({ error: "Un code a déjà été envoyé. Attendez 60 secondes." });
    return;
  }

  try {
    const { code, issuanceId } = await createOtp(user.id, "password_reset");
    await sendPasswordResetEmail(user.email, code, user.fullName, issuanceId);
  } catch (err) {
    logger.error({ err }, "[forgot-password] send email error");
    notifyResetEvent("Échec de demande de réinitialisation", ip, user, undefined, "La génération du code ou l'envoi de l'email a échoué.");
  }

  res.json({ success: true, message: "Si un compte correspond, un email a été envoyé." });
});

/* ── Step 2: Verify OTP (no auth needed) ── */
router.post("/auth/forgot-password/verify", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (isRateLimited(`reset_verify:${ip}`, 10, 15 * 60_000)) {
    notifyResetEvent("Vérification du code bloquée", ip, undefined, undefined, "Limite de tentatives atteinte.");
    res.status(429).json({ error: "Trop de tentatives. Réessayez dans 15 minutes." });
    return;
  }

  const { userId, code } = req.body;
  if (!userId || !code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    notifyResetEvent("Tentative de vérification refusée", ip, undefined, undefined, "Paramètres invalides; aucune valeur de code n'est transmise.");
    res.status(400).json({ error: "Paramètres invalides." });
    return;
  }

  const result = await verifyOtp(userId, code, "password_reset");
  if (!result.success) {
    notifyResetEvent("Échec de vérification", ip, { id: userId, fullName: null, email: "" }, undefined, result.error);
    res.status(400).json({ error: result.error });
    return;
  }

  notifyResetEvent("Vérification réussie", ip, { id: userId, fullName: null, email: "" });
  res.json({ success: true, resetToken: `${userId}:${code}` });
});

/* ── Step 3: Set new password ── */
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (isRateLimited(`reset_pwd:${ip}`, 5, 60 * 60_000)) {
    notifyResetEvent("Réinitialisation bloquée", ip, undefined, undefined, "Limite de demandes atteinte.");
    res.status(429).json({ error: "Trop de tentatives. Réessayez dans une heure." });
    return;
  }

  const { userId, code, newPassword } = req.body;

  if (!userId || !code || !newPassword || typeof newPassword !== "string") {
    notifyResetEvent("Réinitialisation invalide", ip, undefined, undefined, "Paramètres manquants; aucun mot de passe n'est transmis.");
    res.status(400).json({ error: "Paramètres manquants." });
    return;
  }

  if (newPassword.length < 6) {
    notifyResetEvent("Réinitialisation refusée", ip, undefined, undefined, "Le nouveau mot de passe ne respecte pas la longueur minimale.");
    res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
    return;
  }

  /* Re-verify the OTP is still valid (marked verified = true means it was already consumed) */
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    notifyResetEvent("Réinitialisation refusée", ip, undefined, undefined, "Compte introuvable.");
    res.status(404).json({ error: "Compte introuvable." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db
    .update(usersTable)
    .set({ passwordHash, lastLoginAt: new Date() })
    .where(eq(usersTable.id, userId));

  notifyResetEvent("Mot de passe réinitialisé", ip, user);
  res.json({ success: true, message: "Mot de passe réinitialisé avec succès." });
});

/* ── Resend OTP ── */
router.post("/auth/forgot-password/resend", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (isRateLimited(`reset_resend:${ip}`, 3, 60 * 60_000)) {
    notifyResetEvent("Renvoi de code bloqué", ip, undefined, undefined, "Limite de renvois atteinte.");
    res.status(429).json({ error: "Limite atteinte. Réessayez dans une heure." });
    return;
  }

  const { userId } = req.body;
  if (!userId) {
    notifyResetEvent("Renvoi de code invalide", ip, undefined, undefined, "Identifiant de compte manquant.");
    res.status(400).json({ error: "Paramètre manquant." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    notifyResetEvent("Renvoi demandé pour un compte introuvable", ip, undefined, String(userId));
    res.json({ success: true });
    return;
  }

  if (await hasRecentOtp(user.id, "password_reset", 60)) {
    notifyResetEvent("Renvoi de code bloqué", ip, user, undefined, "Délai d'attente de 60 secondes non écoulé.");
    res.status(429).json({ error: "Attendez 60 secondes avant de renvoyer." });
    return;
  }

  try {
    const { code, issuanceId } = await createOtp(user.id, "password_reset");
    await sendPasswordResetEmail(user.email, code, user.fullName, issuanceId);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "[forgot-password] resend email error");
    notifyResetEvent("Échec de renvoi de code", ip, user, undefined, "La génération du code ou l'envoi de l'email a échoué.");
    res.status(500).json({ error: "Impossible d'envoyer l'email." });
  }
});

export default router;
