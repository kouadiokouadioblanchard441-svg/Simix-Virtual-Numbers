import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  countriesTable,
  currenciesTable,
  countryPaymentConfigsTable,
  mobileOperatorsTable,
  paymentGatewaysTable,
  paymentMethodsTable,
  paymentRoutesTable,
} from "@workspace/db";
import { ClapayClient, clapayOperatorSupportsMethod, type ClapayCountry, type ClapayOperator } from "./clapay";
import { resolveClapayCredentials } from "./gateway-credentials";
import { logger } from "./logger";
import { resolvePaymentRoute } from "../routes/admin-payment-routing";
import { resolveWalletGateway } from "./wallet-gateway";

export interface ClapaySyncResult {
  success: boolean;
  dryRun: boolean;
  activate: boolean;
  countriesChecked: number;
  countriesAdded: number;
  operatorsFound: number;
  methodsAdded: number;
  operatorsAdded: number;
  configsAdded: number;
  configsActivated: number;
  associationsAdded: number;
  reviewRequired: number;
  defaultsUsed: Array<{ countryCode: string; methodSlug: string; minDeposit: number; feePercent: number }>;
  errors: Array<{ countryCode: string | null; message: string }>;
  blocked: Array<{ countryCode: string; operatorName: string; reason: string }>;
}

export interface ClapayCatalogueSource {
  getCountries(): Promise<ClapayCountry[]>;
  getOperators(countryCode: string): Promise<ClapayOperator[]>;
}

export interface CatalogueSyncRepository {
  applyOperator(input: {
    country: ClapayCountry;
    operator: ClapayOperator;
    methodSlug: string;
    methodName: string;
    operatorSlug: string;
    operatorName: string;
    activate: boolean;
    dryRun: boolean;
  }): Promise<{
    methodAdded: boolean; operatorAdded: boolean; configAdded: boolean;
    configActivated: boolean; associationAdded: boolean;
    countryAdded?: boolean;
    configSettings?: { minDeposit: number; feePercent: number; usedDefaults: boolean };
    blockedReason?: string;
  }>;
}

export interface CatalogueSyncDependencies {
  source: ClapayCatalogueSource;
  repository: CatalogueSyncRepository;
  verifyClapayRouting?: (countryCode: string, operatorSlug: string) => Promise<boolean>;
}

const OPERATOR_ALIASES: Record<string, { slug: string; methodSlug: string; methodName: string; operatorName: string }> = {
  om: { slug: "orange", methodSlug: "orange_money", methodName: "Orange Money", operatorName: "Orange Money" },
  orange: { slug: "orange", methodSlug: "orange_money", methodName: "Orange Money", operatorName: "Orange Money" },
  orangemoney: { slug: "orange", methodSlug: "orange_money", methodName: "Orange Money", operatorName: "Orange Money" },
  mtn: { slug: "mtn", methodSlug: "mtn_money", methodName: "MTN Mobile Money", operatorName: "MTN Mobile Money" },
  wave: { slug: "wave", methodSlug: "wave", methodName: "Wave", operatorName: "Wave" },
  airtel: { slug: "airtel", methodSlug: "airtel_money", methodName: "Airtel Money", operatorName: "Airtel Money" },
  airtelmoney: { slug: "airtel", methodSlug: "airtel_money", methodName: "Airtel Money", operatorName: "Airtel Money" },
  moov: { slug: "moov", methodSlug: "moov_money", methodName: "Moov Money", operatorName: "Moov Africa" },
  flooz: { slug: "flooz", methodSlug: "flooz", methodName: "Flooz", operatorName: "Flooz" },
  tmoney: { slug: "tmoney", methodSlug: "tmoney", methodName: "T-Money", operatorName: "T-Money" },
  mpesa: { slug: "mpesa", methodSlug: "mpesa", methodName: "M-Pesa", operatorName: "M-Pesa" },
  vodacom: { slug: "vodacom", methodSlug: "vodacom_mpesa", methodName: "Vodacom M-Pesa", operatorName: "Vodacom M-Pesa" },
  vodafone: { slug: "vodafone", methodSlug: "vodafone_cash", methodName: "Vodafone Cash", operatorName: "Vodafone Cash" },
  vodafonecash: { slug: "vodafone", methodSlug: "vodafone_cash", methodName: "Vodafone Cash", operatorName: "Vodafone Cash" },
  tigo: { slug: "tigo", methodSlug: "tigo_money", methodName: "Tigo Cash", operatorName: "Tigo Cash" },
  halotel: { slug: "halotel", methodSlug: "halotel_money", methodName: "Halotel Money", operatorName: "Halotel Money" },
  telecel: { slug: "telecel", methodSlug: "telecel_cash", methodName: "Telecel Cash", operatorName: "Telecel Cash" },
  wizall: { slug: "wizall", methodSlug: "wizall_money", methodName: "Wizall Money", operatorName: "Wizall Money" },
  africell: { slug: "africell", methodSlug: "africell_money", methodName: "Africell", operatorName: "Africell" },
  zamtel: { slug: "zamtel", methodSlug: "zamtel", methodName: "Zamtel Kwacha", operatorName: "Zamtel Kwacha" },
  econet: { slug: "econet", methodSlug: "econet", methodName: "EcoCash", operatorName: "EcoCash" },
  tnm: { slug: "tnm", methodSlug: "tnm_money", methodName: "TNM Mpamba", operatorName: "TNM Mpamba" },
  opay: { slug: "opay", methodSlug: "opay", methodName: "OPay", operatorName: "OPay" },
  mynita: { slug: "mynita", methodSlug: "mynita", methodName: "MyNita", operatorName: "MyNita" },
  amana: { slug: "amana", methodSlug: "amana", methodName: "Amana", operatorName: "Amana" },
  zamani: { slug: "zamani", methodSlug: "zamani", methodName: "Zamani", operatorName: "Zamani" },
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mapClapayOperator(operator: ClapayOperator): { operatorSlug: string; operatorName: string; methodSlug: string; methodName: string } | null {
  const code = normalize(operator.codeoperator ?? "");
  const name = normalize(operator.name ?? "");
  const known = OPERATOR_ALIASES[code] ?? OPERATOR_ALIASES[name];
  if (known) return { operatorSlug: known.slug, operatorName: known.operatorName, methodSlug: known.methodSlug, methodName: known.methodName };
  if (!operator.name?.trim() || !operator.codeoperator?.trim()) return null;
  const fallbackSlug = normalize(operator.name);
  if (!fallbackSlug) return null;
  return {
    operatorSlug: fallbackSlug,
    operatorName: operator.name.trim(),
    methodSlug: fallbackSlug,
    methodName: operator.name.trim(),
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!);
    }
  }));
  return results;
}

export async function syncClapayCatalogue(
  options: { activate?: boolean; dryRun?: boolean } = {},
  dependencies?: CatalogueSyncDependencies,
): Promise<ClapaySyncResult> {
  const activate = options.activate === true;
  const dryRun = options.dryRun === true;
  const result: ClapaySyncResult = {
    success: true, dryRun, activate, countriesChecked: 0, countriesAdded: 0, operatorsFound: 0,
    methodsAdded: 0, operatorsAdded: 0, configsAdded: 0, configsActivated: 0,
    associationsAdded: 0, reviewRequired: 0, defaultsUsed: [], errors: [], blocked: [],
  };
  const deps = dependencies ?? {
    source: createClapayCatalogueSource(),
    repository: createDatabaseRepository(),
    verifyClapayRouting: async (countryCode: string, operatorSlug: string) =>
      (await resolveWalletGateway(countryCode, operatorSlug, 0)).gateway === "clapay",
  };

  let countries: ClapayCountry[];
  try {
    countries = await deps.source.getCountries();
  } catch {
    result.success = false;
    result.errors.push({ countryCode: null, message: "Clapay country catalogue request failed or timed out." });
    return result;
  }

  const uniqueCountries = new Map<string, ClapayCountry>();
  for (const country of countries) {
    const code = country.code?.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code ?? "") && country.currency?.trim()) uniqueCountries.set(code!, { ...country, code: code! });
  }
  result.countriesChecked = uniqueCountries.size;

  await mapWithConcurrency(Array.from(uniqueCountries.values()), 2, async country => {
    let operators: ClapayOperator[];
    try {
      operators = await deps.source.getOperators(country.code);
    } catch {
      result.success = false;
      result.errors.push({ countryCode: country.code, message: "Clapay operator catalogue request failed or timed out; no records changed for this country." });
      return;
    }
    for (const operator of operators) {
      if (!clapayOperatorSupportsMethod(operator, "MERCHANT")) continue;
      result.operatorsFound++;
      const routeBlock = (operator as ClapayOperator & { __syncBlockedReason?: string }).__syncBlockedReason;
      if (routeBlock) {
        result.reviewRequired++;
        result.blocked.push({ countryCode: country.code, operatorName: String(operator.name ?? "Unknown operator").slice(0, 100), reason: routeBlock });
        continue;
      }
      const mapped = mapClapayOperator(operator);
      if (!mapped) {
        result.reviewRequired++;
        result.blocked.push({ countryCode: country.code, operatorName: String(operator.name ?? "Unknown operator").slice(0, 100), reason: "Cannot map this active operator to a stable local payment method." });
        continue;
      }
      try {
        if (deps.verifyClapayRouting && !await deps.verifyClapayRouting(country.code, mapped.operatorSlug)) {
          result.reviewRequired++;
          result.blocked.push({
            countryCode: country.code, operatorName: mapped.operatorName,
            reason: "The current country/operator route does not resolve to a configured Clapay gateway; routing was left unchanged.",
          });
          continue;
        }
        const change = await deps.repository.applyOperator({
          country, operator, ...mapped, activate, dryRun,
        });
        result.countriesAdded += Number(change.countryAdded ?? false);
        result.methodsAdded += Number(change.methodAdded);
        result.operatorsAdded += Number(change.operatorAdded);
        result.configsAdded += Number(change.configAdded);
        result.configsActivated += Number(change.configActivated);
        result.associationsAdded += Number(change.associationAdded);
        if (change.configAdded && change.configSettings?.usedDefaults) {
          result.defaultsUsed.push({
            countryCode: country.code, methodSlug: mapped.methodSlug,
            minDeposit: change.configSettings.minDeposit, feePercent: change.configSettings.feePercent,
          });
        }
        if (change.blockedReason) {
          result.reviewRequired++;
          result.blocked.push({ countryCode: country.code, operatorName: mapped.operatorName, reason: change.blockedReason });
        } else if (!activate && (change.methodAdded || change.operatorAdded || change.configAdded || change.associationAdded)) {
          result.reviewRequired++;
          result.blocked.push({
            countryCode: country.code, operatorName: mapped.operatorName,
            reason: "New catalogue records were added inactive; administrator review is required before enabling them.",
          });
        }
      } catch {
        result.success = false;
        result.errors.push({ countryCode: country.code, message: "Could not safely synchronize this operator; its records were not overwritten." });
      }
    }
  });
  result.success = result.success && result.errors.length === 0;
  return result;
}

function createClapayCatalogueSource(): ClapayCatalogueSource {
  let globalClientPromise: Promise<ClapayClient> | null = null;
  let activeProviderRequests = 0;
  const requestQueue: Array<() => void> = [];
  const withProviderLimit = async <T>(request: () => Promise<T>): Promise<T> => {
    if (activeProviderRequests >= 2) await new Promise<void>(resolve => requestQueue.push(resolve));
    activeProviderRequests++;
    try {
      return await request();
    } finally {
      activeProviderRequests--;
      requestQueue.shift()?.();
    }
  };
  const getGlobalClient = () => globalClientPromise ??= (async () => {
    const creds = await resolveClapayCredentials();
    if (!creds) throw new Error("Clapay global account is not configured");
    return new ClapayClient(creds.token, creds.baseUrl, 12_000);
  })();

  return {
    async getCountries() {
      return withProviderLimit(async () => (await getGlobalClient()).getCountries());
    },
    async getOperators(countryCode) {
      const known = await db.select({ slug: mobileOperatorsTable.slug })
        .from(mobileOperatorsTable);
      const clients = new Map<string, ClapayClient>();
      const routing = new Map<string, { kind: "clapay"; key: string } | { kind: "other" }>();
      for (const { slug } of known) {
        const route = await resolvePaymentRoute(countryCode, slug, "deposit");
        if (!route) continue;
        if (!route.gatewaySlug.toLowerCase().includes("clapay") || !route.apiKey?.trim()) {
          routing.set(slug, { kind: "other" });
          continue;
        }
        const client = new ClapayClient(route.apiKey, route.apiUrl ?? undefined, 12_000);
        const key = client.getCatalogueCacheKey();
        clients.set(key, client);
        routing.set(slug, { kind: "clapay", key });
      }
      let globalKey: string | null = null;
      const defaultForUnroutedOperator = await resolveWalletGateway(countryCode, "clapay-catalogue-discovery", 0);
      if (defaultForUnroutedOperator.gateway === "clapay") {
        const global = await getGlobalClient();
        globalKey = global.getCatalogueCacheKey();
        clients.set(globalKey, global);
      }
      const all: ClapayOperator[] = [];
      const byIdentity = new Map<string, ClapayOperator>();
      await mapWithConcurrency(Array.from(clients.entries()), 2, async ([clientKey, client]) => {
        const catalogue = await withProviderLimit(() => client.getOperators(countryCode));
        for (const operator of catalogue) {
          const identity = `${normalize(operator.codeoperator ?? "")}:${normalize(operator.name ?? "")}`;
          const mapped = mapClapayOperator(operator);
          const route = mapped ? routing.get(mapped.operatorSlug) : undefined;
          let blockedReason: string | undefined;
          if (route?.kind === "other") {
            blockedReason = "This country/operator currently routes through another gateway; the sync will not switch its provider.";
          } else if (route?.kind === "clapay" && route.key !== clientKey) {
            continue;
          } else if (!route && globalKey !== clientKey) {
            continue;
          }
          const resultOperator = blockedReason
            ? { ...operator, __syncBlockedReason: blockedReason } as ClapayOperator
            : operator;
          if (!byIdentity.has(identity) || !blockedReason) byIdentity.set(identity, resultOperator);
        }
      });
      all.push(...byIdentity.values());
      return all;
    },
  };
}

function createDatabaseRepository(): CatalogueSyncRepository {
  return {
    async applyOperator(input) {
      return db.transaction(async tx => {
        const countryCode = input.country.code.toUpperCase();
        const [currency] = await tx.select({ currencyCode: currenciesTable.currencyCode })
          .from(currenciesTable).where(and(
            eq(currenciesTable.countryCode, countryCode),
            eq(currenciesTable.active, true),
            eq(currenciesTable.currencyCode, input.country.currency.toUpperCase()),
          )).limit(1);
        const hasMatchingFx = Boolean(currency);
        let [country] = await tx.select().from(countriesTable).where(eq(countriesTable.code, countryCode)).limit(1);
        let countryAdded = false;
        if (!country) {
          const [reference] = await tx.select({ price: countriesTable.price })
            .from(currenciesTable)
            .innerJoin(countriesTable, eq(currenciesTable.countryCode, countriesTable.code))
            .where(and(
              eq(currenciesTable.currencyCode, input.country.currency.toUpperCase()),
              eq(currenciesTable.active, true),
            )).limit(1);
          if (!hasMatchingFx) {
            return { methodAdded: false, operatorAdded: false, configAdded: false, configActivated: false, associationAdded: false, blockedReason: "An active matching country currency/FX row is missing; no country metadata or pricing was fabricated." };
          }
          if (!reference) {
            return { methodAdded: false, operatorAdded: false, configAdded: false, configActivated: false, associationAdded: false, blockedReason: "No existing country price is available for this currency; country creation requires manual pricing review." };
          }
          const flag = [...countryCode].map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
          const dialCode = input.country.indicatif.trim().startsWith("+") ? input.country.indicatif.trim() : `+${input.country.indicatif.trim()}`;
          const inserted = input.dryRun ? [] : await tx.insert(countriesTable).values({
            code: countryCode, name: input.country.name, dialCode, flag, price: reference.price,
            available: 0, enabled: false, numbersEnabled: false,
          }).onConflictDoNothing().returning();
          countryAdded = input.dryRun || inserted.length > 0;
          [country] = await tx.select().from(countriesTable).where(eq(countriesTable.code, countryCode)).limit(1);
          if (countryAdded || !country) {
            return {
              methodAdded: false, operatorAdded: false, configAdded: false, configActivated: false,
              associationAdded: false, countryAdded,
              blockedReason: "Country metadata was added disabled with a same-currency price reference; enable and review country pricing before adding deposit methods.",
            };
          }
        }
        if (!country.enabled) {
          return { methodAdded: false, operatorAdded: false, configAdded: false, configActivated: false, associationAdded: false, countryAdded, blockedReason: "Country is disabled in the admin country catalogue; its status was preserved." };
        }

        let methodAdded = false;
        let operatorAdded = false;
        let configAdded = false;
        let configActivated = false;
        let associationAdded = false;
        let blockedReason = hasMatchingFx
          ? undefined
          : "An active matching country currency/FX row is missing; catalogue records were imported, but the payment configuration remains disabled pending currency review.";
        const [method] = await tx.select({ slug: paymentMethodsTable.slug }).from(paymentMethodsTable)
          .where(eq(paymentMethodsTable.slug, input.methodSlug)).limit(1);
        if (!method && !input.dryRun) {
          const inserted = await tx.insert(paymentMethodsTable).values({
            slug: input.methodSlug, name: input.methodName, description: `Mobile Money · ${input.methodName}`,
          }).onConflictDoNothing().returning({ slug: paymentMethodsTable.slug });
          methodAdded = inserted.length > 0;
        } else methodAdded = !method;

        let [existingOperator] = await tx.select().from(mobileOperatorsTable)
          .where(eq(mobileOperatorsTable.slug, input.operatorSlug)).limit(1);
        if (!existingOperator) {
          if (!input.dryRun) {
            const inserted = await tx.insert(mobileOperatorsTable).values({
              slug: input.operatorSlug, name: input.operatorName, countryCodes: [countryCode],
              // The row is technical catalogue metadata. Future discoveries
              // remain unavailable to customers because their country config
              // is inserted disabled until admin approval.
              active: true, sortOrder: 100,
            }).onConflictDoNothing().returning({ slug: mobileOperatorsTable.slug });
            operatorAdded = inserted.length > 0;
            if (!operatorAdded) {
              [existingOperator] = await tx.select().from(mobileOperatorsTable)
                .where(eq(mobileOperatorsTable.slug, input.operatorSlug)).limit(1);
            }
          } else operatorAdded = true;
          associationAdded = operatorAdded || input.dryRun;
        }
        if (existingOperator) {
          const freshCountryCodes: unknown[] = Array.isArray(existingOperator.countryCodes)
            ? existingOperator.countryCodes as unknown[]
            : [];
          const alreadyPresent = freshCountryCodes.some(code => String(code).toUpperCase() === countryCode);
          if (!alreadyPresent) {
            associationAdded = true;
            if (!input.dryRun) {
              const updated = await tx.update(mobileOperatorsTable).set({
                countryCodes: sql`CASE WHEN ${mobileOperatorsTable.countryCodes} @> ${JSON.stringify([countryCode])}::jsonb THEN ${mobileOperatorsTable.countryCodes} ELSE ${mobileOperatorsTable.countryCodes} || ${JSON.stringify([countryCode])}::jsonb END`,
              }).where(and(
                eq(mobileOperatorsTable.id, existingOperator.id),
                sql`NOT (${mobileOperatorsTable.countryCodes} @> ${JSON.stringify([countryCode])}::jsonb)`,
              )).returning({ id: mobileOperatorsTable.id });
              associationAdded = updated.length > 0;
            }
          }
          if (!existingOperator.active && input.activate && hasMatchingFx) {
            const routes = await tx.select({
              primaryGatewayId: paymentRoutesTable.primaryGatewayId,
              secondaryGatewayId: paymentRoutesTable.secondaryGatewayId,
              tertiaryGatewayId: paymentRoutesTable.tertiaryGatewayId,
            }).from(paymentRoutesTable).where(eq(paymentRoutesTable.operatorSlug, input.operatorSlug));
            const routeGatewayIds = [...new Set(routes.flatMap(route => [route.primaryGatewayId, route.secondaryGatewayId, route.tertiaryGatewayId].filter((id): id is string => Boolean(id))))];
            const gateways = routeGatewayIds.length
              ? await tx.select({ id: paymentGatewaysTable.id, slug: paymentGatewaysTable.slug }).from(paymentGatewaysTable).where(inArray(paymentGatewaysTable.id, routeGatewayIds))
              : [];
            if (gateways.some(gateway => !gateway.slug.toLowerCase().includes("clapay"))) {
              blockedReason = "The shared operator is inactive but also routes through another gateway; global reactivation requires separate admin review.";
            } else {
              if (!input.dryRun) await tx.update(mobileOperatorsTable).set({ active: true }).where(eq(mobileOperatorsTable.id, existingOperator.id));
            }
          }
        }

        const [config] = await tx.select().from(countryPaymentConfigsTable).where(and(
          eq(countryPaymentConfigsTable.countryCode, countryCode),
          eq(countryPaymentConfigsTable.methodSlug, input.methodSlug),
        )).limit(1);
        const localConfigs = !config
          ? await tx.select({
            minDeposit: countryPaymentConfigsTable.minDeposit,
            feePercent: countryPaymentConfigsTable.feePercent,
          }).from(countryPaymentConfigsTable).where(eq(countryPaymentConfigsTable.countryCode, countryCode)).limit(1)
          : [];
        const configSettings = !config ? {
          minDeposit: localConfigs[0]?.minDeposit ?? 500,
          feePercent: localConfigs[0]?.feePercent ?? 0,
          usedDefaults: localConfigs.length === 0,
        } : undefined;
        if (!config) {
          configAdded = true;
          if (!input.dryRun) {
            await tx.insert(countryPaymentConfigsTable).values({
              countryCode, methodSlug: input.methodSlug, enabled: input.activate && hasMatchingFx && !blockedReason,
              minDeposit: configSettings!.minDeposit,
              feePercent: configSettings!.feePercent,
            }).onConflictDoNothing();
          }
        } else if (!config.enabled && input.activate && hasMatchingFx && !blockedReason) {
          configActivated = true;
          if (!input.dryRun) await tx.update(countryPaymentConfigsTable).set({ enabled: true }).where(eq(countryPaymentConfigsTable.id, config.id));
        }
        return { methodAdded, operatorAdded, configAdded, configActivated, associationAdded, countryAdded, configSettings, blockedReason };
      });
    },
  };
}

export function createMockCatalogueDependencies(input: CatalogueSyncDependencies): CatalogueSyncDependencies {
  return input;
}

export function logClapaySyncSummary(result: ClapaySyncResult): void {
  logger.info({
    success: result.success, dryRun: result.dryRun, activate: result.activate,
    countriesChecked: result.countriesChecked, operatorsFound: result.operatorsFound,
    methodsAdded: result.methodsAdded, operatorsAdded: result.operatorsAdded,
    configsAdded: result.configsAdded, configsActivated: result.configsActivated,
    associationsAdded: result.associationsAdded, reviewRequired: result.reviewRequired,
    errors: result.errors.length, blocked: result.blocked.length,
  }, "[Clapay catalogue sync]");
}