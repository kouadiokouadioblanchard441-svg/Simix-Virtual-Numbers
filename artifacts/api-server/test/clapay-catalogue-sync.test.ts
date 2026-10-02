import test from "node:test";
import assert from "node:assert/strict";
import {
  mapClapayOperator,
  syncClapayCatalogue,
  type CatalogueSyncDependencies,
  type CatalogueSyncRepository,
} from "../src/lib/clapay-catalogue-sync";
import type { ClapayCountry, ClapayOperator } from "../src/lib/clapay";
import { ClapayClient, findClapayOperator, clapayOperatorSupportsMethod } from "../src/lib/clapay";
import { matchesMobileOperatorMethod } from "../src/lib/wallet-payment-classification";
import { extractOperatorSlug } from "../src/lib/payment-router";

function operator(code: string, name: string, overrides: Partial<ClapayOperator> = {}): ClapayOperator {
  return {
    codeoperator: code, name, logo: "", startwith: [], active: true,
    otpstarter: { MERCHANT: false, CASHIN: false, CASHOUT: false },
    secure: { MERCHANT: true, CASHIN: true, CASHOUT: true },
    instruction: {}, ...overrides,
  };
}

const CI: ClapayCountry = { code: "CI", name: "Côte d'Ivoire", currency: "XOF", indicatif: "+225", phone_length: 10 };
const BF: ClapayCountry = { code: "BF", name: "Burkina Faso", currency: "XOF", indicatif: "+226", phone_length: 8 };

function fakeDependencies(catalogues: Record<string, ClapayOperator[]>, blocked: Record<string, string> = {}) {
  const methods = new Set<string>(["orange_money"]);
  const operators = new Map<string, { active: boolean; countries: Set<string> }>([
    ["orange", { active: true, countries: new Set(["CI"]) }],
  ]);
  const configs = new Map<string, { enabled: boolean; minDeposit: number; feePercent: number }>([
    ["CI:orange_money", { enabled: false, minDeposit: 875, feePercent: 6 }],
  ]);
  let operatorListCalls = 0;
  const repository: CatalogueSyncRepository = {
    async applyOperator(input) {
      const key = `${input.country.code}:${input.methodSlug}`;
      const priorMethod = methods.has(input.methodSlug);
      if (!priorMethod && !input.dryRun) methods.add(input.methodSlug);
      let op = operators.get(input.operatorSlug);
      const operatorAdded = !op;
      if (!op && !input.dryRun) {
        op = { active: true, countries: new Set() };
        operators.set(input.operatorSlug, op);
      }
      const associationAdded = !op?.countries.has(input.country.code);
      if (op && associationAdded && !input.dryRun) op.countries.add(input.country.code);
      const blockedReason = blocked[key];
      const priorConfig = configs.get(key);
      const configAdded = !priorConfig;
      let configActivated = false;
      if (!priorConfig && !input.dryRun) {
        configs.set(key, {
          enabled: input.activate && !blockedReason,
          minDeposit: 875,
          feePercent: 6,
        });
      } else if (priorConfig && input.activate && !priorConfig.enabled && !blockedReason) {
        configActivated = true;
        if (!input.dryRun) priorConfig.enabled = true;
      }
      if (input.activate && op && !op.active && !blockedReason && !input.dryRun) op.active = true;
      return {
        methodAdded: !priorMethod, operatorAdded, configAdded, configActivated,
        associationAdded, blockedReason,
      };
    },
  };
  const dependencies: CatalogueSyncDependencies = {
    source: {
      async getCountries() { return [CI, BF]; },
      async getOperators(countryCode) {
        operatorListCalls++;
        return catalogues[countryCode] ?? [];
      },
    },
    repository,
  };
  return { dependencies, methods, operators, configs, get operatorListCalls() { return operatorListCalls; } };
}

test("OM short code and literal provider name resolve to Orange Money, without fabricating a code", () => {
  const om = operator("OM", "OM");
  assert.equal(findClapayOperator([om], "SL", "orange_money"), om);
  assert.equal(findClapayOperator([om], "SL", "OM"), om);
  assert.equal(matchesMobileOperatorMethod("orange_money", "Orange Money", "orange", "OM"), true);
  assert.equal(extractOperatorSlug("OM"), "orange");
  assert.equal(mapClapayOperator(om)?.methodSlug, "orange_money");
  assert.equal(findClapayOperator([operator("UNKNOWN", "Unrelated")], "SL", "orange_money"), null);
});

test("Clapay sync clients apply a bounded transport timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  let timeoutMs = 0;
  try {
    AbortSignal.timeout = ((milliseconds: number) => {
      timeoutMs = milliseconds;
      return new AbortController().signal;
    }) as typeof AbortSignal.timeout;
    globalThis.fetch = async () => new Response("[]", { status: 200 });
    await new ClapayClient("test-token", undefined, 12_000).getCountries();
    assert.equal(timeoutMs, 12_000);
    await new ClapayClient("test-token", undefined, 120_000).getCountries();
    assert.equal(timeoutMs, 30_000);
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});

test("catalogue import is additive, idempotent, and future discoveries remain inactive by default", async () => {
  const fixtures = {
    CI: [operator("OM", "Orange Money"), operator("MYNITA", "MyNita")],
    BF: [operator("OM", "Orange Money")],
  };
  const fake = fakeDependencies(fixtures);
  const first = await syncClapayCatalogue({}, fake.dependencies);
  assert.equal(first.success, true);
  assert.equal(first.activate, false);
  assert.equal(first.countriesAdded, 0);
  assert.equal(first.methodsAdded, 1);
  assert.equal(first.operatorsAdded, 1);
  assert.equal(first.configsAdded, 2);
  assert.equal(first.configsActivated, 0);
  assert.equal(first.reviewRequired, 2);
  assert.equal(fake.configs.get("CI:orange_money")?.enabled, false);
  assert.equal(fake.configs.get("CI:orange_money")?.minDeposit, 875);
  assert.equal(fake.configs.get("CI:orange_money")?.feePercent, 6);
  assert.equal(fake.operators.get("mynita")?.active, true);
  assert.equal(fake.configs.get("CI:mynita")?.enabled, false);
  fake.configs.get("CI:mynita")!.enabled = true;
  assert.equal(matchesMobileOperatorMethod("mynita", "MyNita", "mynita", "MyNita"), true);

  const second = await syncClapayCatalogue({}, fake.dependencies);
  assert.equal(second.methodsAdded, 0);
  assert.equal(second.operatorsAdded, 0);
  assert.equal(second.configsAdded, 0);
  assert.equal(second.associationsAdded, 0);
  assert.equal(second.reviewRequired, 0);
});

test("explicit approved activation enables eligible existing and new configs without changing fees", async () => {
  const fake = fakeDependencies({ CI: [operator("OM", "Orange Money"), operator("AMANA", "Amana")] });
  const result = await syncClapayCatalogue({ activate: true }, fake.dependencies);
  assert.equal(result.activate, true);
  assert.equal(result.configsActivated, 1);
  assert.equal(fake.configs.get("CI:orange_money")?.enabled, true);
  assert.equal(fake.configs.get("CI:orange_money")?.minDeposit, 875);
  assert.equal(fake.configs.get("CI:orange_money")?.feePercent, 6);
  assert.equal(fake.configs.get("CI:amana")?.enabled, true);
  assert.equal(fake.operators.get("amana")?.active, true);
});

test("literal Vodafone name maps to the existing Vodafone Cash operator and method alias", () => {
  assert.deepEqual(mapClapayOperator(operator("VODAFONE", "VodafoneCash")), {
    operatorSlug: "vodafone", operatorName: "Vodafone Cash",
    methodSlug: "vodafone_cash", methodName: "Vodafone Cash",
  });
  assert.equal(mapClapayOperator(operator("AIRTEL", "Airtel Money"))?.operatorSlug, "airtel");
  assert.equal(mapClapayOperator(operator("ZAMANI", "Zamani"))?.methodSlug, "zamani");
  assert.equal(mapClapayOperator(operator("AMANA", "Amana"))?.methodSlug, "amana");
  assert.equal(mapClapayOperator(operator("MYNITA", "MyNita"))?.methodSlug, "mynita");
});

test("new operator remains blocked unless existing wallet routing resolves to Clapay", async () => {
  const fake = fakeDependencies({ CI: [operator("OPAY", "OPay")] });
  const dependencies: CatalogueSyncDependencies = {
    ...fake.dependencies,
    verifyClapayRouting: async () => false,
  };
  const result = await syncClapayCatalogue({ activate: true }, dependencies);
  assert.equal(result.blocked.length, 1);
  assert.match(result.blocked[0]!.reason, /route does not resolve/);
  assert.equal(result.configsAdded, 0);
  assert.equal(fake.operators.has("opay"), false);
});

test("future default and dry run make no activation requests; explicit provider denial is excluded", async () => {
  const fake = fakeDependencies({
    CI: [operator("OM", "Orange Money"), operator("AMANA", "Amana", { code: { MERCHANT: null } })],
  });
  const result = await syncClapayCatalogue({ dryRun: true }, fake.dependencies);
  assert.equal(result.dryRun, true);
  assert.equal(result.operatorsFound, 1);
  assert.equal(result.configsAdded, 0);
  assert.equal(fake.configs.get("CI:orange_money")?.enabled, false);
  assert.equal(fake.methods.has("amana"), false);
  assert.equal(clapayOperatorSupportsMethod(operator("AMANA", "Amana", { code: { MERCHANT: null } }), "MERCHANT"), false);
});

test("summary explicitly reports documented admin-safe defaults for a country with no config baseline", async () => {
  const fake = fakeDependencies({ CI: [operator("OPAY", "OPay")] });
  const baseRepository = fake.dependencies.repository;
  const dependencies: CatalogueSyncDependencies = {
    ...fake.dependencies,
    repository: {
      async applyOperator(input) {
        const change = await baseRepository.applyOperator(input);
        return {
          ...change,
          configSettings: change.configAdded
            ? { minDeposit: 500, feePercent: 0, usedDefaults: true }
            : undefined,
        };
      },
    },
  };
  const result = await syncClapayCatalogue({ dryRun: true }, dependencies);
  assert.deepEqual(result.defaultsUsed, [{ countryCode: "CI", methodSlug: "opay", minDeposit: 500, feePercent: 0 }]);
});

test("missing matching active FX record blocks activation and partial country failure does not stop other countries", async () => {
  const fake = fakeDependencies({ CI: [operator("OM", "Orange Money")], BF: [operator("AIRTEL", "Airtel Money")] }, {
    "BF:airtel_money": "An active matching country currency/FX row is missing; no payment records were changed.",
  });
  const dependencies: CatalogueSyncDependencies = {
    ...fake.dependencies,
    source: {
      async getCountries() { return [CI, BF]; },
      async getOperators(countryCode) {
        if (countryCode === "CI") throw new Error("network details are not exposed");
        return [operator("AIRTEL", "Airtel Money")];
      },
    },
  };
  const result = await syncClapayCatalogue({ activate: true }, dependencies);
  assert.equal(result.success, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.countryCode, "CI");
  assert.equal(result.blocked.some(item => item.countryCode === "BF"), true);
  assert.equal(result.configsActivated, 0);
  assert.equal(result.operatorsAdded, 1);
  assert.equal(result.configsAdded, 1);
  assert.equal(fake.operators.get("airtel")?.active, true);
  assert.equal(fake.configs.get("BF:airtel_money")?.enabled, false);
});

test("country source is called with bounded concurrency and all supported countries are inspected", async () => {
  const fake = fakeDependencies({ CI: [], BF: [] });
  let active = 0;
  let peak = 0;
  const dependencies: CatalogueSyncDependencies = {
    ...fake.dependencies,
    source: {
      async getCountries() { return [CI, BF]; },
      async getOperators() {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        return [];
      },
    },
  };
  const result = await syncClapayCatalogue({}, dependencies);
  assert.equal(result.countriesChecked, 2);
  assert.equal(peak, 2);
});