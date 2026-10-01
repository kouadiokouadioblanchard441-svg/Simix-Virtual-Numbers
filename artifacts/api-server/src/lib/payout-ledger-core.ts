import { createHash } from "node:crypto";

export type DurablePayoutStatus = "pending" | "completed" | "failed";
export type DurablePayoutGateway = "pawapay" | "clapay";

export interface PayoutIdentity {
  gateway: DurablePayoutGateway;
  actorId: string;
  idempotencyKey: string;
  phone: string;
  provider: string;
  country: string;
  currency: string;
  amount: string;
  referralWithdrawalId?: string | null;
  gatewayConfigId?: string | null;
}

export interface PayoutLedgerRecord {
  id: string;
  idempotencyKey: string;
  requestFingerprint: string;
  gateway: string;
  externalId: string;
  signature: string | null;
  gatewayConfigId: string | null;
  referralWithdrawalId: string | null;
  actorId: string;
  phone: string;
  provider: string;
  country: string;
  currency: string;
  amount: string;
  status: string;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  initiationClaimedAt: Date | null;
}

export type NewPayoutLedgerRecord = Omit<
  PayoutLedgerRecord,
  "createdAt" | "updatedAt" | "completedAt" | "initiationClaimedAt"
> & {
  createdAt?: Date;
  updatedAt?: Date;
  completedAt?: Date | null;
  initiationClaimedAt?: Date | null;
};

export interface PayoutLedgerStore {
  insertIfAbsent(record: NewPayoutLedgerRecord): Promise<PayoutLedgerRecord | null>;
  findByIdempotencyKey(key: string): Promise<PayoutLedgerRecord | null>;
}

export type RegisterPayoutResult =
  | { kind: "created"; payout: PayoutLedgerRecord }
  | { kind: "existing"; payout: PayoutLedgerRecord }
  | { kind: "conflict"; payout?: PayoutLedgerRecord };

export function canonicalPayoutAmount(amount: string): string {
  const number = Number(amount);
  return Number.isFinite(number) ? number.toFixed(3).replace(/\.?0+$/, "") : amount;
}

export function payoutFingerprint(identity: PayoutIdentity): string {
  const stable = {
    gateway: identity.gateway,
    phone: identity.phone,
    provider: identity.provider,
    country: identity.country.toUpperCase(),
    currency: identity.currency.toUpperCase(),
    amount: canonicalPayoutAmount(identity.amount),
    referralWithdrawalId: identity.referralWithdrawalId ?? null,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

/** Shared idempotency behavior used by the database service and fake-DB tests. */
export async function registerPayoutInStore(
  store: PayoutLedgerStore,
  identity: PayoutIdentity,
  generated: { id: string; externalId: string },
  now = new Date(),
): Promise<RegisterPayoutResult> {
  const fingerprint = payoutFingerprint(identity);
  const record: NewPayoutLedgerRecord = {
    id: generated.id,
    idempotencyKey: identity.idempotencyKey,
    requestFingerprint: fingerprint,
    gateway: identity.gateway,
    externalId: generated.externalId,
    signature: null,
    gatewayConfigId: identity.gatewayConfigId ?? null,
    referralWithdrawalId: identity.referralWithdrawalId ?? null,
    actorId: identity.actorId,
    phone: identity.phone,
    provider: identity.provider,
    country: identity.country.toUpperCase(),
    currency: identity.currency.toUpperCase(),
    amount: canonicalPayoutAmount(identity.amount),
    status: "pending",
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    initiationClaimedAt: null,
  };
  const created = await store.insertIfAbsent(record);
  if (created) return { kind: "created", payout: created };

  const existing = await store.findByIdempotencyKey(identity.idempotencyKey);
  if (!existing) return { kind: "conflict" };
  if (existing.requestFingerprint !== fingerprint) return { kind: "conflict", payout: existing };
  return { kind: "existing", payout: existing };
}

export interface PayoutInitiationClaimStore {
  claimInitialInitiation(payoutId: string, at: Date): Promise<boolean>;
  claimExpiredPawaRecovery(payoutId: string, expiredBefore: Date, at: Date): Promise<boolean>;
}

export async function claimInitialPayoutInitiation(
  store: PayoutInitiationClaimStore,
  payoutId: string,
  at = new Date(),
): Promise<boolean> {
  return store.claimInitialInitiation(payoutId, at);
}

export async function claimExpiredPawaPayoutRecovery(
  store: PayoutInitiationClaimStore,
  payoutId: string,
  at = new Date(),
  leaseMs = 120_000,
): Promise<boolean> {
  return store.claimExpiredPawaRecovery(payoutId, new Date(at.getTime() - leaseMs), at);
}

export interface ReferralWithdrawalSettlement {
  id: string;
  userId: string;
  amount: number;
  status: string;
  adminNote: string | null;
}

export interface PayoutSettlementTransaction {
  lockPayout(id: string): Promise<PayoutLedgerRecord | null>;
  markPayoutTerminal(
    id: string,
    status: Exclude<DurablePayoutStatus, "pending">,
    failureReason: string | null,
    at: Date,
  ): Promise<PayoutLedgerRecord | null>;
  lockReferralWithdrawal(id: string): Promise<ReferralWithdrawalSettlement | null>;
  markReferralWithdrawalTerminal(
    id: string,
    status: "paid" | "rejected",
    adminNote: string | null,
    actorId: string,
    at: Date,
  ): Promise<boolean>;
  refundReferralBalance(userId: string, amount: number): Promise<void>;
}

export interface PayoutSettlementStore {
  transaction<T>(work: (tx: PayoutSettlementTransaction) => Promise<T>): Promise<T>;
}

/**
 * Shared terminal state transition logic. The payout transition, withdrawal
 * status, and one-time reserved-balance refund run in the repository's single
 * transaction.
 */
export async function finalizePayoutInStore(
  store: PayoutSettlementStore,
  payoutId: string,
  status: Exclude<DurablePayoutStatus, "pending">,
  failureReason?: string,
  at = new Date(),
): Promise<PayoutLedgerRecord | null> {
  return store.transaction(async (tx) => {
    const payout = await tx.lockPayout(payoutId);
    if (!payout || payout.status !== "pending") return payout;

    const updated = await tx.markPayoutTerminal(
      payoutId,
      status,
      status === "failed" ? (failureReason ?? "Provider payout failed") : null,
      at,
    );
    if (!updated) return payout;

    if (payout.referralWithdrawalId) {
      const withdrawal = await tx.lockReferralWithdrawal(payout.referralWithdrawalId);
      if (withdrawal?.status === "pending") {
        const changed = await tx.markReferralWithdrawalTerminal(
          withdrawal.id,
          status === "completed" ? "paid" : "rejected",
          status === "failed" ? (failureReason ?? "Payout failed") : withdrawal.adminNote,
          payout.actorId,
          at,
        );
        if (changed && status === "failed") {
          await tx.refundReferralBalance(withdrawal.userId, withdrawal.amount);
        }
      }
    }
    return updated;
  });
}

export interface ClapaySignatureRecoveryStore {
  persistSignatureIfUnclaimed(payoutId: string, signature: string): Promise<PayoutLedgerRecord | null>;
  getPayout(payoutId: string): Promise<PayoutLedgerRecord | null>;
  finalizePayout(
    payoutId: string,
    status: "completed" | "failed",
    failureReason?: string,
  ): Promise<PayoutLedgerRecord | null>;
}

const CLAPAY_SUCCESS = new Set(["SUCCESS", "SUCCESSFUL", "COMPLETED"]);
const CLAPAY_FAILURE = new Set(["FAILED", "CANCELLED", "CANCELED", "REJECTED", "REFUSED", "DECLINED", "TIMEOUT", "EXPIRED"]);

function clapyFieldStatus(value: string): DurablePayoutStatus {
  const status = value.trim().toUpperCase();
  if (CLAPAY_SUCCESS.has(status)) return "completed";
  if (CLAPAY_FAILURE.has(status)) return "failed";
  return "pending";
}

function matchesClapayStatusIdentity(
  payout: PayoutLedgerRecord,
  status: Record<string, unknown>,
  signature: string,
  requireAll: boolean,
): boolean {
  const transactionId = status.transaction_id ?? status.transactionId;
  if (transactionId !== payout.externalId || status.signature !== signature) return false;
  const amount = status.amount;
  const currency = status.currency;
  const method = status.method ?? status.transaction_method;
  const country = status.country ?? status.transaction_country_code ?? status.country_code;
  const observed: Array<[unknown, unknown, (a: string, b: string) => boolean]> = [
    [amount, payout.amount, (a, b) => canonicalPayoutAmount(a) === canonicalPayoutAmount(b)],
    [currency, payout.currency, (a, b) => a.toUpperCase() === b.toUpperCase()],
    [method, "CASHIN", (a, b) => a.toUpperCase() === b],
    [country, payout.country, (a, b) => a.toUpperCase() === b.toUpperCase()],
  ];
  for (const [observedValue, expectedValue, compare] of observed) {
    if (observedValue === undefined || observedValue === null || observedValue === "") {
      if (requireAll) return false;
      continue;
    }
    if (!compare(String(observedValue), String(expectedValue))) return false;
  }
  return true;
}

/**
 * Verify a candidate callback signature against NoWallet's authenticated
 * status API. Callback fields themselves are never used to settle a payout.
 */
export async function reconcileClapaySignature(
  store: ClapaySignatureRecoveryStore,
  payout: PayoutLedgerRecord,
  callbackSignature: string | undefined,
  queryStatus: (signature: string) => Promise<Record<string, unknown>>,
): Promise<PayoutLedgerRecord> {
  if (payout.gateway !== "clapay" || payout.status !== "pending") return payout;
  if (payout.signature && callbackSignature && payout.signature !== callbackSignature) return payout;
  const signature = payout.signature ?? callbackSignature;
  if (!signature) return payout;

  let response: Record<string, unknown>;
  try {
    response = await queryStatus(signature);
  } catch {
    return payout;
  }
  const statusValue = String(response.status ?? response.status_payment ?? "");
  const terminalStatus = clapyFieldStatus(statusValue);
  const terminal = terminalStatus !== "pending";
  if (!matchesClapayStatusIdentity(payout, response, signature, terminal)) return payout;

  let current = payout;
  if (!payout.signature) {
    const persisted = await store.persistSignatureIfUnclaimed(payout.id, signature);
    if (!persisted || persisted.signature !== signature || persisted.status !== "pending") {
      return (await store.getPayout(payout.id)) ?? payout;
    }
    current = persisted;
  }

  if (terminal) {
    return (await store.finalizePayout(
      payout.id,
      terminalStatus as "completed" | "failed",
      terminalStatus === "failed" ? String(response.message ?? response.observation_error ?? statusValue) : undefined,
    )) ?? current;
  }
  return (await store.getPayout(payout.id)) ?? current;
}