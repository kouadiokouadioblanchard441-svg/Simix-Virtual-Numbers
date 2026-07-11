/**
 * Amazon SES v2 via REST + AWS Signature v4
 * Utilise uniquement le module natif Node.js `crypto` — aucun SDK AWS requis.
 * apiKey    = AWS Access Key ID
 * apiSecret = AWS Secret Access Key
 * region    = us-east-1 (défaut)
 */
import { createHmac, createHash } from "crypto";
import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}
function sha256hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSigningKey(secret: string, date: string, region: string): Buffer {
  const k1 = hmac("AWS4" + secret, date);
  const k2 = hmac(k1, region);
  const k3 = hmac(k2, "ses");
  return hmac(k3, "aws4_request");
}

async function sesRequest(
  region: string,
  accessKey: string,
  secretKey: string,
  body: string,
): Promise<Response> {
  const host    = `email.${region}.amazonaws.com`;
  const service = "ses";
  const endpoint = `https://${host}/v2/email/outbound-emails`;

  const now  = new Date();
  const amzDate  = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);

  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    "POST",
    "/v2/email/outbound-emails",
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSigningKey(secretKey, dateStamp, region);
  const signature  = hmac(signingKey, stringToSign).toString("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(endpoint, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "x-amz-date":   amzDate,
      "Authorization": authorization,
    },
    body,
  });
}

export const sesAdapter: ProviderAdapter = {
  slug: "ses",
  name: "Amazon SES",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey || !config.apiSecret) throw new Error("SES: Access Key ID et Secret Key requis");
    const region = config.region ?? "us-east-1";
    const body   = JSON.stringify({
      FromEmailAddress: payload.from,
      Destination:      { ToAddresses: [payload.to] },
      Content: {
        Simple: {
          Subject: { Data: payload.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: payload.html, Charset: "UTF-8" },
            ...(payload.text ? { Text: { Data: payload.text, Charset: "UTF-8" } } : {}),
          },
        },
      },
    });
    const res  = await sesRequest(region, config.apiKey, config.apiSecret, body);
    const json = await res.json() as { MessageId?: string; message?: string };
    if (!res.ok) throw new Error(`SES: ${json.message ?? res.statusText}`);
    return { messageId: json.MessageId ?? "ses-unknown" };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey || !config.apiSecret) return { healthy: false, latencyMs: 0, detail: "credentials manquants" };
    const region = config.region ?? "us-east-1";
    const start  = Date.now();
    try {
      // Appel léger — GetAccount SES v2
      const endpoint = `https://email.${region}.amazonaws.com/v2/email/account`;
      const host    = `email.${region}.amazonaws.com`;
      const now     = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
      const dateStamp = amzDate.slice(0, 8);
      const payloadHash = sha256hex("");
      const signedHeaders = "host;x-amz-date";
      const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
      const canonicalRequest = ["GET", "/v2/email/account", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
      const credScope = `${dateStamp}/${region}/ses/aws4_request`;
      const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credScope, sha256hex(canonicalRequest)].join("\n");
      const sigKey = getSigningKey(config.apiSecret, dateStamp, region);
      const sig    = hmac(sigKey, stringToSign).toString("hex");
      const auth   = `AWS4-HMAC-SHA256 Credential=${config.apiKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
      const res    = await fetch(endpoint, { headers: { "x-amz-date": amzDate, Authorization: auth } });
      return { healthy: res.ok || res.status === 403, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
