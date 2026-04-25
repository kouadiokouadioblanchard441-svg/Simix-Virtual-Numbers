import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetNumber, getGetNumberQueryKey, useListNumberMessages, getListNumberMessagesQueryKey, useCancelNumber, useExtendNumber } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { ChevronLeft, Copy, Clock, X, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { differenceInSeconds } from "date-fns";

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
  const { data: messages } = useListNumberMessages(id, { 
    query: { 
      enabled: !!id && number?.status !== 'cancelled' && number?.status !== 'expired', 
      queryKey: getListNumberMessagesQueryKey(id),
      refetchInterval: 4000
    } 
  });

  const cancelMutation = useCancelNumber();
  const extendMutation = useExtendNumber();

  const [timeLeft, setTimeLeft] = useState(0);

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
      setLocation('/dashboard');
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

  const progress = Math.min(100, Math.max(0, (timeLeft / (20 * 60)) * 100)); // assuming 20 min total

  return (
    <div className="flex-1 w-full bg-background flex flex-col h-full">
      <div className="pt-12 pb-4 px-6 flex items-center justify-between border-b border-card-border bg-card/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation('/dashboard')} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">Numéro actif</h1>
            <p className="text-xs text-muted-foreground">{number.service.name} • {number.country.name}</p>
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${number.service.color}20`, color: number.service.color }}>
          <span className="font-bold text-lg">{number.service.name.charAt(0)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        
        <div className="bg-card border border-card-border rounded-3xl p-6 mb-8 text-center relative overflow-hidden shadow-lg">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-primary/10 blur-3xl rounded-full" />
          
          <p className="text-sm font-medium text-muted-foreground mb-4 relative z-10">Votre numéro virtuel</p>
          <div className="text-4xl font-black text-foreground tracking-wider font-mono mb-6 relative z-10">
            {number.phoneNumber}
          </div>
          
          <Button onClick={onCopy} variant="outline" className="h-12 px-6 rounded-xl bg-secondary border-card-border hover:bg-secondary/80 gap-2 mx-auto relative z-10">
            <Copy className="w-4 h-4" />
            Copier le numéro
          </Button>
        </div>

        {number.status === 'waiting' && (
          <div className="flex justify-center mb-8">
            <div className="relative w-40 h-40 flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" className="text-secondary" />
                <circle 
                  cx="50" cy="50" r="45" 
                  fill="none" stroke="currentColor" strokeWidth="6" 
                  strokeDasharray="283" strokeDashoffset={283 - (283 * progress) / 100}
                  strokeLinecap="round"
                  className="text-primary transition-all duration-1000 ease-linear" 
                />
              </svg>
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground font-mono">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">Temps restant</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-card border border-card-border rounded-2xl p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" /> Messages reçus
            </h3>
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-bold">{messages?.length || 0}</span>
          </div>
          
          <div className="space-y-3">
            <AnimatePresence>
              {messages?.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                  <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">En attente du SMS...</p>
                </motion.div>
              ) : (
                messages?.map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="bg-secondary/50 p-4 rounded-xl border border-card-border"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-foreground">{msg.sender}</span>
                      <span className="text-[10px] text-muted-foreground">À l'instant</span>
                    </div>
                    <p className="text-sm text-foreground break-words">{msg.body}</p>
                    {msg.code && (
                      <div className="mt-3 bg-background border border-card-border p-3 rounded-lg flex justify-between items-center">
                        <span className="text-xl font-black font-mono text-primary tracking-widest">{msg.code}</span>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => {
                          navigator.clipboard.writeText(msg.code);
                          toast({ title: "Code copié" });
                        }}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {number.status === 'waiting' && (
          <div className="flex gap-3">
            <Button onClick={onCancel} disabled={cancelMutation.isPending} variant="outline" className="flex-1 h-14 bg-card border-card-border text-destructive hover:bg-destructive/10 hover:text-destructive gap-2 rounded-xl">
              <X className="w-5 h-5" /> Annuler
            </Button>
            <Button onClick={onExtend} disabled={extendMutation.isPending} variant="outline" className="flex-1 h-14 bg-card border-card-border hover:bg-secondary gap-2 rounded-xl">
              <Plus className="w-5 h-5" /> +5 min
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
