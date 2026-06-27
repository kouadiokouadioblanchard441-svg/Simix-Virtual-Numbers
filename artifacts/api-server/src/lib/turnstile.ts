/**
 * Cloudflare Turnstile server-side token verification.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Set TURNSTILE_SECRET_KEY in environment to enable verification.
 * When the secret is absent (dev mode), verification is bypassed gracefully.
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  success: boolean;
  errorCodes: string[];
}

export async function verifyTurnstileToken(
  token: string | undefined,
  remoteip?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    return { success: true, errorCodes: [] };
  }

  if (!token || typeof token !== "string" || token.trim() === "") {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  try {
    const params = new URLSearchParams({ secret, response: token.trim() });
    if (remoteip) params.append("remoteip", remoteip);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      return { success: false, errorCodes: ["network-error"] };
    }

    const json = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };

    return {
      success: json.success === true,
      errorCodes: json["error-codes"] ?? [],
    };
  } catch {
    return { success: false, errorCodes: ["internal-error"] };
  }
}
