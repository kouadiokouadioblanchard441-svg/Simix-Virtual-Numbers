import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  type AdminService,
  type PricingMatrix,
  type PricingMatrixCountry,
} from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { ServiceIcon } from "@/components/service-icon";
import { formatFCFA } from "@/lib/format";
import {
  Loader2, Save, Search, Tag, Globe, Trash2, Lock, Unlock,
  AlertCircle, X, Zap, TrendingUp, ChevronDown, ChevronUp,
  CheckCircle2, Filter, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ──────────────────────────────────────────── helpers */

function flag(code: string) {
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))
  );
}

function marginColor(m: number | null): string {
  if (m === null) return "text-zinc-500";
  if (m >= 200) return "text-emerald-400";
  if (m >= 100) return "text-blue-400";
  if (m >= 0)   return "text-amber-400";
  return "text-red-400";
}

function marginBg(m: number | null): string {
  if (m === null) return "bg-zinc-800 text-zinc-500";
  if (m >= 200) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  if (m >= 100) return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
  if (m >= 0)   return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  return "bg-red-500/10 text-red-400 border border-red-500/20";
}

type FilterMode = "all" | "custom" | "global";
type CountryEdit = { price: string; dirty: boolean };
type EditsMap = Record<string, CountryEdit>;

/* ──────────────────────────────────────────── Level 1 Card */

function GlobalPriceCard({
  matrix,
  onSave,
  isSaving,
}: {
  matrix: PricingMatrix;
  onSave: (price: number) => Promise<void>;
  isSaving: boolean;
}) {
  const { service, globalCountries, customCountries } = matrix;
  const [edit, setEdit] = useState(String(service.price ?? ""));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setEdit(String(service.price ?? ""));
    setDirty(false);
  }, [service.slug, service.price]);

  const parsed = Number(edit);
  const valid = edit.trim() !== "" && parsed > 0;
  const provPx = service.providerPrice ?? 0;
  const margin = provPx > 0 ? Math.round(((parsed - provPx) / provPx) * 100) : null;

  const handleSave = async () => {
    if (!valid) return;
    await onSave(parsed);
    setDirty(false);
  };

  return (
    <div className="bg-zinc-900 border border-violet-500/30 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Niveau 1 — Prix Global du Service</h2>
            <p className="text-xs text-zinc-500">
              Appliqué automatiquement à tous les pays sans exception personnalisée
            </p>
          </div>
        </div>
        {service.adminPriceModified ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
            <Lock className="w-3 h-3" />
            Protégé
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-lg">
            <Unlock className="w-3 h-3" />
            Auto-sync
          </div>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Prix fournisseur */}
        <div className="bg-zinc-800/60 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Prix fournisseur (5sim)</p>
          <p className="text-xl font-bold text-zinc-300">
            {provPx > 0 ? formatFCFA(provPx) : <span className="text-zinc-600 text-base">Non synchronisé</span>}
          </p>
          <p className="text-[10px] text-zinc-600 mt-1">Mis à jour par la sync automatique</p>
        </div>

        {/* Prix SIMIX (éditable) */}
        <div className="bg-zinc-800/60 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-2">Prix SIMIX</p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min={1}
                value={edit}
                onChange={e => { setEdit(e.target.value); setDirty(true); }}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                placeholder="ex: 500"
                className={`w-full bg-zinc-900 border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 pr-14 ${
                  dirty ? "border-amber-500/60" : "border-zinc-700"
                }`}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">FCFA</span>
            </div>
            <button
              onClick={handleSave}
              disabled={!dirty || !valid || isSaving}
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Sauvegarder</span>
            </button>
          </div>
          {dirty && valid && (
            <p className="text-[10px] text-amber-400 mt-1.5">Appuyez sur Entrée ou cliquez Sauvegarder</p>
          )}
        </div>

        {/* Marge calculée */}
        <div className="bg-zinc-800/60 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Marge calculée</p>
          {margin !== null ? (
            <>
              <p className={`text-xl font-bold ${marginColor(margin)}`}>+{margin}%</p>
              <p className="text-[10px] text-zinc-600 mt-1">
                Bénéfice : {formatFCFA(parsed - provPx)} par numéro
              </p>
            </>
          ) : (
            <p className="text-base text-zinc-600">Indisponible</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 px-5 pb-4">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="w-2 h-2 rounded-full bg-zinc-600" />
          <span><span className="text-white font-semibold">{globalCountries}</span> pays utilisent ce prix global</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="w-2 h-2 rounded-full bg-violet-400" />
          <span><span className="text-white font-semibold">{customCountries}</span> exceptions personnalisées</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────── Country Row */

function CountryRow({
  country,
  edit,
  onPriceChange,
  onDelete,
  isDeleting,
}: {
  country: PricingMatrixCountry;
  edit: CountryEdit;
  onPriceChange: (code: string, val: string) => void;
  onDelete: (c: PricingMatrixCountry) => void;
  isDeleting: boolean;
}) {
  const parsed = Number(edit.price);
  const valid = edit.price.trim() !== "" && parsed > 0;
  const displayPrice = valid ? parsed : country.simixPrice;
  const displayMargin = country.providerPriceFcfa > 0
    ? Math.round(((displayPrice - country.providerPriceFcfa) / country.providerPriceFcfa) * 100)
    : null;

  return (
    <div className={`grid grid-cols-12 items-center gap-2 px-4 py-3 rounded-xl transition-all ${
      edit.dirty
        ? "bg-amber-500/5 border border-amber-500/30"
        : country.isCustom
        ? "bg-violet-500/5 border border-violet-500/20"
        : "bg-zinc-900 border border-zinc-800 hover:border-zinc-700"
    }`}>
      {/* Pays (4 cols) */}
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <span className="text-xl leading-none flex-shrink-0">{country.flag ?? flag(country.code)}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{country.name}</p>
          <p className="text-[10px] text-zinc-500 font-mono">{country.code.toUpperCase()} · {country.dialCode}</p>
        </div>
      </div>

      {/* Prix fournisseur (2 cols) */}
      <div className="col-span-2 hidden sm:block">
        <p className={`text-sm font-medium ${country.providerPriceFcfa > 0 ? "text-zinc-300" : "text-zinc-600"}`}>
          {country.providerPriceFcfa > 0 ? formatFCFA(country.providerPriceFcfa) : "—"}
        </p>
        {country.available > 0 && (
          <p className="text-[10px] text-zinc-600">{country.available} dispo</p>
        )}
      </div>

      {/* Prix SIMIX (éditable) (3 cols) */}
      <div className="col-span-4 sm:col-span-3">
        <div className="relative">
          <input
            type="number"
            min={1}
            value={edit.price}
            onChange={e => onPriceChange(country.code.toLowerCase(), e.target.value)}
            placeholder={String(country.simixPrice)}
            className={`w-full bg-zinc-800 border rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500 pr-10 ${
              edit.dirty ? "border-amber-500/50" : country.isCustom ? "border-violet-500/30" : "border-zinc-700"
            }`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 pointer-events-none">F</span>
        </div>
      </div>

      {/* Marge (2 cols) */}
      <div className="col-span-2 hidden sm:flex justify-center">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${marginBg(displayMargin)}`}>
          {displayMargin !== null ? `+${displayMargin}%` : "—"}
        </span>
      </div>

      {/* Actions + Badge (1 col) */}
      <div className="col-span-4 sm:col-span-1 flex items-center justify-end gap-1.5">
        {country.isCustom && !edit.dirty ? (
          <button
            onClick={() => onDelete(country)}
            disabled={isDeleting}
            title="Supprimer l'exception (revenir au prix global)"
            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : !country.isCustom && !edit.dirty ? (
          <span className="text-[10px] text-zinc-600 font-medium">global</span>
        ) : null}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────── Main content */

function PricingContent() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: allServices = [], isLoading: loadSvc } = useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => adminApi.getServices(),
  });

  const enabledServices = useMemo(() => allServices.filter(s => s.enabled), [allServices]);

  const [selectedSlug, setSelectedSlug] = useState<string>("");
  useEffect(() => {
    if (!selectedSlug && enabledServices.length > 0) {
      setSelectedSlug(enabledServices[0]!.slug);
    }
  }, [enabledServices, selectedSlug]);

  const { data: matrix, isLoading: loadMatrix, refetch: refetchMatrix } = useQuery({
    queryKey: ["admin", "pricing-matrix", selectedSlug],
    queryFn: () => adminApi.getPricingMatrix(selectedSlug),
    enabled: !!selectedSlug,
  });

  const [countryEdits, setCountryEdits] = useState<EditsMap>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    setCountryEdits({});
    setSearch("");
  }, [selectedSlug]);

  /* Mutations */
  const saveGlobal = useMutation({
    mutationFn: ({ slug, price }: { slug: string; price: number }) =>
      adminApi.updateGlobalPrice(slug, price),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing-matrix", selectedSlug] });
      qc.invalidateQueries({ queryKey: ["admin", "services"] });
      toast({ title: "Prix global sauvegardé ✓", description: "La sync 5sim ne modifiera plus ce prix." });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const bulkSaveCountries = useMutation({
    mutationFn: (prices: Array<{ countryCode: string; serviceSlug: string; price: number; enabled: boolean }>) =>
      adminApi.bulkUpsertServicePrices(prices),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing-matrix", selectedSlug] });
      qc.invalidateQueries({ queryKey: ["admin", "service-prices"] });
      setCountryEdits({});
      toast({ title: `${res.updated} exceptions sauvegardées ✓` });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteCountry = useMutation({
    mutationFn: (id: string) => adminApi.deleteServicePrice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing-matrix", selectedSlug] });
      qc.invalidateQueries({ queryKey: ["admin", "service-prices"] });
      toast({ title: "Exception supprimée — ce pays utilise désormais le prix global" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  /* Derived */
  const dirtyEntries = useMemo(
    () => Object.entries(countryEdits).filter(([, v]) => v.dirty && Number(v.price) > 0),
    [countryEdits],
  );
  const dirtyCount = dirtyEntries.length;

  const filteredCountries = useMemo(() => {
    if (!matrix) return [];
    const q = search.toLowerCase().trim();
    return matrix.countries.filter(c => {
      if (filter === "custom" && !c.isCustom) return false;
      if (filter === "global" && c.isCustom)  return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.dialCode ?? "").includes(q)
      );
    });
  }, [matrix, search, filter]);

  const selectedService = enabledServices.find(s => s.slug === selectedSlug);

  const handlePriceChange = useCallback((code: string, val: string) => {
    setCountryEdits(prev => ({ ...prev, [code]: { price: val, dirty: true } }));
  }, []);

  const handleSaveCountries = async () => {
    const toSave = dirtyEntries.map(([code, v]) => ({
      countryCode: code,
      serviceSlug: selectedSlug,
      price: Number(v.price),
      enabled: true,
    }));
    if (!toSave.length) return;
    await bulkSaveCountries.mutateAsync(toSave);
  };

  const handleDeleteCountry = (c: PricingMatrixCountry) => {
    if (!c.customPriceId) return;
    deleteCountry.mutate(c.customPriceId);
  };

  const loading = loadSvc || (loadMatrix && !!selectedSlug);

  if (loadSvc) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
      </div>
    );
  }

  if (enabledServices.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="w-12 h-12 text-zinc-600" />
        <div>
          <p className="text-white font-semibold">Aucun service activé</p>
          <p className="text-zinc-400 text-sm mt-1">Activez d'abord des services depuis la section Services.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tag className="w-6 h-6 text-violet-400" />
            Gestion des prix
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Système hiérarchique : Prix Global → Exception par pays → Prix par défaut
          </p>
        </div>
        <button
          onClick={() => setShowInfo(o => !o)}
          className="flex-shrink-0 p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Aide"
        >
          <Info className="w-5 h-5" />
        </button>
      </div>

      {/* ── Info panel ── */}
      {showInfo && (
        <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-4 space-y-2 text-sm text-blue-200">
          <p className="font-semibold text-blue-300">Comment fonctionne la hiérarchie des prix ?</p>
          <div className="space-y-1 text-xs text-blue-200/80">
            <p>🔵 <strong>Niveau 1 — Prix Global :</strong> prix appliqué à tous les pays par défaut.</p>
            <p>🟣 <strong>Niveau 2 — Exception par pays :</strong> remplace le prix global pour un pays précis.</p>
            <p>⚪ <strong>Niveau 3 — Prix défaut pays :</strong> fallback si aucun des deux niveaux n'est configuré.</p>
            <p>🔒 <strong>Protection sync :</strong> dès qu'un prix est sauvegardé ici, la sync 5sim ne le modifiera plus jamais.</p>
          </div>
        </div>
      )}

      {/* ── Stats globales ── */}
      {matrix && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Services activés",     value: enabledServices.length,    color: "text-violet-400" },
            { label: "Prix global (Niv.1)",  value: formatFCFA(matrix.service.price ?? 0), color: "text-blue-400" },
            { label: "Pays — prix global",   value: matrix.globalCountries,    color: "text-zinc-300" },
            { label: "Exceptions (Niv.2)",   value: matrix.customCountries,    color: "text-amber-400" },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Service tabs ── */}
      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Sélectionner un service</p>
        <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
          {enabledServices.map(svc => {
            const isSelected = svc.slug === selectedSlug;
            return (
              <button
                key={svc.slug}
                onClick={() => setSelectedSlug(svc.slug)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                  isSelected
                    ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-900/30"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                }`}
              >
                <ServiceIcon name={svc.name} slug={svc.slug} logoUrl={svc.logoUrl} size={20} rounded="lg" />
                <span>{svc.name}</span>
                {svc.adminPriceModified && (
                  <Lock className={`w-3 h-3 ${isSelected ? "text-violet-200" : "text-zinc-600"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Loading matrix ── */}
      {loadMatrix && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      )}

      {/* ── Matrix content ── */}
      {matrix && selectedService && !loadMatrix && (
        <div className="space-y-6">

          {/* ── NIVEAU 1 : Prix Global ── */}
          <GlobalPriceCard
            matrix={matrix}
            onSave={async (price) => { await saveGlobal.mutateAsync({ slug: selectedSlug, price }); }}
            isSaving={saveGlobal.isPending}
          />

          {/* ── NIVEAU 2 : Exceptions par pays ── */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Tag className="w-4 h-4 text-violet-400" />
                  Niveau 2 — Exceptions par pays
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Ces prix remplacent le prix global pour les pays concernés
                </p>
              </div>
              {dirtyCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg">
                    {dirtyCount} modification{dirtyCount > 1 ? "s" : ""} non sauvegardée{dirtyCount > 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={handleSaveCountries}
                    disabled={bulkSaveCountries.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    {bulkSaveCountries.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Enregistrer ({dirtyCount})
                  </button>
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Rechercher un pays…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter */}
              <div className="flex gap-1.5">
                {([
                  { k: "all" as FilterMode,    label: "Tous", count: matrix.countries.length },
                  { k: "custom" as FilterMode, label: "Personnalisés", count: matrix.customCountries },
                  { k: "global" as FilterMode, label: "Prix global", count: matrix.globalCountries },
                ]).map(f => (
                  <button
                    key={f.k}
                    onClick={() => setFilter(f.k)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      filter === f.k
                        ? "bg-violet-600/20 border-violet-500/40 text-violet-300"
                        : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {f.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      filter === f.k ? "bg-violet-500/30" : "bg-zinc-800"
                    }`}>{f.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Table header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-zinc-600">
              <div className="col-span-4">Pays</div>
              <div className="col-span-2">Prix fournisseur</div>
              <div className="col-span-3">Prix SIMIX</div>
              <div className="col-span-2 text-center">Marge</div>
              <div className="col-span-1" />
            </div>

            {/* Country rows */}
            <div className="space-y-2">
              {filteredCountries.map(c => {
                const code = c.code.toLowerCase();
                const edit = countryEdits[code] ?? { price: c.isCustom ? String(c.simixPrice) : "", dirty: false };
                return (
                  <CountryRow
                    key={c.code}
                    country={c}
                    edit={edit}
                    onPriceChange={handlePriceChange}
                    onDelete={handleDeleteCountry}
                    isDeleting={deleteCountry.isPending}
                  />
                );
              })}
            </div>

            {filteredCountries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="w-10 h-10 text-zinc-700 mb-3" />
                <p className="text-zinc-400 font-medium">Aucun pays trouvé</p>
                <p className="text-zinc-600 text-sm mt-1">Essayez un autre terme de recherche.</p>
              </div>
            )}
          </div>

          {/* Sticky save bar */}
          {dirtyCount > 0 && (
            <div className="sticky bottom-4 z-10">
              <div className="bg-zinc-900 border border-violet-500/40 rounded-2xl px-5 py-3 flex items-center justify-between shadow-2xl shadow-black/50">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-sm text-white font-medium">
                    {dirtyCount} exception{dirtyCount > 1 ? "s" : ""} non sauvegardée{dirtyCount > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCountryEdits({})}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveCountries}
                    disabled={bulkSaveCountries.isPending}
                    className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {bulkSaveCountries.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Enregistrer les exceptions
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminPricing() {
  return (
    <AdminGuard>
      <AdminLayout>
        <PricingContent />
      </AdminLayout>
    </AdminGuard>
  );
}
