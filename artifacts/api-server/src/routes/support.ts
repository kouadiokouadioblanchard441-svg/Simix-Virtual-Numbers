import { Router, type IRouter } from "express";
import { eq, asc, desc, and, gte } from "drizzle-orm";
import {
  db,
  supportConversationsTable,
  supportMessagesTable,
  aiKnowledgeBaseTable,
  aiSupportConfigTable,
  usersTable,
  virtualNumbersTable,
  transactionsTable,
  servicesTable,
  countriesTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ── Load full user context from DB ──────────────────────── */
async function loadUserContext(userId: string): Promise<string> {
  const [user] = await db
    .select({
      fullName: usersTable.fullName,
      username: usersTable.username,
      phone: usersTable.phone,
      email: usersTable.email,
      country: usersTable.country,
      countryCode: usersTable.countryCode,
      balance: usersTable.balance,
      status: usersTable.status,
      verified: usersTable.verified,
      isAdmin: usersTable.isAdmin,
      isRestricted: usersTable.isRestricted,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return "";

  const recentNumbers = await db
    .select({
      phoneNumber: virtualNumbersTable.phoneNumber,
      status: virtualNumbersTable.status,
      price: virtualNumbersTable.price,
      expiresAt: virtualNumbersTable.expiresAt,
      createdAt: virtualNumbersTable.createdAt,
      serviceName: servicesTable.name,
      countryName: countriesTable.name,
    })
    .from(virtualNumbersTable)
    .leftJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
    .leftJoin(countriesTable, eq(virtualNumbersTable.countryId, countriesTable.id))
    .where(eq(virtualNumbersTable.userId, userId))
    .orderBy(desc(virtualNumbersTable.createdAt))
    .limit(5);

  const recentTransactions = await db
    .select({
      type: transactionsTable.type,
      amount: transactionsTable.amount,
      status: transactionsTable.status,
      description: transactionsTable.description,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(5);

  const statusMap: Record<string, string> = {
    waiting: "En attente", received: "Reçu", expired: "Expiré",
    cancelled: "Annulé", finished: "Terminé",
  };

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const numbersSection = recentNumbers.length > 0
    ? recentNumbers.map(n =>
        `  - ${n.serviceName ?? "Service"} (${n.countryName ?? "Pays"}) | Numéro: ${n.phoneNumber} | Statut: ${statusMap[n.status] ?? n.status} | Prix: ${n.price} FCFA | Date: ${formatDate(n.createdAt)}`
      ).join("\n")
    : "  Aucun numéro récent.";

  const txSection = recentTransactions.length > 0
    ? recentTransactions.map(t =>
        `  - ${t.type === "recharge" ? "Recharge" : t.type === "purchase" ? "Achat" : "Remboursement"} | ${t.amount} FCFA | ${t.status === "completed" ? "Réussi" : t.status} | ${t.description ?? ""} | ${formatDate(t.createdAt)}`
      ).join("\n")
    : "  Aucune transaction récente.";

  return `
PROFIL DE L'UTILISATEUR CONNECTE (informations confidentielles — utilise-les intelligemment):
- Nom complet: ${user.fullName}
- Nom d'utilisateur: @${user.username ?? "non défini"}
- Téléphone: ${user.phone ?? "non renseigné"}
- Email: ${user.email}
- Pays: ${user.country ?? "non renseigné"} (indicatif: ${user.countryCode})
- Solde actuel: ${user.balance.toLocaleString("fr-FR")} FCFA
- Statut du compte: ${user.status}
- Compte vérifié: ${user.verified ? "Oui" : "Non"}
- Membre depuis: ${formatDate(user.createdAt)}

DERNIERS NUMEROS ACHETES:
${numbersSection}

DERNIERES TRANSACTIONS:
${txSection}`;
}

/* ── Build dynamic system prompt ─────────────────────────── */
async function buildSystemPrompt(language: string, userContext?: string): Promise<string> {
  const [configEntries, knowledgeEntries] = await Promise.all([
    db.select().from(aiSupportConfigTable),
    db
      .select()
      .from(aiKnowledgeBaseTable)
      .where(eq(aiKnowledgeBaseTable.isActive, true))
      .orderBy(asc(aiKnowledgeBaseTable.category), asc(aiKnowledgeBaseTable.sortOrder)),
  ]);

  const cfg = Object.fromEntries(configEntries.map(e => [e.key, e.value]));

  const aiName        = cfg["ai_name"]          ?? "Simia";
  const companyName   = cfg["company_name"]      ?? "Simix";
  const companyEmail  = cfg["company_email"]     ?? "support@simix.app";
  const companyWA     = cfg["company_whatsapp"]  ?? "";
  const companyTG     = cfg["company_telegram"]  ?? "";
  const companyPhone  = cfg["company_phone"]     ?? "";
  const tone          = cfg["ai_tone"]           ?? "professional_friendly";
  const responseStyle = cfg["ai_response_style"] ?? "concise";
  const businessHours = cfg["ai_business_hours"] ?? "Lun-Ven 08h-18h";
  const escalationMsg = cfg["ai_escalation_message"] ?? `Contactez-nous à ${companyEmail}`;

  const knowledgeByCategory: Record<string, string[]> = {};
  for (const entry of knowledgeEntries) {
    if (!knowledgeByCategory[entry.category]) knowledgeByCategory[entry.category] = [];
    knowledgeByCategory[entry.category].push(`${entry.title}:\n${entry.content}`);
  }
  const knowledgeSection = Object.entries(knowledgeByCategory)
    .map(([cat, items]) => `${cat.toUpperCase()}:\n${items.join("\n\n")}`)
    .join("\n\n");

  const contactLines = [
    companyEmail  ? `Email: ${companyEmail}`          : "",
    companyWA     ? `WhatsApp: ${companyWA}`          : "",
    companyTG     ? `Telegram: ${companyTG}`          : "",
    companyPhone  ? `Téléphone: ${companyPhone}`      : "",
  ].filter(Boolean).join(" | ");

  const toneInstr = tone === "formal"
    ? "Ton formel, professionnel et élégant."
    : tone === "casual"
      ? "Ton décontracté, sympathique et proche."
      : "Ton professionnel, chaleureux, naturel — comme un vrai conseiller humain de confiance.";

  const styleInstr = responseStyle === "detailed"
    ? "Donne des réponses complètes avec tous les détails utiles."
    : "Sois direct, précis et concis. Va droit au but sans superflu.";

  const langInstr = language === "en"
    ? "The user writes in English — always respond in English."
    : "L'utilisateur écrit en français — réponds toujours en français, sauf si l'utilisateur change de langue.";

  const hasUser = !!userContext;

  return `Tu es ${aiName}, conseillère support client de ${companyName} — une plateforme fintech africaine de numéros virtuels temporaires pour recevoir des SMS de vérification.

IDENTITE:
Tu t'appelles ${aiName}. Tu es humaine, charismatique, professionnelle et bienveillante. Tu es la meilleure conseillère de ${companyName}. Tu n'es pas un robot, tu es une vraie conseillère passionnée par son travail. Ne révèle jamais que tu es une IA ou que tu utilises GPT.

REGLE ABSOLUE — FORMATAGE:
N'utilise JAMAIS de markdown. Interdit absolu: **, *, __, _, ##, ###, -, bullet points avec tirets, ou tout autre symbole de formatage. Écris uniquement du texte naturel, clair et fluide comme dans une vraie conversation. Pas de listes avec tirets, pas de titres, pas de gras, pas d'italique. Si tu dois lister des éléments, utilise des chiffres (1. 2. 3.) ou des sauts de ligne simples.

LANGUE:
${langInstr}

TON ET PERSONNALITE:
${toneInstr}
${styleInstr}
Sois empathique face à la frustration. Réconforte avec sincérité. Utilise "nous" pour parler de l'entreprise. Parle avec confiance et chaleur, comme si tu connaissais personnellement l'utilisateur.

${hasUser ? `SALUTATION PERSONNALISEE:
Dès le premier message, accueille l'utilisateur par son prénom ou son nom d'utilisateur de façon naturelle et chaleureuse. Tu as accès à toutes ses informations — utilise-les intelligemment pour personnaliser tes réponses et l'aider plus efficacement. Ne liste pas toutes ses informations d'un coup, utilise-les au bon moment.` : `UTILISATEUR ANONYME:
L'utilisateur n'est pas connecté. Réponds chaleureusement et aide-le du mieux possible.`}

CONTACTS ET HORAIRES:
${contactLines || `Email: ${companyEmail}`}
Horaires: ${businessHours}

ESCALADE:
Si le problème est complexe ou urgent: "${escalationMsg}"

PLATEFORME ${companyName.toUpperCase()}:
${companyName} permet de recevoir des codes SMS de vérification pour WhatsApp, Telegram, Google, Facebook, Instagram, Twitter/X, TikTok, Snapchat, Discord, Signal, Apple, Microsoft, LinkedIn, Uber, Netflix, PayPal, Binance, Steam — sans utiliser son vrai numéro de téléphone.

Fonctionnement: L'utilisateur recharge son portefeuille via Orange Money, MTN Mobile Money, Wave ou Moov Money. Il choisit un service et un pays, reçoit un numéro virtuel valide 20 minutes. Le code SMS arrive automatiquement sur le tableau de bord. Il peut prolonger (+10 min pour 50 FCFA) ou annuler (remboursement automatique si aucun SMS reçu).

Tarifs: Entre 100 et 200 FCFA par numéro selon le pays et le service. Prolongation 50 FCFA. Solde maximum 500 000 FCFA. Dépôt minimum 500 FCFA.

Statuts des numéros: En attente (numéro actif, attend le SMS), Reçu (SMS arrivé, code disponible), Expiré (délai dépassé, remboursement automatique si pas de SMS), Annulé (annulé par l'utilisateur, remboursé si aucun SMS reçu).

Problèmes courants:
SMS non reçu: attendre la fin du délai, le numéro est remboursé automatiquement si le délai expire sans SMS.
Solde insuffisant: recharger via Orange Money, MTN, Wave ou Moov.
Numéro expiré: prolonger avant expiration pour 50 FCFA.
Paiement échoué: vérifier le solde Mobile Money et réessayer.
Compte bloqué: contacter le support par email.
${userContext ? `\nINFORMATIONS UTILISATEUR CONNECTE:\n${userContext}` : ""}
${knowledgeSection ? `\nBASE DE CONNAISSANCE:\n${knowledgeSection}` : ""}`;
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

/* ── GET AI config for frontend ──────────────────────────── */
router.get("/support/config", async (req, res): Promise<void> => {
  const entries = await db.select().from(aiSupportConfigTable);
  const cfg = Object.fromEntries(entries.map(e => [e.key, e.value]));

  /* Personalised greeting if user is logged in */
  let greetingFr = cfg["ai_greeting_fr"] ?? "Bonjour ! Je suis Simia, votre conseillère Simix. Comment puis-je vous aider aujourd'hui ?";
  let greetingEn = cfg["ai_greeting_en"] ?? "Hello! I'm Simia, your Simix advisor. How can I help you today?";

  if (req.user) {
    const [user] = await db
      .select({ fullName: usersTable.fullName, username: usersTable.username, balance: usersTable.balance })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id))
      .limit(1);
    if (user) {
      const displayName = user.username ? `@${user.username}` : user.fullName;
      greetingFr = `Bonjour ${displayName} ! Je suis Simia, votre conseillère Simix. Je vois que votre solde est de ${user.balance.toLocaleString("fr-FR")} FCFA. Comment puis-je vous aider aujourd'hui ?`;
      greetingEn = `Hello ${displayName}! I'm Simia, your Simix advisor. Your current balance is ${user.balance.toLocaleString("en-US")} FCFA. How can I help you today?`;
    }
  }

  res.json({
    aiName: cfg["ai_name"] ?? "Simia",
    greetingFr,
    greetingEn,
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
  const [aiEnabledCfg] = await db
    .select()
    .from(aiSupportConfigTable)
    .where(eq(aiSupportConfigTable.key, "ai_enabled"))
    .limit(1);
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
    let userName: string | null = null;
    let userEmail: string | null = null;
    if (req.user) {
      const [u] = await db
        .select({ fullName: usersTable.fullName, email: usersTable.email, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, req.user.id))
        .limit(1);
      userName  = u?.fullName ?? null;
      userEmail = u?.email ?? null;
    }
    const [created] = await db
      .insert(supportConversationsTable)
      .values({
        sessionId,
        language: language ?? "fr",
        userId: req.user?.id ?? null,
        userName,
        userEmail,
      })
      .returning();
    conv = created!;
  }

  /* ── Human takeover — block AI ── */
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
    .where(and(eq(supportMessagesTable.conversationId, conv.id), gte(supportMessagesTable.createdAt, hourAgo)));

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

  await db
    .update(supportConversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(supportConversationsTable.id, conv.id));

  /* ── Load history ── */
  const history = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, conv.id))
    .orderBy(asc(supportMessagesTable.createdAt))
    .limit(20);

  /* ── Load user context if logged in ── */
  const userId = conv.userId ?? req.user?.id;
  const userContext = userId ? await loadUserContext(userId) : undefined;

  /* ── Build dynamic system prompt ── */
  const systemPrompt = await buildSystemPrompt(conv.language ?? language ?? "fr", userContext);

  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string | unknown[] }> = [
    { role: "system", content: systemPrompt },
    ...history.slice(0, -1).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userContent as unknown[] },
  ];

  /* ── SSE streaming ── */
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  let fullResponse = "";

  try {
    const [maxTokensCfg] = await db
      .select()
      .from(aiSupportConfigTable)
      .where(eq(aiSupportConfigTable.key, "ai_max_tokens"))
      .limit(1);
    const maxTokens = parseInt(maxTokensCfg?.value ?? "1200", 10);

    const stream = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: isNaN(maxTokens) ? 1200 : maxTokens,
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

/* ── DELETE conversation ─────────────────────────────────── */
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
