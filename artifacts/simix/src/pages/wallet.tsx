import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import {
  useGetWallet, getGetWalletQueryKey,
  useListPaymentMethods, getListPaymentMethodsQueryKey,
  useRechargeWallet, getGetMeQueryKey,
  useListTransactions, getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle2, Shield, Loader2, CreditCard, ChevronRight, Edit3, X } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
/* ─── Operator instructions map ─── */
const OPERATOR_INSTRUCTIONS: Record<string, (amount: number, phone: string) => string[]> = {
  orange_money: (a, p) => [
    `Composez *144# depuis le numéro ${p || "Orange enregistré"}`,
    "Sélectionnez « 1 » → Paiement",
    `Entrez le montant : ${a.toLocaleString("fr-FR")} FCFA`,
    "Validez avec votre code secret Orange Money",
  ],
  mtn_money: (a, p) => [
    `Une notification MoMo arrive sur ${p || "votre téléphone MTN"}`,
    "Entrez votre code PIN MTN MoMo à 4 chiffres",
    `Confirmez le paiement de ${a.toLocaleString("fr-FR")} FCFA`,
    "Conservez votre SMS de confirmation",
  ],
  wave: (a, _p) => [
    "Ouvrez l'application Wave sur votre téléphone",
    "Allez dans « Mes demandes de paiement »",
    `Acceptez la demande de ${a.toLocaleString("fr-FR")} FCFA`,
    "Vous recevrez un SMS de confirmation",
  ],
  moov_money: (a, p) => [
    `Composez *155# depuis le numéro ${p || "Moov enregistré"}`,
    "Choisissez « Payer une facture »",
    `Montant : ${a.toLocaleString("fr-FR")} FCFA`,
    "Validez avec votre PIN Moov Money",
  ],
  mpesa: (a, p) => [
    `Notification M-Pesa envoyée sur ${p || "votre téléphone"}`,
    "Entrez votre PIN M-Pesa à 4 chiffres",
    `Confirmez le paiement de ${a.toLocaleString("fr-FR")} FCFA`,
    "SMS de confirmation M-Pesa reçu immédiatement",
  ],
  airtel_money: (a, p) => [
    `Composez *185# depuis ${p || "votre Airtel"}`,
    "Sélectionnez « Make Payment »",
    `Entrez ${a.toLocaleString("fr-FR")} FCFA`,
    "Confirmez avec votre PIN Airtel Money",
  ],
  free_money: (a, p) => [
    `Composez *555# depuis ${p || "votre Free"}`,
    "Choisissez « Paiement »",
    `Montant : ${a.toLocaleString("fr-FR")} FCFA`,
    "Validez avec votre code Free Money",
  ],
  zamtel: (a, _p) => [
    "Ouvrez votre app Zamtel Kwacha",
    `Confirmez le paiement de ${a.toLocaleString("fr-FR")} FCFA`,
    "Entrez votre PIN Zamtel",
  ],
};

function getInstructions(slug: string, amount: number, phone: string): string[] {
  const fn = OPERATOR_INSTRUCTIONS[slug];
  if (fn) return fn(amount, phone);
  return [
    "Suivez les instructions sur votre téléphone",
    `Confirmez le paiement de ${amount.toLocaleString("fr-FR")} FCFA`,
    "Conservez votre SMS de confirmation",
  ];
}

/* ─── Logo component for operator ─── */
function MethodLogo({
  method, size = 36,
}: {
  method: { name: string; color: string; logoUrl?: string | null };
  size?: number;
}) {
  const [err, setErr] = useState(false);
  if (method.logoUrl && !err) {
    return (
      <img
        src={method.logoUrl}
        alt={method.name}
        onError={() => setErr(true)}
        className="object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = method.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-xl flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, backgroundColor: method.color, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

/* ─── Payment Instructions Overlay ─── */
function InstructionsOverlay({
  method,
  amount,
  phone,
  onConfirm,
  onCancel,
  isPending,
}: {
  method: { name: string; color: string; logoUrl?: string | null; slug: string };
  amount: number;
  phone: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const instructions = getInstructions(method.slug, amount, phone);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
    >
      <motion.div
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="w-full max-w-md bg-card rounded-t-3xl border-t border-x border-card-border overflow-hidden"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-600" />
        </div>

        {/* Header */}
        <div className="px-6 pb-4 pt-3 border-b border-card-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${method.color}20` }}>
                <MethodLogo method={method} size={28} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Paiement via</p>
                <p className="text-sm font-bold text-foreground">{method.name}</p>
              </div>
            </div>
            <button onClick={onCancel} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Amount highlight */}
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-5 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Montant à payer</p>
            <p className="text-3xl font-black text-primary">{formatFCFA(amount)}</p>
          </div>

          {/* Instructions */}
          <p className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-black">?</span>
            Comment payer
          </p>
          <div className="space-y-2.5 mb-6">
            {instructions.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: method.color }}
                >
                  {i + 1}
                </div>
                <p className="text-sm text-foreground leading-relaxed">{step}</p>
              </motion.div>
            ))}
          </div>

          {/* Confirm button */}
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="w-full h-14 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-opacity disabled:opacity-70"
            style={{ background: `linear-gradient(135deg, ${method.color}, ${method.color}cc)` }}
          >
            {isPending ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Vérification en cours…</>
            ) : (
              <><CheckCircle2 className="w-5 h-5" /> J'ai confirmé le paiement</>
            )}
          </button>

          <p className="text-center text-[11px] text-muted-foreground mt-3 flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" /> Paiement sécurisé • En attente de confirmation
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Success Overlay ─── */
function SuccessOverlay({ amount }: { amount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.9)" }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20 }}
        className="text-center px-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", damping: 14 }}
          className="w-24 h-24 rounded-full bg-emerald-500/20 border-4 border-emerald-500 flex items-center justify-center mx-auto mb-5"
        >
          <CheckCircle2 className="w-12 h-12 text-emerald-400" />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <p className="text-2xl font-black text-white mb-2">Paiement reçu !</p>
          <p className="text-emerald-400 font-bold text-xl mb-1">{formatFCFA(amount)}</p>
          <p className="text-muted-foreground text-sm">Votre solde a été crédité</p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function Wallet() {
  return (
    <AuthGuard>
      <AppLayout showBottomNav={false}>
        <WalletContent />
      </AppLayout>
    </AuthGuard>
  );
}

const PRESETS = [500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];

type FlowState = "select" | "instructions" | "success";

function WalletContent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rechargeMutation = useRechargeWallet();

  const { data: wallet, isLoading: loadingWallet } = useGetWallet({ query: { queryKey: getGetWalletQueryKey() } });
  const { data: paymentMethods, isLoading: loadingMethods } = useListPaymentMethods({ query: { queryKey: getListPaymentMethodsQueryKey() } });

  const [amount, setAmount] = useState<number>(2000);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string>("orange_money");
  const [phone, setPhone] = useState("");
  const [flowState, setFlowState] = useState<FlowState>("select");
  const customInputRef = useRef<HTMLInputElement>(null);

  const selectedMethod = paymentMethods?.find(m => m.slug === selectedSlug) ?? paymentMethods?.[0];

  function handlePreset(v: number) {
    setAmount(v);
    setCustomAmount("");
    setShowCustom(false);
  }

  function handleCustomChange(v: string) {
    const num = v.replace(/\D/g, "");
    setCustomAmount(num);
    if (num && Number(num) >= 100) setAmount(Number(num));
  }

  function handleShowCustom() {
    setShowCustom(true);
    setTimeout(() => customInputRef.current?.focus(), 50);
  }

  async function handlePay() {
    if (!selectedMethod) return;
    setFlowState("instructions");
  }

  async function handleConfirm() {
    try {
      await rechargeMutation.mutateAsync({ data: { amount, methodSlug: selectedSlug } });
      setFlowState("success");
      queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      setTimeout(() => setLocation("/dashboard"), 2000);
    } catch (e: unknown) {
      setFlowState("select");
      toast({ variant: "destructive", title: "Erreur", description: (e as Error).message || "Erreur de paiement" });
    }
  }

  const isMobileMoney = selectedMethod ? !["card", "bank_transfer"].includes(selectedMethod.slug) : true;

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pb-32 relative">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-card-border/40 px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center text-foreground hover:bg-secondary transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-base font-bold text-foreground">Recharger mon compte</h1>
          {/* Balance pill */}
          <div className="bg-card border border-card-border rounded-xl px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-bold text-foreground">
              {loadingWallet ? "..." : formatFCFA(wallet?.balance ?? 0)}
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 pt-5 space-y-7">
        {/* ── SECTION 1: Amount ── */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Montant à recharger</p>

          {/* Big amount display */}
          <div className="text-center py-4 mb-4 relative">
            <motion.div key={amount} initial={{ scale: 0.95, opacity: 0.7 }} animate={{ scale: 1, opacity: 1 }}>
              <span className="text-5xl font-black text-foreground tabular-nums">
                {amount.toLocaleString("fr-FR")}
              </span>
              <span className="text-xl font-bold text-muted-foreground ml-2">FCFA</span>
            </motion.div>
            {amount >= 100 && (
              <p className="text-xs text-muted-foreground mt-1">
                ≈ {(amount / 655.957).toFixed(2)} € · {(amount / 615).toFixed(2)} $
              </p>
            )}
          </div>

          {/* Presets grid */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {PRESETS.map((v) => {
              const isSelected = amount === v && !showCustom;
              return (
                <button
                  key={v}
                  onClick={() => handlePreset(v)}
                  className={`h-11 rounded-xl border text-sm font-bold transition-all relative overflow-hidden ${
                    isSelected
                      ? "bg-primary text-white border-primary shadow-md shadow-primary/25"
                      : "bg-card border-card-border text-foreground hover:bg-secondary/80"
                  }`}
                >
                  {v === 1000 && !isSelected && (
                    <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[7px] font-black text-primary uppercase tracking-tight">Populaire</span>
                  )}
                  {v >= 1000 ? `${v / 1000}K` : v}
                </button>
              );
            })}
            {/* Custom */}
            <button
              onClick={handleShowCustom}
              className={`h-11 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                showCustom
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-card-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" /> Autre
            </button>
          </div>

          {/* Custom input */}
          <AnimatePresence>
            {showCustom && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="relative mb-2">
                  <input
                    ref={customInputRef}
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={customAmount}
                    onChange={e => handleCustomChange(e.target.value)}
                    placeholder="Montant personnalisé (min 100 FCFA)"
                    className="w-full h-12 rounded-xl bg-card border border-primary/50 focus:border-primary pl-4 pr-16 text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:font-normal placeholder:text-muted-foreground"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">FCFA</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ── SECTION 2: Payment Method ── */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Mode de paiement</p>

          {loadingMethods ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="min-w-[120px] h-28 bg-card border border-card-border rounded-2xl animate-pulse flex-shrink-0" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 snap-x hide-scrollbar">
              {paymentMethods?.map(method => {
                const isSelected = selectedSlug === method.slug;
                return (
                  <button
                    key={method.slug}
                    onClick={() => setSelectedSlug(method.slug)}
                    className={`relative flex-shrink-0 min-w-[120px] max-w-[140px] p-4 rounded-2xl border snap-start transition-all active:scale-95 text-left ${
                      isSelected
                        ? "border-primary/60 shadow-lg"
                        : "bg-card border-card-border hover:bg-secondary/60"
                    }`}
                    style={isSelected ? { backgroundColor: `${method.color}12`, borderColor: `${method.color}50` } : {}}
                  >
                    {isSelected && (
                      <div
                        className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: method.color }}
                      >
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                    <div className="mb-3">
                      <MethodLogo method={method} size={38} />
                    </div>
                    <p className="text-xs font-bold text-foreground leading-snug">{method.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{method.description}</p>
                  </button>
                );
              })}
            </div>
          )}
        </motion.section>

        {/* ── SECTION 3: Phone number (mobile money only) ── */}
        <AnimatePresence>
          {isMobileMoney && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Numéro {selectedMethod?.name ?? "Mobile Money"}
              </p>
              <div className="relative">
                <div
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: selectedMethod ? `${selectedMethod.color}20` : "#7C3AED20" }}
                >
                  {selectedMethod
                    ? <MethodLogo method={selectedMethod} size={20} />
                    : <CreditCard className="w-4 h-4 text-primary" />
                  }
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="Ex : 07 00 00 00 00"
                  className="w-full h-14 rounded-2xl bg-card border border-card-border focus:border-primary pl-16 pr-4 text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:font-normal placeholder:text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 pl-1">
                📱 Entrez le numéro associé à votre compte {selectedMethod?.name}
              </p>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── SECTION 4: Summary ── */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-bold text-foreground mb-4">Récapitulatif</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Montant</span>
                <span className="font-bold text-foreground">{formatFCFA(amount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Méthode</span>
                <div className="flex items-center gap-2">
                  {selectedMethod && <MethodLogo method={selectedMethod} size={18} />}
                  <span className="font-bold text-foreground text-xs">{selectedMethod?.name ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Frais de service</span>
                <span className="font-bold text-emerald-500">Gratuit</span>
              </div>
              <div className="border-t border-card-border pt-3 flex items-center justify-between">
                <span className="font-bold text-foreground">Total</span>
                <span className="font-black text-lg text-primary">{formatFCFA(amount)}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
            <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <p className="text-xs text-foreground font-medium">Paiement 100% sécurisé · Aucune carte requise</p>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
          </div>
        </motion.section>
      </div>

      {/* ── Fixed bottom CTA ── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-5 bg-background/95 backdrop-blur-xl border-t border-card-border z-30">
        <button
          onClick={handlePay}
          disabled={amount < 100 || !selectedMethod || rechargeMutation.isPending}
          className="w-full h-14 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 transition-all shadow-xl disabled:opacity-50"
          style={selectedMethod
            ? { background: `linear-gradient(135deg, ${selectedMethod.color}, ${selectedMethod.color}bb)` }
            : { background: "linear-gradient(135deg, #7C3AED, #6D28D9)" }
          }
        >
          🔒 Payer {formatFCFA(amount)} →
        </button>
      </div>

      {/* ── Overlays ── */}
      <AnimatePresence>
        {flowState === "instructions" && selectedMethod && (
          <InstructionsOverlay
            method={selectedMethod}
            amount={amount}
            phone={phone}
            onConfirm={handleConfirm}
            onCancel={() => setFlowState("select")}
            isPending={rechargeMutation.isPending}
          />
        )}
        {flowState === "success" && <SuccessOverlay amount={amount} />}
      </AnimatePresence>
    </div>
  );
}
