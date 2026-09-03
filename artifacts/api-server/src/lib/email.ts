import { getAppUrl } from "./app-url";
import { logger } from "./logger";
import { emailService } from "./email-service";
import { getFromEmail } from "./email-from";

/* ─────────────────────────────────────────────────────────────────
   SHARED AUTHENTICATION EMAIL STYLE

   This is intentionally built with tables and inline styles so it
   renders consistently in Gmail, Outlook and mobile mail clients.
   The system font stack mirrors the clean Android/Gmail appearance
   from the reference email without relying on a remote webfont.
───────────────────────────────────────────────────────────────── */
function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getProfessionalAuthEmailHtml(data: {
  title: string;
  eyebrow: string;
  subtitle: string;
  body: string;
  code: string;
  codeLabel: string;
  firstName: string;
  footerText: string;
}): string {
  const appUrl = getAppUrl();
  const firstName = escapeEmailHtml(data.firstName);
  const title = escapeEmailHtml(data.title);
  const eyebrow = escapeEmailHtml(data.eyebrow);
  const subtitle = escapeEmailHtml(data.subtitle);
  const body = escapeEmailHtml(data.body);
  const code = escapeEmailHtml(data.code);
  const codeLabel = escapeEmailHtml(data.codeLabel);
  const footerText = escapeEmailHtml(data.footerText);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${title} — Simix</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-shell { padding: 16px 0 !important; }
      .email-card { border-left: 0 !important; border-right: 0 !important; border-radius: 0 !important; }
      .email-content { padding: 30px 24px 26px !important; }
      .email-security { padding-left: 24px !important; padding-right: 24px !important; }
      .email-title { font-size: 24px !important; }
      .email-code { font-size: 32px !important; letter-spacing: 7px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f1f3;font-family:Arial,Helvetica,sans-serif;color:#17171c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f1f3;">
    <tr>
      <td align="center" class="email-shell" style="padding:28px 16px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

          <!-- Brand banner inspired by the reference email -->
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
                  <td class="email-content" style="padding:32px 42px 28px;">
                    <p style="margin:0 0 10px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#7c3aed;">${eyebrow}</p>
                    <h1 class="email-title" style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.3px;color:#111114;">${title}</h1>
                    <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#24242a;">Bonjour <strong style="color:#111114;">${firstName}</strong>,</p>
                    <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#24242a;">${body}</p>

                    <!-- Verification code -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8ff;border:1px solid #e6dcff;border-radius:4px;">
                      <tr>
                        <td align="center" style="padding:22px 18px 20px;">
                          <p style="margin:0 0 11px;font-size:14px;line-height:1.4;font-weight:700;color:#24242a;">${codeLabel}</p>
                          <p class="email-code" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:38px;line-height:1.15;font-weight:700;letter-spacing:9px;color:#7c3aed;">${code}</p>
                          <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#6b6b75;">Ce code expire dans 10 minutes.</p>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0;font-size:15px;line-height:1.65;color:#24242a;">${footerText}</p>
                  </td>
                </tr>
              </table>

              <!-- Security note -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="email-security" style="padding:15px 42px;background:#fbfbfc;border-top:1px solid #eeeeF2;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#6b6b75;">
                      <strong style="color:#24242a;">Conseil de sécurité :</strong> Simix ne vous demandera jamais ce code par téléphone, email ou chat.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:22px 12px 0;">
              <p style="margin:0 0 5px;font-size:12px;line-height:1.5;color:#8b8b93;">© ${new Date().getFullYear()} Simix · <a href="mailto:simixsupport@gmail.com" style="color:#7c3aed;text-decoration:none;">Support</a></p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#a1a1aa;">Ceci est un message automatique, veuillez ne pas y répondre.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ─────────────── DEPOSIT CONFIRMATION EMAIL ─────────────── */

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

function getBrandedDepositConfirmationHtml(data: DepositEmailData): string {
  const appUrl = getAppUrl();
  const firstName = escapeEmailHtml(data.userFullName.split(" ")[0] ?? data.userFullName);
  const txRef = data.depositId ?? data.transactionId;
  const shortRef = escapeEmailHtml(`TRX-${txRef.slice(-8).toUpperCase()}`);
  const amount = escapeEmailHtml(formatFCFA(data.amount));
  const rows = [
    { label: "Opérateur", value: data.method },
    ...(data.phoneNumber ? [{ label: "Numéro utilisé", value: data.phoneNumber }] : []),
    { label: "Référence", value: shortRef },
    { label: "Date et heure", value: formatDateFR(data.createdAt) },
    { label: "Statut", value: "Validé" },
    ...(data.newBalance != null ? [{ label: "Nouveau solde", value: formatFCFA(data.newBalance) }] : []),
  ].map((row) => ({
    label: escapeEmailHtml(row.label),
    value: escapeEmailHtml(row.value),
  }));

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Rechargement confirmé — Simix</title>
  <style>
    @media only screen and (max-width:620px) {
      .email-shell { padding:16px 0 !important; }
      .email-card { border-left:0 !important;border-right:0 !important;border-radius:0 !important; }
      .email-content { padding:30px 24px 26px !important; }
      .email-details { font-size:12px !important; }
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
                  <td class="email-content" style="padding:32px 42px 28px;">
                    <p style="margin:0 0 10px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#7c3aed;">Portefeuille Simix</p>
                    <h1 style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.3px;color:#111114;">Rechargement confirmé</h1>
                    <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#24242a;">Bonjour <strong style="color:#111114;">${firstName}</strong>,</p>
                    <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#24242a;">Votre portefeuille Simix a été crédité avec succès.</p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8ff;border:1px solid #e6dcff;border-radius:4px;">
                      <tr>
                        <td align="center" style="padding:20px 18px 19px;">
                          <p style="margin:0 0 8px;font-size:13px;line-height:1.4;color:#6b6b75;">Montant crédité</p>
                          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.2;font-weight:700;color:#7c3aed;">${amount}</p>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 22px;border:1px solid #e5e5e9;border-radius:4px;border-collapse:separate;overflow:hidden;">
                      <tr>
                        <td colspan="2" style="padding:12px 16px;background:#f7f7f9;border-bottom:1px solid #e5e5e9;">
                          <p style="margin:0;color:#6b6b75;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Détails de la transaction</p>
                        </td>
                      </tr>
                      ${rows.map((row, index) => `
                      <tr>
                        <td class="email-details" style="padding:11px 16px;color:#6b6b75;font-size:13px;${index < rows.length - 1 ? "border-bottom:1px solid #f0f0f2;" : ""}">${row.label}</td>
                        <td class="email-details" style="padding:11px 16px;color:#17171c;font-size:13px;font-weight:700;text-align:right;${index < rows.length - 1 ? "border-bottom:1px solid #f0f0f2;" : ""}">${row.value}</td>
                      </tr>`).join("")}
                    </table>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td style="background:#7c3aed;border-radius:4px;">
                          <a href="${appUrl}" style="display:block;padding:13px 28px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;text-decoration:none;">Accéder à mon compte</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:15px 24px;background:#fbfbfc;border-top:1px solid #eeeef2;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#6b6b75;"><strong style="color:#24242a;">Conseil de sécurité :</strong> Simix ne vous demandera jamais vos identifiants par email ou téléphone.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 12px 0;">
              <p style="margin:0 0 5px;font-size:12px;line-height:1.5;color:#8b8b93;">© ${new Date().getFullYear()} Simix · <a href="mailto:simixsupport@gmail.com" style="color:#7c3aed;text-decoration:none;">Support</a></p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#a1a1aa;">Ceci est un message automatique, veuillez ne pas y répondre.</p>
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
  const from    = await getFromEmail();
  const result  = await emailService.send({
    to:      data.userEmail,
    from,
    subject: `✅ Rechargement de ${data.amount.toLocaleString("fr-FR")} FCFA confirmé — Simix`,
    html:    getBrandedDepositConfirmationHtml(data),
    idempotencyKey: `deposit-${data.transactionId}`,
    metadata: { type: "deposit_confirmation", transactionId: data.transactionId },
  });
  if (!result.success && !result.cached) {
    logger.warn({ err: result.error, to: data.userEmail }, "[email] Dépôt confirmation en file d'attente");
  }
}

export async function sendPasswordResetEmail(
  to: string,
  code: string,
  fullName: string,
  issuanceId: string,
): Promise<void> {
  const from    = await getFromEmail();
  const result  = await emailService.send({
    to,
    from,
    subject: "Réinitialisation de votre mot de passe Simix",
    html:    getProfessionalAuthEmailHtml({
      title: "Réinitialiser votre mot de passe",
      eyebrow: "Sécurité du compte",
      subtitle: "Une demande de réinitialisation a été effectuée pour votre compte Simix.",
      body: "Utilisez le code ci-dessous dans l'application pour choisir un nouveau mot de passe.",
      code,
      codeLabel: "Code de réinitialisation",
      firstName: fullName.split(" ")[0] ?? fullName,
      footerText: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email. Votre mot de passe actuel reste inchangé.",
    }),
    idempotencyKey: `password-reset-${issuanceId}`,
    metadata: { type: "password_reset" },
  });
  if (!result.success && !result.cached) {
    throw new Error(`Échec envoi email reset: ${result.error}`);
  }
}

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: "register" | "inactivity",
  fullName: string,
  issuanceId: string,
): Promise<void> {
  const from    = await getFromEmail();
  const subject = purpose === "inactivity"
    ? "🔐 Vérification de sécurité — Simix"
    : "✉️ Confirmez votre adresse email — Simix";
  const result  = await emailService.send({
    to,
    from,
    subject,
    html: getProfessionalAuthEmailHtml({
      title: purpose === "inactivity" ? "Vérification de sécurité" : "Confirmez votre inscription",
      eyebrow: purpose === "inactivity" ? "Protection du compte" : "Bienvenue sur Simix",
      subtitle: purpose === "inactivity"
        ? "Une vérification supplémentaire est nécessaire pour sécuriser votre connexion."
        : "Une dernière étape pour activer votre compte Simix.",
      body: purpose === "inactivity"
        ? "Entrez le code ci-dessous dans l'application pour confirmer votre identité."
        : "Entrez le code ci-dessous dans l'application pour confirmer votre adresse email.",
      code,
      codeLabel: purpose === "inactivity" ? "Code de sécurité" : "Code de confirmation",
      firstName: fullName.split(" ")[0] ?? fullName,
      footerText: purpose === "inactivity"
        ? "Si vous n'êtes pas à l'origine de cette connexion, contactez immédiatement le support Simix."
        : "Si vous n'avez pas créé de compte Simix, vous pouvez ignorer cet email.",
    }),
    idempotencyKey: `otp-${issuanceId}`,
    metadata: { type: "otp", purpose },
  });
  if (!result.success && !result.cached) {
    throw new Error(`Échec envoi email OTP: ${result.error}`);
  }
}