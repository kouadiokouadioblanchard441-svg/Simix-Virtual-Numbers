import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import {
  useGetWallet, getGetWalletQueryKey,
  useRechargeWallet, getGetMeQueryKey,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, CheckCircle2, Shield, Loader2,
  ChevronDown, ChevronUp, Search, X, AlertCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";

/* ─── Types ─── */
interface DepositCountry {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  popular: boolean;
}

interface DepositMethod {
  id: string;
  slug: string;
  name: string;
  color: string;
  logoUrl?: string | null;
  description: string;
  recommended: boolean;
  minDeposit: number;
  feePercent: number;
}

/* ─── API helpers ─── */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchDepositCountries(): Promise<DepositCountry[]> {
  const res = await fetch(`${BASE}/api/wallet/deposit-countries`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les pays");
  return res.json();
}

async function fetchMethodsForCountry(countryCode: string): Promise<DepositMethod[]> {
  const res = await fetch(`${BASE}/api/wallet/payment-methods?countryCode=${countryCode}`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les méthodes");
  return res.json();
}

/* ─── Operator instructions map ─── */
const OPERATOR_INSTRUCTIONS: Record<string, (amount: number, phone: string, dialCode: string) => string[]> = {
  orange_money: (a, p, d) => [
    `Composez *144# depuis le numéro ${p ? `${d} ${p}` : "Orange enregistré"}`,
    "Sélectionnez « 1 » → Paiement",
    `Entrez le montant : ${a.toLocaleString("fr-FR")} FCFA`,
    "Validez avec votre code secret Orange Money",
  ],
  mtn_money: (a, p, d) => [
    `Une notification MoMo arrive sur ${p ? `${d} ${p}` : "votre téléphone MTN"}`,
    "Entrez votre code PIN MTN MoMo à 4 chiffres",
    `Confirmez le paiement de ${a.toLocaleString("fr-FR")} FCFA`,
    "Conservez votre SMS de confirmation",
  ],
  wave: (a) => [
    "Ouvrez l'application Wave sur votre téléphone",
    "Allez dans « Mes demandes de paiement »",
    `Acceptez la demande de ${a.toLocaleString("fr-FR")} FCFA`,
    "Vous recevrez un SMS de confirmation",
  ],
  moov_money: (a, p, d) => [
    `Composez *155# depuis le numéro ${p ? `${d} ${p}` : "Moov enregistré"}`,
    "Choisissez « Payer une facture »",
    `Montant : ${a.toLocaleString("fr-FR")} FCFA`,
    "Validez avec votre PIN Moov Money",
  ],
  free_money: (a, p, d) => [
    `Composez *555# depuis ${p ? `${d} ${p}` : "votre Free"}`,
    "Choisissez « Paiement »",
    `Montant : ${a.toLocaleString("fr-FR")} FCFA`,
    "Validez avec votre code Free Money",
  ],
  mpesa: (a, p, d) => [
    `Notification M-Pesa envoyée sur ${p ? `${d} ${p}` : "votre téléphone"}`,
    "Entrez votre PIN M-Pesa à 4 chiffres",
    `Confirmez le paiement de ${a.toLocaleString("fr-FR")} FCFA`,
    "SMS de confirmation M-Pesa reçu immédiatement",
  ],
  airtel_money: (a, p, d) => [
    `Composez *185# depuis ${p ? `${d} ${p}` : "votre Airtel"}`,
    "Sélectionnez « Make Payment »",
    `Entrez ${a.toLocaleString("fr-FR")} FCFA`,
    "Confirmez avec votre PIN Airtel Money",
  ],
};

function getInstructions(slug: string, amount: number, phone: string, dialCode: string): string[] {
  const fn = OPERATOR_INSTRUCTIONS[slug];
  if (fn) return fn(amount, phone, dialCode);
  return [
    "Validez le paiement dans les 1-2 minutes après réception du SMS",
    "Entrez votre code secret et validez",
    `Confirmez le paiement de ${amount.toLocaleString("fr-FR")} FCFA`,
    "Conservez votre SMS de confirmation",
  ];
}

/* ─── Flag image component ─── */
function FlagImg({ code, size = 24 }: { code: string; size?: number }) {
  const [err, setErr] = useState(false);
  const lower = code.toLowerCase();
  if (err) {
    return (
      <span className="text-base leading-none" style={{ fontSize: size * 0.75 }}>🏳</span>
    );
  }
  return (
    <img
      src={`https://flagcdn.com/${Math.round(size * 1.33)}x${size}.${lower}.png`}
      srcSet={`https://flagcdn.com/${Math.round(size * 2.66)}x${size * 2}.${lower}.png 2x`}
      alt={lower}
      width={Math.round(size * 1.33)}
      height={size}
      className="object-cover rounded-sm flex-shrink-0"
      onError={() => setErr(true)}
      style={{ minWidth: Math.round(size * 1.33) }}
    />
  );
}

/* ─── Operator logo ─── */
function MethodLogo({ method, size = 44 }: { method: Pick<DepositMethod, "name" | "color" | "logoUrl">; size?: number }) {
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

/* ─── Country Dropdown ─── */
function CountryDropdown({
  countries,
  selected,
  onSelect,
}: {
  countries: DepositCountry[];
  selected: DepositCountry | null;
  onSelect: (c: DepositCountry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = countries.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-card border border-card-border rounded-xl text-sm transition-colors hover:bg-secondary/60 focus:outline-none focus:border-primary"
      >
        {selected ? (
          <div className="flex items-center gap-3 min-w-0">
            <FlagImg code={selected.code} size={20} />
            <span className="font-semibold text-foreground truncate">{selected.name}</span>
            <span className="text-muted-foreground text-xs font-mono flex-shrink-0">{selected.dialCode}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">Sélectionnez votre pays</span>
        )}
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        }
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-card-border rounded-xl shadow-2xl shadow-black/30 overflow-hidden"
          >
            {/* Search */}
            <div className="p-3 border-b border-card-border/60">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-card-border/60 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-56">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun pays trouvé</div>
              ) : (
                filtered.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { onSelect(c); setOpen(false); setSearch(""); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-secondary/60 ${selected?.code === c.code ? "bg-primary/10" : ""}`}
                  >
                    <FlagImg code={c.code} size={20} />
                    <span className="flex-1 font-medium text-foreground">{c.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{c.dialCode}</span>
                    {c.popular && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-semibold">Pop.</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Method Grid ─── */
function MethodGrid({
  methods,
  selected,
  onSelect,
}: {
  methods: DepositMethod[];
  selected: DepositMethod | null;
  onSelect: (m: DepositMethod) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {methods.map(m => {
        const isSelected = selected?.slug === m.slug;
        return (
          <button
            key={m.slug}
            type="button"
            onClick={() => onSelect(m)}
            className={`relative flex flex-col items-center gap-2.5 p-4 rounded-2xl border transition-all active:scale-95 ${
              isSelected
                ? "shadow-lg"
                : "bg-card border-card-border hover:bg-secondary/60"
            }`}
            style={isSelected ? { backgroundColor: `${m.color}15`, borderColor: `${m.color}60` } : {}}
          >
            {isSelected && (
              <div
                className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center shadow-sm"
                style={{ backgroundColor: m.color }}
              >
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <MethodLogo method={m} size={48} />
            <span className="text-sm font-bold text-foreground text-center leading-tight">{m.name}</span>
            {m.recommended && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">Recommandé</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Success Overlay ─── */
function SuccessOverlay({ amount }: { amount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
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
          <p className="text-2xl font-black text-white mb-2">Paiement reçu</p>
          <p className="text-emerald-400 font-bold text-xl mb-1">{formatFCFA(amount)}</p>
          <p className="text-muted-foreground text-sm">Votre solde a été crédité</p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Main export ─── */
export default function Wallet() {
  return (
    <AuthGuard>
      <AppLayout showBottomNav={false}>
        <DepositContent />
      </AppLayout>
    </AuthGuard>
  );
}

/* ─── Deposit Content ─── */
function DepositContent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rechargeMutation = useRechargeWallet();

  /* State */
  const [selectedCountry, setSelectedCountry] = useState<DepositCountry | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<DepositMethod | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /* Data */
  const { data: wallet, isLoading: loadingWallet } = useGetWallet({ query: { queryKey: getGetWalletQueryKey() } });

  const { data: countries = [], isLoading: loadingCountries } = useQuery({
    queryKey: ["deposit-countries"],
    queryFn: fetchDepositCountries,
  });

  const { data: methods = [], isLoading: loadingMethods } = useQuery({
    queryKey: ["deposit-methods", selectedCountry?.code],
    queryFn: () => fetchMethodsForCountry(selectedCountry!.code),
    enabled: !!selectedCountry,
  });

  /* Reset method when country changes */
  const prevCountry = useRef<string | null>(null);
  useEffect(() => {
    if (selectedCountry?.code !== prevCountry.current) {
      setSelectedMethod(null);
      prevCountry.current = selectedCountry?.code ?? null;
    }
  }, [selectedCountry]);

  /* Computed */
  const parsedAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;
  const feePercent = selectedMethod?.feePercent ?? 0;
  const feeAmount = Math.round(parsedAmount * feePercent / 100);
  const totalAmount = parsedAmount + feeAmount;
  const minDeposit = selectedMethod?.minDeposit ?? 500;
  const amountValid = parsedAmount >= minDeposit;
  const canConfirm = !!selectedCountry && !!selectedMethod && phone.length >= 6 && amountValid && !confirming;

  const dialCode = selectedCountry?.dialCode ?? "";

  async function handleConfirm() {
    if (!canConfirm || !selectedMethod) return;
    setConfirming(true);
    try {
      await rechargeMutation.mutateAsync({ data: { amount: parsedAmount, methodSlug: selectedMethod.slug } });
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      setTimeout(() => setLocation("/dashboard"), 2200);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Erreur", description: (e as Error).message || "Erreur de paiement" });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pb-32 relative">
      {showSuccess && <SuccessOverlay amount={parsedAmount} />}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-card-border/40 px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center text-foreground hover:bg-secondary transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-base font-bold text-foreground">Déposer de l'argent</h1>
          <div className="bg-card border border-card-border rounded-xl px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-bold text-foreground">
              {loadingWallet ? "…" : formatFCFA(wallet?.balance ?? 0)}
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 pt-6 space-y-7">

        {/* ── ÉTAPE 1 : Pays ── */}
        <section>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Sélectionnez votre pays
          </p>
          {loadingCountries ? (
            <div className="h-14 bg-card border border-card-border rounded-xl animate-pulse" />
          ) : countries.length === 0 ? (
            <div className="flex items-center gap-2 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Aucun pays configuré. Contactez l'administrateur.
            </div>
          ) : (
            <CountryDropdown countries={countries} selected={selectedCountry} onSelect={setSelectedCountry} />
          )}
        </section>

        {/* ── ÉTAPE 2 : Méthode de paiement ── */}
        <AnimatePresence>
          {selectedCountry && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Sélectionnez votre moyen de recharge
              </p>

              {loadingMethods ? (
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="h-28 bg-card border border-card-border rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : methods.length === 0 ? (
                <div className="flex items-center gap-2 p-4 bg-zinc-800/60 border border-card-border rounded-xl text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Aucune méthode de paiement disponible pour ce pays.
                </div>
              ) : (
                <MethodGrid methods={methods} selected={selectedMethod} onSelect={setSelectedMethod} />
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── ÉTAPE 3 : Formulaire + résumé ── */}
        <AnimatePresence>
          {selectedMethod && (
            <motion.section
              key={selectedMethod.slug}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="space-y-4"
            >
              {/* Phone */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Numéro de téléphone
                </p>
                <div className="flex gap-0 rounded-xl overflow-hidden border border-card-border bg-card focus-within:border-primary transition-colors">
                  <div className="flex items-center gap-2 px-3 py-3.5 bg-secondary/40 border-r border-card-border flex-shrink-0">
                    <FlagImg code={selectedCountry!.code} size={18} />
                    <span className="text-sm font-bold text-foreground font-mono">{dialCode}</span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    placeholder="07 00 00 00 00"
                    className="flex-1 px-4 py-3.5 text-sm font-semibold text-foreground bg-transparent focus:outline-none placeholder:font-normal placeholder:text-muted-foreground"
                  />
                  {phone && (
                    <button onClick={() => setPhone("")} className="pr-3 text-muted-foreground hover:text-foreground transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Amount */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Montant
                </p>
                <div className="flex gap-0 rounded-xl overflow-hidden border border-card-border bg-card focus-within:border-primary transition-colors">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={e => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder={String(minDeposit)}
                    className="flex-1 px-4 py-3.5 text-sm font-semibold text-foreground bg-transparent focus:outline-none placeholder:font-normal placeholder:text-muted-foreground"
                  />
                  <div className="flex items-center px-4 bg-secondary/40 border-l border-card-border flex-shrink-0">
                    <span className="text-sm font-bold text-muted-foreground">F CFA</span>
                  </div>
                </div>
                {parsedAmount > 0 && parsedAmount < minDeposit && (
                  <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Minimum : {minDeposit.toLocaleString("fr-FR")} FCFA
                  </p>
                )}
              </div>

              {/* Summary */}
              {parsedAmount > 0 && amountValid && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-card border border-card-border rounded-2xl overflow-hidden"
                >
                  <div className="divide-y divide-card-border/50">
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="text-muted-foreground">Montant</span>
                      <span className="font-semibold text-foreground">{parsedAmount.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="text-muted-foreground">Frais ({feePercent}%)</span>
                      <span className="font-semibold text-foreground">
                        {feeAmount === 0 ? <span className="text-emerald-500">Gratuit</span> : `${feeAmount.toLocaleString("fr-FR")} FCFA`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 text-sm font-bold">
                      <span className="text-foreground">Total</span>
                      <span className="text-foreground">{totalAmount.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="text-muted-foreground">Vous serez débité</span>
                      <span className="font-bold text-primary">{totalAmount.toLocaleString("fr-FR")} XOF</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Instructions */}
              {parsedAmount > 0 && amountValid && phone.length >= 6 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-secondary/40 border border-card-border/60 rounded-2xl p-4"
                >
                  <p className="text-xs font-bold text-foreground uppercase tracking-wide mb-3">
                    Avant de payer, suivez ces étapes :
                  </p>
                  <div className="space-y-2.5">
                    {getInstructions(selectedMethod.slug, parsedAmount, phone, dialCode).map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: selectedMethod.color }}
                        >
                          {i + 1}
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {/* ── Fixed bottom actions ── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 pb-6 pt-4 bg-background/95 backdrop-blur-sm border-t border-card-border/40 space-y-3 z-30">
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="w-full h-14 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all"
          style={{
            background: canConfirm
              ? `linear-gradient(135deg, ${selectedMethod?.color ?? "#7C3AED"}, ${selectedMethod?.color ?? "#7C3AED"}cc)`
              : undefined,
            backgroundColor: canConfirm ? undefined : "rgb(63 63 70)",
            opacity: canConfirm ? 1 : 0.5,
          }}
        >
          {confirming ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Vérification en cours…</>
          ) : (
            <><CheckCircle2 className="w-5 h-5" /> Confirmer</>
          )}
        </button>
        <button
          onClick={() => window.history.back()}
          className="w-full h-12 rounded-2xl bg-transparent border border-card-border text-foreground font-semibold text-sm transition-colors hover:bg-secondary"
        >
          Annuler
        </button>
        <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
          <Shield className="w-3 h-3" /> Transaction sécurisée SSL
        </p>
      </div>
    </div>
  );
}
