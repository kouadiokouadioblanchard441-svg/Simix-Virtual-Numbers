import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { checkAgeLabel, otpLabel, DEPOSIT_STATUS_LABELS } from "./deposit-diagnostics";

test("otp labels", () => {
  assert.equal(otpLabel(null), "OTP inconnu");
  assert.equal(otpLabel(false), "OTP : non");
  assert.equal(otpLabel(true), "OTP : oui");
});
test("check age", () => {
  const now = Date.parse("2025-01-01T00:02:00Z");
  assert.equal(checkAgeLabel(null, now), "Non vérifié");
  assert.equal(checkAgeLabel("2025-01-01T00:01:30Z", now), "il y a 30 s");
  assert.equal(checkAgeLabel("2025-01-01T00:00:00Z", now), "il y a 2 min");
});

test("all diagnostic states are labeled without payment confirmation", () => {
  assert.equal(Object.keys(DEPOSIT_STATUS_LABELS).length, 10);
  assert.match(DEPOSIT_STATUS_LABELS.not_clapay, /Non audité/);
  assert.match(DEPOSIT_STATUS_LABELS.catalogue_available, /Catalogue/);
  assert.doesNotMatch(DEPOSIT_STATUS_LABELS.catalogue_available, /paiement|confirmé/i);
});

test("panel is wired to real authenticated API, refresh, bounded freshness and read-only warnings", () => {
  const panel = readFileSync(new URL("../components/deposit-diagnostics-panel.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../pages/admin/payouts.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("./admin-api.ts", import.meta.url), "utf8");
  assert.match(api, /req<DepositDiagnostics>\("GET", "\/admin\/deposit-diagnostics"\)/);
  assert.match(page, /<DepositDiagnosticsPanel\s*\/>/);
  for (const text of [/q\.refetch\(\)/, /staleTime: 60_000/, /gcTime: 0/, /refetchOnMount: "always"/, /refetchInterval: false/, /q\.isLoading/, /q\.error/, /rows\.length === 0/]) assert.match(panel, text);
  assert.match(panel, /Un catalogue valide n’est pas une confirmation de paiement réel/);
  assert.match(panel, /aucun changement de fournisseur/);
  assert.match(panel, /otpLabel\(r\.requiresOtp\)/);
  assert.match(panel, /r\.metadataMissing/);
});
