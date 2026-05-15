import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetNumberQuote, getGetNumberQuoteQueryKey, useRequestNumber, getListActiveNumbersQueryKey, getGetDashboardSummaryQueryKey, getGetWalletQueryKey, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { ChevronLeft, Info, CheckCircle2, Shield, Edit2, Phone, Clock, Lock } from "lucide-react";
import { Link } from "wouter";
import { formatFCFA } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ServiceIcon } from "@/components/service-icon";

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

  const { data: quote, isLoading, isError } = useGetNumberQuote(
    { serviceId, countryId },
    { query: { enabled: !!(serviceId && countryId && serviceId !== "undefined" && countryId !== "undefined"), queryKey: getGetNumberQuoteQueryKey({ serviceId, countryId }) } }
  );

  async function onBuy() {
    try {
      const number = await requestMutation.mutateAsync({
        data: { serviceId, countryId }
      });
      queryClient.invalidateQueries({ queryKey: getListActiveNumbersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      setLocation(`/numbers/${number.id}`);
    } catch (error: any) {
      const msg: string = error?.message || "Impossible d'obtenir un numéro pour ce service en ce moment.";
      const isBalance = /solde|insuffisant|fonds/i.test(msg);
      toast({
        title: isBalance ? "Solde insuffisant" : "Numéro indisponible",
        description: isBalance
          ? `${msg} Rendez-vous dans « Recharger » pour créditer votre compte.`
          : msg,
        variant: "destructive",
      });
    }
  }

  const missingParams = !serviceId || !countryId || serviceId === "undefined" || countryId === "undefined";

  if (missingParams) {
    return (
      <div className="flex-1 w-full bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-bold text-foreground">Sélection incomplète</h2>
        <p className="text-sm text-muted-foreground">Veuillez d'abord choisir un service et un pays.</p>
        <button onClick={() => setLocation("/services")} className="mt-2 px-6 py-3 bg-primary text-white rounded-2xl text-sm font-bold">
          Choisir un service
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 w-full bg-background flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !quote) {
    return (
      <div className="flex-1 w-full bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-4xl">😞</div>
        <h2 className="text-lg font-bold text-foreground">Indisponible</h2>
        <p className="text-sm text-muted-foreground">
          Ce service n'est pas disponible pour ce pays actuellement. Essayez un autre pays ou service.
        </p>
        <div className="flex gap-3 mt-2">
          <button onClick={() => window.history.back()} className="px-5 py-3 border border-card-border text-foreground rounded-2xl text-sm font-bold">
            ← Retour
          </button>
          <button onClick={() => setLocation("/services")} className="px-5 py-3 bg-primary text-white rounded-2xl text-sm font-bold">
            Changer de service
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full bg-background flex flex-col h-full relative">
      <div className="pt-6 pb-4 px-5 flex items-center justify-between sticky top-0 z-20 bg-background/90 backdrop-blur-xl border-b border-card-border">
        <div className="flex items-center gap-4">
          <button onClick={() => window.history.back()} className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors -ml-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Détails de votre numéro</h1>
        </div>
        <Link href="#" className="text-sm font-semibold text-primary flex items-center gap-1">
          ❓ Aide
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-36 pt-6">
        
        {/* Service and Country Cards */}
        <div className="space-y-3 mb-8">
          <div className="bg-violet-900/20 border border-violet-500/30 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <ServiceIcon name={quote.service.name} slug={(quote.service as any).slug} size={56} rounded="2xl" />
              <div>
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-0.5">Service sélectionné</p>
                <h3 className="text-lg font-bold text-white leading-tight">{quote.service.name}</h3>
                <p className="text-xs text-muted-foreground">Recevez des SMS et des codes</p>
              </div>
            </div>
            <Link href="/services">
              <Button variant="outline" size="sm" className="border-primary text-primary hover:bg-primary/10 hover:text-primary rounded-xl text-xs h-9 px-3 font-semibold">
                <Edit2 className="w-3 h-3 mr-1.5" /> Changer
              </Button>
            </Link>
          </div>

          <div className="bg-[#10B981]/10 border border-[#10B981]/20 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-secondary rounded-2xl flex items-center justify-center text-3xl shadow-sm shrink-0">
                {quote.country.flag}
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#10B981] uppercase tracking-wider mb-0.5">Pays sélectionné</p>
                <h3 className="text-lg font-bold text-white leading-tight">{quote.country.name}</h3>
                <p className="text-xs text-muted-foreground">{quote.country.dialCode}</p>
              </div>
            </div>
            <Link href={`/countries?serviceId=${serviceId}`}>
              <Button variant="outline" size="sm" className="border-[#10B981] text-[#10B981] hover:bg-[#10B981]/10 hover:text-[#10B981] rounded-xl text-xs h-9 px-3 font-semibold">
                <Edit2 className="w-3 h-3 mr-1.5" /> Changer
              </Button>
            </Link>
          </div>
        </div>

        {/* Informations du numéro */}
        <h2 className="text-lg font-bold text-foreground mb-4">Informations du numéro</h2>
        <div className="bg-card border border-card-border rounded-2xl p-4 mb-4">
          <div className="grid grid-cols-3 divide-x divide-card-border">
            <div className="flex flex-col items-center text-center px-2">
              <Phone className="w-5 h-5 text-muted-foreground mb-2" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Numéros disponibles</p>
              <h3 className="text-base font-bold text-white leading-tight">{quote.available.toLocaleString('fr-FR')}</h3>
              <p className="text-[10px] text-muted-foreground">numéros</p>
            </div>
            <div className="flex flex-col items-center text-center px-2">
              <Clock className="w-5 h-5 text-muted-foreground mb-2" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Temps d'attente</p>
              <h3 className="text-base font-bold text-white leading-tight">{quote.waitTime}</h3>
              <p className="text-[10px] text-muted-foreground">en moyenne</p>
            </div>
            <div className="flex flex-col items-center text-center px-2">
              <Shield className="w-5 h-5 text-muted-foreground mb-2" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Type de numéro</p>
              <h3 className="text-base font-bold text-white leading-tight">Temporaire</h3>
              <p className="text-[10px] text-muted-foreground">usage unique</p>
            </div>
          </div>
        </div>

        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 mb-8 flex items-start gap-3 relative">
          <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="pr-6">
            <h4 className="text-sm font-bold text-primary mb-1">Numéro temporaire</h4>
            <p className="text-xs text-primary/80 leading-relaxed">
              Ce numéro est valable pour une seule réception de SMS. Valable environ 10 à 15 minutes.
            </p>
          </div>
          <Info className="w-4 h-4 text-primary absolute top-4 right-4" />
        </div>

        {/* Price Card */}
        <div className="bg-card border border-card-border rounded-2xl p-5 mb-8 flex divide-x divide-card-border">
          <div className="flex-1 pr-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Prix du numéro</p>
            <h2 className="text-3xl font-black text-primary mb-2 tracking-tight">{formatFCFA(quote.price)}</h2>
            <p className="text-xs font-bold text-green-500 flex items-center gap-1">
              ✓ Aucun frais caché
            </p>
          </div>
          <div className="flex-1 pl-4 flex flex-col justify-center space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground font-medium">Sous-total</span>
              <span className="text-xs font-bold text-foreground">{formatFCFA(quote.price)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">Frais de service <Info className="w-3 h-3" /></span>
              <span className="text-xs font-bold text-foreground">{formatFCFA(quote.fees)}</span>
            </div>
            <div className="pt-2 border-t border-card-border flex justify-between items-center">
              <span className="text-sm font-bold text-primary">Total à payer</span>
              <span className="text-sm font-bold text-primary">{formatFCFA(quote.total)}</span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground mb-4">Ce que vous obtenez</h2>
          <ul className="space-y-3 bg-card border border-card-border p-4 rounded-2xl">
            <li className="flex gap-3">
              <div className="mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Numéro réel et actif</p>
                <p className="text-xs text-muted-foreground">Numéro non VoIP garanti pour la vérification</p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Réception instantanée</p>
                <p className="text-xs text-muted-foreground">Le SMS s'affichera directement sur l'écran</p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Sécurisé et privé</p>
                <p className="text-xs text-muted-foreground">Votre vrai numéro reste totalement privé</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-5 bg-background/90 backdrop-blur-xl border-t border-card-border z-30 pb-safe">
        <Button 
          onClick={onBuy}
          disabled={requestMutation.isPending}
          className="w-full h-14 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white text-base font-bold rounded-2xl shadow-lg shadow-primary/25 flex flex-col items-center justify-center pt-2 leading-none"
        >
          <span className="block mb-1">{requestMutation.isPending ? "Achat en cours..." : "Obtenir un numéro →"}</span>
          <span className="block text-[10px] font-normal text-white/80">🔒 Paiement sécurisé et crypté</span>
        </Button>
      </div>
    </div>
  );
}
