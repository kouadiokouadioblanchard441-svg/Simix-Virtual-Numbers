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
  ChevronDown, Search, X, AlertCircle, Clock,
  Zap, Star, ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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

/* ─── Flag emoji from ISO code ─── */
function flagEmoji(code: string): string {
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  );
}

/* ─── Flag image component (CDN + emoji fallback) ─── */
function FlagImg({ code, size = 20 }: { code: string; size?: number }) {
  const [err, setErr] = useState(false);
  const lower = code.toLowerCase();
  if (err) {
    return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{flagEmoji(code)}</span>;
  }
  return (
    <img
      src={`https://flagcdn.com/${Math.round(size * 1.5)}x${size}.${lower}.png`}
      alt={lower}
      width={Math.round(size * 1.5)}
      height={size}
      className="rounded-[3px] object-cover flex-shrink-0"
      onError={() => setErr(true)}
      style={{ minWidth: Math.round(size * 1.5), maxHeight: size }}
    />
  );
}

/* ─── Operator logo ─── */
function MethodLogo({ method, size = 40 }: { method: Pick<DepositMethod, "name" | "color" | "logoUrl" | "slug">; size?: number }) {
  const [err, setErr] = useState(false);

  if (method.logoUrl && !err) {
    return (
      <div
        className="flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: `${method.color}22` }}
      >
        <img
          src={method.logoUrl}
          alt={method.name}
          onError={() => setErr(true)}
          className="object-contain"
          style={{ width: size * 0.85, height: size * 0.85 }}
        />
      </div>
    );
  }

  const BUILTIN: Record<string, { label: string; label2?: string }> = {
    orange_money: { label: "OM", label2: "Money" },
    mtn_money: { label: "MTN", label2: "MoMo" },
    wave: { label: "~", label2: "wave" },
    moov_money: { label: "M", label2: "Moov" },
    free_money: { label: "FM" },
    mpesa: { label: "M-P", label2: "esa" },
    airtel_money: { label: "Air", label2: "tel" },
  };
  const builtin = BUILTIN[method.slug];
  const initials = builtin?.label ?? method.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div
      className="flex flex-col items-center justify-center flex-shrink-0 shadow-sm"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: method.color }}
    >
      <span className="text-white font-black leading-none" style={{ fontSize: size * 0.32 }}>{initials}</span>
      {builtin?.label2 && (
        <span className="text-white/80 font-semibold leading-none" style={{ fontSize: size * 0.22 }}>{builtin.label2}</span>
      )}
    </div>
  );
}

/* ─── Country Selector (bottom-sheet style on mobile) ─── */
function CountrySelector({
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const popular = countries.filter(c => c.popular);
  const rest = countries.filter(c => !c.popular);
  const filtered = search.trim()
    ? countries.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.dialCode.includes(search)
      )
    : null;

  function handleSelect(c: DepositCountry) {
    onSelect(c);
    setOpen(false);
    setSearch("");
  }

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left",
          selected
            ? "border-primary/40 bg-primary/5"
            : "border-card-border bg-card hover:border-primary/30"
        )}
      >
        {selected ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <FlagImg code={selected.code} size={18} />
            <span className="font-semibold text-foreground text-sm truncate">{selected.name}</span>
            <span className="text-muted-foreground text-xs font-mono flex-shrink-0 bg-secondary/60 px-1.5 py-0.5 rounded-md">{selected.dialCode}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="text-lg">🌍</span>
            <span>Sélectionnez votre pays</span>
          </div>
        )}
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>

      {/* Bottom sheet overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end"
            style={{ background: "rgba(0,0,0,0.75)" }}
            onClick={() => { setOpen(false); setSearch(""); }}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="w-full max-w-md mx-auto bg-background rounded-t-3xl overflow-hidden flex flex-col"
              style={{ maxHeight: "85vh" }}
              onClick={e => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 bg-muted-foreground/25 rounded-full" />
              </div>

              {/* Header */}
              <div className="px-5 pb-3 flex-shrink-0">
                <h3 className="text-base font-bold text-foreground mb-3">Choisissez votre pays</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher un pays..."
                    className="w-full pl-9 pr-9 py-2.5 text-sm bg-card border border-card-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto pb-6">
                {filtered ? (
                  filtered.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">Aucun pays trouvé</div>
                  ) : (
                    <div className="px-3 space-y-0.5">
                      {filtered.map(c => (
                        <CountryRow key={c.code} country={c} selected={selected} onSelect={handleSelect} />
                      ))}
                    </div>
                  )
                ) : (
                  <>
                    {popular.length > 0 && (
                      <div className="px-5 mb-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">⭐ Populaires</p>
                        <div className="grid grid-cols-2 gap-2">
                          {popular.map(c => (
                            <button
                              key={c.code}
                              onClick={() => handleSelect(c)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all text-left",
                                selected?.code === c.code
                                  ? "border-primary/50 bg-primary/8 text-primary"
                                  : "border-card-border bg-card hover:bg-secondary/50 text-foreground"
                              )}
                            >
                              <FlagImg code={c.code} size={16} />
                              <span className="font-medium truncate">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {rest.length > 0 && (
                      <div className="px-3 mt-3">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 px-2">Tous les pays</p>
                        <div className="space-y-0.5">
                          {rest.map(c => (
                            <CountryRow key={c.code} country={c} selected={selected} onSelect={handleSelect} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function CountryRow({ country, selected, onSelect }: { country: DepositCountry; selected: DepositCountry | null; onSelect: (c: DepositCountry) => void }) {
  const isSelected = selected?.code === country.code;
  return (
    <button
      type="button"
      onClick={() => onSelect(country)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm",
        isSelected ? "bg-primary/10 text-primary" : "hover:bg-secondary/60 text-foreground"
      )}
    >
      <FlagImg code={country.code} size={18} />
      <span className="flex-1 font-medium text-left">{country.name}</span>
      <span className="text-xs text-muted-foreground font-mono">{country.dialCode}</span>
      {isSelected && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
    </button>
  );
}

/* ─── Operator List (compact horizontal cards) ─── */
function OperatorList({
  methods,
  selected,
  onSelect,
}: {
  methods: DepositMethod[];
  selected: DepositMethod | null;
  onSelect: (m: DepositMethod) => void;
}) {
  return (
    <div className="space-y-2">
      {methods.map(m => {
        const isSelected = selected?.slug === m.slug;
        return (
          <motion.button
            key={m.slug}
            type="button"
            onClick={() => onSelect(m)}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border-2 transition-all text-left overflow-hidden relative",
              isSelected
                ? "shadow-lg"
                : "bg-card border-card-border hover:border-primary/20 hover:bg-secondary/30"
            )}
            style={isSelected ? {
              backgroundColor: `${m.color}10`,
              borderColor: `${m.color}60`,
              boxShadow: `0 4px 20px ${m.color}20`,
            } : {}}
          >
            {/* Colored glow when selected */}
            {isSelected && (
              <div
                className="absolute -right-8 -top-8 w-20 h-20 rounded-full blur-2xl opacity-20 pointer-events-none"
                style={{ backgroundColor: m.color }}
              />
            )}

            <MethodLogo method={m} size={42} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("text-sm font-bold", isSelected ? "text-foreground" : "text-foreground")}>{m.name}</span>
                {m.recommended && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full font-semibold border border-amber-500/15 flex-shrink-0">
                    <Star className="w-2.5 h-2.5" /> Top
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {m.description && (
                  <span className="text-[11px] text-muted-foreground truncate">{m.description}</span>
                )}
                {m.minDeposit > 0 && (
                  <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">
                    Min {m.minDeposit >= 1000 ? `${m.minDeposit / 1000}k` : m.minDeposit} F
                  </span>
                )}
                {m.feePercent > 0 && (
                  <span className="text-[11px] text-amber-400/80 flex-shrink-0">+{m.feePercent}% frais</span>
                )}
                {m.feePercent === 0 && (
                  <span className="text-[11px] text-emerald-400/80 flex-shrink-0">Sans frais</span>
                )}
              </div>
            </div>

            <div className="flex-shrink-0">
              {isSelected ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: m.color }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                </motion.div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-card-border" />
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

/* ─── Step Indicator ─── */
function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Pays" },
    { n: 2, label: "Opérateur" },
    { n: 3, label: "Montant" },
  ];
  return (
    <div className="flex items-center gap-0 w-full mt-4">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1">
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-semibold transition-all",
            step >= s.n ? "text-primary" : "text-muted-foreground/40"
          )}>
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all",
              step > s.n ? "bg-primary text-white" : step === s.n ? "bg-primary/15 text-primary border border-primary/40" : "bg-card border border-card-border/40 text-muted-foreground/40"
            )}>
              {step > s.n ? <CheckCircle2 className="w-3 h-3" /> : s.n}
            </div>
            <span className="hidden sm:block">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("flex-1 h-[2px] mx-2 rounded-full transition-all", step > s.n ? "bg-primary" : "bg-card-border/40")} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Quick amount presets ─── */
const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 25000];

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
          <p className="text-2xl font-black text-white mb-2">Paiement reçu !</p>
          <p className="text-emerald-400 font-bold text-xl mb-1">{formatFCFA(amount)}</p>
          <p className="text-muted-foreground text-sm">Votre solde a été crédité avec succès</p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Pending Overlay ─── */
function PendingOverlay({
  amount,
  methodName,
  methodColor,
  onCancel,
  onSuccess,
  onFailed,
  depositId,
}: {
  amount: number;
  methodName: string;
  methodColor: string;
  onCancel: () => void;
  onSuccess: () => void;
  onFailed: () => void;
  depositId: string;
}) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [dots, setDots] = useState(".");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 600);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      while (!stopped) {
        await new Promise(r => setTimeout(r, 4000));
        if (stopped) break;
        try {
          const res = await fetch(`${BASE}/api/wallet/deposit/${depositId}/status`, { credentials: "include" });
          if (!res.ok) continue;
          const data = await res.json() as { status: string };
          if (data.status === "completed") { onSuccess(); return; }
          if (data.status === "failed") { onFailed(); return; }
        } catch { /* ignore */ }
      }
    }
    poll();
    return () => { stopped = true; };
  }, [depositId, BASE, onSuccess, onFailed]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.95)" }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20 }}
        className="text-center w-full max-w-xs"
      >
        <div className="relative w-20 h-20 mx-auto mb-5">
          <div
            className="w-20 h-20 rounded-full border-4 flex items-center justify-center"
            style={{ borderColor: `${methodColor}40`, backgroundColor: `${methodColor}15` }}
          >
            <Clock className="w-8 h-8" style={{ color: methodColor }} />
          </div>
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-transparent"
            style={{ borderTopColor: methodColor }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          />
        </div>

        <p className="text-xl font-black text-white mb-2">En attente{dots}</p>
        <p className="text-sm text-muted-foreground mb-1">
          Validez <span className="font-bold text-white">{formatFCFA(amount)}</span> sur votre téléphone
        </p>
        <p className="text-sm font-medium mb-1" style={{ color: methodColor }}>{methodName}</p>
        <p className="text-xs text-muted-foreground/50 mt-3">Temps écoulé : {timeStr}</p>

        <div className="mt-5 p-4 bg-white/5 border border-white/10 rounded-2xl text-left">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Instructions</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• Vérifiez votre téléphone pour la notification</li>
            <li>• Entrez votre code secret pour confirmer</li>
            <li>• Ne fermez pas cette page</li>
          </ul>
        </div>

        <button onClick={onCancel} className="mt-5 text-xs text-muted-foreground/60 underline underline-offset-2">
          Annuler et revenir
        </button>
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

  const [selectedCountry, setSelectedCountry] = useState<DepositCountry | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<DepositMethod | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pendingDepositId, setPendingDepositId] = useState<string | null>(null);

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

  const prevCountry = useRef<string | null>(null);
  useEffect(() => {
    if (selectedCountry?.code !== prevCountry.current) {
      setSelectedMethod(null);
      prevCountry.current = selectedCountry?.code ?? null;
    }
  }, [selectedCountry]);

  const parsedAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;
  const feePercent = selectedMethod?.feePercent ?? 0;
  const feeAmount = Math.round(parsedAmount * feePercent / 100);
  const totalAmount = parsedAmount + feeAmount;
  const minDeposit = selectedMethod?.minDeposit ?? 500;
  const amountValid = parsedAmount >= minDeposit;
  const canConfirm = !!selectedCountry && !!selectedMethod && phone.length >= 6 && amountValid && !confirming;

  const dialCode = selectedCountry?.dialCode ?? "";

  /* Step indicator */
  const currentStep: 1 | 2 | 3 = !selectedCountry ? 1 : !selectedMethod ? 2 : 3;

  const handleDepositSuccess = useCallback(() => {
    setPendingDepositId(null);
    setShowSuccess(true);
    queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    setTimeout(() => setLocation("/dashboard"), 2500);
  }, [queryClient, setLocation]);

  const handleDepositFailed = useCallback(() => {
    setPendingDepositId(null);
    toast({ variant: "destructive", title: "Paiement échoué", description: "Le paiement n'a pas pu être confirmé. Veuillez réessayer." });
  }, [toast]);

  async function handleConfirm() {
    if (!canConfirm || !selectedMethod || !selectedCountry) return;
    setConfirming(true);
    try {
      const result = await rechargeMutation.mutateAsync({
        data: {
          amount: parsedAmount,
          methodSlug: selectedMethod.slug,
          phoneNumber: phone,
          countryCode: selectedCountry.code,
          dialCode: selectedCountry.dialCode,
        },
      }) as { pending?: boolean; depositId?: string; status?: string };

      if (result.pending && result.depositId) {
        setPendingDepositId(result.depositId);
        return;
      }

      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      setTimeout(() => setLocation("/dashboard"), 2500);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Erreur", description: (e as Error).message || "Erreur de paiement" });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden relative">
      {showSuccess && <SuccessOverlay amount={parsedAmount} />}
      {pendingDepositId && selectedMethod && (
        <PendingOverlay
          amount={parsedAmount}
          methodName={selectedMethod.name}
          methodColor={selectedMethod.color}
          depositId={pendingDepositId}
          onSuccess={handleDepositSuccess}
          onFailed={handleDepositFailed}
          onCancel={() => setPendingDepositId(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-card-border/30 px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="text-center">
            <h1 className="text-sm font-bold text-foreground">Recharger mon compte</h1>
            <p className="text-[10px] text-muted-foreground">Via Mobile Money</p>
          </div>

          <div className="bg-card border border-card-border rounded-xl px-3 py-1.5 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-foreground tabular-nums">
              {loadingWallet ? "…" : formatFCFA(wallet?.balance ?? 0)}
            </span>
          </div>
        </div>

        {/* Step bar */}
        <StepBar step={currentStep} />
      </div>

      {/* ── Content ── */}
      <div className="px-4 pt-5 pb-44 space-y-5">

        {/* ÉTAPE 1 — Pays */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
              selectedCountry ? "bg-primary text-white" : "bg-primary/15 text-primary border border-primary/30"
            )}>
              {selectedCountry ? <CheckCircle2 className="w-3 h-3" /> : "1"}
            </div>
            <p className="text-xs font-bold text-foreground uppercase tracking-wider">Votre pays</p>
          </div>

          {loadingCountries ? (
            <div className="h-12 bg-card border border-card-border rounded-2xl animate-pulse" />
          ) : countries.length === 0 ? (
            <div className="flex items-center gap-2 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-sm text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">Aucun pays configuré. Contactez l'administrateur.</span>
            </div>
          ) : (
            <CountrySelector countries={countries} selected={selectedCountry} onSelect={setSelectedCountry} />
          )}
        </div>

        {/* ÉTAPE 2 — Opérateur */}
        <AnimatePresence>
          {selectedCountry && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                  selectedMethod ? "bg-primary text-white" : "bg-primary/15 text-primary border border-primary/30"
                )}>
                  {selectedMethod ? <CheckCircle2 className="w-3 h-3" /> : "2"}
                </div>
                <p className="text-xs font-bold text-foreground uppercase tracking-wider">Mode de paiement</p>
              </div>

              {loadingMethods ? (
                <div className="space-y-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-16 bg-card border border-card-border rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : methods.length === 0 ? (
                <div className="flex items-center gap-2 p-3.5 bg-secondary/50 border border-card-border rounded-2xl text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs">Aucune méthode disponible pour ce pays.</span>
                </div>
              ) : (
                <OperatorList methods={methods} selected={selectedMethod} onSelect={setSelectedMethod} />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ÉTAPE 3 — Montant + Téléphone */}
        <AnimatePresence>
          {selectedMethod && (
            <motion.div
              key={selectedMethod.slug}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">3</div>
                <p className="text-xs font-bold text-foreground uppercase tracking-wider">Détails du paiement</p>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">
                  Numéro de téléphone
                </label>
                <div className="flex gap-0 rounded-2xl overflow-hidden border border-card-border bg-card focus-within:border-primary/50 transition-all shadow-sm">
                  <div className="flex items-center gap-2 px-3 py-3 bg-secondary/40 border-r border-card-border flex-shrink-0">
                    <FlagImg code={selectedCountry!.code} size={16} />
                    <span className="text-sm font-bold text-foreground font-mono">{dialCode}</span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    placeholder="07 00 00 00 00"
                    className="flex-1 px-3 py-3 text-sm font-semibold text-foreground bg-transparent focus:outline-none placeholder:font-normal placeholder:text-muted-foreground"
                  />
                  {phone && (
                    <button onClick={() => setPhone("")} className="pr-3 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">
                  Montant
                </label>
                <div className="flex gap-0 rounded-2xl overflow-hidden border border-card-border bg-card focus-within:border-primary/50 transition-all shadow-sm">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={e => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder={`${minDeposit.toLocaleString("fr-FR")} minimum`}
                    className="flex-1 px-4 py-3 text-sm font-bold text-foreground bg-transparent focus:outline-none placeholder:font-normal placeholder:text-muted-foreground"
                  />
                  <div className="flex items-center px-3.5 bg-secondary/40 border-l border-card-border">
                    <span className="text-xs font-bold text-muted-foreground">F CFA</span>
                  </div>
                </div>

                {/* Validation error */}
                {parsedAmount > 0 && parsedAmount < minDeposit && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-rose-400 flex items-center gap-1 px-1"
                  >
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    Minimum : {minDeposit.toLocaleString("fr-FR")} FCFA
                  </motion.p>
                )}

                {/* Quick amount presets */}
                <div className="flex gap-2 flex-wrap pt-1">
                  {QUICK_AMOUNTS.filter(a => a >= minDeposit).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                        parsedAmount === preset
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-card border-card-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                      )}
                    >
                      {preset >= 1000 ? `${preset / 1000}k` : preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary card */}
              <AnimatePresence>
                {parsedAmount > 0 && amountValid && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="rounded-2xl overflow-hidden border border-card-border shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${selectedMethod.color}08, ${selectedMethod.color}04)` }}
                  >
                    <div className="px-4 py-2.5 border-b border-card-border/60 flex items-center gap-2">
                      <MethodLogo method={selectedMethod} size={22} />
                      <span className="text-xs font-bold text-foreground">{selectedMethod.name}</span>
                      <div className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Instantané
                      </div>
                    </div>
                    <div className="divide-y divide-card-border/40">
                      {[
                        { label: "Montant", value: `${parsedAmount.toLocaleString("fr-FR")} FCFA`, highlight: false },
                        { label: `Frais (${feePercent}%)`, value: feeAmount === 0 ? "Gratuit ✓" : `${feeAmount.toLocaleString("fr-FR")} FCFA`, highlight: false, green: feeAmount === 0 },
                        { label: "Total débité", value: `${totalAmount.toLocaleString("fr-FR")} FCFA`, highlight: true },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className={cn(
                            "font-bold",
                            row.highlight ? "text-foreground text-base" : row.green ? "text-emerald-400" : "text-foreground"
                          )}>
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Instructions */}
              <AnimatePresence>
                {parsedAmount > 0 && amountValid && phone.length >= 6 && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-secondary/30 border border-card-border/50 rounded-2xl p-4"
                  >
                    <p className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
                      <ChevronRight className="w-3.5 h-3.5 text-primary" />
                      Suivez ces étapes pour payer
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
                          <p className="text-sm text-foreground/90 leading-relaxed">{step}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Fixed bottom CTA ── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-6 pt-3 bg-background/95 backdrop-blur-md border-t border-card-border/30 space-y-2 z-30">
        <motion.button
          onClick={handleConfirm}
          disabled={!canConfirm}
          whileTap={canConfirm ? { scale: 0.97 } : {}}
          className="w-full h-13 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all relative overflow-hidden"
          style={{
            background: canConfirm
              ? `linear-gradient(135deg, ${selectedMethod?.color ?? "#7C3AED"}, ${selectedMethod?.color ?? "#7C3AED"}bb)`
              : undefined,
            backgroundColor: canConfirm ? undefined : "rgb(63,63,70)",
            opacity: canConfirm ? 1 : 0.45,
            height: 52,
          }}
        >
          {canConfirm && (
            <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
          )}
          {confirming ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Vérification…</>
          ) : (
            <><CheckCircle2 className="w-5 h-5" /> Confirmer le dépôt {parsedAmount > 0 && amountValid ? `· ${formatFCFA(totalAmount)}` : ""}</>
          )}
        </motion.button>

        <button
          onClick={() => window.history.back()}
          className="w-full h-10 rounded-2xl bg-transparent border border-card-border text-muted-foreground font-semibold text-sm transition-colors hover:bg-secondary text-xs"
        >
          Annuler
        </button>

        <p className="text-center text-[10px] text-muted-foreground/50 flex items-center justify-center gap-1">
          <Shield className="w-3 h-3" /> Transaction sécurisée · SSL 256-bit
        </p>
      </div>
    </div>
  );
}
