import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type ServicePrice, type AdminService, type AdminCountry } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { ServiceIcon } from "@/components/service-icon";
import { formatFCFA } from "@/lib/format";
import {
  Loader2, Save, Search, Tag, Globe, Trash2, CheckCircle2,
  AlertCircle, RefreshCw, ChevronRight, X, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ────────────────────────────────────────────────────────────── helpers */

function flag(code: string) {
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0))
  );
}

type LocalEdit = { price: string; enabled: boolean; dirty: boolean };
type EditsMap  = Record<string, LocalEdit>; // keyed by countryCode (lowercase)

/* ────────────────────────────────────────────────────────── main content */

function ServicePricesContent() {
  const { toast } = useToast();
  const qc = useQueryClient();

  /* ── Remote data ── */
  const { data: allServices = [], isLoading: loadSvc } = useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => adminApi.getServices(),
  });
  const { data: allCountries = [], isLoading: loadCtr } = useQuery({
    queryKey: ["admin", "countries"],
    queryFn: () => adminApi.getCountries(),
  });
  const { data: allPrices = [], isLoading: loadPrices } = useQuery({
    queryKey: ["admin", "service-prices"],
    queryFn: () => adminApi.getServicePrices(),
  });

  const enabledServices = useMemo(() => allServices.filter(s => s.enabled), [allServices]);

  /* ── Selected service tab ── */
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  useEffect(() => {
    if (!selectedSlug && enabledServices.length > 0) {
      setSelectedSlug(enabledServices[0]!.slug);
    }
  }, [enabledServices, selectedSlug]);

  /* ── Local edits for the current service ── */
  const [edits, setEdits] = useState<EditsMap>({});
  const [bulkPrice, setBulkPrice] = useState("");
  const [search, setSearch]   = useState("");

  /* Reinitialise edits whenever the selected service or server data changes */
  useEffect(() => {
    if (!selectedSlug || !allCountries.length) return;
    const next: EditsMap = {};
    allCountries.forEach(c => {
      const code = c.code.toLowerCase();
      const existing = allPrices.find(
        p => p.serviceSlug === selectedSlug && p.countryCode === code
      );
      next[code] = {
        price: existing ? String(existing.price) : "",
        enabled: existing ? existing.enabled : true,
        dirty: false,
      };
    });
    setEdits(next);
    setBulkPrice("");
    setSearch("");
  }, [selectedSlug, allPrices, allCountries]);

  /* ── Mutations ── */
  const bulkUpsert = useMutation({
    mutationFn: (prices: Array<{ countryCode: string; serviceSlug: string; price: number; enabled: boolean }>) =>
      adminApi.bulkUpsertServicePrices(prices),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin", "service-prices"] });
      toast({ title: `${res.updated} prix enregistrés ✓` });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deletePrice = useMutation({
    mutationFn: (id: string) => adminApi.deleteServicePrice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "service-prices"] });
      toast({ title: "Prix personnalisé supprimé" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  /* ── Derived state ── */
  const dirtyEntries = useMemo(() =>
    Object.entries(edits).filter(([, v]) => v.dirty),
    [edits]
  );
  const dirtyCount = dirtyEntries.length;

  const selectedService = enabledServices.find(s => s.slug === selectedSlug);
  const customPricesForService = allPrices.filter(p => p.serviceSlug === selectedSlug);
  const configuredCount = customPricesForService.filter(p => p.enabled).length;

  const filteredCountries = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q
      ? allCountries.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          (c.dialCode ?? "").includes(q)
        )
      : allCountries;
  }, [allCountries, search]);

  /* ── Handlers ── */
  const setCountryPrice = useCallback((code: string, price: string) => {
    setEdits(prev => ({ ...prev, [code]: { ...prev[code]!, price, dirty: true } }));
  }, []);

  const setCountryEnabled = useCallback((code: string, enabled: boolean) => {
    setEdits(prev => ({ ...prev, [code]: { ...prev[code]!, enabled, dirty: true } }));
  }, []);

  const applyBulkPrice = () => {
    const p = bulkPrice.trim();
    if (!p || Number(p) <= 0) return;
    setEdits(prev => {
      const next = { ...prev };
      allCountries.forEach(c => {
        const code = c.code.toLowerCase();
        next[code] = { price: p, enabled: prev[code]?.enabled ?? true, dirty: true };
      });
      return next;
    });
  };

  const handleSave = async () => {
    const toSave = dirtyEntries
      .filter(([, v]) => {
        /* Save entries that have a valid price OR entries being explicitly disabled */
        const hasPrice = v.price.trim() !== "" && Number(v.price) > 0;
        return hasPrice || !v.enabled;
      })
      .map(([countryCode, v]) => {
        /* For disabled entries without a price, fall back to the existing DB price */
        const existing = allPrices.find(
          p => p.serviceSlug === selectedSlug && p.countryCode === countryCode,
        );
        return {
          countryCode,
          serviceSlug: selectedSlug,
          price: Number(v.price) > 0 ? Number(v.price) : (existing?.price ?? 0),
          enabled: v.enabled,
        };
      });

    if (toSave.length === 0) {
      toast({ title: "Aucun changement à enregistrer", description: "Entrez un prix > 0 FCFA ou désactivez un pays.", variant: "destructive" });
      return;
    }
    await bulkUpsert.mutateAsync(toSave);
  };

  const handleDeleteOverride = (c: AdminCountry) => {
    const code = c.code.toLowerCase();
    const existing = allPrices.find(p => p.serviceSlug === selectedSlug && p.countryCode === code);
    if (existing) {
      deletePrice.mutate(existing.id);
    } else {
      setEdits(prev => ({ ...prev, [code]: { price: "", enabled: true, dirty: false } }));
    }
  };

  const loading = loadSvc || loadCtr || loadPrices;

  if (loading) {
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
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Tag className="w-6 h-6 text-violet-400" />
          Tarification des services
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Fixez votre propre prix pour chaque service et chaque pays — sans marge automatique.
        </p>
      </div>

      {/* ── Global stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Services activés",    value: enabledServices.length,                             color: "text-violet-400" },
          { label: "Pays disponibles",    value: allCountries.length,                                color: "text-blue-400"   },
          { label: "Prix configurés",     value: allPrices.filter(p => p.enabled).length,            color: "text-emerald-400"},
          { label: "Combinaisons actives",value: `${allPrices.filter(p => p.enabled).length}/${enabledServices.length * allCountries.length}`, color: "text-amber-400"  },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Service tabs ── */}
      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Sélectionner un service
        </p>
        <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
          {enabledServices.map(svc => {
            const customCount = allPrices.filter(p => p.serviceSlug === svc.slug && p.enabled).length;
            const isSelected  = svc.slug === selectedSlug;
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
                {customCount > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isSelected ? "bg-violet-500/40 text-violet-200" : "bg-zinc-800 text-zinc-500"
                  }`}>
                    {customCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Country price grid ── */}
      {selectedService && (
        <div className="space-y-4">

          {/* Service header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ServiceIcon name={selectedService.name} slug={selectedService.slug} logoUrl={selectedService.logoUrl} size={40} rounded="xl" />
              <div>
                <h2 className="text-lg font-bold text-white">{selectedService.name}</h2>
                <p className="text-sm text-zinc-400">
                  {configuredCount} pays avec prix personnalisé · {allCountries.length} pays disponibles
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dirtyCount > 0 && (
                <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg">
                  {dirtyCount} modification{dirtyCount > 1 ? "s" : ""} non sauvegardée{dirtyCount > 1 ? "s" : ""}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={dirtyCount === 0 || bulkUpsert.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-900/20"
              >
                {bulkUpsert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Enregistrer{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
              </button>
            </div>
          </div>

          {/* Toolbar: bulk fill + search */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Bulk fill */}
            <div className="flex gap-2 items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 flex-1">
              <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="text-xs text-zinc-400 whitespace-nowrap">Même prix pour tous :</span>
              <input
                type="number"
                min={1}
                value={bulkPrice}
                onChange={e => setBulkPrice(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyBulkPrice()}
                placeholder="ex: 1500"
                className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none min-w-0"
              />
              <span className="text-xs text-zinc-500">FCFA</span>
              <button
                onClick={applyBulkPrice}
                disabled={!bulkPrice || Number(bulkPrice) <= 0}
                className="flex-shrink-0 px-3 py-1 bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-medium rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-40"
              >
                Appliquer à tous
              </button>
            </div>
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
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
          </div>

          {/* Country grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredCountries.map(c => {
              const code    = c.code.toLowerCase();
              const edit    = edits[code] ?? { price: "", enabled: true, dirty: false };
              const existing = allPrices.find(p => p.serviceSlug === selectedSlug && p.countryCode === code);
              const hasCustom = !!existing;
              const isActive  = hasCustom && existing.enabled;
              const isDirty   = edit.dirty;
              const parsedPrice = Number(edit.price);
              const validPrice  = edit.price.trim() !== "" && parsedPrice > 0;

              return (
                <div
                  key={c.code}
                  className={`relative bg-zinc-900 border rounded-xl p-3.5 transition-all ${
                    isDirty
                      ? "border-amber-500/50 bg-amber-500/5"
                      : hasCustom
                      ? isActive
                        ? "border-violet-500/40 bg-violet-500/5"
                        : "border-zinc-700 opacity-60"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {/* Country header */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xl leading-none">{c.flag ?? flag(c.code)}</span>
                      <div>
                        <p className="text-sm font-medium text-white leading-tight">{c.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{c.code.toUpperCase()} · {c.dialCode}</p>
                      </div>
                    </div>
                    {/* Status badge */}
                    {hasCustom && !isDirty ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        isActive
                          ? "bg-violet-500/20 text-violet-300"
                          : "bg-zinc-700 text-zinc-500"
                      }`}>
                        {isActive ? "✓ configuré" : "désactivé"}
                      </span>
                    ) : isDirty ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-300">
                        modifié
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-zinc-800 text-zinc-600">
                        défaut pays
                      </span>
                    )}
                  </div>

                  {/* Price input */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={1}
                        value={edit.price}
                        onChange={e => setCountryPrice(code, e.target.value)}
                        placeholder={hasCustom ? String(existing.price) : String(c.price)}
                        className={`w-full bg-zinc-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500 pr-14 ${
                          isDirty ? "border-amber-500/50" : hasCustom ? "border-violet-500/30" : "border-zinc-700"
                        }`}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">FCFA</span>
                    </div>
                  </div>

                  {/* Country default price hint */}
                  <p className="text-[10px] text-zinc-600 mb-2.5">
                    Prix par défaut du pays : <span className="text-zinc-500">{formatFCFA(c.price)}</span>
                  </p>

                  {/* Footer: enable toggle + delete */}
                  <div className="flex items-center justify-between">
                    {/* Enable/disable toggle — only meaningful when price exists */}
                    <label className={`flex items-center gap-2 cursor-pointer ${!validPrice && !hasCustom ? "opacity-30 pointer-events-none" : ""}`}>
                      <div
                        onClick={() => setCountryEnabled(code, !edit.enabled)}
                        className={`relative w-8 h-4.5 h-[18px] rounded-full transition-colors flex-shrink-0 ${edit.enabled ? "bg-emerald-600" : "bg-zinc-700"}`}
                      >
                        <div className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform ${edit.enabled ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
                      </div>
                      <span className={`text-[11px] font-medium ${edit.enabled ? "text-emerald-400" : "text-zinc-500"}`}>
                        {edit.enabled ? "Actif" : "Inactif"}
                      </span>
                    </label>

                    {/* Delete custom price button */}
                    {(hasCustom || (isDirty && edit.price !== "")) && (
                      <button
                        onClick={() => handleDeleteOverride(c)}
                        disabled={deletePrice.isPending}
                        title="Supprimer le prix personnalisé (revenir au défaut pays)"
                        className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty search state */}
          {filteredCountries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Globe className="w-10 h-10 text-zinc-700 mb-3" />
              <p className="text-zinc-400 font-medium">Aucun pays trouvé</p>
              <p className="text-zinc-600 text-sm mt-1">Essayez un autre terme de recherche.</p>
            </div>
          )}

          {/* Bottom save bar */}
          {dirtyCount > 0 && (
            <div className="sticky bottom-4 z-10">
              <div className="bg-zinc-900 border border-violet-500/40 rounded-2xl px-5 py-3 flex items-center justify-between shadow-2xl shadow-black/50">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-sm text-white font-medium">
                    {dirtyCount} pays modifié{dirtyCount > 1 ? "s" : ""} — non sauvegardé{dirtyCount > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEdits(prev => {
                        const next = { ...prev };
                        Object.keys(next).forEach(k => { if (next[k]!.dirty) next[k] = { ...next[k]!, dirty: false }; });
                        return next;
                      });
                    }}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={bulkUpsert.isPending}
                    className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {bulkUpsert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Enregistrer {selectedService.name}
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

export default function AdminServicePrices() {
  return (
    <AdminGuard>
      <AdminLayout>
        <ServicePricesContent />
      </AdminLayout>
    </AdminGuard>
  );
}
