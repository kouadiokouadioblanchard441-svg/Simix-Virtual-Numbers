/**
 * Admin Email Campaign Routes
 * POST /admin/emails/send       — create & send campaign
 * GET  /admin/emails/campaigns  — list campaigns
 * GET  /admin/emails/campaigns/:id/logs — logs for a campaign
 * GET  /admin/emails/preview    — preview rendered template
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, count, ne, isNotNull, and, ilike, or } from "drizzle-orm";
import { db, emailCampaignsTable, emailLogsTable, usersTable, emailProvidersTable } from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { logger } from "../lib/logger";
import { getAppUrl } from "../lib/app-url";
import { emailService } from "../lib/email-service";
import { refreshCampaignProgress } from "../lib/email-router/manager";
import { getFromEmail } from "../lib/email-from";

const router: IRouter = Router();
router.use(requireAdminJwt);

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.adminPayload) { next(); return; }
  if (!req.user) { res.status(401).json({ error: "Auth required" }); return; }
  if (!req.user.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  next();
}

function escapeCampaignHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildBrandedCampaignEmailHtml(subject: string, body: string, templateType: string): string {
  const appUrl = getAppUrl();
  const safeSubject = escapeCampaignHtml(subject);
  const safeBody = escapeCampaignHtml(body).replace(/\r?\n/g, "<br>");
  const accentColor = templateType === "security" ? "#ef4444"
    : templateType === "promotion" ? "#f59e0b"
    : templateType === "bonus" ? "#059669"
    : "#7c3aed";
  const badgeLabel = templateType === "security" ? "Sécurité"
    : templateType === "promotion" ? "Promotion"
    : templateType === "bonus" ? "Bonus"
    : templateType === "system" ? "Système"
    : templateType === "announcement" ? "Annonce"
    : "Information";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${safeSubject} — Simix</title>
  <style>
    @media only screen and (max-width:620px) {
      .email-shell { padding:16px 0 !important; }
      .email-card { border-left:0 !important;border-right:0 !important;border-radius:0 !important; }
      .email-content { padding:30px 24px 26px !important; }
      .email-title { font-size:24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f1f3;font-family:Arial,Helvetica,sans-serif;color:#17171c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f1f3;">
    <tr>
      <td align="center" class="email-shell" style="padding:28px 16px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td style="background:#17151f;border-radius:14px 14px 0 0;padding:22px 24px;text-align:center;">
              <a href="${appUrl}" style="text-decoration:none;">
                <img src="${appUrl}/simix-icon.png" alt="" width="30" height="30" style="display:inline-block;vertical-align:middle;width:30px;height:30px;border:0;border-radius:8px;margin-right:8px;">
                <span style="display:inline-block;vertical-align:middle;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:30px;font-weight:700;letter-spacing:1.8px;">SIMIX</span>
              </a>
            </td>
          </tr>
          <tr>
            <td class="email-card" style="background:#ffffff;border:1px solid #e3e3e7;border-top:0;border-radius:0 0 14px 14px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="email-content" style="padding:32px 42px 30px;">
                    <p style="margin:0 0 10px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${accentColor};">${badgeLabel} Simix</p>
                    <h1 class="email-title" style="margin:0 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.3px;color:#111114;">${safeSubject}</h1>
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#24242a;">${safeBody}</div>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto 0;">
                      <tr>
                        <td style="background:#7c3aed;border-radius:4px;">
                          <a href="${appUrl}" style="display:block;padding:13px 28px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;text-decoration:none;">Accéder à Simix</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:15px 24px;background:#fbfbfc;border-top:1px solid #eeeef2;text-align:center;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b6b75;">Vous recevez cet email parce que vous êtes inscrit sur Simix.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 12px 0;">
              <p style="margin:0 0 5px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8b8b93;">© ${new Date().getFullYear()} Simix · <a href="mailto:simixsupport@gmail.com" style="color:#7c3aed;text-decoration:none;">Support</a></p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#a1a1aa;">Ceci est un message automatique, veuillez ne pas y répondre.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ── Build beautiful HTML template ───────────────────────── */
function buildEmailHtml(subject: string, body: string, templateType: string): string {
  const accentColor = templateType === "security" ? "#ef4444"
    : templateType === "promotion" ? "#f59e0b"
    : templateType === "bonus" ? "#059669"
    : "#7c3aed";

  const badgeLabel = templateType === "security" ? "🔐 Sécurité"
    : templateType === "promotion" ? "🎁 Promotion"
    : templateType === "bonus" ? "💰 Bonus"
    : templateType === "info" ? "ℹ️ Information"
    : "📢 Annonce";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <img src="data:image/png;base64,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" alt="Simix" width="44" height="44" style="display:block;border-radius:12px;" />
                  </td>
                  <td valign="middle" style="padding-left:10px;">
                    <span style="color:#1a1a2e;font-size:22px;font-weight:900;letter-spacing:-0.5px;">Simix</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #e2e2ea;overflow:hidden;">

              <!-- Top accent bar -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="height:4px;background:${accentColor};"></td></tr>
              </table>

              <!-- Header -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:28px 32px 0;text-align:center;">
                    <span style="display:inline-block;background:${accentColor}18;border:1px solid ${accentColor}44;color:${accentColor};padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">${badgeLabel}</span>
                    <h1 style="margin:0;color:#1a1a2e;font-size:20px;font-weight:700;line-height:1.3;">${subject}</h1>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:24px 32px 28px;">
                    <div style="font-size:15px;line-height:1.75;color:#374151;">${body}</div>
                    <table cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
                      <tr>
                        <td style="background:${accentColor};border-radius:10px;">
                          <a href="${getAppUrl()}" style="display:block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Accéder à Simix →</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Footer card -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:18px 32px;border-top:1px solid #f0f0f5;text-align:center;">
                    <p style="margin:0;font-size:12px;color:#9999b8;line-height:1.6;">
                      Vous recevez cet email car vous êtes inscrit sur <a href="${getAppUrl()}" style="color:#7c3aed;text-decoration:none;">Simix</a>.<br>
                      <a href="mailto:simixsupport@gmail.com" style="color:#7c3aed;text-decoration:none;">simixsupport@gmail.com</a>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Bottom footer -->
          <tr>
            <td style="padding:16px 0 0;text-align:center;">
              <img src="${getAppUrl()}/logo.svg" alt="Simix" width="90" height="19" style="display:block;margin:0 auto 10px;opacity:0.7;" />
              <p style="margin:0;color:#c4c4d4;font-size:11px;">© ${new Date().getFullYear()} Simix · Fintech 100% Africaine</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ── POST /admin/emails/send ──────────────────────────────── */
router.post("/admin/emails/send", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const {
    subject,
    body,
    htmlContent,
    templateType = "info",
    recipientsType = "all",
    userIds,
  } = req.body as {
    subject: string;
    body?: string;
    htmlContent?: string;
    templateType?: string;
    recipientsType?: "all" | "specific";
    userIds?: string[];
  };

  if (!subject?.trim()) { res.status(400).json({ error: "Sujet requis" }); return; }
  if (!body?.trim() && !htmlContent?.trim()) { res.status(400).json({ error: "Contenu requis" }); return; }

  const finalHtml = htmlContent?.trim() || buildBrandedCampaignEmailHtml(subject, body!, templateType);
  const from = await getFromEmail();

  /* ── Filtre des emails réels (exclure les placeholders @simix.site) ── */
  function isRealEmail(email: string | null | undefined): boolean {
    if (!email || !email.includes("@")) return false;
    const trimmed = email.trim().toLowerCase();
    if (trimmed.endsWith("@simix.site")) return false;
    if (trimmed.endsWith("@example.com") || trimmed.endsWith("@test.com")) return false;
    return true;
  }

  let recipients: { id: string | null; email: string; fullName: string | null }[] = [];

  if (recipientsType === "all") {
    const rows = await db
      .select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName })
      .from(usersTable)
      .where(and(ne(usersTable.status, "Bloqué"), isNotNull(usersTable.email)));
    recipients = rows.filter(r => isRealEmail(r.email));
  } else if (recipientsType === "specific" && userIds?.length) {
    const allUsers = await db
      .select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName })
      .from(usersTable)
      .where(isNotNull(usersTable.email));
    recipients = allUsers.filter(r => r.id && userIds.includes(r.id) && isRealEmail(r.email));
  }

  if (recipients.length === 0) {
    res.status(400).json({ error: "Aucun destinataire avec une adresse email réelle. Les emails placeholder (@simix.site) sont exclus." });
    return;
  }

  const [campaign] = await db.insert(emailCampaignsTable).values({
    subject: subject.trim(),
    htmlContent: finalHtml,
    textContent: body?.trim(),
    templateType,
    recipientsType,
    recipientIds: userIds ?? null,
    status: "sending",
    totalRecipients: recipients.length,
  }).returning();

  await db.insert(emailLogsTable).values(recipients.map(recipient => ({
    campaignId: campaign.id,
    userId: recipient.id,
    email: recipient.email,
    status: "pending",
  })));

  res.status(202).json({ campaignId: campaign.id, totalRecipients: recipients.length, message: "Envoi en cours..." });

  /* ── Envoi en arrière-plan par petits lots ─────────────────────────────
   * Chaque email passe par le routeur multi-fournisseurs. Les lots limitent
   * la concurrence et évitent de saturer les quotas gratuits.             */
  const BATCH_SIZE   = 10;
  const BATCH_DELAY  = 1200;

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE).filter(r => !!r.email);
    if (batch.length === 0) continue;

    /* Chaque message passe par le gestionnaire central :
       clés du panneau, priorité, failover et file d'attente inclus. */
    await Promise.all(batch.map(async (recipient) => {
      try {
        const result = await emailService.send({
          from,
          to: recipient.email as string,
          subject: subject.trim(),
          html: finalHtml,
          ...(body?.trim() ? { text: body.trim() } : {}),
          idempotencyKey: `campaign-${campaign.id}-${recipient.id ?? recipient.email}`,
          metadata: { type: "admin_campaign", campaignId: campaign.id },
        });

        if (!result.success && !result.queued) {
          await db.update(emailLogsTable)
            .set({ status: "failed", error: (result.error ?? "Échec définitif de l'envoi").slice(0, 500) })
            .where(and(
              eq(emailLogsTable.campaignId, campaign.id),
              eq(emailLogsTable.email, recipient.email),
              eq(emailLogsTable.status, "pending"),
            ));
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ campaignId: campaign.id, email: recipient.email, err: errMsg }, "[emails] Envoi individuel échoué");
        await db.update(emailLogsTable)
          .set({ status: "failed", error: errMsg.slice(0, 500) })
          .where(and(
            eq(emailLogsTable.campaignId, campaign.id),
            eq(emailLogsTable.email, recipient.email),
            eq(emailLogsTable.status, "pending"),
          ));
      }
    }));

    /* Pause between batches to respect rate limits */
    if (i + BATCH_SIZE < recipients.length) {
      await sleep(BATCH_DELAY);
    }
  }

  await refreshCampaignProgress(campaign.id);
  logger.info({ campaignId: campaign.id, totalRecipients: recipients.length }, "[emails] Campaign initial dispatch complete");
});

/* ── GET /admin/emails/campaigns ──────────────────────────── */
router.get("/admin/emails/campaigns", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const campaigns = await db
    .select()
    .from(emailCampaignsTable)
    .orderBy(desc(emailCampaignsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(emailCampaignsTable);

  res.json({ campaigns, total: Number(total) });
});

/* ── GET /admin/emails/campaigns/:id/progress ─────────────── */
router.get("/admin/emails/campaigns/:id/progress", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;

  const campaign = await db
    .select()
    .from(emailCampaignsTable)
    .where(eq(emailCampaignsTable.id, id))
    .limit(1);

  if (!campaign[0]) { res.status(404).json({ error: "Campagne introuvable" }); return; }

  /* Count logs in real-time directly from the DB */
  const [sentRow]   = await db.select({ c: count() }).from(emailLogsTable).where(and(eq(emailLogsTable.campaignId, id), eq(emailLogsTable.status, "sent")));
  const [failedRow] = await db.select({ c: count() }).from(emailLogsTable).where(and(eq(emailLogsTable.campaignId, id), eq(emailLogsTable.status, "failed")));
  const [pendingRow] = await db.select({ c: count() }).from(emailLogsTable).where(and(eq(emailLogsTable.campaignId, id), eq(emailLogsTable.status, "pending")));

  const sentNow   = Number(sentRow?.c  ?? 0);
  const failedNow = Number(failedRow?.c ?? 0);
  const pendingNow = Number(pendingRow?.c ?? 0);
  const processedNow = sentNow + failedNow;

  res.json({
    campaignId:      id,
    status:          campaign[0].status,
    totalRecipients: campaign[0].totalRecipients,
    sentCount:       sentNow,
    failedCount:     failedNow,
    pendingCount:    pendingNow,
    processedCount:  processedNow,
    percentDone:     campaign[0].totalRecipients > 0
      ? Math.round((processedNow / campaign[0].totalRecipients) * 100)
      : 0,
    isDone: pendingNow === 0,
  });
});

/* ── GET /admin/emails/campaigns/:id/logs ─────────────────── */
router.get("/admin/emails/campaigns/:id/logs", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const logs = await db
    .select({
      id: emailLogsTable.id,
      email: emailLogsTable.email,
      status: emailLogsTable.status,
      error: emailLogsTable.error,
      sentAt: emailLogsTable.sentAt,
      fullName: usersTable.fullName,
    })
    .from(emailLogsTable)
    .leftJoin(usersTable, eq(emailLogsTable.userId, usersTable.id))
    .where(eq(emailLogsTable.campaignId, id))
    .orderBy(desc(emailLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ logs });
});

/* ── POST /admin/emails/test ──────────────────────────────── */
router.post("/admin/emails/test", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Adresse email invalide" });
    return;
  }

  const start = Date.now();
  try {
    const result = await emailService.send({
      from: await getFromEmail(),
      to: email,
      subject: "Test de configuration email — Simix Admin",
      html: buildBrandedCampaignEmailHtml(
        "Test de configuration email",
        `Cet email confirme qu'un fournisseur email configuré dans le panneau administrateur fonctionne correctement.\n\nDestinataire de test : ${email}\n\nLes emails utilisateurs passent par cette même infrastructure.`,
        "system",
      ),
      idempotencyKey: `admin-test-${Date.now()}-${email}`,
      metadata: { type: "admin_email_test" },
    });

    const latencyMs = Date.now() - start;
    if (!result.success) {
      res.status(503).json({ success: false, error: result.error ?? "Aucun fournisseur email n'a pu envoyer le message", latencyMs });
      return;
    }
    logger.info({ email, latencyMs, id: result.messageId, provider: result.provider }, "[admin] Test email envoyé");
    res.json({ success: true, message: `Email envoyé avec succès à ${email}`, latencyMs, id: result.messageId, provider: result.provider });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    logger.error({ err: msg, email, latencyMs }, "[admin] Test email failed");
    res.status(500).json({ success: false, error: msg, latencyMs });
  }
});

/* ── GET /admin/emails/recipients ────────────────────────── */
router.get("/admin/emails/recipients", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const search = (req.query.search as string | undefined)?.trim();
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const rows = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      email: usersTable.email,
      phone: usersTable.phone,
      status: usersTable.status,
    })
    .from(usersTable)
    .where(
      search
        ? and(
            ne(usersTable.status, "Bloqué"),
            isNotNull(usersTable.email),
            or(
              ilike(usersTable.fullName, `%${search}%`),
              ilike(usersTable.email, `%${search}%`),
              ilike(usersTable.phone ?? "", `%${search}%`),
            )
          )
        : and(ne(usersTable.status, "Bloqué"), isNotNull(usersTable.email))
    )
    .limit(limit);

  /* Exclure les emails placeholder @simix.site et domaines de test */
  const eligible = rows.filter(r => {
    if (!r.email?.includes("@")) return false;
    const e = r.email.trim().toLowerCase();
    return !e.endsWith("@simix.site") && !e.endsWith("@example.com") && !e.endsWith("@test.com");
  });

  res.json({ recipients: eligible, total: eligible.length });
});

/* ── GET /admin/emails/stats ─────────────────────────────── */
router.get("/admin/emails/stats", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [total] = await db.select({ count: count() }).from(emailCampaignsTable);
  const [sent] = await db.select({ count: count() }).from(emailLogsTable).where(eq(emailLogsTable.status, "sent"));
  const [failed] = await db.select({ count: count() }).from(emailLogsTable).where(eq(emailLogsTable.status, "failed"));
  const [pending] = await db.select({ count: count() }).from(emailLogsTable).where(eq(emailLogsTable.status, "pending"));

  const [activeProvider] = await db.select({ id: emailProvidersTable.id })
    .from(emailProvidersTable)
    .where(eq(emailProvidersTable.active, true))
    .limit(1);
  res.json({
    totalCampaigns: Number(total.count),
    totalSent: Number(sent.count),
    totalFailed: Number(failed.count),
    totalPending: Number(pending.count),
    emailConfigured: !!activeProvider,
  });
});

export default router;
