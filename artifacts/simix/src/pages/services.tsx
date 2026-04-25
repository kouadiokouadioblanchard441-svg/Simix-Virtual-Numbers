import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useListServices, getListServicesQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Link } from "wouter";
import { Search, ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";

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
  const [search, setSearch] = useState("");
  const params = search ? { search } : undefined;
  const { data: services, isLoading } = useListServices(params, {
    query: { queryKey: getListServicesQueryKey(params) },
  });

  return (
    <div className="flex-1 w-full bg-background flex flex-col h-full">
      <div className="pt-12 pb-4 px-6 border-b border-card-border bg-background sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center text-foreground">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Choisir un service</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un service..." 
            className="w-full h-12 bg-card border border-card-border rounded-xl pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-3 gap-4">
          {isLoading ? (
             Array.from({length: 12}).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 bg-card border border-card-border rounded-2xl animate-pulse" />
                <div className="w-16 h-3 bg-card rounded animate-pulse" />
              </div>
            ))
          ) : (
            services?.map((service, i) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link href={`/countries?serviceId=${service.id}`} className="flex flex-col items-center gap-2 group p-2 rounded-2xl active:bg-secondary/50 transition-colors">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm" style={{ backgroundColor: service.color || '#3b82f6' }}>
                     <span className="text-white font-bold text-2xl">{service.name.charAt(0)}</span>
                  </div>
                  <span className="text-xs font-medium text-foreground text-center line-clamp-1 w-full">{service.name}</span>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
