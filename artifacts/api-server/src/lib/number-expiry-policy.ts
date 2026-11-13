export type NumberExpiryOutcome =
  | "still_active"
  | "expired_without_sms"
  | "expired_with_sms";

export function getNumberExpiryOutcome(
  expiresAt: Date,
  now: Date,
  smsCount: number,
): NumberExpiryOutcome {
  if (now.getTime() < expiresAt.getTime()) return "still_active";
  return smsCount > 0 ? "expired_with_sms" : "expired_without_sms";
}
