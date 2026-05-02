import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminService, type AdminCountry } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, Pencil, Check, X, TrendingUp, ToggleLeft, ToggleRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function ServiceRow({ service }: { service: AdminService }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(service.price));
  const [providerPrice, setProviderPrice] = useState(String(service.providerPrice ?? 0));
  const [margin, setMargin] = useState(String(service.margin ?? 20));
  const [available, setAvailable] = useState(String(service.available));
  const [popular, setPopular] = useState(service.popular);
  const [enabled, setEnabled] = useState(service.enabled ?? true);
  const { toast } = useToast();
  const qc = useQueryClient();

  const pp = Number(providerPrice);
  const mg = Number(margin);
  const computedPrice = pp > 0 ? Math.round(pp + pp * (mg / 100)) : Number(price);

  const update = useMutation({
    mutationFn: () => adminApi.updateService(service.id, {
      price: pp > 0 ? computedPrice : Number(price),
      providerPrice: pp,
      margin: mg,
      available: Number(available),
      popular,
      enabled,
    }),
    onSuccess: () => { toast({ title: "Service mis à jour" }); qc.invalidateQueries({ queryKey: ["admin-services"] }); setEditing(false); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const toggleEnabled = useMutation({
    mutationFn: () => adminApi.updateService(service.id, { enabled: !service.enabled }),
    onSuccess: () => { toast({ title: service.enabled ? "Service désactivé" : "Service activé" }); qc.invalidateQueries({ queryKey: ["admin-services"] }); },
  });

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/20 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: service.color }} />
          <div>
            <span className="text-white text-sm font-medium">{service.name}</span>
            <div className="text-zinc-600 text-xs font-mono">{service.slug}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-zinc-400 text-xs">{service.category}</td>

      {/* Provider Price */}
      <td className="py-3 px-4">
        {editing ? (
          <input type="number" value={providerPrice} onChange={e => setProviderPrice(e.target.value)} className="w-24 px-2 py-1 text-sm bg-zinc-800 border border-blue-500/50 rounded text-white focus:outline-none" placeholder="0" />
        ) : (
          <span className="text-zinc-400 text-sm">{service.providerPrice > 0 ? formatFCFA(service.providerPrice) : <span className="text-zinc-600 italic text-xs">Non défini</span>}</span>
        )}
      </td>

      {/* Margin % */}
      <td className="py-3 px-4">
        {editing ? (
          <div className="flex items-center gap-1">
            <input type="number" value={margin} onChange={e => setMargin(e.target.value)} className="w-16 px-2 py-1 text-sm bg-zinc-800 border border-amber-500/50 rounded text-white focus:outline-none" min={0} max={500} />
            <span className="text-zinc-500 text-xs">%</span>
          </div>
        ) : (
          <span className="text-amber-400 text-sm font-medium">+{service.margin ?? 20}%</span>
        )}
      </td>

      {/* Final Price */}
      <td className="py-3 px-4">
        {editing ? (
          <div className="text-violet-400 text-sm font-bold">
            {pp > 0 ? formatFCFA(computedPrice) : (
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-24 px-2 py-1 text-sm bg-zinc-800 border border-violet-500 rounded text-white focus:outline-none" />
            )}
            {pp > 0 && <div className="text-zinc-600 text-[10px]">auto-calculé</div>}
          </div>
        ) : (
          <span className="text-white text-sm font-bold">{formatFCFA(service.price)}</span>
        )}
      </td>

      {/* Stock */}
      <td className="py-3 px-4">
        {editing ? (
          <input type="number" value={available} onChange={e => setAvailable(e.target.value)} className="w-20 px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-white focus:outline-none" />
        ) : (
          <span className="text-zinc-300 text-sm">{service.available.toLocaleString("fr-FR")}</span>
        )}
      </td>

      {/* Popular */}
      <td className="py-3 px-4">
        {editing ? (
          <button onClick={() => setPopular(p => !p)} className={`px-2 py-1 text-xs rounded ${popular ? "bg-violet-600 text-white" : "bg-zinc-700 text-zinc-400"}`}>
            {popular ? "Populaire" : "Normal"}
          </button>
        ) : (
          <span className={`text-xs px-2 py-1 rounded-full ${service.popular ? "bg-violet-500/20 text-violet-400" : "bg-zinc-800 text-zinc-500"}`}>
            {service.popular ? "Populaire" : "Normal"}
          </span>
        )}
      </td>

      {/* Enabled */}
      <td className="py-3 px-4">
        <button
          onClick={() => toggleEnabled.mutate()}
          disabled={toggleEnabled.isPending}
          className="flex items-center gap-1 transition-colors"
          title={service.enabled ? "Désactiver" : "Activer"}
        >
          {service.enabled
            ? <ToggleRight className="w-6 h-6 text-emerald-500" />
            : <ToggleLeft className="w-6 h-6 text-zinc-600" />
          }
          <span className={`text-xs ${service.enabled ? "text-emerald-500" : "text-zinc-600"}`}>
            {service.enabled ? "Actif" : "Inactif"}
          </span>
        </button>
      </td>

      <td className="py-3 px-4">
        <div className="flex gap-1.5">
          {editing ? (
            <>
              <button onClick={() => update.mutate()} disabled={update.isPending} className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
                {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </td>
    </tr>
  );
}

function CountryRow({ country }: { country: AdminCountry }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(country.price));
  const [available, setAvailable] = useState(String(country.available));
  const { toast } = useToast();
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: () => adminApi.updateCountry(country.id, { price: Number(price), available: Number(available) }),
    onSuccess: () => { toast({ title: "Pays mis à jour" }); qc.invalidateQueries({ queryKey: ["admin-countries"] }); setEditing(false); },
  });

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/20 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{country.flag}</span>
          <div>
            <span className="text-white text-sm">{country.name}</span>
            <div className="text-zinc-600 text-xs font-mono">{country.code}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-zinc-400 text-sm">{country.dialCode}</td>
      <td className="py-3 px-4">
        {editing
          ? <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-24 px-2 py-1 text-sm bg-zinc-800 border border-violet-500 rounded text-white focus:outline-none" />
          : <span className="text-white text-sm font-semibold">{formatFCFA(country.price)}</span>
        }
      </td>
      <td className="py-3 px-4">
        {editing
          ? <input type="number" value={available} onChange={e => setAvailable(e.target.value)} className="w-20 px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-white focus:outline-none" />
          : <span className="text-zinc-300 text-sm">{country.available.toLocaleString("fr-FR")}</span>
        }
      </td>
      <td className="py-3 px-4">
        {editing ? (
          <div className="flex gap-1.5">
            <button onClick={() => update.mutate()} disabled={update.isPending} className="p-1.5 rounded bg-emerald-600 text-white"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditing(false)} className="p-1.5 rounded bg-zinc-700 text-zinc-400"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
        )}
      </td>
    </tr>
  );
}

function ServicesContent() {
  const [tab, setTab] = useState<"services" | "countries">("services");
  const { data: services, isLoading: loadingS } = useQuery({ queryKey: ["admin-services"], queryFn: adminApi.getServices });
  const { data: countries, isLoading: loadingC } = useQuery({ queryKey: ["admin-countries"], queryFn: adminApi.getCountries });

  const activeServices = services?.filter(s => s.enabled).length ?? 0;
  const inactiveServices = (services?.length ?? 0) - activeServices;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Services & Tarification</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {activeServices} actifs · {inactiveServices} inactifs · Prix = prix fournisseur × (1 + marge%)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
          <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
          <span>Prix final = Prix fournisseur + Marge %</span>
        </div>
      </div>

      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {(["services", "countries"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white"}`}>
            {t === "services" ? `Services (${services?.length ?? 0})` : `Pays (${countries?.length ?? 0})`}
          </button>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {tab === "services" ? (
            <table className="w-full">
              <thead><tr className="border-b border-zinc-800 bg-zinc-900/80">
                {["Service", "Catégorie", "Prix fournisseur", "Marge", "Prix final", "Stock", "Badge", "Activé", ""].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loadingS ? <tr><td colSpan={9} className="py-12 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
                  : services?.map(s => <ServiceRow key={s.id} service={s} />)}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b border-zinc-800 bg-zinc-900/80">
                {["Pays", "Indicatif", "Prix", "Stock", ""].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loadingC ? <tr><td colSpan={5} className="py-12 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
                  : countries?.map(c => <CountryRow key={c.id} country={c} />)}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminServices() {
  return (
    <AdminGuard>
      <AdminLayout>
        <ServicesContent />
      </AdminLayout>
    </AdminGuard>
  );
}
