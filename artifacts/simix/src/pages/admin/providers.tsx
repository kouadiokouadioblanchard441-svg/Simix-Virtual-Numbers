import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type ApiProvider, type ProviderTestResult } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import {
  Loader2, Plus, Pencil, Trash2, X, Eye, EyeOff, Zap,
  CheckCircle2, XCircle, RefreshCw, DollarSign, WifiIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PRIORITY_LABELS: Record<number, string> = { 1: "Principal", 2: "Secondaire", 3: "Backup" };

function TestResultBadge({ result }: { result: ProviderTestResult | null }) {
  if (!result) return null;
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${result.success ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
      {result.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <div className="font-medium">{result.message}</div>
        {result.balance !== undefined && (
          <div className="text-xs mt-0.5 opacity-75">Solde 5sim : ${result.balance.toFixed(2)} USD</div>
        )}
        {result.details && (
          <div className="text-xs mt-0.5 opacity-75">
            {Object.entries(result.details as Record<string, unknown>)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderCard({ provider, onEdit }: { provider: ApiProvider; onEdit: (p: ApiProvider) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);

  const toggle = useMutation({
    mutationFn: () => adminApi.updateProvider(provider.id, { active: !provider.active }),
    onSuccess: () => {
      toast({ title: provider.active ? "Fournisseur désactivé" : "Fournisseur activé" });
      qc.invalidateQueries({ queryKey: ["admin-providers"] });
    },
  });

  const del = useMutation({
    mutationFn: () => adminApi.deleteProvider(provider.id),
    onSuccess: () => { toast({ title: "Fournisseur supprimé" }); qc.invalidateQueries({ queryKey: ["admin-providers"] }); },
  });

  const testConn = useMutation({
    mutationFn: () => adminApi.testProvider(provider.id),
    onSuccess: (result) => {
      setTestResult(result);
      toast({ title: result.success ? "Connexion réussie" : "Connexion échouée", variant: result.success ? "default" : "destructive" });
    },
    onError: (e) => toast({ title: "Erreur de test", description: (e as Error).message, variant: "destructive" }),
  });

  const syncProducts = useMutation({
    mutationFn: () => adminApi.syncProviderProducts(provider.id),
    onSuccess: (res) => toast({ title: "Synchronisation terminée", description: res.message }),
    onError: (e) => toast({ title: "Erreur de sync", description: (e as Error).message, variant: "destructive" }),
  });

  const { data: balance, refetch: fetchBalance, isLoading: loadingBalance } = useQuery({
    queryKey: ["provider-balance", provider.id],
    queryFn: () => adminApi.getProviderBalance(provider.id),
    enabled: false,
  });

  const maskedKey = provider.apiKey
    ? `${provider.apiKey.slice(0, 8)}${"•".repeat(Math.max(0, provider.apiKey.length - 12))}${provider.apiKey.slice(-4)}`
    : "Non configuré";

  const is5sim = provider.slug === "5sim";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${provider.active ? "bg-violet-600" : "bg-zinc-700"}`}>
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold">{provider.name}</div>
            <div className="text-zinc-500 text-xs font-mono">{provider.slug}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${provider.active ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-700 text-zinc-500"}`}>
            {provider.active ? "Actif" : "Inactif"}
          </span>
          <span className="text-xs text-zinc-600">{PRIORITY_LABELS[provider.priority] ?? `P${provider.priority}`}</span>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">URL de base</span>
          <span className="text-zinc-300 font-mono text-xs truncate max-w-[180px]">{provider.baseUrl || "Non défini"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Clé API</span>
          <div className="flex items-center gap-1">
            <span className="text-zinc-300 font-mono text-xs">{showKey ? provider.apiKey : maskedKey}</span>
            <button onClick={() => setShowKey(v => !v)} className="text-zinc-600 hover:text-zinc-400">
              {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Marge</span>
          <span className="text-white font-semibold">+{provider.markup}%</span>
        </div>
        {balance !== undefined && balance !== null && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Solde fournisseur</span>
            <span className="text-emerald-400 font-semibold">${(balance as { balance: number }).balance.toFixed(2)} USD</span>
          </div>
        )}
      </div>

      {testResult && <TestResultBadge result={testResult} />}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${provider.active ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300" : "bg-violet-600 hover:bg-violet-700 text-white"}`}
        >
          {toggle.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : provider.active ? "Désactiver" : "Activer"}
        </button>

        <button
          onClick={() => testConn.mutate()}
          disabled={testConn.isPending}
          title="Tester la connexion"
          className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 transition-colors"
        >
          {testConn.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <WifiIcon className="w-4 h-4" />}
        </button>

        <button
          onClick={() => fetchBalance()}
          disabled={loadingBalance}
          title="Voir le solde"
          className="p-1.5 rounded-lg hover:bg-blue-500/20 text-zinc-500 hover:text-blue-400 transition-colors"
        >
          {loadingBalance ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
        </button>

        {is5sim && (
          <button
            onClick={() => { if (confirm("Synchroniser les produits 5sim dans la base de données ?")) syncProducts.mutate(); }}
            disabled={syncProducts.isPending}
            title="Synchroniser les produits"
            className="p-1.5 rounded-lg hover:bg-orange-500/20 text-zinc-500 hover:text-orange-400 transition-colors"
          >
            {syncProducts.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        )}

        <button
          onClick={() => onEdit(provider)}
          className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-white transition-colors"
        >
          <Pencil className="w-4 h-4" />
        </button>

        <button
          onClick={() => { if (confirm(`Supprimer ${provider.name} ?`)) del.mutate(); }}
          disabled={del.isPending}
          className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
        >
          {del.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      {is5sim && (
        <div className="text-[11px] text-zinc-600 pt-1 border-t border-zinc-800/60">
          <span className="text-violet-400">5sim :</span> Cliquez sur <span className="text-emerald-400">Wifi</span> pour tester, <span className="text-blue-400">$</span> pour le solde, <span className="text-orange-400">↻</span> pour synchroniser les produits.
        </div>
      )}
    </div>
  );
}

function ProviderModal({ provider, onClose }: { provider: Partial<ApiProvider> | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: provider?.name ?? "",
    slug: provider?.slug ?? "",
    apiKey: provider?.apiKey ?? "",
    baseUrl: provider?.baseUrl ?? "",
    active: provider?.active ?? false,
    priority: provider?.priority ?? 1,
    markup: provider?.markup ?? 20,
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => provider?.id ? adminApi.updateProvider(provider.id, form) : adminApi.createProvider(form),
    onSuccess: () => {
      toast({ title: provider?.id ? "Fournisseur mis à jour" : "Fournisseur créé" });
      qc.invalidateQueries({ queryKey: ["admin-providers"] });
      onClose();
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const presets = [
    { name: "5SIM", slug: "5sim", baseUrl: "https://5sim.net/v1", placeholder: "Bearer token 5sim" },
    { name: "SMSPool", slug: "smspool", baseUrl: "https://www.smspool.net/api", placeholder: "API Key SMSPool" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">{provider?.id ? "Modifier le fournisseur" : "Ajouter un fournisseur"}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-zinc-500" /></button>
        </div>

        {!provider?.id && (
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-400 mb-2">Préréglages rapides :</p>
            <div className="flex gap-2">
              {presets.map(p => (
                <button
                  key={p.slug}
                  onClick={() => setForm(f => ({ ...f, name: p.name, slug: p.slug, baseUrl: p.baseUrl }))}
                  className="flex-1 py-1.5 text-xs rounded-lg border border-zinc-700 hover:border-violet-500 text-zinc-400 hover:text-white transition-colors bg-zinc-800 hover:bg-zinc-700"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {[
          { k: "name", label: "Nom", placeholder: "ex : 5SIM" },
          { k: "slug", label: "Identifiant (slug)", placeholder: "ex : 5sim" },
          { k: "baseUrl", label: "URL de base", placeholder: "https://5sim.net/v1" },
          { k: "apiKey", label: "Clé API", placeholder: "API key..." },
        ].map(({ k, label, placeholder }) => (
          <div key={k}>
            <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
            <input
              value={(form as Record<string, unknown>)[k] as string}
              onChange={e => set(k, e.target.value)}
              placeholder={placeholder}
              type={k === "apiKey" ? "password" : "text"}
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
            />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Priorité</label>
            <select value={form.priority} onChange={e => set("priority", Number(e.target.value))} className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500">
              <option value={1}>1 — Principal</option>
              <option value={2}>2 — Secondaire</option>
              <option value={3}>3 — Backup</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Marge (%)</label>
            <input type="number" value={form.markup} onChange={e => set("markup", Number(e.target.value))} className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => set("active", !form.active)} className={`relative w-11 h-6 rounded-full transition-colors ${form.active ? "bg-violet-600" : "bg-zinc-700"}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.active ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="text-sm text-zinc-300">Activer immédiatement</span>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">Annuler</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.name || !form.slug}
            className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm transition-colors disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : provider?.id ? "Mettre à jour" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProvidersContent() {
  const [editing, setEditing] = useState<Partial<ApiProvider> | null | false>(false);
  const { data: providers, isLoading } = useQuery({ queryKey: ["admin-providers"], queryFn: adminApi.getProviders });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fournisseurs API</h1>
          <p className="text-zinc-400 text-sm mt-1">Gérez vos fournisseurs de numéros SMS</p>
        </div>
        <button onClick={() => setEditing({})} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-400 space-y-1">
        <p className="font-medium text-zinc-300">Comment ça marche ?</p>
        <p>Ajoutez un fournisseur avec slug <code className="text-violet-400">5sim</code> et renseignez votre clé API 5sim.net. Une fois activé, les achats de numéros utiliseront automatiquement de vrais numéros 5sim. Sinon, la simulation reste active.</p>
        <p className="text-xs mt-1">Pour PawaPay (paiements Mobile Money) : configurez le token dans <span className="text-violet-400">Paramètres</span>.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
      ) : providers?.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <Zap className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <div className="text-zinc-400 font-medium">Aucun fournisseur configuré</div>
          <div className="text-zinc-600 text-sm mt-1 mb-4">Ajoutez 5SIM ou un autre fournisseur pour obtenir de vrais numéros.</div>
          <button onClick={() => setEditing({})} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg transition-colors">
            <Plus className="w-4 h-4 inline mr-1" /> Ajouter un fournisseur
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers?.map(p => <ProviderCard key={p.id} provider={p} onEdit={setEditing} />)}
        </div>
      )}

      {editing !== false && <ProviderModal provider={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}

export default function AdminProviders() {
  return (
    <AdminGuard>
      <AdminLayout>
        <ProvidersContent />
      </AdminLayout>
    </AdminGuard>
  );
}
