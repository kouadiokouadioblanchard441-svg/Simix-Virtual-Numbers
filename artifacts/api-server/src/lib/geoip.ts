/**
 * geoip.ts — Résolution géographique d'une adresse IP
 *
 * Utilise ip-api.com (gratuit, sans clé API, 45 req/min en HTTP).
 * Retourne : pays, code pays, région, ville, ISP, organisation,
 *            timezone, latitude/longitude, code postal.
 *
 * Les IPs privées/localhost retournent un objet vide (pas d'erreur).
 */
import { logger } from "./logger";

export interface GeoInfo {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  zip: string;
  timezone: string;
  isp: string;
  org: string;
  lat: number;
  lon: number;
}

const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost)/;

export async function lookupIp(ip: string): Promise<Partial<GeoInfo>> {
  if (!ip || ip === "unknown" || PRIVATE_IP_RE.test(ip)) {
    return { ip, country: "Réseau local", countryCode: "LAN", city: "–", isp: "–" };
  }

  try {
    const cleanIp = ip.replace(/^::ffff:/, "");
    const url = `http://ip-api.com/json/${cleanIp}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,query`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Record<string, unknown>;

    if (data.status !== "success") {
      logger.debug({ ip, msg: data.message }, "[geoip] Lookup failed");
      return { ip };
    }

    return {
      ip: (data.query as string) ?? cleanIp,
      country: (data.country as string) ?? "",
      countryCode: (data.countryCode as string) ?? "",
      region: (data.regionName as string) ?? "",
      city: (data.city as string) ?? "",
      zip: (data.zip as string) ?? "",
      timezone: (data.timezone as string) ?? "",
      isp: (data.isp as string) ?? "",
      org: (data.org as string) ?? "",
      lat: (data.lat as number) ?? 0,
      lon: (data.lon as number) ?? 0,
    };
  } catch (err) {
    logger.debug({ ip, err: (err as Error).message }, "[geoip] Request error");
    return { ip };
  }
}

/** Drapeau emoji à partir d'un code pays ISO-2 (ex: "CI" → "🇨🇮") */
export function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  return String.fromCodePoint(
    ...code.toUpperCase().split("").map(c => 0x1F1E0 - 65 + c.charCodeAt(0))
  );
}
