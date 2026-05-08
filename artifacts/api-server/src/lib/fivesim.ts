/**
 * 5sim.net API client
 * Docs: https://5sim.net/docs
 */

const BASE_URL = "https://5sim.net/v1";

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

export class FiveSimClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, method = "GET"): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`5sim API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async getProfile(): Promise<FiveSimProfile> {
    return this.request<FiveSimProfile>("/user/profile");
  }

  async getProducts(country: string, operator = "any"): Promise<Record<string, FiveSimProduct>> {
    return this.request<Record<string, FiveSimProduct>>(`/guest/products/${country}/${operator}`);
  }

  async buyNumber(country: string, operator: string, product: string): Promise<FiveSimOrder> {
    return this.request<FiveSimOrder>(`/user/buy/activation/${country}/${operator}/${product}`);
  }

  async checkOrder(orderId: number): Promise<FiveSimOrder> {
    return this.request<FiveSimOrder>(`/user/check/${orderId}`);
  }

  async finishOrder(orderId: number): Promise<FiveSimOrder> {
    return this.request<FiveSimOrder>(`/user/finish/${orderId}`);
  }

  async cancelOrder(orderId: number): Promise<FiveSimOrder> {
    return this.request<FiveSimOrder>(`/user/cancel/${orderId}`);
  }

  async banOrder(orderId: number): Promise<FiveSimOrder> {
    return this.request<FiveSimOrder>(`/user/ban/${orderId}`);
  }
}

/* ── Country slug mapping: ISO code → 5sim slug ── */
export const ISO_TO_5SIM: Record<string, string> = {
  AF: "afghanistan",
  AL: "albania",
  DZ: "algeria",
  AO: "angola",
  AR: "argentina",
  AM: "armenia",
  AU: "australia",
  AT: "austria",
  AZ: "azerbaijan",
  BH: "bahrain",
  BD: "bangladesh",
  BE: "belgium",
  BJ: "benin",
  BO: "bolivia",
  BA: "bih",
  BW: "botswana",
  BR: "brazil",
  BG: "bulgaria",
  BF: "burkinafaso",
  BI: "burundi",
  KH: "cambodia",
  CM: "cameroon",
  CA: "canada",
  CV: "capeverde",
  TD: "chad",
  CL: "chile",
  CO: "colombia",
  CG: "congo",
  CR: "costarica",
  HR: "croatia",
  CY: "cyprus",
  CZ: "czech",
  DK: "denmark",
  DO: "dominicana",
  EC: "ecuador",
  EG: "egypt",
  GB: "england",
  ET: "ethiopia",
  FI: "finland",
  FR: "france",
  GA: "gabon",
  GM: "gambia",
  GE: "georgia",
  DE: "germany",
  GH: "ghana",
  GR: "greece",
  GT: "guatemala",
  GN: "guinea",
  GY: "guyana",
  HT: "haiti",
  HN: "honduras",
  HK: "hongkong",
  HU: "hungary",
  IN: "india",
  ID: "indonesia",
  IE: "ireland",
  IL: "israel",
  IT: "italy",
  CI: "ivorycoast",
  JM: "jamaica",
  JO: "jordan",
  KZ: "kazakhstan",
  KE: "kenya",
  KW: "kuwait",
  KG: "kyrgyzstan",
  LA: "laos",
  LV: "latvia",
  LS: "lesotho",
  LR: "liberia",
  LT: "lithuania",
  LU: "luxembourg",
  MG: "madagascar",
  MW: "malawi",
  MY: "malaysia",
  MV: "maldives",
  MR: "mauritania",
  MU: "mauritius",
  MX: "mexico",
  MD: "moldova",
  MN: "mongolia",
  ME: "montenegro",
  MA: "morocco",
  MZ: "mozambique",
  NA: "namibia",
  NP: "nepal",
  NL: "netherlands",
  NI: "nicaragua",
  NG: "nigeria",
  MK: "northmacedonia",
  NO: "norway",
  OM: "oman",
  PK: "pakistan",
  PA: "panama",
  PY: "paraguay",
  PE: "peru",
  PH: "philippines",
  PL: "poland",
  PT: "portugal",
  RO: "romania",
  RW: "rwanda",
  SN: "senegal",
  RS: "serbia",
  SL: "sierraleone",
  SK: "slovakia",
  SI: "slovenia",
  ZA: "southafrica",
  ES: "spain",
  LK: "srilanka",
  SR: "suriname",
  SZ: "swaziland",
  SE: "sweden",
  TW: "taiwan",
  TJ: "tajikistan",
  TZ: "tanzania",
  TH: "thailand",
  TG: "togo",
  TN: "tunisia",
  TM: "turkmenistan",
  UG: "uganda",
  UA: "ukraine",
  AE: "uae",
  US: "usa",
  UY: "uruguay",
  UZ: "uzbekistan",
  VE: "venezuela",
  VN: "vietnam",
  ZM: "zambia",
};

/* ── Service slug mapping: our slug → 5sim product ── */
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
};

export function getActiveFiveSimClient(providers: Array<{ slug: string; apiKey: string; active: boolean }>): FiveSimClient | null {
  const provider = providers.find(p => p.slug === "5sim" && p.active && p.apiKey);
  if (!provider) return null;
  return new FiveSimClient(provider.apiKey);
}
