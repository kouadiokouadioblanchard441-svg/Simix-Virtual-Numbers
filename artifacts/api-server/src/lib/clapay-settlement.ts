import { and, eq, isNull, like, sql } from "drizzle-orm";
import { db, fxProfitsTable, transactionsTable, usersTable } from "@workspace/db";
import type { ClapayClient, ClapayGatewayMeta, ClapayPaymentStatusResponse } from "./clapay";
import { normalizeClapayStatus, parseClapayMeta } from "./clapay";

const STATUS_CACHE_MS = 3_000;
const STATUS_CACHE_MAX_ENTRIES = 1_000;
const statusInFlight = new Map<string, Promise<ClapayPaymentStatusResponse>>();
const statusCache = new Map<string, { at: number; value: ClapayPaymentStatusResponse }>();

export type NormalizedClapayGatewayMeta = ClapayGatewayMeta & {
  clapaySignature: string;
  clapayCurrency: string;
  clapayCountry: string;
  localAmount: number;
  trackingId: string;
  method: "MERCHANT";
  initiatedAt: string;
};

type StoredClapayDeposit = typeof transactionsTable.$inferSelect;
type StoredFxAmount = { currency: string; localAmount: string; amountXof: string };

async function loadStoredFxAmount(
  deposit: StoredClapayDeposit,
  database: Pick<typeof db, "select">,
): Promise<StoredFxAmount | undefined> {
  const records = await database.select({
    currency: fxProfitsTable.currency,
    localAmount: fxProfitsTable.localAmount,
    amountXof: fxProfitsTable.amountXof,
  }).from(fxProfitsTable).where(eq(fxProfitsTable.transactionId, deposit.id)).limit(2);
  return records.length === 1 ? records[0] : undefined;
}

export function normalizeClapayMetaFromStoredDeposit(
  deposit: StoredClapayDeposit,
  source: ClapayGatewayMeta,
  fxAmount?: StoredFxAmount,
): NormalizedClapayGatewayMeta | null {
  const externalDepositId = deposit.externalDepositId ?? "";
  if (!externalDepositId.startsWith("clapay:") || !source.clapaySignature) return null;

  const trackingId = externalDepositId.slice("clapay:".length);
  if (!trackingId || (source.trackingId !== undefined && source.trackingId !== trackingId)) return null;
  if (source.method !== undefined && source.method !== "MERCHANT") return null;

  const country = String(source.clapayCountry ?? "").trim().toUpperCase();
  if (!country) return null;

  const storedCurrency = String(source.clapayCurrency ?? "").trim().toUpperCase();
  let currency: string;
  let localAmount: number;
  if (storedCurrency === "XOF" || storedCurrency === "XAF") {
    currency = storedCurrency;
    localAmount = source.localAmount === undefined ? Number(deposit.amount) : Number(source.localAmount);
  } else {
    if (!fxAmount || Number(fxAmount.amountXof) !== deposit.amount) return null;
    currency = String(fxAmount.currency).trim().toUpperCase();
    localAmount = Math.floor(Number(fxAmount.localAmount));
    if (!currency || (storedCurrency && storedCurrency !== currency)) return null;
    if (source.localAmount !== undefined && Number(source.localAmount) !== localAmount) return null;
  }
  if (!Number.isSafeInteger(localAmount) || localAmount <= 0 || source.localAmount === null) return null;

  const createdAt = deposit.createdAt instanceof Date ? deposit.createdAt : new Date(deposit.createdAt);
  const initiatedAt = source.initiatedAt ?? (Number.isNaN(createdAt.getTime()) ? "" : createdAt.toISOString());
  if (!initiatedAt) return null;

  return {
    ...source,
    clapaySignature: source.clapaySignature,
    clapayCurrency: currency,
    clapayCountry: country,
    localAmount,
    operatorCode: source.operatorCode,
    trackingId,
    method: "MERCHANT",
    initiatedAt,
  };
}

export function mergeClapayGatewayMeta(
  current: ClapayGatewayMeta,
  incoming: Partial<ClapayGatewayMeta>,
): ClapayGatewayMeta | null {
  if (
    current.clapaySignature &&
    incoming.clapaySignature &&
    current.clapaySignature !== incoming.clapaySignature
  ) return null;

  const merged: ClapayGatewayMeta = { ...current };
  for (const [key, value] of Object.entries(incoming) as Array<[keyof ClapayGatewayMeta, unknown]>) {
    if (value !== undefined && value !== null) {
      (merged as Record<keyof ClapayGatewayMeta, unknown>)[key] = value;
    }
  }
  return merged;
}

async function loadStoredClapayContext(
  externalDepositId: string,
  incoming: Partial<ClapayGatewayMeta> = {},
  database: typeof db = db,
): Promise<{ deposit: StoredClapayDeposit; meta: NormalizedClapayGatewayMeta } | null> {
  const [deposit] = await database.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.externalDepositId, externalDepositId),
      eq(transactionsTable.type, "recharge"),
    ))
    .limit(1);
  if (!deposit || deposit.status !== "pending") return null;

  const current = parseClapayMeta(deposit.gatewayMeta);
  if (!current) return null;
  const merged = mergeClapayGatewayMeta(current, incoming);
  if (!merged) return null;

  let fxAmount: StoredFxAmount | undefined;
  const currency = String(merged.clapayCurrency ?? "").toUpperCase();
  if (currency !== "XOF" && currency !== "XAF") {
    fxAmount = await loadStoredFxAmount(deposit, database);
  }

  const meta = normalizeClapayMetaFromStoredDeposit(deposit, merged, fxAmount);
  return meta ? { deposit, meta } : null;
}

export async function getClapayDepositMeta(
  externalDepositId: string,
  incoming: Partial<ClapayGatewayMeta> = {},
): Promise<{ deposit: StoredClapayDeposit; meta: NormalizedClapayGatewayMeta } | null> {
  return loadStoredClapayContext(externalDepositId, incoming);
}

export async function persistClapayDepositMeta(
  externalDepositId: string,
  incoming: Partial<ClapayGatewayMeta> = {},
): Promise<NormalizedClapayGatewayMeta | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const context = await loadStoredClapayContext(externalDepositId, incoming);
    if (!context) return null;
    const serialized = JSON.stringify(context.meta);
    if (context.deposit.gatewayMeta === serialized) return context.meta;

    const [updated] = await db.update(transactionsTable)
      .set({ gatewayMeta: serialized })
      .where(and(
        eq(transactionsTable.id, context.deposit.id),
        eq(transactionsTable.externalDepositId, externalDepositId),
        eq(transactionsTable.status, "pending"),
        context.deposit.gatewayMeta === null
          ? isNull(transactionsTable.gatewayMeta)
          : eq(transactionsTable.gatewayMeta, context.deposit.gatewayMeta),
      ))
      .returning({ id: transactionsTable.id });
    if (updated) return context.meta;
  }
  return null;
}

export async function queryClapayStatus(
  client: ClapayClient,
  signature: string,
  force = false,
): Promise<ClapayPaymentStatusResponse> {
  const now = Date.now();
  for (const [cachedSignature, cachedStatus] of statusCache) {
    if (now - cachedStatus.at >= 60_000) statusCache.delete(cachedSignature);
  }
  const cached = statusCache.get(signature);
  if (!force && cached && now - cached.at < STATUS_CACHE_MS) return cached.value;
  const pending = statusInFlight.get(signature);
  if (pending) return pending;

  const request = client.checkPaymentStatus(signature).then(value => {
    statusCache.set(signature, { at: Date.now(), value });
    while (statusCache.size > STATUS_CACHE_MAX_ENTRIES) {
      statusCache.delete(statusCache.keys().next().value!);
    }
    return value;
  }).finally(() => statusInFlight.delete(signature));
  statusInFlight.set(signature, request);
  return request;
}

function statusValue(status: ClapayPaymentStatusResponse, ...keys: string[]): unknown {
  for (const key of keys) {
    if (status[key] !== undefined && status[key] !== null) return status[key];
  }
  return undefined;
}

export function validateClapayStatus(
  status: ClapayPaymentStatusResponse,
  meta: NormalizedClapayGatewayMeta,
  trackingId: string,
): { status: "completed" | "failed" | "pending"; responseStatus: string } {
  const responseStatus = String(status.status ?? status.status_payment ?? "UNKNOWN").trim().toUpperCase();
  const normalized = normalizeClapayStatus(responseStatus);
  if (responseStatus === "UNKNOWN" || responseStatus === "NOT_FOUND") {
    return { status: "pending", responseStatus };
  }

  const transactionId = statusValue(status, "transaction_id", "transactionId");
  const signature = statusValue(status, "signature");
  if (
    String(signature ?? "") !== meta.clapaySignature ||
    String(transactionId ?? "") !== trackingId
  ) {
    throw new Error("Clapay status response does not match the stored payment");
  }

  const amountValue = statusValue(status, "amount");
  const currencyValue = statusValue(status, "currency");
  const methodValue = statusValue(status, "method", "transaction_method");
  const countryValue = statusValue(status, "country", "transaction_country_code");
  const amount = Number(amountValue);
  const currency = String(currencyValue ?? "").toUpperCase();
  const method = String(methodValue ?? "").toUpperCase();
  const country = String(countryValue ?? "").toUpperCase();

  if (normalized === "pending") {
    if (
      (amountValue !== undefined && (!Number.isFinite(amount) || amount !== Number(meta.localAmount))) ||
      (currencyValue !== undefined && currency !== meta.clapayCurrency.toUpperCase()) ||
      (methodValue !== undefined && method !== "MERCHANT") ||
      (countryValue !== undefined && country !== meta.clapayCountry.toUpperCase())
    ) {
      throw new Error("Clapay status response does not match the stored payment");
    }
    return { status: "pending", responseStatus };
  }

  if (
    !Number.isFinite(amount) ||
    amount !== Number(meta.localAmount) ||
    currency !== meta.clapayCurrency.toUpperCase() ||
    method !== "MERCHANT" ||
    country !== meta.clapayCountry.toUpperCase()
  ) {
    throw new Error("Clapay status response does not match the stored payment");
  }

  return { status: normalized, responseStatus };
}

export async function getVerifiedClapayStatus(
  client: ClapayClient,
  meta: NormalizedClapayGatewayMeta,
  trackingId: string,
  force = false,
): Promise<{ status: "completed" | "failed" | "pending"; responseStatus: string } | null> {
  if (!meta.clapaySignature) return null;
  const result = await queryClapayStatus(client, meta.clapaySignature, force);
  const responseStatus = String(result.status ?? result.status_payment ?? "").toUpperCase();
  if (responseStatus === "UNKNOWN" || responseStatus === "NOT_FOUND") return null;
  return validateClapayStatus(result, meta, trackingId);
}

export function getClapayActionFields(meta: ClapayGatewayMeta | null) {
  return {
    gateway: "clapay" as const,
    paymentMode: "API" as const,
    payment_url: null,
    operatorPaymentUrl: meta?.operatorPaymentUrl ?? null,
    paymentOtp: meta?.paymentOtp ?? null,
    message: meta?.message ?? null,
  };
}

export async function settleVerifiedClapayDeposit(
  externalDepositId: string,
  database: typeof db = db,
): Promise<{ settled: boolean; transactionId?: string; userId?: string; amount?: number }> {
  return database.transaction(async (tx) => {
    const [deposit] = await tx.select().from(transactionsTable)
      .where(and(
        eq(transactionsTable.externalDepositId, externalDepositId),
        eq(transactionsTable.type, "recharge"),
      ))
      .for("update");
    if (!deposit || deposit.status !== "pending" || !deposit.externalDepositId?.startsWith("clapay:")) {
      return { settled: false };
    }

    const stored = parseClapayMeta(deposit.gatewayMeta);
    if (!stored) {
      return { settled: false };
    }
    let fxAmount: StoredFxAmount | undefined;
    const currency = String(stored.clapayCurrency ?? "").toUpperCase();
    if (currency !== "XOF" && currency !== "XAF") {
      fxAmount = await loadStoredFxAmount(deposit, tx);
    }
    const meta = normalizeClapayMetaFromStoredDeposit(deposit, stored, fxAmount);
    if (!meta) return { settled: false };

    const normalizedGatewayMeta = JSON.stringify(meta);
    if (deposit.gatewayMeta !== normalizedGatewayMeta) {
      const [upgraded] = await tx.update(transactionsTable)
        .set({ gatewayMeta: normalizedGatewayMeta })
        .where(and(
          eq(transactionsTable.id, deposit.id),
          eq(transactionsTable.status, "pending"),
          deposit.gatewayMeta === null
            ? isNull(transactionsTable.gatewayMeta)
            : eq(transactionsTable.gatewayMeta, deposit.gatewayMeta),
        ))
        .returning({ id: transactionsTable.id });
      if (!upgraded) return { settled: false };
    }

    const [completed] = await tx.update(transactionsTable)
      .set({ status: "completed" })
      .where(and(
        eq(transactionsTable.id, deposit.id),
        eq(transactionsTable.status, "pending"),
        like(transactionsTable.externalDepositId, "clapay:%"),
      ))
      .returning({ id: transactionsTable.id });
    if (!completed) return { settled: false };

    await tx.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${deposit.amount}` })
      .where(eq(usersTable.id, deposit.userId));
    await tx.update(fxProfitsTable)
      .set({ status: "completed" })
      .where(eq(fxProfitsTable.transactionId, deposit.id));

    return {
      settled: true,
      transactionId: deposit.id,
      userId: deposit.userId,
      amount: deposit.amount,
    };
  });
}

export async function failClapayDeposit(
  externalDepositId: string,
  database: typeof db = db,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [deposit] = await tx.select().from(transactionsTable)
      .where(and(
        eq(transactionsTable.externalDepositId, externalDepositId),
        eq(transactionsTable.type, "recharge"),
        eq(transactionsTable.status, "pending"),
        like(transactionsTable.externalDepositId, "clapay:%"),
      ))
      .for("update");
    if (!deposit) return false;

    const [failed] = await tx.update(transactionsTable)
      .set({ status: "failed" })
      .where(and(
        eq(transactionsTable.id, deposit.id),
        eq(transactionsTable.status, "pending"),
        like(transactionsTable.externalDepositId, "clapay:%"),
      ))
      .returning({ id: transactionsTable.id });
    if (!failed) return false;

    await tx.update(fxProfitsTable)
      .set({ status: "failed" })
      .where(eq(fxProfitsTable.transactionId, deposit.id));
    return true;
  });
}