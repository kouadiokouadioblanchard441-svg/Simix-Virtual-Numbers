import type { Request, Response, NextFunction } from "express";
import { verifyTurnstileToken } from "../lib/turnstile";

/**
 * Express middleware — verifies a Cloudflare Turnstile token.
 *
 * The token is read from:
 *   1. req.body["cf-turnstile-response"]  (JSON body field, primary)
 *   2. req.headers["x-turnstile-token"]   (HTTP header, fallback)
 *
 * When TURNSTILE_SECRET_KEY is not set the middleware is a no-op (dev mode).
 * On failure it returns 403 with { error, code: "TURNSTILE_FAILED" }.
 */
export async function requireTurnstile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token: string =
    (req.body?.["cf-turnstile-response"] as string | undefined) ||
    (req.headers["x-turnstile-token"] as string | undefined) ||
    "";

  const ip = req.ip ?? undefined;

  try {
    const result = await verifyTurnstileToken(token, ip);

    if (!result.success) {
      res.status(403).json({
        error: "Vérification de sécurité échouée. Veuillez réessayer.",
        code: "TURNSTILE_FAILED",
        errorCodes: result.errorCodes,
      });
      return;
    }

    next();
  } catch {
    next();
  }
}
