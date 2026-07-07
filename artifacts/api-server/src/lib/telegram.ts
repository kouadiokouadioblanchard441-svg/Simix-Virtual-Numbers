/**
 * telegram.ts — Service de notifications Telegram pour l'admin
 *
 * Envoie des alertes formatées en Markdown via l'API Bot Telegram.
 * Les credentials (bot_token + chat_id) sont lus depuis system_settings
 * (gérés dans le panneau admin → Paramètres).
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
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { countryFlag, type GeoInfo } from "./geoip";

interface TelegramCreds { botToken: string; chatId: string }

let credsCache: TelegramCreds | null = null;
let credsCacheTs = 0;
const CREDS_TTL_MS = 60_000;

async function getTelegramCreds(): Promise<TelegramCreds | null> {
  if (credsCache && Date.now() - credsCacheTs < CREDS_TTL_MS) return credsCache;
  try {
    const [tokenRow, chatRow, enabledRow] = await Promise.all([
      db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "telegram_bot_token")).limit(1),
      db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "telegram_chat_id")).limit(1),
      db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "telegram_alerts_enabled")).limit(1),
    ]);
    const enabled = enabledRow[0]?.value?.trim();
    if (enabled === "false" || enabled === "0") return null;
    const botToken = tokenRow[0]?.value?.trim() || null;
    const chatId = chatRow[0]?.value?.trim() || null;
    if (!botToken || !chatId) return null;
    credsCache = { botToken, chatId };
    credsCacheTs = Date.now();
    return credsCache;
  } catch {
    return null;
  }
}

export function invalidateTelegramCache(): void {
  credsCache = null;
  credsCacheTs = 0;
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
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body }, "[Telegram] sendMessage failed");
    }
  } catch (err) {
    logger.debug({ err: (err as Error).message }, "[Telegram] sendMessage error");
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
  userId: string;
  userName: string;
  userPhone: string;
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
    `👤 <b>Utilisateur :</b> ${esc(data.userName)}`,
    `📞 <b>Téléphone :</b> <code>${esc(data.userPhone)}</code>`,
    `🆔 <b>ID :</b> <code>${esc(data.userId)}</code>`,
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
  userPhone: string;
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
  userPhone: string;
  amount: number;
  currency: string;
  gateway: string;
  operator: string;
  countryCode: string;
  ip: string;
  geo: Partial<GeoInfo>;
  transactionId: string;
}

export async function sendDepositAlert(data: DepositAlertData): Promise<void> {
  const flag = countryFlag(data.geo.countryCode ?? data.countryCode);
  const lines = [
    `<b>💰 Nouvelle recharge</b>`,
    ``,
    `👤 <b>Utilisateur :</b> ${esc(data.userName)} (<code>${esc(data.userPhone)}</code>)`,
    `💵 <b>Montant :</b> <b>${data.amount.toLocaleString()} ${esc(data.currency)}</b>`,
    `🏦 <b>Gateway :</b> ${esc(data.gateway)}`,
    `📱 <b>Opérateur :</b> ${esc(data.operator)}`,
    `🔖 <b>Transaction ID :</b> <code>${esc(data.transactionId)}</code>`,
    ``,
    `🌐 <b>IP :</b> <code>${esc(data.ip)}</code>`,
    `${flag} <b>Localisation :</b> ${esc(data.geo.city)}, ${esc(data.geo.country)}`,
    ``,
    `🕒 ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`,
  ];
  await sendMessage(lines.join("\n"));
}

export interface NumberBuyAlertData {
  userId: string;
  userName: string;
  userPhone: string;
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
