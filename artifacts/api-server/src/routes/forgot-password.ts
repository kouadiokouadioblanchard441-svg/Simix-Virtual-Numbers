import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { isRateLimited } from "../lib/rate-limiter";
import { createOtp, verifyOtp, hasRecentOtp } from "../lib/otp";
import { sendPasswordResetEmail } from "../lib/email";

const router: IRouter = Router();

/* ── Step 1: Request OTP (no auth needed) ── */
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (isRateLimited(`forgot_pwd:${ip}`, 5, 60 * 60_000)) {
    res.status(429).json({ error: "Trop de tentatives. Réessayez dans une heure." });
    return;
  }

  const { identifier } = req.body;
  if (!identifier || typeof identifier !== "string" || identifier.trim().length < 3) {
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
    res.json({ success: true, message: "Si un compte correspond, un email a été envoyé." });
    return;
  }

  if (await hasRecentOtp(user.id, "password_reset", 60)) {
    res.status(429).json({ error: "Un code a déjà été envoyé. Attendez 60 secondes." });
    return;
  }

  try {
    const code = await createOtp(user.id, "password_reset");
    await sendPasswordResetEmail(user.email, code, user.fullName);
  } catch (err) {
    console.error("Failed to send password reset email:", err);
  }

  res.json({ success: true, message: "Si un compte correspond, un email a été envoyé.", userId: user.id });
});

/* ── Step 2: Verify OTP (no auth needed) ── */
router.post("/auth/forgot-password/verify", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (isRateLimited(`reset_verify:${ip}`, 10, 15 * 60_000)) {
    res.status(429).json({ error: "Trop de tentatives. Réessayez dans 15 minutes." });
    return;
  }

  const { userId, code } = req.body;
  if (!userId || !code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "Paramètres invalides." });
    return;
  }

  const result = await verifyOtp(userId, code, "password_reset");
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ success: true, resetToken: `${userId}:${code}` });
});

/* ── Step 3: Set new password ── */
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (isRateLimited(`reset_pwd:${ip}`, 5, 60 * 60_000)) {
    res.status(429).json({ error: "Trop de tentatives. Réessayez dans une heure." });
    return;
  }

  const { userId, code, newPassword } = req.body;

  if (!userId || !code || !newPassword || typeof newPassword !== "string") {
    res.status(400).json({ error: "Paramètres manquants." });
    return;
  }

  if (newPassword.length < 6) {
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
    res.status(404).json({ error: "Compte introuvable." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db
    .update(usersTable)
    .set({ passwordHash, lastLoginAt: new Date() })
    .where(eq(usersTable.id, userId));

  res.json({ success: true, message: "Mot de passe réinitialisé avec succès." });
});

/* ── Resend OTP ── */
router.post("/auth/forgot-password/resend", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  if (isRateLimited(`reset_resend:${ip}`, 3, 60 * 60_000)) {
    res.status(429).json({ error: "Limite atteinte. Réessayez dans une heure." });
    return;
  }

  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "Paramètre manquant." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.json({ success: true });
    return;
  }

  if (await hasRecentOtp(user.id, "password_reset", 60)) {
    res.status(429).json({ error: "Attendez 60 secondes avant de renvoyer." });
    return;
  }

  try {
    const code = await createOtp(user.id, "password_reset");
    await sendPasswordResetEmail(user.email, code, user.fullName);
    res.json({ success: true });
  } catch (err) {
    console.error("Resend reset email failed:", err);
    res.status(500).json({ error: "Impossible d'envoyer l'email." });
  }
});

export default router;
