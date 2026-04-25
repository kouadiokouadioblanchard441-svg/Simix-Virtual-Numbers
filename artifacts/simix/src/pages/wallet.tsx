import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetWallet, getGetWalletQueryKey, useListPaymentMethods, getListPaymentMethodsQueryKey } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { motion } from "framer-motion";
import { Wallet as WalletIcon, CreditCard, ChevronRight, History } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function Wallet() {
  return (
    <AuthGuard>
      <AppLayout>
        <WalletContent />
      </AppLayout>
    </AuthGuard>
  );
}

function WalletContent() {
  const { data: wallet, isLoading: loadingWallet } = useGetWallet({ query: { queryKey: getGetWalletQueryKey() }});
  const { data: paymentMethods } = useListPaymentMethods({ query: { queryKey: getListPaymentMethodsQueryKey() }});
  
  const presetAmounts = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const [amount, setAmount] = useState<number>(5000);
  const [selectedMethod, setSelectedMethod] = useState<string>("mobile_money");

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pt-12 pb-8 px-6">
      <h1 className="text-xl font-bold text-foreground mb-6">Mon portefeuille</h1>

      {/* Balance Card with Illustration */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative bg-gradient-to-br from-card to-card/50 border border-card-border rounded-3xl p-6 mb-8 overflow-hidden">
        <div className="absolute -right-4 -top-4 w-32 h-32 bg-primary/20 blur-3xl rounded-full" />
        
        <div className="relative z-10 flex justify-between items-center mb-6">
          <div>
            <p className="text-sm text-muted-foreground font-medium mb-1">Solde Disponible</p>
            <h2 className="text-3xl font-bold text-foreground">
              {loadingWallet ? "..." : formatFCFA(wallet?.balance || 0)}
            </h2>
          </div>
          <div className="w-16 h-16 bg-primary/10 rounded-2xl border border-primary/20 flex items-center justify-center">
            <WalletIcon className="w-8 h-8 text-primary" />
          </div>
        </div>

        <div className="relative z-10 flex gap-3">
          <Button className="flex-1 h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl">
            Recharger le solde
          </Button>
          <Button variant="outline" className="h-12 w-12 bg-secondary border-card-border rounded-xl">
            <History className="w-5 h-5 text-foreground" />
          </Button>
        </div>
      </motion.div>

      {/* Payment Methods */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
        <h3 className="text-base font-bold text-foreground mb-4">Méthode de paiement</h3>
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar -mx-6 px-6">
          {paymentMethods?.map(method => (
            <button 
              key={method.id}
              onClick={() => setSelectedMethod(method.slug)}
              className={`min-w-[140px] p-4 rounded-2xl border flex flex-col gap-3 snap-start transition-all ${selectedMethod === method.slug ? 'bg-primary/10 border-primary shadow-sm' : 'bg-card border-card-border hover:bg-secondary'}`}
            >
              <div className="flex justify-between items-start w-full">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${method.color}20`, color: method.color }}>
                  <CreditCard className="w-4 h-4" />
                </div>
                {method.recommended && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded-md">Rec</span>
                )}
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-foreground">{method.name}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-1">{method.description}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Preset Amounts */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-foreground">Montant à recharger</h3>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {presetAmounts.map(val => (
            <button
              key={val}
              onClick={() => setAmount(val)}
              className={`h-12 rounded-xl border text-sm font-bold transition-all ${amount === val ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20' : 'bg-card border-card-border text-foreground hover:bg-secondary'}`}
            >
              {val}
            </button>
          ))}
          <button
            className={`h-12 rounded-xl border text-sm font-bold bg-card border-card-border text-foreground hover:bg-secondary`}
          >
            Autre
          </button>
        </div>
      </motion.div>

      {/* Summary & Checkout */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card border border-card-border rounded-2xl p-5 mb-8">
        <h4 className="text-sm font-bold text-foreground mb-4">Récapitulatif</h4>
        <div className="space-y-3 mb-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Montant</span>
            <span className="font-medium text-foreground">{formatFCFA(amount)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Frais (0%)</span>
            <span className="font-medium text-foreground">0 FCFA</span>
          </div>
        </div>
        <div className="border-t border-card-border pt-4 flex justify-between items-center">
          <span className="font-bold text-foreground">Total à payer</span>
          <span className="font-bold text-lg text-primary">{formatFCFA(amount)}</span>
        </div>

        <Button className="w-full h-14 mt-6 bg-primary hover:bg-primary/90 text-primary-foreground text-base font-bold rounded-xl shadow-lg shadow-primary/25">
          Procéder au paiement
        </Button>
      </motion.div>
    </div>
  );
}
