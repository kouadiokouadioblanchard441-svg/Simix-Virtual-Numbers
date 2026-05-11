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

function getPasswordResetEmailHtml(code: string, fullName: string): string {
  const digits = code.split("");
  const firstName = fullName.split(" ")[0] ?? fullName;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Réinitialisation de mot de passe — Simix</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:linear-gradient(145deg,#12121e,#1a1a2e);border-radius:24px;border:1px solid #2a2a4a;overflow:hidden;">

          <tr><td style="height:4px;background:linear-gradient(90deg,#ef4444,#f97316,#eab308);"></td></tr>

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

          <tr>
            <td align="center" style="padding:0 40px 20px;">
              <span style="display:inline-block;background:rgba(239,68,68,0.12);color:#f87171;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:6px 16px;border-radius:100px;border:1px solid rgba(239,68,68,0.25);">
                🔑 Réinitialisation de mot de passe
              </span>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 40px 12px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3;">Bonjour ${firstName} 👋</h1>
              <p style="margin:10px 0 0;color:#8b8ba7;font-size:13px;line-height:1.6;">Vous avez demandé à réinitialiser votre mot de passe</p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px;">
              <p style="margin:0;color:#9999b8;font-size:14px;line-height:1.7;">Entrez ce code dans l'application pour créer un nouveau mot de passe. Si vous n'avez pas fait cette demande, ignorez cet email — votre compte reste protégé.</p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:8px 40px 32px;">
              <table cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(239,68,68,0.08),rgba(249,115,22,0.06));border:1px solid rgba(239,68,68,0.25);border-radius:18px;padding:28px 36px;">
                <tr>
                  <td align="center">
                    <p style="margin:0 0 16px;color:#8b8ba7;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Code de réinitialisation</p>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        ${digits.map((d) => `
                        <td style="padding:0 4px;">
                          <div style="width:44px;height:56px;background:rgba(255,255,255,0.04);border:2px solid rgba(239,68,68,0.4);border-radius:12px;">
                            <span style="color:#ffffff;font-size:28px;font-weight:800;font-family:'Courier New',monospace;line-height:56px;display:block;text-align:center;">${d}</span>
                          </div>
                        </td>`).join("")}
                      </tr>
                    </table>
                    <p style="margin:16px 0 0;color:#6b6b8a;font-size:12px;">Expire dans <strong style="color:#f87171;">10 minutes</strong></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 32px;">
              <table cellpadding="0" cellspacing="0" width="100%" style="background:rgba(234,179,8,0.05);border:1px solid rgba(234,179,8,0.15);border-radius:12px;padding:16px;">
                <tr>
                  <td valign="top" style="padding-right:12px;padding-top:2px;"><span style="font-size:16px;">⚠️</span></td>
                  <td>
                    <p style="margin:0;color:#fbbf24;font-size:12px;font-weight:600;margin-bottom:4px;">Vous n'avez pas fait cette demande ?</p>
                    <p style="margin:0;color:#8b8ba7;font-size:12px;line-height:1.6;">Ignorez cet email. Votre mot de passe restera inchangé. Pensez à sécuriser votre compte si vous soupçonnez une activité suspecte.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#5a5a7a;font-size:11px;text-align:center;line-height:1.7;">
                Ce code est valable 10 minutes · Usage unique · Ne jamais partager<br/><br/>
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

function getOperatorMeta(method: string): { emoji: string; color: string; bgColor: string; borderColor: string } {
  const m = method.toLowerCase();
  if (m.includes("orange")) return { emoji: "🟠", color: "#f97316", bgColor: "rgba(249,115,22,0.08)", borderColor: "rgba(249,115,22,0.25)" };
  if (m.includes("mtn"))    return { emoji: "🟡", color: "#eab308", bgColor: "rgba(234,179,8,0.08)",  borderColor: "rgba(234,179,8,0.25)" };
  if (m.includes("wave"))   return { emoji: "🌊", color: "#06b6d4", bgColor: "rgba(6,182,212,0.08)",  borderColor: "rgba(6,182,212,0.25)" };
  if (m.includes("moov"))   return { emoji: "🔵", color: "#3b82f6", bgColor: "rgba(59,130,246,0.08)", borderColor: "rgba(59,130,246,0.25)" };
  if (m.includes("airtel")) return { emoji: "🔴", color: "#ef4444", bgColor: "rgba(239,68,68,0.08)",  borderColor: "rgba(239,68,68,0.25)" };
  return { emoji: "💳", color: "#8b5cf6", bgColor: "rgba(139,92,246,0.08)", borderColor: "rgba(139,92,246,0.25)" };
}

function getDepositConfirmationHtml(data: DepositEmailData): string {
  const firstName = data.userFullName.split(" ")[0] ?? data.userFullName;
  const op = getOperatorMeta(data.method);
  const txRef = data.depositId ?? data.transactionId;
  const shortRef = `TRX-${txRef.slice(-8).toUpperCase()}`;
  const dateStr = formatDateFR(data.createdAt);
  const amountStr = formatFCFA(data.amount);

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Montant déposé",     value: amountStr },
    { label: "Opérateur",         value: data.method },
    ...(data.phoneNumber ? [{ label: "Numéro utilisé", value: data.phoneNumber, mono: true }] : []),
    { label: "Référence",          value: shortRef, mono: true },
    { label: "Date et heure",      value: dateStr },
    { label: "Statut",             value: "✅ Validé" },
    ...(data.newBalance != null ? [{ label: "Nouveau solde", value: formatFCFA(data.newBalance) }] : []),
  ];

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Rechargement confirmé — Simix</title>
</head>
<body style="margin:0;padding:0;background:#07070f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070f;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- TOP BAR (gradient) -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#7c3aed 0%,#6366f1 50%,#06b6d4 100%);border-radius:4px 4px 0 0;"></td>
          </tr>

          <!-- CARD -->
          <tr>
            <td style="background:linear-gradient(160deg,#111122 0%,#0e0e1c 60%,#13131f 100%);border:1px solid rgba(99,102,241,0.18);border-top:none;border-radius:0 0 24px 24px;overflow:hidden;">

              <!-- LOGO HEADER -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:32px 36px 24px;" align="center">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td valign="middle">
                          <table cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#7c3aed,#6366f1);border-radius:12px;width:44px;height:44px;">
                            <tr><td align="center" valign="middle" style="color:#fff;font-size:24px;font-weight:900;letter-spacing:-1px;">S</td></tr>
                          </table>
                        </td>
                        <td valign="middle" style="padding-left:10px;">
                          <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">imix</span>
                        </td>
                        <td valign="middle" style="padding-left:10px;">
                          <span style="color:#6b6b8a;font-size:12px;font-weight:500;">· Fintech africaine</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- SUCCESS ICON + BADGE -->
                <tr>
                  <td align="center" style="padding:0 36px 8px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <!-- Animated-style checkmark circle -->
                          <table cellpadding="0" cellspacing="0" style="background:radial-gradient(circle at center,rgba(16,185,129,0.15) 0%,transparent 70%);border-radius:50%;width:80px;height:80px;margin-bottom:4px;">
                            <tr>
                              <td align="center" valign="middle">
                                <table cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#059669,#10b981);border-radius:50%;width:60px;height:60px;">
                                  <tr><td align="center" valign="middle" style="font-size:28px;line-height:1;">✓</td></tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- HEADING -->
                <tr>
                  <td align="center" style="padding:8px 36px 6px;">
                    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">Rechargement confirmé 🎉</h1>
                    <p style="margin:10px 0 0;color:#8b8ba7;font-size:14px;line-height:1.6;">Bonjour <strong style="color:#c4b5fd;">${firstName}</strong>, votre solde a été crédité avec succès.</p>
                  </td>
                </tr>

                <!-- AMOUNT HERO BLOCK -->
                <tr>
                  <td style="padding:24px 36px 12px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(16,185,129,0.12) 0%,rgba(6,182,212,0.06) 100%);border:1px solid rgba(16,185,129,0.25);border-radius:20px;padding:28px;">
                      <tr>
                        <td align="center">
                          <p style="margin:0 0 4px;color:#6ee7b7;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Montant crédité</p>
                          <p style="margin:0;color:#ffffff;font-size:42px;font-weight:900;letter-spacing:-1px;line-height:1.1;">${amountStr}</p>
                          <p style="margin:10px 0 0;display:inline-block;background:rgba(16,185,129,0.2);color:#34d399;font-size:12px;font-weight:700;padding:5px 14px;border-radius:100px;border:1px solid rgba(16,185,129,0.3);">✅ Paiement validé</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- OPERATOR BADGE -->
                <tr>
                  <td style="padding:4px 36px 16px;">
                    <table cellpadding="0" cellspacing="0" style="background:${op.bgColor};border:1px solid ${op.borderColor};border-radius:12px;padding:12px 18px;">
                      <tr>
                        <td valign="middle" style="font-size:22px;padding-right:10px;">${op.emoji}</td>
                        <td valign="middle">
                          <p style="margin:0;color:${op.color};font-size:13px;font-weight:700;">${data.method}</p>
                          ${data.phoneNumber ? `<p style="margin:2px 0 0;color:#6b6b8a;font-size:12px;font-family:'Courier New',monospace;">${data.phoneNumber}</p>` : ""}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- TRANSACTION DETAILS TABLE -->
                <tr>
                  <td style="padding:0 36px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;overflow:hidden;">
                      <tr>
                        <td colspan="2" style="padding:14px 20px 12px;border-bottom:1px solid rgba(255,255,255,0.06);">
                          <p style="margin:0;color:#6b6b8a;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Détails de la transaction</p>
                        </td>
                      </tr>
                      ${rows.map((row, i) => `
                      <tr style="border-bottom:${i < rows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none"};">
                        <td style="padding:12px 20px;color:#7b7b9b;font-size:13px;white-space:nowrap;">${row.label}</td>
                        <td style="padding:12px 20px;color:#e2e2f2;font-size:13px;font-weight:600;text-align:right;${row.mono ? "font-family:'Courier New',monospace;color:#a78bfa;" : ""}">${row.value}</td>
                      </tr>`).join("")}
                    </table>
                  </td>
                </tr>

                <!-- SECURITY NOTICE -->
                <tr>
                  <td style="padding:0 36px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(234,179,8,0.05);border:1px solid rgba(234,179,8,0.15);border-radius:14px;padding:16px 20px;">
                      <tr>
                        <td valign="top" style="padding-right:12px;font-size:18px;padding-top:2px;">🛡️</td>
                        <td>
                          <p style="margin:0 0 4px;color:#fbbf24;font-size:12px;font-weight:700;">Conseil de sécurité</p>
                          <p style="margin:0;color:#78716c;font-size:12px;line-height:1.7;">Simix ne vous demandera jamais vos identifiants ou votre mot de passe par email ou téléphone. En cas d'activité suspecte, contactez immédiatement notre support.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- SUPPORT BUTTON -->
                <tr>
                  <td align="center" style="padding:0 36px 32px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:linear-gradient(135deg,#7c3aed,#6366f1);border-radius:12px;padding:0;">
                          <a href="${getAppUrl()}" style="display:block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.2px;">
                            🚀 Accéder à mon compte
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:12px 0 0;color:#4a4a6a;font-size:12px;">
                      Besoin d'aide ?
                      <a href="mailto:support@simix.app" style="color:#7c3aed;text-decoration:none;font-weight:600;">support@simix.app</a>
                    </p>
                  </td>
                </tr>

              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:28px 20px 16px;" align="center">
              <p style="margin:0 0 8px;color:#3a3a5a;font-size:11px;line-height:1.8;">
                Vous recevez cet email car vous avez effectué un rechargement sur <strong>Simix</strong>.<br/>
                Si vous n'êtes pas à l'origine de cette opération, contactez-nous immédiatement.
              </p>
              <p style="margin:8px 0 0;color:#2a2a42;font-size:11px;">
                © ${new Date().getFullYear()} Simix · Fintech 100% Africaine · Paiements Mobile Money
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:16px auto 0;">
                <tr>
                  <td style="padding:0 8px;">
                    <a href="${getAppUrl()}/legal/cgu" style="color:#3a3a5a;font-size:10px;text-decoration:none;">CGU</a>
                  </td>
                  <td style="color:#2a2a42;font-size:10px;">·</td>
                  <td style="padding:0 8px;">
                    <a href="${getAppUrl()}/legal/politique-confidentialite" style="color:#3a3a5a;font-size:10px;text-decoration:none;">Confidentialité</a>
                  </td>
                  <td style="color:#2a2a42;font-size:10px;">·</td>
                  <td style="padding:0 8px;">
                    <a href="mailto:support@simix.app" style="color:#3a3a5a;font-size:10px;text-decoration:none;">Support</a>
                  </td>
                </tr>
              </table>
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
    subject: `💰 Rechargement de ${data.amount.toLocaleString("fr-FR")} FCFA confirmé — Simix`,
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
