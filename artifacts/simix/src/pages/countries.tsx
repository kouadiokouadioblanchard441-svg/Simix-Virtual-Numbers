import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import {
  useListCountries, getListCountriesQueryKey,
  useListPopularCountries, getListPopularCountriesQueryKey,
  useListServices, getListServicesQueryKey,
} from "@workspace/api-client-react";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Search, ChevronLeft, ChevronRight, Edit2, Zap, Globe, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { formatFCFA } from "@/lib/format";
import { ServiceIcon } from "@/components/service-icon";
import { Button } from "@/components/ui/button";

/* ─── Region mapping ─── */
const REGION: Record<string, string> = {
  // Europe
  FR:"Europe", DE:"Europe", GB:"Europe", BE:"Europe", NL:"Europe", CH:"Europe",
  ES:"Europe", IT:"Europe", PT:"Europe", SE:"Europe", NO:"Europe", DK:"Europe",
  FI:"Europe", IE:"Europe", AT:"Europe", PL:"Europe", RU:"Europe", GR:"Europe",
  LU:"Europe", IS:"Europe", RO:"Europe", HU:"Europe", UA:"Europe", CZ:"Europe",
  SK:"Europe", BG:"Europe", RS:"Europe", HR:"Europe", SI:"Europe", EE:"Europe",
  LV:"Europe", LT:"Europe", AL:"Europe", MK:"Europe", BA:"Europe", ME:"Europe",
  XK:"Europe", MD:"Europe", BY:"Europe", GE:"Europe", AM:"Europe", AZ:"Europe",
  MT:"Europe", CY:"Europe",
  // Amériques
  US:"Amériques", CA:"Amériques", BR:"Amériques", MX:"Amériques",
  AR:"Amériques", CL:"Amériques", CO:"Amériques", PE:"Amériques", VE:"Amériques",
  EC:"Amériques", BO:"Amériques", PY:"Amériques", UY:"Amériques", GT:"Amériques",
  HN:"Amériques", SV:"Amériques", NI:"Amériques", CR:"Amériques", PA:"Amériques",
  DO:"Amériques", HT:"Amériques", CU:"Amériques", JM:"Amériques", TT:"Amériques",
  BS:"Amériques", BB:"Amériques",
  // Asie-Pacifique
  JP:"Asie-Pacifique", AU:"Asie-Pacifique", NZ:"Asie-Pacifique", IN:"Asie-Pacifique",
  CN:"Asie-Pacifique", KR:"Asie-Pacifique", SG:"Asie-Pacifique", HK:"Asie-Pacifique",
  TW:"Asie-Pacifique", TH:"Asie-Pacifique", ID:"Asie-Pacifique", MY:"Asie-Pacifique",
  PH:"Asie-Pacifique", VN:"Asie-Pacifique", PK:"Asie-Pacifique", BD:"Asie-Pacifique",
  NP:"Asie-Pacifique", LK:"Asie-Pacifique", MM:"Asie-Pacifique", KH:"Asie-Pacifique",
  LA:"Asie-Pacifique", KZ:"Asie-Pacifique", UZ:"Asie-Pacifique", MN:"Asie-Pacifique",
  PG:"Asie-Pacifique", FJ:"Asie-Pacifique",
  // Moyen-Orient
  TR:"Moyen-Orient", IL:"Moyen-Orient", SA:"Moyen-Orient", AE:"Moyen-Orient",
  KW:"Moyen-Orient", QA:"Moyen-Orient", BH:"Moyen-Orient", OM:"Moyen-Orient",
  JO:"Moyen-Orient", LB:"Moyen-Orient", IQ:"Moyen-Orient", IR:"Moyen-Orient",
  SY:"Moyen-Orient", YE:"Moyen-Orient", PS:"Moyen-Orient", AF:"Moyen-Orient",
  // Africa
  DZ:"Afrique", AO:"Afrique", BJ:"Afrique", BW:"Afrique", BF:"Afrique",
  BI:"Afrique", CM:"Afrique", CV:"Afrique", CF:"Afrique", KM:"Afrique",
  CG:"Afrique", CD:"Afrique", CI:"Afrique", DJ:"Afrique", EG:"Afrique",
  ER:"Afrique", SZ:"Afrique", ET:"Afrique", GA:"Afrique", GM:"Afrique",
  GH:"Afrique", GN:"Afrique", GQ:"Afrique", GW:"Afrique", KE:"Afrique",
  LS:"Afrique", LR:"Afrique", LY:"Afrique", MG:"Afrique", MW:"Afrique",
  ML:"Afrique", MA:"Afrique", MR:"Afrique", MU:"Afrique", MZ:"Afrique",
  NA:"Afrique", NE:"Afrique", NG:"Afrique", UG:"Afrique", RW:"Afrique",
  ST:"Afrique", SN:"Afrique", SC:"Afrique", SL:"Afrique", SO:"Afrique",
  ZA:"Afrique", SD:"Afrique", SS:"Afrique", TZ:"Afrique", TD:"Afrique",
  TG:"Afrique", TN:"Afrique", ZM:"Afrique", ZW:"Afrique",
};

type RegionTab = "Populaires" | "Europe" | "Amériques" | "Asie-Pacifique" | "Moyen-Orient" | "Afrique" | "Tous";
const TABS: RegionTab[] = ["Populaires", "Europe", "Amériques", "Asie-Pacifique", "Moyen-Orient", "Afrique", "Tous"];

const TAB_META: Record<RegionTab, { label: string; color: string }> = {
  "Populaires":     { label: "★", color: "#F59E0B" },
  "Europe":         { label: "EU", color: "#3B82F6" },
  "Amériques":      { label: "AM", color: "#10B981" },
  "Asie-Pacifique": { label: "AS", color: "#8B5CF6" },
  "Moyen-Orient":   { label: "ME", color: "#F97316" },
  "Afrique":        { label: "AF", color: "#EC4899" },
  "Tous":           { label: "...", color: "#6B7280" },
};

export default function Countries() {
  return (
    <AuthGuard>
      <AppLayout showBottomNav={false}>
        <CountriesContent />
      </AppLayout>
    </AuthGuard>
  );
}

function CountriesContent() {
  const searchParams = new URLSearchParams(window.location.search);
  const serviceId = searchParams.get("serviceId") || undefined;

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<RegionTab>("Populaires");

  const { data: popularCountries, isLoading: loadingPopular } = useListPopularCountries({
    query: { queryKey: getListPopularCountriesQueryKey() },
  });
  const { data: allCountries, isLoading } = useListCountries(
    { search, serviceId },
    { query: { queryKey: getListCountriesQueryKey({ search, serviceId }) } }
  );
  const { data: services } = useListServices(undefined, { query: { queryKey: getListServicesQueryKey() } });
  const selectedService = services?.find(s => s.id === serviceId);

  /* Filter by region tab */
  const filteredCountries = useMemo(() => {
    if (!allCountries) return [];
    if (search) return allCountries;
    if (activeTab === "Tous") return allCountries;
    if (activeTab === "Populaires") return allCountries.filter(c => c.popular);
    return allCountries.filter(c => REGION[c.code] === activeTab);
  }, [allCountries, activeTab, search]);

  const regionCounts = useMemo(() => {
    if (!allCountries) return {} as Record<RegionTab, number>;
    return {
      "Populaires": allCountries.filter(c => c.popular).length,
      "Europe": allCountries.filter(c => REGION[c.code] === "Europe").length,
      "Amériques": allCountries.filter(c => REGION[c.code] === "Amériques").length,
      "Asie-Pacifique": allCountries.filter(c => REGION[c.code] === "Asie-Pacifique").length,
      "Moyen-Orient": allCountries.filter(c => REGION[c.code] === "Moyen-Orient").length,
      "Afrique": allCountries.filter(c => REGION[c.code] === "Afrique").length,
      "Tous": allCountries.length,
    } as Record<RegionTab, number>;
  }, [allCountries]);

  return (
    <div className="flex-1 w-full bg-background flex flex-col h-full">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-background pt-5 pb-3 px-5 border-b border-card-border/40">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-base font-bold text-foreground">Choisir un pays</h1>
            <p className="text-xs text-muted-foreground">{allCountries?.length ?? "..."} pays disponibles</p>
          </div>
          <div className="w-9" />
        </div>

        {/* Service badge */}
        {selectedService && (
          <div className="bg-violet-900/20 border border-violet-500/30 rounded-2xl p-3 mb-4 flex items-center gap-3">
            <ServiceIcon name={selectedService.name} slug={(selectedService as { slug?: string }).slug ?? ""} size={44} rounded="xl" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-0.5">Service sélectionné</p>
              <p className="text-sm font-bold text-white truncate">{selectedService.name}</p>
            </div>
            <Link href="/services">
              <Button variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/10 rounded-xl h-8 px-2.5 text-xs font-semibold flex-shrink-0">
                <Edit2 className="w-3 h-3 mr-1" /> Changer
              </Button>
            </Link>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un pays..."
            className="w-full h-12 bg-card border border-card-border rounded-xl pl-11 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Region tabs */}
        {!search && (
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar -mx-5 px-5">
            {TABS.map(tab => {
              const meta = TAB_META[tab];
              const isActive = activeTab === tab;
              const count = regionCounts[tab] ?? 0;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? "text-white shadow-md"
                      : "bg-card border border-card-border text-muted-foreground hover:bg-secondary"
                  }`}
                  style={isActive ? { backgroundColor: meta.color, borderColor: meta.color } : {}}
                >
                  <span className="font-bold text-xs">{meta.label}</span>
                  <span>{tab}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-secondary text-muted-foreground"}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-4">
        {/* Popular horizontal cards (only on Populaires tab, no search) */}
        {!search && activeTab === "Populaires" && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 mb-3">
              <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
              <h2 className="text-sm font-bold text-foreground">Les plus demandés</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-3 snap-x hide-scrollbar -mx-5 px-5">
              {loadingPopular
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="min-w-[130px] h-28 bg-card border border-card-border rounded-2xl animate-pulse snap-start flex-shrink-0" />
                  ))
                : popularCountries?.map((c, idx) => (
                    <Link
                      key={c.id}
                      href={`/numbers/new?serviceId=${serviceId}&countryId=${c.id}`}
                      className={`min-w-[130px] max-w-[140px] bg-card border snap-start rounded-2xl p-4 flex flex-col items-center gap-1.5 hover:bg-secondary/50 transition-colors relative flex-shrink-0 ${idx === 0 ? "border-primary/50 shadow-sm shadow-primary/10" : "border-card-border"}`}
                    >
                      {idx === 0 && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                        </div>
                      )}
                      <div className="w-11 h-11 bg-secondary rounded-full flex items-center justify-center text-2xl">
                        {c.flag}
                      </div>
                      <span className="text-xs font-bold text-foreground text-center leading-tight truncate w-full text-center">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground">{c.dialCode}</span>
                      <span className="text-sm font-black text-primary">{formatFCFA(c.price)}</span>
                    </Link>
                  ))}
            </div>
            <div className="h-px bg-card-border/50 mb-4" />
            <h2 className="text-sm font-bold text-foreground mb-3">Tous les pays populaires</h2>
          </div>
        )}

        {/* Section header for non-popular tabs */}
        {!search && activeTab !== "Populaires" && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-bold" style={{ color: TAB_META[activeTab].color }}>{TAB_META[activeTab].label}</span>
            <h2 className="text-base font-bold text-foreground">{activeTab}</h2>
            <span className="text-xs text-muted-foreground ml-1">({filteredCountries.length} pays)</span>
          </div>
        )}

        {/* Search results header */}
        {search && (
          <p className="text-xs text-muted-foreground mb-3">
            {filteredCountries.length} résultat{filteredCountries.length !== 1 ? "s" : ""} pour "{search}"
          </p>
        )}

        {/* Country list */}
        <div className="space-y-2">
          {isLoading
            ? Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-16 bg-card border border-card-border rounded-2xl animate-pulse" />
              ))
            : filteredCountries.length === 0
              ? (
                <div className="text-center py-16">
                  <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-foreground font-semibold">Aucun pays trouvé</p>
                  <p className="text-xs text-muted-foreground mt-1">Essayez un autre terme ou région</p>
                </div>
              )
              : filteredCountries.map((country, i) => (
                  <motion.div
                    key={country.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  >
                    <Link
                      href={`/numbers/new?serviceId=${serviceId}&countryId=${country.id}`}
                      className="flex items-center justify-between p-4 bg-card border border-card-border rounded-2xl hover:bg-secondary/50 hover:border-primary/20 transition-all active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center text-xl flex-shrink-0">
                          {country.flag}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-foreground">{country.name}</p>
                            {country.popular && (
                              <span className="text-[9px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Populaire</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">
                            {country.dialCode}
                            {REGION[country.code] && (
                              <span className="ml-2 text-muted-foreground/60">· {REGION[country.code]}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-black text-primary">{formatFCFA(country.price)}</p>
                          {country.available > 0 && (
                            <p className="text-[10px] text-emerald-500 font-medium">{country.available} dispo.</p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </motion.div>
                ))
          }
        </div>

        {/* Footer trust badge */}
        {!isLoading && filteredCountries.length > 0 && (
          <div className="mt-6 flex items-center gap-3 bg-secondary/50 border border-card-border rounded-2xl p-4">
            <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Numéros vérifiés et sécurisés</p>
              <p className="text-xs text-muted-foreground">Taux de réussite de réception SMS : 98%</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
