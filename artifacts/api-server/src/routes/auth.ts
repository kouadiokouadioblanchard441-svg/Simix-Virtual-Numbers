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

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
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
    res
      .status(400)
      .json({ error: "Un compte existe déjà pour ce numéro de téléphone." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const username = `user_${normalizedPhone.replace(/[^0-9]/g, "").slice(-6)}`;
  const safeEmail =
    email && email.trim().length > 0
      ? email.trim()
      : `${username}@simix.app`;

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
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { identifier, password } = parsed.data;
  const normalized = identifier.replace(/\s+/g, "");

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      or(
        eq(usersTable.phone, normalized),
        eq(usersTable.username, normalized),
      ),
    )
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Identifiants invalides" });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Identifiants invalides" });
    return;
  }

  const session = await createSession(user.id);
  setSessionCookie(res, session.id, session.expiresAt);

  res.json({ user: toUser(user), token: session.id });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  if (req.sessionId) {
    await deleteSession(req.sessionId);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  // Compute lightweight account totals
  const { transactionsTable } = await import("@workspace/db");
  const allTx = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, user.id));
  const totalSpent = allTx
    .filter((t) => t.type === "purchase" && t.status === "completed")
    .reduce((sum, t) => sum + t.amount, 0);
  const transactionsCount = allTx.length;

  res.json(toUser(user, { totalSpent, transactionsCount }));
});

export default router;
