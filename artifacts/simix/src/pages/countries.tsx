import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useListCountries, getListCountriesQueryKey, useListPopularCountries, getListPopularCountriesQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, ChevronLeft, Filter } from "lucide-react";
import { motion } from "framer-motion";
import { formatFCFA } from "@/lib/format";

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
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const serviceId = searchParams.get('serviceId') || undefined;

  const [search, setSearch] = useState("");
  const { data: popularCountries, isLoading: loadingPopular } = useListPopularCountries({ query: { queryKey: getListPopularCountriesQueryKey() } });
  const { data: countries, isLoading } = useListCountries(
    { search, serviceId },
    { query: { queryKey: getListCountriesQueryKey({ search, serviceId }) } }
  );

  return (
    <div className="flex-1 w-full bg-background flex flex-col h-full">
      <div className="pt-12 pb-4 px-6 border-b border-card-border bg-background sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/services" className="w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center text-foreground">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Choisir un pays</h1>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un pays..." 
              className="w-full h-12 bg-card border border-card-border rounded-xl pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button className="w-12 h-12 bg-card border border-card-border rounded-xl flex items-center justify-center text-foreground">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {!search && (
          <div>
            <h3 className="text-sm font-bold text-foreground mb-4">Pays populaires</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x hide-scrollbar -mx-6 px-6">
              {loadingPopular ? (
                 Array.from({length: 4}).map((_, i) => (
                  <div key={i} className="min-w-[100px] h-24 bg-card border border-card-border rounded-2xl animate-pulse snap-start" />
                ))
              ) : (
                popularCountries?.map(country => (
                  <Link key={country.id} href={`/numbers/new?serviceId=${serviceId}&countryId=${country.id}`} className="min-w-[100px] bg-card border border-card-border p-3 rounded-2xl flex flex-col items-center justify-center gap-2 snap-start active:scale-95 transition-transform">
                    <span className="text-2xl">{country.flag}</span>
                    <span className="text-xs font-medium text-foreground text-center truncate w-full">{country.name}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-bold text-foreground mb-4">Tous les pays</h3>
          <div className="space-y-3">
            {isLoading ? (
               Array.from({length: 10}).map((_, i) => (
                <div key={i} className="h-16 bg-card border border-card-border rounded-2xl animate-pulse" />
              ))
            ) : (
              countries?.map((country, i) => (
                <motion.div
                  key={country.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={`/numbers/new?serviceId=${serviceId}&countryId=${country.id}`} className="flex items-center justify-between p-4 bg-card border border-card-border rounded-2xl active:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{country.flag}</span>
                      <div>
                        <p className="text-sm font-bold text-foreground">{country.name}</p>
                        <p className="text-xs text-muted-foreground">{country.available} numéros</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-primary">{formatFCFA(country.price)}</span>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
