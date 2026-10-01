import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  fxProfitsTable,
  paymentGatewaysTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import {
  ISO2_TO_ISO3,
  PawaPayClient,
  type PawaPayDepositData,
  type PawaPayDepositSearchResult,
} from "./pawapay";
import { resolvePawaPayCredentials } from "./gateway-credentials";

export type PawaPayGatewayMeta = {
  expectedAmount?: string | number;
  expectedCurrency?: string;
  expectedProvider?: string;
  expectedPhoneNumber?: string;
  expectedCountry?: string;
  gatewayConfigId?: string | null;
};

type StoredDeposit = typeof transactionsTable.$inferSelect;
type FxExpectedAmount = { currency: string; localAmount: string };

export type NormalizedPawaPayExpected = {
  amount: number;
  currency?: string;
  provider?: string;
  phoneNumber?: string;
  country?: string;
  requireAllEvidence: boolean;
};

export type PawaPaySettlementOutcome = {
  settled: boolean;
  failed: boolean;
  ignored: boolean;
  transactionId?: string;
  userId?: string;
  amount?: number;
};

export function parsePawaPayMeta(value: unknown): PawaPayGatewayMeta {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const meta = parsed as PawaPayGatewayMeta & Record<string, unknown>;
    return {
      ...meta,
      expectedAmount: meta.expectedAmount ?? (typeof meta.amount === "string" || typeof meta.amount === "number" ? meta.amount : undefined),
      expectedCurrency: meta.expectedCurrency ?? (typeof meta.currency === "string" ? meta.currency : undefined),
      expectedProvider: meta.expectedProvider ?? (typeof meta.provider === "string" ? meta.provider : undefined),
      expectedPhoneNumber: meta.expectedPhoneNumber ?? (typeof meta.phoneNumber === "string" ? meta.phoneNumber : undefined),
      expectedCountry: meta.expectedCountry ?? (typeof meta.country === "string" ? meta.country : undefined),
    };
  } catch {
    return {};
  }
}

export function normalizePawaPayExpected(
  deposit: Pick<StoredDeposit, "externalDepositId" | "amount" | "gatewayMeta" | "createdAt">,
  fx?: FxExpectedAmount,
): NormalizedPawaPayExpected | null {
  const meta = parsePawaPayMeta(deposit.gatewayMeta);
  const hasAmount = meta.expectedAmount !== undefined && meta.expectedAmount !== null;
  const legacyFxAmount = fx ? Number(fx.localAmount) : undefined;
  const amount = hasAmount
    ? Number(meta.expectedAmount)
    : legacyFxAmount !== undefined && Number.isFinite(legacyFxAmount)
      ? legacyFxAmount
      : Number(deposit.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const fxCurrency = fx?.currency?.trim().toUpperCase();
  const expectedCurrency = String(meta.expectedCurrency ?? fxCurrency ?? "").trim().toUpperCase() || undefined;
  const expectedCountry = String(meta.expectedCountry ?? "").trim().toUpperCase() || undefined;
  const expectedProvider = String(meta.expectedProvider ?? "").trim().toUpperCase() || undefined;
  const expectedPhone = String(meta.expectedPhoneNumber ?? "").replace(/\D/g, "") || undefined;

  return {
    amount,
    currency: expectedCurrency,
    provider: expectedProvider,
    phoneNumber: expectedPhone,
    country: expectedCountry,
    // New deposits store the complete expected tuple before initiation. Older rows
    // lack this trusted evidence; validate every value they do contain.
    requireAllEvidence: hasAmount && Boolean(expectedCurrency && expectedProvider && expectedPhone && expectedCountry),
  };
}

function readRemoteIdentity(data: PawaPayDepositData) {
  return {
    depositId: String(data.depositId ?? ""),
    amount: Number(data.amount),
    currency: String(data.currency ?? "").trim().toUpperCase(),
    country: String(data.country ?? "").trim().toUpperCase(),
    provider: String(data.payer?.accountDetails?.provider ?? "").trim().toUpperCase(),
    phoneNumber: String(data.payer?.accountDetails?.phoneNumber ?? "").replace(/\D/g, ""),
  };
}

export function pawaPayStatusMatches(
  externalDepositId: string,
  expected: NormalizedPawaPayExpected,
  data: PawaPayDepositData,
): boolean {
  const remote = readRemoteIdentity(data);
  if (remote.depositId !== externalDepositId || !Number.isFinite(remote.amount) || remote.amount !== expected.amount) {
    return false;
  }

  const checks: Array<[string | undefined, string, (a: string, b: string) => boolean]> = [
    [expected.currency, remote.currency, (a, b) => a === b],
    [expected.provider, remote.provider, (a, b) => a === b],
    [expected.phoneNumber, remote.phoneNumber, (a, b) => a === b],
    [expected.country, remote.country, (a, b) => {
      if (a === b) return true;
      const alpha3 = ISO2_TO_ISO3[a];
      return alpha3 === b;
    }],
  ];
  for (const [wanted, actual, equal] of checks) {
    if (wanted && (!actual || !equal(wanted, actual))) return false;
  }

  if (expected.requireAllEvidence && checks.some(([wanted, actual]) => Boolean(wanted) && !actual)) return false;
  return true;
}

async function getFxExpectedAmount(database: typeof db | any, transactionId: string): Promise<FxExpectedAmount | undefined> {
  const [fx] = await database.select({
    currency: fxProfitsTable.currency,
    localAmount: fxProfitsTable.localAmount,
  }).from(fxProfitsTable)
    .where(eq(fxProfitsTable.transactionId, transactionId))
    .orderBy(desc(fxProfitsTable.createdAt))
    .limit(1);
  return fx ?? undefined;
}

export function makePawaPayGatewayMeta(input: {
  amount: number;
  currency: string;
  provider: string;
  phoneNumber: string;
  countryCode: string;
  gatewayConfigId?: string | null;
}): string {
  const country = input.countryCode.trim().toUpperCase();
  return JSON.stringify({
    expectedAmount: String(input.amount),
    expectedCurrency: input.currency.trim().toUpperCase(),
    expectedProvider: input.provider.trim().toUpperCase(),
    expectedPhoneNumber: input.phoneNumber.replace(/\D/g, ""),
    expectedCountry: ISO2_TO_ISO3[country] ?? country,
    gatewayConfigId: input.gatewayConfigId ?? null,
  } satisfies PawaPayGatewayMeta);
}

/**
 * Resolve the same account used to initiate a persisted dynamic-route deposit.
 * A stored gateway identity must never fall through to unrelated global credentials.
 */
export async function getPawaPayClientForDeposit(
  deposit: Pick<StoredDeposit, "gatewayMeta">,
  database: typeof db | any = db,
): Promise<PawaPayClient | null> {
  const gatewayConfigId = parsePawaPayMeta(deposit.gatewayMeta).gatewayConfigId;
  if (gatewayConfigId) {
    const [gateway] = await database.select({
      id: paymentGatewaysTable.id,
      slug: paymentGatewaysTable.slug,
      apiKey: paymentGatewaysTable.apiKey,
      active: paymentGatewaysTable.active,
    }).from(paymentGatewaysTable)
      .where(eq(paymentGatewaysTable.id, gatewayConfigId))
      .limit(1);
    if (!gateway || !gateway.active || !gateway.slug.toLowerCase().includes("pawapay") || !gateway.apiKey?.trim()) {
      return null;
    }
    const credentials = await resolvePawaPayCredentials(gateway.apiKey);
    return credentials ? new PawaPayClient(credentials.token, credentials.env) : null;
  }

  const credentials = await resolvePawaPayCredentials();
  return credentials ? new PawaPayClient(credentials.token, credentials.env) : null;
}

export async function settleVerifiedPawaPayDeposit(
  externalDepositId: string,
  data: PawaPayDepositData,
  database: typeof db | any = db,
): Promise<PawaPaySettlementOutcome> {
  return database.transaction(async (tx: any) => {
    const [deposit] = await tx.select().from(transactionsTable)
      .where(and(
        eq(transactionsTable.externalDepositId, externalDepositId),
        eq(transactionsTable.type, "recharge"),
      ))
      .for("update");
    if (!deposit || deposit.status !== "pending") {
      return { settled: false, failed: false, ignored: true };
    }

    const fx = await getFxExpectedAmount(tx, deposit.id);
    const expected = normalizePawaPayExpected(deposit, fx);
    if (!expected || !pawaPayStatusMatches(externalDepositId, expected, data)) {
      return { settled: false, failed: false, ignored: true };
    }

    if (data.status !== "COMPLETED" && data.status !== "FAILED") {
      return { settled: false, failed: false, ignored: false };
    }

    const finalStatus = data.status === "COMPLETED" ? "completed" : "failed";
    const [updated] = await tx.update(transactionsTable)
      .set({ status: finalStatus })
      .where(and(
        eq(transactionsTable.id, deposit.id),
        eq(transactionsTable.status, "pending"),
      ))
      .returning({ id: transactionsTable.id });
    if (!updated) return { settled: false, failed: false, ignored: true };

    if (finalStatus === "completed") {
      await tx.update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${deposit.amount}` })
        .where(eq(usersTable.id, deposit.userId));
      await tx.update(fxProfitsTable)
        .set({ status: "completed" })
        .where(eq(fxProfitsTable.transactionId, deposit.id));
      return {
        settled: true,
        failed: false,
        ignored: false,
        transactionId: deposit.id,
        userId: deposit.userId,
        amount: deposit.amount,
      };
    }

    await tx.update(fxProfitsTable)
      .set({ status: "failed" })
      .where(eq(fxProfitsTable.transactionId, deposit.id));
    return { settled: false, failed: true, ignored: false, transactionId: deposit.id };
  });
}

/** Fail an initiation only when the caller has definitive rejection evidence. */
export async function failPawaPayDeposit(
  externalDepositId: string,
  database: typeof db | any = db,
): Promise<boolean> {
  return database.transaction(async (tx: any) => {
    const [deposit] = await tx.select().from(transactionsTable)
      .where(and(
        eq(transactionsTable.externalDepositId, externalDepositId),
        eq(transactionsTable.type, "recharge"),
      ))
      .for("update");
    if (!deposit || deposit.status !== "pending") return false;

    const [failed] = await tx.update(transactionsTable)
      .set({ status: "failed" })
      .where(and(
        eq(transactionsTable.id, deposit.id),
        eq(transactionsTable.status, "pending"),
      ))
      .returning({ id: transactionsTable.id });
    if (!failed) return false;

    await tx.update(fxProfitsTable)
      .set({ status: "failed" })
      .where(eq(fxProfitsTable.transactionId, deposit.id));
    return true;
  });
}

export async function verifyAndSettlePawaPayDeposit(
  externalDepositId: string,
  client: Pick<PawaPayClient, "getDepositStatus">,
  database: typeof db | any = db,
): Promise<PawaPaySettlementOutcome> {
  const result: PawaPayDepositSearchResult = await client.getDepositStatus(externalDepositId);
  if (result.status !== "FOUND" || !result.data) {
    return { settled: false, failed: false, ignored: false };
  }
  return settleVerifiedPawaPayDeposit(externalDepositId, result.data, database);
}
