import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetMe } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { formatFCFA } from "@/lib/format";
import {
  ChevronLeft, Gift, Copy, CheckCheck, Users, TrendingUp,
  Share2, Sparkles, ExternalLink,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Commission {
  id: string;
  commissionAmount: number;
  purchaseAmount: number;
  createdAt: string;
  refereeName: string;
  refereePhone: string | null;
}

interface ReferralData {
  referralCode: string | null;
  totalEarnings: number;
  commissionRate: number;
  referredCount: number;
  commissions: Commission[];
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

  useEffect(() => {
    fetch(`${BASE}/api/referral/me`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

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
    </div>
  );
}
