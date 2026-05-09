/**
 * PawaPay API client
 * Docs: https://docs.pawapay.io/
 * Sandbox: https://api.sandbox.pawapay.io/
 * Production: https://api.pawapay.io/
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
    rejectionDescription: string;
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

/* ── Mobile Money correspondent mapping by country ISO code ── */
export const COUNTRY_TO_PAWAPAY_CORRESPONDENT: Record<string, string[]> = {
  CI: ["ORANGE_CI", "MTN_MOMO_CIV", "MOOV_CI"],
  SN: ["ORANGE_SN", "WAVE_SN", "FREE_SN"],
  CM: ["MTN_MOMO_CMR", "ORANGE_CMR"],
  GH: ["MTN_MOMO_GHA", "VODAFONE_GHA", "AIRTELTIGO_GHA"],
  NG: ["MTN_MOMO_NGA", "AIRTEL_NGA"],
  KE: ["MPESA_KEN", "AIRTEL_KEN"],
  TZ: ["MPESA_TZA", "VODACOM_TZA", "AIRTEL_TZA", "TIGO_TZA"],
  UG: ["MTN_MOMO_UGA", "AIRTEL_UGA"],
  MZ: ["MPESA_MOZ", "VODACOM_MOZ"],
  ZM: ["MTN_MOMO_ZMB", "AIRTEL_ZMB"],
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

  async predictCorrespondent(msisdn: string): Promise<{ correspondent: string; country: string } | null> {
    try {
      const result = await this.request<{ correspondent?: string; country?: string }>("/predict-correspondent", "POST", { msisdn });
      if (result.correspondent) return { correspondent: result.correspondent, country: result.country ?? "" };
      return null;
    } catch {
      return null;
    }
  }

  async checkAvailability(): Promise<{ status: string; country?: string }> {
    try {
      await this.getActiveCorrespondents();
      return { status: "ok" };
    } catch (e) {
      return { status: "error" };
    }
  }
}

export function generateDepositId(): string {
  return crypto.randomUUID();
}

export function normalizeMSISDN(phone: string): string {
  const cleaned = phone.replace(/[\s\-().+]/g, "");
  if (!cleaned.startsWith("+") && !cleaned.startsWith("00")) {
    return cleaned;
  }
  return cleaned.replace(/^00/, "").replace(/^\+/, "");
}

export function getCorrespondentForCountry(countryCode: string, methodSlug: string): string | null {
  const correspondents = COUNTRY_TO_PAWAPAY_CORRESPONDENT[countryCode.toUpperCase()] ?? [];
  if (correspondents.length === 0) return null;

  const slug = methodSlug.toLowerCase();
  if (slug.includes("orange")) return correspondents.find(c => c.includes("ORANGE")) ?? correspondents[0];
  if (slug.includes("mtn")) return correspondents.find(c => c.includes("MTN")) ?? correspondents[0];
  if (slug.includes("wave")) return correspondents.find(c => c.includes("WAVE")) ?? correspondents[0];
  if (slug.includes("moov")) return correspondents.find(c => c.includes("MOOV")) ?? correspondents[0];
  if (slug.includes("airtel")) return correspondents.find(c => c.includes("AIRTEL")) ?? correspondents[0];

  return correspondents[0];
}

/* ── Currency mapping by country ISO ── */
export const COUNTRY_CURRENCY: Record<string, string> = {
  CI: "XOF", SN: "XOF", BJ: "XOF", BF: "XOF", ML: "XOF", NE: "XOF", TG: "XOF", GW: "XOF",
  CM: "XAF", GA: "XAF", CG: "XAF", TD: "XAF", MR: "MRO",
  GH: "GHS", NG: "NGN", KE: "KES", TZ: "TZS", UG: "UGX",
  MZ: "MZN", ZM: "ZMW", RW: "RWF", MW: "MWK", ZW: "ZWL",
  MG: "MGA", GN: "GNF", ZA: "ZAR", AO: "AOA", ET: "ETB",
  EG: "EGP", MA: "MAD",
};
