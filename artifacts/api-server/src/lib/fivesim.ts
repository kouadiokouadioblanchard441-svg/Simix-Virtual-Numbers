/**
 * 5sim.net API client — v1 (complet)
 * Docs: https://5sim.net/docs
 *
 * Endpoints couverts :
 *   Utilisateur : profile, orders, payments, buy/activation, buy/hosting,
 *                 check, finish, cancel, ban, sms/inbox
 *   Guest       : products, prices, countries, flash
 *   Vendor      : statistic, wallets, orders, payments, payouts, prices
 */

const BASE_URL = "https://5sim.net/v1";
const DEFAULT_TIMEOUT_MS = 12_000;

/* ─── Response types ─────────────────────────────────────────────── */

export interface FiveSimOrder {
  id: number;
  phone: string;
  operator: string;
  product: string;
  price: number;
  status: "PENDING" | "RECEIVED" | "CANCELED" | "TIMEOUT" | "FINISHED" | "BANNED";
  expires: string;
  sms: FiveSimSms[];
  created_at: string;
  forwarding: boolean;
  forwarding_number: string;
  country: string;
  /** Only present on hosting orders */
  category?: "hosting" | "activation";
}

export interface FiveSimSms {
  id: number;
  created_at: string;
  date: string;
  sender: string;
  text: string;
  code: string;
}

export interface FiveSimProfile {
  id: number;
  email: string;
  vendor: string;
  default_forwarding_number: string;
  balance: number;
  rating: number;
  default_country: { name: string; iso: string; prefix: string };
  default_operator: { name: string };
  frozen_balance: number;
}

export interface FiveSimProduct {
  Category: string;
  Qty: number;
  Price: number;
}

export interface FiveSimCountryInfo {
  iso: Record<string, number>;
  prefix: Record<string, number>;
  text_en: string;
  text_ru: string;
  [operator: string]: unknown;
}

export type FiveSimCountriesResponse = Record<string, FiveSimCountryInfo>;
export type FiveSimProductsResponse = Record<string, FiveSimProduct>;

export interface FiveSimPriceEntry {
  country: string;
  product: string;
  operator: string;
  cost: number;
}
export type FiveSimPricesResponse = Record<string, Record<string, Record<string, { cost: number; count: number }>>>;

export interface FiveSimFlashNotification {
  id: number;
  text: string;
  created_at: string;
}

export interface FiveSimOrdersResponse {
  Data: FiveSimOrder[];
  ProductName: string;
  CategoryName: string;
  Total: number;
}

export interface FiveSimPayment {
  ID: number;
  TypeName: string;
  ProviderName: string;
  Amount: number;
  Balance: number;
  CreatedAt: string;
}
export interface FiveSimPaymentsResponse {
  Data: FiveSimPayment[];
  Total: number;
}

export interface FiveSimVendorStatistic {
  today_orders: number;
  yesterday_orders: number;
  total_orders: number;
  today_revenue: number;
  yesterday_revenue: number;
  total_revenue: number;
  balance: number;
  frozen_balance: number;
}

export interface FiveSimVendorWallet {
  currency: string;
  amount: number;
}

export interface FiveSimVendorPriceEntry {
  CountryName: string;
  OperatorName: string;
  ProductName: string;
  Cost: number;
  Amount: number;
  Enabled: boolean;
}
export interface FiveSimVendorPricesResponse {
  Data: FiveSimVendorPriceEntry[];
  Total: number;
}

export interface FiveSimSmsInboxResponse {
  Data: FiveSimSms[];
  Total: number;
}

/* ─── Pagination params ───────────────────────────────────────────── */
export interface PaginationParams {
  limit?: number;
  offset?: number;
  order?: string;
  reverse?: boolean;
}

/* ─── Client ─────────────────────────────────────────────────────── */

export class FiveSimClient {
  readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("5sim: apiKey is required");
    this.apiKey = apiKey;
  }

  /* ── Private request helper ── */
  private async request<T>(
    path: string,
    method: "GET" | "POST" = "GET",
    auth = true,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (auth) headers["Authorization"] = `Bearer ${this.apiKey}`;
    if (body) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        signal: controller.signal,
        body: body ? JSON.stringify(body) : undefined,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const responseBody = await res.text().catch(() => res.statusText);
      throw new FiveSimError(res.status, responseBody, path);
    }

    return res.json() as Promise<T>;
  }

  /* ══════════════════════════════════════════════════════════════
   *  USER ENDPOINTS
   * ══════════════════════════════════════════════════════════════ */

  /** Profil + solde du compte */
  async getProfile(): Promise<FiveSimProfile> {
    return this.request<FiveSimProfile>("/user/profile");
  }

  /**
   * Historique des commandes.
   * category = "activation" | "hosting"
   */
  async getUserOrders(params: PaginationParams & { category?: "activation" | "hosting" } = {}): Promise<FiveSimOrdersResponse> {
    const qs = buildQS({
      category: params.category ?? "activation",
      limit: params.limit ?? 15,
      offset: params.offset ?? 0,
      order: params.order ?? "id",
      reverse: params.reverse ?? true,
    });
    return this.request<FiveSimOrdersResponse>(`/user/orders${qs}`);
  }

  /**
   * Historique des paiements.
   */
  async getUserPayments(params: PaginationParams = {}): Promise<FiveSimPaymentsResponse> {
    const qs = buildQS({
      limit: params.limit ?? 15,
      offset: params.offset ?? 0,
      order: params.order ?? "id",
      reverse: params.reverse ?? true,
    });
    return this.request<FiveSimPaymentsResponse>(`/user/payments${qs}`);
  }

  /**
   * Acheter un numéro d'activation (one-shot).
   * operator = "any" ou un opérateur spécifique
   * Options facultatives :
   *   forwarding — activer le renvoi d'appel
   *   reuse      — réutiliser un numéro déjà utilisé pour ce service
   *   voice      — appel vocal plutôt que SMS
   *   ref        — identifiant de parrainage
   */
  async buyNumber(
    country: string,
    operator: string,
    product: string,
    options: { forwarding?: boolean; reuse?: boolean; voice?: boolean; ref?: string } = {},
  ): Promise<FiveSimOrder> {
    const extra: Record<string, string> = {};
    if (options.forwarding) extra.forwarding = "true";
    if (options.reuse) extra.reuse = "true";
    if (options.voice) extra.voice = "true";
    if (options.ref) extra.ref = options.ref;
    const qs = Object.keys(extra).length ? "?" + new URLSearchParams(extra).toString() : "";
    const order = await this.request<FiveSimOrder>(
      `/user/buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(operator)}/${encodeURIComponent(product)}${qs}`,
    );
    return normaliseOrder(order);
  }

  /**
   * Acheter un numéro en location longue durée (hosting).
   * product = "1day" (24h) | "3hours" (3h)
   * Ces numéros peuvent recevoir plusieurs SMS et ont une durée de vie plus longue.
   */
  async buyHostingNumber(
    country: string,
    operator: string,
    product: "1day" | "3hours",
  ): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(
      `/user/buy/hosting/${encodeURIComponent(country)}/${encodeURIComponent(operator)}/${encodeURIComponent(product)}`,
    );
    return normaliseOrder(order);
  }

  /** Vérifier le statut d'une commande + SMS reçus (activation) */
  async checkOrder(orderId: number): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(`/user/check/${orderId}`);
    return normaliseOrder(order);
  }

  /** Marquer la commande comme terminée (après réception du SMS) */
  async finishOrder(orderId: number): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(`/user/finish/${orderId}`);
    return normaliseOrder(order);
  }

  /** Annuler une commande (remboursement si aucun SMS reçu) */
  async cancelOrder(orderId: number): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(`/user/cancel/${orderId}`);
    return normaliseOrder(order);
  }

  /**
   * Signaler un numéro comme inutilisable (banni par le service).
   * Annule la commande et la marque comme bannie.
   */
  async banOrder(orderId: number): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(`/user/ban/${orderId}`);
    return normaliseOrder(order);
  }

  /**
   * Boîte de réception SMS pour numéros en location (hosting uniquement).
   * Ne fonctionne PAS pour les numéros d'activation one-shot.
   */
  async getSmsInbox(orderId: number): Promise<FiveSimSmsInboxResponse> {
    return this.request<FiveSimSmsInboxResponse>(`/user/sms/inbox/${orderId}`);
  }

  /* ══════════════════════════════════════════════════════════════
   *  GUEST ENDPOINTS (pas d'authentification requise)
   * ══════════════════════════════════════════════════════════════ */

  /** Liste tous les pays disponibles et leurs opérateurs */
  async getCountries(): Promise<FiveSimCountriesResponse> {
    return this.request<FiveSimCountriesResponse>("/guest/countries", "GET", false);
  }

  /**
   * Produits disponibles pour un pays + opérateur.
   * Retourne nom → { Category, Qty, Price }.
   * Qty > 0 = numéros disponibles.
   */
  async getProducts(country: string, operator = "any"): Promise<FiveSimProductsResponse> {
    return this.request<FiveSimProductsResponse>(
      `/guest/products/${encodeURIComponent(country)}/${encodeURIComponent(operator)}`,
      "GET",
      false,
    );
  }

  /**
   * Liste des prix pour un pays et/ou produit donné.
   * Les paramètres sont optionnels — sans paramètre retourne tous les prix.
   */
  async getPrices(country?: string, product?: string): Promise<FiveSimPricesResponse> {
    const params: Record<string, string> = {};
    if (country) params.country = country;
    if (product) params.product = product;
    const qs = Object.keys(params).length ? "?" + new URLSearchParams(params).toString() : "";
    return this.request<FiveSimPricesResponse>(`/guest/prices${qs}`, "GET", false);
  }

  /**
   * Notifications flash de la plateforme 5sim.
   * lang = "en" | "ru"
   */
  async getFlash(lang: "en" | "ru" = "en"): Promise<FiveSimFlashNotification[]> {
    return this.request<FiveSimFlashNotification[]>(`/guest/flash/${lang}`, "GET", false);
  }

  /**
   * Vérifier disponibilité et prix pour un pays + service.
   * Retourne null si pays/service introuvable.
   */
  async checkAvailability(country: string, product: string): Promise<{ available: boolean; qty: number; price: number } | null> {
    try {
      const products = await this.getProducts(country, "any");
      const p = products[product];
      if (!p) return { available: false, qty: 0, price: 0 };
      return { available: p.Qty > 0, qty: p.Qty, price: p.Price };
    } catch (e) {
      if (e instanceof FiveSimError && (e.status === 404 || e.status === 400)) return null;
      throw e;
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  VENDOR / PARTENAIRE ENDPOINTS
   * ══════════════════════════════════════════════════════════════ */

  /** Statistiques du compte vendeur (commandes, revenus, solde) */
  async getVendorStatistic(): Promise<FiveSimVendorStatistic> {
    return this.request<FiveSimVendorStatistic>("/vendor/statistic");
  }

  /** Réserves de portefeuille disponibles pour le partenaire */
  async getVendorWallets(): Promise<FiveSimVendorWallet[]> {
    return this.request<FiveSimVendorWallet[]>("/vendor/wallets");
  }

  /**
   * Historique des commandes du vendeur.
   * category = "activation" | "hosting"
   */
  async getVendorOrders(params: PaginationParams & { category?: "activation" | "hosting" } = {}): Promise<FiveSimOrdersResponse> {
    const qs = buildQS({
      category: params.category ?? "activation",
      limit: params.limit ?? 15,
      offset: params.offset ?? 0,
      order: params.order ?? "id",
      reverse: params.reverse ?? true,
    });
    return this.request<FiveSimOrdersResponse>(`/vendor/orders${qs}`);
  }

  /** Historique des paiements du vendeur */
  async getVendorPayments(params: PaginationParams = {}): Promise<FiveSimPaymentsResponse> {
    const qs = buildQS({
      limit: params.limit ?? 15,
      offset: params.offset ?? 0,
      order: params.order ?? "id",
      reverse: params.reverse ?? true,
    });
    return this.request<FiveSimPaymentsResponse>(`/vendor/payments${qs}`);
  }

  /**
   * Créer un retrait (payout) pour le partenaire.
   * Le montant est en USD.
   */
  async createVendorPayout(receiver: string, method: string, amount: number, currency: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/vendor/payouts", "POST", true, {
      receiver,
      method,
      amount,
      currency,
    });
  }

  /**
   * Liste de prix du vendeur avec filtres.
   */
  async getVendorPrices(params: {
    productName?: string;
    countryName?: string;
    operatorName?: string;
    enabled?: boolean;
    sortDir?: "asc" | "desc";
    sortField?: string;
    page?: number;
    perPage?: number;
  } = {}): Promise<FiveSimVendorPricesResponse> {
    const filters: Record<string, string | boolean> = {};
    if (params.productName) filters.ProductName = params.productName;
    if (params.countryName) filters.CountryName = params.countryName;
    if (params.operatorName) filters.OperatorName = params.operatorName;
    if (params.enabled !== undefined) filters.Enabled = params.enabled;

    const qs = buildQS({
      _filters: JSON.stringify(filters),
      _sortDir: params.sortDir ?? "asc",
      _sortField: params.sortField ?? "CountryName",
      _page: params.page ?? 1,
      _perPage: params.perPage ?? 15,
    });
    return this.request<FiveSimVendorPricesResponse>(`/vendor/prices${qs}`);
  }
}

/* ─── Custom Error ───────────────────────────────────────────────── */

export class FiveSimError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`5sim API ${status} on ${path}: ${body}`);
    this.name = "FiveSimError";
  }

  get isNotFound() { return this.status === 404; }
  get isUnauthorized() { return this.status === 401; }
  get isPaymentRequired() { return this.status === 402; }
  get isNoNumbers() { return this.body.includes("no free phones") || this.body.includes("no numbers") || this.status === 404; }
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function normaliseOrder(order: FiveSimOrder): FiveSimOrder {
  if (order.phone && !order.phone.startsWith("+")) {
    order.phone = `+${order.phone}`;
  }
  return order;
}

function buildQS(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

/* ─── Country slug mapping: ISO code → 5sim slug ──────────────────── */
/*
 * IMPORTANT: Only countries that exist on 5sim are mapped here.
 * Verified against https://5sim.net/v1/guest/countries (153 countries, May 2026).
 * Countries NOT on 5sim (Turkey, UAE, China, Japan, South Korea, Singapore,
 * Qatar, Iraq, Syria, Lebanon, Ukraine, Russia, Cuba, etc.) are intentionally absent.
 */
export const ISO_TO_5SIM: Record<string, string> = {
  /* ── Africa (39) ── */
  AO: "angola",       BJ: "benin",          BW: "botswana",     BF: "burkinafaso",
  BI: "burundi",      CM: "cameroon",        CV: "capeverde",    TD: "chad",
  KM: "comoros",      CG: "congo",           DJ: "djibouti",     GQ: "equatorialguinea",
  ET: "ethiopia",     GA: "gabon",           GM: "gambia",       GH: "ghana",
  GN: "guinea",       GW: "guineabissau",    CI: "ivorycoast",   KE: "kenya",
  LS: "lesotho",      LR: "liberia",         MG: "madagascar",   MW: "malawi",
  MR: "mauritania",   MU: "mauritius",       MZ: "mozambique",   NA: "namibia",
  NG: "nigeria",      RW: "rwanda",          SN: "senegal",      SC: "seychelles",
  SL: "sierraleone",  ZA: "southafrica",     SZ: "swaziland",    TZ: "tanzania",
  TG: "togo",         UG: "uganda",          ZM: "zambia",

  /* ── Europe (35) ── */
  AL: "albania",      AT: "austria",         BE: "belgium",      BA: "bih",
  BG: "bulgaria",     HR: "croatia",         CY: "cyprus",       CZ: "czech",
  DK: "denmark",      GB: "england",         EE: "estonia",      FI: "finland",
  FR: "france",       GE: "georgia",         DE: "germany",      GR: "greece",
  HU: "hungary",      IE: "ireland",         IT: "italy",        LV: "latvia",
  LT: "lithuania",    LU: "luxembourg",      MD: "moldova",      ME: "montenegro",
  NL: "netherlands",  MK: "northmacedonia",  NO: "norway",       PL: "poland",
  PT: "portugal",     RO: "romania",         RS: "serbia",       SK: "slovakia",
  SI: "slovenia",     ES: "spain",           SE: "sweden",

  /* ── Americas (22) ── */
  AG: "antiguaandbarbuda", AR: "argentina",  AW: "aruba",        BS: "bahamas",
  BB: "barbados",     BZ: "belize",          BO: "bolivia",      BR: "brazil",
  CA: "canada",       CL: "chile",           CO: "colombia",     CR: "costarica",
  DO: "dominicana",   EC: "ecuador",         GT: "guatemala",    GY: "guyana",
  HT: "haiti",        HN: "honduras",        JM: "jamaica",      MX: "mexico",
  NI: "nicaragua",    PA: "panama",          PY: "paraguay",     PE: "peru",
  PR: "puertorico",   SV: "salvador",        WS: "samoa",        SR: "suriname",
  TT: "tit",          US: "usa",             UY: "uruguay",      VE: "venezuela",

  /* ── Asia-Pacific (24) ── */
  AM: "armenia",      AU: "australia",       AZ: "azerbaijan",   BD: "bangladesh",
  BT: "bhutane",      KH: "cambodia",        TL: "easttimor",    HK: "hongkong",
  IN: "india",        ID: "indonesia",       KZ: "kazakhstan",   KG: "kyrgyzstan",
  LA: "laos",         MO: "macau",           MY: "malaysia",     MV: "maldives",
  MN: "mongolia",     NP: "nepal",           PK: "pakistan",     PG: "papuanewguinea",
  PH: "philippines",  LK: "srilanka",        TW: "taiwan",       TJ: "tajikistan",
  TH: "thailand",     TM: "turkmenistan",    UZ: "uzbekistan",   VN: "vietnam",

  /* ── Middle East & North Africa (10) ── */
  DZ: "algeria",      BH: "bahrain",         EG: "egypt",        IL: "israel",
  JO: "jordan",       KW: "kuwait",          MA: "morocco",      OM: "oman",
  SA: "saudiarabia",  TN: "tunisia",

  /* ── Pacific / Caribbean / Overseas ── */
  GF: "frenchguiana", GP: "guadeloupe",  NC: "newcaledonia",
  RE: "reunion",      SB: "solomonislands",  KN: "saintkittsandnevis",
  LC: "saintlucia",   VC: "saintvincentandgrenadines",
};

/* ─── Service slug mapping: our slug → 5sim product name ───────────── */
export const SERVICE_TO_5SIM: Record<string, string> = {
  whatsapp: "whatsapp",
  telegram: "telegram",
  google: "google",
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  discord: "discord",
  twitter: "twitter",
  snapchat: "snapchat",
  linkedin: "linkedin",
  uber: "uber",
  netflix: "netflix",
  amazon: "amazon",
  paypal: "paypal",
  binance: "binance",
  airbnb: "airbnb",
  microsoft: "microsoft",
  apple: "apple",
  yahoo: "yahoo",
  viber: "viber",
  line: "line",
  wechat: "wechat",
  shopee: "shopee",
  lazada: "lazada",
  steam: "steam",
  ebay: "ebay",
  twitter_x: "twitter",
  x: "twitter",
  "twitter / x": "twitter",
  signal: "signal",
  skype: "skype",
  spotify: "spotify",
  coinbase: "coinbase",
  kraken: "kraken",
  openai: "openai",
  deepseek: "deepseek",
  roblox: "roblox",
  tinder: "tinder",
  bumble: "bumble",
  badoo: "badoo",
};

/** Récupérer le client 5sim actif depuis la base de données */
export function getActiveFiveSimClient(
  providers: Array<{ slug: string; apiKey: string; active: boolean }>,
): FiveSimClient | null {
  const provider = providers.find(p => p.slug === "5sim" && p.active && p.apiKey);
  if (!provider) return null;
  return new FiveSimClient(provider.apiKey);
}
