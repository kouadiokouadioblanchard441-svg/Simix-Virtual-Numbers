/**
 * Clapay / NoWallet V3 — Payment API Client
 * Docs: NoWallet V3 / Clapay API (OAS 3.0)
 *
 * Auth: Bearer token (API key from Clapay dashboard)
 * Base URL: configurable — defaults to https://nw-api.clapay.app
 *
 * Documented endpoints (used by this client):
 *  POST /nowallet/api/init/payment                                   ← initiate payment
 *  POST /nowallet/api/destroy/signature                              ← cancel payment
 *  GET  /nowallet/api/check/transactions/single/balances/{country}  ← merchant balance
 *  GET  /nowallet/api/check/transactions/global/balances/{currency} ← global balance
 *  GET  /nowallet/api/countries/data                                 ← supported countries  (query: country)
 *  GET  /nowallet/api/operators/data                                 ← operators by country (query: country)
 *  GET  /nowallet/api/fees/by/country                                ← fees by country      (query: country)
 *  GET  /nowallet/api/limitation/paiement                            ← payment limits       (query: country)
 *
 * NOTE: There is NO transaction status polling endpoint in the official V3 API.
 *  Payment confirmation is done exclusively via webhook callbacks (callback_url).
 *  If a webhook is missed, the only recovery is contacting Clapay support.
 *
 * IMPORTANT:
 *  - All GET endpoints use the query parameter "country" for country code.
 *  - operators_code[] must contain the operator's `code.MERCHANT` value (from
 *    GET /operators/data), NOT the `codeoperator` short code.
 *  - The signature returned on payment init MUST be stored — it is the primary
 *    key for any future reconciliation or cancellation.
 */

export interface ClapayPaymentRequest {
  transaction_id: string;             // Our UUID — echoed back in webhook
  additional_infos: {
    customer_email?: string;
    customer_lastname?: string;
    customer_firstname?: string;
    customer_phone?: string;
  };
  amount: number;                     // Integer amount in local currency (floor before sending)
  callback_url: string;               // Our webhook URL
  return_url: string;                 // Redirect after payment
  country_code: string;               // ISO alpha-2 (CI, CM, SN…)
  operators_code: string[];           // code.MERCHANT values from GET /operators/data (e.g. ["WAVECI"], ["MTNCI"])
  method: "MERCHANT" | "CASHIN";
  tunnel: "CHECKOUTPAGE" | "DIRECT";
  operator_otp?: string;
}

export interface ClapayPaymentResponse {
  country: string;
  currency: string;
  signature: string;                  // Clapay transaction signature — MUST be stored
  available_operator: string[];
  authorized_operator: string[];
  payment_url: string;                // Hosted payment page URL (CHECKOUTPAGE tunnel)
  payment_otp?: string;
}

export interface ClapayWebhookPayload {
  status: string;                     // "COMPLETED", "FAILED", "PENDING", "CANCELLED", "TIMEOUT", "EXPIRED"
  transaction_id: string;             // Our transaction_id echoed back
  additional_infos: {
    customer_email?: string;
    customer_lastname?: string;
    customer_firstname?: string;
    customer_phone?: string;
  };
  amount: number | string;            // LOCAL currency amount — do NOT use to credit (use stored tx.amount in XOF)
  currency: string;
  fee_percent: number | string;
  fee_value: number | string;
  balance: number | string;
  balance_before: number | string;
  balance_after: number | string;
  transaction_method: string;
  transaction_phone_number: string;
  transaction_dialcode: string;
  signature: string;                  // Clapay signature
  transaction_date: string;
  transaction_country_code: string;
  transaction_service_name: string;
  transaction_observation: string;
}

export interface ClapayCountry {
  code: string;
  name: string;
  indicatif: string;
  currency: string;
  phone_length: number;
}

export interface ClapayOperator {
  name: string;
  codeoperator: string;               // Short identifier (e.g. "MTN", "OM") — for display/matching only
  logo: string;
  code: {
    MERCHANT: string;                 // ← use this in operators_code[] for MERCHANT payments
    CASHIN: string;
    CASHOUT: string;
  };
  startwith: string[];
  otpstarter: {
    MERCHANT: boolean;
    CASHIN: boolean;
    CASHOUT: boolean;
  };
  active: boolean;
  secure: {
    MERCHANT: boolean;
    CASHIN: boolean;
    CASHOUT: boolean;
  };
  instruction: Record<string, unknown>;
}

export interface ClapayFees {
  fee_cashin: number;
  fee_cashout: number;
  fee_merchant: number;
  country: string;
  currency: string;
  operator: string;
  rangefees: Array<{ min: number; max: number; fee: number }>;
}

export interface ClapayBalance {
  balance: number;
  deposit: number;
  withdrawal: number;
  potentialBalance: number;
  possibleWithdrawal: number;
  update: string;
}

export interface ClapayGlobalBalance {
  bglobal: ClapayBalance;
  bcountry: ClapayBalance[];
}

export interface ClapayPaymentLimit {
  max_amount: number;
  min_amount: number;
  method: string;
  country: string;
}

/* ─────────────────────────────────────────────────────────────────
 * Operator slug → Clapay operator code mapping (fallback)
 * Used when dynamic resolution from /opérateurs/données fails.
 * These are the `codeoperator` values as defined in the Clapay API.
 * ─────────────────────────────────────────────────────────────── */
export const METHOD_TO_CLAPAY_OPERATOR: Record<string, string> = {
  orange: "OM",
  "orange money": "OM",
  mtn: "MTN",
  "mtn money": "MTN",
  wave: "WAVE",
  moov: "MOOV",
  "moov africa": "MOOV",
  free: "FREE",
  "free money": "FREE",
  expresso: "EXPRESSO",
  airtel: "AIRTEL",
  "airtel money": "AIRTEL",
  mpesa: "MPESA",
  "m-pesa": "MPESA",
  tmoney: "TMONEY",
  flooz: "FLOOZ",
  mvola: "MVOLA",
  vodafone: "VODAFONE",
  "mobile money": "MTN",
  "mobile": "MTN",
};

export function getOperatorCodeForMethod(methodSlug: string): string | null {
  const slug = methodSlug.toLowerCase();
  for (const [keyword, code] of Object.entries(METHOD_TO_CLAPAY_OPERATOR)) {
    if (slug.includes(keyword)) return code;
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────
 * Terminal statuses — any of these means the transaction is DONE
 * ─────────────────────────────────────────────────────────────── */
export const CLAPAY_TERMINAL_SUCCESS = new Set(["COMPLETED"]);
export const CLAPAY_TERMINAL_FAILURE = new Set([
  "FAILED", "CANCELLED", "REJECTED", "TIMEOUT", "EXPIRED",
]);

export function isClapayTerminalStatus(status: string): boolean {
  const s = status.toUpperCase();
  return CLAPAY_TERMINAL_SUCCESS.has(s) || CLAPAY_TERMINAL_FAILURE.has(s);
}

export function mapClapayStatusToDb(status: string): "completed" | "failed" | "pending" {
  const s = status.toUpperCase();
  if (CLAPAY_TERMINAL_SUCCESS.has(s)) return "completed";
  if (CLAPAY_TERMINAL_FAILURE.has(s)) return "failed";
  return "pending";
}

/* ─────────────────────────────────────────────────────────────────
 * Gateway metadata stored in transactions.gateway_meta (JSON)
 * ─────────────────────────────────────────────────────────────── */
export interface ClapayGatewayMeta {
  clapaySignature: string;
  clapayCurrency: string;
  clapayCountry: string;
  initiatedAt: string;
}

export function serializeClapayMeta(meta: ClapayGatewayMeta): string {
  return JSON.stringify(meta);
}

export function parseClapayMeta(raw: string | null | undefined): ClapayGatewayMeta | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClapayGatewayMeta;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────
 * Clapay Client
 * ─────────────────────────────────────────────────────────────── */
export class ClapayClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl = "https://nw-api.clapay.app") {
    this.token = token;
    // Normalize: strip trailing slash AND /nowallet/api suffix if accidentally included
    this.baseUrl = baseUrl.replace(/\/$/, "").replace(/\/nowallet\/api$/, "");
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    /* Use the URL constructor so non-ASCII path segments are correctly
     * percent-encoded by the runtime (e.g. é → %C3%A9).
     * We split on '/' and encode each segment individually so forward
     * slashes in the path are preserved. */
    const encoded = path
      .split("/")
      .map(seg => encodeURIComponent(decodeURIComponent(seg)))
      .join("/");
    const url = new URL(`${this.baseUrl}${encoded}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = this.buildUrl(path, params);

    /* Log outgoing request (body redacted in prod if sensitive) */
    console.log(`[Clapay] → ${method} ${url}${body ? ` body=${JSON.stringify(body).slice(0, 500)}` : ""}`);

    const start = Date.now();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),   // 30s hard timeout
    });
    const elapsed = Date.now() - start;

    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }

    if (!res.ok) {
      /* Log the full raw response so the error is visible in server logs */
      console.error(`[Clapay] ✗ HTTP ${res.status} on ${method} ${path} (${elapsed}ms) — body: ${text.slice(0, 2000)}`);
      const errData = (typeof json === "object" && json !== null) ? json as Record<string, unknown> : {};
      const errMsg = String(errData.message ?? errData.error ?? text).slice(0, 500);
      const err = new Error(`Clapay ${res.status}: ${errMsg}`);
      (err as NodeJS.ErrnoException).code = String(res.status);
      throw err;
    }

    console.log(`[Clapay] ✓ ${method} ${path} — ${res.status} (${elapsed}ms)`);

    if (elapsed > 5000) {
      console.warn(`[Clapay] Slow response: ${method} ${path} took ${elapsed}ms`);
    }

    return json as T;
  }

  /**
   * Initiate a Mobile Money payment.
   * Returns a signature (tracking ID) and optionally a payment_url for CHECKOUTPAGE tunnel.
   *
   * IMPORTANT:
   *  - amount must be a whole integer (floor before calling)
   *  - operators_code takes codeoperator short codes (e.g. ["OM"], ["MTN"])
   *  - Store `signature` in transactions.gateway_meta — required for cancellation
   */
  async initiatePayment(params: ClapayPaymentRequest): Promise<ClapayPaymentResponse> {
    /* Ensure amount is a whole integer — some operators reject decimals */
    const safeParams = { ...params, amount: Math.floor(params.amount) };
    return this.request<ClapayPaymentResponse>("/nowallet/api/init/payment", "POST", safeParams);
  }

  /**
   * Cancel a pending payment by signature.
   * Docs: POST /nowallet/api/destroy/signature
   */
  async cancelPayment(signature: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/nowallet/api/destroy/signature", "POST", { signature });
  }

  /**
   * Get merchant balance for a specific country.
   * Docs: GET /nowallet/api/check/transactions/single/balances/{country}
   */
  async getBalance(country: string): Promise<ClapayBalance> {
    return this.request<ClapayBalance>(
      `/nowallet/api/check/transactions/single/balances/${encodeURIComponent(country)}`,
    );
  }

  /**
   * Get global merchant balances by currency.
   * Docs: GET /nowallet/api/check/transactions/global/balances/{currency}
   */
  async getGlobalBalance(currency: string): Promise<ClapayGlobalBalance> {
    return this.request<ClapayGlobalBalance>(
      `/nowallet/api/check/transactions/global/balances/${encodeURIComponent(currency)}`,
    );
  }

  /**
   * Get all countries supported by Clapay.
   * Docs: GET /nowallet/api/countries/data — query param: "country"
   */
  async getCountries(country?: string): Promise<ClapayCountry[]> {
    const params: Record<string, string> = {};
    if (country) params.country = country;
    const result = await this.request<ClapayCountry | ClapayCountry[]>(
      "/nowallet/api/countries/data", "GET", undefined, params,
    );
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Get available operators for a country.
   * Docs: GET /nowallet/api/operators/data — query param: "country"
   * Returns operators with code.MERCHANT — this is what goes in operators_code[].
   */
  async getOperators(country: string): Promise<ClapayOperator[]> {
    const result = await this.request<ClapayOperator | ClapayOperator[]>(
      "/nowallet/api/operators/data", "GET", undefined, { country },
    );
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Resolve the correct operator code for a given method slug and country.
   * Dynamically fetches operators from Clapay for the country and finds
   * the matching one by name/codeoperator. Falls back to hardcoded mapping.
   *
   * @param country  ISO alpha-2 country code (e.g. "CI", "CM")
   * @param methodSlug  e.g. "orange", "mtn", "wave"
   */
  async resolveOperatorCode(country: string, methodSlug: string): Promise<string | null> {
    try {
      const operators = await this.getOperators(country);
      const slug = methodSlug.toLowerCase();

      /* Helper: return code.MERCHANT (what operators_code[] expects) */
      const merchantCode = (op: ClapayOperator): string =>
        op.code?.MERCHANT && op.code.MERCHANT !== "none" ? op.code.MERCHANT : op.codeoperator;

      /* 1. Exact codeoperator match (e.g. "wave" → codeoperator "WAVE") */
      const exactMatch = operators.find(op =>
        op.active && op.codeoperator.toLowerCase() === slug,
      );
      if (exactMatch) return merchantCode(exactMatch);

      /* 2. Name match (e.g. "orange" matches "ORANGE MONEY") */
      const nameMatch = operators.find(op =>
        op.active && (
          op.name.toLowerCase().includes(slug) ||
          slug.includes(op.codeoperator.toLowerCase()) ||
          op.codeoperator.toLowerCase().includes(slug)
        ),
      );
      if (nameMatch) return merchantCode(nameMatch);

      /* 3. Keyword match via hardcoded map (codeoperator lookup) */
      for (const [keyword, codeop] of Object.entries(METHOD_TO_CLAPAY_OPERATOR)) {
        if (slug.includes(keyword) || keyword.includes(slug)) {
          const kwMatch = operators.find(op =>
            op.active && op.codeoperator === codeop,
          );
          if (kwMatch) return merchantCode(kwMatch);
        }
      }

      /* Log available operators for debugging */
      console.warn(
        `[Clapay] No operator match for "${methodSlug}" in ${country}. Available: ${operators.map(o => `${o.codeoperator}(${o.name}) merchant=${o.code?.MERCHANT}`).join(", ")}`,
      );
    } catch (e) {
      console.warn(`[Clapay] resolveOperatorCode fetch failed — falling back to hardcoded map: ${(e as Error).message}`);
    }

    /* Fallback to hardcoded mapping (codeoperator values — last resort) */
    return getOperatorCodeForMethod(methodSlug);
  }

  /**
   * Get transaction fees for a country.
   * Docs: GET /nowallet/api/fees/by/country — query param: "country"
   */
  async getFees(country: string): Promise<ClapayFees[]> {
    const result = await this.request<ClapayFees | ClapayFees[]>(
      "/nowallet/api/fees/by/country", "GET", undefined, { country },
    );
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Get payment limits for a country.
   * Docs: GET /nowallet/api/limitation/paiement — query param: "country"
   */
  async getPaymentLimits(country: string): Promise<ClapayPaymentLimit[]> {
    const result = await this.request<ClapayPaymentLimit | ClapayPaymentLimit[]>(
      "/nowallet/api/limitation/paiement", "GET", undefined, { country },
    );
    return Array.isArray(result) ? result : [result];
  }
}

/* ─────────────────────────────────────────────────────────────────
 * Clapay deposit ID prefix — used to distinguish Clapay deposits
 * from PawaPay deposits in externalDepositId.
 * Format: "clapay:<uuid>"
 * ─────────────────────────────────────────────────────────────── */
export const CLAPAY_PREFIX = "clapay:";

export function makeClapayDepositId(uuid: string): string {
  return `${CLAPAY_PREFIX}${uuid}`;
}

export function isClapayDeposit(externalDepositId: string): boolean {
  return externalDepositId.startsWith(CLAPAY_PREFIX);
}

export function extractClapayTransactionId(externalDepositId: string): string {
  return externalDepositId.slice(CLAPAY_PREFIX.length);
}
