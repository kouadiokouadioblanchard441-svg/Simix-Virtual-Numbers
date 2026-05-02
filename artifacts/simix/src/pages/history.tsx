import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useListNumberHistory, getListNumberHistoryQueryKey } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { Clock, CheckCircle2, XCircle, Search, Filter } from "lucide-react";
import { ServiceIcon } from "@/components/service-icon";

export default function History() {
  return (
    <AuthGuard>
      <AppLayout>
        <HistoryContent />
      </AppLayout>
    </AuthGuard>
  );
}

function HistoryContent() {
  const { data: numbers, isLoading } = useListNumberHistory({ query: { queryKey: getListNumberHistoryQueryKey() }});

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pt-12 pb-8 px-6">
      <h1 className="text-xl font-bold text-foreground mb-6">Historique</h1>

      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Rechercher un numéro..." 
            className="w-full h-10 bg-card border border-card-border rounded-xl pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button className="w-10 h-10 bg-card border border-card-border rounded-xl flex items-center justify-center text-foreground">
          <Filter className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        {isLoading ? (
           Array.from({length: 5}).map((_, i) => (
             <div key={i} className="h-24 bg-card border border-card-border rounded-2xl animate-pulse" />
           ))
        ) : numbers?.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium">Aucun historique</p>
            <p className="text-sm text-muted-foreground">Vos numéros achetés apparaîtront ici</p>
          </div>
        ) : (
          numbers?.map((num, i) => (
            <motion.div 
              key={num.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card border border-card-border p-4 rounded-2xl flex items-center gap-4"
            >
              <ServiceIcon name={num.service.name} slug={(num.service as any).slug} size={48} rounded="xl" />
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="text-sm font-bold text-foreground">{num.service.name}</h4>
                  <span className="text-sm font-bold text-foreground">{formatFCFA(num.price)}</span>
                </div>
                
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-secondary px-2 py-0.5 rounded-md text-foreground font-mono">{num.phoneNumber}</span>
                  <span className="text-xs text-muted-foreground">{num.country.flag}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(num.createdAt), "dd MMM yyyy, HH:mm", { locale: fr })}
                  </span>
                  
                  <div className="flex items-center gap-1">
                    {num.status === 'received' && (
                      <><CheckCircle2 className="w-3 h-3 text-[#10B981]" /><span className="text-[10px] font-medium text-[#10B981]">Réussi</span></>
                    )}
                    {num.status === 'cancelled' && (
                      <><XCircle className="w-3 h-3 text-destructive" /><span className="text-[10px] font-medium text-destructive">Annulé</span></>
                    )}
                    {num.status === 'expired' && (
                      <><Clock className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] font-medium text-muted-foreground">Expiré</span></>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
