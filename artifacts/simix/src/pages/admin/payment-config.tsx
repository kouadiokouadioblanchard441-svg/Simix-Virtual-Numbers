import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminPaymentMethod, type PaymentConfig } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import {
  Loader2, ToggleLeft, ToggleRight, Globe, Search, Plus, Pencil, Check, X,
  Trash2, Image, Link, ExternalLink, Star, ArrowUpDown, CreditCard, MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ─── Operator Logo Component ─── */
function OperatorLogo({ method, size = 32 }: { method: Pick<AdminPaymentMethod, "name" | "color" | "logoUrl">; size?: number }) {
  const [imgError, setImgError] = useState(false);

  if (method.logoUrl && !imgError) {
    return (
      <img
        src={method.logoUrl}
        alt={method.name}
        width={size}
        height={size}
        className="object-contain rounded"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }

  /* Fallback: colored circle with initials */
  const initials = method.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-lg flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: method.color, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

/* ─── Method Row (logo manager tab) ─── */
function MethodRow({ method, onSaved, onDeleted }: { method: AdminPaymentMethod; onSaved: () => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(method.name);
  const [desc, setDesc] = useState(method.description);
  const [color, setColor] = useState(method.color);
  const [logoUrl, setLogoUrl] = useState(method.logoUrl ?? "");
  const [recommended, setRecommended] = useState(method.recommended);
  const [sortOrder, setSortOrder] = useState(String(method.sortOrder));
  const { toast } = useToast();
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: () => adminApi.updatePaymentMethod(method.id, {
      name, description: desc, color, logoUrl: logoUrl || null, recommended, sortOrder: Number(sortOrder),
    }),
    onSuccess: () => { toast({ title: "Opérateur mis à jour" }); qc.invalidateQueries({ queryKey: ["admin-payment-methods"] }); qc.invalidateQueries({ queryKey: ["admin-payment-configs"] }); onSaved(); setEditing(false); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: () => adminApi.deletePaymentMethod(method.id),
    onSuccess: () => { toast({ title: "Opérateur supprimé" }); qc.invalidateQueries({ queryKey: ["admin-payment-methods"] }); onDeleted(); },
  });

  return (
    <div className={`border border-zinc-800 rounded-xl overflow-hidden transition-all ${editing ? "border-violet-700/50" : "hover:border-zinc-700"}`}>
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900">
        <div className="flex-shrink-0">
          <OperatorLogo method={{ name, color, logoUrl: logoUrl || null }} size={40} />
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-sm font-semibold bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white focus:outline-none focus:border-violet-500"
            />
          ) : (
            <div className="font-semibold text-white text-sm truncate">{method.name}</div>
          )}
          <div className="text-zinc-500 text-xs font-mono">{method.slug}</div>
        </div>
        {method.recommended && !editing && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
            <Star className="w-2.5 h-2.5" />Recommandé
          </span>
        )}
        <div className="flex gap-1.5 ml-auto flex-shrink-0">
          {editing ? (
            <>
              <button onClick={() => update.mutate()} disabled={update.isPending} className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
                {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
              <button
                onClick={() => { if (confirm(`Supprimer l'opérateur "${method.name}" ?`)) del.mutate(); }}
                disabled={del.isPending}
                className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
              ><Trash2 className="w-3.5 h-3.5" /></button>
            </>
          )}
        </div>
      </div>

      {/* Editing body */}
      {editing && (
        <div className="px-4 pb-4 pt-2 bg-zinc-950/50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 font-medium block mb-1 flex items-center gap-1"><Image className="w-3 h-3" />URL du logo</label>
              <input
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
              />
              {logoUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Aperçu :</span>
                  <OperatorLogo method={{ name, color, logoUrl }} size={28} />
                  <a href={logoUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-violet-400 transition-colors"><ExternalLink className="w-3 h-3" /></a>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-zinc-500 font-medium block mb-1">Couleur de marque</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                  <input value={color} onChange={e => setColor(e.target.value)} className="flex-1 px-2 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded text-white font-mono focus:outline-none focus:border-violet-500" placeholder="#FF7A00" />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500 font-medium block mb-1">Ordre d'affichage</label>
                <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="w-full px-2 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded text-white focus:outline-none focus:border-violet-500" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 font-medium block mb-1">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Orange CI, MTN Afrique..." className="w-full px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRecommended(r => !r)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${recommended ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-zinc-900 border-zinc-700 text-zinc-500"}`}
            >
              <Star className="w-3.5 h-3.5" />{recommended ? "Recommandé" : "Marquer recommandé"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Add New Operator Form ─── */
function AddMethodForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState("#7C3AED");
  const [logoUrl, setLogoUrl] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () => adminApi.createPaymentMethod({ name, slug, description: desc, color, logoUrl: logoUrl || null, recommended: false }),
    onSuccess: () => { toast({ title: "Opérateur créé" }); qc.invalidateQueries({ queryKey: ["admin-payment-methods"] }); qc.invalidateQueries({ queryKey: ["admin-payment-configs"] }); onDone(); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const autoSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  return (
    <div className="border border-violet-700/40 bg-violet-950/20 rounded-xl p-4 space-y-3">
      <div className="text-sm font-semibold text-violet-400 flex items-center gap-2"><Plus className="w-4 h-4" />Ajouter un opérateur</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Nom de l'opérateur *</label>
          <input value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(autoSlug(e.target.value)); }} placeholder="Ex: Wave, Moov Money..." className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Slug (identifiant unique) *</label>
          <input value={slug} onChange={e => setSlug(autoSlug(e.target.value))} placeholder="ex: wave_money" className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">URL du logo</label>
          <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Description</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Orange CI/SN/BF" className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs text-zinc-500">Couleur :</label>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
        <input value={color} onChange={e => setColor(e.target.value)} className="w-28 px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-white font-mono focus:outline-none focus:border-violet-500" />
        {(name || logoUrl) && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-zinc-500">Aperçu :</span>
            <OperatorLogo method={{ name: name || "?", color, logoUrl: logoUrl || null }} size={32} />
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => create.mutate()} disabled={create.isPending || !name || !slug} className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
          {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Créer l'opérateur
        </button>
        <button onClick={onDone} className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors">Annuler</button>
      </div>
    </div>
  );
}

/* ─── Config Matrix Cell ─── */
function ConfigCell({
  config, countryCode, method,
}: {
  config: PaymentConfig | undefined;
  countryCode: string;
  method: AdminPaymentMethod;
}) {
  const enabled = config?.enabled ?? false;
  const minDeposit = config?.minDeposit ?? 500;
  const feePercent = config?.feePercent ?? 0;
  const [editing, setEditing] = useState(false);
  const [minDep, setMinDep] = useState(String(minDeposit));
  const [fee, setFee] = useState(String(feePercent));
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (newEnabled: boolean) =>
      adminApi.updatePaymentConfig({ countryCode, methodSlug: method.slug, enabled: newEnabled, minDeposit: Number(minDep), feePercent: Number(fee) }),
    onSuccess: () => { toast({ title: "Configuré" }); qc.invalidateQueries({ queryKey: ["admin-payment-configs"] }); setEditing(false); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <td className="py-2 px-2 border-r border-zinc-800/40 last:border-r-0 align-top" style={{ minWidth: 90 }}>
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => save.mutate(!enabled)} disabled={save.isPending} className="transition-colors mt-1" title={enabled ? "Désactiver" : "Activer"}>
          {save.isPending
            ? <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            : enabled
              ? <ToggleRight className="w-6 h-6 text-emerald-500" />
              : <ToggleLeft className="w-6 h-6 text-zinc-700" />
          }
        </button>
        {enabled && !editing && (
          <button onClick={() => setEditing(true)} className="text-[10px] text-zinc-600 hover:text-violet-400 underline transition-colors leading-tight text-center">
            {formatFCFA(minDeposit)}{feePercent > 0 ? ` +${feePercent}%` : ""}
          </button>
        )}
        {enabled && editing && (
          <div className="flex flex-col gap-1 w-full px-1">
            <input type="number" value={minDep} onChange={e => setMinDep(e.target.value)} placeholder="Min" className="w-full px-1.5 py-1 text-[11px] bg-zinc-900 border border-zinc-700 rounded text-white focus:outline-none focus:border-violet-500" />
            <div className="flex items-center gap-0.5">
              <input type="number" value={fee} onChange={e => setFee(e.target.value)} placeholder="%" min={0} max={100} className="w-full px-1.5 py-1 text-[11px] bg-zinc-900 border border-zinc-700 rounded text-white focus:outline-none focus:border-violet-500" />
              <span className="text-zinc-600 text-[10px] shrink-0">%</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => save.mutate(true)} disabled={save.isPending} className="flex-1 text-[10px] py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors font-medium">✓</button>
              <button onClick={() => setEditing(false)} className="flex-1 text-[10px] py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded transition-colors">✕</button>
            </div>
          </div>
        )}
      </div>
    </td>
  );
}

/* ─── OPERATORS TAB ─── */
function OperatorsTab() {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const { data: methods, isLoading } = useQuery({ queryKey: ["admin-payment-methods"], queryFn: adminApi.getPaymentMethods });

  const filtered = (methods ?? []).filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.slug.includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un opérateur..." className="pl-9 pr-4 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 w-full" />
        </div>
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors font-medium">
          <Plus className="w-4 h-4" />Ajouter un opérateur
        </button>
      </div>

      {showAdd && <AddMethodForm onDone={() => setShowAdd(false)} />}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(m => (
            <MethodRow key={m.id} method={m} onSaved={() => {}} onDeleted={() => {}} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-12 text-zinc-500">Aucun opérateur trouvé</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── MATRIX TAB ─── */
function MatrixTab() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["admin-payment-configs"], queryFn: adminApi.getPaymentConfigs });

  const configMap = new Map<string, PaymentConfig>();
  for (const c of data?.configs ?? []) {
    configMap.set(`${c.countryCode}:${c.methodSlug}`, c);
  }

  const filtered = (data?.countries ?? []).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = data?.configs.filter(c => c.enabled).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer par pays..." className="pl-9 pr-4 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 w-64" />
        </div>
        <div className="text-sm text-zinc-500">
          <span className="text-emerald-400 font-semibold">{enabledCount}</span> combinaisons actives sur{" "}
          <span className="text-white font-semibold">{(data?.countries.length ?? 0) * (data?.methods.length ?? 0)}</span> possibles
        </div>
      </div>

      <div className="text-xs text-zinc-600 flex items-center gap-4 flex-wrap">
        <span className="flex items-center gap-1"><ToggleRight className="w-4 h-4 text-emerald-500" />Activé</span>
        <span className="flex items-center gap-1"><ToggleLeft className="w-4 h-4 text-zinc-700" />Désactivé</span>
        <span className="text-zinc-600">Cliquez sur le montant min pour modifier les frais</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide sticky left-0 bg-zinc-900 z-10 min-w-[160px]">
                    <div className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Pays ({filtered.length})</div>
                  </th>
                  {data?.methods.map(m => (
                    <th key={m.slug} className="py-3 px-2 border-r border-zinc-800/40 last:border-r-0" style={{ minWidth: 90 }}>
                      <div className="flex flex-col items-center gap-1.5">
                        <OperatorLogo method={m} size={30} />
                        <span className="text-[10px] font-semibold text-zinc-400 text-center leading-tight max-w-[80px]">{m.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={(data?.methods.length ?? 0) + 1} className="py-12 text-center text-zinc-500">Aucun pays trouvé</td></tr>
                ) : (
                  filtered.map(country => (
                    <tr key={country.code} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="py-2 px-4 sticky left-0 bg-zinc-900 z-10">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{country.flag}</span>
                          <div>
                            <div className="text-white text-sm font-medium leading-tight">{country.name}</div>
                            <div className="text-zinc-600 text-xs font-mono">{country.code}</div>
                          </div>
                        </div>
                      </td>
                      {data?.methods.map(method => (
                        <ConfigCell
                          key={method.slug}
                          config={configMap.get(`${country.code}:${method.slug}`)}
                          countryCode={country.code}
                          method={method}
                        />
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── MAIN PAGE ─── */
type Tab = "operators" | "matrix";

function PaymentConfigContent() {
  const [tab, setTab] = useState<Tab>("operators");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: methods } = useQuery({ queryKey: ["admin-payment-methods"], queryFn: adminApi.getPaymentMethods });
  const { data: configData } = useQuery({ queryKey: ["admin-payment-configs"], queryFn: adminApi.getPaymentConfigs });

  const seedMutation = useMutation({
    mutationFn: adminApi.seedAfricanCountries,
    onSuccess: (result) => {
      toast({ title: `🌍 Pays africains ajoutés`, description: `${result.inserted} insérés, ${result.updated} mis à jour sur ${result.total} pays` });
      qc.invalidateQueries({ queryKey: ["admin-payment-configs"] });
      qc.invalidateQueries({ queryKey: ["admin-countries"] });
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "operators", label: "Opérateurs & Logos", count: methods?.length },
    { id: "matrix", label: "Config par pays", count: configData?.countries.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Méthodes de paiement</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Configurez les logos des opérateurs et leur disponibilité par pays
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Seed African countries button */}
          <button
            onClick={() => {
              if (confirm("Ajouter / mettre à jour les 54 pays africains dans la base de données ?")) {
                seedMutation.mutate();
              }
            }}
            disabled={seedMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 rounded-xl hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
          >
            {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Seed pays africains
          </button>
          {/* Operator logo preview strip */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5">
            {(methods ?? []).slice(0, 6).map(m => (
              <OperatorLogo key={m.id} method={m} size={28} />
            ))}
            {(methods?.length ?? 0) > 6 && (
              <span className="text-xs text-zinc-500 font-medium">+{(methods?.length ?? 0) - 6}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? "bg-white/20" : "bg-zinc-800"}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "operators" && <OperatorsTab />}
      {tab === "matrix" && <MatrixTab />}
    </div>
  );
}

export default function AdminPaymentConfig() {
  return (
    <AdminGuard>
      <AdminLayout>
        <PaymentConfigContent />
      </AdminLayout>
    </AdminGuard>
  );
}
