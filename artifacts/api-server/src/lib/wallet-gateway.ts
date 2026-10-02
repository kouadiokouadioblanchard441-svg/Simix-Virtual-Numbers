import { and, eq, sql } from "drizzle-orm";
import {
  db,
  mobileOperatorsTable,
  systemSettingsTable,
} from "@workspace/db";
import { ClapayClient } from "./clapay";
import { PawaPayClient } from "./pawapay";
import { GatewayRouteUnavailableError, resolveGateway, type RouterResult } from "./payment-router";
import {
  resolvePawaPayCredentials,
  resolveClapayCredentials,
  resolveClapayGatewayCredentials,
} from "./gateway-credentials";
import { matchesMobileOperatorMethod } from "./wallet-payment-classification";

/* ── Load PawaPay client from env or DB ── */
/* ── Credential resolution is centralized in lib/gateway-credentials.ts —
 * see that file for the single documented priority order (DB always wins
 * over env vars) shared by every PawaPay/Clapay code path in the app. ── */
export async function getPawaPayClient(): Promise<{ client: PawaPayClient; env: string } | null> {
  const creds = await resolvePawaPayCredentials();
  if (!creds) return null;
  return { client: new PawaPayClient(creds.token, creds.env), env: creds.env };
}

export async function getClapayClient(gatewayConfigId?: string | null): Promise<{ client: ClapayClient } | null> {
  const creds = gatewayConfigId
    ? await resolveClapayGatewayCredentials(gatewayConfigId)
    : await resolveClapayCredentials();
  if (!creds) return null;
  return { client: new ClapayClient(creds.token, creds.baseUrl) };
}

/* ── Active gateway preference from env or DB ── */
type GatewayPref = "pawapay" | "clapay" | "auto_pawapay_first" | "auto_clapay_first";

async function getGatewayPreference(): Promise<GatewayPref> {
  const envPref = process.env.MOBILE_MONEY_GATEWAY;
  if (envPref) return envPref as GatewayPref;

  const rows = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "mobile_money_gateway")).limit(1);
  return (rows[0]?.value as GatewayPref) ?? "pawapay";
}

type ResolvedWalletGateway = {
  gateway: "pawapay" | "clapay" | null;
  pawaPayCtx: { client: PawaPayClient; env: string } | null;
  clapayCtx: { client: ClapayClient } | null;
  gatewayConfigId: string | null;
  routingSource: "dynamic" | "legacy";
  unavailableReason: string | null;
};

export async function resolveWalletGateway(countryCode: string, methodSlug: string, amountXof: number): Promise<ResolvedWalletGateway> {
  let pawaPayCtx: ResolvedWalletGateway["pawaPayCtx"] = null;
  let clapayCtx: ResolvedWalletGateway["clapayCtx"] = null;
  let gatewayConfigId: string | null = null;
  let gateway: ResolvedWalletGateway["gateway"] = null;
  let routingSource: ResolvedWalletGateway["routingSource"] = "legacy";

  let dynamicRoute: RouterResult | null;
  try {
    dynamicRoute = await resolveGateway(countryCode, methodSlug, amountXof);
  } catch (error) {
    if (!(error instanceof GatewayRouteUnavailableError)) throw error;
    return {
      gateway: null,
      pawaPayCtx: null,
      clapayCtx: null,
      gatewayConfigId: null,
      routingSource: "dynamic",
      unavailableReason: error.message,
    };
  }
  if (dynamicRoute) {
    routingSource = "dynamic";
    if (dynamicRoute.type === "pawapay") {
      pawaPayCtx = { client: dynamicRoute.client, env: process.env.PAWAPAY_ENV ?? "sandbox" };
      gateway = "pawapay";
    } else {
      clapayCtx = { client: dynamicRoute.client };
      gateway = "clapay";
    }
    gatewayConfigId = dynamicRoute.gatewayId;
  }

  if (!gateway) {
    const gatewayPref = await getGatewayPreference();
    const isAuto = gatewayPref.startsWith("auto_");
    const legacyPawaPay = (gatewayPref === "pawapay" || isAuto) ? await getPawaPayClient() : null;
    const legacyClapay = (gatewayPref === "clapay" || isAuto) ? await getClapayClient() : null;

    if (gatewayPref === "pawapay") gateway = legacyPawaPay ? "pawapay" : null;
    else if (gatewayPref === "clapay") gateway = legacyClapay ? "clapay" : null;
    else if (gatewayPref === "auto_pawapay_first") gateway = legacyPawaPay ? "pawapay" : (legacyClapay ? "clapay" : null);
    else if (gatewayPref === "auto_clapay_first") gateway = legacyClapay ? "clapay" : (legacyPawaPay ? "pawapay" : null);

    if (gateway === "pawapay") pawaPayCtx = legacyPawaPay;
    if (gateway === "clapay") clapayCtx = legacyClapay;
  }

  return { gateway, pawaPayCtx, clapayCtx, gatewayConfigId, routingSource, unavailableReason: null };
}

export async function getEnabledMobileOperator(methodSlug: string, methodName: string, countryCode: string) {
  const operators = await db.select().from(mobileOperatorsTable)
    .where(and(
      eq(mobileOperatorsTable.active, true),
      sql`${mobileOperatorsTable.countryCodes} @> ${JSON.stringify([countryCode.toUpperCase()])}::jsonb`,
    ));
  return operators.find(operator =>
    matchesMobileOperatorMethod(methodSlug, methodName, operator.slug, operator.name),
  ) ?? null;
}