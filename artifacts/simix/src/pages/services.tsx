import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useListServices, getListServicesQueryKey, useListPopularServices, getListPopularServicesQueryKey } from "@workspace/api-client-react";
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Search, ChevronLeft, Filter, ShieldCheck, ChevronRight, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { formatFCFA } from "@/lib/format";
import { ServiceIcon } from "@/components/service-icon";

export default function Services() {
  return (
    <AuthGuard>
      <AppLayout showBottomNav={false}>
        <ServicesContent />
      </AppLayout>
    </AuthGuard>
  );
}

function ServicesContent() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const countryId = searchParams.get("countryId") || undefined;

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Tous");

  const params = search ? { search } : undefined;
  const { data: services, isLoading } = useListServices(params, {
    query: { queryKey: getListServicesQueryKey(params) },
  });
  const { data: popular } = useListPopularServices({
    query: { queryKey: getListPopularServicesQueryKey() },
  });

  const categories = useMemo(() => {
    const set = new Set<string>(["Tous"]);
    services?.forEach((s: any) => s.category && set.add(s.category));
    return Array.from(set);
  }, [services]);

  const filtered = useMemo(() => {
    if (!services) return [];
    if (activeCategory === "Tous") return services;
    return services.filter((s: any) => s.category === activeCategory);
  }, [services, activeCategory]);

  const goToCountries = (serviceId: string) => {
    const qs = countryId ? `?serviceId=${serviceId}&countryId=${countryId}` : `?serviceId=${serviceId}`;
    setLocation(`/countries${qs}`);
  };

  return (
    <div className="flex-1 w-full bg-background flex flex-col h-full">
      {/* Header */}
      <div className="pt-6 pb-4 px-5 bg-background sticky top-0 z-20">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => window.history.back()}
            className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors -ml-2"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Choisir un service</h1>
          <Link href="#" className="text-sm font-semibold text-primary">
            Aide
          </Link>
        </div>

        {/* Search */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un service..."
              className="w-full h-14 bg-card border border-card-border rounded-xl pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <button className="w-14 h-14 bg-card border border-card-border rounded-xl flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-5 px-5 pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 h-9 px-4 rounded-full text-xs font-bold transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-white"
                  : "bg-card border border-card-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-8">
        {/* Popular services horizontal scroll */}
        {!search && activeCategory === "Tous" && (
          <div>
            <div className="flex justify-between items-end mb-4">
              <h2 className="text-lg font-bold text-foreground">Services populaires</h2>
              <Link href="#" className="text-sm font-medium text-primary hover:underline">
                Voir tout
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar -mx-5 px-5">
              {popular?.slice(0, 6).map((s: any, idx: number) => (
                <button
                  key={s.id}
                  onClick={() => goToCountries(s.id)}
                  className={`min-w-[140px] bg-card border ${
                    idx === 0 ? "border-primary shadow-sm shadow-primary/10" : "border-card-border"
                  } p-4 rounded-2xl flex flex-col items-center justify-center gap-2 snap-start hover:bg-secondary/50 transition-colors relative`}
                >
                  {idx === 0 && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center">
                      <Zap className="w-3 h-3 text-primary fill-primary" />
                    </div>
                  )}
                  <ServiceIcon name={s.name} slug={s.slug} size={48} rounded="xl" />
                  <span className="text-sm font-bold text-foreground truncate w-full text-center mt-1">
                    {s.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[10px] font-medium text-green-500">
                      {s.available?.toLocaleString("fr-FR") || "—"} dispo
                    </span>
                  </div>
                  <span className="text-sm font-bold text-primary">{formatFCFA(s.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Full list */}
        <div>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-lg font-bold text-foreground">
              {activeCategory === "Tous" ? "Tous les services" : activeCategory}
            </h2>
            <span className="text-xs text-muted-foreground">{filtered.length} services</span>
          </div>
          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-20 bg-card border border-card-border rounded-2xl animate-pulse" />
              ))
            ) : (
              filtered.map((service: any, i: number) => (
                <motion.button
                  key={service.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => goToCountries(service.id)}
                  className="w-full flex items-center justify-between p-4 bg-card border border-card-border rounded-2xl hover:bg-secondary/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <ServiceIcon name={service.name} slug={service.slug} size={48} rounded="xl" />
                    <div>
                      <p className="text-base font-bold text-foreground leading-tight">
                        {service.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {service.category || service.scope || "Global"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {service.available?.toLocaleString("fr-FR") || "—"} disponibles
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-primary">{formatFCFA(service.price)}</span>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </motion.button>
              ))
            )}
          </div>
        </div>

        {/* Trust footer */}
        <div className="bg-secondary/50 border border-card-border rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Numéros vérifiés et sécurisés</p>
              <p className="text-xs text-muted-foreground">Taux de réussite de réception 98%</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
