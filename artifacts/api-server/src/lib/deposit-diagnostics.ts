import {
  clapayOperatorRequiresOtp, clapayOperatorSupportsMethod, findClapayOperator,
  type ClapayClient, type ClapayCountry, type ClapayOperator,
} from "./clapay";

export type DepositDiagnosticStatus =
  | "catalogue_available" | "catalogue_access_failed" | "country_missing"
  | "operator_missing" | "operator_inactive" | "method_denied"
  | "operator_code_missing" | "configuration_unavailable" | "route_unavailable" | "not_clapay";

export interface DepositDiagnosticRow {
  countryCode: string;
  methodSlug: string;
  methodName: string;
  gateway: "clapay" | "pawapay" | null;
  routingSource: "dynamic" | "legacy" | null;
  status: DepositDiagnosticStatus;
  operatorCode: string | null;
  metadataMissing: boolean;
  requiresOtp: boolean | null;
  checkedAt: string | null;
}

export function classifyDepositOperator(
  country: string, method: string, operators: ClapayOperator[],
): Pick<DepositDiagnosticRow, "status" | "operatorCode" | "metadataMissing" | "requiresOtp"> {
  // Use the same eligible-first choice as the deposit itself. Only look among
  // unavailable entries if the deposit cannot resolve any eligible operator.
  const operator = findClapayOperator(operators.filter(op => clapayOperatorSupportsMethod(op, "MERCHANT")), country, method)
    ?? findClapayOperator(operators, country, method);
  if (!operator) return { status: "operator_missing", operatorCode: null, metadataMissing: false, requiresOtp: null };
  const operatorCode = typeof operator.codeoperator === "string" && operator.codeoperator.trim()
    ? operator.codeoperator : null;
  const metadataMissing = !operator.code || !Object.hasOwn(operator.code, "MERCHANT");
  const requiresOtp = typeof operator.otpstarter?.MERCHANT === "boolean"
    ? clapayOperatorRequiresOtp(operator) : null;
  const status = operator.active !== true ? "operator_inactive"
    : !operatorCode ? "operator_code_missing"
    : !clapayOperatorSupportsMethod(operator, "MERCHANT") ? "method_denied"
    : "catalogue_available";
  return { status, operatorCode, metadataMissing, requiresOtp };
}

type CatalogueResult<T> = { ok: true; data: T; checkedAt: string } | { ok: false; checkedAt: string };

/**
 * Process-wide bounded cache + single-flight + semaphore. Failure results are
 * cached too. Keys include the actual account/URL fingerprint, not just country
 * or gateway ID: credential changes cannot reuse another account's catalogue.
 */
export class DepositCatalogueCache {
  private entries = new Map<string, { expiresAt: number; pending: Promise<CatalogueResult<unknown>> }>();
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(
    private readonly ttlMs = 60_000,
    private readonly concurrency = 3,
    private readonly maxEntries = 200,
    private readonly now = () => Date.now(),
  ) {}

  private async limited<T>(load: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) await new Promise<void>(resolve => this.waiters.push(resolve));
    else this.active++;
    try { return await load(); }
    finally {
      const next = this.waiters.shift();
      if (next) next(); // transfer this slot to the queued request
      else this.active--;
    }
  }

  private async get<T>(key: string, load: () => Promise<T>): Promise<CatalogueResult<T>> {
    const now = this.now();
    for (const [k, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(k);
    }
    const cached = this.entries.get(key);
    if (cached) return cached.pending as Promise<CatalogueResult<T>>;
    if (this.entries.size >= this.maxEntries) {
      // Never evict in-flight requests (which would defeat deduplication).
      const completed = [...this.entries].find(([, entry]) => Number.isFinite(entry.expiresAt));
      if (completed) this.entries.delete(completed[0]);
      else return { ok: false, checkedAt: new Date(now).toISOString() };
    }
    const entry = { expiresAt: Infinity, pending: null as unknown as Promise<CatalogueResult<T>> };
    entry.pending = this.limited(async () => {
      let result: CatalogueResult<T>;
      try { result = { ok: true, data: await load(), checkedAt: new Date(this.now()).toISOString() }; }
      catch {
        // No raw provider errors, credentials, URLs, instructions or payloads
        // are exposed. An access failure says nothing about method eligibility.
        result = { ok: false, checkedAt: new Date(this.now()).toISOString() };
      }
      entry.expiresAt = this.now() + this.ttlMs;
      return result;
    });
    this.entries.set(key, entry);
    return entry.pending;
  }

  async check(client: ClapayClient, country: string, method: string) {
    const account = client.getCatalogueCacheKey();
    const countries = await this.get<ClapayCountry[]>(`${account}:countries`, async () => {
      const result = await client.getCountries();
      if (!Array.isArray(result) || result.some(c => !c || typeof c.code !== "string")) throw new Error("Invalid catalogue");
      return result;
    });
    if (!countries.ok) return { status: "catalogue_access_failed" as const, checkedAt: countries.checkedAt };
    if (!countries.data.some(c => c.code.toUpperCase() === country.toUpperCase())) {
      return { status: "country_missing" as const, checkedAt: countries.checkedAt };
    }
    const operators = await this.get<ClapayOperator[]>(`${account}:operators:${country.toUpperCase()}`, async () => {
      const result = await client.getOperators(country);
      if (!Array.isArray(result) || result.some(op => !op || typeof op !== "object" || Array.isArray(op)
        || (typeof op.name !== "string" && typeof op.codeoperator !== "string"))) throw new Error("Invalid catalogue");
      return result;
    });
    if (!operators.ok) return { status: "catalogue_access_failed" as const, checkedAt: operators.checkedAt };
    return { ...classifyDepositOperator(country, method, operators.data), checkedAt: operators.checkedAt };
  }
}

export interface EnabledDepositMethod { countryCode: string; methodSlug: string; methodName: string | null }
export interface DiagnosticGateway {
  gateway: "clapay" | "pawapay" | null;
  routingSource: "dynamic" | "legacy";
  clapayCtx: { client: ClapayClient } | null;
}

/** Dependency boundary keeps all financial write operations out of this control. */
export async function buildDepositDiagnostics(
  methods: EnabledDepositMethod[],
  deps: {
    isEnabledOperator: (method: EnabledDepositMethod) => Promise<boolean>;
    resolveGateway: (country: string, method: string, amount: number) => Promise<DiagnosticGateway>;
    cache: DepositCatalogueCache;
  },
) {
  const rows: DepositDiagnosticRow[] = new Array(methods.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, methods.length) }, async () => {
    while (cursor < methods.length) {
      const index = cursor++;
      const method = methods[index];
      const row: DepositDiagnosticRow = {
        ...method, methodName: method.methodName ?? method.methodSlug,
        gateway: null, routingSource: null, status: "configuration_unavailable",
        operatorCode: null, metadataMissing: false, requiresOtp: null, checkedAt: null,
      };
      rows[index] = row;
      try {
        if (!method.methodName || !await deps.isEnabledOperator(method)) continue;
        const selected = await deps.resolveGateway(method.countryCode, method.methodSlug, 0);
        row.gateway = selected.gateway;
        row.routingSource = selected.routingSource;
        if (!selected.gateway) { row.status = "route_unavailable"; continue; }
        if (selected.gateway !== "clapay") { row.status = "not_clapay"; continue; }
        if (!selected.clapayCtx) { row.status = "route_unavailable"; continue; }
        Object.assign(row, await deps.cache.check(selected.clapayCtx.client, method.countryCode, method.methodSlug));
      } catch {
        row.status = "route_unavailable";
      }
    }
  }));
  return { generatedAt: new Date().toISOString(), cacheTtlSeconds: 60, readOnly: true as const, paymentVerified: false as const, rows };
}