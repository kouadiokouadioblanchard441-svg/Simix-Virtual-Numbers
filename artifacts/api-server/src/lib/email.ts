import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "Simix <noreply@simix.app>";

function getOtpEmailHtml(code: string, purpose: "register" | "inactivity"): string {
  const isInactivity = purpose === "inactivity";
  const title = isInactivity ? "Vérification de sécurité" : "Vérifiez votre adresse email";
  const subtitle = isInactivity
    ? "Connexion après une longue période d'inactivité détectée"
    : "Bienvenue sur Simix — une dernière étape pour activer votre compte";
  const bodyText = isInactivity
    ? "Nous avons détecté que vous ne vous êtes pas connecté depuis plus de 10 jours. Pour protéger votre compte, veuillez confirmer votre identité avec le code ci-dessous."
    : "Merci de vous être inscrit sur Simix, la plateforme fintech 100% africaine. Pour activer votre compte, entrez le code de vérification ci-dessous dans l'application.";

  const digits = code.split("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — Simix</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:linear-gradient(145deg,#12121e,#1a1a2e);border-radius:24px;border:1px solid #2a2a4a;overflow:hidden;">

          <!-- Header gradient bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#7c3aed,#6366f1,#8b5cf6);"></td>
          </tr>

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:36px 40px 24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#6366f1);display:inline-flex;align-items:center;justify-content:center;">
                      <span style="color:white;font-size:22px;font-weight:800;line-height:1;">S</span>
                    </div>
                  </td>
                  <td valign="middle" style="padding-left:10px;">
                    <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">imix</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Badge -->
          <tr>
            <td align="center" style="padding:0 40px 20px;">
              <span style="display:inline-block;background:${isInactivity ? "rgba(234,179,8,0.15)" : "rgba(124,58,237,0.15)"};color:${isInactivity ? "#fbbf24" : "#a78bfa"};font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:6px 16px;border-radius:100px;border:1px solid ${isInactivity ? "rgba(234,179,8,0.3)" : "rgba(124,58,237,0.3)"};">
                ${isInactivity ? "🔐 Vérification de sécurité" : "✉️ Confirmation d'email"}
              </span>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td align="center" style="padding:0 40px 12px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3;">${title}</h1>
              <p style="margin:10px 0 0;color:#8b8ba7;font-size:13px;line-height:1.6;">${subtitle}</p>
            </td>
          </tr>

          <!-- Body text -->
          <tr>
            <td style="padding:20px 40px;">
              <p style="margin:0;color:#9999b8;font-size:14px;line-height:1.7;">${bodyText}</p>
            </td>
          </tr>

          <!-- OTP Box -->
          <tr>
            <td align="center" style="padding:8px 40px 32px;">
              <table cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(124,58,237,0.12),rgba(99,102,241,0.08));border:1px solid rgba(124,58,237,0.3);border-radius:18px;padding:28px 36px;">
                <tr>
                  <td align="center">
                    <p style="margin:0 0 16px;color:#8b8ba7;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Code de vérification</p>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        ${digits.map((d) => `
                        <td style="padding:0 4px;">
                          <div style="width:44px;height:56px;background:rgba(255,255,255,0.05);border:2px solid rgba(124,58,237,0.5);border-radius:12px;display:flex;align-items:center;justify-content:center;">
                            <span style="color:#ffffff;font-size:28px;font-weight:800;font-family:'Courier New',monospace;line-height:56px;display:block;text-align:center;">${d}</span>
                          </div>
                        </td>`).join("")}
                      </tr>
                    </table>
                    <p style="margin:16px 0 0;color:#6b6b8a;font-size:12px;">Expire dans <strong style="color:#a78bfa;">10 minutes</strong></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security notice -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table cellpadding="0" cellspacing="0" width="100%" style="background:rgba(234,179,8,0.05);border:1px solid rgba(234,179,8,0.15);border-radius:12px;padding:16px;">
                <tr>
                  <td valign="top" style="padding-right:12px;padding-top:2px;">
                    <span style="font-size:16px;">🛡️</span>
                  </td>
                  <td>
                    <p style="margin:0;color:#fbbf24;font-size:12px;font-weight:600;margin-bottom:4px;">Conseil de sécurité</p>
                    <p style="margin:0;color:#8b8ba7;font-size:12px;line-height:1.6;">Ne partagez jamais ce code avec personne. Simix ne vous demandera jamais votre code OTP par téléphone ou email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#5a5a7a;font-size:11px;text-align:center;line-height:1.7;">
                Si vous n'avez pas demandé ce code, ignorez cet email.<br/>
                Ce code est valable 10 minutes et ne peut être utilisé qu'une seule fois.<br/><br/>
                <span style="color:#3a3a5a;">© 2025 Simix · Fintech 100% Africaine · Paiements Mobile Money</span>
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

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: "register" | "inactivity",
): Promise<void> {
  const subject =
    purpose === "register"
      ? "Votre code de vérification Simix"
      : "Vérification de sécurité — Connexion Simix";

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
