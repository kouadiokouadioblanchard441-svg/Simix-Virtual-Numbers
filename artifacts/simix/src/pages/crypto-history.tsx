import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { formatFCFA } from "@/lib/format";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Copy, ExternalLink,
  Bitcoin, RefreshCw, Shield, AlertCircle, Loader2, ChevronRight,
  TrendingUp, Hash,
} from "lucide-react";

/* ─── Types ─── */
interface CryptoTx {
  id: string;
  status: string;
  amountFcfa: number;
  createdAt: string;
  paymentId: string;
  orderId: string;
  payAddress: string;
  payAmount: number;
  amountUsd: number;
  fcfaRate: number;
  network: string;
  currency: string;
  networkLabel: string;
  chain: string;
  expiresAt: string | null;
  payinHash: string | null;
}

/* ─── Network styling ─── */
const NETWORK_STYLE: Record<string, { color: string; bg: string; short: string }> = {
  trc20: { color: "#EF4444", bg: "bg-red-500/10",    short: "TRC-20" },
  erc20: { color: "#6366F1", bg: "bg-indigo-500/10", short: "ERC-20" },
  bep20: { color: "#F59E0B", bg: "bg-amber-500/10",  short: "BEP-20" },
};

function netStyle(network: string) {
  return NETWORK_STYLE[network] ?? { color: "#7C3AED", bg: "bg-violet-500/10", short: network.toUpperCase() };
}

/* ─── Status config ─── */
function statusConfig(status: string) {
  switch (status) {
    case "completed":
      return { color: "#10B981", bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Confirmé", icon: CheckCircle2 };
    case "pending":
      return { color: "#F59E0B", bg: "bg-amber-500/10",   text: "text-amber-400",   label: "En attente", icon: Clock };
    case "failed":
      return { color: "#EF4444", bg: "bg-rose-500/10",    text: "text-rose-400",    label: "Échoué", icon: XCircle };
    case "expired":
      return { color: "#6B7280", bg: "bg-zinc-500/10",    text: "text-zinc-400",    label: "Expiré", icon: Clock };
    default:
      return { color: "#7C3AED", bg: "bg-violet-500/10",  text: "text-violet-400",  label: status, icon: Clock };
  }
}

/* ─── Date group label ─── */
function groupLabel(d: Date) {
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return "Hier";
  return format(d, "d MMMM yyyy", { locale: fr });
}

/* ─── Fetch helpers ─── */
async function fetchCryptoHistory(): Promise<CryptoTx[]> {
  const r = await fetch("/api/wallet/crypto/history", { credentials: "include" });
  if (!r.ok) throw new Error("Erreur de chargement");
  return r.json() as Promise<CryptoTx[]>;
}

async function fetchCryptoStatus(paymentId: string): Promise<{ status: string; payinHash?: string | null }> {
  const r = await fetch(`/api/wallet/crypto/${paymentId}/status`, { credentials: "include" });
  if (!r.ok) throw new Error("Poll failed");
  return r.json() as Promise<{ status: string; payinHash?: string | null }>;
}

/* ─── Copy helper ─── */
function useCopy() {
  const [copied, setCopied] = useState("");
  const copy = useCallback((value: string, key: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    });
  }, []);
  return { copied, copy };
}

/* ─── Network badge ─── */
function NetworkBadge({ network, size = "sm" }: { network: string; size?: "sm" | "xs" }) {
  const s = netStyle(network);
  return (
    <span
      className={cn(
        "inline-flex items-center font-bold rounded-full",
        s.bg,
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-[9px] px-1.5 py-0.5",
      )}
      style={{ color: s.color }}
    >
      {s.short}
    </span>
  );
}

/* ─── Transaction card ─── */
function CryptoCard({ tx, onClick, liveStatus }: {
  tx: CryptoTx;
  onClick: () => void;
  liveStatus?: string;
}) {
  const resolvedStatus = liveStatus ?? tx.status;
  const st = statusConfig(resolvedStatus);
  const Icon = st.icon;
  const timeAgo = formatDistanceToNow(new Date(tx.createdAt), { locale: fr, addSuffix: true });
  const ns = netStyle(tx.network);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center gap-3 px-4 py-3.5 bg-card border border-card-border rounded-2xl hover:bg-secondary/20 transition-all text-left group"
    >
      {/* Left accent */}
      <div className="w-0.5 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: ns.color }} />

      {/* Network icon */}
      <div
        className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-xs", ns.bg)}
        style={{ color: ns.color }}
      >
        {ns.short.replace("-", "")}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">{tx.networkLabel}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {tx.payAmount > 0 ? `${tx.payAmount.toFixed(4)} USDT` : "—"}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-black text-emerald-400">+{formatFCFA(tx.amountFcfa)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", st.bg, st.text)}>
            {resolvedStatus === "pending" ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <Icon className="w-2.5 h-2.5" />
            )}
            {st.label}
          </span>
          <span className="text-[10px] text-muted-foreground/40 font-mono">
            #{tx.paymentId.slice(-8).toUpperCase()}
          </span>
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors flex-shrink-0" />
    </motion.button>
  );
}

/* ─── Detail row ─── */
function DetailRow({ label, value, mono, copyValue, onCopy, copied }: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copyValue?: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-white/5 last:border-0 gap-4">
      <span className="text-sm text-zinc-400 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn("text-sm font-bold text-white text-right break-all", mono && "font-mono text-xs")}>{value}</span>
        {copyValue && onCopy && (
          <button onClick={onCopy} className="text-zinc-400 hover:text-white transition-colors flex-shrink-0 ml-1">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Block explorer URLs ─── */
function explorerUrl(network: string, hash: string): string | null {
  const explorers: Record<string, string> = {
    trc20: `https://tronscan.org/#/transaction/${hash}`,
    erc20: `https://etherscan.io/tx/${hash}`,
    bep20: `https://bscscan.com/tx/${hash}`,
  };
  return explorers[network] ?? null;
}

/* ─── Detail modal ─── */
function CryptoDetailModal({ tx, liveStatus, onClose }: {
  tx: CryptoTx;
  liveStatus?: string;
  onClose: () => void;
}) {
  const { copied, copy } = useCopy();
  const resolvedStatus = liveStatus ?? tx.status;
  const st = statusConfig(resolvedStatus);
  const ns = netStyle(tx.network);
  const dateObj = new Date(tx.createdAt);
  const explorerLink = tx.payinHash ? explorerUrl(tx.network, tx.payinHash) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center px-2 pb-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 340 }}
        className="w-full max-w-sm rounded-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: "92vh", background: "#111827" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${ns.color}99, ${ns.color}55)` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-black text-sm text-white">
              {ns.short.replace("-", "")}
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">{tx.networkLabel}</p>
              <p className="text-white/60 text-xs">{tx.chain}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <XCircle className="w-3.5 h-3.5 text-white" />
          </button>
        </div>

        {/* Amount hero */}
        <div className="text-center py-5 px-6 border-b border-white/5 flex-shrink-0">
          <p className="text-3xl font-black text-emerald-400">+{formatFCFA(tx.amountFcfa)}</p>
          {tx.payAmount > 0 && (
            <p className="text-sm text-zinc-400 mt-1">{tx.payAmount.toFixed(6)} USDT · {tx.amountUsd.toFixed(2)} USD</p>
          )}
          <div className="mt-3 inline-flex items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full", st.bg, st.text)}>
              {resolvedStatus === "pending" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <st.icon className="w-3 h-3" />
              )}
              {st.label}
            </span>
          </div>
        </div>

        {/* Detail rows — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          <DetailRow label="Réseau" value={<NetworkBadge network={tx.network} />} />
          <DetailRow
            label="Adresse de dépôt"
            value={tx.payAddress ? `${tx.payAddress.slice(0, 12)}…${tx.payAddress.slice(-8)}` : "—"}
            mono
            copyValue={tx.payAddress || undefined}
            onCopy={() => copy(tx.payAddress, "addr")}
            copied={copied === "addr"}
          />
          <DetailRow label="Montant USDT" value={tx.payAmount > 0 ? `${tx.payAmount.toFixed(6)} USDT` : "—"} mono />
          <DetailRow label="Montant FCFA" value={formatFCFA(tx.amountFcfa)} />
          <DetailRow label="Taux USD/FCFA" value={`1 USD = ${tx.fcfaRate.toLocaleString("fr-FR")} FCFA`} />

          {tx.payinHash ? (
            <DetailRow
              label="Hash blockchain"
              value={`${tx.payinHash.slice(0, 10)}…${tx.payinHash.slice(-8)}`}
              mono
              copyValue={tx.payinHash}
              onCopy={() => copy(tx.payinHash!, "hash")}
              copied={copied === "hash"}
            />
          ) : (
            <DetailRow label="Hash blockchain" value={<span className="text-zinc-600">En attente…</span>} />
          )}

          <DetailRow
            label="ID paiement"
            value={tx.paymentId.slice(-12).toUpperCase()}
            mono
            copyValue={tx.paymentId}
            onCopy={() => copy(tx.paymentId, "pid")}
            copied={copied === "pid"}
          />
          <DetailRow label="Date" value={format(dateObj, "dd/MM/yyyy 'à' HH:mm:ss")} />
          {tx.expiresAt && resolvedStatus === "pending" && (
            <DetailRow
              label="Expire"
              value={format(new Date(tx.expiresAt), "dd/MM/yyyy HH:mm")}
              valueClass="text-amber-400"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex-shrink-0 space-y-2 border-t border-white/5">
          {explorerLink && (
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-11 rounded-2xl flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white text-sm font-semibold hover:bg-white/10 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Voir sur l'explorateur blockchain
            </a>
          )}
          <button
            onClick={onClose}
            className="w-full h-11 rounded-2xl text-white font-bold text-sm active:opacity-80 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${ns.color}cc, ${ns.color}88)` }}
          >
            Fermer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Stats bar ─── */
function StatsBar({ txs }: { txs: CryptoTx[] }) {
  const completed = txs.filter(t => t.status === "completed");
  const totalFcfa = completed.reduce((s, t) => s + t.amountFcfa, 0);
  const totalUsdt = completed.reduce((s, t) => s + t.payAmount, 0);
  const pending   = txs.filter(t => t.status === "pending").length;

  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {[
        { label: "Total crédité", value: formatFCFA(totalFcfa), color: "text-emerald-400" },
        { label: "Total USDT", value: `${totalUsdt.toFixed(2)}`, color: "text-amber-400" },
        { label: "En attente", value: String(pending), color: "text-blue-400" },
      ].map(s => (
        <div key={s.label} className="bg-card border border-card-border rounded-xl px-3 py-2.5 text-center">
          <p className={cn("text-sm font-black truncate", s.color)}>{s.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Skeleton ─── */
function SkeletonCard() {
  return <div className="h-[88px] bg-card border border-card-border rounded-2xl animate-pulse" />;
}

/* ─── Empty state ─── */
function EmptyState() {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-4">
        <Bitcoin className="w-7 h-7 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-semibold text-muted-foreground">Aucun dépôt crypto</p>
      <p className="text-xs text-muted-foreground/50 mt-1 mb-5">Vos transactions USDT apparaîtront ici</p>
      <button
        onClick={() => navigate("/wallet")}
        className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
        style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
      >
        Faire un dépôt crypto
      </button>
    </div>
  );
}

/* ─── Main content ─── */
function CryptoHistoryContent() {
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<CryptoTx | null>(null);
  const [liveStatuses, setLiveStatuses] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["crypto-history"],
    queryFn: fetchCryptoHistory,
    refetchInterval: 30_000,
  });

  /* Real-time polling for pending transactions */
  const pendingTxs = txs.filter(t => (liveStatuses[t.paymentId] ?? t.status) === "pending");

  useEffect(() => {
    if (pendingTxs.length === 0) return;

    const poll = async () => {
      await Promise.allSettled(
        pendingTxs.map(async (tx) => {
          try {
            const result = await fetchCryptoStatus(tx.paymentId);
            setLiveStatuses(prev => {
              if (prev[tx.paymentId] === result.status) return prev;
              return { ...prev, [tx.paymentId]: result.status };
            });
            if (result.status !== "pending") {
              /* Terminal status — refetch full list to get updated gatewayMeta */
              queryClient.invalidateQueries({ queryKey: ["crypto-history"] });
            }
          } catch { /* ignore poll errors */ }
        })
      );
    };

    poll();
    const interval = setInterval(poll, 8_000);
    return () => clearInterval(interval);
  }, [pendingTxs.length, queryClient]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["crypto-history"] });
    setTimeout(() => setRefreshing(false), 600);
  };

  /* Group transactions by date */
  const grouped = txs.reduce<Array<{ label: string; items: CryptoTx[] }>>(
    (acc, tx) => {
      const d = new Date(tx.createdAt);
      const label = groupLabel(d);
      const group = acc.find(g => g.label === label);
      if (group) group.items.push(tx);
      else acc.push({ label, items: [tx] });
      return acc;
    },
    [],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/history")}
            className="w-9 h-9 rounded-xl bg-card border border-card-border flex items-center justify-center active:opacity-70 transition-opacity"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-black text-foreground">Dépôts Crypto</h1>
            <p className="text-xs text-muted-foreground">Historique USDT</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="w-9 h-9 rounded-xl bg-card border border-card-border flex items-center justify-center active:opacity-70 transition-opacity"
        >
          <RefreshCw className={cn("w-4 h-4 text-foreground", refreshing && "animate-spin")} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : txs.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <StatsBar txs={txs} />

            {/* Pending notice */}
            {pendingTxs.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-4">
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
                <p className="text-xs text-amber-400 font-medium">
                  {pendingTxs.length} transaction{pendingTxs.length > 1 ? "s" : ""} en cours — vérification en temps réel
                </p>
              </div>
            )}

            {grouped.map(group => (
              <div key={group.label} className="mb-4">
                <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider mb-2 px-1">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.items.map(tx => (
                    <CryptoCard
                      key={tx.id}
                      tx={tx}
                      onClick={() => setSelected(tx)}
                      liveStatus={liveStatuses[tx.paymentId]}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Security note */}
            <div className="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-muted-foreground/40">
              <Shield className="w-3 h-3" />
              <span>Transactions vérifiées par signature cryptographique</span>
            </div>
          </>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <CryptoDetailModal
            tx={selected}
            liveStatus={liveStatuses[selected.paymentId]}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Page export ─── */
export default function CryptoHistory() {
  return (
    <AuthGuard>
      <AppLayout>
        <CryptoHistoryContent />
      </AppLayout>
    </AuthGuard>
  );
}
