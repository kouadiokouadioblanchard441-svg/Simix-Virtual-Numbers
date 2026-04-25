import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useListPopularServices, getListPopularServicesQueryKey, useListPopularCountries, getListPopularCountriesQueryKey } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { motion } from "framer-motion";
import { Bell, Plus, ShieldCheck, Zap, Globe, Clock, ChevronRight } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  return (
    <AuthGuard>
      <AppLayout>
        <DashboardContent />
      </AppLayout>
    </AuthGuard>
  );
}

function DashboardContent() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: popularServices, isLoading: loadingServices } = useListPopularServices({ query: { queryKey: getListPopularServicesQueryKey() } });
  const { data: popularCountries, isLoading: loadingCountries } = useListPopularCountries({ query: { queryKey: getListPopularCountriesQueryKey() } });

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pt-12 pb-8 px-6">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/15 to-transparent pointer-events-none" />
      
      <div className="relative z-10 flex justify-between items-center mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Accueil</h1>
          <p className="text-sm text-muted-foreground">Bon retour sur Simix</p>
        </div>
        <button className="w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center text-foreground relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2.5 w-2 h-2 bg-destructive rounded-full" />
        </button>
      </div>

      {/* Balance Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="w-full bg-card rounded-3xl p-6 border border-card-border shadow-lg mb-8 relative overflow-hidden"
      >
        <div className="absolute right-0 top-0 w-32 h-32 bg-primary/20 blur-3xl rounded-full" />
        
        <div className="relative z-10">
          <p className="text-sm text-muted-foreground font-medium mb-1">Solde Total</p>
          <div className="flex items-end gap-2 mb-6">
            <h2 className="text-4xl font-bold text-foreground tracking-tight">
              {loadingSummary ? "---" : formatFCFA(summary?.balance || 0)}
            </h2>
          </div>

          <div className="flex gap-3">
            <Link href="/services" className="flex-1 h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25">
              <Plus className="w-5 h-5" />
              Acheter un numéro
            </Link>
            <Link href="/wallet" className="w-12 h-12 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl flex items-center justify-center border border-card-border">
              <Plus className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </motion.div>

      {/* How it works */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
        <h3 className="text-lg font-bold text-foreground mb-4">Comment ça fonctionne ?</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card p-4 rounded-2xl border border-card-border">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Globe className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-foreground">1. Choisir un pays et un service</p>
          </div>
          <div className="bg-card p-4 rounded-2xl border border-card-border">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Zap className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-foreground">2. Obtenir le numéro instantanément</p>
          </div>
          <div className="bg-card p-4 rounded-2xl border border-card-border">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Clock className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-foreground">3. Attendre le code SMS</p>
          </div>
          <div className="bg-card p-4 rounded-2xl border border-card-border">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-foreground">4. Vérification réussie</p>
          </div>
        </div>
      </motion.div>

      {/* Popular Services */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mb-8">
        <div className="flex justify-between items-end mb-4">
          <h3 className="text-lg font-bold text-foreground">Services populaires</h3>
          <Link href="/services" className="text-sm font-medium text-primary flex items-center">
            Voir tout <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {loadingServices ? (
             Array.from({length: 4}).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 bg-card border border-card-border rounded-2xl animate-pulse" />
                <div className="w-12 h-3 bg-card rounded animate-pulse" />
              </div>
            ))
          ) : (
            popularServices?.slice(0, 4).map(service => (
              <Link key={service.id} href={`/countries?serviceId=${service.id}`} className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm" style={{ backgroundColor: service.color || '#3b82f6' }}>
                   {/* We'd normally render a specific icon per service slug here */}
                   <span className="text-white font-bold text-xl">{service.name.charAt(0)}</span>
                </div>
                <span className="text-xs font-medium text-foreground text-center truncate w-full">{service.name}</span>
              </Link>
            ))
          )}
        </div>
      </motion.div>

      {/* Popular Countries */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <div className="flex justify-between items-end mb-4">
          <h3 className="text-lg font-bold text-foreground">Pays populaires</h3>
          <Link href="/countries" className="text-sm font-medium text-primary flex items-center">
            Voir tout <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar -mx-6 px-6">
          {loadingCountries ? (
             Array.from({length: 3}).map((_, i) => (
              <div key={i} className="min-w-[120px] h-24 bg-card border border-card-border rounded-2xl animate-pulse snap-start" />
            ))
          ) : (
            popularCountries?.slice(0, 5).map(country => (
              <Link key={country.id} href={`/services?countryId=${country.id}`} className="min-w-[120px] bg-card border border-card-border p-4 rounded-2xl flex flex-col items-center justify-center gap-2 snap-start active:scale-95 transition-transform">
                <span className="text-3xl">{country.flag}</span>
                <span className="text-xs font-medium text-foreground">{country.name}</span>
              </Link>
            ))
          )}
        </div>
      </motion.div>

    </div>
  );
}
