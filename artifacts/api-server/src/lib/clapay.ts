/**
 * Clapay / NoWallet V3 — Payment API Client
 * Docs: NoWallet V3 / Clapay API
 *
 * Auth: Bearer token (API key from Clapay dashboard)
 * Base URL: configurable — default https://api.clapay.africa
 *
 * Flow:
 *  1. POST /nowallet/api/init/payment  → receive signature + payment_url
 *  2. Store signature as tracking ID, wait for webhook callback
 *  3. Webhook: POST /api/wallet/clapay/webhook → credit user on COMPLETED
 *  4. Cancel: POST /nowallet/api/destroyer/signature (if needed)
 */

export interface ClapayPaymentRequest {
  transaction_id: string;             // Our UUID — echoed back in webhook
  additional_infos: {
    customer_email?: string;
    customer_lastname?: string;
    customer_firstname?: string;
    customer_phone?: string;
  };
  amount: number;
  callback_url: string;               // Our webhook URL
  return_url: string;                 // Redirect after payment
  country_code: string;               // ISO alpha-2 (CI, CM, SN…)
  operators_code: string[];           // ["OM"], ["MTN"], ["WAVE"], etc.
  method: "MERCHANT" | "CASHIN";
  tunnel: "CHECKOUTPAGE" | "DIRECT";
  operator_otp?: string;
}

export interface ClapayPaymentResponse {
  country: string;
  currency: string;
  signature: string;                  // Clapay transaction signature (tracking ID)
  available_operator: string[];
  authorized_operator: string[];
  payment_url: string;                // Hosted payment page URL (CHECKOUTPAGE tunnel)
  payment_otp?: string;
}

export interface ClapayWebhookPayload {
  status: string;                     // "COMPLETED", "FAILED", "PENDING", etc.
  transaction_id: string;             // Our transaction_id echoed back
  additional_infos: {
    customer_email?: string;
    customer_lastname?: string;
    customer_firstname?: string;
    customer_phone?: string;
  };
  amount: number | string;
  currency: string;
  fee_percentage: number | string;
  fee_value: number | string;
  balance: number | string;
  balance_before: number | string;
  balance_after: number | string;
  transaction_method: string;
  transaction_phone_number: string;
  transaction_dial_code: string;
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
  codeoperator: string;
  logo: string;
  code: {
    MERCHANT: string;
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

export interface ClapayPaymentLimit {
  max_amount: number;
  min_amount: number;
  method: string;
  country: string;
}

export interface ClapayTransactionStatus {
  status: string;               // "COMPLETED", "FAILED", "PENDING", "CANCELLED", etc.
  transaction_id?: string;      // Our UUID we sent
  signature?: string;           // Clapay's signature for this transaction
  amount?: number | string;
  currency?: string;
  transaction_date?: string;
  transaction_phone_number?: string;
  transaction_service_name?: string;
  additional_infos?: {
    customer_phone?: string;
    customer_firstname?: string;
    customer_lastname?: string;
    customer_email?: string;
  };
}

/* ─────────────────────────────────────────────────────────────────
 * Operator slug → Clapay operator code mapping
 * ─────────────────────────────────────────────────────────────── */
export const METHOD_TO_CLAPAY_OPERATOR: Record<string, string> = {
  orange: "OM",
  mtn: "MTN",
  wave: "WAVE",
  moov: "MOOV",
  free: "FREE",
  expresso: "EXPRESSO",
  airtel: "AIRTEL",
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
 * Clapay Client
 * ─────────────────────────────────────────────────────────────── */
export class ClapayClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl = "https://api.clapay.africa") {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params && Object.keys(params).length > 0) {
      url += "?" + new URLSearchParams(params).toString();
    }

    const res = await fetch(url, {
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
      const errMsg = typeof json === "object" && json !== null
        ? ((json as Record<string, unknown>).message ?? JSON.stringify(json))
        : text;
      throw new Error(`Clapay ${res.status}: ${errMsg}`);
    }

    return json as T;
  }

  /**
   * Initiate a Mobile Money payment.
   * Returns a signature (tracking ID) and optionally a payment_url for CHECKOUTPAGE tunnel.
   */
  async initiatePayment(params: ClapayPaymentRequest): Promise<ClapayPaymentResponse> {
    return this.request<ClapayPaymentResponse>("/nowallet/api/init/payment", "POST", params);
  }

  /**
   * Cancel a pending payment by signature.
   */
  async cancelPayment(signature: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/nowallet/api/destroyer/signature", "POST", { signature });
  }

  /**
   * Get merchant balance for a specific country.
   */
  async getBalance(country: string): Promise<ClapayBalance> {
    return this.request<ClapayBalance>(`/nowallet/api/check/transactions/single/balances/${country}`);
  }

  /**
   * Get all countries supported by Clapay.
   */
  async getCountries(country?: string): Promise<ClapayCountry[]> {
    const params: Record<string, string> = {};
    if (country) params.country = country;
    const result = await this.request<ClapayCountry | ClapayCountry[]>("/nowallet/api/pays/données", "GET", undefined, params);
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Get available operators for a country.
   */
  async getOperators(country: string): Promise<ClapayOperator[]> {
    const result = await this.request<ClapayOperator | ClapayOperator[]>(
      "/nowallet/api/opérateurs/données", "GET", undefined, { country }
    );
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Get transaction fees for a country.
   */
  async getFees(country: string): Promise<ClapayFees[]> {
    const result = await this.request<ClapayFees | ClapayFees[]>(
      "/nowallet/api/fees/by/country", "GET", undefined, { country }
    );
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Get payment limits for a country.
   */
  async getPaymentLimits(country: string): Promise<ClapayPaymentLimit[]> {
    const result = await this.request<ClapayPaymentLimit | ClapayPaymentLimit[]>(
      "/nowallet/api/limitation/paiement", "GET", undefined, { country }
    );
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Check the status of a specific transaction by its signature.
   * Signature = the value returned by Clapay in the initiatePayment response.
   * Used for reconciliation of pending transactions when webhook is missed.
   */
  async getTransactionStatus(signature: string): Promise<ClapayTransactionStatus | null> {
    try {
      const result = await this.request<ClapayTransactionStatus>(
        `/nowallet/api/check/transactions/single/signature/${signature}`
      );
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Check the status of a transaction by our transaction_id (the UUID we sent).
   * Some Clapay deployments support this endpoint.
   */
  async getTransactionByExternalId(transactionId: string): Promise<ClapayTransactionStatus | null> {
    try {
      const result = await this.request<ClapayTransactionStatus>(
        `/nowallet/api/check/transactions/single/transaction_id/${transactionId}`
      );
      return result;
    } catch {
      return null;
    }
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
