import { Resend } from "resend";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAppUrl } from "./app-url";

async function getResend(): Promise<Resend | null> {
  let key = process.env.RESEND_API_KEY ?? null;
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
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  return "Simix <simixsupport@gmail.com>";
}
const FROM_EMAIL = getFromEmail();

/* ─────────────────────────────────────────────────────────────────
   OTP EMAIL  (inscription + inactivité)
───────────────────────────────────────────────────────────────── */
function getOtpEmailHtml(code: string, purpose: "register" | "inactivity"): string {
  const isInactivity = purpose === "inactivity";
  const title    = isInactivity ? "Vérification de sécurité" : "Vérifiez votre adresse email";
  const subtitle = isInactivity
    ? "Connexion après une longue période d'inactivité détectée"
    : "Bienvenue sur Simix — une dernière étape pour activer votre compte";
  const bodyText = isInactivity
    ? "Nous avons détecté que vous ne vous êtes pas connecté depuis plus de 10 jours. Pour protéger votre compte, veuillez confirmer votre identité avec le code ci-dessous."
    : "Merci de vous être inscrit sur Simix, la plateforme fintech 100% africaine. Pour activer votre compte, entrez le code de vérification ci-dessous dans l'application.";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — Simix</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo header -->
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <table cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#7c3aed,#6366f1);border-radius:10px;width:36px;height:36px;">
                      <tr><td align="center" valign="middle" style="color:#ffffff;font-size:20px;font-weight:900;">S</td></tr>
                    </table>
                  </td>
                  <td valign="middle" style="padding-left:8px;">
                    <span style="color:#1a1a2e;font-size:20px;font-weight:800;letter-spacing:-0.5px;">Simix</span>
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
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,#7c3aed,#6366f1);"></td>
                </tr>
              </table>

              <!-- Content -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:36px 40px 28px;">

                    <!-- Title -->
                    <h1 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;line-height:1.3;">${title}</h1>
                    <p style="margin:0 0 20px;color:#6b6b8a;font-size:14px;line-height:1.5;">${subtitle}</p>
                    <p style="margin:0 0 28px;color:#44445a;font-size:14px;line-height:1.7;">${bodyText}</p>

                    <!-- OTP code block -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7ff;border:1px solid #ddd6fe;border-radius:12px;margin-bottom:24px;">
                      <tr>
                        <td style="padding:24px;text-align:center;">
                          <p style="margin:0 0 12px;color:#6b6b8a;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Votre code de vérification</p>
                          <p style="margin:0;color:#7c3aed;font-size:40px;font-weight:900;letter-spacing:12px;font-family:'Courier New',Courier,monospace;">${code}</p>
                          <p style="margin:12px 0 0;color:#9999b8;font-size:12px;">Expire dans <strong style="color:#7c3aed;">10 minutes</strong></p>
                        </td>
                      </tr>
                    </table>

                    <!-- Security notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:8px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <p style="margin:0 0 4px;color:#92400e;font-size:12px;font-weight:700;">🛡️ Conseil de sécurité</p>
                          <p style="margin:0;color:#78716c;font-size:12px;line-height:1.6;">Ne partagez jamais ce code. Simix ne vous demandera jamais votre code OTP par téléphone ou email.</p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 0;text-align:center;">
              <img src="${getAppUrl()}/logo.svg" alt="Simix" width="90" height="19" style="display:block;margin:0 auto 12px;opacity:0.7;" />
              <p style="margin:0 0 6px;color:#9999b8;font-size:11px;line-height:1.7;">
                Si vous n'avez pas demandé ce code, ignorez cet email.<br/>
                Ce code est valable 10 minutes et ne peut être utilisé qu'une seule fois.
              </p>
              <p style="margin:0;color:#c4c4d4;font-size:11px;">
                © ${new Date().getFullYear()} Simix · <a href="mailto:simixsupport@gmail.com" style="color:#7c3aed;text-decoration:none;">simixsupport@gmail.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────────────
   RESET MOT DE PASSE
───────────────────────────────────────────────────────────────── */
function getPasswordResetEmailHtml(code: string, fullName: string): string {
  const firstName = fullName.split(" ")[0] ?? fullName;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Réinitialisation de mot de passe — Simix</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="max-width:520px;">

          <!-- Logo header -->
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <table cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#7c3aed,#6366f1);border-radius:10px;width:36px;height:36px;">
                      <tr><td align="center" valign="middle" style="color:#ffffff;font-size:20px;font-weight:900;">S</td></tr>
                    </table>
                  </td>
                  <td valign="middle" style="padding-left:8px;">
                    <span style="color:#1a1a2e;font-size:20px;font-weight:800;letter-spacing:-0.5px;">Simix</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #e2e2ea;overflow:hidden;">

              <!-- Top accent bar (rouge) -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,#ef4444,#f97316);"></td>
                </tr>
              </table>

              <!-- Content -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:36px 40px 28px;">

                    <h1 style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;line-height:1.3;">Bonjour ${firstName} 👋</h1>
                    <p style="margin:0 0 8px;color:#6b6b8a;font-size:14px;line-height:1.5;">Vous avez demandé à réinitialiser votre mot de passe.</p>
                    <p style="margin:0 0 28px;color:#44445a;font-size:14px;line-height:1.7;">Entrez ce code dans l'application pour créer un nouveau mot de passe. Si vous n'avez pas fait cette demande, ignorez cet email — votre compte reste protégé.</p>

                    <!-- Code block -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5f5;border:1px solid #fecaca;border-radius:12px;margin-bottom:24px;">
                      <tr>
                        <td style="padding:24px;text-align:center;">
                          <p style="margin:0 0 12px;color:#6b6b8a;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Code de réinitialisation</p>
                          <p style="margin:0;color:#dc2626;font-size:40px;font-weight:900;letter-spacing:12px;font-family:'Courier New',Courier,monospace;">${code}</p>
                          <p style="margin:12px 0 0;color:#9999b8;font-size:12px;">Expire dans <strong style="color:#dc2626;">10 minutes</strong></p>
                        </td>
                      </tr>
                    </table>

                    <!-- Warning notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <p style="margin:0 0 4px;color:#92400e;font-size:12px;font-weight:700;">⚠️ Vous n'avez pas fait cette demande ?</p>
                          <p style="margin:0;color:#78716c;font-size:12px;line-height:1.6;">Ignorez cet email. Votre mot de passe restera inchangé.</p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 0;text-align:center;">
              <img src="${getAppUrl()}/logo.svg" alt="Simix" width="90" height="19" style="display:block;margin:0 auto 12px;opacity:0.7;" />
              <p style="margin:0;color:#c4c4d4;font-size:11px;">
                © ${new Date().getFullYear()} Simix · <a href="mailto:simixsupport@gmail.com" style="color:#7c3aed;text-decoration:none;">simixsupport@gmail.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ─────────────────── DEPOSIT CONFIRMATION EMAIL ─────────────────── */

export interface DepositEmailData {
  userFullName: string;
  userEmail: string;
  amount: number;
  method: string;
  phoneNumber?: string | null;
  transactionId: string;
  depositId?: string | null;
  createdAt: Date;
  newBalance?: number | null;
}

function formatFCFA(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}

function formatDateFR(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/* ─────────────────────────────────────────────────────────────────
   CONFIRMATION DÉPÔT
───────────────────────────────────────────────────────────────── */
function getDepositConfirmationHtml(data: DepositEmailData): string {
  const firstName = data.userFullName.split(" ")[0] ?? data.userFullName;
  const txRef     = data.depositId ?? data.transactionId;
  const shortRef  = `TRX-${txRef.slice(-8).toUpperCase()}`;
  const dateStr   = formatDateFR(data.createdAt);
  const amountStr = formatFCFA(data.amount);

  const rows: { label: string; value: string }[] = [
    { label: "Opérateur",       value: data.method },
    ...(data.phoneNumber ? [{ label: "Numéro utilisé", value: data.phoneNumber }] : []),
    { label: "Référence",        value: shortRef },
    { label: "Date et heure",    value: dateStr },
    { label: "Statut",           value: "✅ Validé" },
    ...(data.newBalance != null ? [{ label: "Nouveau solde", value: formatFCFA(data.newBalance) }] : []),
  ];

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Rechargement confirmé — Simix</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo header -->
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <table cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#7c3aed,#6366f1);border-radius:10px;width:36px;height:36px;">
                      <tr><td align="center" valign="middle" style="color:#ffffff;font-size:20px;font-weight:900;">S</td></tr>
                    </table>
                  </td>
                  <td valign="middle" style="padding-left:8px;">
                    <span style="color:#1a1a2e;font-size:20px;font-weight:800;letter-spacing:-0.5px;">Simix</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #e2e2ea;overflow:hidden;">

              <!-- Top accent bar (vert) -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,#059669,#10b981);"></td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:36px 40px 28px;">

                    <!-- Heading -->
                    <h1 style="margin:0 0 6px;color:#1a1a2e;font-size:22px;font-weight:700;">Rechargement confirmé 🎉</h1>
                    <p style="margin:0 0 24px;color:#6b6b8a;font-size:14px;line-height:1.5;">Bonjour <strong>${firstName}</strong>, votre solde a été crédité avec succès.</p>

                    <!-- Amount block -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px;">
                      <tr>
                        <td style="padding:24px;text-align:center;">
                          <p style="margin:0 0 6px;color:#6b6b8a;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Montant crédité</p>
                          <p style="margin:0;color:#059669;font-size:36px;font-weight:900;letter-spacing:-1px;">${amountStr}</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Transaction details -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e2ea;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                      <tr>
                        <td colspan="2" style="padding:12px 16px;background:#f8f8fb;border-bottom:1px solid #e2e2ea;">
                          <p style="margin:0;color:#6b6b8a;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Détails de la transaction</p>
                        </td>
                      </tr>
                      ${rows.map((row, i) => `
                      <tr style="${i < rows.length - 1 ? "border-bottom:1px solid #f0f0f5;" : ""}">
                        <td style="padding:11px 16px;color:#6b6b8a;font-size:13px;">${row.label}</td>
                        <td style="padding:11px 16px;color:#1a1a2e;font-size:13px;font-weight:600;text-align:right;">${row.value}</td>
                      </tr>`).join("")}
                    </table>

                    <!-- CTA -->
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
                      <tr>
                        <td style="background:#7c3aed;border-radius:10px;">
                          <a href="${getAppUrl()}" style="display:block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Accéder à mon compte →</a>
                        </td>
                      </tr>
                    </table>

                    <!-- Security notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <p style="margin:0 0 4px;color:#92400e;font-size:12px;font-weight:700;">🛡️ Conseil de sécurité</p>
                          <p style="margin:0;color:#78716c;font-size:12px;line-height:1.6;">Simix ne vous demandera jamais vos identifiants par email ou téléphone. En cas d'activité suspecte, contactez immédiatement notre support.</p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 0;text-align:center;">
              <img src="${getAppUrl()}/logo.svg" alt="Simix" width="90" height="19" style="display:block;margin:0 auto 12px;opacity:0.7;" />
              <p style="margin:0 0 4px;color:#9999b8;font-size:11px;line-height:1.7;">
                Vous recevez cet email car vous avez effectué un rechargement sur Simix.<br/>
                Si vous n'êtes pas à l'origine de cette opération, contactez-nous immédiatement.
              </p>
              <p style="margin:0;color:#c4c4d4;font-size:11px;">
                © ${new Date().getFullYear()} Simix · <a href="mailto:simixsupport@gmail.com" style="color:#7c3aed;text-decoration:none;">simixsupport@gmail.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendDepositConfirmationEmail(data: DepositEmailData): Promise<void> {
  const resend = await getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping deposit confirmation email");
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: data.userEmail,
    subject: `✅ Rechargement de ${data.amount.toLocaleString("fr-FR")} FCFA confirmé — Simix`,
    html: getDepositConfirmationHtml(data),
  });

  if (error) {
    throw new Error(`Échec envoi email dépôt: ${error.message}`);
  }
}

export async function sendPasswordResetEmail(
  to: string,
  code: string,
  fullName: string,
): Promise<void> {
  const resend = await getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping password reset email");
    return;
  }
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Réinitialisation de votre mot de passe Simix",
    html: getPasswordResetEmailHtml(code, fullName),
  });
  if (error) {
    throw new Error(`Échec envoi email reset: ${error.message}`);
  }
}

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: "register" | "inactivity",
): Promise<void> {
  const resend = await getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping OTP email");
    return;
  }
  const subject = purpose === "inactivity"
    ? "🔐 Vérification de sécurité — Simix"
    : "✉️ Confirmez votre adresse email — Simix";

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html: getOtpEmailHtml(code, purpose),
  });
  if (error) {
    throw new Error(`Échec envoi email OTP: ${error.message}`);
  }
}
