/**
 * PawaPay API client
 * Docs: https://docs.pawapay.io/
 * Sandbox: https://api.sandbox.pawapay.io/
 * Production: https://api.pawapay.io/
 *
 * IMPORTANT: PawaPay uses ISO 3166-1 alpha-3 country codes in correspondent names
 * (e.g. ORANGE_CIV not ORANGE_CI, MTN_MOMO_SEN not MTN_MOMO_SN)
 * Always use predict-correspondent API first to get the exact correct code.
 */

export type PawaPayEnv = "sandbox" | "production";

export interface PawaPayDepositRequest {
  depositId: string;
  amount: string;
  currency: string;
  correspondent: string;
  payer: {
    type: "MSISDN";
    address: { value: string };
  };
  customerTimestamp: string;
  statementDescription: string;
  metadata?: Array<{ fieldName: string; fieldValue: string; isPII?: boolean }>;
}

export interface PawaPayDepositResponse {
  depositId: string;
  status: "ACCEPTED" | "REJECTED";
  rejectionReason?: {
    rejectionCode: string;
    rejectionMessage: string;
  };
  created?: string;
}

export interface PawaPayDepositStatus {
  depositId: string;
  status: "ACCEPTED" | "COMPLETED" | "FAILED" | "DUPLICATE_IGNORED";
  requestedAmount: string;
  depositedAmount?: string;
  currency: string;
  country: string;
  correspondent: string;
  payer: { type: string; address: { value: string } };
  customerTimestamp: string;
  statementDescription: string;
  created: string;
  respondedByPayer?: string;
  correspondent_ids?: { PAYER_TRANSACTION_ID?: string; [key: string]: string | undefined };
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

export interface PawaPayCorrespondent {
  correspondent: string;
  country: string;
  currency: string;
  name: string;
  operationType: string;
  active: boolean;
  mobileMoneyVendor: string;
}

export interface PawaPayPredictResult {
  correspondent: string;
  country: string;
  operator?: string;
  msisdn?: string;
}

/* ── ISO 3166-1 alpha-2 → alpha-3 mapping ── */
export const ISO2_TO_ISO3: Record<string, string> = {
  CI: "CIV", SN: "SEN", CM: "CMR", GH: "GHA", NG: "NGA",
  KE: "KEN", TZ: "TZA", UG: "UGA", MZ: "MOZ", ZM: "ZMB",
  RW: "RWA", GA: "GAB", CG: "COG", TD: "TCD", BF: "BFA",
  ML: "MLI", GN: "GIN", TG: "TGO", BJ: "BEN", NE: "NER",
  MR: "MRT", GW: "GNB", MG: "MDG", ZW: "ZWE", ZA: "ZAF",
  AO: "AGO", ET: "ETH", MW: "MWI", EG: "EGY", MA: "MAR",
  SL: "SLE", LR: "LBR", CD: "COD", SS: "SSD", SD: "SDN",
};

/* ── Mobile Money correspondent mapping by country ISO-2 code ──
 * Verified against PawaPay predict-correspondent API responses.
 * Codes use ISO 3166-1 alpha-3 suffixes (CIV, SEN, CMR, etc.)
 * This is used as FALLBACK only — predict-correspondent API is preferred.
 * ─────────────────────────────────────────────────────────────────────── */
export const COUNTRY_TO_PAWAPAY_CORRESPONDENT: Record<string, string[]> = {
  CI: ["ORANGE_CIV", "MTN_MOMO_CIV", "MOOV_CIV"],
  SN: ["ORANGE_SEN", "WAVE_SEN", "FREE_SEN", "EXPRESSO_SEN"],
  CM: ["MTN_MOMO_CMR", "ORANGE_CMR"],
  GH: ["MTN_MOMO_GHA", "VODAFONE_GHA", "AIRTELTIGO_GHA"],
  NG: ["MTN_MOMO_NGA", "AIRTEL_NGA"],
  KE: ["MPESA_KEN", "AIRTEL_KEN"],
  TZ: ["MPESA_TZA", "VODACOM_TZA", "AIRTEL_TZA", "TIGO_TZA"],
  UG: ["MTN_MOMO_UGA", "AIRTEL_UGA"],
  MZ: ["MPESA_MOZ", "VODACOM_MOZ"],
  ZM: ["AIRTEL_OAPI_ZMB", "MTN_MOMO_ZMB"],
  RW: ["MTN_MOMO_RWA", "AIRTEL_RWA"],
  GA: ["AIRTEL_GAB"],
  CG: ["MTN_MOMO_COG", "AIRTEL_COG"],
  TD: ["AIRTEL_TCD"],
  BF: ["ORANGE_BFA", "MOOV_BFA"],
  ML: ["ORANGE_MLI", "MOBICASH_MLI"],
  GN: ["ORANGE_GIN", "MTN_MOMO_GIN"],
  TG: ["TMONEY_TGO", "FLOOZ_TGO"],
  BJ: ["MTN_MOMO_BEN", "MOOV_BEN"],
  NE: ["AIRTEL_NER"],
  MR: ["MOOV_MRT"],
  GW: ["MOOV_GNB"],
  MG: ["MVOLA_MDG", "AIRTEL_MDG"],
  ZW: ["ECONET_ZWE"],
  ZA: ["MPESA_ZAF"],
  AO: ["UNITEL_AGO"],
  ET: ["MPESA_ETH"],
  MW: ["TNM_MWI", "AIRTEL_MWI"],
  EG: ["ORANGE_EGY", "VODAFONE_EGY"],
  MA: ["ORANGE_MAR", "IAM_MAR"],
  SL: ["ORANGE_SLE"],
};

/* ── Currency mapping by country ISO-2 ── */
export const COUNTRY_CURRENCY: Record<string, string> = {
  CI: "XOF", SN: "XOF", BJ: "XOF", BF: "XOF", ML: "XOF", NE: "XOF", TG: "XOF", GW: "XOF",
  CM: "XAF", GA: "XAF", CG: "XAF", TD: "XAF", MR: "MRO",
  GH: "GHS", NG: "NGN", KE: "KES", TZ: "TZS", UG: "UGX",
  MZ: "MZN", ZM: "ZMW", RW: "RWF", MW: "MWK", ZW: "ZWL",
  MG: "MGA", GN: "GNF", ZA: "ZAR", AO: "AOA", ET: "ETB",
  EG: "EGP", MA: "MAD", SL: "SLL",
};

export class PawaPayClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, env: PawaPayEnv = "production") {
    this.token = token;
    this.baseUrl = env === "sandbox"
      ? "https://api.sandbox.pawapay.io"
      : "https://api.pawapay.io";
  }

  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`PawaPay API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async initiateDeposit(params: PawaPayDepositRequest): Promise<PawaPayDepositResponse> {
    return this.request<PawaPayDepositResponse>("/deposits", "POST", params);
  }

  async getDepositStatus(depositId: string): Promise<PawaPayDepositStatus[]> {
    return this.request<PawaPayDepositStatus[]>(`/deposits/${depositId}`);
  }

  async getActiveCorrespondents(): Promise<PawaPayCorrespondent[]> {
    return this.request<PawaPayCorrespondent[]>("/active-configuration");
  }

  /**
   * Predict the correct correspondent code for a given MSISDN.
   * This is the most reliable way to get the exact correspondent code.
   * Returns null if the country is not configured for this merchant.
   */
  async predictCorrespondent(msisdn: string): Promise<PawaPayPredictResult | null> {
    try {
      const result = await this.request<PawaPayPredictResult & { errorCode?: number; errorMessage?: string }>(
        "/predict-correspondent", "POST", { msisdn }
      );
      if (result.errorCode) return null;
      if (result.correspondent) return result;
      return null;
    } catch {
      return null;
    }
  }

  async checkAvailability(): Promise<{ status: string; country?: string }> {
    try {
      await this.getActiveCorrespondents();
      return { status: "ok" };
    } catch {
      return { status: "error" };
    }
  }
}

export function generateDepositId(): string {
  return crypto.randomUUID();
}

/**
 * Normalize a phone number to MSISDN format (no +, no spaces).
 * Prepends dial code if provided separately.
 */
export function normalizeMSISDN(phone: string): string {
  const cleaned = phone.replace(/[\s\-().+]/g, "");
  if (cleaned.startsWith("00")) return cleaned.slice(2);
  return cleaned;
}

/**
 * Build a full MSISDN from a local phone number and dial code.
 *
 * For African Mobile Money markets, the leading 0 in local numbers is part
 * of the subscriber number (NOT a trunk prefix), so we preserve it.
 *   e.g. phone="0701234567", dialCode="+225" → "2250701234567" (13 digits, CIV)
 *   e.g. phone="07 01 23 45 67", dialCode="+225" → "2250701234567"
 *   e.g. phone="2250701234567" (already E.164 without +) → "2250701234567"
 *
 * If the number already starts with the country code digits, it is returned as-is.
 */
export function buildMSISDN(phoneNumber: string, dialCode?: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!dialCode) return digits;

  const countryDigits = dialCode.replace(/\D/g, "");

  // If the number is already in international format (starts with country code), use it as-is
  if (digits.startsWith(countryDigits) && digits.length > countryDigits.length + 6) {
    return digits;
  }

  // Concatenate country code + local number (preserve leading zeros)
  return `${countryDigits}${digits}`;
}

/**
 * Get the best correspondent for a country + method slug (FALLBACK only).
 * Prefer using client.predictCorrespondent() instead.
 */
export function getCorrespondentForCountry(countryCode: string, methodSlug: string): string | null {
  const correspondents = COUNTRY_TO_PAWAPAY_CORRESPONDENT[countryCode.toUpperCase()] ?? [];
  if (correspondents.length === 0) return null;

  const slug = methodSlug.toLowerCase();
  if (slug.includes("orange")) return correspondents.find(c => c.startsWith("ORANGE_")) ?? correspondents[0];
  if (slug.includes("mtn")) return correspondents.find(c => c.startsWith("MTN_")) ?? correspondents[0];
  if (slug.includes("wave")) return correspondents.find(c => c.startsWith("WAVE_")) ?? correspondents[0];
  if (slug.includes("moov")) return correspondents.find(c => c.startsWith("MOOV_")) ?? correspondents[0];
  if (slug.includes("airtel")) return correspondents.find(c => c.startsWith("AIRTEL_")) ?? correspondents[0];
  if (slug.includes("mpesa") || slug.includes("m-pesa")) return correspondents.find(c => c.startsWith("MPESA_")) ?? correspondents[0];
  if (slug.includes("vodafone")) return correspondents.find(c => c.startsWith("VODAFONE_")) ?? correspondents[0];
  if (slug.includes("free")) return correspondents.find(c => c.startsWith("FREE_")) ?? correspondents[0];

  return correspondents[0];
}
