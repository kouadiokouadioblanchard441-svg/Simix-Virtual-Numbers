import { NowPaymentsSDK } from "@nowpaymentsio/nowpayments-sdk-nodejs";
import { getSetting } from "./settings";

export async function getNowPaymentsApiKey(): Promise<string | null> {
  const envKey = process.env.NOWPAYMENTS_API_KEY;
  if (envKey) return envKey;
  return getSetting("nowpayments_api_key", "").then(v => v || null);
}

export async function getNowPaymentsIpnSecret(): Promise<string | null> {
  const envSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (envSecret) return envSecret;
  return getSetting("nowpayments_ipn_secret", "").then(v => v || null);
}

export async function getNowPaymentsSDK(ipnCallbackUrl?: string): Promise<NowPaymentsSDK | null> {
  const apiKey = await getNowPaymentsApiKey();
  if (!apiKey) return null;

  const ipnSecret = await getNowPaymentsIpnSecret();

  return new NowPaymentsSDK({
    apiKey,
    ipnSecret: ipnSecret ?? undefined,
    ipnCallbackUrl: ipnCallbackUrl ?? undefined,
  });
}

/* ── FCFA ↔ USD conversion ─────────────────────────────────────
 * Default: 1 USDT = 512 FCFA
 * Overridable via system_settings.fcfa_to_usd_rate             */
export async function getFcfaToUsdRate(): Promise<number> {
  const raw = await getSetting("fcfa_to_usd_rate", "512");
  const rate = parseFloat(raw);
  return !isNaN(rate) && rate > 0 ? rate : 512;
}

export function fcfaToUsd(fcfa: number, rate: number): number {
  return Math.round((fcfa / rate) * 100) / 100;
}

export function usdToFcfa(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

/* ── Network → NowPayments currency code mapping ── */
export const CRYPTO_NETWORKS: Record<string, { currency: string; label: string; chain: string; icon: string }> = {
  trc20: { currency: "usdttrc20", label: "USDT · TRC-20", chain: "Tron", icon: "TRX" },
  erc20: { currency: "usdterc20", label: "USDT · ERC-20", chain: "Ethereum", icon: "ETH" },
  bep20: { currency: "usdtbsc",   label: "USDT · BEP-20", chain: "BNB Smart Chain", icon: "BNB" },
};

export type CryptoNetwork = keyof typeof CRYPTO_NETWORKS;
