import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, emailOtpTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { isRateLimited } from "../lib/rate-limiter";
import { createOtp, verifyOtp, hasRecentOtp, isUserInactive } from "../lib/otp";
import { sendOtpEmail } from "../lib/email";

const router: IRouter = Router();

router.post("/auth/otp/send", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const ip = req.ip ?? "unknown";

  if (isRateLimited(`otp_send:${user.id}`, 5, 60 * 60_000)) {
    res.status(429).json({ error: "Trop de demandes. Réessayez dans une heure." });
    return;
  }

  const purpose = user.emailVerified ? "inactivity_check" : "email_verification";

  if (await hasRecentOtp(user.id, purpose, 60)) {
    res.status(429).json({ error: "Un code a déjà été envoyé. Attendez 60 secondes avant de renvoyer." });
    return;
  }

  try {
    const code = await createOtp(user.id, purpose);
    await sendOtpEmail(user.email, code, purpose === "email_verification" ? "register" : "inactivity");
    res.json({ success: true, message: `Code envoyé à ${user.email}` });
  } catch (err) {
    console.error("OTP send error:", err);
    res.status(500).json({ error: "Impossible d'envoyer l'email. Vérifiez votre adresse email." });
  }
});

router.post("/auth/otp/verify", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const ip = req.ip ?? "unknown";
  const { code } = req.body;

  if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "Code invalide. Entrez les 6 chiffres." });
    return;
  }

  if (isRateLimited(`otp_verify:${user.id}`, 10, 15 * 60_000)) {
    res.status(429).json({ error: "Trop de tentatives. Réessayez dans 15 minutes." });
    return;
  }

  const purpose = user.emailVerified ? "inactivity_check" : "email_verification";
  const result = await verifyOtp(user.id, code, purpose);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  await db
    .update(usersTable)
    .set({
      emailVerified: true,
      lastLoginAt: new Date(),
      verified: true,
    })
    .where(eq(usersTable.id, user.id));

  res.json({ success: true, message: "Email vérifié avec succès." });
});

router.post("/auth/otp/resend", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;

  if (isRateLimited(`otp_resend:${user.id}`, 3, 60 * 60_000)) {
    res.status(429).json({ error: "Limite de renvoi atteinte. Réessayez dans une heure." });
    return;
  }

  if (await hasRecentOtp(user.id, "email_verification", 60)) {
    res.status(429).json({ error: "Attendez 60 secondes avant de renvoyer le code." });
    return;
  }

  try {
    const purpose = user.emailVerified ? "inactivity_check" : "email_verification";
    const code = await createOtp(user.id, purpose);
    await sendOtpEmail(user.email, code, purpose === "email_verification" ? "register" : "inactivity");
    res.json({ success: true, message: `Nouveau code envoyé à ${user.email}` });
  } catch (err) {
    console.error("OTP resend error:", err);
    res.status(500).json({ error: "Impossible d'envoyer l'email." });
  }
});

router.get("/auth/otp/status", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const needsEmailVerification = !user.emailVerified;
  const needsInactivityCheck = user.emailVerified && isUserInactive(user.lastLoginAt ?? null);

  res.json({
    needsVerification: needsEmailVerification || needsInactivityCheck,
    needsEmailVerification,
    needsInactivityCheck,
    email: user.email,
  });
});

export default router;
