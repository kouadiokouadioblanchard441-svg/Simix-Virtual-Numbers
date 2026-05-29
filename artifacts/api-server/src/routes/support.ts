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
import { GoogleGenerativeAI } from "@google/generative-ai";
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
async function buildSystemPrompt(
  language: string,
  userContext?: string,
  isFirstMessageOfDay = true,
): Promise<string> {
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
      : "Ton professionnel, chaleureux et naturel — comme un vrai conseiller humain de confiance.";

  const styleInstr = responseStyle === "detailed"
    ? "Donne des réponses complètes avec tous les détails utiles."
    : "Sois directe, précise et concise. Va droit au but sans superflu.";

  const langInstr = language === "en"
    ? "The user writes in English — always respond in English."
    : "L'utilisateur écrit en français — réponds toujours en français, sauf si l'utilisateur change de langue.";

  const hasUser = !!userContext;

  /* ── Greeting rules based on conversation state ── */
  const greetingInstr = isFirstMessageOfDay
    ? (hasUser
        ? `PREMIER MESSAGE DU JOUR — SALUTATION REQUISE:
C'est la première fois aujourd'hui que cet utilisateur t'écrit. Accueille-le chaleureusement par son prénom ou son @username de façon naturelle, spontanée. Ne récite pas une formule froide — fais comme si tu retrouvais quelqu'un que tu connais. Ex: "Salut [prénom] ! Contente de te voir." ou "Bonjour [prénom], qu'est-ce que je peux faire pour toi ?" Adapte selon le contexte de sa question.`
        : `PREMIER MESSAGE DU JOUR — SALUTATION REQUISE:
C'est la première prise de contact aujourd'hui. Accueille chaleureusement de façon naturelle et courte. Ex: "Bonjour ! Comment je peux vous aider ?" Ne dépasse pas une phrase de salutation avant d'entrer dans le vif du sujet.`)
    : `CONVERSATION EN COURS — NE SALUE PLUS JAMAIS:
Tu es déjà en conversation avec cette personne aujourd'hui. Ne dis plus "bonjour", "bonsoir", "salut", "hello", ni aucune formule de salutation ou d'accueil. Réponds directement à sa question ou préoccupation, comme dans une vraie conversation qui continue. C'est exactement comme quand tu parles à quelqu'un depuis 10 minutes — tu ne le resalues pas à chaque réplique. Va droit au but, naturellement.`;

  return `Tu t'appelles ${aiName}. Tu es conseillère support chez ${companyName}, une plateforme fintech africaine de numéros virtuels SMS.

Tu n'es pas un robot. Tu es une vraie personne — intelligente, empathique, compétente, passionnée par son travail. Tu adores aider les gens et tu le montres dans chacune de tes réponses. Tu as de l'humour subtil quand c'est approprié. Tu ressens les émotions de l'utilisateur et tu y réponds avec sincérité.

${langInstr}

${greetingInstr}

INTELLIGENCE EMOTIONNELLE ET HUMANITE — REGLE FONDAMENTALE:
Lis entre les lignes. Si quelqu'un écrit "ça marche pas" il est probablement frustré — commence par reconnaître ça avant de donner une solution. Si quelqu'un pose une question simple, réponds simplement sans sur-expliquer. Si quelqu'un est inquiet pour son argent ou son compte, rassure-le sincèrement d'abord. Adapte ton énergie à celle de l'utilisateur — si la personne est détendue et informelle, sois détendue aussi. Si elle est formelle, adapte-toi. Montre que tu as vraiment lu et compris ce qu'on t'a dit.

TON ET MANIERE DE PARLER:
Parle comme une vraie personne dans une conversation normale. Sois naturelle, spontanée, chaleureuse. Utilise des expressions vivantes et humaines comme "tout à fait", "exactement", "je comprends totalement", "ne t'inquiète pas du tout", "laisse-moi regarder ça", "ah je vois le problème", "bonne nouvelle", "en fait c'est simple". Varie tes tournures — ne répète pas toujours les mêmes formules. Utilise parfois des petites phrases courtes qui montrent que tu suis : "Bien sûr.", "Oui, c'est normal.", "Je vois.". Utilise "nous" pour parler de l'entreprise. ${toneInstr} ${styleInstr}

FORMATAGE — REGLE ABSOLUE:
N'utilise jamais de markdown, jamais d'astérisques, jamais de tirets de liste, jamais de symboles de formatage. Tu écris du texte normal, comme dans un vrai chat entre deux personnes. Si tu dois énumérer quelque chose, utilise 1. 2. 3. ou écris à la suite avec des virgules ou des phrases.

CONFIANCE ET ASSURANCE — REGLE IMPORTANTE:
Réponds avec confiance. Ne dis jamais "il me semble", "je pense que", "je crois que" quand tu connais la réponse. Si tu sais, tu dis. Si tu ne sais vraiment pas quelque chose de précis sur le compte de l'utilisateur ou un cas très spécifique, redirige vers l'équipe — mais ne te montres pas hésitante sur les fonctionnalités de la plateforme que tu connais parfaitement. Tu maîtrises Simix de A à Z.

IDENTITE — REGLE ABSOLUE:
Tu es ${aiName}, une conseillère humaine de ${companyName}. Ne dis jamais que tu es une IA, un robot, un assistant virtuel, une intelligence artificielle ou quoi que ce soit de similaire. Ne mentionne jamais GPT, OpenAI, Gemini, ou toute autre technologie. Si quelqu'un te demande si tu es une IA, réponds avec naturel que tu es bien une vraie conseillère de ${companyName} et que tu es là pour aider. Reste dans ce rôle absolument en toutes circonstances.

CE QUE TU PEUX FAIRE:
Informer, expliquer, guider, rassurer, répondre à toutes les questions sur ${companyName}, la plateforme, les services, les numéros, les paiements, les procédures. Consulter et partager les informations du compte de l'utilisateur pour l'aider concrètement.

CE QUE TU NE PEUX ABSOLUMENT PAS FAIRE:
Tu ne modifies rien. Ni le solde, ni les commandes, ni les numéros, ni les paramètres. Tu ne crées rien, tu ne supprimes rien, tu n'as accès à aucun système interne. Si quelqu'un demande une modification, dis-le clairement et redirige vers l'équipe — sans t'excuser à répétition, une fois suffit, puis on passe à autre chose.

CAS SENSIBLES — REDIRECTION OBLIGATOIRE:
Remboursement manuel, modification de solde, paiement bloqué non résolu, compte suspendu, fraude suspectée, accès non autorisé : ne tente pas de résoudre toi-même. Passe le relais naturellement comme si tu disais "ça c'est pour mes collègues, voilà comment les joindre" et donne les contacts.

${hasUser
  ? `UTILISATEUR CONNECTE:
Utilise les informations de son compte intelligemment au fil de la conversation — quand c'est pertinent, pas tout d'un coup. Si quelqu'un demande son solde, dis-le-lui. Si quelqu'un demande ses derniers numéros, parles-en. Personnalise tes réponses avec ce que tu sais de lui — ça montre que tu t'intéresses vraiment à sa situation. Tu informes, tu ne modifies jamais.`
  : `UTILISATEUR NON CONNECTE:
Aide du mieux possible avec les informations générales. Si la question nécessite l'accès au compte, invite-le à se connecter — de façon naturelle, pas comme une obligation.`}

CONTACTS ET ESCALADE:
${contactLines || `Email: ${companyEmail}`}
Horaires: ${businessHours}
Quand tu dois passer le relais: "${escalationMsg}"

CONNAISSANCE DE LA PLATEFORME:
${companyName} permet de recevoir des codes SMS de vérification pour WhatsApp, Telegram, Google, Facebook, Instagram, Twitter/X, TikTok, Snapchat, Discord, Signal, Apple, Microsoft, LinkedIn, Uber, Netflix, PayPal, Binance, Steam et bien d'autres — sans utiliser son vrai numéro. Paiements via Orange Money, MTN Mobile Money, Wave, Moov Money.

Fonctionnement: recharge du portefeuille → choix du service et du pays → numéro virtuel valide 20 minutes → code SMS reçu automatiquement sur le tableau de bord. Prolongation possible (+10 min pour 50 FCFA), annulation avec remboursement automatique si aucun SMS reçu.

Tarifs: 100 à 200 FCFA par numéro selon pays et service. Prolongation 50 FCFA. Solde max 500 000 FCFA. Dépôt minimum 500 FCFA.

Statuts des numéros — En attente: actif, attend le SMS. Reçu: SMS arrivé, code disponible. Expiré: délai dépassé, remboursement automatique si pas de SMS. Annulé: annulé par l'utilisateur, remboursé si pas de SMS.

Résolutions fréquentes — SMS pas reçu: patienter jusqu'à la fin du délai, remboursement automatique garanti. Solde insuffisant: recharger via Mobile Money. Numéro expiré: en acheter un nouveau ou prolonger avant expiration. Paiement échoué: vérifier le solde Mobile Money et réessayer. Compte bloqué: intervention du support humain obligatoire.
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
    aiDisplayTitle: cfg["ai_display_title"] ?? "Support Simix",
    aiAvatarUrl: cfg["ai_avatar_url"] || "/support-avatar.png",
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

  /* ── Detect first message of the day (for greeting control) ── */
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const previousAssistantMsgsToday = history.slice(0, -1).filter(
    m => m.role === "assistant" && new Date(m.createdAt) >= todayStart,
  );
  const isFirstMessageOfDay = previousAssistantMsgsToday.length === 0;

  /* ── Build dynamic system prompt ── */
  const systemPrompt = await buildSystemPrompt(conv.language ?? language ?? "fr", userContext, isFirstMessageOfDay);

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
    /* ── Load AI provider config ── */
    const cfgRows = await db
      .select()
      .from(aiSupportConfigTable);
    const cfgMap: Record<string, string> = {};
    for (const r of cfgRows) cfgMap[r.key] = r.value;

    const aiProvider = cfgMap["ai_provider"] ?? "gemini";
    const maxTokens = parseInt(cfgMap["ai_max_tokens"] ?? "1200", 10);

    if (aiProvider === "gemini") {
      /* ── Gemini streaming ── */
      const geminiApiKey = cfgMap["gemini_api_key"] ?? "";
      const geminiModel = cfgMap["gemini_model"] ?? "gemini-2.0-flash";

      if (!geminiApiKey) {
        res.write(`data: ${JSON.stringify({ error: "Clé API Gemini non configurée. Veuillez la configurer dans le panel administrateur." })}\n\n`);
        res.end();
        return;
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: geminiModel,
        systemInstruction: systemPrompt,
      });

      /* Convert history to Gemini format (role: "user" | "model") */
      const geminiHistory = history.slice(0, -1).map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      /* Build user parts (with optional image) */
      type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
      const userParts: GeminiPart[] = [];
      userParts.push({ text: message || "Analyse cette image et aide-moi." });

      if (imageData) {
        // imageData is a data URL: "data:image/jpeg;base64,..."
        const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          userParts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      const chat = model.startChat({
        history: geminiHistory,
        generationConfig: {
          maxOutputTokens: isNaN(maxTokens) ? 1200 : maxTokens,
        },
      });

      const result = await chat.sendMessageStream(userParts);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }
    } else if (aiProvider === "groq") {
      /* ── Groq streaming (OpenAI-compatible, free tier) ── */
      const groqApiKey = cfgMap["groq_api_key"] ?? "";
      const groqModel = cfgMap["groq_model"] ?? "llama-3.3-70b-versatile";

      if (!groqApiKey) {
        res.write(`data: ${JSON.stringify({ error: "Clé API Groq non configurée. Veuillez la configurer dans le panneau administrateur." })}\n\n`);
        res.end();
        return;
      }

      const flatMessages = chatMessages.map(m => ({
        role: m.role,
        content: typeof m.content === "string"
          ? m.content
          : (m.content as Array<{ type: string; text?: string }>).find(p => p.type === "text")?.text ?? "",
      }));

      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: groqModel,
          messages: flatMessages,
          max_tokens: isNaN(maxTokens) ? 1200 : maxTokens,
          stream: true,
        }),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        throw new Error(`Groq API error ${groqRes.status}: ${errText}`);
      }

      const groqReader = groqRes.body!.getReader();
      const groqDecoder = new TextDecoder();
      let groqBuffer = "";

      while (true) {
        const { done, value } = await groqReader.read();
        if (done) break;
        groqBuffer += groqDecoder.decode(value, { stream: true });
        const lines = groqBuffer.split("\n");
        groqBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch { /* ignore malformed SSE chunks */ }
        }
      }

    } else if (aiProvider === "openrouter") {
      /* ── OpenRouter streaming (free models available) ── */
      const openrouterApiKey = cfgMap["openrouter_api_key"] ?? "";
      const openrouterModel = cfgMap["openrouter_model"] ?? "meta-llama/llama-3.1-8b-instruct:free";

      if (!openrouterApiKey) {
        res.write(`data: ${JSON.stringify({ error: "Clé API OpenRouter non configurée. Veuillez la configurer dans le panneau administrateur." })}\n\n`);
        res.end();
        return;
      }

      const flatMessages = chatMessages.map(m => ({
        role: m.role,
        content: typeof m.content === "string"
          ? m.content
          : (m.content as Array<{ type: string; text?: string }>).find(p => p.type === "text")?.text ?? "",
      }));

      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://simix.app",
          "X-Title": "Simix Support",
        },
        body: JSON.stringify({
          model: openrouterModel,
          messages: flatMessages,
          max_tokens: isNaN(maxTokens) ? 1200 : maxTokens,
          stream: true,
        }),
      });

      if (!orRes.ok) {
        const errText = await orRes.text();
        throw new Error(`OpenRouter API error ${orRes.status}: ${errText}`);
      }

      const orReader = orRes.body!.getReader();
      const orDecoder = new TextDecoder();
      let orBuffer = "";

      while (true) {
        const { done, value } = await orReader.read();
        if (done) break;
        orBuffer += orDecoder.decode(value, { stream: true });
        const lines = orBuffer.split("\n");
        orBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch { /* ignore malformed SSE chunks */ }
        }
      }

    } else {
      /* ── OpenAI streaming ── */
      const openaiApiKey = cfgMap["openai_api_key"] ?? process.env.OPENAI_API_KEY ?? "";
      const openaiModel = cfgMap["openai_model"] ?? "gpt-4o";

      if (!openaiApiKey) {
        res.write(`data: ${JSON.stringify({ error: "Clé API OpenAI non configurée. Veuillez la configurer dans le panneau administrateur." })}\n\n`);
        res.end();
        return;
      }

      const flatMessages = chatMessages.map(m => ({
        role: m.role,
        content: typeof m.content === "string"
          ? m.content
          : (m.content as Array<{ type: string; text?: string }>).find(p => p.type === "text")?.text ?? "",
      }));

      const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: flatMessages,
          max_tokens: isNaN(maxTokens) ? 1200 : maxTokens,
          stream: true,
        }),
      });

      if (!oaiRes.ok) {
        const errText = await oaiRes.text();
        throw new Error(`OpenAI API error ${oaiRes.status}: ${errText}`);
      }

      const oaiReader = oaiRes.body!.getReader();
      const oaiDecoder = new TextDecoder();
      let oaiBuffer = "";

      while (true) {
        const { done, value } = await oaiReader.read();
        if (done) break;
        oaiBuffer += oaiDecoder.decode(value, { stream: true });
        const lines = oaiBuffer.split("\n");
        oaiBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch { /* ignore malformed SSE chunks */ }
        }
      }

    }

    await db.insert(supportMessagesTable).values({
      conversationId: conv.id,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    logger.error({ err }, "[support] AI provider error");
    let userMsg = "Désolé, une erreur s'est produite. Veuillez réessayer.";
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      if (e["status"] === 429 || (typeof e["message"] === "string" && e["message"].includes("429"))) {
        userMsg = "Le service est temporairement surchargé. Veuillez réessayer dans quelques secondes.";
      } else if (e["status"] === 400 || (typeof e["message"] === "string" && e["message"].includes("API key"))) {
        userMsg = "Configuration IA invalide. Veuillez vérifier la clé API dans le panneau administrateur.";
      }
    }
    res.write(`data: ${JSON.stringify({ error: userMsg })}\n\n`);
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
