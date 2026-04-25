import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetNumberQuote, getGetNumberQuoteQueryKey, useRequestNumber, getListActiveNumbersQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { ChevronLeft, Info, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { formatFCFA } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function NumberDetails() {
  return (
    <AuthGuard>
      <AppLayout showBottomNav={false}>
        <NumberDetailsContent />
      </AppLayout>
    </AuthGuard>
  );
}

function NumberDetailsContent() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const serviceId = searchParams.get('serviceId') || "";
  const countryId = searchParams.get('countryId') || "";
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const requestMutation = useRequestNumber();

  const { data: quote, isLoading } = useGetNumberQuote(
    { serviceId, countryId },
    { query: { enabled: !!(serviceId && countryId), queryKey: getGetNumberQuoteQueryKey({ serviceId, countryId }) } }
  );

  async function onBuy() {
    try {
      const number = await requestMutation.mutateAsync({
        data: { serviceId, countryId }
      });
      queryClient.invalidateQueries({ queryKey: getListActiveNumbersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      setLocation(`/numbers/${number.id}`);
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error?.message || "Fonds insuffisants ou erreur serveur",
        variant: "destructive",
      });
    }
  }

  if (isLoading || !quote) {
    return (
      <div className="flex-1 w-full bg-background flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full bg-background flex flex-col h-full relative">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

      <div className="pt-12 pb-4 px-6 flex items-center gap-4 relative z-10">
        <button onClick={() => window.history.back()} className="w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Détails de l'achat</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-32 relative z-10">
        <div className="flex items-center gap-4 mb-8 bg-card border border-card-border p-4 rounded-3xl">
          <div className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shadow-sm relative overflow-hidden" style={{ backgroundColor: quote.service.color }}>
             <span className="text-white font-bold text-xl">{quote.service.name.charAt(0)}</span>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground">{quote.service.name}</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{quote.country.flag}</span>
              <span>{quote.country.name}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-card border border-card-border p-4 rounded-2xl">
            <p className="text-xs text-muted-foreground mb-1">Disponibilité</p>
            <p className="text-base font-bold text-foreground">{quote.available} numéros</p>
          </div>
          <div className="bg-card border border-card-border p-4 rounded-2xl">
            <p className="text-xs text-muted-foreground mb-1">Temps d'attente</p>
            <p className="text-base font-bold text-foreground">{quote.waitTime}</p>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-3xl p-5 mb-8 shadow-lg">
          <h3 className="text-sm font-bold text-foreground mb-4">Détails du prix</h3>
          <div className="space-y-3 mb-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Prix du numéro</span>
              <span className="font-medium text-foreground">{formatFCFA(quote.price)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Frais de service</span>
              <span className="font-medium text-foreground">{formatFCFA(quote.fees)}</span>
            </div>
          </div>
          <div className="border-t border-card-border pt-4 flex justify-between items-center">
            <span className="font-bold text-foreground">Total à payer</span>
            <span className="font-bold text-xl text-primary">{formatFCFA(quote.total)}</span>
          </div>
        </div>

        <div className="bg-secondary/50 rounded-2xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Info className="w-4 h-4" /> Ce que vous obtenez
          </h4>
          <ul className="space-y-2">
            <li className="flex items-center gap-3 text-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
              Numéro valide pendant {quote.validityMinutes} minutes
            </li>
            <li className="flex items-center gap-3 text-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
              Réception de SMS illimitée
            </li>
            <li className="flex items-center gap-3 text-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
              Remboursé si aucun SMS reçu
            </li>
          </ul>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full p-6 bg-background/80 backdrop-blur-xl border-t border-card-border z-20 pb-safe">
        <Button 
          onClick={onBuy}
          disabled={requestMutation.isPending}
          className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground text-base font-bold rounded-xl shadow-lg shadow-primary/25"
        >
          {requestMutation.isPending ? "Achat en cours..." : "Obtenir un numéro"}
        </Button>
      </div>
    </div>
  );
}
