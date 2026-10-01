import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import {
  countriesTable,
  db,
  payoutsTable,
  referralWithdrawalsTable,
  usersTable,
} from "@workspace/db";
import {
  COUNTRY_CURRENCY,
  ISO2_TO_ISO3,
  PawaPayClient,
  buildMSISDN,
  getPawaPayOperationConfig,
  normalizePawaPayProvider,
  type PawaPayPayoutData,
} from "./pawapay";
import {
  ClapayClient,
  formatClapayPhone,
  type ClapayCashoutResponse,
} from "./clapay";
import {
  resolveClapayCredentials,
  resolvePawaPayCredentials,
} from "./gateway-credentials";
import { logger } from "./logger";
import {
  canonicalPayoutAmount,
  claimExpiredPawaPayoutRecovery,
  claimInitialPayoutInitiation,
  finalizePayoutInStore,
  reconcileClapaySignature,
  registerPayoutInStore,
  type PayoutIdentity,
  type PayoutInitiationClaimStore,
  type PayoutLedgerStore,
  type PayoutLedgerRecord,
  type ClapaySignatureRecoveryStore,
  type PayoutSettlementStore,
} from "./payout-ledger-core";

export type PayoutGateway = PayoutIdentity["gateway"];
export type { PayoutIdentity } from "./payout-ledger-core";
const canonicalAmount = canonicalPayoutAmount;

export function normalizePayoutRecord(payout: typeof payoutsTable.$inferSelect) {
  return {
    id: payout.id,
    gateway: payout.gateway as PayoutGateway,
    status: payout.status as "pending" | "completed" | "failed",
    amount: payout.amount,
    currency: payout.currency,
    countryCode: payout.country,
    phoneNumber: payout.phone,
    providerCode: payout.provider,
    externalId: payout.externalId,
    ...(payout.signature ? { signature: payout.signature } : {}),
    ...(payout.failureReason ? { failureReason: payout.failureReason } : {}),
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
    ...(payout.referralWithdrawalId ? { referralWithdrawalId: payout.referralWithdrawalId } : {}),
  };
}

export type RegisterPayoutResult =
  | { kind: "created"; payout: typeof payoutsTable.$inferSelect }
  | { kind: "existing"; payout: typeof payoutsTable.$inferSelect }
  | { kind: "conflict"; payout?: typeof payoutsTable.$inferSelect };

/** Persist the payout identity before contacting the provider. */
export async function registerPayout(identity: PayoutIdentity): Promise<RegisterPayoutResult> {
  return registerPayoutInStore(payoutLedgerStore, identity, {
    id: randomUUID(),
    externalId: randomUUID(),
  });
}

const payoutLedgerStore: PayoutLedgerStore = {
  async insertIfAbsent(record) {
    const [inserted] = await db.insert(payoutsTable).values(record).onConflictDoNothing().returning();
    return inserted ?? null;
  },
  async findByIdempotencyKey(key) {
    const [record] = await db.select().from(payoutsTable)
      .where(eq(payoutsTable.idempotencyKey, key)).limit(1);
    return record ?? null;
  },
};

const payoutInitiationClaims: PayoutInitiationClaimStore = {
  async claimInitialInitiation(payoutId, at) {
    const [claimed] = await db.update(payoutsTable).set({
      initiationClaimedAt: at,
      updatedAt: at,
    }).where(and(
      eq(payoutsTable.id, payoutId),
      eq(payoutsTable.status, "pending"),
      isNull(payoutsTable.initiationClaimedAt),
    )).returning({ id: payoutsTable.id });
    return Boolean(claimed);
  },
  async claimExpiredPawaRecovery(payoutId, expiredBefore, at) {
    const [claimed] = await db.update(payoutsTable).set({
      initiationClaimedAt: at,
      updatedAt: at,
    }).where(and(
      eq(payoutsTable.id, payoutId),
      eq(payoutsTable.gateway, "pawapay"),
      eq(payoutsTable.status, "pending"),
      lt(payoutsTable.initiationClaimedAt, expiredBefore),
    )).returning({ id: payoutsTable.id });
    return Boolean(claimed);
  },
};

export async function getPayoutById(id: string) {
  const [payout] = await db.select().from(payoutsTable)
    .where(eq(payoutsTable.id, id)).limit(1);
  return payout ?? null;
}

export async function initiatePayout(
  payout: typeof payoutsTable.$inferSelect,
  operatorOtp?: string,
  mode: "initial" | "pawa-recovery" = "initial",
): Promise<void> {
  if (payout.status !== "pending") return;
  if (payout.gateway === "pawapay") {
    const credentials = await resolvePawaPayCredentials();
    if (!credentials) throw new Error("PawaPay non configuré");
    const claim = mode === "pawa-recovery"
      ? await claimExpiredPawaPayoutRecovery(payoutInitiationClaims, payout.id)
      : await claimInitialPayoutInitiation(payoutInitiationClaims, payout.id);
    if (!claim) return;
    const client = new PawaPayClient(credentials.token, credentials.env);
    try {
      const result = await client.initiatePayout({
        payoutId: payout.externalId,
        amount: canonicalAmount(payout.amount),
        currency: payout.currency,
        recipient: {
          type: "MMO",
          accountDetails: { phoneNumber: payout.phone, provider: payout.provider },
        },
        customerMessage: "Simix retrait",
        metadata: [{ type: "admin_payout", payout_id: payout.id }],
      });
      if (result.status === "REJECTED") {
        await finalizePayout(payout.id, "failed", result.failureReason?.failureMessage ?? "PawaPay rejected payout");
      }
    } catch (error) {
      /* Request outcome can be ambiguous; preserve the ID and reconcile it. */
      logger.warn({ payoutId: payout.externalId, err: (error as Error).message }, "[payout] PawaPay initiation outcome unknown");
      throw error;
    }
    return;
  }

  /* Clapay does not provide an idempotent initiation key. Never resubmit a
     claimed attempt; a lost response can recover its signature from an
     authenticated status lookup after the provider's callback. */
  if (payout.signature) return;
  const credentials = await resolveClapayCredentials();
  if (!credentials) throw new Error("Clapay non configuré");
  const claimed = await claimInitialPayoutInitiation(payoutInitiationClaims, payout.id);
  if (!claimed) return;
  const client = new ClapayClient(credentials.token, credentials.baseUrl);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "https://simix.site";
  let response: ClapayCashoutResponse;
  try {
    response = await client.initiateCashout({
      transaction_id: payout.externalId,
      additional_infos: { customer_phone: payout.phone },
      amount: Math.floor(Number(payout.amount)),
      callback_url: `${appUrl}/api/payouts/clapay/webhook`,
      return_url: `${appUrl}/admin/payouts`,
      country_code: payout.country,
      operators_code: [payout.provider],
      method: "CASHIN",
      tunnel: "API",
      ...(operatorOtp ? { operator_otp: operatorOtp } : {}),
    });
  } catch (error) {
    /* The provider may have accepted this request; do not retry initiation. */
    logger.warn({ payoutId: payout.id, err: (error as Error).message }, "[payout] Clapay initiation outcome unknown; retained pending");
    throw error;
  }
  if (!response.signature) {
    logger.warn({ payoutId: payout.id }, "[payout] Clapay returned no signature; retained pending");
    return;
  }
  const [saved] = await db.update(payoutsTable).set({
    signature: response.signature,
    updatedAt: new Date(),
  }).where(and(
    eq(payoutsTable.id, payout.id),
    eq(payoutsTable.status, "pending"),
    isNull(payoutsTable.signature),
  )).returning({ signature: payoutsTable.signature });
  if (!saved) {
    const current = await getPayoutById(payout.id);
    if (current?.signature !== response.signature) {
      logger.error({ payoutId: payout.id }, "[payout] Clapay response signature conflicts with already verified signature");
    }
  }
}

function exactAmount(left: string | number, right: string | number): boolean {
  return canonicalAmount(String(left)) === canonicalAmount(String(right));
}

function pawaIdentityMatches(payout: typeof payoutsTable.$inferSelect, data: PawaPayPayoutData): boolean {
  return data.payoutId === payout.externalId &&
    data.recipient?.accountDetails?.phoneNumber === payout.phone &&
    data.recipient?.accountDetails?.provider === payout.provider &&
    exactAmount(data.amount, payout.amount) &&
    data.currency.toUpperCase() === payout.currency &&
    data.country.toUpperCase() === (ISO2_TO_ISO3[payout.country] ?? payout.country).toUpperCase();
}

/**
 * Apply a terminal transition exactly once. Referral reservation is settled in
 * the same transaction: completed => paid; failed => rejected and refunded.
 */
export async function finalizePayout(
  payoutId: string,
  status: "completed" | "failed",
  failureReason?: string,
): Promise<typeof payoutsTable.$inferSelect | null> {
  return finalizePayoutInStore(payoutSettlementStore, payoutId, status, failureReason);
}

const payoutSettlementStore: PayoutSettlementStore = {
  transaction: (work) => db.transaction(async (tx) => work({
    async lockPayout(id) {
      const [payout] = await tx.select().from(payoutsTable)
        .where(eq(payoutsTable.id, id)).for("update");
      return payout ?? null;
    },
    async markPayoutTerminal(id, status, reason, at) {
      const [payout] = await tx.update(payoutsTable).set({
        status,
        failureReason: reason,
        updatedAt: at,
        completedAt: at,
      }).where(and(eq(payoutsTable.id, id), eq(payoutsTable.status, "pending"))).returning();
      return payout ?? null;
    },
    async lockReferralWithdrawal(id) {
      const [withdrawal] = await tx.select({
        id: referralWithdrawalsTable.id,
        userId: referralWithdrawalsTable.userId,
        amount: referralWithdrawalsTable.amount,
        status: referralWithdrawalsTable.status,
        adminNote: referralWithdrawalsTable.adminNote,
      }).from(referralWithdrawalsTable)
        .where(eq(referralWithdrawalsTable.id, id)).for("update");
      return withdrawal ?? null;
    },
    async markReferralWithdrawalTerminal(id, status, adminNote, actorId, at) {
      const changed = await tx.update(referralWithdrawalsTable).set({
        status,
        adminNote,
        processedBy: actorId,
        processedAt: at,
      }).where(and(
        eq(referralWithdrawalsTable.id, id),
        eq(referralWithdrawalsTable.status, "pending"),
      )).returning({ id: referralWithdrawalsTable.id });
      return changed.length > 0;
    },
    async refundReferralBalance(userId, amount) {
      await tx.update(usersTable)
        .set({ referralBalance: sql`${usersTable.referralBalance} + ${amount}` })
        .where(eq(usersTable.id, userId));
    },
  })),
};

const clapaySignatureRecoveryStore: ClapaySignatureRecoveryStore = {
  async persistSignatureIfUnclaimed(payoutId, signature) {
    const [persisted] = await db.update(payoutsTable).set({
      signature,
      updatedAt: new Date(),
    }).where(and(
      eq(payoutsTable.id, payoutId),
      eq(payoutsTable.gateway, "clapay"),
      eq(payoutsTable.status, "pending"),
      isNull(payoutsTable.signature),
    )).returning();
    return persisted ?? getPayoutById(payoutId);
  },
  getPayout: getPayoutById as (id: string) => Promise<PayoutLedgerRecord | null>,
  finalizePayout,
};

export async function refreshPayout(
  payoutId: string,
  callbackSignature?: string,
): Promise<typeof payoutsTable.$inferSelect | null> {
  const payout = await getPayoutById(payoutId);
  if (!payout || payout.status !== "pending") return payout;
  try {
    if (payout.gateway === "pawapay") {
      const credentials = await resolvePawaPayCredentials();
      if (!credentials) throw new Error("PawaPay non configuré");
      const client = new PawaPayClient(credentials.token, credentials.env);
      const result = await client.getPayoutStatus(payout.externalId);
      if (result.status === "NOT_FOUND") {
        /* A retry uses only the already-persisted PawaPay UUID and exact
           identity after its initiation lease expires; never mint a new ID. */
        await initiatePayout(
          payout,
          undefined,
          payout.initiationClaimedAt ? "pawa-recovery" : "initial",
        );
      } else if (result.status === "FOUND" && result.data) {
        if (!pawaIdentityMatches(payout, result.data)) {
          logger.error({ payoutId, externalId: payout.externalId }, "[payout] PawaPay payout identity mismatch; no transition");
        } else if (result.data.status === "COMPLETED") {
          await finalizePayout(payout.id, "completed");
        } else if (result.data.status === "FAILED") {
          await finalizePayout(payout.id, "failed", result.data.failureReason?.failureMessage);
        }
      }
    } else if (payout.signature || callbackSignature) {
      const credentials = await resolveClapayCredentials();
      if (!credentials) throw new Error("Clapay non configuré");
      const client = new ClapayClient(credentials.token, credentials.baseUrl);
      await reconcileClapaySignature(
        clapaySignatureRecoveryStore,
        payout,
        callbackSignature,
        async (signature) => client.checkPaymentStatus(signature) as Promise<Record<string, unknown>>,
      );
    }
  } catch (error) {
    logger.warn({ payoutId, gateway: payout.gateway, err: (error as Error).message }, "[payout] Reconciliation check failed");
  } finally {
    await db.update(payoutsTable).set({ updatedAt: new Date() })
      .where(and(eq(payoutsTable.id, payout.id), eq(payoutsTable.status, "pending")));
  }
  return getPayoutById(payoutId);
}

export async function validatePawaPayRecipient(input: {
  phoneNumber: string;
  countryIso2: string;
  provider: string;
  currency: string;
  amount: string | number;
}) {
  const iso2 = input.countryIso2.trim().toUpperCase();
  const [countryRecord] = await db.select({ dialCode: countriesTable.dialCode })
    .from(countriesTable).where(eq(countriesTable.code, iso2)).limit(1);
  const credentials = await resolvePawaPayCredentials();
  if (!credentials) throw new Error("PawaPay non configuré");
  const client = new PawaPayClient(credentials.token, credentials.env);
  const msisdn = buildMSISDN(input.phoneNumber);
  const dialPrefix = countryRecord?.dialCode?.replace(/\D/g, "");
  if (!dialPrefix || !msisdn.startsWith(dialPrefix)) {
    throw new PayoutValidationError("Le numéro doit être saisi au format international complet pour le pays sélectionné.", 422);
  }
  if (!/^[1-9][0-9]{7,17}$/.test(msisdn)) {
    throw new PayoutValidationError("Numéro de téléphone invalide. Utilisez le format international complet.", 422);
  }
  const provider = normalizePawaPayProvider(iso2, input.provider);
  const amountString = String(input.amount).trim();
  const amountNumber = Number(amountString);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0 ||
    !/^([0]|([1-9][0-9]{0,17}))([.][0-9]{0,3}[1-9])?$/.test(amountString)) {
    throw new PayoutValidationError("Format du montant invalide pour PawaPay", 400);
  }
  const predicted = await client.predictProvider(msisdn);
  if (!predicted?.phoneNumber || !predicted.provider) {
    throw new PayoutValidationError("PawaPay n'a pas pu valider ce numéro.", 422);
  }
  if (predicted.provider !== provider) {
    throw new PayoutValidationError(`Ce numéro est identifié par PawaPay comme ${predicted.provider}, mais l'opérateur sélectionné est ${provider}.`, 422);
  }
  const iso3 = ISO2_TO_ISO3[iso2] ?? iso2;
  const config = await client.getActiveConfiguration({ country: iso3, operationType: "PAYOUT" });
  const configuredCountry = config.countries.find(c => c.country === iso3 || c.country === iso2);
  const providerConfig = configuredCountry?.providers.find(p => p.provider === provider);
  const payoutCurrency = providerConfig?.currencies.find(c =>
    c.currency === input.currency.trim().toUpperCase() &&
    getPawaPayOperationConfig(c.operationTypes, "PAYOUT"),
  );
  const payoutConfig = payoutCurrency
    ? getPawaPayOperationConfig(payoutCurrency.operationTypes, "PAYOUT")
    : undefined;
  if (!providerConfig || !payoutCurrency || !payoutConfig) {
    throw new PayoutValidationError(`Le retrait PawaPay n'est pas activé pour ${provider}.`, 422);
  }
  const min = Number(payoutConfig.minTransactionLimit ?? payoutConfig.minAmount);
  const max = Number(payoutConfig.maxTransactionLimit ?? payoutConfig.maxAmount);
  if (Number.isFinite(min) && amountNumber < min) throw new PayoutValidationError(`Le montant minimum est ${min} ${input.currency}.`, 422);
  if (Number.isFinite(max) && amountNumber > max) throw new PayoutValidationError(`Le montant maximum est ${max} ${input.currency}.`, 422);
  if (payoutConfig.decimalsInAmount === "NONE" && amountString.includes(".")) {
    throw new PayoutValidationError("Les décimales ne sont pas autorisées pour cet opérateur.", 422);
  }
  return {
    phone: predicted.phoneNumber,
    provider,
    country: iso2,
    currency: input.currency.trim().toUpperCase(),
    amount: amountString,
  };
}

export class PayoutValidationError extends Error {
  constructor(message: string, public readonly httpStatus: number) {
    super(message);
  }
}

export async function resolveClapayReferralPayout(countryCode: string, operatorSlug: string, phone: string, amount: number) {
  const country = countryCode.trim().toUpperCase();
  const credentials = await resolveClapayCredentials();
  if (!credentials) throw new Error("Clapay non configuré");
  const client = new ClapayClient(credentials.token, credentials.baseUrl);
  const [countryRecord] = await db.select({ dialCode: countriesTable.dialCode })
    .from(countriesTable).where(eq(countriesTable.code, country)).limit(1);
  if (!countryRecord) throw new PayoutValidationError("Pays introuvable", 422);
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = normalize(operatorSlug);
  if (!wanted) throw new PayoutValidationError("Opérateur invalide", 422);
  const operators = await client.getOperators(country);
  const eligible = operators.filter(op => op.active && Boolean(op.codeoperator) &&
    Boolean(op.code?.CASHIN) && op.code.CASHIN.toLowerCase() !== "none");
  const operator = eligible.find(op => normalize(op.codeoperator) === wanted) ??
    eligible.find(op => {
      const code = normalize(op.codeoperator);
      const name = normalize(op.name);
      return wanted === name || wanted.includes(name) || name.includes(wanted) ||
        (code.length > 2 && (wanted.startsWith(code) || wanted.endsWith(code)));
    });
  if (!operator || !operator.codeoperator || !operator.code?.CASHIN || operator.code.CASHIN.toLowerCase() === "none") {
    throw new PayoutValidationError("L'opérateur Clapay sélectionné ne prend pas en charge les payouts CASHIN.", 422);
  }
  const formattedPhone = formatClapayPhone(phone, countryRecord.dialCode, country);
  if (!formattedPhone.replace(/\D/g, "").length) throw new PayoutValidationError("Numéro de téléphone invalide", 422);
  const countries = await client.getCountries(country);
  const countryCurrency = countries.find(c => c.code.toUpperCase() === country)?.currency;
  const currency = countryCurrency || COUNTRY_CURRENCY[country];
  if (!currency) throw new PayoutValidationError("Devise du pays non disponible", 422);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new PayoutValidationError("Montant invalide", 400);
  return {
    phone: formattedPhone,
    provider: operator.codeoperator,
    country,
    currency: currency.toUpperCase(),
    amount: String(amount),
    operatorRequiresOtp: operator.otpstarter?.CASHIN === true,
  };
}

export async function payoutForReferralWithdrawal(withdrawalId: string) {
  const [payout] = await db.select().from(payoutsTable)
    .where(eq(payoutsTable.referralWithdrawalId, withdrawalId)).limit(1);
  return payout ?? null;
}