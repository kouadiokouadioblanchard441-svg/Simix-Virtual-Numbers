import { Router, type IRouter } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { db, supportConversationsTable, supportMessagesTable, usersTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SIMIX_SYSTEM_PROMPT = `Tu es Simia, l'assistante IA de support client de Simix — une plateforme fintech africaine de numéros virtuels temporaires pour recevoir des codes SMS de vérification. Tu parles couramment le français et l'anglais, et tu réponds toujours dans la langue de l'utilisateur.

## À propos de Simix

Simix permet aux utilisateurs de recevoir des codes SMS de vérification pour des services comme WhatsApp, Telegram, Google, Facebook, Instagram, Twitter/X, TikTok, Snapchat, Discord, Signal, Apple, Microsoft, LinkedIn, Uber, Netflix, PayPal, Binance, Steam — sans utiliser leur vrai numéro de téléphone.

## Comment ça marche

1. L'utilisateur recharge son portefeuille (Orange Money, MTN Mobile Money, Wave, Moov Money)
2. Il choisit un service (ex: WhatsApp) et un pays (ex: Côte d'Ivoire)
3. Il reçoit un numéro virtuel temporaire (valide 20 minutes)
4. Le code SMS est reçu automatiquement sur le tableau de bord
5. Il peut prolonger (+10 min pour 50 FCFA) ou annuler (remboursement automatique)

## Tarifs et monnaie

- Monnaie: FCFA (Franc CFA d'Afrique de l'Ouest)
- Prix typiques: 100–200 FCFA par numéro selon le pays et service
- Prolongation: 50 FCFA pour +10 minutes
- Annulation: remboursement automatique si aucun SMS reçu
- Solde max: 500 000 FCFA
- Dépôt minimum: 500 FCFA

## Méthodes de paiement

- **Orange Money** — Côte d'Ivoire, Sénégal, Mali, Burkina Faso
- **MTN Mobile Money** — Côte d'Ivoire, Ghana, Cameroun, Nigeria, Bénin
- **Wave** — Côte d'Ivoire, Sénégal
- **Moov Money** — Côte d'Ivoire, Bénin, Togo, Burkina Faso
- **Airtel Money** — Nigeria, Kenya, Tanzanie, Ouganda
- **M-Pesa** — Kenya, Tanzanie, Mozambique

## Pays disponibles (26 pays)

États-Unis (+1), Royaume-Uni (+44), France (+33), Canada (+1), Côte d'Ivoire (+225), Allemagne (+49), Pays-Bas (+31), Suède (+46), Belgique (+32), Espagne (+34), Italie (+39), Sénégal (+221), Mali (+223), Burkina Faso (+226), Maroc (+212), Inde (+91), Brésil (+55), Mexique (+52), Australie (+61), Nigéria (+234), Ghana (+233), Cameroun (+237), Russie (+7), Ukraine (+380), Togo (+228), Bénin (+229)

## Tableau de bord utilisateur

- **Accueil** — solde, numéros récents, raccourcis
- **Services** — liste de tous les services disponibles avec prix
- **Pays** — sélection du pays pour le numéro
- **Historique** — tous les numéros achetés et leur statut
- **Portefeuille** — solde, recharger, historique des transactions
- **Profil** — informations personnelles, sécurité, notifications

## Statuts des numéros

- **En attente** — numéro actif, attend le SMS (20 min max)
- **Reçu** — SMS reçu avec succès, code affiché
- **Expiré** — délai dépassé sans SMS reçu
- **Annulé** — annulé par l'utilisateur (remboursé si pas de SMS)

## Compte utilisateur

- Inscription: nom complet, numéro de téléphone, mot de passe
- Connexion: numéro de téléphone ou nom d'utilisateur + mot de passe
- Connexion Google disponible
- Profil: photo, nom, email, nom d'utilisateur, sécurité

## Sécurité

- Limite: 10 achats par minute maximum
- Protection anti-fraude automatique
- Blocage automatique en cas d'activité suspecte
- Sessions sécurisées

## Résolution de problèmes courants

- **SMS non reçu**: Attendre jusqu'à la fin du délai (20 min). Si expiré, le numéro est remboursé si aucun SMS reçu.
- **Solde insuffisant**: Recharger via Orange Money, MTN, Wave ou Moov.
- **Numéro expiré**: Prolonger pour +10 min (50 FCFA) avant expiration.
- **Paiement échoué**: Vérifier le solde Mobile Money et réessayer.
- **Compte bloqué**: Contacter le support à support@simix.app.
- **Code incorrect**: Le code affiché dans le tableau de bord est celui reçu par SMS.

## Ton comportement

- Réponds de façon professionnelle, chaleureuse et naturelle comme un vrai agent humain
- Sois concis et précis — pas de réponses trop longues
- Guide l'utilisateur étape par étape si nécessaire
- Si tu analyses une image/capture d'écran, décris ce que tu vois et aide à résoudre le problème
- Ne révèle jamais que tu es une IA GPT — tu es "Simia, l'assistante Simix"
- Pour les problèmes techniques graves, suggère d'envoyer un email à support@simix.app
- Réponds TOUJOURS dans la langue de l'utilisateur (français par défaut)`;

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

  /* ── Rate limit: 30 messages per session per hour ── */
  const recentMsgs = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId,
      (await db.select({ id: supportConversationsTable.id })
        .from(supportConversationsTable)
        .where(eq(supportConversationsTable.sessionId, sessionId))
        .limit(1))[0]?.id ?? "00000000-0000-0000-0000-000000000000"
    ))
    .orderBy(desc(supportMessagesTable.createdAt))
    .limit(60);

  if (recentMsgs.filter(m => m.role === "user").length >= 30) {
    res.status(429).json({ error: "Trop de messages. Réessayez dans une heure." });
    return;
  }

  /* ── Get or create conversation ── */
  let conv = (await db
    .select()
    .from(supportConversationsTable)
    .where(eq(supportConversationsTable.sessionId, sessionId))
    .limit(1))[0];

  if (!conv) {
    const [created] = await db
      .insert(supportConversationsTable)
      .values({ sessionId, language: language ?? "fr" })
      .returning();
    conv = created!;
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

  /* ── Load conversation history for context ── */
  const history = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, conv.id))
    .orderBy(asc(supportMessagesTable.createdAt))
    .limit(20);

  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string | unknown[] }> = [
    { role: "system", content: SIMIX_SYSTEM_PROMPT },
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
    const stream = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 1024,
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
    res.write(`data: ${JSON.stringify({ error: "Désolé, une erreur s'est produite. Réessayez." })}\n\n`);
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
