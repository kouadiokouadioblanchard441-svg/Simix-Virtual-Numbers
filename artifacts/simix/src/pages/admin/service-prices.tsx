import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type ServicePrice, type AdminService, type AdminCountry } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import {
  Loader2, Plus, Pencil, Trash2, Check, X, Search,
  ChevronDown, ToggleLeft, ToggleRight, Tag, Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ─── Helpers ─── */
function countryLabel(countries: AdminCountry[], code: string) {
  const c = countries.find((c) => c.code.toLowerCase() === code.toLowerCase());
  return c ? `${c.flag} ${c.name}` : code.toUpperCase();
}
function serviceLabel(services: AdminService[], slug: string) {
  const s = services.find((s) => s.slug.toLowerCase() === slug.toLowerCase());
  return s ? s.name : slug;
}

/* ─── Add / Edit Row modal ─── */
interface FormState {
  countryCode: string;
  serviceSlug: string;
  price: string;
  enabled: boolean;
}

function PriceForm({
  services,
  countries,
  initial,
  onSave,
  onCancel,
  saving,
}: {
  services: AdminService[];
  countries: AdminCountry[];
  initial?: Partial<FormState>;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>({
    countryCode: initial?.countryCode ?? "",
    serviceSlug: initial?.serviceSlug ?? "",
    price: initial?.price ?? "",
    enabled: initial?.enabled ?? true,
  });

  const valid = form.countryCode && form.serviceSlug && Number(form.price) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-white font-semibold text-lg">
            {initial?.countryCode ? "Modifier le prix" : "Ajouter un prix"}
          </h2>
          <button onClick={onCancel} className="text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Country */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Pays</label>
            <div className="relative">
              <select
                value={form.countryCode}
                onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
                disabled={!!initial?.countryCode}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              >
                <option value="">— Sélectionner un pays —</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code.toLowerCase()}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Service */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Service</label>
            <div className="relative">
              <select
                value={form.serviceSlug}
                onChange={(e) => setForm((f) => ({ ...f, serviceSlug: e.target.value }))}
                disabled={!!initial?.serviceSlug}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              >
                <option value="">— Sélectionner un service —</option>
                {services.filter((s) => s.enabled).map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Prix (FCFA)</label>
            <div className="relative">
              <input
                type="number"
                min={1}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="ex: 1200"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">FCFA</span>
            </div>
          </div>

          {/* Enabled */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${form.enabled ? "bg-violet-600" : "bg-zinc-700"}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.enabled ? "translate-x-5" : "translate-x-1"}`} />
            </div>
            <span className="text-sm text-zinc-300">{form.enabled ? "Actif" : "Désactivé"}</span>
          </label>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => valid && onSave(form)}
            disabled={!valid || saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Content ─── */
function ServicePricesContent() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterService, setFilterService] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ServicePrice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: prices = [], isLoading: loadingPrices } = useQuery({
    queryKey: ["admin", "service-prices"],
    queryFn: () => adminApi.getServicePrices(),
  });

  const { data: services = [] } = useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => adminApi.getServices(),
  });

  const { data: countries = [] } = useQuery({
    queryKey: ["admin", "countries"],
    queryFn: () => adminApi.getCountries(),
  });

  const upsert = useMutation({
    mutationFn: (f: { countryCode: string; serviceSlug: string; price: number; enabled: boolean }) =>
      adminApi.upsertServicePrice(f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "service-prices"] });
      setAdding(false);
      toast({ title: "Prix enregistré" });
    },
    onError: (e: Error) => toast({ title: "Prix non mis à jour", description: e.message, variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { price?: number; enabled?: boolean } }) =>
      adminApi.updateServicePrice(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "service-prices"] });
      setEditing(null);
      toast({ title: "Prix mis à jour" });
    },
    onError: (e: Error) => toast({ title: "Prix non mis à jour", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteServicePrice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "service-prices"] });
      setConfirmDelete(null);
      toast({ title: "Prix supprimé" });
    },
    onError: (e: Error) => toast({ title: "Prix non mis à jour", description: e.message, variant: "destructive" }),
  });

  const toggleEnabled = (row: ServicePrice) =>
    update.mutate({ id: row.id, data: { enabled: !row.enabled } });

  const filtered = useMemo(() => {
    let list = prices;
    if (filterCountry) list = list.filter((p) => p.countryCode === filterCountry);
    if (filterService) list = list.filter((p) => p.serviceSlug === filterService);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.countryCode.includes(q) ||
          p.serviceSlug.includes(q) ||
          countryLabel(countries, p.countryCode).toLowerCase().includes(q) ||
          serviceLabel(services, p.serviceSlug).toLowerCase().includes(q),
      );
    }
    return list;
  }, [prices, filterCountry, filterService, search, countries, services]);

  const uniqueCountries = [...new Set(prices.map((p) => p.countryCode))].sort();
  const uniqueServices = [...new Set(prices.map((p) => p.serviceSlug))].sort();

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tag className="w-6 h-6 text-violet-400" />
            Prix des services
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Définissez un prix personnalisé par pays et par service.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-violet-900/30"
        >
          <Plus className="w-4 h-4" />
          Ajouter un prix
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Prix configurés", value: prices.length, color: "text-violet-400" },
          { label: "Actifs", value: prices.filter((p) => p.enabled).length, color: "text-emerald-400" },
          { label: "Désactivés", value: prices.filter((p) => !p.enabled).length, color: "text-red-400" },
          { label: "Pays couverts", value: uniqueCountries.length, color: "text-blue-400" },
        ].map((s) => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Rechercher pays, service…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2.5 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-[160px]"
          >
            <option value="">Tous les pays</option>
            {uniqueCountries.map((c) => (
              <option key={c} value={c}>
                {countryLabel(countries, c)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={filterService}
            onChange={(e) => setFilterService(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 pr-8 py-2.5 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-[160px]"
          >
            <option value="">Tous les services</option>
            {uniqueServices.map((s) => (
              <option key={s} value={s}>
                {serviceLabel(services, s)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {loadingPrices ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Tag className="w-10 h-10 text-zinc-700 mb-3" />
            <p className="text-zinc-400 font-medium">Aucun prix configuré</p>
            <p className="text-zinc-600 text-sm mt-1">
              {prices.length === 0
                ? "Ajoutez votre premier prix en cliquant sur le bouton ci-dessus."
                : "Aucun résultat pour vos filtres."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/40">
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Pays</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Service</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Prix</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Statut</th>
                  <th className="text-right text-xs font-medium text-zinc-400 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm text-white font-medium">
                        {countryLabel(countries, row.countryCode)}
                      </span>
                      <span className="ml-1.5 text-xs text-zinc-500 font-mono">{row.countryCode}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-zinc-300">{serviceLabel(services, row.serviceSlug)}</span>
                      <span className="ml-1.5 text-xs text-zinc-600 font-mono">{row.serviceSlug}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-violet-400">{formatFCFA(row.price)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleEnabled(row)}
                        className="flex items-center gap-1.5 group"
                        title={row.enabled ? "Désactiver" : "Activer"}
                      >
                        {row.enabled ? (
                          <>
                            <ToggleRight className="w-5 h-5 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
                            <span className="text-xs text-emerald-400">Actif</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                            <span className="text-xs text-zinc-500">Désactivé</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditing(row)}
                          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(row.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {adding && (
        <PriceForm
          services={services}
          countries={countries}
          saving={upsert.isPending}
          onCancel={() => setAdding(false)}
          onSave={(f) =>
            upsert.mutate({ countryCode: f.countryCode, serviceSlug: f.serviceSlug, price: Number(f.price), enabled: f.enabled })
          }
        />
      )}

      {editing && (
        <PriceForm
          services={services}
          countries={countries}
          initial={{
            countryCode: editing.countryCode,
            serviceSlug: editing.serviceSlug,
            price: String(editing.price),
            enabled: editing.enabled,
          }}
          saving={update.isPending}
          onCancel={() => setEditing(null)}
          onSave={(f) =>
            update.mutate({ id: editing.id, data: { price: Number(f.price), enabled: f.enabled } })
          }
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center space-y-4">
            <Trash2 className="w-10 h-10 text-red-400 mx-auto" />
            <div>
              <p className="text-white font-semibold">Supprimer ce prix ?</p>
              <p className="text-zinc-400 text-sm mt-1">Cette action est irréversible.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => remove.mutate(confirmDelete)}
                disabled={remove.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {remove.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminServicePrices() {
  return (
    <AdminGuard>
      <AdminLayout>
        <ServicePricesContent />
      </AdminLayout>
    </AdminGuard>
  );
}
