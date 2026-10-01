/** HTTP success is not proof that a payment succeeded. */
export function rechargeOutcome(result: {
  status?: unknown;
  pending?: unknown;
  depositId?: unknown;
  externalDepositId?: unknown;
}): { state: "completed" | "failed" | "pending" | "unknown"; depositId: string | null } {
  const rawId = result.depositId ?? result.externalDepositId;
  const depositId = typeof rawId === "string" && rawId ? rawId : null;
  if (result.status === "completed") return { state: "completed", depositId };
  if (["failed", "cancelled", "expired"].includes(String(result.status))) {
    return { state: "failed", depositId };
  }
  if (depositId) return { state: "pending", depositId };
  return { state: "unknown", depositId: null };
}