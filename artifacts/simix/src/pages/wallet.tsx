import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetWallet, getGetWalletQueryKey, useListPaymentMethods, getListPaymentMethodsQueryKey, useRechargeWallet, getGetMeQueryKey, useListTransactions, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { motion } from "framer-motion";
import { Eye, ChevronRight, X, Download, MoreVertical, CreditCard, CheckCircle2, Shield, Info, Edit2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import wallet3d from "@/assets/simix_wallet_3d.png";
import { FaMobileAlt } from "react-icons/fa";

export default function Wallet() {
  return (
    <AuthGuard>
      <AppLayout showBottomNav={false}>
        <WalletContent />
      </AppLayout>
    </AuthGuard>
  );
}

function WalletContent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rechargeMutation = useRechargeWallet();

  const { data: wallet, isLoading: loadingWallet } = useGetWallet({ query: { queryKey: getGetWalletQueryKey() }});
  const { data: paymentMethods } = useListPaymentMethods({ query: { queryKey: getListPaymentMethodsQueryKey() }});
  
  const presetAmounts = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const [amount, setAmount] = useState<number>(1000);
  const [selectedMethod, setSelectedMethod] = useState<string>("mobile_money");

  async function handleRecharge() {
    try {
      await rechargeMutation.mutateAsync({
        data: { amount, methodSlug: selectedMethod }
      });
      toast({ title: "Succès", description: "Rechargement initié avec succès." });
      queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      setLocation('/dashboard');
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e.message || "Erreur de paiement" });
    }
  }

  const selectedMethodObj = paymentMethods?.find(m => m.slug === selectedMethod);

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pt-6 pb-32 px-5">
      
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background z-20 pt-2 pb-2">
        <button onClick={() => window.history.back()} className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors -ml-2">
          <div className="w-8 h-8 bg-card border border-card-border rounded-full flex items-center justify-center shadow-sm">
             <X className="w-4 h-4" />
          </div>
        </button>
        <h1 className="text-lg font-bold text-foreground">Mon portefeuille</h1>
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
             <Download className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
             <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* HERO BALANCE CARD */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative bg-gradient-to-br from-violet-700 to-violet-900 rounded-3xl p-5 mb-8 overflow-hidden shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
        
        <div className="relative z-10 flex">
          <div className="flex-1 pr-2">
            <p className="text-xs text-violet-200 font-medium mb-1">Solde actuel</p>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-3xl font-black text-white tracking-tight">
                {loadingWallet ? "..." : formatFCFA(wallet?.balance || 0)}
              </h2>
              <Eye className="w-5 h-5 text-violet-300" />
            </div>
            <div className="flex items-center gap-1.5 mb-6">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
              <span className="text-xs font-medium text-[#10B981]">Compte sécurisé</span>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 h-12 bg-white hover:bg-white/90 text-violet-900 font-bold rounded-xl shadow-lg">
                + Recharger le solde
              </Button>
              <Link href="/history">
                <Button variant="outline" className="h-12 px-4 border-white/20 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold backdrop-blur-sm">
                  📋 Historique
                </Button>
              </Link>
            </div>
          </div>
          <div className="absolute -right-6 -top-2 w-36 h-36">
            <img src={wallet3d} alt="Wallet 3D" className="w-full h-full object-contain" />
          </div>
        </div>
      </motion.div>

      {/* Recharger le solde */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
        <div className="flex justify-between items-end mb-4">
          <h2 className="text-lg font-bold text-foreground">Recharger le solde</h2>
          <Link href="#" className="text-sm font-medium text-primary hover:underline">
            Voir les méthodes
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar -mx-5 px-5">
          {paymentMethods?.map(method => (
            <button 
              key={method.slug}
              onClick={() => setSelectedMethod(method.slug)}
              className={`min-w-[110px] w-28 aspect-square p-3 rounded-2xl border flex flex-col items-center justify-center gap-2 snap-start transition-all relative ${selectedMethod === method.slug ? 'bg-primary/10 border-primary shadow-sm' : 'bg-card border-card-border hover:bg-secondary'}`}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl mb-1" style={{ backgroundColor: `${method.color}15`, color: method.color }}>
                {method.slug.includes('money') ? <FaMobileAlt className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
              </div>
              <p className="text-xs font-bold text-foreground text-center leading-tight px-1">{method.name}</p>
              <p className="text-[9px] text-muted-foreground text-center truncate w-full px-1">{method.description}</p>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Montant */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
        <h2 className="text-lg font-bold text-foreground mb-4">Montant</h2>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {presetAmounts.map((val, idx) => (
            <button
              key={val}
              onClick={() => setAmount(val)}
              className={`relative h-12 rounded-xl border text-[13px] font-bold transition-all flex items-center justify-center ${amount === val ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20' : 'bg-card border-card-border text-foreground hover:bg-secondary'}`}
            >
              {idx === 0 && amount !== val && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap uppercase tracking-wider border border-background">
                  Populaire
                </div>
              )}
              {val}
            </button>
          ))}
          <button
            className={`h-12 rounded-xl border text-[13px] font-bold bg-card border-card-border text-foreground hover:bg-secondary flex items-center justify-center gap-1`}
          >
            <Edit2 className="w-3 h-3" /> Saisir
          </button>
        </div>
      </motion.div>

      {/* Summary & Checkout */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <div className="bg-card border border-card-border rounded-2xl p-5 mb-4 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-4">Récapitulatif</h3>
          <div className="space-y-4 mb-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Méthode de paiement</span>
              <div className="bg-secondary px-3 py-1 rounded-lg text-xs font-bold text-foreground">
                {selectedMethodObj?.name || selectedMethod}
              </div>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Montant sélectionné</span>
              <span className="font-bold text-foreground">{formatFCFA(amount)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground flex items-center gap-1">Frais de service <Info className="w-3.5 h-3.5" /></span>
              <span className="font-bold text-foreground">0 FCFA</span>
            </div>
          </div>
          <div className="border-t border-card-border pt-4 flex justify-between items-center">
            <span className="font-bold text-foreground">Total à payer</span>
            <span className="font-black text-xl text-primary">{formatFCFA(amount)}</span>
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <p className="text-xs font-bold text-foreground">Paiement 100% sécurisé</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>

      </motion.div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-5 bg-background/90 backdrop-blur-xl border-t border-card-border z-30 pb-safe">
        <Button 
          onClick={handleRecharge}
          disabled={rechargeMutation.isPending}
          className="w-full h-14 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white text-base font-bold rounded-2xl shadow-lg shadow-primary/25"
        >
          🔒 Procéder au paiement →
        </Button>
      </div>

    </div>
  );
}
