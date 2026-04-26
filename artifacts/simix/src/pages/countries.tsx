import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useListCountries, getListCountriesQueryKey, useListPopularCountries, getListPopularCountriesQueryKey, useListServices, getListServicesQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, ChevronLeft, Filter, ShieldCheck, ChevronRight, Edit2, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { formatFCFA } from "@/lib/format";
import { FaWhatsapp, FaTelegram, FaFacebook, FaGoogle, FaInstagram } from "react-icons/fa";
import { SiX } from "react-icons/si";
import { Button } from "@/components/ui/button";

function getServiceIcon(name: string) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("whatsapp")) return <FaWhatsapp className="w-8 h-8 text-white" />;
  if (lowerName.includes("telegram")) return <FaTelegram className="w-8 h-8 text-white" />;
  if (lowerName.includes("facebook")) return <FaFacebook className="w-8 h-8 text-white" />;
  if (lowerName.includes("google")) return <FaGoogle className="w-8 h-8 text-white" />;
  if (lowerName.includes("instagram")) return <FaInstagram className="w-8 h-8 text-white" />;
  if (lowerName.includes("twitter") || lowerName.includes("x")) return <SiX className="w-7 h-7 text-white" />;
  return <span className="text-white font-bold text-2xl">{name.charAt(0)}</span>;
}

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

  const { data: services } = useListServices(undefined, { query: { queryKey: getListServicesQueryKey() }});
  const selectedService = services?.find(s => s.id === serviceId);

  return (
    <div className="flex-1 w-full bg-background flex flex-col h-full">
      <div className="pt-6 pb-4 px-5 bg-background sticky top-0 z-20">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => window.history.back()} className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors -ml-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Choisir un pays</h1>
          <Link href="#" className="text-sm font-semibold text-primary flex items-center gap-1">
            ❓ Aide
          </Link>
        </div>

        {selectedService && (
          <div className="bg-violet-900/20 border border-violet-500/30 rounded-2xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm shrink-0" style={{ backgroundColor: selectedService.color || '#3b82f6' }}>
                {getServiceIcon(selectedService.name)}
              </div>
              <div>
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-0.5">Service sélectionné</p>
                <h3 className="text-lg font-bold text-white leading-tight">{selectedService.name}</h3>
                <p className="text-xs text-muted-foreground">Recevez des SMS et des codes</p>
              </div>
            </div>
            <Link href="/services">
              <Button variant="outline" size="sm" className="border-primary text-primary hover:bg-primary/10 hover:text-primary rounded-xl text-xs h-9 px-3 font-semibold">
                <Edit2 className="w-3 h-3 mr-1.5" /> Modifier
              </Button>
            </Link>
          </div>
        )}

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input 
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un pays..." 
              className="w-full h-14 bg-card border border-card-border rounded-xl pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <button className="w-14 h-14 bg-card border border-card-border rounded-xl flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-8">
        {!search && (
          <div>
            <div className="flex justify-between items-end mb-4">
              <h2 className="text-lg font-bold text-foreground">Pays populaires</h2>
              <Link href="#" className="text-sm font-medium text-primary hover:underline">
                Voir tout
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar -mx-5 px-5">
              {loadingPopular ? (
                 Array.from({length: 4}).map((_, i) => (
                  <div key={i} className="min-w-[140px] h-32 bg-card border border-card-border rounded-2xl animate-pulse snap-start" />
                ))
              ) : (
                popularCountries?.map((country, idx) => (
                  <Link key={country.id} href={`/numbers/new?serviceId=${serviceId}&countryId=${country.id}`} className={`min-w-[140px] bg-card border ${idx === 0 ? 'border-primary shadow-sm shadow-primary/10' : 'border-card-border'} p-4 rounded-2xl flex flex-col items-center justify-center gap-1 snap-start hover:bg-secondary/50 transition-colors relative`}>
                    {idx === 0 && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center">
                        <Zap className="w-3 h-3 text-primary fill-primary" />
                      </div>
                    )}
                    <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center text-2xl mb-1">
                      {country.flag}
                    </div>
                    <span className="text-sm font-bold text-foreground truncate w-full text-center">{country.name}</span>
                    <span className="text-xs font-medium text-muted-foreground">{country.dialCode}</span>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <span className="text-[10px] font-medium text-green-500">{country.available} dispo</span>
                    </div>
                    <span className="text-sm font-bold text-primary mt-1">{formatFCFA(country.price)}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}

        <div>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-lg font-bold text-foreground">Tous les pays</h2>
            {!selectedService && (
              <Link href="#" className="text-sm font-medium text-primary hover:underline">
                Trier par popularité
              </Link>
            )}
          </div>
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
                  <Link href={`/numbers/new?serviceId=${serviceId}&countryId=${country.id}`} className="flex items-center justify-between p-4 bg-card border border-card-border rounded-2xl hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center text-xl">
                        {country.flag}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {country.name} <span className="text-muted-foreground font-medium ml-1">{country.dialCode}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 hidden sm:flex">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs text-muted-foreground">{country.available} disponibles</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-primary">{formatFCFA(country.price)}</span>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </div>
        
        <div className="bg-secondary/50 border border-card-border rounded-2xl p-4 flex items-center justify-between mt-8">
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
