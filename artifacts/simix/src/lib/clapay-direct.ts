/* Helpers for direct (API mode) Clapay wallet payments. Never stores operatorOtp. */

export const PENDING_KEY = "simix_pending_deposit";

export interface PaymentOptions {
  gateway: string;
  requiresOtp: boolean;
  instruction: string | null;
  operatorCode: string | null;
}

export interface DirectAction {
  operatorPaymentUrl: string | null;
  paymentOtp: string | null;
  message: string | null;
}

export interface StoredPending extends DirectAction {
  depositId: string;
  paymentUrl: string | null; // legacy hosted checkout only
  methodSlug: string;
  methodName: string;
  methodColor: string;
  localAmount: number;
  currencyCode: string;
}

export function savePendingDeposit(data: StoredPending) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
export function loadPendingDeposit(): StoredPending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as StoredPending) : null;
  } catch { return null; }
}
export function clearPendingDeposit() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

/** Only https URLs are ever offered to the user. */
export function safeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}

export function asText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function toDirectAction(d: { operatorPaymentUrl?: unknown; paymentOtp?: unknown; message?: unknown } | Record<string, unknown> | null | undefined): DirectAction {
  return {
    operatorPaymentUrl: safeHttpsUrl(d?.operatorPaymentUrl),
    paymentOtp: asText(d?.paymentOtp),
    message: asText(d?.message),
  };
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function readError(res: Response, fallback: string): Promise<Error> {
  let msg = fallback;
  try {
    const j = await res.json() as { message?: string; error?: string };
    msg = j.message || j.error || fallback;
  } catch { /* ignore */ }
  return new Error(msg);
}

export async function fetchPaymentOptions(countryCode: string, methodSlug: string): Promise<PaymentOptions> {
  const qs = new URLSearchParams({ countryCode, methodSlug });
  const res = await fetch(`${BASE}/api/wallet/payment-options?${qs}`, { credentials: "include" });
  if (!res.ok) throw await readError(res, "Impossible de vérifier ce mode de paiement");
  const j = await res.json() as Partial<PaymentOptions>;
  return {
    gateway: String(j.gateway ?? ""),
    requiresOtp: j.requiresOtp === true,
    instruction: asText(j.instruction),
    operatorCode: asText(j.operatorCode),
  };
}

export async function fetchDepositStatus(depositId: string): Promise<Record<string, unknown> & { status: string }> {
  const res = await fetch(`${BASE}/api/wallet/deposit/${encodeURIComponent(depositId)}/status`, { credentials: "include" });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

export class CancelError extends Error {
  completed: boolean;
  constructor(message: string, completed: boolean) { super(message); this.completed = completed; }
}

export async function cancelDeposit(depositId: string): Promise<"completed" | "cancelled"> {
  const res = await fetch(`${BASE}/api/wallet/deposit/${encodeURIComponent(depositId)}/cancel`, {
    method: "POST", credentials: "include",
  });
  if (res.ok) {
    const result = await res.json() as { status?: string };
    if (result.status === "completed") return "completed";
    if (["failed", "cancelled", "expired"].includes(result.status ?? "")) return "cancelled";
    throw new CancelError("L'annulation n'a pas été confirmée. Le paiement reste en attente.", false);
  }
  let msg = "Annulation impossible pour le moment";
  let completed = false;
  try {
    const j = await res.json() as { message?: string; error?: string; status?: string };
    msg = j.message || j.error || msg;
    completed = j.status === "completed";
  } catch { /* ignore */ }
  throw new CancelError(msg, completed);
}

/** Inspect generated mutator error (ApiError: status + data). */
export function readRechargeError(e: unknown): { message: string; status: number | null; depositId: string | null; pending: boolean; requiresOtp: boolean; action: DirectAction } {
  const err = e as { message?: string; status?: number; data?: Record<string, unknown> | null };
  const data = err?.data && typeof err.data === "object" ? err.data : null;
  const depositId = data && typeof data.depositId === "string" ? data.depositId : null;
  return {
    message: asText(data?.message) ?? asText(data?.error) ?? err?.message ?? "Une erreur est survenue lors du paiement.",
    status: typeof err?.status === "number" ? err.status : null,
    depositId,
    pending: data?.pending === true || !!depositId,
    requiresOtp: data?.requiresOtp === true,
    action: toDirectAction(data),
  };
}
