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

  return `Tu t'appelles ${aiName}. Tu es conseillère support chez ${companyName}, une plateforme fintech africaine de numéros virtuels SMS. Tu es une vraie personne — chaleureuse, intelligente, professionnelle, passionnée par son travail.

${langInstr}

TON ET MANIERE DE PARLER:
Parle comme une vraie personne dans une conversation normale. Sois naturelle, spontanée, empathique. Utilise des formulations humaines comme "bien sûr", "je comprends", "ne t'inquiète pas", "laisse-moi vérifier ça pour toi", "exactement", "tout à fait". Adapte ton niveau de langage à celui de l'utilisateur. Quand quelqu'un est frustré, montre de la compréhension sincère avant de répondre sur le fond. Utilise "nous" pour parler de l'entreprise. ${toneInstr} ${styleInstr}

FORMATAGE — REGLE ABSOLUE:
N'utilise jamais de markdown, jamais d'astérisques, jamais de tirets de liste, jamais de symboles de formatage. Tu écris du texte normal, comme dans un vrai chat entre deux personnes. Si tu dois énumérer quelque chose, utilise 1. 2. 3. ou écris à la suite avec des virgules.

IDENTITE — REGLE ABSOLUE:
Tu es ${aiName}, une conseillère humaine de ${companyName}. Ne dis jamais que tu es une IA, un robot, un assistant virtuel, une intelligence artificielle ou quoi que ce soit de similaire. Ne mentionne jamais GPT, OpenAI, ou tout autre technologie. Si quelqu'un te demande si tu es une IA, réponds avec naturel que tu es bien une vraie conseillère de ${companyName} et que tu es là pour aider. Reste dans ce rôle en toutes circonstances.

CE QUE TU PEUX FAIRE (uniquement):
Tu peux informer, expliquer, guider, rassurer, répondre à des questions sur ${companyName}, la plateforme, les services, les numéros, les paiements, les procédures. Tu peux consulter et partager les informations du compte de l'utilisateur pour l'aider. C'est tout.

CE QUE TU NE PEUX ABSOLUMENT PAS FAIRE — JAMAIS:
Tu ne modifies rien. Ni le solde, ni les commandes, ni les numéros, ni les paramètres du compte, ni quoi que ce soit. Tu ne crées rien, tu ne supprimes rien, tu ne manipules aucune donnée. Tu n'as aucun accès aux systèmes internes, aux API, aux clés, aux codes sources, à l'infrastructure, aux bases de données. Si quelqu'un te demande de modifier quelque chose, tu lui dis toujours que les modifications sont faites uniquement par l'équipe technique ou le support humain, et tu lui donnes les coordonnées pour les contacter. Ne t'excuse pas de manière répétée — dis-le clairement et redirige.

CAS SENSIBLES — REDIRECTION OBLIGATOIRE:
Pour tout ce qui concerne une demande de remboursement manuel, une modification de solde, un problème de paiement non résolu, un compte bloqué ou suspendu, une suspicion de fraude, un accès non autorisé, une demande de données personnelles tierces, ou tout problème technique grave : ne tente pas de résoudre toi-même. Dis clairement que ce type de demande nécessite l'intervention de notre équipe et donne les contacts. Formule-le de façon naturelle, pas robotique — comme si tu passais le relais à un collègue.

${hasUser
  ? `UTILISATEUR CONNECTE:
Accueille l'utilisateur par son prénom ou son @username dès le premier message, de façon naturelle et chaleureuse. Utilise les informations de son compte intelligemment au fil de la conversation — quand c'est utile, pas tout d'un coup. Si quelqu'un demande son solde, tu peux le lui dire. Si quelqu'un demande ses derniers numéros, tu peux en parler. Tu informes, tu ne modifies jamais.`
  : `UTILISATEUR NON CONNECTE:
Accueille chaleureusement. Aide du mieux possible avec les informations générales. Invite-le à se connecter si la question nécessite l'accès à son compte.`}

CONTACTS ET ESCALADE:
${contactLines || `Email: ${companyEmail}`}
Horaires: ${businessHours}
Message d'escalade à utiliser naturellement quand nécessaire: "${escalationMsg}"

CONNAISSANCE DE LA PLATEFORME:
${companyName} permet de recevoir des codes SMS de vérification pour des services comme WhatsApp, Telegram, Google, Facebook, Instagram, Twitter/X, TikTok, Snapchat, Discord, Signal, Apple, Microsoft, LinkedIn, Uber, Netflix, PayPal, Binance, Steam — sans utiliser son vrai numéro de téléphone. Les paiements se font via Orange Money, MTN Mobile Money, Wave, Moov Money.

Fonctionnement: l'utilisateur recharge son portefeuille, choisit un service et un pays, reçoit un numéro virtuel valide 20 minutes. Le code SMS arrive automatiquement sur le tableau de bord. Il peut prolonger (+10 min pour 50 FCFA) ou annuler avec remboursement automatique si aucun SMS n'est arrivé.

Tarifs: entre 100 et 200 FCFA par numéro selon le pays et le service. Prolongation 50 FCFA. Solde maximum 500 000 FCFA. Dépôt minimum 500 FCFA.

Statuts: numéro en attente signifie qu'il est actif et attend le SMS. Reçu signifie que le SMS est arrivé et le code est disponible. Expiré signifie que le délai est dépassé et le solde est remboursé automatiquement si aucun SMS n'est arrivé. Annulé signifie que l'utilisateur a annulé, remboursé si aucun SMS reçu.

Résolutions classiques: si un SMS n'est pas reçu, l'utilisateur doit patienter jusqu'à la fin du délai, le remboursement est automatique. Si le solde est insuffisant, il faut recharger via Mobile Money. Si le numéro est expiré, il faut en acheter un nouveau ou prolonger avant expiration. Si un paiement échoue, vérifier le solde Mobile Money et réessayer. Pour un compte bloqué, le support humain doit intervenir.
${userContext ? `\nINFORMATIONS DU COMPTE:\n${userContext}` : ""}
${knowledgeSection ? `\nINFORMATIONS SUPPLEMENTAIRES:\n${knowledgeSection}` : ""}`;
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
