/**
 * telegram.ts — Service de notifications Telegram pour l'admin
 *
 * Envoie des alertes formatées en Markdown via l'API Bot Telegram.
 * Les identifiants et l’activation sont lus uniquement depuis l’environnement
 * Plesk : TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID et TELEGRAM_ALERTS_ENABLED.
 *
 * Types d'alertes :
 *  - login         : connexion utilisateur (IP, navigateur, ville, pays)
 *  - register      : nouvel utilisateur inscrit
 *  - deposit       : recharge effectuée
 *  - number_buy    : achat de numéro virtuel
 *  - password      : changement de mot de passe
 *  - suspicious    : activité suspecte détectée
 *  - audit         : action d'administration
 */
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { countryFlag, type GeoInfo } from "./geoip";

interface TelegramCreds { botToken: string; chatId: string }

function getTelegramCreds(): TelegramCreds | null {
  const enabled = process.env["TELEGRAM_ALERTS_ENABLED"]?.trim().toLowerCase();
  if (enabled && ["false", "0", "no", "off"].includes(enabled)) return null;

  const botToken = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  const chatId = process.env["TELEGRAM_CHAT_ID"]?.trim();
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

async function telegramRequestSucceeded(response: Response, action: string): Promise<boolean> {
  const result = await response.json().catch(() => null) as {
    ok?: boolean;
    description?: string;
  } | null;
  if (!response.ok || result?.ok !== true) {
    logger.warn({
      status: response.status,
      description: result?.description?.slice(0, 300),
    }, `[Telegram] ${action} failed`);
    return false;
  }
  return true;
}

async function sendMessage(text: string): Promise<void> {
  const creds = await getTelegramCreds();
  if (!creds) return;
  try {
    const url = `https://api.telegram.org/bot${creds.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: creds.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    await telegramRequestSucceeded(res, "sendMessage");
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.name : "unknown" }, "[Telegram] sendMessage network error");
  }
}

function esc(s: string | undefined | null): string {
  return (s ?? "–").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c));
}

function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  const s = ua.toLowerCase();
  let browser = "Inconnu";
  let os = "Inconnu";
  let device = "Desktop";

  if (s.includes("edg/") || s.includes("edge/")) browser = "Microsoft Edge";
  else if (s.includes("opr/") || s.includes("opera/")) browser = "Opera";
  else if (s.includes("chrome/") && !s.includes("chromium")) browser = "Chrome";
  else if (s.includes("firefox/")) browser = "Firefox";
  else if (s.includes("safari/") && !s.includes("chrome")) browser = "Safari";
  else if (s.includes("samsungbrowser/")) browser = "Samsung Browser";
  else if (s.includes("ucbrowser/")) browser = "UC Browser";

  if (s.includes("windows")) os = "Windows";
  else if (s.includes("android")) os = "Android";
  else if (s.includes("iphone") || s.includes("ipad")) os = "iOS";
  else if (s.includes("mac os x")) os = "macOS";
  else if (s.includes("linux")) os = "Linux";

  if (s.includes("mobile") || s.includes("android") || s.includes("iphone")) device = "📱 Mobile";
  else if (s.includes("tablet") || s.includes("ipad")) device = "📟 Tablette";
  else device = "🖥️ Desktop";

  return { browser, os, device };
}

/* ══════════════════════════════════════════════════════
   ALERT TYPES
   ══════════════════════════════════════════════════════ */

export interface LoginAlertData {
  userId?: string;
  userName?: string;
  userPhone?: string | null;
  userEmail?: string | null;
  attemptedIdentifier?: string;
  ip: string;
  userAgent: string;
  geo: Partial<GeoInfo>;
  success: boolean;
  failReason?: string;
}

export async function sendLoginAlert(data: LoginAlertData): Promise<void> {
  const { browser, os, device } = parseUserAgent(data.userAgent);
  const flag = countryFlag(data.geo.countryCode ?? "");
  const icon = data.success ? "✅" : "🚨";
  const title = data.success ? "Nouvelle connexion" : "Tentative de connexion échouée";

  const lines = [
    `<b>${icon} ${title}</b>`,
    ``,
    `👤 <b>Utilisateur :</b> ${esc(data.userName ?? "Non identifié")}`,
    ...(data.userPhone
      ? [`📞 <b>Téléphone :</b> <code>${esc(data.userPhone)}</code>`]
      : data.userEmail
        ? [`✉️ <b>Email :</b> ${esc(data.userEmail)}`]
        : data.attemptedIdentifier
          ? [`🔎 <b>Identifiant tenté :</b> <code>${esc(data.attemptedIdentifier)}</code>`]
          : data.userName || data.userId
            ? [`📞 <b>Téléphone :</b> <code>–</code>`]
            : []),
    ...(data.userId ? [`🆔 <b>ID :</b> <code>${esc(data.userId)}</code>`] : []),
    ``,
    `🌐 <b>Adresse IP :</b> <code>${esc(data.ip)}</code>`,
    `${flag} <b>Pays :</b> ${esc(data.geo.country)}`,
    `🏙️ <b>Ville :</b> ${esc(data.geo.city)}`,
    `📍 <b>Région :</b> ${esc(data.geo.region)}`,
    `📡 <b>FAI / ISP :</b> ${esc(data.geo.isp)}`,
    `🕐 <b>Fuseau :</b> ${esc(data.geo.timezone)}`,
    ``,
    `${device} <b>Appareil :</b> ${device.replace(/^.+ /, "")}`,
    `🌍 <b>Navigateur :</b> ${esc(browser)}`,
    `💻 <b>Système :</b> ${esc(os)}`,
    ...(data.failReason ? [``, `❌ <b>Raison échec :</b> ${esc(data.failReason)}`] : []),
    ``,
    `🕒 ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
  ];

  await sendMessage(lines.join("\n"));
}

export interface RegisterAlertData {
  userId: string;
  userName: string;
  userPhone: string | null;
  countryCode: string;
  ip: string;
  geo: Partial<GeoInfo>;
}

export async function sendRegisterAlert(data: RegisterAlertData): Promise<void> {
  const flag = countryFlag(data.geo.countryCode ?? data.countryCode);
  const lines = [
    `<b>🎉 Nouvel utilisateur inscrit</b>`,
    ``,
    `👤 <b>Nom :</b> ${esc(data.userName)}`,
    `📞 <b>Téléphone :</b> <code>${esc(data.userPhone)}</code>`,
    `🌍 <b>Pays compte :</b> ${esc(data.countryCode)}`,
    `🆔 <b>ID :</b> <code>${esc(data.userId)}</code>`,
    ``,
    `🌐 <b>IP :</b> <code>${esc(data.ip)}</code>`,
    `${flag} <b>Localisation :</b> ${esc(data.geo.city)}, ${esc(data.geo.country)}`,
    `📡 <b>FAI :</b> ${esc(data.geo.isp)}`,
    ``,
    `🕒 ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
  ];
  await sendMessage(lines.join("\n"));
}

export interface DepositAlertData {
  userId: string;
  userName: string;
  userPhone: string | null;
  amount: number;
  currency: string;
  gateway: string;
  operator: string;
  countryCode: string;
  ip?: string;
  geo?: Partial<GeoInfo>;
  transactionId: string;
}

export async function sendDepositAlert(data: DepositAlertData): Promise<void> {
  const flag = countryFlag(data.geo?.countryCode ?? data.countryCode);
  const contextLines = [
    ...(data.ip ? [`🌐 <b>IP :</b> <code>${esc(data.ip)}</code>`] : []),
    ...(data.geo?.city || data.geo?.country
      ? [`${flag} <b>Localisation :</b> ${esc(data.geo.city)}, ${esc(data.geo.country)}`]
      : []),
  ];
  const lines = [
    `<b>💰 Nouvelle recharge</b>`,
    ``,
    `👤 <b>Utilisateur :</b> ${esc(data.userName)} (<code>${esc(data.userPhone)}</code>)`,
    `💵 <b>Montant :</b> <b>${data.amount.toLocaleString("fr-FR")} ${esc(data.currency)}</b>`,
    `🏦 <b>Gateway :</b> ${esc(data.gateway)}`,
    `📱 <b>Opérateur :</b> ${esc(data.operator)}`,
    `🔖 <b>Transaction ID :</b> <code>${esc(data.transactionId)}</code>`,
    ...(contextLines.length > 0 ? ["", ...contextLines] : []),
    ``,
    `🕒 ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
  ];
  await sendMessage(lines.join("\n"));
}

export interface NumberBuyAlertData {
  userId: string;
  userName: string;
  userPhone: string | null;
  service: string;
  numberCountry: string;
  price: number;
  virtualNumber: string;
  ip: string;
  geo: Partial<GeoInfo>;
}

export async function sendNumberBuyAlert(data: NumberBuyAlertData): Promise<void> {
  const flag = countryFlag(data.geo.countryCode ?? "");
  const lines = [
    `<b>📲 Achat numéro virtuel</b>`,
    ``,
    `👤 <b>Utilisateur :</b> ${esc(data.userName)} (<code>${esc(data.userPhone)}</code>)`,
    `🔧 <b>Service :</b> ${esc(data.service)}`,
    `🌍 <b>Pays numéro :</b> ${esc(data.numberCountry)}`,
    `📱 <b>Numéro :</b> <code>${esc(data.virtualNumber)}</code>`,
    `💵 <b>Prix :</b> ${data.price.toLocaleString()} FCFA`,
    ``,
    `🌐 <b>IP :</b> <code>${esc(data.ip)}</code>`,
    `${flag} <b>Localisation :</b> ${esc(data.geo.city)}, ${esc(data.geo.country)}`,
    ``,
    `🕒 ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
  ];
  await sendMessage(lines.join("\n"));
}

export async function sendDepositCreditAlert(data: {
  userId: string;
  amount: number;
  gateway: string;
  operator: string;
  transactionId: string;
  ip?: string;
}): Promise<void> {
  try {
    const [user] = await db.select({
      fullName: usersTable.fullName,
      phone: usersTable.phone,
      countryCode: usersTable.countryCode,
    }).from(usersTable).where(eq(usersTable.id, data.userId)).limit(1);
    await sendDepositAlert({
      userId: data.userId,
      userName: user?.fullName ?? "Utilisateur",
      userPhone: user?.phone ?? null,
      amount: data.amount,
      currency: "FCFA",
      gateway: data.gateway,
      operator: data.operator,
      countryCode: user?.countryCode ?? "",
      ip: data.ip,
      geo: {},
      transactionId: data.transactionId,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, transactionId: data.transactionId }, "[Telegram] Deposit alert failed");
  }
}

export interface AuditAlertData {
  action: string;
  description: string;
  userId?: string;
  userName?: string;
  ip?: string;
  geo?: Partial<GeoInfo>;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
}

export async function sendAuditAlert(data: AuditAlertData): Promise<void> {
  const icons: Record<string, string> = { info: "ℹ️", warning: "⚠️", critical: "🔴" };
  const icon = icons[data.severity ?? "info"] ?? "ℹ️";
  const flag = data.geo?.countryCode ? countryFlag(data.geo.countryCode) : "";
  const lines = [
    `<b>${icon} Audit — ${esc(data.action)}</b>`,
    ``,
    `📋 <b>Description :</b> ${esc(data.description)}`,
    ...(data.userName ? [`👤 <b>Utilisateur :</b> ${esc(data.userName)}`] : []),
    ...(data.userId ? [`🆔 <b>ID :</b> <code>${esc(data.userId)}</code>`] : []),
    ...(data.ip ? [`🌐 <b>IP :</b> <code>${esc(data.ip)}</code>`] : []),
    ...(data.geo?.city ? [`${flag} <b>Localisation :</b> ${esc(data.geo.city)}, ${esc(data.geo.country)}`] : []),
    ``,
    `🕒 ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
  ];
  await sendMessage(lines.join("\n"));
}

export interface OtpEventAlertData {
  event: string;
  purpose: string;
  userId?: string;
  userName?: string;
  email?: string;
  identifier?: string;
  ip?: string;
  detail?: string;
}

/** Sends OTP lifecycle status only. Never accepts or includes the OTP value. */
export async function sendOtpEventAlert(data: OtpEventAlertData): Promise<void> {
  const lines = [
    `<b>🔐 OTP — ${esc(data.event)}</b>`,
    ``,
    `🎯 <b>Motif :</b> ${esc(data.purpose)}`,
    ...(data.userName ? [`👤 <b>Utilisateur :</b> ${esc(data.userName)}`] : []),
    ...(data.userId ? [`🆔 <b>ID :</b> <code>${esc(data.userId)}</code>`] : []),
    ...(data.email ? [`✉️ <b>Email :</b> ${esc(data.email)}`] : []),
    ...(data.identifier ? [`🔎 <b>Identifiant :</b> <code>${esc(data.identifier)}</code>`] : []),
    ...(data.ip ? [`🌐 <b>IP :</b> <code>${esc(data.ip)}</code>`] : []),
    ...(data.detail ? [`📋 <b>Détail :</b> ${esc(data.detail)}`] : []),
    ``,
    `🕒 ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
  ];
  await sendMessage(lines.join("\n"));
}

export interface SupportMessageAlertData {
  conversationId: string;
  userId?: string;
  userName: string;
  message: string;
  hasImage: boolean;
  imageData?: string;
}

function redactLabeledSecrets(message: string): string {
  return message
    .replace(
      /((?:mot\s+de\s+passe|password|passcode|(?:verification|security|login|sms|one[- ]time)\s+code|code(?:\s+(?:otp|sms|reçu|recu|received|de\s+(?:vérification|verification|sécurité|securite|connexion|confirmation)))?|otp|pin)\s*(?:(?:est|is)\s+|[:=]\s*|-)\s*)([^\r\n,;]+)/gi,
      "$1[masqué]",
    )
    .replace(
      /((?:clé\s+(?:api|secrète)|cle\s+(?:api|secrete)|api\s*(?:key|token)|access\s+token|token|secret)\s*(?:(?:est|is)\s+|[:=]\s*|-)\s*)([^\r\n,;]+)/gi,
      "$1[masqué]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [masqué]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,})\b/g, "[secret masqué]");
}

function splitSupportMessage(message: string, maxCharacters = 1800): string[] {
  const characters = Array.from(message);
  if (characters.length === 0) return [""];
  const chunks: string[] = [];
  for (let start = 0; start < characters.length; start += maxCharacters) {
    chunks.push(characters.slice(start, start + maxCharacters).join(""));
  }
  return chunks;
}

async function sendSupportPhoto(data: SupportMessageAlertData, caption: string): Promise<void> {
  if (!data.imageData) return;
  const match = /^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(data.imageData);
  if (!match || match[2]!.length > Math.ceil(5 * 1024 * 1024 * 4 / 3) + 4) {
    logger.warn({ conversationId: data.conversationId }, "[Telegram] Support image rejected (invalid format or size)");
    return;
  }

  const imageBytes = Buffer.from(match[2]!, "base64");
  if (imageBytes.byteLength > 5 * 1024 * 1024) {
    logger.warn({ conversationId: data.conversationId }, "[Telegram] Support image rejected (invalid format or size)");
    return;
  }
  const creds = await getTelegramCreds();
  if (!creds) return;

  try {
    const form = new FormData();
    form.append("chat_id", creds.chatId);
    form.append("caption", caption.slice(0, 1000));
    form.append("parse_mode", "HTML");
    const mimeType = match[1]!.toLowerCase();
    const extension = mimeType.slice("image/".length).replace(/[^a-z0-9]/g, "") || "image";
    const usePhoto = mimeType === "image/png" || mimeType === "image/jpeg";
    const uploadField = usePhoto ? "photo" : "document";
    const method = usePhoto ? "sendPhoto" : "sendDocument";
    form.append(uploadField, new Blob([imageBytes], { type: mimeType }), `support-image.${extension}`);
    const response = await fetch(`https://api.telegram.org/bot${creds.botToken}/${method}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    await telegramRequestSucceeded(response, `support ${uploadField}`);
  } catch (err) {
    logger.warn({
      error: err instanceof Error ? err.name : "unknown",
      conversationId: data.conversationId,
    }, "[Telegram] Support image delivery network error");
  }
}

/** Forwards a saved user support message; labeled credentials are redacted from text. */
export async function sendSupportMessageAlert(data: SupportMessageAlertData): Promise<void> {
  const safeMessage = redactLabeledSecrets(data.message || (data.hasImage ? "[Image jointe]" : "[Message vide]"));
  const chunks = splitSupportMessage(safeMessage);
  const identityLines = [
    `👤 <b>Nom :</b> ${esc(data.userName)}`,
    ...(data.userId ? [`🆔 <b>ID utilisateur :</b> <code>${esc(data.userId)}</code>`] : ["🆔 <b>Compte :</b> Non connecté"]),
    `🗂️ <b>Conversation :</b> <code>${esc(data.conversationId)}</code>`,
  ];
  for (let index = 0; index < chunks.length; index += 1) {
    if (index > 0) await new Promise(resolve => setTimeout(resolve, 1100));
    const lines = [
      index === 0 ? "<b>💬 Nouveau message au support</b>" : "<b>💬 Suite du message support</b>",
      "",
      ...identityLines,
      "",
      `<b>Message${index > 0 ? " (suite)" : ""} :</b>\n${esc(chunks[index])}`,
      ...(index === 0 && data.hasImage ? ["", "🖼️ Image jointe (transmission à Telegram demandée)"] : []),
      ...(index === 0 ? ["", `🕒 ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`] : []),
    ];
    await sendMessage(lines.join("\n"));
  }

  if (data.hasImage && data.imageData) {
    if (chunks.length > 0) await new Promise(resolve => setTimeout(resolve, 1100));
    const caption = [
      "🖼️ <b>Image envoyée au support</b>",
      `👤 ${esc(data.userName)}`,
      data.userId ? `🆔 <code>${esc(data.userId)}</code>` : "Compte non connecté",
      `🗂️ Conversation <code>${esc(data.conversationId)}</code>`,
    ].join("\n");
    await sendSupportPhoto(data, caption);
  }
}
