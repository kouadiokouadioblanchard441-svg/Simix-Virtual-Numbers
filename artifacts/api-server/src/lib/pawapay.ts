/**
 * PawaPay Merchant API v2 Client
 * Docs: https://docs.pawapay.io/v2/docs/
 * Production: https://api.pawapay.io
 * Sandbox:    https://api.sandbox.pawapay.io
 *
 * KEY v2 DIFFERENCES FROM v1:
 *  - All paths are prefixed with /v2/ (e.g. /v2/deposits)
 *  - payer.type is now "MMO" (was "MSISDN")
 *  - payer.accountDetails replaces payer.address
 *  - correspondent renamed to provider everywhere
 *  - customerTimestamp removed from request
 *  - statementDescription renamed to customerMessage (4–22 chars, ^[a-zA-Z0-9 ]+$)
 *  - metadata format: [{key: value}] instead of [{fieldName, fieldValue}]
 *  - Status check returns {status:"FOUND", data:{...}} wrapper
 *  - Callbacks: single amount field (not requestedAmount/depositedAmount)
 *  - providerTransactionId replaces correspondentIds
 *  - predict-provider endpoint (was predict-correspondent)
 *
 * PHONE NUMBER RULES (v2):
 *  - Digits only, no + prefix, no spaces
 *  - Must include country code
 *  - Must NOT start with zero
 *  - Use buildMSISDN() to correctly format from local input
 */

import { createHash } from "node:crypto";

export type PawaPayEnv = "sandbox" | "production";

/* ── v2 Request Types ── */

export interface PawaPayDepositRequest {
  depositId: string;          // UUID v4 — generated before storing in DB
  amount: string;             // String, no leading zeros except for <1
  currency: string;           // ISO 4217 (XOF, GHS, KES…)
  payer: {
    type: "MMO";
    accountDetails: {
      phoneNumber: string;    // E.164 without +, no leading zero
      provider: string;       // e.g. ORANGE_CIV, MTN_MOMO_ZMB
    };
  };
  customerMessage?: string;   // 4–22 chars, ^[a-zA-Z0-9 ]+$ (shown to customer)
  clientReferenceId?: string; // Optional reference to your system entity
  metadata?: Record<string, string>[];
}

export interface PawaPayDepositInitResponse {
  depositId: string;
  status: "ACCEPTED" | "REJECTED" | "DUPLICATE_IGNORED";
  created?: string;
  nextStep?: "FINAL_STATUS" | string;   // FINAL_STATUS = wait for callback/poll
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

/* ── v2 Status Check Response ── */

export interface PawaPayDepositData {
  depositId: string;
  status: "ACCEPTED" | "PROCESSING" | "COMPLETED" | "FAILED" | "IN_RECONCILIATION" | "DUPLICATE_IGNORED";
  amount: string;              // Requested amount (single field in v2)
  currency: string;
  country: string;
  payer: {
    type: "MMO";
    accountDetails: {
      phoneNumber: string;
      provider: string;
    };
  };
  customerMessage?: string;
  clientReferenceId?: string;
  created: string;
  providerTransactionId?: string;
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
  metadata?: Record<string, unknown>;
}

export interface PawaPayDepositSearchResult {
  status: "FOUND" | "NOT_FOUND";
  data?: PawaPayDepositData;
}

/* ── v2 Webhook Callback Body ── */

export interface PawaPayDepositCallback {
  depositId: string;
  status: "COMPLETED" | "FAILED";
  amount: string;
  currency: string;
  country: string;
  payer?: {
    type: string;
    accountDetails?: {
      phoneNumber?: string;
      provider?: string;
    };
  };
  customerMessage?: string;
  created?: string;
  providerTransactionId?: string;
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
  metadata?: Record<string, unknown>;
}

/* ── v2 Predict Provider Response ── */

export interface PawaPayPredictResult {
  provider: string;           // e.g. ORANGE_CIV
  country: string;            // ISO 3166-1 alpha-3 (e.g. CIV)
  phoneNumber?: string;       // Sanitized phone number
}

/* ── v2 Active Configuration ── */

export interface PawaPayActiveConfig {
  companyName: string;
  countries: Array<{
    country: string;
    providers: Array<{
      provider: string;
      nameDisplayedToCustomer: string;
      currencies: Array<{
        currency: string;
        operationTypes: {
          DEPOSIT?: { minAmount: string; maxAmount: string };
          PAYOUT?: { minAmount: string; maxAmount: string };
        };
      }>;
    }>;
  }>;
}

/* ─────────────────────────────────────────────────────────────────
 * ISO 3166-1 alpha-2 → alpha-3 mapping
 * PawaPay provider codes use ISO-3 suffixes (CIV, SEN, CMR…)
 * ─────────────────────────────────────────────────────────────── */
export const ISO2_TO_ISO3: Record<string, string> = {
  CI: "CIV", SN: "SEN", CM: "CMR", GH: "GHA", NG: "NGA",
  KE: "KEN", TZ: "TZA", UG: "UGA", MZ: "MOZ", ZM: "ZMB",
  RW: "RWA", GA: "GAB", CG: "COG", TD: "TCD", BF: "BFA",
  ML: "MLI", GN: "GIN", TG: "TGO", BJ: "BEN", NE: "NER",
  MR: "MRT", GW: "GNB", MG: "MDG", ZW: "ZWE", ZA: "ZAF",
  AO: "AGO", ET: "ETH", MW: "MWI", EG: "EGY", MA: "MAR",
  SL: "SLE", LR: "LBR", CD: "COD", SS: "SSD", SD: "SDN",
};

/* ─────────────────────────────────────────────────────────────────
 * Provider mapping by country ISO-2 code (FALLBACK only)
 * Verified against PawaPay predict-provider API.
 * Always use predictProvider() first — static mapping is fallback.
 * ─────────────────────────────────────────────────────────────── */
export const COUNTRY_TO_PAWAPAY_PROVIDER: Record<string, string[]> = {
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

/* ─────────────────────────────────────────────────────────────────
 * PawaPay v2 Client
 * ─────────────────────────────────────────────────────────────── */
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

    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }

    if (!res.ok) {
      throw new Error(`PawaPay ${res.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
    }

    return json as T;
  }

  /**
   * Initiate a deposit (v2).
   * IMPORTANT: Store the depositId in your DB BEFORE calling this.
   * Status ACCEPTED = pending, wait for webhook or poll.
   * Status REJECTED = payment refused, user must retry.
   */
  async initiateDeposit(params: PawaPayDepositRequest): Promise<PawaPayDepositInitResponse> {
    return this.request<PawaPayDepositInitResponse>("/v2/deposits", "POST", params);
  }

  /**
   * Check the current status of a deposit (v2).
   * Returns {status:"FOUND", data:{...}} or {status:"NOT_FOUND"}.
   * Poll only if webhook is not configured or as reconciliation.
   */
  async getDepositStatus(depositId: string): Promise<PawaPayDepositSearchResult> {
    return this.request<PawaPayDepositSearchResult>(`/v2/deposits/${depositId}`);
  }

  /**
   * Predict the correct provider code for a given phone number (v2).
   * Also sanitizes and validates the phone number.
   * ALWAYS call this before initiating a deposit — most reliable way to get provider.
   * Returns null if country not configured or phone number invalid.
   */
  async predictProvider(phoneNumber: string): Promise<PawaPayPredictResult | null> {
    try {
      const result = await this.request<PawaPayPredictResult & { errorCode?: number; errorMessage?: string }>(
        "/v2/predict-provider", "POST", { phoneNumber }
      );
      if (result.errorCode) {
        return null;
      }
      if (result.provider) return result;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get active configuration for this merchant account (v2).
   * Contains all configured providers, currencies, limits.
   */
  async getActiveConfiguration(): Promise<PawaPayActiveConfig> {
    return this.request<PawaPayActiveConfig>("/v2/active-configuration");
  }

  /**
   * Get PawaPay's public keys for signature verification.
   * Cache the result to avoid repeated calls.
   */
  async getPublicKeys(): Promise<Array<{ keyId: string; key: string; algorithm: string }>> {
    return this.request<Array<{ keyId: string; key: string; algorithm: string }>>("/v2/public-keys");
  }
}

/* ─────────────────────────────────────────────────────────────────
 * Utility functions
 * ─────────────────────────────────────────────────────────────── */

export function generateDepositId(): string {
  return crypto.randomUUID();
}

/**
 * Build a full MSISDN (E.164 without +) from a local phone number and dial code.
 *
 * PawaPay v2 phone number rules:
 *  - Digits only, no +, no spaces
 *  - Must include country code prefix
 *  - Must NOT start with zero (the full international number)
 *
 * For African Mobile Money, local numbers include a leading 0 as part of
 * the subscriber number (e.g. Ivory Coast: 07 01 23 45 67 → 0701234567).
 * When the country code is prepended, the result does NOT start with 0.
 *
 * Examples:
 *   buildMSISDN("0701234567", "+225") → "2250701234567"  ✓ (CIV, 13 digits)
 *   buildMSISDN("783456789",  "+250") → "250783456789"   ✓ (RWA, 12 digits)
 *   buildMSISDN("2250701234567", "+225") → "2250701234567" ✓ (already full)
 */
export function buildMSISDN(phoneNumber: string, dialCode?: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!dialCode) return digits;

  const countryDigits = dialCode.replace(/\D/g, "");

  // Already in international format (starts with country code and long enough)
  if (digits.startsWith(countryDigits) && digits.length > countryDigits.length + 6) {
    return digits;
  }

  // Prepend country code — preserve all local digits including leading 0
  return `${countryDigits}${digits}`;
}

/**
 * Get the best provider for a country + method slug (STATIC FALLBACK only).
 * Always prefer client.predictProvider() for accuracy.
 */
export function getProviderForCountry(countryCode: string, methodSlug: string): string | null {
  const providers = COUNTRY_TO_PAWAPAY_PROVIDER[countryCode.toUpperCase()] ?? [];
  if (providers.length === 0) return null;

  const slug = methodSlug.toLowerCase();
  if (slug.includes("orange"))   return providers.find(p => p.startsWith("ORANGE_"))   ?? providers[0];
  if (slug.includes("mtn"))      return providers.find(p => p.startsWith("MTN_"))       ?? providers[0];
  if (slug.includes("wave"))     return providers.find(p => p.startsWith("WAVE_"))      ?? providers[0];
  if (slug.includes("moov"))     return providers.find(p => p.startsWith("MOOV_"))      ?? providers[0];
  if (slug.includes("airtel"))   return providers.find(p => p.startsWith("AIRTEL_"))    ?? providers[0];
  if (slug.includes("mpesa") || slug.includes("m-pesa")) return providers.find(p => p.startsWith("MPESA_")) ?? providers[0];
  if (slug.includes("vodafone")) return providers.find(p => p.startsWith("VODAFONE_"))  ?? providers[0];
  if (slug.includes("free"))     return providers.find(p => p.startsWith("FREE_"))      ?? providers[0];
  if (slug.includes("tmoney"))   return providers.find(p => p.startsWith("TMONEY_"))    ?? providers[0];
  if (slug.includes("flooz"))    return providers.find(p => p.startsWith("FLOOZ_"))     ?? providers[0];
  if (slug.includes("expresso")) return providers.find(p => p.startsWith("EXPRESSO_")) ?? providers[0];

  return providers[0];
}

/**
 * Verify the Content-Digest header sent by PawaPay in callbacks.
 * Format: "sha-256=:base64hash:" or "sha-512=:base64hash:"
 *
 * Returns true if digest matches or if header is absent (digest not required unless enabled in dashboard).
 * Returns false if header is present but digest does NOT match (possible tampering).
 */
export function verifyContentDigest(rawBody: string, contentDigestHeader: string | undefined): boolean {
  if (!contentDigestHeader) return true; // Not signed — accept (warn in caller)

  const match = contentDigestHeader.match(/^(sha-256|sha-512)=:([A-Za-z0-9+/=]+):$/);
  if (!match) return false;

  const [, alg, expectedB64] = match;
  const hashAlg = alg === "sha-512" ? "sha512" : "sha256";

  const actual = createHash(hashAlg).update(rawBody, "utf8").digest("base64");
  return actual === expectedB64;
}
