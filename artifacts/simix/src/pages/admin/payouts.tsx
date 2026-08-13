import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import {
  Loader2, ArrowDownToLine, CheckCircle2, XCircle,
  RefreshCw, ChevronDown, AlertTriangle, Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ── Tab type ─────────────────────────────────────────────────── */
type Gateway = "pawapay" | "clapay";

/* ── Small helpers ─────────────────────────────────────────────── */
function Field({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({
  value, onChange, disabled, children, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  value, onChange, placeholder, type = "text", disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 disabled:opacity-50 focus:outline-none focus:border-violet-500 transition-colors"
    />
  );
}

/* ── Result banner ─────────────────────────────────────────────── */
function ResultBanner({
  result, onDismiss,
}: {
  result: { ok: boolean; message: string; detail?: string };
  onDismiss: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-4 flex items-start gap-3 ${
        result.ok
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : "bg-red-500/10 border-red-500/20 text-red-400"
      }`}
    >
      {result.ok ? (
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{result.message}</p>
        {result.detail && (
          <p className="text-xs mt-1 opacity-75 break-all">{result.detail}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-current opacity-50 hover:opacity-100 transition-opacity shrink-0"
      >
        <XCircle className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * PawaPay payout form
 * ═══════════════════════════════════════════════════════════════ */
function PawaPayForm() {
  const { toast } = useToast();
  const [countryIso3, setCountryIso3] = useState("");
  const [provider, setProvider] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dialCode, setDialCode] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null);

  const { data: configData, isLoading: configLoading, error: configError } = useQuery({
    queryKey: ["admin-payouts-pawapay-config"],
    queryFn: () => adminApi.getPayoutsPayapayConfig(),
    retry: 1,
  });

  const selectedCountry = configData?.countries.find((c) => c.countryIso3 === countryIso3);
  const currency = selectedCountry?.providers.find((p) => p.provider === provider)?.currency
    ?? selectedCountry?.currency
    ?? "";

  const payout = useMutation({
    mutationFn: () =>
      adminApi.initiatePawapayPayout({
        phoneNumber,
        dialCode: dialCode || undefined,
        provider,
        currency,
        amount: Number(amount),
      }),
    onSuccess: (data) => {
      if (data.status === "ACCEPTED") {
        setResult({
          ok: true,
          message: `Retrait accepté — ID : ${data.payoutId}`,
          detail: `Statut : ${data.status}. En attente de confirmation de l'opérateur.`,
        });
      } else {
        setResult({
          ok: false,
          message: `Retrait refusé — statut : ${data.status}`,
          detail: data.failureReason
            ? `${data.failureReason.failureCode}: ${data.failureReason.failureMessage}`
            : undefined,
        });
      }
    },
    onError: (e) => {
      setResult({ ok: false, message: (e as Error).message });
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    },
  });

  const canSubmit =
    countryIso3 && provider && phoneNumber && amount && Number(amount) > 0 && !payout.isPending;

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Chargement de la configuration PawaPay…
      </div>
    );
  }

  if (configError || !configData) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span>
          {(configError as Error)?.message ?? "Impossible de charger la configuration PawaPay"}.
          Vérifiez que le token PawaPay est configuré dans les Paramètres.
        </span>
      </div>
    );
  }

  if (configData.countries.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        Aucun pays PawaPay ne supporte les retraits (PAYOUT) pour ce compte marchand.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-xs text-zinc-500 bg-zinc-900/60 rounded-xl p-3 border border-zinc-800">
        <span className="font-semibold text-zinc-400">Environnement :</span>{" "}
        <span className={configData.env === "production" ? "text-emerald-400" : "text-amber-400"}>
          {configData.env === "production" ? "🟢 Production" : "🟡 Sandbox"}
        </span>
        {" — "}
        L'argent sera envoyé directement sur le numéro sélectionné.
      </div>

      {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Pays">
          <Select
            value={countryIso3}
            onChange={(v) => { setCountryIso3(v); setProvider(""); }}
            placeholder="— Sélectionner un pays —"
          >
            {configData.countries.map((c) => (
              <option key={c.countryIso3} value={c.countryIso3}>
                {c.countryIso2} — {c.currency}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Opérateur">
          <Select
            value={provider}
            onChange={setProvider}
            disabled={!selectedCountry}
            placeholder="— Sélectionner un opérateur —"
          >
            {selectedCountry?.providers.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.name || p.provider}
                {p.minAmount && p.maxAmount
                  ? ` (${p.minAmount}–${p.maxAmount} ${p.currency})`
                  : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Numéro de téléphone">
          <Input
            value={phoneNumber}
            onChange={setPhoneNumber}
            placeholder="ex: 0701234567"
          />
        </Field>

        <Field label="Indicatif pays (dial code)">
          <Input
            value={dialCode}
            onChange={setDialCode}
            placeholder="ex: +225"
          />
        </Field>

        <Field label={`Montant ${currency ? `(${currency})` : ""}`}>
          <Input
            type="number"
            value={amount}
            onChange={setAmount}
            placeholder="ex: 50000"
          />
        </Field>
      </div>

      <button
        onClick={() => payout.mutate()}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {payout.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…</>
        ) : (
          <><ArrowDownToLine className="w-4 h-4" /> Lancer le retrait PawaPay</>
        )}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Clapay cashout form
 * ═══════════════════════════════════════════════════════════════ */
function ClapayForm() {
  const { toast } = useToast();
  const [countryCode, setCountryCode] = useState("");
  const [cashoutCode, setCashoutCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dialCode, setDialCode] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null);

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

  const selectedCountry = countriesData?.countries.find((c) => c.code === countryCode);

  const cashout = useMutation({
    mutationFn: () =>
      adminApi.initiateClapayPayout({
        phoneNumber,
        dialCode: dialCode || undefined,
        countryCode,
        cashoutCode,
        amount: Number(amount),
      }),
    onSuccess: (data) => {
      setResult({
        ok: true,
        message: `Retrait initié — signature : ${data.signature.slice(0, 16)}…`,
        detail: `Transaction ID : ${data.transactionId} | Devise : ${data.currency}`,
      });
    },
    onError: (e) => {
      setResult({ ok: false, message: (e as Error).message });
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    },
  });

  const canSubmit =
    countryCode && cashoutCode && phoneNumber && amount && Number(amount) > 0 && !cashout.isPending;

  if (countriesLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Chargement des pays Clapay…
      </div>
    );
  }

  if (countriesError || !countriesData) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span>
          {(countriesError as Error)?.message ?? "Impossible de charger les pays Clapay"}.
          Vérifiez que le token Clapay est configuré dans les Paramètres.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-xs text-zinc-500 bg-zinc-900/60 rounded-xl p-3 border border-zinc-800">
        <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
        L'argent est retiré depuis votre balance Clapay du pays sélectionné.
        Vous devez avoir reçu des paiements dans ce pays pour pouvoir retirer.
      </div>

      {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Pays">
          <Select
            value={countryCode}
            onChange={(v) => { setCountryCode(v); setCashoutCode(""); }}
            placeholder="— Sélectionner un pays —"
          >
            {countriesData.countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code}) — {c.currency}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Opérateur">
          {operatorsLoading ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm py-2.5">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
            </div>
          ) : (
            <Select
              value={cashoutCode}
              onChange={setCashoutCode}
              disabled={!countryCode || !operatorsData?.operators.length}
              placeholder={
                !countryCode
                  ? "— Sélectionnez d'abord un pays —"
                  : operatorsData?.operators.length === 0
                    ? "Aucun opérateur cashout disponible"
                    : "— Sélectionner un opérateur —"
              }
            >
              {operatorsData?.operators.map((op) => (
                <option key={op.cashoutCode} value={op.cashoutCode}>
                  {op.name} ({op.codeoperator})
                  {op.requiresOtp ? " — OTP requis" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Numéro de téléphone">
          <Input
            value={phoneNumber}
            onChange={setPhoneNumber}
            placeholder={
              countryCode === "CI" || countryCode === "BJ"
                ? "ex: 0701234567 (format local)"
                : "ex: 691234567"
            }
          />
        </Field>

        <Field label="Indicatif pays (dial code)">
          <Input
            value={dialCode}
            onChange={setDialCode}
            placeholder={
              selectedCountry ? `+${selectedCountry.indicatif}` : "ex: +225"
            }
          />
        </Field>

        <Field label={`Montant ${selectedCountry ? `(${selectedCountry.currency})` : ""}`}>
          <Input
            type="number"
            value={amount}
            onChange={setAmount}
            placeholder="ex: 50000"
          />
        </Field>
      </div>

      <button
        onClick={() => cashout.mutate()}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {cashout.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…</>
        ) : (
          <><ArrowDownToLine className="w-4 h-4" /> Lancer le retrait Clapay</>
        )}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Main page
 * ═══════════════════════════════════════════════════════════════ */
function PayoutsContent() {
  const [gateway, setGateway] = useState<Gateway>("pawapay");

  const GATEWAYS: { value: Gateway; label: string; color: string }[] = [
    { value: "pawapay", label: "PawaPay", color: "violet" },
    { value: "clapay",  label: "Clapay",  color: "emerald" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            Retraits marchands
          </h1>
          <p className="text-zinc-400 text-sm mt-1.5">
            Envoyez de l'argent depuis votre balance agrégateur directement vers un numéro mobile money
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300/90 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
        <div>
          <p className="font-semibold">Règle importante — retrait par pays</p>
          <p className="text-amber-300/70 mt-0.5">
            Les fonds collectés dans un pays ne peuvent être retirés que dans ce même pays.
            Si vous avez reçu de l'argent au Cameroun, vous devez retirer au Cameroun sur l'opérateur correspondant.
          </p>
        </div>
      </div>

      {/* Gateway tabs */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="flex border-b border-zinc-800">
          {GATEWAYS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setGateway(value)}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-all ${
                gateway === value
                  ? "bg-zinc-800 text-white border-b-2 border-violet-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className={`w-4 h-4 ${gateway === value ? "text-violet-400" : ""}`} />
                {label}
              </div>
            </button>
          ))}
        </div>

        <div className="p-6">
          {gateway === "pawapay" ? <PawaPayForm /> : <ClapayForm />}
        </div>
      </div>
    </div>
  );
}

export default function AdminPayouts() {
  return (
    <AdminGuard>
      <AdminLayout>
        <PayoutsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
