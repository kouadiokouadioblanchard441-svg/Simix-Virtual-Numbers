/**
 * Renvoie les emails OTP de vérification aux utilisateurs non-vérifiés
 * en utilisant le vrai template professionnel Simix.
 * Usage: pnpm --filter @workspace/scripts run resend-otps
 */
import pg from "pg";
import { randomInt } from "node:crypto";
import { Resend } from "resend";

const { Client } = pg;

const APP_URL = process.env.APP_URL ?? "https://simix.site";
const OTP_EXPIRY_MS = 10 * 60 * 1000;

function getOtpEmailHtml(code: string, fullName: string): string {
  const firstName = fullName.split(" ")[0] ?? fullName;
  const title    = "Vérifiez votre adresse email";
  const subtitle = "Bienvenue sur Simix — une dernière étape pour activer votre compte";
  const bodyText = "Merci de vous être inscrit sur Simix, la plateforme fintech 100% africaine. Pour activer votre compte, entrez le code de vérification ci-dessous dans l'application.";
  const year = new Date().getFullYear();

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
                    <img src="${APP_URL}/logo.svg" alt="Simix logo" width="32" height="32" style="display:block;" />
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
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,#7c3aed,#6366f1);"></td>
                </tr>
              </table>

              <!-- Content -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:36px 40px 28px;">

                    <!-- Title -->
                    <p style="margin:0 0 6px;color:#7c3aed;font-size:15px;font-weight:700;">Bonjour ${firstName} 👋</p>
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
              <img src="${APP_URL}/logo.svg" alt="Simix" width="90" height="19" style="display:block;margin:0 auto 12px;opacity:0.7;" />
              <p style="margin:0 0 6px;color:#9999b8;font-size:11px;line-height:1.7;">
                Si vous n'avez pas demandé ce code, ignorez cet email.<br/>
                Ce code est valable 10 minutes et ne peut être utilisé qu'une seule fois.
              </p>
              <p style="margin:0;color:#c4c4d4;font-size:11px;">
                © ${year} Simix · <a href="mailto:simixsupport@gmail.com" style="color:#7c3aed;text-decoration:none;">simixsupport@gmail.com</a>
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

async function main() {
  const dbUrl = process.env.SUPABASE_DATABASE_URL;
  const resendKey = process.env.RESEND_API_KEY;

  if (!dbUrl) throw new Error("SUPABASE_DATABASE_URL manquant");
  if (!resendKey) throw new Error("RESEND_API_KEY manquant");

  const db = new Client({ connectionString: dbUrl });
  await db.connect();

  const resend = new Resend(resendKey);

  const { rows: users } = await db.query<{ id: string; full_name: string; email: string }>(`
    SELECT id, full_name, email
    FROM users
    WHERE email_verified = false
      AND auth_provider = 'local'
      AND email NOT LIKE '%simix.site%'
    ORDER BY created_at DESC
  `);

  console.log(`\n📧 ${users.length} utilisateurs à traiter...\n`);

  for (const user of users) {
    // Invalider anciens OTPs
    await db.query(
      `UPDATE email_otp SET verified = true
       WHERE user_id = $1 AND purpose = 'email_verification' AND verified = false`,
      [user.id]
    );

    // Créer nouveau OTP
    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    await db.query(
      `INSERT INTO email_otp (user_id, code, purpose, attempts, verified, expires_at)
       VALUES ($1, $2, 'email_verification', 0, false, $3)`,
      [user.id, code, expiresAt]
    );

    // Envoyer avec le vrai template professionnel
    const { data, error } = await resend.emails.send({
      from: "Simix <noreply@simix.site>",
      to: user.email,
      subject: "✉️ Confirmez votre adresse email — Simix",
      html: getOtpEmailHtml(code, user.full_name),
    });

    if (error) {
      console.log(`❌ ${user.full_name} (${user.email}) → ERREUR: ${JSON.stringify(error)}`);
    } else {
      console.log(`✅ ${user.full_name} (${user.email}) → Code ${code} | Resend ID: ${data?.id}`);
    }

    await new Promise(r => setTimeout(r, 400));
  }

  await db.end();
  console.log("\n🎉 Terminé !\n");
}

main().catch(err => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
