import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminPayoutRecord } from "@/lib/admin-api";
import { beginPayoutAttempt, getPayoutAttempt, updatePayoutAttempt, type PayoutAttempt } from "@/lib/payout-attempts";
import { DepositDiagnosticsPanel } from "@/components/deposit-diagnostics-panel";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import {
  AlertTriangle, ArrowDownToLine, CheckCircle2, ChevronDown, Clock3,
  Loader2, RefreshCw, Wallet, XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Gateway = "pawapay" | "clapay";
type Payload = Record<string, string | number>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Select({
  value, onChange, disabled, children, placeholder, testId,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <div className="relative">
      <select
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed pr-8 focus:outline-none focus:border-violet-500 transition-colors"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = "text", disabled, min, testId,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  min?: number;
  testId?: string;
}) {
  return (
    <input
      data-testid={testId}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 disabled:opacity-50 focus:outline-none focus:border-violet-500 transition-colors"
    />
  );
}

function statusPresentation(status: AdminPayoutRecord["status"]) {
  if (status === "completed") return {
    label: "Terminé", Icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  };
  if (status === "failed") return {
    label: "Échoué", Icon: XCircle,
    className: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  return {
    label: "En traitement", Icon: Clock3,
    className: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  };
}

function PayoutStatus({ status }: { status: AdminPayoutRecord["status"] }) {
  const presentation = statusPresentation(status);
  return (
    <span data-testid="status-payout" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${presentation.className}`}>
      <presentation.Icon className="w-3 h-3" /> {presentation.label}
    </span>
  );
}

function PayoutFeedback({ record, error }: { record: AdminPayoutRecord | null; error: string | null }) {
  if (error) {
    return (
      <div role="alert" data-testid="status-payout-error" className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
        <div className="flex items-start gap-2"><XCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span></div>
      </div>
    );
  }
  if (!record) return null;
  const pending = record.status === "pending";
  const failed = record.status === "failed";
  return (
    <div
      role="status"
      data-testid="status-payout-result"
      className={`rounded-xl border p-4 text-sm ${
        pending ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
          : failed ? "bg-red-500/10 border-red-500/20 text-red-300"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
      }`}
    >
      <div className="flex items-start gap-2">
        {pending ? <Clock3 className="w-4 h-4 mt-0.5 shrink-0" /> : failed ? <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <p className="font-semibold">{pending ? "Paiement en cours de traitement" : failed ? "Paiement échoué" : "Paiement confirmé"}</p>
          <p className="text-xs mt-1 opacity-80 break-all">
            ID : {record.externalId || record.id} · {record.amount} {record.currency}
            {record.failureReason ? ` · ${record.failureReason}` : ""}
          </p>
          {pending && <p className="text-xs mt-1 opacity-80">Le suivi continue dans l’historique. Ne relancez pas ce paiement.</p>}
        </div>
      </div>
    </div>
  );
}

function useAttempt(scope: string, payload: Payload | null) {
  const serialized = payload ? JSON.stringify(payload) : "";
  const [attempt, setAttempt] = useState<PayoutAttempt | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setAttempt(null);
    if (!serialized) {
      setLoading(false);
      return () => { current = false; };
    }
    setLoading(true);
    void getPayoutAttempt(scope, JSON.parse(serialized) as Payload)
      .then((value) => { if (current) setAttempt(value); })
      .catch(() => { if (current) setAttempt(null); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [scope, serialized]);
  return { attempt, setAttempt, loading };
}

function usePayoutHistory() {
  return useQuery({
    queryKey: ["admin-payout-history"],
    queryFn: () => adminApi.getPayoutHistory(),
    refetchInterval: () => document.visibilityState === "visible" ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
}

function PawaPayForm({ history }: { history: AdminPayoutRecord[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [countryIso2, setCountryIso2] = useState("");
  const [providerSlug, setProviderSlug] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<AdminPayoutRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: localData, isLoading, error: localError } = useQuery({
    queryKey: ["admin-payouts-pawapay-local"],
    queryFn: () => adminApi.getPayoutsPawapayLocalOperators(),
    retry: 1,
  });
  const { data: liveConfig } = useQuery({
    queryKey: ["admin-payouts-pawapay-config"],
    queryFn: () => adminApi.getPayoutsPayapayConfig(),
    retry: 0,
  });
  const selectedCountry = localData?.countries.find((country) => country.countryIso2 === countryIso2);
  const countryOperators = selectedCountry?.operators ?? [];
  const enabledOperators = countryOperators.filter((operator) => operator.payoutEnabled === true);
  const selectedOperator = enabledOperators.find((operator) => operator.slug === providerSlug);
  const providerCode = selectedOperator?.pawapayCode ?? "";
  const currency = selectedCountry?.currency ?? "";
  const liveProvider = liveConfig?.countries.find((country) => country.countryIso2 === countryIso2)
    ?.providers.find((provider) => provider.provider === providerCode);
  const minAmount = liveProvider?.minAmount ? Number(liveProvider.minAmount) : null;
  const maxAmount = liveProvider?.maxAmount ? Number(liveProvider.maxAmount) : null;
  const amountNumber = Number(amount);
  const amountWithinLimits =
    Number.isFinite(amountNumber)
    && (minAmount === null || amountNumber >= minAmount)
    && (maxAmount === null || amountNumber <= maxAmount);
  const normalizedPhone = phoneNumber.trim().replace(/[\s()-]/g, "");
  const payload = useMemo<Payload | null>(() => providerCode && countryIso2 && amountNumber > 0 && normalizedPhone
    ? { gateway: "pawapay", countryIso2, provider: providerCode, currency, phoneNumber: normalizedPhone, amount: amountNumber }
    : null, [providerCode, countryIso2, amountNumber, normalizedPhone, currency]);
  const attemptState = useAttempt("merchant", payload);
  const internationalPhoneValid = /^\+[1-9]\d{7,14}$/.test(normalizedPhone);
  const countryDialPrefix = selectedCountry?.dialCode.replace(/\D/g, "") ?? "";
  const phoneMatchesCountry = !!countryDialPrefix && normalizedPhone.replace(/^\+/, "").startsWith(countryDialPrefix);
  const phoneValid = internationalPhoneValid && phoneMatchesCountry;
  const foundAttemptRecord = attemptState.attempt?.recordId
    ? history.find((item) => item.id === attemptState.attempt?.recordId)
    : undefined;

  useEffect(() => {
    if (!foundAttemptRecord || !payload) return;
    setRecord(foundAttemptRecord);
    void updatePayoutAttempt("merchant", payload, {
      recordId: foundAttemptRecord.id,
      status: foundAttemptRecord.status,
    });
    attemptState.setAttempt((current) => current ? { ...current, recordId: foundAttemptRecord.id, status: foundAttemptRecord.status } : current);
  }, [foundAttemptRecord, payload]);

  const selectCountry = (value: string) => {
    const country = localData?.countries.find((item) => item.countryIso2 === value);
    const eligible = country?.operators.filter((operator) => operator.payoutEnabled === true) ?? [];
    setCountryIso2(value);
    setProviderSlug(eligible.length === 1 ? eligible[0].slug : "");
    setRecord(null);
    setError(null);
  };

  const submit = async () => {
    if (!payload || !phoneValid || !amountWithinLimits) return;
    setBusy(true);
    setError(null);
    setRecord(null);
    try {
      const existing = await getPayoutAttempt("merchant", payload);
      if (existing?.status === "pending") {
        setError("Ce retrait est déjà en traitement. Consultez l’historique avant toute nouvelle action.");
        setBusy(false);
        return;
      }
      const attempt = await beginPayoutAttempt("merchant", payload);
      attemptState.setAttempt(attempt);
      const result = await adminApi.initiatePawapayPayout({
        phoneNumber: normalizedPhone,
        countryIso2,
        provider: providerCode,
        currency,
        amount: amountNumber,
        idempotencyKey: attempt.idempotencyKey,
      });
      setRecord(result);
      await updatePayoutAttempt("merchant", payload, { status: result.status, recordId: result.id });
      attemptState.setAttempt({ ...attempt, status: result.status, recordId: result.id });
      await queryClient.invalidateQueries({ queryKey: ["admin-payout-history"] });
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      const status = (caught as { status?: number }).status;
      if (status === 400 || status === 422) {
        await updatePayoutAttempt("merchant", payload, { status: "failed" }).catch(() => undefined);
      } else {
        await updatePayoutAttempt("merchant", payload, { status: "unknown" }).catch(() => undefined);
      }
      attemptState.setAttempt((current) => current ? { ...current, status: status === 400 || status === 422 ? "failed" : "unknown" } : current);
      toast({ title: "Erreur de paiement", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-16 gap-3 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin" /> Chargement des opérateurs…</div>;
  if (localError || !localData?.countries.length) {
    return <div role="alert" className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm"><AlertTriangle className="w-5 h-5 shrink-0" />{(localError as Error)?.message ?? "Aucun opérateur PawaPay configuré."}</div>;
  }
  const pendingAttempt = attemptState.attempt?.status === "pending";
  const unknownAttempt = attemptState.attempt?.status === "unknown";
  const canSubmit = !!payload && phoneValid && amountNumber > 0 && amountWithinLimits
    && !busy && !attemptState.loading && !pendingAttempt;

  return (
    <div className="space-y-5">
      <div className="text-xs text-zinc-500 bg-zinc-900/60 rounded-xl p-3 border border-zinc-800">
        <span className="font-semibold text-zinc-400">Environnement :</span>{" "}
        {liveConfig ? <span className={liveConfig.env === "production" ? "text-emerald-400" : "text-amber-400"}>{liveConfig.env === "production" ? "Production" : "Sandbox"}</span> : "non déterminé"}
        {" — "} Le catalogue complet reste visible ; seuls les opérateurs explicitement autorisés aux payouts peuvent être envoyés.
      </div>
      <PayoutFeedback record={record} error={error} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Pays">
          <Select testId="payout-country" value={countryIso2} onChange={selectCountry} placeholder="— Sélectionner un pays —">
            {localData.countries.map((country) => (
              <option key={country.countryIso2} value={country.countryIso2}>{country.flag} {country.countryName} — {country.currency}</option>
            ))}
          </Select>
        </Field>
        <Field label="Opérateur">
          <Select testId="payout-operator" value={providerSlug} onChange={(value) => { setProviderSlug(value); setRecord(null); setError(null); }} disabled={!selectedCountry} placeholder={selectedCountry ? "— Catalogue complet des opérateurs —" : "— Sélectionnez d'abord un pays —"}>
            {countryOperators.map((operator) => (
              <option key={operator.slug} value={operator.slug} disabled={operator.payoutEnabled !== true}>
                {operator.name} — {operator.payoutEnabled === true ? "Payout disponible" : operator.payoutEnabled === false ? "Payout indisponible" : "Disponibilité non confirmée"}
              </option>
            ))}
          </Select>
          {selectedCountry && enabledOperators.length === 0 && <p className="text-[11px] text-amber-300">Catalogue conservé. Aucun opérateur de ce pays n’est confirmé comme autorisé aux payouts ; l’envoi est bloqué tant que la disponibilité ne l’est pas.</p>}
          {selectedOperator && <p className="text-[11px] text-emerald-400">Payout confirmé disponible pour ce fournisseur selon la configuration active.</p>}
        </Field>
        <Field label="Numéro international complet">
          <Input testId="payout-phone" value={phoneNumber} onChange={setPhoneNumber} placeholder="+237683677872" />
          {phoneNumber && !internationalPhoneValid
            ? <p className="text-[11px] text-red-400">Entrez un numéro international complet valide, avec + et le code pays.</p>
            : phoneNumber && !phoneMatchesCountry
              ? <p className="text-[11px] text-red-400">Le numéro doit commencer par l’indicatif du pays sélectionné ({selectedCountry?.dialCode}).</p>
              : <p className="text-[11px] text-zinc-500">Entrez le numéro complet au format international {selectedCountry?.dialCode ? `(indicatif ${selectedCountry.dialCode})` : ""}, avec le signe +.</p>}
        </Field>
        <Field label={`Montant${currency ? ` (${currency})` : ""}`}>
          <Input testId="payout-amount" type="number" min={minAmount ?? 1} value={amount} onChange={setAmount} placeholder={minAmount ? `Minimum : ${minAmount}` : "ex: 50000"} />
          {(minAmount !== null || maxAmount !== null) && <p className="text-[11px] text-zinc-500">Limites : {minAmount ?? "—"} à {maxAmount ?? "—"} {currency}</p>}
          {amount && !amountWithinLimits && <p className="text-[11px] text-red-400">Le montant doit respecter les limites de cet opérateur.</p>}
        </Field>
      </div>
      {unknownAttempt && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
          Tentative incertaine : une nouvelle demande utilisera la même clé idempotente. Vérifiez d’abord l’historique.
        </div>
      )}
      <button data-testid="payout-send" onClick={submit} disabled={!canSubmit} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…</> : unknownAttempt ? <><RefreshCw className="w-4 h-4" /> Vérifier / reprendre avec la même clé</> : <><ArrowDownToLine className="w-4 h-4" /> Lancer le retrait PawaPay</>}
      </button>
    </div>
  );
}

function ClapayForm({ history }: { history: AdminPayoutRecord[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [countryCode, setCountryCode] = useState("");
  const [operatorCode, setOperatorCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dialCode, setDialCode] = useState("");
  const [amount, setAmount] = useState("");
  const [operatorOtp, setOperatorOtp] = useState("");
  const [otpRequiredByError, setOtpRequiredByError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<AdminPayoutRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: countriesData, isLoading: countriesLoading, error: countriesError } = useQuery({
    queryKey: ["admin-payouts-clapay-countries"],
    queryFn: () => adminApi.getClapayPayoutCountries(),
    retry: 1,
  });
  const { data: operatorsData, isLoading: operatorsLoading } = useQuery({
    queryKey: ["admin-payouts-clapay-operators", countryCode],
    queryFn: () => adminApi.getClapayPayoutOperators(countryCode),
    enabled: !!countryCode,
  });
  const selectedCountry = countriesData?.countries.find((country) => country.code === countryCode);
  const selectedOperator = operatorsData?.operators.find((operator) => operator.codeoperator === operatorCode);
  const supportsPayout = selectedOperator?.supportsPayout ?? selectedOperator?.supportsCashout ?? false;
  const otpRequired = otpRequiredByError || !!selectedOperator?.requiresOtp;
  const amountNumber = Number(amount);
  const normalizedPhone = phoneNumber.trim();
  const normalizedDialCode = dialCode.trim() || (selectedCountry ? `+${selectedCountry.indicatif.replace(/^\+/, "")}` : "");
  const payload = useMemo<Payload | null>(() => countryCode && operatorCode && amountNumber > 0 && normalizedPhone
    ? { gateway: "clapay", countryCode, operatorCode, phoneNumber: normalizedPhone, dialCode: normalizedDialCode, amount: amountNumber }
    : null, [countryCode, operatorCode, amountNumber, normalizedPhone, normalizedDialCode]);
  const attemptState = useAttempt("merchant", payload);
  const pendingAttempt = attemptState.attempt?.status === "pending";
  const unknownAttempt = attemptState.attempt?.status === "unknown";
  const foundAttemptRecord = attemptState.attempt?.recordId
    ? history.find((item) => item.id === attemptState.attempt?.recordId)
    : undefined;

  useEffect(() => {
    if (!foundAttemptRecord || !payload) return;
    setRecord(foundAttemptRecord);
    void updatePayoutAttempt("merchant", payload, {
      recordId: foundAttemptRecord.id,
      status: foundAttemptRecord.status,
    });
    attemptState.setAttempt((current) => current ? { ...current, recordId: foundAttemptRecord.id, status: foundAttemptRecord.status } : current);
  }, [foundAttemptRecord, payload]);

  const submit = async () => {
    if (!payload || !supportsPayout || (otpRequired && !operatorOtp.trim())) return;
    setBusy(true);
    setError(null);
    setRecord(null);
    try {
      const existing = await getPayoutAttempt("merchant", payload);
      if (existing?.status === "pending") {
        setError("Ce retrait est déjà en traitement. Consultez l’historique avant toute nouvelle action.");
        setBusy(false);
        return;
      }
      const attempt = await beginPayoutAttempt("merchant", payload);
      attemptState.setAttempt(attempt);
      const result = await adminApi.initiateClapayPayout({
        phoneNumber: normalizedPhone,
        dialCode: normalizedDialCode || undefined,
        countryCode,
        operatorCode: selectedOperator?.payoutCode ?? selectedOperator?.cashoutCode ?? selectedOperator?.codeoperator ?? operatorCode,
        amount: amountNumber,
        idempotencyKey: attempt.idempotencyKey,
        ...(otpRequired ? { operatorOtp: operatorOtp.trim() } : {}),
      });
      setRecord(result);
      await updatePayoutAttempt("merchant", payload, { status: result.status, recordId: result.id });
      attemptState.setAttempt({ ...attempt, status: result.status, recordId: result.id });
      await queryClient.invalidateQueries({ queryKey: ["admin-payout-history"] });
      setOperatorOtp("");
      setOtpRequiredByError(false);
    } catch (caught) {
      const message = (caught as Error).message;
      const status = (caught as { status?: number }).status;
      const requiresOtp = (caught as { requiresOtp?: boolean }).requiresOtp;
      setError(message);
      if (requiresOtp) setOtpRequiredByError(true);
      if ((status === 400 || status === 422) && !requiresOtp) {
        await updatePayoutAttempt("merchant", payload, { status: "failed" }).catch(() => undefined);
        attemptState.setAttempt((current) => current ? { ...current, status: "failed" } : current);
      } else {
        await updatePayoutAttempt("merchant", payload, { status: "unknown" }).catch(() => undefined);
        attemptState.setAttempt((current) => current ? { ...current, status: "unknown" } : current);
      }
      toast({ title: "Erreur de paiement", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (countriesLoading) return <div className="flex items-center justify-center py-16 gap-3 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin" /> Chargement des pays Clapay…</div>;
  if (countriesError || !countriesData) return <div role="alert" className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"><AlertTriangle className="w-5 h-5 shrink-0" />{(countriesError as Error)?.message ?? "Impossible de charger les pays Clapay."}</div>;

  const canSubmit = !!payload && supportsPayout && Number.isFinite(amountNumber) && amountNumber > 0 && !busy && !pendingAttempt && !attemptState.loading && (!otpRequired || !!operatorOtp.trim());
  return (
    <div className="space-y-5">
      <div className="text-xs text-zinc-500 bg-zinc-900/60 rounded-xl p-3 border border-zinc-800"><AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-400" />Les fonds collectés dans un pays doivent être retirés dans ce même pays.</div>
      <PayoutFeedback record={record} error={error} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Pays">
          <Select testId="payout-country" value={countryCode} onChange={(value) => { setCountryCode(value); setOperatorCode(""); setOperatorOtp(""); setOtpRequiredByError(false); setRecord(null); setError(null); }} placeholder="— Sélectionner un pays —">
            {countriesData.countries.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code}) — {country.currency}</option>)}
          </Select>
        </Field>
        <Field label="Opérateur">
          {operatorsLoading ? <div className="py-2.5 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Chargement…</div> : (
            <Select testId="payout-operator" value={operatorCode} onChange={(value) => { setOperatorCode(value); setOperatorOtp(""); setOtpRequiredByError(false); setRecord(null); setError(null); }} disabled={!countryCode} placeholder={!countryCode ? "— Sélectionnez d'abord un pays —" : "— Sélectionner un opérateur —"}>
              {operatorsData?.operators.map((operator) => <option key={operator.codeoperator} value={operator.codeoperator}>{operator.name}{(operator.supportsPayout ?? operator.supportsCashout) === false ? " — payout non configuré" : ""}{operator.requiresOtp ? " — OTP requis" : ""}</option>)}
            </Select>
          )}
          {operatorCode && !supportsPayout && <p className="text-xs text-amber-400 mt-1">Cet opérateur n’est pas configuré pour les payouts.</p>}
        </Field>
        <Field label="Numéro de téléphone">
          <Input testId="payout-phone" value={phoneNumber} onChange={setPhoneNumber} placeholder={countryCode === "CI" || countryCode === "BJ" ? "ex: 0701234567 (format local)" : "ex: 691234567"} />
        </Field>
        <Field label="Indicatif pays (dial code)">
          <Input testId="payout-dial-code" value={dialCode} onChange={setDialCode} placeholder={selectedCountry ? `+${selectedCountry.indicatif.replace(/^\+/, "")}` : "ex: +225"} />
        </Field>
        <Field label={`Montant${selectedCountry ? ` (${selectedCountry.currency})` : ""}`}>
          <Input testId="payout-amount" type="number" min={1} value={amount} onChange={setAmount} placeholder="ex: 50000" />
        </Field>
        {otpRequired && (
          <Field label="Code OTP opérateur">
            <Input testId="payout-otp" value={operatorOtp} onChange={setOperatorOtp} placeholder="Code OTP (jamais votre PIN)" />
            <p className="text-[11px] text-amber-300">Saisissez uniquement le code OTP demandé par l’opérateur. Ne saisissez jamais votre code PIN.</p>
          </Field>
        )}
      </div>
      {unknownAttempt && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">Tentative incertaine : toute nouvelle demande conserve la même clé idempotente. Vérifiez l’historique avant de reprendre.</div>}
      <button data-testid="payout-send" onClick={submit} disabled={!canSubmit} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…</> : unknownAttempt ? <><RefreshCw className="w-4 h-4" /> Vérifier / reprendre avec la même clé</> : <><ArrowDownToLine className="w-4 h-4" /> Lancer le retrait Clapay</>}
      </button>
    </div>
  );
}

function PayoutHistory({ payouts, isLoading, error, onRefresh, isRefreshing, onReload, isReloading }: {
  payouts: AdminPayoutRecord[];
  isLoading: boolean;
  error: Error | null;
  onRefresh: (id: string) => void;
  isRefreshing: string | null;
  onReload: () => void;
  isReloading: boolean;
}) {
  return (
    <section data-testid="payout-history" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Historique des payouts</h2>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-zinc-500">Mise à jour automatique toutes les 10 s</span>
          <button data-testid="payout-history-refresh" onClick={onReload} disabled={isReloading} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? "animate-spin" : ""}`} /> Actualiser
          </button>
        </div>
      </div>
      {isLoading ? <div className="flex items-center gap-2 py-8 text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" />Chargement de l’historique…</div>
        : error ? <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{error.message}</p>
          : payouts.length === 0 ? <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">Aucun payout enregistré.</p>
            : <div className="space-y-2">
              {payouts.map((payout) => (
                <article key={payout.id} data-testid={`payout-history-row-${payout.id}`} className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-semibold text-white">{payout.gateway === "pawapay" ? "PawaPay" : "Clapay"}</span><PayoutStatus status={payout.status} /><span className="text-xs text-zinc-500">{payout.amount} {payout.currency}</span></div>
                    <p className="text-xs text-zinc-400">{payout.countryCode} · {payout.phoneNumber} · {payout.providerCode}</p>
                    <p className="text-[11px] text-zinc-600 break-all">{payout.externalId || payout.id}{payout.failureReason ? ` · ${payout.failureReason}` : ""}</p>
                  </div>
                  <button data-testid={`payout-refresh-${payout.id}`} onClick={() => onRefresh(payout.id)} disabled={isRefreshing === payout.id} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing === payout.id ? "animate-spin" : ""}`} /> Actualiser
                  </button>
                </article>
              ))}
            </div>}
    </section>
  );
}

function PayoutsContent() {
  const { toast } = useToast();
  const [gateway, setGateway] = useState<Gateway>("pawapay");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const historyQuery = usePayoutHistory();
  const payouts = historyQuery.data?.payouts ?? [];

  const refreshRecord = async (id: string) => {
    setRefreshingId(id);
    try {
      const updated = await adminApi.refreshPayout(id);
      queryClient.setQueryData<{ payouts: AdminPayoutRecord[] }>(["admin-payout-history"], (current) => ({
        payouts: (current?.payouts ?? []).map((item) => item.id === updated.id ? updated : item),
      }));
      await queryClient.invalidateQueries({ queryKey: ["admin-payout-history"] });
    } catch (caught) {
      const message = (caught as Error).message;
      toast({ title: "Erreur d’actualisation", description: message, variant: "destructive" });
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg"><Wallet className="w-5 h-5 text-white" /></span>Retraits marchands</h1>
          <p className="text-zinc-400 text-sm mt-1.5">Envoyez et suivez les retraits vers un numéro mobile money.</p>
        </div>
      </div>
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300/90 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
        <div><p className="font-semibold">Règle importante — retrait par pays</p><p className="text-amber-300/70 mt-0.5">Les fonds collectés dans un pays ne peuvent être retirés que dans ce même pays.</p></div>
      </div>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="flex border-b border-zinc-800">
          {(["pawapay", "clapay"] as const).map((value) => (
            <button key={value} data-testid={`payout-gateway-${value}`} onClick={() => setGateway(value)} className={`flex-1 px-6 py-4 text-sm font-semibold transition-all ${gateway === value ? "bg-zinc-800 text-white border-b-2 border-violet-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`w-4 h-4 ${gateway === value ? "text-violet-400" : ""}`} />{value === "pawapay" ? "PawaPay" : "Clapay"}</span>
            </button>
          ))}
        </div>
        <div className="p-6">{gateway === "pawapay" ? <PawaPayForm history={payouts} /> : <ClapayForm history={payouts} />}</div>
      </div>
      <DepositDiagnosticsPanel />
      <PayoutHistory
        payouts={payouts}
        isLoading={historyQuery.isLoading}
        error={historyQuery.error as Error | null}
        onRefresh={refreshRecord}
        isRefreshing={refreshingId}
        onReload={() => { void historyQuery.refetch(); }}
        isReloading={historyQuery.isFetching}
      />
    </div>
  );
}

export default function AdminPayouts() {
  return <AdminGuard><AdminLayout><PayoutsContent /></AdminLayout></AdminGuard>;
}