import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetMe } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatFCFA } from "@/lib/format";
import {
  ChevronLeft, Gift, Copy, CheckCheck, Users, TrendingUp,
  Share2, Sparkles, ExternalLink, Wallet, X, ChevronDown,
  Loader2, CheckCircle2, Clock, Smartphone,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Commission {
  id: string;
  commissionAmount: number;
  purchaseAmount: number;
  createdAt: string;
  refereeName: string;
  refereePhone: string | null;
}

interface PendingWithdrawal {
  id: string;
  amount: number;
  status: "pending" | "paid" | "rejected";
  createdAt: string;
}

interface ReferralData {
  referralCode: string | null;
  totalEarnings: number;
  referralBalance: number;
  commissionRate: number;
  referredCount: number;
  pendingWithdrawal: PendingWithdrawal | null;
  commissions: Commission[];
}

interface WithdrawCountry {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  popular: boolean;
}

interface WithdrawOperator {
  slug: string;
  name: string;
  color: string;
  logoUrl: string | null;
}

export default function ProfileParrainage() {
  return (
    <AuthGuard>
      <AppLayout>
        <ParrainageContent />
      </AppLayout>
    </AuthGuard>
  );
}

function ParrainageContent() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const loadData = () => {
    fetch(`${BASE}/api/referral/me`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const referralLink = data?.referralCode
    ? `${window.location.origin}${BASE}/register?ref=${data.referralCode}`
    : "";

  const copyCode = async () => {
    if (!data?.referralCode) return;
    await navigator.clipboard.writeText(data.referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const shareLink = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: "Rejoins Simix !",
        text: `Rejoins Simix avec mon code de parrainage ${data?.referralCode} et profite des meilleurs numéros virtuels en Afrique !`,
        url: referralLink,
      });
    } else {
      copyLink();
    }
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric",
    });
  };

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pb-28">
      {/* Header */}
      <div className="relative">
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-amber-600/15 via-amber-900/5 to-transparent pointer-events-none" />

        <div className="relative z-10 px-5 pt-6 pb-5">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setLocation("/profile")}
              className="w-10 h-10 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-foreground">Parrainage</h1>
              <p className="text-xs text-muted-foreground">Invitez & gagnez des commissions</p>
            </div>
          </div>

          {/* Hero card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-gradient-to-br from-amber-900/50 via-card to-card border border-amber-500/30 rounded-3xl p-5 mb-4 overflow-hidden shadow-lg"
          >
            <div className="absolute -top-6 -right-6 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute top-3 right-4 opacity-20">
              <Sparkles className="w-10 h-10 text-amber-400" />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Gift className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-sm font-bold text-amber-300">Programme de parrainage</span>
            </div>

            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
              Pour chaque achat de vos filleuls, vous recevez automatiquement{" "}
              <span className="text-amber-400 font-bold">
                {loading ? "…" : `${data?.commissionRate ?? 10}%`}
              </span>{" "}
              du montant directement dans votre portefeuille.
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-black/20 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Filleuls</p>
                <p className="text-lg font-black text-foreground">{loading ? "—" : (data?.referredCount ?? 0)}</p>
              </div>
              <div className="bg-black/20 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Commissions</p>
                <p className="text-lg font-black text-foreground">{loading ? "—" : (data?.commissions.length ?? 0)}</p>
              </div>
              <div className="bg-black/20 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-amber-400/70 font-medium uppercase tracking-wider mb-0.5">Gains</p>
                <p className="text-base font-black text-amber-400 leading-tight">
                  {loading ? "—" : formatFCFA(data?.totalEarnings ?? 0)}
                </p>
              </div>
            </div>

            {/* Solde retirable + bouton retrait */}
            <div className="mt-3 flex items-center gap-3 bg-black/25 rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Solde retirable</p>
                <p className="text-lg font-black text-foreground">
                  {loading ? "—" : formatFCFA(data?.referralBalance ?? 0)}
                </p>
                {data?.pendingWithdrawal && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> Retrait de {formatFCFA(data.pendingWithdrawal.amount)} en attente
                  </p>
                )}
              </div>
              <button
                onClick={() => setWithdrawOpen(true)}
                disabled={loading || !data?.referralBalance || !!data?.pendingWithdrawal}
                className="flex items-center gap-2 px-4 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-secondary disabled:text-muted-foreground text-black text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0"
              >
                <Wallet className="w-4 h-4" />
                Retrait
              </button>
            </div>
          </motion.div>

          {/* Referral code card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="bg-card border border-card-border rounded-2xl p-4 mb-4 shadow-sm"
          >
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Votre code de parrainage</p>

            {loading ? (
              <div className="h-14 bg-secondary rounded-xl animate-pulse" />
            ) : (
              <div className="flex items-center gap-3 bg-secondary/60 rounded-xl px-4 py-3 mb-3">
                <Gift className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <span className="flex-1 font-mono font-black text-xl text-amber-400 tracking-widest">
                  {data?.referralCode ?? "—"}
                </span>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/30 transition-colors"
                >
                  {copiedCode ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? "Copié !" : "Copier"}
                </button>
              </div>
            )}

            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Lien de parrainage</p>
            <div className="flex items-center gap-2 bg-secondary/40 rounded-xl px-3 py-2.5 mb-3">
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 text-[11px] text-muted-foreground font-mono truncate">
                {referralLink || "—"}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyLink}
                disabled={!referralLink}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-sm font-bold transition-colors disabled:opacity-40"
              >
                {copiedLink ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedLink ? "Copié !" : "Copier le lien"}
              </button>
              <button
                onClick={shareLink}
                disabled={!referralLink}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-sm font-bold transition-colors disabled:opacity-40"
              >
                <Share2 className="w-4 h-4" />
                Partager
              </button>
            </div>
          </motion.div>

          {/* How it works */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card border border-card-border rounded-2xl p-4 mb-4 shadow-sm"
          >
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Comment ça marche</p>
            <div className="space-y-3">
              {[
                { step: "1", text: "Partagez votre code ou lien avec un ami", icon: Share2, color: "text-violet-400", bg: "bg-violet-500/15" },
                { step: "2", text: "Il s'inscrit et utilise votre code", icon: Users, color: "text-blue-400", bg: "bg-blue-500/15" },
                { step: "3", text: `Vous recevez ${data?.commissionRate ?? 10}% de chaque achat qu'il effectue`, icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-500/15" },
              ].map(({ step, text, icon: Icon, color, bg }) => (
                <div key={step} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs font-black text-muted-foreground w-4">{step}.</span>
                    <span className="text-xs text-foreground leading-relaxed">{text}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Commissions history */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="bg-card border border-card-border rounded-2xl overflow-hidden shadow-sm"
          >
            <div className="px-4 pt-4 pb-3 border-b border-card-border/50">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Historique des commissions</p>
            </div>

            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-secondary rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !data?.commissions.length ? (
              <div className="py-12 text-center px-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                  <Gift className="w-7 h-7 text-amber-400/60" />
                </div>
                <p className="text-sm font-bold text-foreground mb-1">Aucune commission pour l'instant</p>
                <p className="text-xs text-muted-foreground">Partagez votre code pour commencer à gagner !</p>
              </div>
            ) : (
              <div className="divide-y divide-card-border/40">
                {data.commissions.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{c.refereeName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Achat de {formatFCFA(c.purchaseAmount)} · {formatDate(c.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm font-black text-emerald-400 flex-shrink-0">
                      +{formatFCFA(c.commissionAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        balance={data?.referralBalance ?? 0}
        onSuccess={() => { setWithdrawOpen(false); loadData(); }}
      />
    </div>
  );
}

/* ─── Withdraw modal ──────────────────────────────────────────── */
function WithdrawModal({
  open, onClose, balance, onSuccess,
}: { open: boolean; onClose: () => void; balance: number; onSuccess: () => void }) {
  const { toast } = useToast();
  const [countries, setCountries] = useState<WithdrawCountry[]>([]);
  const [operators, setOperators] = useState<WithdrawOperator[]>([]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [country, setCountry] = useState<WithdrawCountry | null>(null);
  const [operator, setOperator] = useState<WithdrawOperator | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [loadingOperators, setLoadingOperators] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    /* Reset on open */
    setCountry(null);
    setOperator(null);
    setOperators([]);
    setPhone("");
    setAmount("");
    setError(null);
    fetch(`${BASE}/api/referral/withdraw-countries`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setCountries)
      .catch(() => setCountries([]));
  }, [open]);

  useEffect(() => {
    if (!country) { setOperators([]); return; }
    setLoadingOperators(true);
    setOperator(null);
    fetch(`${BASE}/api/referral/withdraw-operators?countryCode=${country.code}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setOperators)
      .catch(() => setOperators([]))
      .finally(() => setLoadingOperators(false));
  }, [country]);

  const parsedAmount = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
  const amountValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= balance;
  const canSubmit = !!country && !!operator && phone.replace(/\D/g, "").length >= 6 && amountValid && !submitting;

  const submit = async () => {
    if (!canSubmit || !country || !operator) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/referral/withdraw`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ countryCode: country.code, operatorSlug: operator.slug, phone, amount: parsedAmount }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erreur lors de la demande");
      toast({ title: "Demande envoyée", description: "Votre retrait sera validé par un administrateur." });
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  /* Masquer le chatbot quand le modal est ouvert */
  useEffect(() => {
    if (open) {
      document.body.setAttribute("data-modal-open", "true");
    } else {
      document.body.removeAttribute("data-modal-open");
    }
    return () => { document.body.removeAttribute("data-modal-open"); };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — z-[58] pour passer au-dessus de la bottom nav (z-50) */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[58]"
          />
          {/* Panel — z-[59] */}
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="fixed inset-x-0 bottom-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-[59] sm:max-w-sm sm:w-full"
          >
            <div className="bg-card border border-card-border rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[85dvh] sm:max-h-[90vh]">

              {/* ── Header (fixe, ne scroll pas) ── */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-foreground">Retrait de parrainage</h2>
                    <p className="text-xs text-muted-foreground">Solde disponible : {formatFCFA(balance)}</p>
                  </div>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── Contenu scrollable ── */}
              <div className="flex-1 overflow-y-auto px-5 pb-2">

                {/* Country picker */}
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Pays</p>
                <div className="relative mb-3">
                  <button
                    type="button"
                    onClick={() => setCountryOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-2 bg-secondary/60 rounded-xl px-3.5 py-3 text-sm"
                  >
                    {country ? (
                      <span className="flex items-center gap-2">
                        <span className="text-lg leading-none">{country.flag}</span>
                        <span className="font-medium text-foreground">{country.name}</span>
                        <span className="text-muted-foreground text-xs font-mono">{country.dialCode}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sélectionnez votre pays</span>
                    )}
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                  {countryOpen && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-card border border-card-border rounded-xl shadow-lg p-1.5">
                      {countries.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-4">Chargement…</div>
                      ) : countries.map(c => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => { setCountry(c); setCountryOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-secondary/60 text-sm text-left"
                        >
                          <span className="text-base leading-none">{c.flag}</span>
                          <span className="flex-1 font-medium text-foreground truncate">{c.name}</span>
                          <span className="text-muted-foreground text-xs font-mono">{c.dialCode}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Phone number */}
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Numéro de retrait</p>
                <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3.5 py-3 mb-3">
                  <Smartphone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  {country && <span className="text-xs text-muted-foreground font-mono flex-shrink-0">{country.dialCode}</span>}
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ""))}
                    placeholder="Ex: 07 00 00 00 00"
                    className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                {/* Operator picker */}
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Opérateur mobile money</p>
                {!country ? (
                  <p className="text-xs text-muted-foreground mb-3">Sélectionnez d'abord un pays</p>
                ) : loadingOperators ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                ) : operators.length === 0 ? (
                  <p className="text-xs text-muted-foreground mb-3">Aucun opérateur disponible pour ce pays</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {operators.map(op => (
                      <button
                        key={op.slug}
                        type="button"
                        onClick={() => setOperator(op)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left"
                        style={operator?.slug === op.slug ? {
                          backgroundColor: `${op.color}15`, borderColor: `${op.color}80`,
                        } : { borderColor: "transparent" }}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: op.color }} />
                        <span className="text-sm font-semibold text-foreground truncate">{op.name}</span>
                        {operator?.slug === op.slug && <CheckCircle2 className="w-3.5 h-3.5 ml-auto flex-shrink-0" style={{ color: op.color }} />}
                      </button>
                    ))}
                  </div>
                )}

                {/* Amount */}
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Montant à retirer</p>
                <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3.5 py-3 mb-1">
                  <Wallet className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, ""))}
                    placeholder={`Max ${formatFCFA(balance)}`}
                    inputMode="numeric"
                    className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setAmount(String(balance))}
                    className="text-[10px] font-bold text-amber-400 hover:text-amber-300 uppercase tracking-wider flex-shrink-0 px-1"
                  >
                    Tout
                  </button>
                </div>
                {amount !== "" && !amountValid && (
                  <p className="text-xs text-red-400 mt-1">
                    {parsedAmount > balance ? `Maximum disponible : ${formatFCFA(balance)}` : "Montant invalide"}
                  </p>
                )}

              </div>

              {/* ── Bouton fixé en bas, toujours visible ── */}
              <div
                className="flex-shrink-0 px-5 pt-3 border-t border-card-border/40"
                style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
              >
                {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
                <button
                  onClick={submit}
                  disabled={!canSubmit}
                  className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold transition-colors active:scale-[0.98]"
                >
                  {submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Traitement en cours…</>
                    : <><Wallet className="w-4 h-4" />{amountValid ? `Retirer ${formatFCFA(parsedAmount)}` : "Retirer maintenant"}</>
                  }
                </button>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
