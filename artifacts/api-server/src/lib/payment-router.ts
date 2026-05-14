/**
 * PaymentRouterService — intelligent dynamic payment gateway routing
 *
 * Reads `payment_routes` + `payment_gateways` from PostgreSQL.
 * Decides Clapay vs PawaPay per country + operator — zero hardcoded logic.
 * Falls back to secondary/tertiary gateway automatically on failure.
 */
import { db, mobileOperatorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolvePaymentRoute, type ResolvedRoute } from "../routes/admin-payment-routing";
import { PawaPayClient, getProviderForCountry } from "./pawapay";
import { ClapayClient, getOperatorCodeForMethod } from "./clapay";
import { logger } from "./logger";

/* ── Operator slug normalizer ────────────────────────────────────────────
 * Maps raw methodSlug like "orange-money", "mtn-mobile-money", "wave" to
 * the canonical operator slug stored in mobile_operators.slug ("orange",
 * "mtn", "wave", …).
 * First checks DB for a match, then falls back to keyword extraction.
 * ───────────────────────────────────────────────────────────────────── */
const KNOWN_OPERATOR_SLUGS = [
  "mtn", "orange", "wave", "moov", "airtel", "mpesa", "free",
  "expresso", "tmoney", "flooz", "mvola", "zamtel", "vodacom",
  "tigo", "africell", "glo",
];

export function extractOperatorSlug(methodSlug: string): string {
  const s = methodSlug.toLowerCase().trim();
  for (const slug of KNOWN_OPERATOR_SLUGS) {
    if (s === slug || s.startsWith(slug + "-") || s.includes("-" + slug + "-") || s.endsWith("-" + slug)) {
      return slug;
    }
  }
  /* Fallback: return the first segment before any dash */
  return s.split("-")[0] ?? s;
}

/* Lookup operator slug via DB (returns slug or null) */
async function resolveOperatorSlugFromDb(methodSlug: string): Promise<string | null> {
  const rows = await db.select({ slug: mobileOperatorsTable.slug, countryCodes: mobileOperatorsTable.countryCodes })
    .from(mobileOperatorsTable)
    .where(eq(mobileOperatorsTable.active, true));

  const s = methodSlug.toLowerCase();
  for (const op of rows) {
    if (s === op.slug || s.startsWith(op.slug + "-") || s.includes("-" + op.slug)) {
      return op.slug;
    }
  }
  return null;
}

/* ── Resolved gateway descriptors ───────────────────────────────────── */
export interface RouterResultPawaPay {
  type: "pawapay";
  client: PawaPayClient;
  gatewaySlug: string;
  gatewayName: string;
  routeId: string;
  priority: "primary" | "secondary" | "tertiary";
}
export interface RouterResultClapay {
  type: "clapay";
  client: ClapayClient;
  gatewaySlug: string;
  gatewayName: string;
  routeId: string;
  priority: "primary" | "secondary" | "tertiary";
}
export type RouterResult = RouterResultPawaPay | RouterResultClapay;

/* ── Build PawaPay client from resolved route credentials ────────────── */
function buildPawaPayClient(route: ResolvedRoute): PawaPayClient | null {
  const token = route.apiKey ?? process.env.PAWAPAY_API_TOKEN ?? null;
  if (!token) return null;
  const env = (process.env.PAWAPAY_ENV as "sandbox" | "production" | undefined) ?? "sandbox";
  return new PawaPayClient(token, env);
}

/* ── Build Clapay client from resolved route credentials ─────────────── */
function buildClapayClient(route: ResolvedRoute): ClapayClient | null {
  const token = route.apiKey ?? process.env.CLAPAY_API_TOKEN ?? null;
  if (!token) return null;
  const baseUrl = route.apiUrl ?? process.env.CLAPAY_BASE_URL ?? undefined;
  return new ClapayClient(token, baseUrl);
}

/* ════════════════════════════════════════════════════════════════════
 * Main entry point — resolves which gateway handles this deposit
 * ════════════════════════════════════════════════════════════════════ */
export async function resolveGateway(
  countryCode: string,
  methodSlug: string,
  _amount?: number,
): Promise<RouterResult | null> {
  const country = countryCode.toUpperCase();

  /* 1. Determine operator slug */
  let operatorSlug: string | null = await resolveOperatorSlugFromDb(methodSlug);
  if (!operatorSlug) {
    operatorSlug = extractOperatorSlug(methodSlug);
  }

  logger.info({ country, methodSlug, operatorSlug }, "[PaymentRouter] Resolving gateway");

  /* 2. Query routing table */
  const route = await resolvePaymentRoute(country, operatorSlug, "deposit");

  if (!route) {
    logger.info({ country, operatorSlug }, "[PaymentRouter] No dynamic route found — caller should use legacy fallback");
    return null;
  }

  logger.info({ country, operatorSlug, gateway: route.gatewaySlug, priority: route.priority }, "[PaymentRouter] Route resolved");

  /* 3. Build and return the correct client */
  const slug = route.gatewaySlug.toLowerCase();

  if (slug.includes("pawapay") || slug === "pawapay") {
    const client = buildPawaPayClient(route);
    if (!client) {
      logger.warn({ routeId: route.routeId }, "[PaymentRouter] PawaPay route found but no API token available");
      return null;
    }
    return { type: "pawapay", client, gatewaySlug: route.gatewaySlug, gatewayName: route.gatewayName, routeId: route.routeId, priority: route.priority };
  }

  if (slug.includes("clapay") || slug === "clapay") {
    const client = buildClapayClient(route);
    if (!client) {
      logger.warn({ routeId: route.routeId }, "[PaymentRouter] Clapay route found but no API token available");
      return null;
    }
    return { type: "clapay", client, gatewaySlug: route.gatewaySlug, gatewayName: route.gatewayName, routeId: route.routeId, priority: route.priority };
  }

  logger.warn({ gatewaySlug: route.gatewaySlug }, "[PaymentRouter] Unknown gateway slug — cannot build client");
  return null;
}

export { getProviderForCountry, getOperatorCodeForMethod };
