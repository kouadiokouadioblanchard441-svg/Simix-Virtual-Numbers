/**
 * Dynamic platform settings — reads from system_settings table.
 *
 * Cache TTL: 30 seconds so admin changes propagate quickly without
 * hammering the DB on every request.
 *
 * Usage:
 *   const val = await getSetting("maintenance_mode", "false");
 *   const num = await getSettingInt("min_deposit_fcfa", 500);
 *   const flag = await getSettingBool("registration_enabled", true);
 */

import { eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";
import { logger } from "./logger";

/* ─── Cache ───────────────────────────────────────────────── */

const CACHE_TTL_MS = 30_000; // 30 seconds

let cache: Record<string, string> | null = null;
let cacheExpiresAt = 0;

async function loadCache(): Promise<Record<string, string>> {
  if (cache && Date.now() < cacheExpiresAt) return cache;

  try {
    const rows = await db.select().from(systemSettingsTable);
    cache = Object.fromEntries(rows.map(r => [r.key, r.value]));
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[settings] Failed to load settings, using stale cache or defaults");
    if (!cache) cache = {};
  }

  return cache!;
}

/** Force the cache to reload on next call (e.g. after an admin PUT /settings). */
export function clearSettingsCache(): void {
  cache = null;
  cacheExpiresAt = 0;
}

/* ─── Public getters ──────────────────────────────────────── */

export async function getSetting(key: string, defaultValue: string): Promise<string> {
  const c = await loadCache();
  return c[key] ?? defaultValue;
}

export async function getSettingInt(key: string, defaultValue: number): Promise<number> {
  const raw = await getSetting(key, String(defaultValue));
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export async function getSettingBool(key: string, defaultValue: boolean): Promise<boolean> {
  const raw = await getSetting(key, defaultValue ? "true" : "false");
  return raw === "true" || raw === "1" || raw === "yes";
}

/* ─── Named settings helpers ──────────────────────────────── */

/** Is the platform in maintenance mode? */
export const isMaintenanceMode = () => getSettingBool("maintenance_mode", false);

/** Is user registration currently allowed? */
export const isRegistrationEnabled = () => getSettingBool("registration_enabled", true);

/** Is SMS simulation mode active (dev/demo)? */
export const isSmsSimulationEnabled = () => getSettingBool("sms_simulation", true);

/** Number validity in minutes after purchase */
export const getNumberValidityMinutes = () => getSettingInt("number_validity_minutes", 20);

/** Extension duration in minutes */
export const getExtendMinutes = () => getSettingInt("extend_minutes", 10);

/** Extension fee in FCFA */
export const getExtendFee = () => getSettingInt("extend_fee_fcfa", 50);

/** Global minimum recharge amount in FCFA */
export const getMinDepositFcfa = () => getSettingInt("min_deposit_fcfa", 500);

/** Maximum balance a user can hold */
export const getMaxBalanceFcfa = () => getSettingInt("max_balance_fcfa", 500_000);

/** Max purchases per minute per user before rate-limit */
export const getMaxOrdersPerMinute = () => getSettingInt("max_orders_per_minute", 10);

/** Fraud score threshold for auto-block */
export const getFraudBlockThreshold = () => getSettingInt("fraud_block_threshold", 61);

/** Is email OTP verification active (registration + login + inactivity)? Default ON. */
export const isEmailOtpEnabled = () => getSettingBool("email_otp_enabled", true);
