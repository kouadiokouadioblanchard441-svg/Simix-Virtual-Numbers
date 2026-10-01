import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  finalizePayoutInStore,
  claimExpiredPawaPayoutRecovery,
  claimInitialPayoutInitiation,
  reconcileClapaySignature,
  registerPayoutInStore,
  type NewPayoutLedgerRecord,
  type PayoutIdentity,
  type PayoutLedgerRecord,
  type PayoutLedgerStore,
  type PayoutInitiationClaimStore,
  type ClapaySignatureRecoveryStore,
  type PayoutSettlementStore,
  type PayoutSettlementTransaction,
  type ReferralWithdrawalSettlement,
} from "../src/lib/payout-ledger-core";

class FakePayoutDatabase implements
  PayoutLedgerStore,
  PayoutSettlementStore,
  PayoutSettlementTransaction,
  PayoutInitiationClaimStore,
  ClapaySignatureRecoveryStore {
  readonly payouts = new Map<string, PayoutLedgerRecord>();
  readonly withdrawals = new Map<string, ReferralWithdrawalSettlement>();
  readonly referralBalances = new Map<string, number>();
  terminalPayoutTransitions = 0;
  private transactionQueue: Promise<void> = Promise.resolve();

  async insertIfAbsent(input: NewPayoutLedgerRecord): Promise<PayoutLedgerRecord | null> {
    if (Array.from(this.payouts.values()).some(payout =>
      payout.idempotencyKey === input.idempotencyKey ||
      (input.referralWithdrawalId !== null &&
        payout.referralWithdrawalId === input.referralWithdrawalId),
    )) return null;
    const record: PayoutLedgerRecord = {
      ...input,
      createdAt: input.createdAt ?? new Date(),
      updatedAt: input.updatedAt ?? new Date(),
      completedAt: input.completedAt ?? null,
    };
    this.payouts.set(record.id, record);
    return record;
  }

  async findByIdempotencyKey(key: string): Promise<PayoutLedgerRecord | null> {
    return Array.from(this.payouts.values()).find(payout => payout.idempotencyKey === key) ?? null;
  }

  async claimInitialInitiation(payoutId: string, at: Date): Promise<boolean> {
    const payout = this.payouts.get(payoutId);
    if (!payout || payout.status !== "pending" || payout.initiationClaimedAt) return false;
    this.payouts.set(payoutId, { ...payout, initiationClaimedAt: at, updatedAt: at });
    return true;
  }

  async claimExpiredPawaRecovery(payoutId: string, expiredBefore: Date, at: Date): Promise<boolean> {
    const payout = this.payouts.get(payoutId);
    if (!payout || payout.gateway !== "pawapay" || payout.status !== "pending" ||
        !payout.initiationClaimedAt || payout.initiationClaimedAt >= expiredBefore) return false;
    this.payouts.set(payoutId, { ...payout, initiationClaimedAt: at, updatedAt: at });
    return true;
  }

  async transaction<T>(work: (tx: PayoutSettlementTransaction) => Promise<T>): Promise<T> {
    const previous = this.transactionQueue;
    let release!: () => void;
    this.transactionQueue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      return await work(this);
    } finally {
      release();
    }
  }

  async lockPayout(id: string): Promise<PayoutLedgerRecord | null> {
    return this.payouts.get(id) ?? null;
  }

  async markPayoutTerminal(
    id: string,
    status: "completed" | "failed",
    failureReason: string | null,
    at: Date,
  ): Promise<PayoutLedgerRecord | null> {
    const payout = this.payouts.get(id);
    if (!payout || payout.status !== "pending") return null;
    const updated = { ...payout, status, failureReason, updatedAt: at, completedAt: at };
    this.terminalPayoutTransitions += 1;
    this.payouts.set(id, updated);
    return updated;
  }

  async lockReferralWithdrawal(id: string): Promise<ReferralWithdrawalSettlement | null> {
    return this.withdrawals.get(id) ?? null;
  }

  async markReferralWithdrawalTerminal(
    id: string,
    status: "paid" | "rejected",
    adminNote: string | null,
    _actorId: string,
    _at: Date,
  ): Promise<boolean> {
    const withdrawal = this.withdrawals.get(id);
    if (!withdrawal || withdrawal.status !== "pending") return false;
    this.withdrawals.set(id, { ...withdrawal, status, adminNote });
    return true;
  }

  async refundReferralBalance(userId: string, amount: number): Promise<void> {
    this.referralBalances.set(userId, (this.referralBalances.get(userId) ?? 0) + amount);
  }

  async persistSignatureIfUnclaimed(payoutId: string, signature: string): Promise<PayoutLedgerRecord | null> {
    const payout = this.payouts.get(payoutId);
    if (payout?.status === "pending" && !payout.signature) {
      const updated = { ...payout, signature };
      this.payouts.set(payoutId, updated);
      return updated;
    }
    return payout ?? null;
  }

  async getPayout(payoutId: string): Promise<PayoutLedgerRecord | null> {
    return this.payouts.get(payoutId) ?? null;
  }

  async finalizePayout(
    payoutId: string,
    status: "completed" | "failed",
    failureReason?: string,
  ): Promise<PayoutLedgerRecord | null> {
    return finalizePayoutInStore(this, payoutId, status, failureReason);
  }
}

function identity(overrides: Partial<PayoutIdentity> = {}): PayoutIdentity {
  return {
    gateway: "pawapay",
    actorId: "admin-1",
    idempotencyKey: "withdrawal-key-1",
    phone: "2250700000000",
    provider: "ORANGE_CIV",
    country: "CI",
    currency: "XOF",
    amount: "500",
    referralWithdrawalId: "withdrawal-1",
    ...overrides,
  };
}

async function createPayout(db: FakePayoutDatabase, payoutIdentity = identity(), id = "payout-1") {
  return registerPayoutInStore(db, payoutIdentity, {
    id,
    externalId: `provider-${id}`,
  }, new Date("2025-01-01T00:00:00Z"));
}

test("same concurrent idempotency key creates one durable payout and mismatched reuse conflicts", async () => {
  const fakeDb = new FakePayoutDatabase();
  const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    createPayout(fakeDb, identity(), `payout-${index}`),
  ));

  assert.equal(concurrent.filter(result => result.kind === "created").length, 1);
  assert.equal(concurrent.filter(result => result.kind === "existing").length, 11);
  assert.equal(fakeDb.payouts.size, 1);
  assert.equal(new Set(concurrent.map(result => result.payout?.externalId)).size, 1);

  const conflict = await createPayout(fakeDb, identity({ amount: "501" }), "payout-conflict");
  assert.equal(conflict.kind, "conflict");
  assert.equal(fakeDb.payouts.size, 1);
});

test("concurrent initiators claim once and PawaPay reuses its persisted ID only after the lease expires", async () => {
  const fakeDb = new FakePayoutDatabase();
  const registered = await createPayout(fakeDb);
  assert.equal(registered.kind, "created");
  assert.equal(
    await claimExpiredPawaPayoutRecovery(fakeDb, "payout-1", new Date("2025-01-01T00:05:00Z")),
    false,
  );
  const submittedIds: string[] = [];
  const first = await Promise.all(Array.from({ length: 10 }, () =>
    claimInitialPayoutInitiation(fakeDb, "payout-1", new Date("2025-01-01T00:00:00Z")),
  ));
  assert.equal(first.filter(Boolean).length, 1);

  const payoutId = fakeDb.payouts.get("payout-1")!.externalId;
  submittedIds.push(...first.filter(Boolean).map(() => payoutId));
  assert.equal(
    await claimExpiredPawaPayoutRecovery(fakeDb, "payout-1", new Date("2025-01-01T00:01:59Z")),
    false,
  );
  const recovered = await Promise.all(Array.from({ length: 5 }, () =>
    claimExpiredPawaPayoutRecovery(fakeDb, "payout-1", new Date("2025-01-01T00:02:01Z")),
  ));
  assert.equal(recovered.filter(Boolean).length, 1);
  submittedIds.push(...recovered.filter(Boolean).map(() => fakeDb.payouts.get("payout-1")!.externalId));
  assert.equal(fakeDb.payouts.get("payout-1")!.externalId, payoutId);
  assert.equal(
    await claimExpiredPawaPayoutRecovery(fakeDb, "payout-1", new Date("2025-01-01T00:02:02Z")),
    false,
  );
  assert.deepEqual(submittedIds, [payoutId, payoutId]);

  const clapay = await createPayout(
    fakeDb,
    identity({ gateway: "clapay", idempotencyKey: "clapay-key", referralWithdrawalId: null }),
    "clapay-payout",
  );
  assert.equal(clapay.kind, "created");
  assert.equal(await claimInitialPayoutInitiation(fakeDb, "clapay-payout"), true);
  assert.equal(await claimInitialPayoutInitiation(fakeDb, "clapay-payout"), false);
  assert.equal(await claimExpiredPawaPayoutRecovery(fakeDb, "clapay-payout", new Date(Date.now() + 180_000)), false);
});

test("verified referral success pays exactly once and does not refund reserved funds", async () => {
  const fakeDb = new FakePayoutDatabase();
  fakeDb.withdrawals.set("withdrawal-1", {
    id: "withdrawal-1",
    userId: "user-1",
    amount: 500,
    status: "pending",
    adminNote: null,
  });
  fakeDb.referralBalances.set("user-1", 0);
  const payout = await createPayout(fakeDb);
  assert.equal(payout.kind, "created");

  await Promise.all([
    finalizePayoutInStore(fakeDb, "payout-1", "completed"),
    finalizePayoutInStore(fakeDb, "payout-1", "completed"),
  ]);

  assert.equal(fakeDb.payouts.get("payout-1")?.status, "completed");
  assert.equal(fakeDb.withdrawals.get("withdrawal-1")?.status, "paid");
  assert.equal(fakeDb.referralBalances.get("user-1"), 0);
});

test("verified referral failure rejects and refunds once; linked withdrawal cannot be retried with a new key", async () => {
  const fakeDb = new FakePayoutDatabase();
  fakeDb.withdrawals.set("withdrawal-1", {
    id: "withdrawal-1",
    userId: "user-1",
    amount: 500,
    status: "pending",
    adminNote: null,
  });
  fakeDb.referralBalances.set("user-1", 0);
  const payout = await createPayout(fakeDb);
  assert.equal(payout.kind, "created");

  await Promise.all([
    finalizePayoutInStore(fakeDb, "payout-1", "failed", "provider rejected"),
    finalizePayoutInStore(fakeDb, "payout-1", "failed", "provider rejected"),
  ]);
  const retry = await createPayout(
    fakeDb,
    identity({ idempotencyKey: "withdrawal-key-2" }),
    "payout-retry",
  );

  assert.equal(fakeDb.payouts.get("payout-1")?.status, "failed");
  assert.equal(fakeDb.withdrawals.get("withdrawal-1")?.status, "rejected");
  assert.equal(fakeDb.withdrawals.get("withdrawal-1")?.adminNote, "provider rejected");
  assert.equal(fakeDb.referralBalances.get("user-1"), 500);
  assert.equal(retry.kind, "conflict");
  assert.equal(fakeDb.payouts.size, 1);
});

test("Clapay pending callback signature is persisted only after authenticated status identity validation", async () => {
  const fakeDb = new FakePayoutDatabase();
  const clapayIdentity = identity({ gateway: "clapay", provider: "OM" });
  const registered = await createPayout(fakeDb, clapayIdentity);
  assert.equal(registered.kind, "created");
  const payout = registered.payout as PayoutLedgerRecord;

  const invalid = await reconcileClapaySignature(
    fakeDb,
    payout,
    "untrusted-signature",
    async () => ({
      status: "INITIATED",
      transaction_id: payout.externalId,
      signature: "untrusted-signature",
      amount: "999",
      currency: "XOF",
      method: "CASHIN",
      country: "CI",
    }),
  );
  assert.equal(invalid.signature, null);
  assert.equal(fakeDb.payouts.get(payout.id)?.signature, null);

  const incompleteTerminal = await reconcileClapaySignature(
    fakeDb,
    payout,
    "terminal-signature",
    async () => ({
      status: "COMPLETED",
      transaction_id: payout.externalId,
      signature: "terminal-signature",
    }),
  );
  assert.equal(incompleteTerminal.signature, null);
  assert.equal(incompleteTerminal.status, "pending");

  const verified = await reconcileClapaySignature(
    fakeDb,
    payout,
    "verified-signature",
    async () => ({
      status: "INITIATED",
      transaction_id: payout.externalId,
      signature: "verified-signature",
    }),
  );
  assert.equal(verified.signature, "verified-signature");
  assert.equal(verified.status, "pending");
  const mismatched = await reconcileClapaySignature(
    fakeDb,
    verified,
    "different-signature",
    async () => { throw new Error("a mismatched callback signature must not be queried"); },
  );
  assert.equal(mismatched.signature, "verified-signature");
  assert.equal(fakeDb.payouts.get(payout.id)?.signature, "verified-signature");
});

test("Clapay exact completed late callback settles once; an existing signature cannot be replaced", async () => {
  const fakeDb = new FakePayoutDatabase();
  fakeDb.withdrawals.set("withdrawal-1", {
    id: "withdrawal-1",
    userId: "user-1",
    amount: 500,
    status: "pending",
    adminNote: null,
  });
  fakeDb.referralBalances.set("user-1", 0);
  const registered = await createPayout(fakeDb, identity({ gateway: "clapay", provider: "OM" }));
  assert.equal(registered.kind, "created");
  const payout = registered.payout as PayoutLedgerRecord;
  const status = {
    status: "COMPLETED",
    transaction_id: payout.externalId,
    signature: "verified-late-signature",
    amount: "500",
    currency: "XOF",
    method: "CASHIN",
    country: "CI",
  };
  await Promise.all([
    reconcileClapaySignature(fakeDb, payout, status.signature, async () => status),
    reconcileClapaySignature(fakeDb, payout, status.signature, async () => status),
  ]);
  const current = fakeDb.payouts.get(payout.id)!;
  const mismatch = await reconcileClapaySignature(
    fakeDb,
    current,
    "different-signature",
    async () => { throw new Error("must not query a mismatched callback signature"); },
  );

  assert.equal(current.signature, "verified-late-signature");
  assert.equal(current.status, "completed");
  assert.equal(fakeDb.terminalPayoutTransitions, 1);
  assert.equal(fakeDb.withdrawals.get("withdrawal-1")?.status, "paid");
  assert.equal(fakeDb.referralBalances.get("user-1"), 0);
  assert.equal(mismatch.signature, "verified-late-signature");
});