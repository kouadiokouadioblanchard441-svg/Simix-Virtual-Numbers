import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetNumber, getGetNumberQueryKey, useListNumberMessages, getListNumberMessagesQueryKey, useCancelNumber, useExtendNumber } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { ChevronLeft, Copy, Clock, X, MessageSquare, Plus, Shield, CheckCircle2, Download, MoreVertical, RefreshCw, AlertTriangle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { differenceInSeconds, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import phoneChat3d from "@/assets/simix_phone_chat_3d.png";
import { ServiceIcon } from "@/components/service-icon";

export default function NumberAssigned({ params }: { params: { id: string } }) {
  return (
    <AuthGuard>
      <AppLayout showBottomNav={false}>
        <NumberAssignedContent id={params.id} />
      </AppLayout>
    </AuthGuard>
  );
}

function NumberAssignedContent({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: number, isLoading } = useGetNumber(id, { query: { enabled: !!id, queryKey: getGetNumberQueryKey(id) } });
  
  // Poll for messages every 4s
  const { data: messages, refetch: refetchMessages, isFetching: isFetchingMessages } = useListNumberMessages(id, { 
    query: { 
      enabled: !!id && number?.status !== 'cancelled' && number?.status !== 'expired', 
      queryKey: getListNumberMessagesQueryKey(id),
      refetchInterval: 4000
    } 
  });

  const cancelMutation = useCancelNumber();
  const extendMutation = useExtendNumber();

  const [timeLeft, setTimeLeft] = useState(0);
  const TOTAL_SECONDS = 15 * 60; // Assume 15 minutes total for the ring progress

  useEffect(() => {
    if (!number?.expiresAt || number.status !== 'waiting') return;
    const updateTimer = () => {
      const diff = differenceInSeconds(new Date(number.expiresAt), new Date());
      setTimeLeft(Math.max(0, diff));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [number]);

  async function onCopy() {
    if (number?.phoneNumber) {
      await navigator.clipboard.writeText(number.phoneNumber);
      toast({ title: "Copié!", description: "Numéro copié dans le presse-papiers" });
    }
  }

  async function onCancel() {
    try {
      await cancelMutation.mutateAsync({ numberId: id });
      queryClient.invalidateQueries({ queryKey: getGetNumberQueryKey(id) });
      toast({ title: "Annulé", description: "Le numéro a été annulé et remboursé." });
      setLocation('/history');
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible d'annuler" });
    }
  }

  async function onExtend() {
    try {
      await extendMutation.mutateAsync({ numberId: id });
      queryClient.invalidateQueries({ queryKey: getGetNumberQueryKey(id) });
      toast({ title: "Prolongé", description: "Le temps a été prolongé de 5 min." });
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de prolonger" });
    }
  }

  if (isLoading || !number) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const progress = Math.min(100, Math.max(0, (timeLeft / TOTAL_SECONDS) * 100));

  return (
    <div className="flex-1 w-full bg-background flex flex-col h-full">
      <div className="pt-6 pb-4 px-5 flex items-center justify-between sticky top-0 z-20 bg-background/90 backdrop-blur-xl border-b border-card-border">
        <div className="flex items-center">
          <button onClick={() => setLocation('/dashboard')} className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors -ml-2">
            <div className="w-8 h-8 bg-card border border-card-border rounded-full flex items-center justify-center shadow-sm">
               <X className="w-4 h-4" />
            </div>
          </button>
          <h1 className="text-lg font-bold text-foreground ml-3">Numéro attribué</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
             <Download className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
             <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        
        {/* HERO CARD */}
        <div className="bg-gradient-to-br from-violet-700 to-violet-900 rounded-3xl p-5 mb-4 flex items-center relative overflow-hidden shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
          <div className="flex-1 relative z-10 pr-2">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-white" />
              <h3 className="text-xl font-bold text-white leading-tight">Votre numéro est prêt !</h3>
            </div>
            <p className="text-sm text-violet-200 leading-relaxed">
              Utilisez ce numéro pour recevoir vos SMS et codes de vérification.
            </p>
          </div>
          <div className="w-24 h-24 relative z-10 shrink-0">
            <img src={phoneChat3d} alt="Phone" className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Service + Country small card */}
        <div className="bg-card border border-card-border rounded-2xl p-3 flex items-center justify-between mb-4 shadow-sm">
          <div className="flex items-center gap-3">
            <ServiceIcon name={number.service.name} slug={(number.service as any).slug} size={40} rounded="xl" />
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">{number.service.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span>{number.country.flag}</span> {number.country.name} {number.country.dialCode}
              </p>
            </div>
          </div>
          <Link href="#" className="text-xs font-semibold text-muted-foreground hover:text-primary">
            Détails ⓘ
          </Link>
        </div>

        {/* PHONE NUMBER CARD */}
        <div className="bg-card border border-card-border rounded-2xl p-5 mb-4 shadow-sm text-center">
          <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">Votre numéro virtuel</p>
          <div className="text-[28px] font-black text-white tracking-widest tabular-nums mb-3">
            {number.phoneNumber}
          </div>
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-1.5 bg-secondary/50 px-3 py-1.5 rounded-lg border border-card-border">
               <Shield className="w-3.5 h-3.5 text-muted-foreground" />
               <p className="text-xs font-medium text-muted-foreground">Numéro temporaire • Ne pas partager</p>
            </div>
          </div>
          <Button onClick={onCopy} variant="outline" className="w-full h-12 rounded-xl border-primary text-primary hover:bg-primary/10 hover:text-primary font-bold shadow-sm">
            <Copy className="w-4 h-4 mr-2" />
            Copier
          </Button>
        </div>

        {/* COUNTDOWN CARD */}
        {number.status === 'waiting' && (
          <div className="bg-card border border-card-border rounded-2xl p-4 mb-8 shadow-sm flex items-center gap-5">
            <div className="relative w-[100px] h-[100px] flex items-center justify-center shrink-0">
              <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--secondary))" strokeWidth="6" />
                <circle 
                  cx="50" cy="50" r="45" 
                  fill="none" stroke="hsl(var(--primary))" strokeWidth="6" 
                  strokeDasharray="283" strokeDashoffset={283 - (283 * progress) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear" 
                />
              </svg>
              <div className="text-center mt-1">
                <p className="text-xl font-black text-white tabular-nums leading-none mb-1">
                  {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                </p>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Temps restant</p>
              </div>
            </div>
            <div className="flex-1 py-1">
              <h4 className="text-sm font-bold text-primary mb-1">Temps restant pour recevoir</h4>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Vous avez 10 minutes pour recevoir votre SMS. Le numéro sera libéré après expiration du temps.
              </p>
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 flex items-start gap-2">
                 <Lightbulb className="w-4 h-4 text-primary shrink-0" />
                 <div>
                   <h5 className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">Conseil</h5>
                   <p className="text-[10px] text-primary/80 leading-tight">Allez sur le site ou l'application et utilisez ce numéro pour recevoir votre code.</p>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">Messages reçus</h2>
            <button 
              onClick={() => refetchMessages()}
              className="text-sm font-semibold text-primary flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${isFetchingMessages ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>
          
          <AnimatePresence>
            {!messages || messages.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-card-border rounded-2xl p-8 flex flex-col items-center text-center shadow-sm">
                <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="w-6 h-6 text-muted-foreground" />
                </div>
                <h4 className="text-base font-bold text-foreground mb-1">Aucun message pour le moment</h4>
                <p className="text-sm text-muted-foreground">Les SMS reçus apparaîtront ici automatiquement.</p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="bg-card border border-card-border rounded-2xl p-4 shadow-sm"
                  >
                    <div className="flex justify-between items-center mb-2 border-b border-card-border pb-2">
                      <span className="text-sm font-bold text-foreground flex items-center gap-2">
                         <div className="w-6 h-6 bg-secondary rounded-full flex items-center justify-center">
                           <MessageSquare className="w-3 h-3 text-muted-foreground" />
                         </div>
                         {msg.sender}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.receivedAt), { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground mb-4 leading-relaxed">{msg.body}</p>
                    {msg.code && (
                      <div className="bg-secondary/50 border border-card-border rounded-xl p-3 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Code de vérification</p>
                          <span className="text-2xl font-black font-mono text-primary tracking-[0.2em]">{msg.code}</span>
                        </div>
                        <Button variant="outline" className="h-10 px-4 rounded-lg border-card-border bg-card hover:bg-secondary text-sm font-bold" onClick={() => {
                          navigator.clipboard.writeText(msg.code);
                          toast({ title: "Code copié" });
                        }}>
                          Copier
                        </Button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {number.status === 'waiting' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 mb-8">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-500 mb-0.5">Important</h4>
              <p className="text-xs text-amber-500/80 font-medium">Ne quittez pas cette page pendant l'attente du SMS.</p>
            </div>
          </div>
        )}

      </div>

      {number.status === 'waiting' && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-5 bg-background/90 backdrop-blur-xl border-t border-card-border z-30 pb-safe flex gap-3">
          <Button onClick={onCancel} disabled={cancelMutation.isPending} variant="outline" className="h-14 flex-1 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive gap-2 rounded-xl text-sm font-bold bg-transparent">
            ← Annuler le numéro
          </Button>
          <Button onClick={onExtend} disabled={extendMutation.isPending} className="h-14 flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white rounded-xl shadow-lg shadow-primary/25 flex flex-col items-center justify-center pt-1 leading-none">
            <span className="block text-sm font-bold mb-0.5 flex items-center gap-1"><Clock className="w-4 h-4"/> Prolonger le temps +5 min</span>
            <span className="block text-[10px] font-normal text-white/80">30 FCFA</span>
          </Button>
        </div>
      )}
    </div>
  );
}
