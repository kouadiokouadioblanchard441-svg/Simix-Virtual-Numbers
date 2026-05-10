import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Loader2, Save, Wifi, WifiOff, CheckCircle2, XCircle, ChevronDown, ChevronUp, FlaskConical, RefreshCw, CheckCheck, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SETTINGS_SCHEMA = [
  {
    group: "Plateforme",
    fields: [
      { key: "platform_name", label: "Nom de la plateforme", placeholder: "Simix", type: "text" },
      { key: "platform_currency", label: "Devise", placeholder: "FCFA", type: "text" },
      { key: "default_country_code", label: "Pays par défaut", placeholder: "CI", type: "text" },
    ],
  },
  {
    group: "Contact & Service Client",
    fields: [
      { key: "support_email", label: "Email du support", placeholder: "support@simix.app", type: "email", hint: "Apparaît sur toutes les pages d'aide et documents légaux" },
      { key: "support_phone", label: "Numéro de téléphone", placeholder: "+225 07 00 00 00", type: "text", hint: "Numéro affiché dans l'aide et les mentions légales" },
      { key: "support_whatsapp", label: "Numéro WhatsApp", placeholder: "+2250101234567", type: "text", hint: "Format international sans espaces pour le lien wa.me" },
    ],
  },
  {
    group: "Mentions légales — Éditeur (Section 1)",
    fields: [
      { key: "legal_company_name", label: "Dénomination sociale", placeholder: "Simix Technologies", type: "text", hint: "Nom légal complet de la société — affiché dans les mentions légales" },
      { key: "legal_company_form", label: "Forme juridique", placeholder: "Société à Responsabilité Limitée (SARL)", type: "text" },
      { key: "legal_company_capital", label: "Capital social", placeholder: "5 000 000 FCFA", type: "text" },
      { key: "legal_company_address", label: "Siège social", placeholder: "Abidjan, Plateau, Côte d'Ivoire", type: "text" },
      { key: "legal_company_rccm", label: "RCCM", placeholder: "CI-ABJ-2024-B-XXXXX", type: "text", hint: "Numéro d'immatriculation au Registre du Commerce" },
      { key: "legal_company_tax", label: "N° Fiscal", placeholder: "XXXXX-XXXX-X", type: "text", hint: "Numéro d'identification fiscale" },
      { key: "legal_company_director", label: "Directeur de publication", placeholder: "Prénom NOM", type: "text", hint: "Nom complet du directeur de publication" },
    ],
  },
  {
    group: "Mentions légales — Hébergement (Section 3)",
    fields: [
      { key: "legal_hosting_provider", label: "Hébergeur principal", placeholder: "Supabase Inc.", type: "text" },
      { key: "legal_hosting_address", label: "Adresse de l'hébergeur", placeholder: "970 Toa Payoh North, Singapour", type: "text" },
      { key: "legal_hosting_region", label: "Région des données", placeholder: "Europe de l'Ouest (AWS eu-west-1)", type: "text" },
      { key: "legal_hosting_infra", label: "Infrastructure", placeholder: "Amazon Web Services (AWS)", type: "text" },
    ],
  },
  {
    group: "Limites & Contrôles",
    fields: [
      { key: "max_orders_per_minute", label: "Commandes max/minute par user", placeholder: "10", type: "number" },
      { key: "max_balance_fcfa", label: "Solde maximum (FCFA)", placeholder: "500000", type: "number" },
      { key: "min_deposit_fcfa", label: "Dépôt minimum (FCFA)", placeholder: "500", type: "number" },
      { key: "fraud_block_threshold", label: "Score risque pour blocage auto", placeholder: "70", type: "number" },
    ],
  },
  {
    group: "Fonctionnalités",
    fields: [
      { key: "registration_enabled", label: "Inscription activée", placeholder: "true", type: "text" },
      { key: "maintenance_mode", label: "Mode maintenance", placeholder: "false", type: "text" },
      { key: "sms_simulation", label: "Simulation SMS (développement)", placeholder: "true", type: "text" },
    ],
  },
  {
    group: "Alertes Telegram",
    fields: [
      { key: "telegram_bot_token", label: "Token du bot Telegram", placeholder: "1234567890:ABC...", type: "text" },
      { key: "telegram_chat_id", label: "Chat ID Telegram", placeholder: "-100123456789", type: "text" },
      { key: "telegram_alerts_enabled", label: "Alertes Telegram activées", placeholder: "false", type: "text" },
    ],
  },
  {
    group: "Réseaux Sociaux",
    fields: [
      {
        key: "social_telegram_url",
        label: "Lien canal Telegram",
        placeholder: "https://t.me/simix_officiel",
        type: "url",
        hint: "Laissez vide pour masquer l'icône sur la vitrine",
      },
      {
        key: "social_whatsapp_url",
        label: "Lien groupe / canal WhatsApp",
        placeholder: "https://wa.me/2250700000000",
        type: "url",
        hint: "Numéro ou lien de groupe WhatsApp",
      },
      {
        key: "social_facebook_url",
        label: "Lien page Facebook",
        placeholder: "https://facebook.com/simix",
        type: "url",
        hint: "URL complète de la page Facebook officielle",
      },
    ],
  },
  {
    group: "PawaPay — Mobile Money",
    fields: [
      { key: "pawapay_api_token", label: "Token API PawaPay", placeholder: "eyJ...", type: "password", hint: "Obtenez votre token sur le portail PawaPay" },
      { key: "pawapay_env", label: "Environnement PawaPay", placeholder: "sandbox", type: "text", hint: "sandbox ou production" },
      { key: "pawapay_webhook_secret", label: "Secret webhook PawaPay", placeholder: "webhook-secret", type: "password", hint: "Optionnel — pour valider les webhooks entrants" },
    ],
  },
];

interface PawaPayTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  env?: string;
  activeCount?: number;
  totalCount?: number;
  operators?: { name: string; country: string; currency: string }[];
}

function PawaPayTestButton({ token, env }: { token: string; env: string }) {
  const [result, setResult] = useState<PawaPayTestResult | null>(null);
  const [showOperators, setShowOperators] = useState(false);

  const test = useMutation({
    mutationFn: () => adminApi.testPawaPay(token || undefined, env || undefined),
    onSuccess: (data) => setResult(data),
    onError: (e) => setResult({ success: false, message: (e as Error).message }),
  });

  return (
    <div className="mt-4 space-y-3">
      <button
        onClick={() => { setResult(null); setShowOperators(false); test.mutate(); }}
        disabled={test.isPending}
        className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {test.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Test en cours…</>
        ) : (
          <><Wifi className="w-4 h-4" /> Tester la connexion PawaPay</>
        )}
      </button>

      {result && (
        <div className={`rounded-xl border p-4 space-y-3 ${result.success ? "bg-emerald-950/40 border-emerald-700/40" : "bg-red-950/40 border-red-700/40"}`}>
          <div className="flex items-start gap-3">
            {result.success
              ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              : <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${result.success ? "text-emerald-300" : "text-red-300"}`}>
                {result.message}
              </p>
              {result.success && (
                <div className="flex flex-wrap gap-3 mt-2">
                  {result.latencyMs !== undefined && (
                    <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded-md">
                      Latence : <span className="text-white font-mono">{result.latencyMs}ms</span>
                    </span>
                  )}
                  {result.env && (
                    <span className={`text-xs px-2 py-1 rounded-md font-medium ${result.env === "production" ? "bg-emerald-900/50 text-emerald-400" : "bg-yellow-900/50 text-yellow-400"}`}>
                      {result.env === "production" ? "🟢 Production" : "🟡 Sandbox"}
                    </span>
                  )}
                  {result.activeCount !== undefined && (
                    <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded-md">
                      Opérateurs actifs : <span className="text-white font-mono">{result.activeCount}/{result.totalCount}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {result.success && result.operators && result.operators.length > 0 && (
            <div>
              <button
                onClick={() => setShowOperators(v => !v)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {showOperators ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showOperators ? "Masquer" : "Voir"} les opérateurs disponibles
              </button>
              {showOperators && (
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {result.operators.map(op => (
                    <div key={op.name} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-2.5 py-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-white font-medium truncate">{op.name}</div>
                        <div className="text-[10px] text-zinc-500">{op.country} · {op.currency}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!result.success && (
            <div className="flex items-center gap-2 text-xs text-red-400/80">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              Vérifiez que le token est correct et que l'environnement correspond (sandbox / production).
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PawaPaySimulator() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: pending = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-pawapay-pending"],
    queryFn: adminApi.getPendingPawaPayDeposits,
    refetchInterval: 15000,
  });

  const simulate = useMutation({
    mutationFn: ({ depositId, status }: { depositId: string; status: "COMPLETED" | "FAILED" }) =>
      adminApi.simulatePawaPayDeposit(depositId, status),
    onSuccess: (data) => {
      toast({ title: data.success ? "Simulation réussie" : "Erreur", description: data.message, variant: data.success ? "default" : "destructive" });
      qc.invalidateQueries({ queryKey: ["admin-pawapay-pending"] });
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <div className="mt-6 border-t border-zinc-800 pt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white">Simulateur de dépôts</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 font-medium">TEST</span>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      <p className="text-xs text-zinc-500 mb-4">
        Simule la réponse de PawaPay pour un dépôt en attente — utile pour tester l'intégration sans vrai paiement mobile.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
      ) : pending.length === 0 ? (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-6 text-center">
          <p className="text-zinc-500 text-sm">Aucun dépôt en attente PawaPay pour l'instant.</p>
          <p className="text-zinc-600 text-xs mt-1">Initie un dépôt depuis l'app pour le voir apparaître ici.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map(dep => (
            <div key={dep.id} className="flex items-center gap-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-white font-medium">{dep.userFullName || "—"}</span>
                  <span className="text-xs text-zinc-500">{dep.userPhone || ""}</span>
                  <span className="text-xs font-mono text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">
                    {dep.amount.toLocaleString()} FCFA
                  </span>
                  <span className="text-xs text-zinc-600">{dep.method}</span>
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5 font-mono truncate">
                  ID: {dep.externalDepositId}
                </div>
                <div className="text-[10px] text-zinc-600">
                  {new Date(dep.createdAt).toLocaleString("fr-FR")}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => simulate.mutate({ depositId: dep.externalDepositId, status: "COMPLETED" })}
                  disabled={simulate.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Compléter
                </button>
                <button
                  onClick={() => simulate.mutate({ depositId: dep.externalDepositId, status: "FAILED" })}
                  disabled={simulate.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700/80 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Échouer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsContent() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: adminApi.getSettings,
  });

  useEffect(() => {
    if (settings) {
      setValues(settings);
      setDirty(false);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: () => adminApi.updateSettings(values),
    onSuccess: () => { toast({ title: "Paramètres enregistrés" }); setDirty(false); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const set = (key: string, val: string) => {
    setValues(v => ({ ...v, [key]: val }));
    setDirty(true);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Paramètres système</h1>
          <p className="text-zinc-400 text-sm mt-1">Configurez le comportement de la plateforme</p>
        </div>
        {dirty && (
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer les modifications
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {SETTINGS_SCHEMA.map(({ group, fields }) => (
          <div
            key={group}
            className={`bg-zinc-900 border rounded-xl p-5 space-y-4 ${group === "PawaPay — Mobile Money" ? "border-orange-500/30 lg:col-span-2" : "border-zinc-800"}`}
          >
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              {group === "PawaPay — Mobile Money" && (
                <div className="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 text-[10px] font-bold">P</div>
              )}
              <h2 className="text-sm font-semibold text-white">{group}</h2>
              {group === "PawaPay — Mobile Money" && (
                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20 font-medium">Paiements Mobile Money</span>
              )}
            </div>

            {group === "PawaPay — Mobile Money" && (
              <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
                <p>PawaPay permet d'accepter des paiements Mobile Money réels (Orange Money, MTN, Wave, etc.) via une seule API.</p>
                <p>
                  Obtenez vos identifiants sur{" "}
                  <a href="https://dashboard.pawapay.io" target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">dashboard.pawapay.io</a>.
                  Utilisez <code className="text-violet-400">sandbox</code> pour les tests et <code className="text-violet-400">production</code> pour le live.
                </p>
                <p className="flex flex-col gap-0.5">
                  <span>URLs webhook à configurer sur PawaPay Dashboard :</span>
                  <span>• Dépôts : <code className="text-emerald-400">/api/wallet/pawapay/webhook</code></span>
                  <span>• Remboursements : <code className="text-emerald-400">/api/wallet/pawapay/refund-webhook</code></span>
                </p>
              </div>
            )}

            <div className={group === "PawaPay — Mobile Money" ? "grid grid-cols-1 md:grid-cols-3 gap-4" : ""}>
              {fields.map(({ key, label, placeholder, type, hint }: { key: string; label: string; placeholder: string; type: string; hint?: string }) => (
                <div key={key}>
                  <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
                  <input
                    type={type}
                    value={values[key] ?? ""}
                    onChange={e => set(key, e.target.value)}
                    placeholder={placeholder}
                    className={`w-full px-3 py-2 text-sm bg-zinc-800 border rounded-lg text-white placeholder:text-zinc-500 focus:outline-none transition-colors ${group === "PawaPay — Mobile Money" ? "border-zinc-700 focus:border-orange-500" : "border-zinc-700 focus:border-violet-500"}`}
                  />
                  {hint && <div className="text-xs text-zinc-600 mt-1">{hint}</div>}
                  {!values[key] && !hint && <div className="text-xs text-zinc-600 mt-1">Défaut : {placeholder}</div>}
                </div>
              ))}
            </div>

            {group === "PawaPay — Mobile Money" && (
              <>
                <PawaPayTestButton
                  token={values["pawapay_api_token"] ?? ""}
                  env={values["pawapay_env"] ?? "sandbox"}
                />
                <PawaPaySimulator />
              </>
            )}
          </div>
        ))}
      </div>

      {dirty && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl shadow-lg shadow-violet-500/20 transition-colors disabled:opacity-60"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminSettings() {
  return (
    <AdminGuard>
      <AdminLayout>
        <SettingsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
