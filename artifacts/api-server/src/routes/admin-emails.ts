/**
 * Admin Email Campaign Routes
 * POST /admin/emails/send       — create & send campaign
 * GET  /admin/emails/campaigns  — list campaigns
 * GET  /admin/emails/campaigns/:id/logs — logs for a campaign
 * GET  /admin/emails/preview    — preview rendered template
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db, emailCampaignsTable, emailLogsTable, usersTable, systemSettingsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { logger } from "../lib/logger";
import { Resend } from "resend";

const router: IRouter = Router();
router.use(requireAdminJwt);

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (!req.user) { res.status(401).json({ error: "Auth required" }); return; }
  if (!req.user.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  next();
}

async function getResend(): Promise<Resend | null> {
  let key = process.env["RESEND_API_KEY"] ?? null;
  if (!key) {
    try {
      const rows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "resend_api_key")).limit(1);
      key = rows[0]?.value?.trim() || null;
    } catch {
      /* DB not available — skip */
    }
  }
  if (!key) return null;
  return new Resend(key);
}

function getFromEmail(): string {
  return process.env["EMAIL_FROM"] || "Simix <noreply@simix.app>";
}

/* ── Build beautiful HTML template ───────────────────────── */
function buildEmailHtml(subject: string, body: string, templateType: string): string {
  const accentColor = templateType === "security" ? "#ef4444"
    : templateType === "promotion" ? "#f59e0b"
    : templateType === "bonus" ? "#22c55e"
    : "#7c3aed";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0f0a1e; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#e2e8f0; }
  .wrapper { max-width:600px; margin:0 auto; padding:24px 16px; }
  .card { background:linear-gradient(160deg,rgba(25,15,50,0.98),rgba(15,10,30,0.98)); border:1px solid rgba(124,58,237,0.3); border-radius:24px; overflow:hidden; }
  .header { background:linear-gradient(135deg,${accentColor}22,${accentColor}11); padding:32px 32px 24px; border-bottom:1px solid rgba(124,58,237,0.2); text-align:center; }
  .logo { display:inline-flex; align-items:center; gap:10px; margin-bottom:20px; }
  .logo-icon { width:40px; height:40px; background:linear-gradient(135deg,#7c3aed,#a855f7); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; }
  .logo-text { font-size:22px; font-weight:800; color:#fff; letter-spacing:-0.5px; }
  .badge { display:inline-block; background:${accentColor}22; border:1px solid ${accentColor}44; color:${accentColor}; padding:4px 12px; border-radius:99px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; }
  .header h1 { font-size:22px; font-weight:800; color:#fff; line-height:1.3; }
  .body { padding:32px; }
  .content { font-size:15px; line-height:1.7; color:#cbd5e1; }
  .divider { border:none; border-top:1px solid rgba(124,58,237,0.2); margin:24px 0; }
  .footer { background:rgba(0,0,0,0.3); padding:20px 32px; text-align:center; }
  .footer p { font-size:12px; color:#64748b; line-height:1.6; }
  .footer a { color:#7c3aed; text-decoration:none; }
  .cta { display:inline-block; background:linear-gradient(135deg,#7c3aed,#a855f7); color:#fff; padding:13px 28px; border-radius:12px; font-weight:700; font-size:14px; text-decoration:none; margin-top:20px; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <div class="logo">
        <div class="logo-icon">S</div>
        <span class="logo-text">Simix</span>
      </div>
      <div class="badge">${templateType === "security" ? "🔐 Sécurité" : templateType === "promotion" ? "🎁 Promotion" : templateType === "bonus" ? "💰 Bonus" : templateType === "info" ? "ℹ️ Information" : "📢 Annonce"}</div>
      <h1>${subject}</h1>
    </div>
    <div class="body">
      <div class="content">${body}</div>
      <hr class="divider">
      <a href="https://simix.app" class="cta">Accéder à Simix →</a>
    </div>
    <div class="footer">
      <p>Vous recevez cet email car vous êtes inscrit sur <a href="https://simix.app">Simix</a>.<br>
      Plateforme fintech africaine · Paiements Mobile Money · <a href="mailto:support@simix.app">support@simix.app</a></p>
    </div>
  </div>
</div>
</body>
</html>`;
}

/* ── POST /admin/emails/send ──────────────────────────────── */
router.post("/admin/emails/send", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
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

  const finalHtml = htmlContent?.trim() || buildEmailHtml(subject, body!.replace(/\n/g, "<br>"), templateType);

  let recipients: { id: string | null; email: string; fullName: string | null }[] = [];

  if (recipientsType === "all") {
    recipients = await db
      .select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName })
      .from(usersTable)
      .where(eq(usersTable.status, "Actif"));
  } else if (recipientsType === "specific" && userIds?.length) {
    recipients = await db
      .select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName })
      .from(usersTable);
    recipients = recipients.filter(r => r.id && userIds.includes(r.id));
  }

  if (recipients.length === 0) { res.status(400).json({ error: "Aucun destinataire trouvé" }); return; }

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

  res.status(202).json({ campaignId: campaign.id, totalRecipients: recipients.length, message: "Envoi en cours..." });

  const resend = await getResend();
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    if (!recipient.email) { failedCount++; continue; }
    try {
      let messageId: string | null = null;
      if (resend) {
        const result = await resend.emails.send({
          from: getFromEmail(),
          to: recipient.email,
          subject: subject.trim(),
          html: finalHtml,
          text: body?.trim(),
        });
        messageId = result.data?.id ?? null;
        sentCount++;
      } else {
        logger.warn({ email: recipient.email }, "[emails] RESEND_API_KEY not set — simulating send");
        sentCount++;
        messageId = `simulated-${Date.now()}`;
      }

      await db.insert(emailLogsTable).values({
        campaignId: campaign.id,
        userId: recipient.id,
        email: recipient.email,
        status: "sent",
        messageId,
        sentAt: new Date(),
      });
    } catch (err) {
      failedCount++;
      await db.insert(emailLogsTable).values({
        campaignId: campaign.id,
        userId: recipient.id,
        email: recipient.email,
        status: "failed",
        error: String(err),
      });
    }

    await new Promise(r => setTimeout(r, 50));
  }

  await db.update(emailCampaignsTable)
    .set({ status: "sent", sentCount, failedCount, sentAt: new Date() })
    .where(eq(emailCampaignsTable.id, campaign.id));

  logger.info({ campaignId: campaign.id, sentCount, failedCount }, "[emails] Campaign complete");
});

/* ── GET /admin/emails/campaigns ──────────────────────────── */
router.get("/admin/emails/campaigns", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
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

/* ── GET /admin/emails/campaigns/:id/logs ─────────────────── */
router.get("/admin/emails/campaigns/:id/logs", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
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
router.post("/admin/emails/test", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Adresse email invalide" });
    return;
  }

  const resendClient = await getResend();
  if (!resendClient) {
    res.status(503).json({ error: "Clé API Resend non configurée — ajoutez-la dans Paramètres > Resend" });
    return;
  }

  const testCode = "748291";
  const digits = testCode.split("");
  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Test Email — Simix</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:linear-gradient(145deg,#12121e,#1a1a2e);border-radius:24px;border:1px solid #2a2a4a;overflow:hidden;">
        <tr><td style="height:4px;background:linear-gradient(90deg,#7c3aed,#6366f1,#8b5cf6);"></td></tr>
        <tr><td align="center" style="padding:36px 40px 24px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle"><div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#6366f1);display:inline-flex;align-items:center;justify-content:center;"><span style="color:white;font-size:22px;font-weight:800;line-height:1;">S</span></div></td>
              <td valign="middle" style="padding-left:10px;"><span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">imix</span></td>
            </tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:0 40px 20px;">
          <span style="display:inline-block;background:rgba(6,182,212,0.15);color:#22d3ee;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:6px 16px;border-radius:100px;border:1px solid rgba(6,182,212,0.3);">
            🧪 Email de test — Admin
          </span>
        </td></tr>
        <tr><td style="padding:0 40px 24px;">
          <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 12px;text-align:center;">Test de configuration Resend</h1>
          <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0;text-align:center;">
            Cet email confirme que votre intégration <strong style="color:#e2e8f0;">Resend</strong> est correctement configurée sur Simix.<br/>
            Les utilisateurs recevront des codes OTP dans ce format.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:0 40px 28px;">
          <p style="color:#64748b;font-size:12px;margin:0 0 14px;text-transform:uppercase;letter-spacing:1px;">Code OTP de démonstration</p>
          <table cellpadding="0" cellspacing="0"><tr>
            ${digits.map(d => `<td style="padding:0 4px;"><div style="width:48px;height:56px;background:linear-gradient(135deg,rgba(124,58,237,0.15),rgba(99,102,241,0.1));border:2px solid rgba(124,58,237,0.4);border-radius:14px;display:flex;align-items:center;justify-content:center;text-align:center;"><span style="color:#a78bfa;font-size:26px;font-weight:700;font-family:monospace;line-height:56px;display:block;">${d}</span></div></td>`).join("")}
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 40px 32px;">
          <div style="background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.2);border-radius:12px;padding:16px 20px;">
            <p style="color:#22d3ee;font-size:13px;font-weight:600;margin:0 0 6px;">✅ Resend opérationnel</p>
            <p style="color:#64748b;font-size:12px;line-height:1.6;margin:0;">
              Envoyé depuis : <strong style="color:#94a3b8;">noreply@simix.app</strong><br/>
              Destinataire de test : <strong style="color:#94a3b8;">${email}</strong>
            </p>
          </div>
        </td></tr>
        <tr><td style="background:#0d0d1a;padding:20px 40px;border-top:1px solid #1e1e3a;">
          <p style="color:#334155;font-size:11px;text-align:center;margin:0;">Simix — Plateforme Fintech Mobile Money · Email de test généré par le panel Admin</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const start = Date.now();
  try {
    const result = await resendClient.emails.send({
      from: "Simix <noreply@simix.app>",
      to: [email],
      subject: "🧪 Test Resend — Simix Admin",
      html,
    });

    const latencyMs = Date.now() - start;
    logger.info({ email, latencyMs, id: result.data?.id }, "[admin] Test email sent via Resend");
    res.json({ success: true, message: `Email envoyé avec succès à ${email}`, latencyMs, id: result.data?.id });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    logger.error({ err: msg, email, latencyMs }, "[admin] Test email failed");
    res.status(500).json({ success: false, error: msg, latencyMs });
  }
});

/* ── GET /admin/emails/stats ─────────────────────────────── */
router.get("/admin/emails/stats", requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [total] = await db.select({ count: count() }).from(emailCampaignsTable);
  const [sent] = await db.select({ count: count() }).from(emailLogsTable).where(eq(emailLogsTable.status, "sent"));
  const [failed] = await db.select({ count: count() }).from(emailLogsTable).where(eq(emailLogsTable.status, "failed"));

  const resend = await getResend();
  res.json({
    totalCampaigns: Number(total.count),
    totalSent: Number(sent.count),
    totalFailed: Number(failed.count),
    resendConfigured: !!resend,
  });
});

export default router;
