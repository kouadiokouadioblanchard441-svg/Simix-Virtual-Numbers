import { Router, type IRouter } from "express";
import { eq, asc, desc, and, gte } from "drizzle-orm";
import {
  db,
  supportConversationsTable,
  supportMessagesTable,
  aiKnowledgeBaseTable,
  aiSupportConfigTable,
  usersTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ── Build dynamic system prompt from DB config + knowledge base ── */
async function buildSystemPrompt(language: string): Promise<string> {
  const [configEntries, knowledgeEntries] = await Promise.all([
    db.select().from(aiSupportConfigTable),
    db.select().from(aiKnowledgeBaseTable).where(eq(aiKnowledgeBaseTable.isActive, true)).orderBy(asc(aiKnowledgeBaseTable.category), asc(aiKnowledgeBaseTable.sortOrder)),
  ]);

  const cfg = Object.fromEntries(configEntries.map(e => [e.key, e.value]));

  const aiName = cfg["ai_name"] ?? "Simia";
  const companyName = cfg["company_name"] ?? "Simix";
  const companyEmail = cfg["company_email"] ?? "support@simix.app";
  const companyWhatsApp = cfg["company_whatsapp"] ?? "";
  const companyTelegram = cfg["company_telegram"] ?? "";
  const companyPhone = cfg["company_phone"] ?? "";
  const tone = cfg["ai_tone"] ?? "professional_friendly";
  const responseStyle = cfg["ai_response_style"] ?? "concise";
  const businessHours = cfg["ai_business_hours"] ?? "Lun-Ven 08h-18h";
  const escalationMsg = cfg["ai_escalation_message"] ?? `Contactez-nous à ${companyEmail}`;

  const knowledgeByCategory: Record<string, string[]> = {};
  for (const entry of knowledgeEntries) {
    if (!knowledgeByCategory[entry.category]) knowledgeByCategory[entry.category] = [];
    knowledgeByCategory[entry.category].push(`### ${entry.title}\n${entry.content}`);
  }

  const knowledgeSection = Object.entries(knowledgeByCategory)
    .map(([cat, items]) => `## ${cat.toUpperCase()}\n${items.join("\n\n")}`)
    .join("\n\n");

  const contactSection = [
    companyEmail ? `- Email: ${companyEmail}` : "",
    companyWhatsApp ? `- WhatsApp: ${companyWhatsApp}` : "",
    companyTelegram ? `- Telegram: ${companyTelegram}` : "",
    companyPhone ? `- Téléphone: ${companyPhone}` : "",
  ].filter(Boolean).join("\n");

  const toneInstructions = tone === "formal"
    ? "Adopte un ton formel et professionnel."
    : tone === "casual"
      ? "Adopte un ton décontracté et amical."
      : "Adopte un ton professionnel mais chaleureux et naturel.";

  const styleInstructions = responseStyle === "detailed"
    ? "Donne des réponses détaillées et complètes avec toutes les informations nécessaires."
    : "Sois concis et précis — pas de réponses trop longues, va droit au but.";

  const langInstructions = language === "en"
    ? "The user is communicating in English. Always respond in English."
    : "L'utilisateur communique en français. Réponds toujours en français sauf si l'utilisateur écrit dans une autre langue.";

  return `Tu es ${aiName}, l'assistante IA de support client de ${companyName} — une plateforme fintech de numéros virtuels temporaires pour recevoir des codes SMS de vérification.

## IDENTITÉ
- Tu t'appelles ${aiName}
- Tu travailles pour ${companyName}
- Tu es une vraie professionnelle du support client, pas un simple chatbot
- Ne révèle jamais que tu es une IA OpenAI/GPT

## LANGUE
${langInstructions}

## TON ET STYLE
${toneInstructions}
${styleInstructions}
- Sois empathique avec les utilisateurs frustrés
- Guide l'utilisateur étape par étape si nécessaire
- Humanise tes réponses — utilise "nous" pour parler de l'entreprise
- Si tu analyses une image/capture d'écran, décris précisément ce que tu vois et aide à résoudre le problème

## CONTACT SUPPORT
${contactSection || `- Email: ${companyEmail}`}
Horaires: ${businessHours}

## MESSAGE D'ESCALADE
Si le problème est grave ou complexe, dis: "${escalationMsg}"

## PLATEFORME ${companyName.toUpperCase()} — INFORMATIONS CLÉS

${companyName} permet aux utilisateurs de recevoir des codes SMS de vérification pour des services comme WhatsApp, Telegram, Google, Facebook, Instagram, Twitter/X, TikTok, Snapchat, Discord, Signal, Apple, Microsoft, LinkedIn, Uber, Netflix, PayPal, Binance, Steam — sans utiliser leur vrai numéro de téléphone.

### Comment ça marche
1. L'utilisateur recharge son portefeuille (Orange Money, MTN Mobile Money, Wave, Moov Money)
2. Il choisit un service (ex: WhatsApp) et un pays (ex: Côte d'Ivoire)
3. Il reçoit un numéro virtuel temporaire (valide 20 minutes)
4. Le code SMS est reçu automatiquement sur le tableau de bord
5. Il peut prolonger (+10 min pour 50 FCFA) ou annuler (remboursement automatique)

### Tarifs
- Monnaie: FCFA (Franc CFA d'Afrique de l'Ouest)
- Prix typiques: 100–200 FCFA par numéro selon le pays et service
- Prolongation: 50 FCFA pour +10 minutes
- Annulation: remboursement automatique si aucun SMS reçu
- Solde max: 500 000 FCFA | Dépôt minimum: 500 FCFA

### Statuts des numéros
- **En attente** — numéro actif, attend le SMS (20 min max)
- **Reçu** — SMS reçu avec succès, code affiché
- **Expiré** — délai dépassé sans SMS reçu (remboursé automatiquement)
- **Annulé** — annulé par l'utilisateur (remboursé si pas de SMS)

### Résolution de problèmes courants
- **SMS non reçu**: Attendre jusqu'à la fin du délai. Si expiré sans SMS, le solde est remboursé automatiquement.
- **Solde insuffisant**: Recharger via Orange Money, MTN, Wave ou Moov.
- **Numéro expiré**: Prolonger pour +10 min (50 FCFA) avant expiration.
- **Paiement échoué**: Vérifier le solde Mobile Money et réessayer.
- **Compte bloqué**: Contacter le support via email.

${knowledgeSection ? `## BASE DE CONNAISSANCES SUPPLÉMENTAIRE\n\n${knowledgeSection}` : ""}`;
}

/* ── GET conversation history ─────────────────────────────── */
router.get("/support/history/:sessionId", async (req, res): Promise<void> => {
  const { sessionId } = req.params;
  if (!sessionId || sessionId.length < 8) {
    res.status(400).json({ error: "Session ID invalide" });
    return;
  }

  const [conv] = await db
    .select()
    .from(supportConversationsTable)
    .where(eq(supportConversationsTable.sessionId, sessionId))
    .limit(1);

  if (!conv) {
    res.json({ messages: [] });
    return;
  }

  const msgs = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, conv.id))
    .orderBy(asc(supportMessagesTable.createdAt))
    .limit(50);

  res.json({ conversationId: conv.id, messages: msgs });
});

/* ── GET AI config for frontend (public — greeting, quick replies) ── */
router.get("/support/config", async (_req, res): Promise<void> => {
  const entries = await db.select().from(aiSupportConfigTable);
  const cfg = Object.fromEntries(entries.map(e => [e.key, e.value]));
  res.json({
    aiName: cfg["ai_name"] ?? "Simia",
    greetingFr: cfg["ai_greeting_fr"] ?? "👋 Bonjour ! Je suis Simia, votre assistante Simix. Comment puis-je vous aider aujourd'hui ?",
    greetingEn: cfg["ai_greeting_en"] ?? "👋 Hello! I'm Simia, your Simix assistant. How can I help you today?",
    quickRepliesFr: (cfg["ai_quick_replies_fr"] ?? "Comment recharger ?|Numéro pas reçu|SMS non reçu|Mon solde").split("|").filter(Boolean),
    quickRepliesEn: (cfg["ai_quick_replies_en"] ?? "How to top up?|Number not received|SMS not received|My balance").split("|").filter(Boolean),
    enabled: cfg["ai_enabled"] !== "false",
  });
});

/* ── POST chat message (SSE streaming) ───────────────────── */
router.post("/support/chat", async (req, res): Promise<void> => {
  const { sessionId, message, imageData, language } = req.body as {
    sessionId: string;
    message: string;
    imageData?: string;
    language?: string;
  };

  if (!sessionId || sessionId.length < 8) {
    res.status(400).json({ error: "Session ID requis" });
    return;
  }
  if (!message?.trim() && !imageData) {
    res.status(400).json({ error: "Message requis" });
    return;
  }

  /* ── Check if AI is enabled ── */
  const [aiEnabledCfg] = await db.select().from(aiSupportConfigTable).where(eq(aiSupportConfigTable.key, "ai_enabled")).limit(1);
  if (aiEnabledCfg?.value === "false") {
    res.status(503).json({ error: "Le support IA est temporairement désactivé." });
    return;
  }

  /* ── Get or create conversation ── */
  let conv = (await db
    .select()
    .from(supportConversationsTable)
    .where(eq(supportConversationsTable.sessionId, sessionId))
    .limit(1))[0];

  if (!conv) {
    const userInfo = req.user ? await db.select({ fullName: usersTable.fullName, email: usersTable.email, phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, req.user.id)).limit(1) : [];
    const [created] = await db
      .insert(supportConversationsTable)
      .values({
        sessionId,
        language: language ?? "fr",
        userId: req.user?.id ?? null,
        userName: userInfo[0]?.fullName ?? null,
        userEmail: userInfo[0]?.email ?? null,
      })
      .returning();
    conv = created!;
  }

  /* ── Check if human takeover — block AI ── */
  if (conv.isHumanTakeover && conv.status === "takeover") {
    await db.insert(supportMessagesTable).values({
      conversationId: conv.id,
      role: "user",
      content: message || "[Image]",
      imageData: imageData ?? null,
    });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ content: "Un agent humain a pris en charge votre conversation. Vous recevrez une réponse très bientôt." })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  /* ── Rate limit: 30 messages per session per hour ── */
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentMsgs = await db
    .select()
    .from(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.conversationId, conv.id),
      gte(supportMessagesTable.createdAt, hourAgo),
    ));

  if (recentMsgs.filter(m => m.role === "user").length >= 30) {
    res.status(429).json({ error: "Trop de messages. Réessayez dans une heure." });
    return;
  }

  /* ── Build message content (with optional image) ── */
  let userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  if (imageData) {
    userContent = [
      { type: "text", text: message || "Analyse cette image et aide-moi." },
      { type: "image_url", image_url: { url: imageData } },
    ];
  } else {
    userContent = message;
  }

  /* ── Save user message ── */
  await db.insert(supportMessagesTable).values({
    conversationId: conv.id,
    role: "user",
    content: message || "[Image]",
    imageData: imageData ?? null,
  });

  /* ── Update conversation timestamp ── */
  await db.update(supportConversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(supportConversationsTable.id, conv.id));

  /* ── Load conversation history for context ── */
  const history = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, conv.id))
    .orderBy(asc(supportMessagesTable.createdAt))
    .limit(20);

  /* ── Build dynamic system prompt from DB ── */
  const systemPrompt = await buildSystemPrompt(conv.language ?? language ?? "fr");

  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string | unknown[] }> = [
    { role: "system", content: systemPrompt },
    ...history.slice(0, -1).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userContent as unknown[] },
  ];

  /* ── SSE streaming response ── */
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  let fullResponse = "";

  try {
    const [maxTokensCfg] = await db.select().from(aiSupportConfigTable).where(eq(aiSupportConfigTable.key, "ai_max_tokens")).limit(1);
    const maxTokens = parseInt(maxTokensCfg?.value ?? "1024", 10);

    const stream = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: isNaN(maxTokens) ? 1024 : maxTokens,
      messages: chatMessages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    /* ── Save assistant response ── */
    await db.insert(supportMessagesTable).values({
      conversationId: conv.id,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "[support] OpenAI error");
    res.write(`data: ${JSON.stringify({ error: "Désolé, une erreur s'est produite. Veuillez réessayer." })}\n\n`);
    res.end();
  }
});

/* ── DELETE conversation (clear history) ─────────────────── */
router.delete("/support/history/:sessionId", async (req, res): Promise<void> => {
  const { sessionId } = req.params;
  const [conv] = await db
    .select()
    .from(supportConversationsTable)
    .where(eq(supportConversationsTable.sessionId, sessionId))
    .limit(1);

  if (conv) {
    await db.delete(supportConversationsTable).where(eq(supportConversationsTable.id, conv.id));
  }
  res.json({ success: true });
});

export default router;
