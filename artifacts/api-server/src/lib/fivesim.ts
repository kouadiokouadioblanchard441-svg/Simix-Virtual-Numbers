/**
 * 5sim.net API client — v1
 * Docs: https://5sim.net/docs
 *
 * All methods throw on non-2xx or network failure.
 * Phone numbers returned by 5sim are WITHOUT leading "+"; we normalise here.
 */

const BASE_URL = "https://5sim.net/v1";
const DEFAULT_TIMEOUT_MS = 12_000;

/* ─── Response types ─────────────────────────────────────────────── */

export interface FiveSimOrder {
  id: number;
  phone: string;         // e.g. "79123456789" (no leading +)
  operator: string;
  product: string;
  price: number;         // in USD
  status: "PENDING" | "RECEIVED" | "CANCELED" | "TIMEOUT" | "FINISHED" | "BANNED";
  expires: string;       // ISO date
  sms: FiveSimSms[];
  created_at: string;
  forwarding: boolean;
  forwarding_number: string;
  country: string;
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
  balance: number;       // USD float
  rating: number;
  default_country: { name: string; iso: string; prefix: string };
  default_operator: { name: string };
  frozen_balance: number;
}

export interface FiveSimProduct {
  Category: string;
  Qty: number;
  Price: number;   // USD
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

/* ─── Client ─────────────────────────────────────────────────────── */

export class FiveSimClient {
  readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("5sim: apiKey is required");
    this.apiKey = apiKey;
  }

  /* ── Private request helper ── */
  private async request<T>(path: string, method: "GET" | "POST" = "GET", auth = true): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (auth) headers["Authorization"] = `Bearer ${this.apiKey}`;

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, { method, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new FiveSimError(res.status, body, path);
    }

    return res.json() as Promise<T>;
  }

  /* ── User endpoints (require API key) ── */

  /** Get account balance and profile */
  async getProfile(): Promise<FiveSimProfile> {
    return this.request<FiveSimProfile>("/user/profile");
  }

  /**
   * Buy a virtual number.
   * country  — 5sim country slug (e.g. "france", "ivorycoast")
   * operator — "any" or specific operator (e.g. "virtual4")
   * product  — service name (e.g. "whatsapp", "telegram")
   */
  async buyNumber(country: string, operator: string, product: string): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(
      `/user/buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(operator)}/${encodeURIComponent(product)}`,
    );
    return normaliseOrder(order);
  }

  /** Check order status & get any received SMS */
  async checkOrder(orderId: number): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(`/user/check/${orderId}`);
    return normaliseOrder(order);
  }

  /** Mark number as successfully used — call after SMS received */
  async finishOrder(orderId: number): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(`/user/finish/${orderId}`);
    return normaliseOrder(order);
  }

  /** Cancel order (full refund if no SMS was received) */
  async cancelOrder(orderId: number): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(`/user/cancel/${orderId}`);
    return normaliseOrder(order);
  }

  /**
   * Ban/report number as bad (partial refund).
   * Use when number received spam or cannot receive the code.
   */
  async banOrder(orderId: number): Promise<FiveSimOrder> {
    const order = await this.request<FiveSimOrder>(`/user/ban/${orderId}`);
    return normaliseOrder(order);
  }

  /* ── Guest endpoints (no auth needed — pass auth=false) ── */

  /** List all available countries and their operators */
  async getCountries(): Promise<FiveSimCountriesResponse> {
    return this.request<FiveSimCountriesResponse>("/guest/countries", "GET", false);
  }

  /**
   * Get available products (services) for a country + operator.
   * Returns map of productName → { Category, Qty, Price }.
   * Qty > 0 means numbers are available.
   */
  async getProducts(country: string, operator = "any"): Promise<FiveSimProductsResponse> {
    return this.request<FiveSimProductsResponse>(
      `/guest/products/${encodeURIComponent(country)}/${encodeURIComponent(operator)}`,
      "GET",
      false,
    );
  }

  /**
   * Check availability and price for a specific country + product.
   * Returns null if country/product not available.
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

/** Ensure phone number has leading "+" */
function normaliseOrder(order: FiveSimOrder): FiveSimOrder {
  if (order.phone && !order.phone.startsWith("+")) {
    order.phone = `+${order.phone}`;
  }
  return order;
}

/* ─── Country slug mapping: ISO code → 5sim slug ──────────────────── */
export const ISO_TO_5SIM: Record<string, string> = {
  AF: "afghanistan", AL: "albania", DZ: "algeria", AO: "angola", AR: "argentina",
  AM: "armenia", AU: "australia", AT: "austria", AZ: "azerbaijan", BH: "bahrain",
  BD: "bangladesh", BE: "belgium", BJ: "benin", BO: "bolivia", BA: "bih",
  BW: "botswana", BR: "brazil", BG: "bulgaria", BF: "burkinafaso", BI: "burundi",
  KH: "cambodia", CM: "cameroon", CA: "canada", CV: "capeverde", TD: "chad",
  CL: "chile", CO: "colombia", CG: "congo", CR: "costarica", HR: "croatia",
  CY: "cyprus", CZ: "czech", DK: "denmark", DO: "dominicana", EC: "ecuador",
  EG: "egypt", GB: "england", ET: "ethiopia", FI: "finland", FR: "france",
  GA: "gabon", GM: "gambia", GE: "georgia", DE: "germany", GH: "ghana",
  GR: "greece", GT: "guatemala", GN: "guinea", GY: "guyana", HT: "haiti",
  HN: "honduras", HK: "hongkong", HU: "hungary", IN: "india", ID: "indonesia",
  IE: "ireland", IL: "israel", IT: "italy", CI: "ivorycoast", JM: "jamaica",
  JO: "jordan", KZ: "kazakhstan", KE: "kenya", KW: "kuwait", KG: "kyrgyzstan",
  LA: "laos", LV: "latvia", LS: "lesotho", LR: "liberia", LT: "lithuania",
  LU: "luxembourg", MG: "madagascar", MW: "malawi", MY: "malaysia", MV: "maldives",
  MR: "mauritania", MU: "mauritius", MX: "mexico", MD: "moldova", MN: "mongolia",
  ME: "montenegro", MA: "morocco", MZ: "mozambique", NA: "namibia", NP: "nepal",
  NL: "netherlands", NI: "nicaragua", NG: "nigeria", MK: "northmacedonia",
  NO: "norway", OM: "oman", PK: "pakistan", PA: "panama", PY: "paraguay",
  PE: "peru", PH: "philippines", PL: "poland", PT: "portugal", RO: "romania",
  RW: "rwanda", SN: "senegal", RS: "serbia", SL: "sierraleone", SK: "slovakia",
  SI: "slovenia", ZA: "southafrica", ES: "spain", LK: "srilanka", SR: "suriname",
  SZ: "swaziland", SE: "sweden", TW: "taiwan", TJ: "tajikistan", TZ: "tanzania",
  TH: "thailand", TG: "togo", TN: "tunisia", TM: "turkmenistan", UG: "uganda",
  UA: "ukraine", AE: "uae", US: "usa", UY: "uruguay", UZ: "uzbekistan",
  VE: "venezuela", VN: "vietnam", ZM: "zambia",
  // Additional African countries
  ML: "mali", NE: "niger", SD: "sudan", LY: "libya",
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
};

/** Get active 5sim client from db providers (cached check) */
export function getActiveFiveSimClient(
  providers: Array<{ slug: string; apiKey: string; active: boolean }>,
): FiveSimClient | null {
  const provider = providers.find(p => p.slug === "5sim" && p.active && p.apiKey);
  if (!provider) return null;
  return new FiveSimClient(provider.apiKey);
}
