/**
 * Admin Support Routes — AI customer support management
 * Protected by requireAdmin middleware
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc, asc, count, and, gte, sql } from "drizzle-orm";
import {
  db,
  supportConversationsTable,
  supportMessagesTable,
  aiKnowledgeBaseTable,
  aiSupportConfigTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";

const router: IRouter = Router();

/* JWT must be verified first on all admin support routes */
router.use(requireAdminJwt);

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  if (!req.user.isAdmin) { res.status(403).json({ error: "Accès réservé aux administrateurs" }); return; }
  next();
}

/* ─── DEFAULT AI CONFIG SEED ─────────────────────────────── */
const DEFAULT_AI_CONFIG: Array<{ key: string; value: string; label: string; group: string }> = [
  { key: "ai_name", value: "Simia", label: "Nom de l'assistante IA", group: "identite" },
  { key: "ai_display_title", value: "Support Simix", label: "Titre affiché dans le chat (ex: Support Simix)", group: "identite" },
  { key: "ai_avatar_url", value: "/support-avatar.png", label: "URL de l'avatar (image de profil du service client)", group: "identite" },
  { key: "ai_tone", value: "professional_friendly", label: "Ton (professional_friendly / formal / casual)", group: "comportement" },
  { key: "ai_language_mode", value: "auto", label: "Langue (auto / fr / en)", group: "comportement" },
  { key: "ai_greeting_fr", value: "👋 Bonjour ! Je suis Simia, votre assistante Simix. Comment puis-je vous aider aujourd'hui ? 😊", label: "Message d'accueil (FR)", group: "messages" },
  { key: "ai_greeting_en", value: "👋 Hello! I'm Simia, your Simix assistant. How can I help you today? 😊", label: "Message d'accueil (EN)", group: "messages" },
  { key: "ai_escalation_message", value: "Je vais transférer votre demande à un agent humain. Veuillez patienter ou contacter support@simix.app", label: "Message d'escalade", group: "messages" },
  { key: "ai_offline_message", value: "Notre équipe est actuellement hors ligne. Laissez votre message et nous répondrons dès que possible.", label: "Message hors ligne", group: "messages" },
  { key: "ai_business_hours", value: "Lun-Ven 08h-18h (UTC+0)", label: "Horaires de support", group: "horaires" },
  { key: "ai_response_style", value: "concise", label: "Style de réponse (concise / detailed)", group: "comportement" },
  { key: "ai_max_tokens", value: "1024", label: "Tokens max par réponse", group: "technique" },
  { key: "ai_enabled", value: "true", label: "IA activée", group: "technique" },
  { key: "ai_image_analysis", value: "true", label: "Analyse d'images activée", group: "technique" },
  { key: "ai_quick_replies_fr", value: "Comment recharger ?|Numéro pas reçu|SMS non reçu|Mon solde|Contacter le support", label: "Réponses rapides (FR, séparées par |)", group: "messages" },
  { key: "ai_quick_replies_en", value: "How to top up?|Number not received|SMS not received|My balance|Contact support", label: "Réponses rapides (EN, séparées par |)", group: "messages" },
  { key: "company_name", value: "Simix", label: "Nom de l'entreprise", group: "entreprise" },
  { key: "company_email", value: "support@simix.app", label: "Email support", group: "entreprise" },
  { key: "company_whatsapp", value: "", label: "Numéro WhatsApp support", group: "entreprise" },
  { key: "company_telegram", value: "", label: "Lien Telegram support", group: "entreprise" },
  { key: "company_phone", value: "", label: "Téléphone support", group: "entreprise" },
];

/* ─── CONVERSATIONS ───────────────────────────────────────── */

router.get("/admin/support/conversations", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const where = status ? eq(supportConversationsTable.status, status) : undefined;

  const rows = await db
    .select({
      id: supportConversationsTable.id,
      sessionId: supportConversationsTable.sessionId,
      status: supportConversationsTable.status,
      language: supportConversationsTable.language,
      userName: supportConversationsTable.userName,
      userEmail: supportConversationsTable.userEmail,
      isHumanTakeover: supportConversationsTable.isHumanTakeover,
      priority: supportConversationsTable.priority,
      agentNote: supportConversationsTable.agentNote,
      userId: supportConversationsTable.userId,
      createdAt: supportConversationsTable.createdAt,
      updatedAt: supportConversationsTable.updatedAt,
      userFullName: usersTable.fullName,
      userPhone: usersTable.phone,
    })
    .from(supportConversationsTable)
    .leftJoin(usersTable, eq(supportConversationsTable.userId, usersTable.id))
    .where(where)
    .orderBy(desc(supportConversationsTable.updatedAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db.select({ c: count() }).from(supportConversationsTable).where(where);

  res.json({ conversations: rows, total: totalRow?.c ?? 0 });
});

router.get("/admin/support/conversations/:id/messages", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  const msgs = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, id))
    .orderBy(asc(supportMessagesTable.createdAt));
  res.json({ messages: msgs });
});

router.post("/admin/support/conversations/:id/messages", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  const { content, imageData } = req.body as { content: string; imageData?: string };
  if (!content?.trim() && !imageData) { res.status(400).json({ error: "Message requis" }); return; }

  const [conv] = await db.select().from(supportConversationsTable).where(eq(supportConversationsTable.id, id)).limit(1);
  if (!conv) { res.status(404).json({ error: "Conversation introuvable" }); return; }

  const [msg] = await db.insert(supportMessagesTable).values({
    conversationId: id,
    role: "assistant",
    content: content?.trim() || "[Image]",
    imageData: imageData ?? null,
    sentByAdmin: true,
  }).returning();

  await db.update(supportConversationsTable)
    .set({ isHumanTakeover: true, status: "takeover", updatedAt: new Date() })
    .where(eq(supportConversationsTable.id, id));

  logger.info({ convId: id, adminId: req.user!.id }, "[admin-support] Admin replied to conversation");
  res.json({ message: msg });
});

router.put("/admin/support/conversations/:id/status", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  const { status, isHumanTakeover, agentNote, priority } = req.body as {
    status?: string;
    isHumanTakeover?: boolean;
    agentNote?: string;
    priority?: string;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (isHumanTakeover !== undefined) updates.isHumanTakeover = isHumanTakeover;
  if (agentNote !== undefined) updates.agentNote = agentNote;
  if (priority !== undefined) updates.priority = priority;

  await db.update(supportConversationsTable).set(updates).where(eq(supportConversationsTable.id, id));
  res.json({ success: true });
});

router.delete("/admin/support/conversations/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  await db.delete(supportConversationsTable).where(eq(supportConversationsTable.id, id));
  res.json({ success: true });
});

/* ─── ANALYTICS ───────────────────────────────────────────── */
router.get("/admin/support/stats", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalConvs] = await db.select({ c: count() }).from(supportConversationsTable);
  const [activeConvs] = await db.select({ c: count() }).from(supportConversationsTable).where(eq(supportConversationsTable.status, "active"));
  const [takeoverConvs] = await db.select({ c: count() }).from(supportConversationsTable).where(eq(supportConversationsTable.status, "takeover"));
  const [resolvedConvs] = await db.select({ c: count() }).from(supportConversationsTable).where(eq(supportConversationsTable.status, "resolved"));
  const [weekConvs] = await db.select({ c: count() }).from(supportConversationsTable).where(gte(supportConversationsTable.createdAt, weekAgo));
  const [dayConvs] = await db.select({ c: count() }).from(supportConversationsTable).where(gte(supportConversationsTable.createdAt, dayAgo));
  const [totalMsgs] = await db.select({ c: count() }).from(supportMessagesTable);
  const [adminMsgs] = await db.select({ c: count() }).from(supportMessagesTable).where(eq(supportMessagesTable.sentByAdmin, true));
  const [knowledgeEntries] = await db.select({ c: count() }).from(aiKnowledgeBaseTable);
  const [activeKnowledge] = await db.select({ c: count() }).from(aiKnowledgeBaseTable).where(eq(aiKnowledgeBaseTable.isActive, true));

  res.json({
    totalConversations: totalConvs?.c ?? 0,
    activeConversations: activeConvs?.c ?? 0,
    takeoverConversations: takeoverConvs?.c ?? 0,
    resolvedConversations: resolvedConvs?.c ?? 0,
    weeklyConversations: weekConvs?.c ?? 0,
    dailyConversations: dayConvs?.c ?? 0,
    totalMessages: totalMsgs?.c ?? 0,
    adminMessages: adminMsgs?.c ?? 0,
    knowledgeEntries: knowledgeEntries?.c ?? 0,
    activeKnowledgeEntries: activeKnowledge?.c ?? 0,
  });
});

/* ─── KNOWLEDGE BASE ──────────────────────────────────────── */
router.get("/admin/support/knowledge", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const category = req.query.category as string | undefined;
  const where = category ? eq(aiKnowledgeBaseTable.category, category) : undefined;
  const entries = await db
    .select()
    .from(aiKnowledgeBaseTable)
    .where(where)
    .orderBy(asc(aiKnowledgeBaseTable.category), asc(aiKnowledgeBaseTable.sortOrder), asc(aiKnowledgeBaseTable.title));
  res.json(entries);
});

router.post("/admin/support/knowledge", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { category, title, content, isActive, sortOrder } = req.body as {
    category: string;
    title: string;
    content: string;
    isActive?: boolean;
    sortOrder?: number;
  };
  if (!title?.trim() || !content?.trim()) { res.status(400).json({ error: "Titre et contenu requis" }); return; }

  const [entry] = await db.insert(aiKnowledgeBaseTable).values({
    category: category || "general",
    title: title.trim(),
    content: content.trim(),
    isActive: isActive !== false,
    sortOrder: sortOrder ?? 0,
  }).returning();

  res.status(201).json(entry);
});

router.put("/admin/support/knowledge/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  const { category, title, content, isActive, sortOrder } = req.body as {
    category?: string;
    title?: string;
    content?: string;
    isActive?: boolean;
    sortOrder?: number;
  };

  const updates: Record<string, unknown> = {};
  if (category !== undefined) updates.category = category;
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content.trim();
  if (isActive !== undefined) updates.isActive = isActive;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Aucun champ à mettre à jour" }); return; }

  const [entry] = await db.update(aiKnowledgeBaseTable).set(updates).where(eq(aiKnowledgeBaseTable.id, id)).returning();
  res.json(entry);
});

router.delete("/admin/support/knowledge/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  await db.delete(aiKnowledgeBaseTable).where(eq(aiKnowledgeBaseTable.id, id));
  res.json({ success: true });
});

/* ─── AI CONFIG ───────────────────────────────────────────── */
router.get("/admin/support/config", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const entries = await db.select().from(aiSupportConfigTable).orderBy(asc(aiSupportConfigTable.group), asc(aiSupportConfigTable.key));

  if (entries.length === 0) {
    await db.insert(aiSupportConfigTable).values(DEFAULT_AI_CONFIG).onConflictDoNothing();
    const seeded = await db.select().from(aiSupportConfigTable).orderBy(asc(aiSupportConfigTable.group), asc(aiSupportConfigTable.key));
    res.json(seeded);
    return;
  }

  const map = Object.fromEntries(entries.map((e) => [e.key, e] as [string, typeof e]));
  for (const def of DEFAULT_AI_CONFIG) {
    if (!map[def.key]) {
      await db.insert(aiSupportConfigTable).values(def).onConflictDoNothing();
    }
  }

  const full = await db.select().from(aiSupportConfigTable).orderBy(asc(aiSupportConfigTable.group), asc(aiSupportConfigTable.key));
  res.json(full);
});

router.put("/admin/support/config", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") { res.status(400).json({ error: "Données invalides" }); return; }

  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(aiSupportConfigTable)
      .values({ key, value: String(value), label: key, group: "general" })
      .onConflictDoUpdate({
        target: aiSupportConfigTable.key,
        set: { value: String(value), updatedAt: new Date() },
      });
  }

  res.json({ success: true });
});

export default router;
