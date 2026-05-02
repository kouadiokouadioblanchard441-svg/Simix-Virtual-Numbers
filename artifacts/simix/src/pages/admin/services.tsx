import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminService, type AdminCountry } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function ServiceRow({ service }: { service: AdminService }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(service.price));
  const [available, setAvailable] = useState(String(service.available));
  const [popular, setPopular] = useState(service.popular);
  const { toast } = useToast();
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: () => adminApi.updateService(service.id, { price: Number(price), available: Number(available), popular }),
    onSuccess: () => { toast({ title: "Service mis à jour" }); qc.invalidateQueries({ queryKey: ["admin-services"] }); setEditing(false); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: service.color }} />
          <span className="text-white text-sm font-medium">{service.name}</span>
        </div>
      </td>
      <td className="py-3 px-4 text-zinc-400 text-xs">{service.category}</td>
      <td className="py-3 px-4 text-zinc-400 text-xs">{service.scope}</td>
      <td className="py-3 px-4">
        {editing ? (
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-24 px-2 py-1 text-sm bg-zinc-800 border border-violet-500 rounded text-white focus:outline-none" />
        ) : (
          <span className="text-white text-sm font-semibold">{formatFCFA(service.price)}</span>
        )}
      </td>
      <td className="py-3 px-4">
        {editing ? (
          <input type="number" value={available} onChange={e => setAvailable(e.target.value)} className="w-20 px-2 py-1 text-sm bg-zinc-800 border border-violet-500 rounded text-white focus:outline-none" />
        ) : (
          <span className="text-zinc-300 text-sm">{service.available.toLocaleString("fr-FR")}</span>
        )}
      </td>
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
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{country.flag}</span>
          <span className="text-white text-sm">{country.name}</span>
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
          ? <input type="number" value={available} onChange={e => setAvailable(e.target.value)} className="w-20 px-2 py-1 text-sm bg-zinc-800 border border-violet-500 rounded text-white focus:outline-none" />
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Services & Tarification</h1>
        <p className="text-zinc-400 text-sm mt-1">Gérez les prix des services et des pays</p>
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
              <thead><tr className="border-b border-zinc-800">
                {["Service", "Catégorie", "Portée", "Prix", "Stock", "Badge", ""].map(h => <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>)}
              </tr></thead>
              <tbody>
                {loadingS ? <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin mx-auto" /></td></tr>
                  : services?.map(s => <ServiceRow key={s.id} service={s} />)}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b border-zinc-800">
                {["Pays", "Indicatif", "Prix", "Stock", ""].map(h => <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>)}
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
