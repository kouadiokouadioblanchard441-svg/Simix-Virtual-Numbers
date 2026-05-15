/**
 * 5sim Service Synchronisation — Production-grade
 *
 * Features:
 *  - Syncs countries AND products (services) from 5sim API
 *  - Admin price protection: preserves manually-set prices (detects customisation vs auto-calc)
 *  - servicePricesTable (per-country overrides) is NEVER touched by sync
 *  - Detailed per-run sync logs stored in system_settings (JSON, last 30 entries)
 *  - Per-country error tracking
 *  - Marks services with qty=0 as unavailable without deleting them
 *  - Configurable via system_settings: sync interval, enabled flag
 *
 * Countries sampled (widest catalogue without hammering the API):
 *   Africa, Europe, Americas, Asia-Pacific
 */

import { sql } from "drizzle-orm";
import { db, apiProvidersTable, servicesTable, systemSettingsTable, countriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { FiveSimClient, type FiveSimProductsResponse } from "./fivesim";
import { logger } from "./logger";

/* ─── Config ─── */
const SYNC_INTERVAL_MS  = 6 * 60 * 60 * 1000;   // 6 hours
const SYNC_LOGS_KEY     = "fivesim_sync_logs";
const LAST_SYNC_KEY     = "fivesim_last_sync";
const SYNC_STATUS_KEY   = "fivesim_sync_status";
const MAX_LOG_ENTRIES   = 30;

/* All sample countries — widest coverage without hammering the API.
   Only slugs confirmed valid by the 5sim /guest/products API. */
const SAMPLE_COUNTRIES = [
  /* Africa */
  "ivorycoast", "senegal", "cameroon", "nigeria", "ghana",
  "togo", "benin", "guinea", "kenya", "tanzania", "southafrica",
  "madagascar", "ethiopia", "rwanda", "angola", "mozambique",
  /* Europe */
  "france", "england", "germany", "spain", "italy",
  "netherlands", "belgium", "portugal", "poland", "romania",
  /* Americas */
  "usa", "canada", "brazil", "mexico", "colombia", "argentina",
  "chile", "peru", "venezuela",
  /* Asia-Pacific */
  "india", "indonesia", "philippines", "vietnam", "thailand",
  "pakistan", "bangladesh", "malaysia", "cambodia", "laos",
  /* Middle-East & North Africa */
  "egypt", "morocco", "algeria", "tunisia",
  "saudiarabia", "israel", "jordan",
];

/* Category labels for known 5sim product names */
const CATEGORY_MAP: Record<string, string> = {
  whatsapp: "Messagerie", telegram: "Messagerie", viber: "Messagerie",
  line: "Messagerie", wechat: "Messagerie", signal: "Messagerie",
  facebook: "Réseaux sociaux", instagram: "Réseaux sociaux", twitter: "Réseaux sociaux",
  tiktok: "Réseaux sociaux", snapchat: "Réseaux sociaux", linkedin: "Réseaux sociaux",
  pinterest: "Réseaux sociaux", youtube: "Réseaux sociaux",
  google: "Tech", microsoft: "Tech", apple: "Tech", yahoo: "Tech", discord: "Tech",
  amazon: "E-commerce", ebay: "E-commerce", shopee: "E-commerce", lazada: "E-commerce",
  paypal: "Finance", binance: "Finance", coinbase: "Finance", kraken: "Finance",
  uber: "Transport", airbnb: "Voyages",
  netflix: "Divertissement", steam: "Divertissement", twitch: "Divertissement",
};

/* Color palette for known services */
const COLOR_MAP: Record<string, string> = {
  whatsapp: "#25D366", telegram: "#2AABEE", viber: "#7360F2",
  facebook: "#1877F2", instagram: "#E1306C", twitter: "#1DA1F2",
  tiktok: "#010101", snapchat: "#FFFC00", linkedin: "#0A66C2",
  google: "#4285F4", microsoft: "#00A4EF", apple: "#555555",
  amazon: "#FF9900", paypal: "#003087", binance: "#F0B90B",
  uber: "#333333", airbnb: "#FF5A5F", netflix: "#E50914",
  discord: "#5865F2", steam: "#171A21", youtube: "#FF0000",
  signal: "#3A76F0", pinterest: "#E60023", coinbase: "#0052FF",
};

/* Logo URL map — Clearbit CDN (free, no auth). Falls back to slug.com for unknowns.
   The frontend service-icon.tsx has an onError handler that shows the first letter
   as a violet gradient if clearbit returns 404. */
function logoFor(slug: string): string {
  const s = slug.toLowerCase();
  return LOGO_MAP[s] ?? `https://logo.clearbit.com/${s}.com`;
}

const LOGO_MAP: Record<string, string> = {
  /* ── Messaging ── */
  whatsapp:        "https://logo.clearbit.com/whatsapp.com",
  telegram:        "https://logo.clearbit.com/telegram.org",
  viber:           "https://logo.clearbit.com/viber.com",
  signal:          "https://logo.clearbit.com/signal.org",
  line:            "https://logo.clearbit.com/line.me",
  wechat:          "https://logo.clearbit.com/wechat.com",
  skype:           "https://logo.clearbit.com/skype.com",
  imo:             "https://logo.clearbit.com/imo.im",
  kakaotalk:       "https://logo.clearbit.com/kakao.com",
  dingtalk:        "https://logo.clearbit.com/dingtalk.com",
  botim:           "https://logo.clearbit.com/botim.me",
  zalo:            "https://logo.clearbit.com/zalo.me",
  tamtam:          "https://logo.clearbit.com/tamtam.chat",
  bip:             "https://logo.clearbit.com/bip.com",
  hellotalk:       "https://logo.clearbit.com/hellotalk.com",
  groupme:         "https://logo.clearbit.com/groupme.com",
  talabat:         "https://logo.clearbit.com/talabat.com",
  /* ── Social Networks ── */
  facebook:        "https://logo.clearbit.com/facebook.com",
  instagram:       "https://logo.clearbit.com/instagram.com",
  twitter:         "https://logo.clearbit.com/twitter.com",
  twitter2:        "https://logo.clearbit.com/twitter.com",
  twitter_x:       "https://logo.clearbit.com/x.com",
  x:               "https://logo.clearbit.com/x.com",
  tiktok:          "https://logo.clearbit.com/tiktok.com",
  snapchat:        "https://logo.clearbit.com/snapchat.com",
  linkedin:        "https://logo.clearbit.com/linkedin.com",
  pinterest:       "https://logo.clearbit.com/pinterest.com",
  youtube:         "https://logo.clearbit.com/youtube.com",
  discord:         "https://logo.clearbit.com/discord.com",
  reddit:          "https://logo.clearbit.com/reddit.com",
  vk:              "https://logo.clearbit.com/vk.com",
  ok:              "https://logo.clearbit.com/ok.ru",
  weibo:           "https://logo.clearbit.com/weibo.com",
  bluesky:         "https://logo.clearbit.com/bsky.app",
  clubhouse:       "https://logo.clearbit.com/joinclubhouse.com",
  tumblr:          "https://logo.clearbit.com/tumblr.com",
  quora:           "https://logo.clearbit.com/quora.com",
  nextdoor:        "https://logo.clearbit.com/nextdoor.com",
  bereal:          "https://logo.clearbit.com/bereal.com",
  lemon8:          "https://logo.clearbit.com/lemon8-app.com",
  likee:           "https://logo.clearbit.com/likee.video",
  kwai:            "https://logo.clearbit.com/kwai.com",
  bigolive:        "https://logo.clearbit.com/bigolive.com",
  twitch:          "https://logo.clearbit.com/twitch.tv",
  /* ── Tech / Software ── */
  google:          "https://logo.clearbit.com/google.com",
  microsoft:       "https://logo.clearbit.com/microsoft.com",
  microsoft_store: "https://logo.clearbit.com/microsoft.com",
  microsoft365:    "https://logo.clearbit.com/microsoft.com",
  apple:           "https://logo.clearbit.com/apple.com",
  yahoo:           "https://logo.clearbit.com/yahoo.com",
  adobe:           "https://logo.clearbit.com/adobe.com",
  dropbox:         "https://logo.clearbit.com/dropbox.com",
  gmail:           "https://logo.clearbit.com/gmail.com",
  hotmail:         "https://logo.clearbit.com/outlook.com",
  zoom:            "https://logo.clearbit.com/zoom.us",
  openai:          "https://logo.clearbit.com/openai.com",
  deepseek:        "https://logo.clearbit.com/deepseek.com",
  perplexity:      "https://logo.clearbit.com/perplexity.ai",
  claudeai:        "https://logo.clearbit.com/anthropic.com",
  gemini:          "https://logo.clearbit.com/google.com",
  mistralai:       "https://logo.clearbit.com/mistral.ai",
  opera:           "https://logo.clearbit.com/opera.com",
  nvidia:          "https://logo.clearbit.com/nvidia.com",
  huawei:          "https://logo.clearbit.com/huawei.com",
  xiaomi:          "https://logo.clearbit.com/xiaomi.com",
  gitlab:          "https://logo.clearbit.com/gitlab.com",
  okta:            "https://logo.clearbit.com/okta.com",
  twilio:          "https://logo.clearbit.com/twilio.com",
  zoho:            "https://logo.clearbit.com/zoho.com",
  infomaniak:      "https://logo.clearbit.com/infomaniak.com",
  protonmail:      "https://logo.clearbit.com/proton.me",
  proton:          "https://logo.clearbit.com/proton.me",
  authy:           "https://logo.clearbit.com/authy.com",
  oraclecloud:     "https://logo.clearbit.com/oracle.com",
  webde:           "https://logo.clearbit.com/web.de",
  gmx:             "https://logo.clearbit.com/gmx.com",
  /* ── E-Commerce / Shopping ── */
  amazon:          "https://logo.clearbit.com/amazon.com",
  ebay:            "https://logo.clearbit.com/ebay.com",
  shopee:          "https://logo.clearbit.com/shopee.com",
  lazada:          "https://logo.clearbit.com/lazada.com",
  aliexpress:      "https://logo.clearbit.com/aliexpress.com",
  alibaba:         "https://logo.clearbit.com/alibaba.com",
  alibabacloud:    "https://logo.clearbit.com/alibabacloud.com",
  alipay:          "https://logo.clearbit.com/alipay.com",
  taobao:          "https://logo.clearbit.com/taobao.com",
  jd:              "https://logo.clearbit.com/jd.com",
  temu:            "https://logo.clearbit.com/temu.com",
  shein:           "https://logo.clearbit.com/shein.com",
  wish:            "https://logo.clearbit.com/wish.com",
  etsy:            "https://logo.clearbit.com/etsy.com",
  shopify:         "https://logo.clearbit.com/shopify.com",
  poshmark:        "https://logo.clearbit.com/poshmark.com",
  mercari:         "https://logo.clearbit.com/mercari.com",
  depop:           "https://logo.clearbit.com/depop.com",
  vinted:          "https://logo.clearbit.com/vinted.com",
  wallapop:        "https://logo.clearbit.com/wallapop.com",
  rakuten:         "https://logo.clearbit.com/rakuten.com",
  walmart:         "https://logo.clearbit.com/walmart.com",
  bestbuy:         "https://logo.clearbit.com/bestbuy.com",
  carrefour:       "https://logo.clearbit.com/carrefour.com",
  trendyol:        "https://logo.clearbit.com/trendyol.com",
  hepsiburadacom:  "https://logo.clearbit.com/hepsiburada.com",
  olx:             "https://logo.clearbit.com/olx.com",
  allegro:         "https://logo.clearbit.com/allegro.pl",
  marktplaats:     "https://logo.clearbit.com/marktplaats.nl",
  flipkart:        "https://logo.clearbit.com/flipkart.com",
  meesho:          "https://logo.clearbit.com/meesho.com",
  myntra:          "https://logo.clearbit.com/myntra.com",
  ajio:            "https://logo.clearbit.com/ajio.com",
  nykaa:           "https://logo.clearbit.com/nykaa.com",
  coupang:         "https://logo.clearbit.com/coupang.com",
  tokopedia:       "https://logo.clearbit.com/tokopedia.com",
  qoo10:           "https://logo.clearbit.com/qoo10.com",
  carousell:       "https://logo.clearbit.com/carousell.com",
  rozetka:         "https://logo.clearbit.com/rozetka.ua",
  bukalapak:       "https://logo.clearbit.com/bukalapak.com",
  avon:            "https://logo.clearbit.com/avon.com",
  adidas:          "https://logo.clearbit.com/adidas.com",
  nike:            "https://logo.clearbit.com/nike.com",
  zara:            "https://logo.clearbit.com/zara.com",
  "2dehands":      "https://logo.clearbit.com/2dehands.be",
  adverts:         "https://logo.clearbit.com/adverts.ie",
  /* ── Food Delivery ── */
  uber_eats:       "https://logo.clearbit.com/ubereats.com",
  doordash:        "https://logo.clearbit.com/doordash.com",
  deliveroo:       "https://logo.clearbit.com/deliveroo.com",
  glovo:           "https://logo.clearbit.com/glovoapp.com",
  wolt:            "https://logo.clearbit.com/wolt.com",
  swiggy:          "https://logo.clearbit.com/swiggy.com",
  zomato:          "https://logo.clearbit.com/zomato.com",
  foodpanda:       "https://logo.clearbit.com/foodpanda.com",
  rappi:           "https://logo.clearbit.com/rappi.com",
  justeat:         "https://logo.clearbit.com/just-eat.com",
  yemeksepeti:     "https://logo.clearbit.com/yemeksepeti.com",
  talabatcom:      "https://logo.clearbit.com/talabat.com",
  hungerstation:   "https://logo.clearbit.com/hungerstation.com",
  dominospizza:    "https://logo.clearbit.com/dominos.com",
  burgerking:      "https://logo.clearbit.com/burgerking.com",
  kfc:             "https://logo.clearbit.com/kfc.com",
  mcdonalds:       "https://logo.clearbit.com/mcdonalds.com",
  instacart:       "https://logo.clearbit.com/instacart.com",
  dunkin:          "https://logo.clearbit.com/dunkindonuts.com",
  /* ── Transport / Mobility ── */
  uber:            "https://logo.clearbit.com/uber.com",
  lyft:            "https://logo.clearbit.com/lyft.com",
  grab:            "https://logo.clearbit.com/grab.com",
  gojek:           "https://logo.clearbit.com/gojek.com",
  bolt:            "https://logo.clearbit.com/bolt.eu",
  blablacar:       "https://logo.clearbit.com/blablacar.com",
  olacabs:         "https://logo.clearbit.com/olacabs.com",
  indriver:        "https://logo.clearbit.com/indriver.com",
  rapido:          "https://logo.clearbit.com/rapido.bike",
  yango:           "https://logo.clearbit.com/yango.com",
  lalamove:        "https://logo.clearbit.com/lalamove.com",
  grabtaxi:        "https://logo.clearbit.com/grab.com",
  didi:            "https://logo.clearbit.com/didiglobal.com",
  swvl:            "https://logo.clearbit.com/swvl.com",
  airasia:         "https://logo.clearbit.com/airasia.com",
  airindia:        "https://logo.clearbit.com/airindia.in",
  lime:            "https://logo.clearbit.com/li.me",
  /* ── Finance / Payments ── */
  paypal:          "https://logo.clearbit.com/paypal.com",
  binance:         "https://logo.clearbit.com/binance.com",
  coinbase:        "https://logo.clearbit.com/coinbase.com",
  kraken:          "https://logo.clearbit.com/kraken.com",
  cryptocom:       "https://logo.clearbit.com/crypto.com",
  skrill:          "https://logo.clearbit.com/skrill.com",
  wise:            "https://logo.clearbit.com/wise.com",
  venmo:           "https://logo.clearbit.com/venmo.com",
  paytm:           "https://logo.clearbit.com/paytm.com",
  picpay:          "https://logo.clearbit.com/picpay.com",
  astropay:        "https://logo.clearbit.com/astropay.com",
  paxful:          "https://logo.clearbit.com/paxful.com",
  worldremit:      "https://logo.clearbit.com/worldremit.com",
  sendwave:        "https://logo.clearbit.com/sendwave.com",
  monese:          "https://logo.clearbit.com/monese.com",
  monobank:        "https://logo.clearbit.com/monobank.ua",
  paysafecard:     "https://logo.clearbit.com/paysafecard.com",
  chippercash:     "https://logo.clearbit.com/chippercash.com",
  blockchain:      "https://logo.clearbit.com/blockchain.com",
  tradingview:     "https://logo.clearbit.com/tradingview.com",
  mobikwik:        "https://logo.clearbit.com/mobikwik.com",
  paycell:         "https://logo.clearbit.com/paycell.com.tr",
  paysend:         "https://logo.clearbit.com/paysend.com",
  /* ── Entertainment / Streaming ── */
  netflix:         "https://logo.clearbit.com/netflix.com",
  spotify:         "https://logo.clearbit.com/spotify.com",
  airbnb:          "https://logo.clearbit.com/airbnb.com",
  humblebundle:    "https://logo.clearbit.com/humblebundle.com",
  steam:           "https://logo.clearbit.com/steampowered.com",
  roblox:          "https://logo.clearbit.com/roblox.com",
  epicgames:       "https://logo.clearbit.com/epicgames.com",
  blizzard:        "https://logo.clearbit.com/blizzard.com",
  ubisoft:         "https://logo.clearbit.com/ubisoft.com",
  nintendo:        "https://logo.clearbit.com/nintendo.com",
  riotgames:       "https://logo.clearbit.com/riotgames.com",
  pubg:            "https://logo.clearbit.com/pubg.com",
  supercell:       "https://logo.clearbit.com/supercell.com",
  garena:          "https://logo.clearbit.com/garena.com",
  disneyhotstar:   "https://logo.clearbit.com/hotstar.com",
  sonyliv:         "https://logo.clearbit.com/sonyliv.com",
  iqiyi:           "https://logo.clearbit.com/iqiyi.com",
  bilibili:        "https://logo.clearbit.com/bilibili.com",
  duolingo:        "https://logo.clearbit.com/duolingo.com",
  /* ── E-Commerce others ── */
  booking:         "https://logo.clearbit.com/booking.com",
  eneba:           "https://logo.clearbit.com/eneba.com",
  aol:             "https://logo.clearbit.com/aol.com",
  sikayetvar:      "https://logo.clearbit.com/sikayetvar.com",
  tinder:          "https://logo.clearbit.com/tinder.com",
  bumble:          "https://logo.clearbit.com/bumble.com",
  badoo:           "https://logo.clearbit.com/badoo.com",
  hinge:           "https://logo.clearbit.com/hinge.co",
  grindr:          "https://logo.clearbit.com/grindr.com",
  lovoo:           "https://logo.clearbit.com/lovoo.com",
  meetic:          "https://logo.clearbit.com/meetic.com",
  /* ── Regional / Others ── */
  baidu:           "https://logo.clearbit.com/baidu.com",
  "115com":        "https://logo.clearbit.com/115.com",
  "163som":        "https://logo.clearbit.com/163.com",
  "1688":          "https://logo.clearbit.com/1688.com",
  "1mg":           "https://logo.clearbit.com/1mg.com",
  "5696com":       "https://logo.clearbit.com/5696.com",
  "7eleven":       "https://logo.clearbit.com/7-eleven.com",
  "888casino":     "https://logo.clearbit.com/888casino.com",
  "99acres":       "https://logo.clearbit.com/99acres.com",
  "99app":         "https://logo.clearbit.com/99app.com.br",
  abvbg:           "https://logo.clearbit.com/abv.bg",
  agroinform:      "https://logo.clearbit.com/agroinform.hu",
  check24:         "https://logo.clearbit.com/check24.de",
  leboncoin:       "https://logo.clearbit.com/leboncoin.fr",
  mercado:         "https://logo.clearbit.com/mercadolibre.com",
  cocacola:        "https://logo.clearbit.com/coca-cola.com",
  oyo:             "https://logo.clearbit.com/oyorooms.com",
  fiverr:          "https://logo.clearbit.com/fiverr.com",
  upwork:          "https://logo.clearbit.com/upwork.com",
  offerup:         "https://logo.clearbit.com/offerup.com",
  medium:          "https://logo.clearbit.com/medium.com",
  substack:        "https://logo.clearbit.com/substack.com",
  meta:            "https://logo.clearbit.com/meta.com",
  pinduoduo:       "https://logo.clearbit.com/pinduoduo.com",
  zhihu:           "https://logo.clearbit.com/zhihu.com",
  activision:      "https://logo.clearbit.com/activision.com",
  adani:           "https://logo.clearbit.com/adani.com",
  razer:           "https://logo.clearbit.com/razer.com",
  ticketmaster:    "https://logo.clearbit.com/ticketmaster.com",
  eventbrite:      "https://logo.clearbit.com/eventbrite.com",
  klook:           "https://logo.clearbit.com/klook.com",
  swagbucks:       "https://logo.clearbit.com/swagbucks.com",
  truecaller:      "https://logo.clearbit.com/truecaller.com",
  craigslist:      "https://logo.clearbit.com/craigslist.org",
};

/* ─── Sync log entry type ─── */
export interface SyncLogEntry {
  id:          string;
  type:        "full" | "services" | "countries";
  triggeredBy: "scheduler" | "admin";
  startedAt:   string;
  completedAt: string;
  durationMs:  number;
  status:      "success" | "partial" | "failed";
  services?: {
    added:    number;
    updated:  number;
    skipped:  number;
    total:    number;
    priceProtected: number;
    countryErrors: number;
  };
  countries?: {
    added:   number;
    updated: number;
    total:   number;
  };
  errors: string[];
}

/* ─── Internal state ─── */
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncRunning = false;
let currentlySyncing = false;

/* ─── Log helpers ─── */

async function readSyncLogs(): Promise<SyncLogEntry[]> {
  const [row] = await db.select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, SYNC_LOGS_KEY))
    .limit(1);
  if (!row?.value) return [];
  try { return JSON.parse(row.value) as SyncLogEntry[]; } catch { return []; }
}

async function writeSyncLog(entry: SyncLogEntry): Promise<void> {
  const existing = await readSyncLogs();
  const updated  = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
  const value    = JSON.stringify(updated);
  await db.insert(systemSettingsTable)
    .values({ key: SYNC_LOGS_KEY, value })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value } });
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ─── Public API ─── */

export function startFiveSimSyncScheduler(): void {
  if (syncRunning) return;
  syncRunning = true;
  logger.info("[5sim-sync] Scheduler started (interval: 6h) — first sync in 60s");
  syncTimer = setTimeout(() => void runScheduledSync(), 60_000);
}

export function stopFiveSimSyncScheduler(): void {
  syncRunning = false;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  logger.info("[5sim-sync] Scheduler stopped");
}

export function isSyncInProgress(): boolean {
  return currentlySyncing;
}

export async function getSyncLogs(): Promise<SyncLogEntry[]> {
  return readSyncLogs();
}

/**
 * Sync 5sim products (services) into the local DB.
 *
 * Price protection logic:
 *   - `providerPrice` is always updated (raw 5sim price in FCFA)
 *   - `available` (qty) is always updated
 *   - `price` (selling price) is preserved if it was MANUALLY customised by admin.
 *     Detection: if current price differs from the auto-calculated value
 *     (providerPrice × (1 + margin/100)) by more than 10 FCFA, it's considered manual.
 *   - `servicePricesTable` (per-country overrides) is never touched by sync.
 */
export async function syncFiveSimProducts(triggeredBy: "scheduler" | "admin" = "scheduler"): Promise<{
  added: number; updated: number; skipped: number; total: number;
  priceProtected: number; countryErrors: number;
}> {
  if (currentlySyncing) {
    throw new Error("Une synchronisation est déjà en cours. Veuillez patienter.");
  }

  const logId   = makeId();
  const startTs = new Date().toISOString();
  const startMs = Date.now();
  const errors: string[] = [];
  let priceProtected = 0;
  let countryErrors  = 0;

  currentlySyncing = true;

  try {
    /* ── Get active 5sim provider ── */
    const [provider] = await db
      .select()
      .from(apiProvidersTable)
      .where(and(eq(apiProvidersTable.slug, "5sim"), eq(apiProvidersTable.active, true)))
      .limit(1);

    if (!provider?.apiKey) {
      throw new Error("Aucun fournisseur 5sim actif avec clé API");
    }

    const client = new FiveSimClient(provider.apiKey);
    const markup  = provider.markup;

    /* ── 1. Collect products across all sample countries ── */
    const merged: Record<string, { category: string; qty: number; price: number }> = {};

    for (const country of SAMPLE_COUNTRIES) {
      try {
        const products: FiveSimProductsResponse = await client.getProducts(country, "any");
        for (const [name, info] of Object.entries(products)) {
          if (!info) continue;
          const existing = merged[name];
          if (!existing || info.Price < existing.price) {
            merged[name] = {
              category: info.Category ?? "Autre",
              qty:   Math.max(existing?.qty ?? 0, info.Qty),
              price: info.Price,
            };
          } else {
            merged[name].qty = Math.max(merged[name].qty, info.Qty);
          }
        }
      } catch (e) {
        const msg = `Pays "${country}": ${(e as Error).message}`;
        errors.push(msg);
        countryErrors++;
        logger.warn({ country, err: (e as Error).message }, "[5sim-sync] Skipping country");
      }
    }

    const productList = Object.entries(merged);
    logger.info({ count: productList.length, countryErrors }, "[5sim-sync] Products fetched");

    if (productList.length === 0) {
      throw new Error("Aucun produit reçu depuis 5sim");
    }

    /* ── 2. Count existing services before upsert ── */
    const [{ existingCount }] = await db
      .select({ existingCount: sql<number>`count(*)::int` })
      .from(servicesTable);

    /* ── 3. Batch upsert with price protection ── */
    const BATCH_SIZE = 100;
    for (let i = 0; i < productList.length; i += BATCH_SIZE) {
      const batch = productList.slice(i, i + BATCH_SIZE);

      const rows = batch.map(([slug, info]) => {
        const priceInFcfa     = Math.round(info.price * 655);
        const priceWithMarkup = Math.round(priceInFcfa * (1 + markup / 100));
        const prettyName      = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, " ");
        const slugLower = slug.toLowerCase();
        return {
          name:          prettyName,
          slug,
          price:         priceWithMarkup,
          providerPrice: priceInFcfa,
          margin:        markup,
          available:     Math.round(info.qty),
          category:      CATEGORY_MAP[slugLower] ?? "Autre",
          color:         COLOR_MAP[slugLower] ?? "#7C3AED",
          logoUrl:       logoFor(slugLower),
          enabled:       true as boolean,
          sortOrder:     200,
        };
      });

      /*
       * Price protection:
       *   Keep existing `price` when it differs by more than 10 FCFA from the
       *   auto-calculated value (= providerPrice × (1 + margin/100)).
       *   This means the admin manually set a custom price → we must not overwrite it.
       *
       *   Formula stored for reference:
       *     auto_price = ROUND(services.provider_price * (1.0 + services.margin / 100.0))
       *     if |services.price - auto_price| <= 10  →  price was auto-calculated, update it
       *     else                                    →  price was customised, preserve it
       */
      await db
        .insert(servicesTable)
        .values(rows)
        .onConflictDoUpdate({
          target: servicesTable.slug,
          set: {
            /* Always update provider data */
            providerPrice: sql`excluded.provider_price`,
            available:     sql`excluded.available`,

            /* Update logo only when sync provides one (don't overwrite admin-set logos with null) */
            logoUrl: sql`CASE WHEN excluded.logo_url IS NOT NULL THEN excluded.logo_url ELSE services.logo_url END`,

            /* Price protection: only update `price` if it matches the auto-calculated value */
            price: sql`
              CASE
                WHEN services.provider_price IS NULL
                  OR ABS(services.price::numeric - ROUND(services.provider_price::numeric * (1.0 + services.margin::numeric / 100.0))) <= 10
                THEN excluded.price
                ELSE services.price
              END
            `,

            /* Margin protection: only update margin if price was auto-calculated */
            margin: sql`
              CASE
                WHEN services.provider_price IS NULL
                  OR ABS(services.price::numeric - ROUND(services.provider_price::numeric * (1.0 + services.margin::numeric / 100.0))) <= 10
                THEN excluded.margin
                ELSE services.margin
              END
            `,

            /* Auto-enable if 5sim confirms stock is available */
            enabled: sql`CASE WHEN excluded.available > 0 THEN true ELSE services.enabled END`,
          },
        });
    }

    /* ── 4. Count results ── */
    const [{ newCount }] = await db
      .select({ newCount: sql<number>`count(*)::int` })
      .from(servicesTable);

    const added   = Math.max(0, newCount - existingCount);
    const updated = productList.length - added;

    /* Approximate price-protected count (services where price was preserved) */
    const protectedRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(servicesTable)
      .where(sql`provider_price IS NOT NULL AND ABS(price::numeric - ROUND(provider_price::numeric * (1.0 + margin::numeric / 100.0))) > 10`);
    priceProtected = Number(protectedRows[0]?.c ?? 0);

    /* ── 5. Persist sync metadata for legacy routes ── */
    const now    = new Date().toISOString();
    const status = `${added} ajoutés · ${updated} mis à jour · ${productList.length} total · ${countryErrors} erreurs`;

    await db.insert(systemSettingsTable).values({ key: LAST_SYNC_KEY, value: now })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: now } });
    await db.insert(systemSettingsTable).values({ key: SYNC_STATUS_KEY, value: status })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: status } });

    /* ── 6. Write detailed log entry ── */
    const completedAt = new Date().toISOString();
    const entry: SyncLogEntry = {
      id:          logId,
      type:        "services",
      triggeredBy,
      startedAt:   startTs,
      completedAt,
      durationMs:  Date.now() - startMs,
      status:      countryErrors > 5 ? "partial" : "success",
      services:    { added, updated, skipped: 0, total: productList.length, priceProtected, countryErrors },
      errors:      errors.slice(0, 20),
    };
    await writeSyncLog(entry);

    logger.info({ added, updated, priceProtected, countryErrors, total: productList.length }, "[5sim-sync] Sync complete");
    return { added, updated, skipped: 0, total: productList.length, priceProtected, countryErrors };

  } finally {
    currentlySyncing = false;
  }
}

/** Sync all countries from 5sim /guest/countries endpoint into the local DB */
export async function syncFiveSimCountries(triggeredBy: "scheduler" | "admin" = "scheduler"): Promise<{
  added: number; updated: number; total: number;
}> {
  const logId   = makeId();
  const startTs = new Date().toISOString();
  const startMs = Date.now();

  logger.info("[5sim-countries] Starting country sync from 5sim");

  const resp = await fetch("https://5sim.net/v1/guest/countries", {
    headers: { Accept: "application/json" },
    signal:  AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`5sim /guest/countries returned ${resp.status}`);

  const raw = await resp.json() as Record<string, {
    iso?: Record<string, number>;
    prefix?: Record<string, number>;
    text_en?: string;
  }>;
  const entries = Object.entries(raw);
  logger.info({ count: entries.length }, "[5sim-countries] Countries fetched");

  const [{ before }] = await db
    .select({ before: sql<number>`count(*)::int` })
    .from(countriesTable);

  let skipped = 0;
  for (const [, info] of entries) {
    const isoRaw    = Object.keys(info.iso ?? {})[0];
    const prefixRaw = Object.keys(info.prefix ?? {})[0];
    if (!isoRaw || !prefixRaw) { skipped++; continue; }

    const iso      = isoRaw.toUpperCase();
    const dialCode = prefixRaw.startsWith("+") ? prefixRaw : `+${prefixRaw}`;
    const flag     = flagEmoji(iso);
    const nameEn   = info.text_en ?? iso;
    const nameFr   = FR_NAMES[iso] ?? nameEn;
    const popular  = POPULAR_ISO.has(iso);
    const sortOrder = POPULAR_ISO_WESTERN.has(iso) ? 5 : POPULAR_ISO_AFRICAN.has(iso) ? 25 : 100;

    await db.insert(countriesTable)
      .values({ name: nameFr, code: iso, dialCode, flag, available: 1, price: 150, popular, sortOrder })
      .onConflictDoUpdate({
        target: countriesTable.code,
        set: {
          name:      sql`CASE WHEN excluded.name != countries.name AND countries.name = countries.code THEN excluded.name ELSE countries.name END`,
          dialCode:  sql`excluded.dial_code`,
          flag:      sql`excluded.flag`,
          popular:   sql`excluded.popular`,
          sortOrder: sql`excluded.sort_order`,
        },
      });
  }

  const [{ after }] = await db
    .select({ after: sql<number>`count(*)::int` })
    .from(countriesTable);

  const added   = Math.max(0, after - before);
  const updated = entries.length - skipped - added;

  /* Persist */
  const now = new Date().toISOString();
  await db.insert(systemSettingsTable)
    .values({ key: "fivesim_countries_last_sync", value: now })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: now } });
  await db.insert(systemSettingsTable)
    .values({ key: "fivesim_countries_sync_status", value: `${added} ajoutés · ${updated} mis à jour · ${entries.length - skipped} total` })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: sql`excluded.value` } });

  /* Write log */
  const entry: SyncLogEntry = {
    id:          logId,
    type:        "countries",
    triggeredBy,
    startedAt:   startTs,
    completedAt: new Date().toISOString(),
    durationMs:  Date.now() - startMs,
    status:      "success",
    countries:   { added, updated, total: entries.length - skipped },
    errors:      [],
  };
  await writeSyncLog(entry);

  logger.info({ added, updated, skipped, total: entries.length }, "[5sim-countries] Country sync complete");
  return { added, updated, total: entries.length - skipped };
}

/**
 * Full sync: countries first, then services.
 * Returns a combined result. Used by the manual "Sync complet" button.
 */
export async function syncFiveSimFull(triggeredBy: "scheduler" | "admin" = "admin"): Promise<{
  countries: { added: number; updated: number; total: number };
  services:  { added: number; updated: number; skipped: number; total: number; priceProtected: number; countryErrors: number };
}> {
  const logId   = makeId();
  const startTs = new Date().toISOString();
  const startMs = Date.now();
  const errors: string[] = [];

  let countriesResult = { added: 0, updated: 0, total: 0 };
  let servicesResult  = { added: 0, updated: 0, skipped: 0, total: 0, priceProtected: 0, countryErrors: 0 };

  try {
    countriesResult = await syncFiveSimCountries(triggeredBy);
  } catch (e) {
    errors.push(`Countries: ${(e as Error).message}`);
    logger.error({ err: e }, "[5sim-full] Country sync failed");
  }

  try {
    servicesResult = await syncFiveSimProducts(triggeredBy);
  } catch (e) {
    errors.push(`Services: ${(e as Error).message}`);
    logger.error({ err: e }, "[5sim-full] Services sync failed");
  }

  const status: SyncLogEntry["status"] = errors.length === 0 ? "success"
    : errors.length < 2 ? "partial" : "failed";

  const entry: SyncLogEntry = {
    id:          logId,
    type:        "full",
    triggeredBy,
    startedAt:   startTs,
    completedAt: new Date().toISOString(),
    durationMs:  Date.now() - startMs,
    status,
    countries:   countriesResult,
    services:    servicesResult,
    errors,
  };
  await writeSyncLog(entry);

  return { countries: countriesResult, services: servicesResult };
}

/* ─── Internal scheduler loop ─── */

async function runScheduledSync(): Promise<void> {
  try {
    logger.info("[5sim-sync] Starting scheduled full sync");
    await syncFiveSimFull("scheduler");
  } catch (e) {
    logger.error({ err: (e as Error).message }, "[5sim-sync] Scheduled sync failed");
  } finally {
    if (syncRunning) {
      syncTimer = setTimeout(() => void runScheduledSync(), SYNC_INTERVAL_MS);
    }
  }
}

/* ─── French country name mapping (ISO → French name) ─── */
const FR_NAMES: Record<string, string> = {
  AF: "Afghanistan", AL: "Albanie", DZ: "Algérie", AO: "Angola",
  AR: "Argentine", AM: "Arménie", AU: "Australie", AT: "Autriche", AZ: "Azerbaïdjan",
  BH: "Bahreïn", BD: "Bangladesh", BE: "Belgique", BJ: "Bénin", BO: "Bolivie",
  BA: "Bosnie-Herzégovine", BW: "Botswana", BR: "Brésil", BG: "Bulgarie",
  BF: "Burkina Faso", BI: "Burundi", KH: "Cambodge", CM: "Cameroun", CA: "Canada",
  CF: "Centrafrique", TD: "Tchad", CL: "Chili", CO: "Colombie",
  KM: "Comores", CG: "Congo-Brazzaville", CD: "RD Congo", CR: "Costa Rica",
  HR: "Croatie", CY: "Chypre", CZ: "République tchèque", DK: "Danemark",
  DJ: "Djibouti", DO: "République dominicaine", EC: "Équateur", EG: "Égypte",
  GB: "Royaume-Uni", SV: "Salvador", ET: "Éthiopie", FI: "Finlande", FR: "France",
  GA: "Gabon", GM: "Gambie", GE: "Géorgie", DE: "Allemagne", GH: "Ghana",
  GR: "Grèce", GT: "Guatemala", GN: "Guinée", GW: "Guinée-Bissau", GY: "Guyana",
  HT: "Haïti", HN: "Honduras", HK: "Hong Kong", HU: "Hongrie",
  IN: "Inde", ID: "Indonésie", IE: "Irlande", IL: "Israël", IT: "Italie",
  CI: "Côte d'Ivoire", JM: "Jamaïque", JP: "Japon", JO: "Jordanie",
  KZ: "Kazakhstan", KE: "Kenya", KW: "Koweït", KG: "Kirghizistan",
  LA: "Laos", LV: "Lettonie", LS: "Lesotho", LR: "Liberia", LY: "Libye",
  LT: "Lituanie", LU: "Luxembourg", MG: "Madagascar", MW: "Malawi", MY: "Malaisie",
  ML: "Mali", MR: "Mauritanie", MU: "Maurice", MX: "Mexique",
  MD: "Moldavie", MN: "Mongolie", ME: "Monténégro", MA: "Maroc", MZ: "Mozambique",
  NA: "Namibie", NP: "Népal", NL: "Pays-Bas", NI: "Nicaragua", NE: "Niger",
  NG: "Nigeria", MK: "Macédoine du Nord", NO: "Norvège", OM: "Oman",
  PK: "Pakistan", PA: "Panama", PY: "Paraguay", PE: "Pérou", PH: "Philippines",
  PL: "Pologne", PT: "Portugal", RO: "Roumanie", RW: "Rwanda", SN: "Sénégal",
  RS: "Serbie", SL: "Sierra Leone", SK: "Slovaquie", SI: "Slovénie",
  SO: "Somalie", ZA: "Afrique du Sud", ES: "Espagne", LK: "Sri Lanka",
  SD: "Soudan", SE: "Suède", TW: "Taïwan", TJ: "Tadjikistan", TZ: "Tanzanie",
  TH: "Thaïlande", TG: "Togo", TN: "Tunisie", TM: "Turkménistan", UG: "Ouganda",
  UA: "Ukraine", AE: "Émirats arabes unis", US: "États-Unis", UY: "Uruguay",
  UZ: "Ouzbékistan", VE: "Venezuela", VN: "Viêt Nam", YE: "Yémen",
  ZM: "Zambie", ZW: "Zimbabwe", KR: "Corée du Sud", MM: "Myanmar",
  NZ: "Nouvelle-Zélande",
};

const POPULAR_ISO_WESTERN = new Set([
  "FR", "US", "GB", "DE", "CA", "AU", "NL", "BE", "CH", "ES",
  "IT", "SE", "NO", "DK", "PT", "AT", "IE", "FI", "PL", "RU",
]);
const POPULAR_ISO_AFRICAN = new Set([
  "CI", "SN", "CM", "NG", "GH", "KE", "ZA", "MA", "TN", "EG",
  "ML", "BF", "GN", "TG", "BJ", "CD", "CG", "RW",
]);
const POPULAR_ISO = new Set([...POPULAR_ISO_WESTERN, ...POPULAR_ISO_AFRICAN]);

function flagEmoji(code: string): string {
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join("");
}
