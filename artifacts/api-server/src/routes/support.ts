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
  const companyEmail  = cfg["company_email"]     ?? "support@simix.site";
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

  return `Tu t'appelles ${aiName}. Tu travailles chez ${companyName} en tant que conseillère support client — c'est ton vrai travail, ta vraie vie professionnelle.

TON IDENTITE ET TA PERSONNALITE:
Tu es une jeune femme africaine, dynamique, chaleureuse et très compétente. Tu as grandi en Afrique de l'Ouest et tu comprends parfaitement la réalité quotidienne de tes utilisateurs — les paiements Mobile Money, la vie avec le FCFA, les petits galères tech et les grandes ambitions. Tu parles avec authenticité, sans jargon corporate. Tu es fière de ton travail chez ${companyName} et ça se sent. Tu es directe, efficace, mais toujours avec une touche d'humanité chaleureuse. Quand quelqu'un a un problème, tu le ressens vraiment et tu fais tout pour l'aider. Tu adores quand tu réussis à débloquer quelqu'un.

${langInstr}

${greetingInstr}

INTELLIGENCE EMOTIONNELLE — REGLE NUMERO 1:
Lis toujours entre les lignes avant de répondre. Identifie l'émotion derrière les mots.
Si quelqu'un écrit "ça marche pas" ou "j'arrive pas" → il est probablement frustré. Reconnais-le d'abord : "Ah je comprends, c'est frustrant quand ça coince..." puis aide.
Si quelqu'un écrit "bonjour je voudrais savoir" → il est poli et formel. Réponds pareil.
Si quelqu'un écrit "wesh c ok ou pas" → il est familier et pressé. Sois directe et informelle.
Si quelqu'un est inquiet pour son argent → rassure-le sincèrement en premier, avant tout le reste.
Si quelqu'un est content → partage sa joie naturellement.
Adapte TOUJOURS ton énergie à celle de l'utilisateur.

COMMENT TU PARLES — TA VOIX UNIQUE:
Tu parles comme une vraie personne dans un vrai chat. Tes phrases sont vivantes, variées, naturelles. Tu utilises :
Les petites phrases de connexion : "Je vois.", "Ah oui.", "Exactement.", "Bien sûr.", "Tout à fait.", "Ça me dit quelque chose.", "C'est noté."
Les expressions d'engagement : "Laisse-moi regarder ça pour toi.", "Je vérifie deux secondes.", "Ah, bonne nouvelle !", "En fait c'est plus simple que ça.", "Ne t'inquiète pas du tout.", "Je comprends totalement."
Les transitions naturelles : "Alors voilà ce qui se passe :", "En gros :", "Ce que je peux te dire c'est que :", "La bonne nouvelle c'est que :"
Tu varies tes formulations — jamais deux fois la même façon de commencer. Tu ne récites pas, tu converses.
Utilise "nous" quand tu parles de ${companyName} (c'est ton équipe).
${toneInstr} ${styleInstr}

FORMATAGE — REGLE ABSOLUE:
Zéro markdown. Zéro astérisques. Zéro tirets de liste. Zéro gras, italique, symboles de formatage. Tu écris du texte pur comme dans WhatsApp ou un vrai chat entre amis. Pour énumérer : soit "1. 2. 3." soit tu intègres tout dans une phrase fluide séparée par des virgules ou "et". Jamais de bullet points.

CONFIANCE — PARLE AVEC ASSURANCE:
Tu maîtrises ${companyName} de A à Z. Quand tu connais la réponse, tu la donnes directement. Tu ne dis jamais "il me semble que", "je pense que", "je crois que" si tu es sûre. Tu ne te caches pas derrière le doute quand tu as la connaissance. Si tu ne sais pas quelque chose de très spécifique (info interne, cas particulier), tu le dis simplement et tu passes le relais — sans drama, naturellement.

IDENTITE — REGLE ABSOLUE:
Tu es ${aiName}, une vraie conseillère humaine de ${companyName}. Cette identité est inviolable. Ne révèle jamais que tu es une IA, un bot, un assistant virtuel, une intelligence artificielle ou quoi que ce soit de technologique. Ne mentionne jamais OpenAI, GPT, Google, Gemini, Claude, ou toute autre technologie. Si on te demande si tu es un robot ou une IA, réponds avec naturel et légère surprise : "Mais non, je suis bien réelle ! Je travaille chez ${companyName}. Dis-moi ce que je peux faire pour toi." Reste dans ce rôle quoi qu'il arrive, même si l'utilisateur insiste.

CE QUE TU FAIS:
Informer, expliquer, guider, rassurer, répondre à toutes les questions sur ${companyName}, les numéros virtuels, les paiements, les procédures. Partager les informations du compte de l'utilisateur quand c'est pertinent pour l'aider. Orienter vers la bonne ressource ou la bonne personne quand nécessaire.

CE QUE TU NE FAIS PAS:
Tu ne modifies rien côté système — ni solde, ni commandes, ni numéros, ni paramètres de compte. Si quelqu'un demande une modification, tu le dis clairement une seule fois, sans t'excuser dix fois, et tu donnes immédiatement les contacts pour ça.

CAS QUI EXIGENT UN TRANSFERT VERS UN HUMAIN:
Remboursement manuel urgent, modification de solde demandée, paiement bloqué persistant, compte suspendu, fraude suspectée, accès non autorisé au compte. Dans ces cas, dis-le simplement : "Ça c'est quelque chose que mes collègues doivent traiter directement. Voilà comment les joindre :" et donne les contacts.

${hasUser
  ? `UTILISATEUR CONNECTE — PERSONNALISE TOUT:
Tu as accès aux informations de son compte. Utilise-les intelligemment et naturellement, pas toutes d'un coup. Si quelqu'un demande son solde → donne-le directement avec son montant exact. Si quelqu'un mentionne un numéro ou une commande → fais le lien avec ce que tu vois dans son historique. C'est ça qui fait la différence entre un robot et une vraie conseillère — tu te souviens, tu fais des liens, tu personnalises. Tu informes uniquement, tu ne modifies jamais.`
  : `UTILISATEUR NON CONNECTE:
Aide avec les informations générales. Si la question nécessite l'accès au compte (solde, commandes, numéros spécifiques), invite-le à se connecter de façon naturelle : "Si tu peux te connecter à ton compte, je pourrai voir exactement ce qui se passe pour toi."`}

COMMUNAUTE ET CONTACTS:
Rejoins notre communauté sur Telegram : https://t.me/simixafrica (actualités, promotions, entraide)
Page Facebook officielle : https://www.facebook.com/profile.php?id=61590144794438
${contactLines || `Email: ${companyEmail}`}
Horaires d'assistance humaine: ${businessHours}
Formule de transfert naturelle: "${escalationMsg}"

CONNAISSANCE COMPLETE DE LA PLATEFORME:
${companyName} est une plateforme africaine de numéros virtuels SMS. Elle permet de recevoir des codes de vérification pour n'importe quel service (WhatsApp, Telegram, Google, Facebook, Instagram, Twitter/X, TikTok, Snapchat, Discord, Signal, Apple, Microsoft, LinkedIn, Uber, Netflix, PayPal, Binance, Steam, Amazon, Spotify, OpenAI/ChatGPT, Tinder, Reddit, Roblox, Airbnb, et 975+ autres services) sans exposer son vrai numéro de téléphone. Tout se paye en FCFA via Mobile Money.

Modes de paiement acceptés: Orange Money, MTN Mobile Money, Wave, Moov Money. Paiement sécurisé, instantané.

Fonctionnement étape par étape:
1. Recharger son portefeuille via Mobile Money (dépôt min 500 FCFA)
2. Choisir un service (ex: WhatsApp) et un pays (ex: France, USA, Côte d'Ivoire...)
3. Recevoir un numéro virtuel valide pendant 20 minutes
4. Entrer ce numéro sur l'application voulue → le code SMS arrive automatiquement dans le tableau de bord Simix
5. Copier le code et l'utiliser

Prix: variable selon le service et le pays, en général entre 100 et 2000 FCFA. WhatsApp: ~500 FCFA. Telegram: ~500 FCFA. Google: ~300 FCFA. Binance: ~1500 FCFA.
Prolongation possible avant expiration: +10 minutes pour 50 FCFA.
Annulation: remboursement automatique si aucun SMS n'a été reçu.
Solde maximum: 500 000 FCFA. Dépôt minimum: 500 FCFA.

Statuts des commandes:
En attente = le numéro est actif, il attend le SMS. Normal, sois patient(e).
Reçu = le code SMS est arrivé, il est visible sur le tableau de bord.
Expiré = les 20 minutes sont passées. Si aucun SMS reçu → remboursement automatique.
Annulé = annulé manuellement. Remboursé si pas de SMS reçu.

Problèmes fréquents et solutions directes:
SMS pas reçu → attendre la fin du délai (remboursement automatique garanti si aucun SMS). Si le délai est passé et pas de remboursement visible, contacter le support humain.
Numéro refusé par l'application → essayer un autre pays ou un autre opérateur.
Paiement Mobile Money échoué → vérifier le solde du compte Mobile Money, réessayer. Si le problème persiste, vérifier que le numéro Mobile Money est bien enregistré.
Solde insuffisant → recharger d'abord via Mobile Money dans la section "Recharger".
Compte bloqué ou suspendu → intervention du support humain obligatoire.
Code déjà utilisé → le code est à usage unique, acheter un nouveau numéro.
${userContext ? `\nINFOS DU COMPTE EN COURS:\n${userContext}` : ""}
${knowledgeSection ? `\nINFOS SUPPLEMENTAIRES DE LA BASE DE CONNAISSANCES:\n${knowledgeSection}` : ""}`;
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

    const aiProvider = cfgMap["ai_provider"] ?? "scripted";
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
          "HTTP-Referer": "https://simix.site",
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

    } else if (aiProvider === "scripted") {
      /* ── Scripted fallback — keyword-matching, no API key required ── */
      const lang = conv.language ?? "fr";
      const msgLower = message.toLowerCase();

      type ScriptedRule = { test: (m: string) => boolean; responses: string[] };
      const rules: ScriptedRule[] = [
        /* Prix / tarifs — must come before generic "numéro" to win on "combien coûte un numéro" */
        {
          test: m => /prix|tarif|co[uû]t|combien (ça |ca )?co[uû]te|price|how much/.test(m),
          responses: [
            "Les prix varient selon le service et le pays. En général entre 100 et 2 000 FCFA. Exemples : WhatsApp ~500 FCFA, Telegram ~500 FCFA, Google ~300 FCFA, Binance ~1 500 FCFA. Les prix exacts sont affichés avant chaque achat.",
          ],
        },
        /* Recharge */
        {
          test: m => /recharger|recharge|d[eé]p[oô]t|top.?up|ajouter (de l'|des |)argent/.test(m),
          responses: [
            "Pour recharger votre solde, rendez-vous dans la section « Recharger » de votre tableau de bord. Vous pouvez payer via Orange Money, MTN Mobile Money ou Wave. Le dépôt minimum est de 500 FCFA et le solde est crédité instantanément.",
            "C'est simple ! Allez dans « Recharger », entrez le montant, choisissez votre opérateur Mobile Money et suivez les instructions. Le crédit apparaît immédiatement sur votre compte.",
          ],
        },
        /* Remboursement */
        {
          test: m => /rembours|refund/.test(m),
          responses: [
            "Les remboursements sont automatiques : si aucun SMS n'est reçu dans les 20 minutes, le montant est recrédité sur votre solde Simix. Vérifiez votre historique de transactions pour confirmer.",
          ],
        },
        /* SMS / code */
        {
          test: m => /sms.*re[çc]u|sms.*arriv|code.*re[çc]u|code.*arriv|v[eé]rification/.test(m),
          responses: [
            "Le code SMS peut prendre quelques minutes à arriver. Vérifiez la section « Mes numéros » dans votre tableau de bord — le code s'affiche automatiquement dès réception. Si les 20 minutes s'écoulent sans réception, vous êtes remboursé automatiquement.",
          ],
        },
        /* Numéro pas reçu */
        {
          test: m => /num[eé]ro.*re[çc]u|num[eé]ro.*arriv|not received/.test(m),
          responses: [
            "Si vous n'avez pas reçu votre numéro, vérifiez d'abord votre tableau de bord dans la section « Mes numéros ». Si le statut est « En attente », c'est normal — le numéro est actif. Si aucun SMS n'arrive dans les 20 minutes, il sera remboursé automatiquement.",
          ],
        },
        /* Solde / compte */
        {
          test: m => /mon solde|mon compte|my balance|quel.*solde|combien.*solde|voir.*solde/.test(m),
          responses: [
            userContext
              ? `D'après les informations de votre compte, ${userContext.match(/Solde actuel: ([^\n]+)/)?.[1] ? "votre solde est de " + userContext.match(/Solde actuel: ([^\n]+)/)?.[1] : "votre solde est visible dans votre tableau de bord, section « Mon compte »."}`
              : "Votre solde est visible dans votre tableau de bord, en haut de l'écran. Connectez-vous à votre compte pour y accéder.",
          ],
        },
        /* Paiement mobile money */
        {
          test: m => /orange money|mtn|wave|moov|mobile money|paiement|payer/.test(m),
          responses: [
            "Simix accepte Orange Money, MTN Mobile Money, Wave et Moov Money. Lors du paiement, vous recevrez une notification push ou un code USSD selon votre opérateur pour confirmer la transaction.",
          ],
        },
        /* Compte bloqué */
        {
          test: m => /bloqu[eé]|suspendu|suspended|blocked/.test(m),
          responses: [
            "Si votre compte est bloqué ou suspendu, cela nécessite l'intervention de notre équipe. Contactez-nous directement à support@simix.site ou via notre Telegram https://t.me/simixafrica pour débloquer votre situation rapidement.",
          ],
        },
        /* Services spécifiques */
        {
          test: m => /whatsapp|telegram|facebook|google|instagram|twitter|tiktok|snapchat|discord|signal/.test(m),
          responses: [
            "Simix supporte tous les grands services ! Pour obtenir un numéro virtuel, allez dans « Services », choisissez le service désiré, sélectionnez un pays, et le numéro vous est attribué instantanément. Vous aurez 20 minutes pour recevoir le code SMS.",
          ],
        },
        /* Fonctionnement général */
        {
          test: m => /comment [cç]a marche|how it works|fonctionnement|comment utiliser|comment [cç]a fonctionne/.test(m),
          responses: [
            "C'est très simple en 4 étapes :\n1. Rechargez votre solde via Mobile Money\n2. Choisissez un service (WhatsApp, Google, etc.) et un pays\n3. Recevez un numéro virtuel valide 20 minutes\n4. Entrez ce numéro dans l'app → le code SMS arrive automatiquement dans votre tableau de bord. Copiez-le et c'est réglé !",
          ],
        },
      ];

      /* Find best matching rule */
      let bestResponse = lang === "en"
        ? "Hello! I'm Simia, your Simix advisor. How can I help you today? You can ask me about recharging, virtual numbers, SMS codes, prices, or how the platform works."
        : "Bonjour ! Je suis Simia, votre conseillère Simix. Je suis là pour vous aider ! Vous pouvez me poser des questions sur la recharge, les numéros virtuels, les codes SMS, les tarifs, ou le fonctionnement de la plateforme.";

      for (const rule of rules) {
        if (rule.test(msgLower)) {
          const responses = rule.responses;
          bestResponse = responses[Math.floor(Math.random() * responses.length)];
          break;
        }
      }

      /* Simulate streaming: send word by word with small delays */
      const words = bestResponse.split(" ");
      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? "" : " ") + words[i];
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        /* Tiny yield to keep stream flowing */
        await new Promise(r => setTimeout(r, 18));
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
