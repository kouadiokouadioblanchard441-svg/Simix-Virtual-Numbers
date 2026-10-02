import { createHash } from "node:crypto";
import { logger } from "./logger";

/**
 * Clapay / NoWallet V3 — Payment API Client
 * Docs: NoWallet V3 / Clapay API (OAS 3.0)
 *
 * Auth: Bearer token (API key from Clapay dashboard)
 * Base URL: configurable — defaults to https://nw-api.clapay.app/nowallet/api
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
 * The NoWallet payment API supports signature status checks and cancellation.
 *
 * IMPORTANT:
 *  - All GET endpoints use the query parameter "country" for country code.
 *  - API mode sends exactly one operator `codeoperator` short code.
 *  - The signature returned on payment init MUST be stored — it is the primary
 *    key for any future reconciliation or cancellation.
 */

export interface ClapayPaymentRequest {
  transaction_id: string;             // Our UUID — echoed back in webhook
  additional_infos: {
    customer_email?: string;
    customer_lastname?: string;
    customer_firstname?: string;
    customer_phone: string;
  };
  amount: number;                     // Integer amount in local currency (floor before sending)
  callback_url: string;               // Our webhook URL
  return_url: string;                 // Redirect after payment
  country_code: string;               // ISO alpha-2 (CI, CM, SN…)
  operators_code: [string];           // Exactly one active operator codeoperator short code
  method: "MERCHANT";
  tunnel: "API";
  operator_otp?: string;
}

export interface ClapayPaymentResponse {
  country: string;
  currency: string;
  signature: string;                  // Clapay transaction signature — MUST be stored
  status_payment: string;
  message?: string;
  observation_error?: string;
  payment_url_operator?: string;      // Optional operator deep link (not hosted checkout)
  payment_url?: string;               // Also documented for Wave completion in the API tunnel
  payment_otp?: string;
}

/** Call only for API-tunnel responses: payment_url is an operator completion link here. */
export function getClapayOperatorPaymentUrl(response: ClapayPaymentResponse): string | null {
  for (const raw of [response.payment_url_operator, response.payment_url]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const url = new URL(raw.trim());
      if (url.protocol === "https:" && !url.username && !url.password) return url.href;
    } catch { /* Try the other documented field if this candidate is invalid. */ }
  }
  return null;
}

export interface ClapayPaymentStatusResponse {
  status: string;
  transaction_id?: string;
  signature?: string;
  amount?: number | string;
  currency?: string;
  method?: string;
  country?: string;
  [key: string]: unknown;
}

export function isClapayCancellationAcknowledged(response: {
  success?: boolean;
  status?: string;
  status_payment?: string;
  message?: string;
}): boolean {
  const status = String(response.status ?? response.status_payment ?? "").toUpperCase();
  return response.success === true || ["SUCCESS", "CANCELLED", "CANCELED", "DESTROYED"].includes(status);
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
  codeoperator: string;               // Short identifier sent in operators_code (e.g. "MTN", "OM")
  logo: string;
  code?: {
    MERCHANT?: string | null;
    CASHIN?: string | null;
    CASHOUT?: string | null;
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

export function clapayOperatorRequiresOtp(operator: ClapayOperator): boolean {
  return operator.otpstarter?.MERCHANT === true;
}

/**
 * The live catalogue may omit legacy long-code metadata entirely. The API
 * uses codeoperator, not code.MERCHANT/CASHIN, for initiation. Missing metadata
 * is not a denial; explicit disabled metadata and inactive operators still
 * block submission. The provider remains authoritative for payment outcome.
 */
export function clapayOperatorSupportsMethod(
  operator: ClapayOperator,
  method: "MERCHANT" | "CASHIN" | "CASHOUT",
): boolean {
  if (operator.active !== true || typeof operator.codeoperator !== "string" || !operator.codeoperator.trim()) return false;
  if (!operator.code || !Object.hasOwn(operator.code, method)) return true;
  const capability = operator.code[method];
  return typeof capability === "string"
    && capability.trim().length > 0
    && capability.trim().toLowerCase() !== "none";
}

// Verified local brand names, not fallback payment identifiers. Resolution
// still requires an eligible operator returned by this country's catalogue.
// https://www.at.com.gh/airteltigo-money/home
// https://moov-africa.tg/moov-money/application-mobile-moov-money-flooz/
const CLAPAY_OPERATOR_BRANDS: Record<string, readonly (readonly string[])[]> = {
  GH: [["airtel", "airtelmoney", "airteltigo", "airteltigomoney", "atmoney"]],
  TG: [["flooz", "moov", "moovmoney", "moovafrica", "moovmoneyflooz"]],
};

/** Shared country-scoped matching, including unavailable entries for diagnostics. */
export function findClapayOperator(
  operators: ClapayOperator[], country: string, methodSlug: string,
): ClapayOperator | null {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const slug = normalize(methodSlug);
  if (!slug) return null;
  const codeOf = (op: ClapayOperator) => normalize(typeof op.codeoperator === "string" ? op.codeoperator : "");
  const nameOf = (op: ClapayOperator) => normalize(typeof op.name === "string" ? op.name : "");
  const isOrangeAlias = (op: ClapayOperator) => codeOf(op) === "om"
    && (slug.includes("orange") || slug === "om");
  const brandAliases = CLAPAY_OPERATOR_BRANDS[country.trim().toUpperCase()]
    ?.find(aliases => aliases.includes(slug));
  return operators.find(op => codeOf(op) === slug)
    ?? operators.find(isOrangeAlias)
    ?? operators.find(op => {
      const code = codeOf(op);
      const name = nameOf(op);
      return (name.length > 0 && (slug === name || slug.includes(name) || name.includes(slug)))
        || (code.length > 2 && (slug.startsWith(code) || slug.endsWith(code)));
    })
    ?? operators.find(op => brandAliases?.includes(codeOf(op)) || brandAliases?.includes(nameOf(op)))
    ?? null;
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

export interface ClapayCashoutRequest {
  transaction_id: string;
  additional_infos: {
    customer_phone?: string;
    customer_firstname?: string;
    customer_lastname?: string;
    customer_email?: string;
  };
  amount: number;              // Integer amount in local currency
  callback_url: string;
  return_url: string;
  country_code: string;        // ISO alpha-2 (CI, CM, SN…)
  operators_code: [string];    // codeoperator short code from GET /operators/data
  method: "CASHIN";
  tunnel: "API";
  operator_otp?: string;
}

export interface ClapayCashoutResponse {
  signature: string;
  currency: string;
  country: string;
  status?: string;
  status_payment?: string;
  message?: string;
}

/**
 * Format a local phone number + dial code into the E.164-style string
 * Clapay expects for `customer_phone`.
 *
 * Some African countries (Ivory Coast since 2021, Benin since 2021) have
 * 10-digit local numbers where the leading 0 IS part of the subscriber
 * number — NOT a trunk prefix. Stripping it there produces an invalid
 * number one digit too short (e.g. "+225701234567" instead of
 * "+2250701234567").
 *
 * Most OTHER countries (Cameroon, Senegal, Burkina Faso, Mali, Togo,
 * Guinea, Niger…) use a classic trunk prefix "0" that must be REMOVED
 * before prepending the country code — keeping it produces a number one
 * digit too LONG, which Clapay rejects with "Phone number is not valid."
 * (e.g. "0691234567" + "+237" must become "+237691234567", not
 * "+2370691234567").
 *
 * Rule applied here:
 *  1. If the number already starts with the country digits → already E.164, return as-is.
 *  2. Else if country is in LOCAL_FORMAT_ONLY_COUNTRIES → return the local number as-is
 *     (with leading 0 preserved). Clapay CI/BJ rejects E.164 format and expects
 *     the raw 10-digit local number (e.g. "0595857098"), confirmed by live testing.
 *  3. Else if country is in KEEP_LEADING_ZERO_COUNTRIES → prepend country code, keep the 0.
 *  4. Else → strip a single leading trunk "0" (if present) before prepending the country code.
 *
 * Examples:
 *   formatClapayPhone("0595857098",    "+225", "CI") → "0595857098"      (CI — local only, no prefix)
 *   formatClapayPhone("0691234567",    "+237", "CM") → "+237691234567"   (CM — trunk 0 stripped)
 *   formatClapayPhone("691234567",     "+237", "CM") → "+237691234567"   (no leading 0)
 *   formatClapayPhone("2250701234567", "+225")        → "+2250701234567" (already E.164)
 *   formatClapayPhone("+2250701234567","+225")        → "+2250701234567" (already E.164 with +)
 */

/* Countries where Clapay expects the raw local number (no country code prefix).
 * Confirmed live: CI rejects +2250595857098 with ERROR_PHONE_NUMBER_LENGTH_IS_TOO_SHORT
 * but accepts 0595857098 (10-digit local format). */
const LOCAL_FORMAT_ONLY_COUNTRIES = new Set(["CI", "BJ"]);

const KEEP_LEADING_ZERO_COUNTRIES = new Set(["CI", "BJ"]);

export function formatClapayPhone(phoneNumber: string, dialCode?: string, countryCode?: string): string {
  const countryDigits = (dialCode ?? "").replace(/\D/g, "");
  let localDigits = phoneNumber.replace(/\D/g, "");

  if (!countryDigits) return `+${localDigits}`;

  // If the number already includes the country code prefix, strip it back to local
  // for countries that want local format only.
  const cc = (countryCode ?? "").toUpperCase();

  if (LOCAL_FORMAT_ONLY_COUNTRIES.has(cc)) {
    // Strip country prefix if accidentally included, then return local with leading 0.
    if (localDigits.startsWith(countryDigits)) {
      localDigits = localDigits.slice(countryDigits.length);
    }
    // Ensure leading 0 is present
    if (!localDigits.startsWith("0")) {
      localDigits = "0" + localDigits;
    }
    return localDigits;
  }

  // If the number already includes the country code prefix, avoid doubling it.
  if (localDigits.startsWith(countryDigits)) {
    return `+${localDigits}`;
  }

  const keepZero = KEEP_LEADING_ZERO_COUNTRIES.has(cc);

  // Strip a single leading trunk "0" for countries where it is NOT part of the
  // subscriber number (default behaviour — safest for the majority of Clapay's
  // West/Central Africa coverage).
  if (!keepZero && localDigits.startsWith("0")) {
    localDigits = localDigits.slice(1);
  }

  return `+${countryDigits}${localDigits}`;
}

/* ─────────────────────────────────────────────────────────────────
 * Terminal statuses — any of these means the transaction is DONE
 * ─────────────────────────────────────────────────────────────── */
export const CLAPAY_TERMINAL_SUCCESS = new Set(["SUCCESS", "SUCCESSFUL", "COMPLETED"]);
export const CLAPAY_TERMINAL_FAILURE = new Set([
  "FAILED", "CANCELLED", "CANCELED", "REJECTED", "REFUSED", "DECLINED", "TIMEOUT", "EXPIRED",
]);

export function normalizeClapayStatus(status: string): "completed" | "failed" | "pending" {
  const s = status.trim().toUpperCase();
  if (CLAPAY_TERMINAL_SUCCESS.has(s)) return "completed";
  if (CLAPAY_TERMINAL_FAILURE.has(s)) return "failed";
  return "pending";
}

export function isClapayTerminalStatus(status: string): boolean {
  return normalizeClapayStatus(status) !== "pending";
}

export function mapClapayStatusToDb(status: string): "completed" | "failed" | "pending" {
  return normalizeClapayStatus(status);
}

/* ─────────────────────────────────────────────────────────────────
 * Gateway metadata stored in transactions.gateway_meta (JSON)
 * ─────────────────────────────────────────────────────────────── */
export interface ClapayGatewayMeta {
  clapaySignature?: string;
  clapayCurrency?: string;
  clapayCountry?: string;
  localAmount?: number;
  operatorCode?: string;
  trackingId?: string;
  method?: "MERCHANT";
  initiatedAt?: string;
  gatewayConfigId?: string | null;
  operatorPaymentUrl?: string | null;
  paymentOtp?: string | null;
  message?: string | null;
}

export function serializeClapayMeta(meta: ClapayGatewayMeta): string {
  return JSON.stringify(meta);
}

export function parseClapayMeta(raw: string | null | undefined): ClapayGatewayMeta | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as ClapayGatewayMeta
      : null;
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
  private requestTimeoutMs: number;

  /** Internal cache partition only; never return this fingerprint to the panel. */
  getCatalogueCacheKey(): string {
    return createHash("sha256").update(JSON.stringify([this.baseUrl, this.token])).digest("hex");
  }

  constructor(token: string, baseUrl = "https://nw-api.clapay.app/nowallet/api", requestTimeoutMs = 30_000) {
    this.token = token;
    this.requestTimeoutMs = Math.min(30_000, Math.max(500, requestTimeoutMs));
    // Normalize: strip trailing slash AND /nowallet/api suffix so we always have the root URL
    // (paths in each method already include /nowallet/api/...)
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

    /* Log outgoing request — body redacted to avoid leaking payment data */
    logger.debug({ method, path }, "[Clapay] → outgoing request");

    const start = Date.now();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    const elapsed = Date.now() - start;

    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }

    if (!res.ok) {
      const errData = (typeof json === "object" && json !== null) ? json as Record<string, unknown> : {};
      const errMsg = String(errData.message ?? errData.error ?? text).slice(0, 200);
      logger.error({ method, path, status: res.status, elapsed, errMsg }, "[Clapay] ✗ HTTP error");
      const err = new Error(`Clapay ${res.status}: ${errMsg}`);
      (err as NodeJS.ErrnoException).code = String(res.status);
      throw err;
    }

    logger.info({ method, path, status: res.status, elapsed }, "[Clapay] ✓ request complete");

    if (elapsed > 5000) {
      logger.warn({ method, path, elapsed }, "[Clapay] slow response");
    }

    return json as T;
  }

  /**
   * Initiate a Mobile Money payment.
   * Returns the NoWallet signature and optional operator deep-link/OTP data.
   *
   * IMPORTANT:
   *  - amount must be a whole integer (floor before calling)
   *  - operators_code contains exactly one codeoperator short code (e.g. ["OM"])
   *  - Store `signature` in transactions.gateway_meta — required for cancellation
   */
  async initiatePayment(params: ClapayPaymentRequest): Promise<ClapayPaymentResponse> {
    /* Ensure amount is a whole integer — some operators reject decimals */
    const safeParams = { ...params, amount: Math.floor(params.amount) };
    const response = await this.request<ClapayPaymentResponse & { data?: ClapayPaymentResponse }>(
      "/nowallet/api/init/payment", "POST", safeParams,
    );
    return !response.signature && response.data?.signature ? response.data : response;
  }

  /** POST /nowallet/api/check/status/payment */
  async checkPaymentStatus(signature: string): Promise<ClapayPaymentStatusResponse> {
    try {
      const response = await this.request<ClapayPaymentStatusResponse | { data: ClapayPaymentStatusResponse }>(
        "/nowallet/api/check/status/payment", "POST", { signature },
      );
      const wrapped = (response as { data?: ClapayPaymentStatusResponse }).data;
      return wrapped ?? response as ClapayPaymentStatusResponse;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "404") {
        return { status: "UNKNOWN", signature };
      }
      throw error;
    }
  }

  /**
   * Cancel a pending payment by signature.
   * Docs: POST /nowallet/api/destroy/signature
   */
  async cancelPayment(signature: string): Promise<{ success?: boolean; status?: string; status_payment?: string; message?: string }> {
    return this.request<{ success?: boolean; status?: string; status_payment?: string; message?: string }>("/nowallet/api/destroy/signature", "POST", { signature });
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
   * Returns the dynamic operator catalogue including MERCHANT capability.
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
   * the matching one by name/codeoperator. Never invents a fallback code.
   *
   * @param country  ISO alpha-2 country code (e.g. "CI", "CM")
   * @param methodSlug  e.g. "orange", "mtn", "wave"
   */
  async resolveOperator(country: string, methodSlug: string): Promise<ClapayOperator | null> {
    const operators = await this.getOperators(country);
    const eligible = operators.filter(op => clapayOperatorSupportsMethod(op, "MERCHANT"));
    return findClapayOperator(eligible, country, methodSlug);
  }

  async resolveOperatorCode(country: string, methodSlug: string): Promise<string | null> {
    return (await this.resolveOperator(country, methodSlug))?.codeoperator ?? null;
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

  /**
   * Initiate a merchant payout (merchant → mobile money recipient).
   * NoWallet routes payouts through init/payment with method CASHIN, API
   * tunnel, and the catalogue operator's short codeoperator value.
   *
   * @param params ClapayCashoutRequest
   */
  async initiateCashout(params: ClapayCashoutRequest): Promise<ClapayCashoutResponse> {
    const safeParams = { ...params, amount: Math.floor(params.amount) };
    return this.request<ClapayCashoutResponse>("/nowallet/api/init/payment", "POST", safeParams);
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
