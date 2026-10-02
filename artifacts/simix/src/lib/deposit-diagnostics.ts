import type { DepositDiagnosticStatus } from "./admin-api";

export const DEPOSIT_STATUS_LABELS: Record<DepositDiagnosticStatus, string> = {
  catalogue_available: "Catalogue disponible",
  catalogue_access_failed: "Accès au catalogue échoué",
  country_missing: "Pays absent du catalogue",
  operator_missing: "Opérateur absent du catalogue",
  operator_inactive: "Opérateur inactif",
  method_denied: "Méthode refusée",
  operator_code_missing: "Code opérateur manquant",
  configuration_unavailable: "Configuration indisponible",
  route_unavailable: "Route indisponible",
  not_clapay: "Non audité (hors Clapay)",
};

export function otpLabel(value: boolean | null): string {
  return value === null ? "OTP inconnu" : value ? "OTP : oui" : "OTP : non";
}

export function checkAgeLabel(checkedAt: string | null, now = Date.now()): string {
  if (!checkedAt) return "Non vérifié";
  const t = Date.parse(checkedAt);
  if (Number.isNaN(t)) return "Non vérifié";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  return `il y a ${Math.floor(s / 3600)} h`;
}
