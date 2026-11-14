export interface CryptoSettlementTransaction {
  markPendingCompleted(transactionId: string, payinHash?: string | null): Promise<boolean>;
  creditUserBalance(userId: string, amountFcfa: number): Promise<boolean>;
}

export interface CryptoSettlementDatabase {
  transaction<T>(
    operation: (transaction: CryptoSettlementTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface CryptoSettlementInput {
  transactionId: string;
  userId: string;
  amountFcfa: number;
  payinHash?: string | null;
}

/** Completes the ledger entry and credits the wallet as one atomic operation. */
export async function settleCryptoDepositAtomically(
  database: CryptoSettlementDatabase,
  input: CryptoSettlementInput,
): Promise<boolean> {
  if (!Number.isSafeInteger(input.amountFcfa) || input.amountFcfa <= 0) {
    throw new Error("Invalid crypto deposit credit amount");
  }

  return database.transaction(async (transaction) => {
    const completed = await transaction.markPendingCompleted(
      input.transactionId,
      input.payinHash,
    );
    if (!completed) return false;

    const credited = await transaction.creditUserBalance(
      input.userId,
      input.amountFcfa,
    );
    if (!credited) {
      throw new Error("Crypto deposit owner was not found; rolling back settlement");
    }

    return true;
  });
}

/** Convert a verified partial payment only when both inputs are valid. */
export function partialCryptoAmountToFcfa(
  actuallyPaid: unknown,
  fcfaRate: unknown,
): number | null {
  if (
    (typeof actuallyPaid !== "number" && typeof actuallyPaid !== "string")
    || (typeof actuallyPaid === "string" && actuallyPaid.trim() === "")
  ) return null;

  const paid = Number(actuallyPaid);
  const rate = Number(fcfaRate);
  if (!Number.isFinite(paid) || paid <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const amountFcfa = Math.floor(paid * rate);
  return Number.isSafeInteger(amountFcfa) && amountFcfa > 0
    ? amountFcfa
    : null;
}
