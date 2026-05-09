import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import {
  listTransactions, getListTransactionsQueryKey,
  useListNumberHistory, getListNumberHistoryQueryKey,
} from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { ServiceIcon } from "@/components/service-icon";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  ArrowUpCircle, ShoppingBag, Search, X, CheckCircle2, XCircle, Clock,
  Copy, ChevronRight, Download, ArrowLeft, Filter, TrendingDown,
  Smartphone, Globe, Hash, Calendar, CreditCard, Shield, Zap,
} from "lucide-react";

/* ─── Types ─── */
interface TxItem {
  id: string;
  type: "recharge" | "purchase";
  amount: number;
  status: string;
  method?: string;
  description?: string;
  externalDepositId?: string;
  phoneNumber?: string;
  createdAt: string;
}

interface NumberItem {
  id: string;
  phoneNumber: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  price: number;
  service: { id: string; name: string; slug: string; color: string };
  country: { name: string; code: string; flag: string; dialCode: string };
  messages: { id: string; sender: string; body: string; code?: string; receivedAt: string }[];
}

type UnifiedItem =
  | { kind: "tx"; data: TxItem; createdAt: Date }
  | { kind: "num"; data: NumberItem; createdAt: Date };

/* ─── Helpers ─── */
function methodColor(name?: string): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("orange")) return "#FF6600";
  if (n.includes("mtn") || n.includes("momo")) return "#FFCB00";
  if (n.includes("wave")) return "#1ABCFE";
  if (n.includes("moov")) return "#003087";
  if (n.includes("free")) return "#E2001A";
  if (n.includes("airtel")) return "#E40000";
  if (n.includes("mpesa") || n.includes("m-pesa")) return "#00A650";
  return "#7C3AED";
}

function methodInitials(name?: string): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("orange")) return "OM";
  if (n.includes("mtn") || n.includes("momo")) return "MTN";
  if (n.includes("wave")) return "~";
  if (n.includes("moov")) return "M";
  if (n.includes("free")) return "FM";
  if (n.includes("airtel")) return "AT";
  if (n.includes("mpesa")) return "MP";
  return (name ?? "TX").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function statusConfig(status: string) {
  switch (status) {
    case "completed": case "received":
      return { color: "#10B981", bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Complété", icon: CheckCircle2 };
    case "pending":
      return { color: "#F59E0B", bg: "bg-amber-500/10", text: "text-amber-400", label: "En attente", icon: Clock };
    case "failed": case "cancelled":
      return { color: "#EF4444", bg: "bg-rose-500/10", text: "text-rose-400", label: status === "cancelled" ? "Annulé" : "Échoué", icon: XCircle };
    case "expired":
      return { color: "#6B7280", bg: "bg-zinc-500/10", text: "text-zinc-400", label: "Expiré", icon: Clock };
    default:
      return { color: "#7C3AED", bg: "bg-violet-500/10", text: "text-violet-400", label: status, icon: Clock };
  }
}

function formatGroupDate(d: Date): string {
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return "Hier";
  return format(d, "d MMMM yyyy", { locale: fr });
}

function copyToClipboard(text: string, label: string, setCopied: (v: string) => void) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  });
}

/* ─── Flag image ─── */
function FlagImg({ code, size = 18 }: { code: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err) return <span style={{ fontSize: size * 0.9 }}>{[...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join("")}</span>;
  return (
    <img
      src={`https://flagcdn.com/${Math.round(size * 1.5)}x${size}.${code.toLowerCase()}.png`}
      width={Math.round(size * 1.5)} height={size}
      className="rounded-[3px] object-cover flex-shrink-0"
      onError={() => setErr(true)}
      style={{ minWidth: Math.round(size * 1.5) }}
    />
  );
}

/* ─── Operator Logo ─── */
function OperatorLogo({ name, size = 40 }: { name?: string; size?: number }) {
  const color = methodColor(name);
  const initials = methodInitials(name);
  const isLight = ["#FFCB00"].includes(color);
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 shadow-sm font-black"
      style={{
        width: size, height: size,
        borderRadius: Math.round(size * 0.28),
        background: color,
        color: isLight ? "#111" : "#fff",
        fontSize: size * 0.32,
      }}
    >
      {initials}
    </div>
  );
}

/* ─── Deposit Card ─── */
function DepositCard({ tx, onClick }: { tx: TxItem; onClick: () => void }) {
  const st = statusConfig(tx.status);
  const Icon = st.icon;
  const phone = tx.phoneNumber ?? (tx.description?.match(/—\s*(\+[\d\s]+)$/)?.[1]?.trim());
  const timeAgo = formatDistanceToNow(new Date(tx.createdAt), { locale: fr, addSuffix: true });
  const color = methodColor(tx.method);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center gap-3 px-4 py-3.5 bg-card border border-card-border rounded-2xl hover:bg-secondary/20 transition-all text-left group"
    >
      {/* Colored left accent */}
      <div className="w-0.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

      <OperatorLogo name={tx.method} size={40} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{tx.method ?? "Mobile Money"}</p>
            {phone && (
              <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{phone}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-black text-emerald-400">+{formatFCFA(tx.amount)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", st.bg, st.text)}>
            <Icon className="w-2.5 h-2.5" />
            {st.label}
          </span>
          {tx.externalDepositId && (
            <span className="text-[10px] text-muted-foreground/40 font-mono truncate max-w-[100px]">#{tx.externalDepositId.slice(-8)}</span>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors flex-shrink-0" />
    </motion.button>
  );
}

/* ─── Purchase Card ─── */
function PurchaseCard({ num, onClick }: { num: NumberItem; onClick: () => void }) {
  const st = statusConfig(num.status);
  const Icon = st.icon;
  const timeAgo = formatDistanceToNow(new Date(num.createdAt), { locale: fr, addSuffix: true });
  const msgCount = num.messages?.length ?? 0;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center gap-3 px-4 py-3.5 bg-card border border-card-border rounded-2xl hover:bg-secondary/20 transition-all text-left group"
    >
      <div className="w-0.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: num.service.color ?? "#7C3AED" }} />

      <div className="flex-shrink-0">
        <ServiceIcon name={num.service.name} slug={num.service.slug} size={40} rounded="xl" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{num.service.name}</p>
            <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{num.phoneNumber}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-black text-rose-400">-{formatFCFA(num.price)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", st.bg, st.text)}>
              <Icon className="w-2.5 h-2.5" />
              {st.label}
            </span>
            <span className="flex items-center gap-0.5">
              <FlagImg code={num.country.code} size={12} />
              <span className="text-[10px] text-muted-foreground/50">{num.country.code}</span>
            </span>
          </div>
          {msgCount > 0 && (
            <span className="text-[10px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded-full font-semibold">
              {msgCount} SMS
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors flex-shrink-0" />
    </motion.button>
  );
}

/* ─── Row for detail sheet ─── */
function DetailRow({ icon: Icon, label, value, mono, subtle }: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
  subtle?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="w-7 h-7 rounded-lg bg-secondary/60 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
        <p className={cn("text-sm font-semibold text-foreground mt-0.5 break-all", mono && "font-mono", subtle && "text-muted-foreground")}>{value}</p>
      </div>
    </div>
  );
}

/* ─── Deposit Detail Sheet ─── */
function DepositDetailSheet({ tx, onClose }: { tx: TxItem; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  const st = statusConfig(tx.status);
  const Icon = st.icon;
  const phone = tx.phoneNumber ?? tx.description?.match(/—\s*(\+[\d\s]+)$/)?.[1]?.trim();
  const dateObj = new Date(tx.createdAt);
  const color = methodColor(tx.method);
  const isLight = ["#FFCB00"].includes(color);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="w-full max-w-md bg-background rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Amount header */}
          <div className="px-6 pt-4 pb-5 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
            >
              <ArrowUpCircle className="w-8 h-8" style={{ color: isLight ? "#111" : "#fff" }} />
            </div>
            <p className="text-3xl font-black text-emerald-400">+{formatFCFA(tx.amount)}</p>
            <p className="text-sm text-muted-foreground mt-1">Recharge Mobile Money</p>
            <div className={cn("inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-sm font-semibold", st.bg, st.text)}>
              <Icon className="w-4 h-4" />
              {st.label}
            </div>
          </div>

          {/* Perforated divider */}
          <div className="px-6 mb-1">
            <div className="flex items-center gap-1">
              {Array.from({ length: 32 }).map((_, i) => (
                <div key={i} className="flex-1 h-[2px] rounded-full bg-card-border/40" />
              ))}
            </div>
          </div>
          <div className="flex justify-between px-4 -mt-3">
            <div className="w-6 h-6 rounded-full bg-background border-2 border-card-border/30 -ml-4" />
            <div className="w-6 h-6 rounded-full bg-background border-2 border-card-border/30 -mr-4" />
          </div>

          {/* Details */}
          <div className="px-6 pt-2 pb-4 divide-y divide-card-border/30">
            <DetailRow icon={CreditCard} label="Opérateur" value={tx.method ?? "Mobile Money"} />
            <DetailRow icon={Calendar} label="Date" value={format(dateObj, "EEEE d MMMM yyyy", { locale: fr })} />
            <DetailRow icon={Clock} label="Heure" value={format(dateObj, "HH:mm:ss")} />
            {phone && <DetailRow icon={Smartphone} label="Numéro de téléphone" value={phone} mono />}
            {tx.externalDepositId && (
              <DetailRow icon={Hash} label="ID de dépôt" value={tx.externalDepositId} mono />
            )}
            <DetailRow icon={Hash} label="Référence interne" value={tx.id.slice(0, 16).toUpperCase()} mono />
            <DetailRow icon={Shield} label="Sécurité" value="Transaction chiffrée SSL 256-bit" subtle />
            <DetailRow icon={Zap} label="Traitement" value="Instantané · Simix Payments" subtle />
          </div>

          {/* Actions */}
          <div className="px-6 pb-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {tx.externalDepositId && (
                <button
                  onClick={() => copyToClipboard(tx.externalDepositId!, "id", setCopied)}
                  className={cn(
                    "flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold border transition-all",
                    copied === "id"
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-card border-card-border text-foreground hover:bg-secondary"
                  )}
                >
                  {copied === "id" ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied === "id" ? "Copié !" : "Copier ID"}
                </button>
              )}
              {phone && (
                <button
                  onClick={() => copyToClipboard(phone, "phone", setCopied)}
                  className={cn(
                    "flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold border transition-all",
                    copied === "phone"
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-card border-card-border text-foreground hover:bg-secondary"
                  )}
                >
                  {copied === "phone" ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied === "phone" ? "Copié !" : "Copier N°"}
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-full h-11 rounded-2xl bg-secondary/60 border border-card-border text-foreground font-semibold text-sm hover:bg-secondary transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Purchase Detail Sheet ─── */
function PurchaseDetailSheet({ num, onClose }: { num: NumberItem; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  const st = statusConfig(num.status);
  const Icon = st.icon;
  const dateObj = new Date(num.createdAt);
  const color = num.service.color ?? "#7C3AED";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="w-full max-w-md bg-background rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="px-6 pt-4 pb-5 text-center">
            <div className="flex justify-center mb-4">
              <ServiceIcon name={num.service.name} slug={num.service.slug} size={64} rounded="2xl" />
            </div>
            <p className="text-3xl font-black text-rose-400">-{formatFCFA(num.price)}</p>
            <p className="text-base font-bold text-foreground mt-1">{num.service.name}</p>
            <div className={cn("inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full text-sm font-semibold", st.bg, st.text)}>
              <Icon className="w-4 h-4" />
              {st.label}
            </div>
          </div>

          {/* Perforated divider */}
          <div className="px-6 mb-1">
            <div className="flex items-center gap-1">
              {Array.from({ length: 32 }).map((_, i) => (
                <div key={i} className="flex-1 h-[2px] rounded-full bg-card-border/40" />
              ))}
            </div>
          </div>
          <div className="flex justify-between px-4 -mt-3">
            <div className="w-6 h-6 rounded-full bg-background border-2 border-card-border/30 -ml-4" />
            <div className="w-6 h-6 rounded-full bg-background border-2 border-card-border/30 -mr-4" />
          </div>

          {/* Details */}
          <div className="px-6 pt-2 pb-4 divide-y divide-card-border/30">
            <DetailRow icon={Smartphone} label="Numéro virtuel" value={num.phoneNumber} mono />
            <div className="flex items-start gap-3 py-2.5">
              <div className="w-7 h-7 rounded-lg bg-secondary/60 flex items-center justify-center flex-shrink-0">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pays</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <FlagImg code={num.country.code} size={14} />
                  <p className="text-sm font-semibold text-foreground">{num.country.name}</p>
                </div>
              </div>
            </div>
            <DetailRow icon={Calendar} label="Date d'achat" value={format(dateObj, "EEEE d MMMM yyyy", { locale: fr })} />
            <DetailRow icon={Clock} label="Heure" value={format(dateObj, "HH:mm:ss")} />
            <DetailRow icon={Clock} label="Expiration" value={format(new Date(num.expiresAt), "d MMM yyyy HH:mm", { locale: fr })} />
            <DetailRow icon={Hash} label="ID de commande" value={num.id.slice(0, 16).toUpperCase()} mono />
          </div>

          {/* SMS Messages */}
          {num.messages && num.messages.length > 0 && (
            <div className="px-6 pb-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                SMS reçus ({num.messages.length})
              </p>
              <div className="space-y-2">
                {num.messages.map(msg => (
                  <div key={msg.id} className="bg-card border border-card-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground">{msg.sender}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(msg.receivedAt), "HH:mm · d MMM", { locale: fr })}
                      </span>
                    </div>
                    {msg.code && (
                      <div className="text-lg font-black text-primary tracking-widest mb-1">{msg.code}</div>
                    )}
                    <p className="text-xs text-muted-foreground leading-relaxed">{msg.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-6 pb-6 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => copyToClipboard(num.phoneNumber, "phone", setCopied)}
                className={cn(
                  "flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold border transition-all",
                  copied === "phone"
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : "bg-card border-card-border text-foreground hover:bg-secondary"
                )}
              >
                {copied === "phone" ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied === "phone" ? "Copié !" : "Copier N°"}
              </button>
              <button
                onClick={() => copyToClipboard(num.id, "id", setCopied)}
                className={cn(
                  "flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold border transition-all",
                  copied === "id"
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : "bg-card border-card-border text-foreground hover:bg-secondary"
                )}
              >
                {copied === "id" ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied === "id" ? "Copié !" : "Copier ID"}
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full h-11 rounded-2xl bg-secondary/60 border border-card-border text-foreground font-semibold text-sm hover:bg-secondary transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Skeleton ─── */
function SkeletonCard() {
  return <div className="h-[82px] bg-card border border-card-border rounded-2xl animate-pulse" />;
}

/* ─── Empty state ─── */
function EmptyState({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-4">
        {tab === "recharges" ? (
          <ArrowUpCircle className="w-7 h-7 text-muted-foreground/40" />
        ) : tab === "achats" ? (
          <ShoppingBag className="w-7 h-7 text-muted-foreground/40" />
        ) : (
          <Clock className="w-7 h-7 text-muted-foreground/40" />
        )}
      </div>
      <p className="text-sm font-semibold text-muted-foreground">Aucune transaction</p>
      <p className="text-xs text-muted-foreground/50 mt-1">
        {tab === "recharges" ? "Vos dépôts apparaîtront ici" :
         tab === "achats" ? "Vos achats de numéros apparaîtront ici" :
         "Votre historique complet apparaîtra ici"}
      </p>
    </div>
  );
}

/* ─── Stats bar ─── */
function StatsBar({ transactions, numbers }: { transactions: TxItem[]; numbers: NumberItem[] }) {
  const totalDeposits = transactions.filter(t => t.status === "completed").reduce((s, t) => s + t.amount, 0);
  const totalSpent = numbers.reduce((s, n) => s + n.price, 0);
  const numCount = numbers.length;

  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {[
        { label: "Dépôts", value: formatFCFA(totalDeposits), color: "text-emerald-400" },
        { label: "Achats", value: formatFCFA(totalSpent), color: "text-rose-400" },
        { label: "Numéros", value: String(numCount), color: "text-violet-400" },
      ].map(s => (
        <div key={s.label} className="bg-card border border-card-border rounded-xl px-3 py-2.5 text-center">
          <p className={cn("text-sm font-black", s.color)}>{s.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Main content ─── */
function HistoryContent() {
  const [tab, setTab] = useState<"all" | "recharges" | "achats">("all");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending" | "failed">("all");
  const [selectedTx, setSelectedTx] = useState<TxItem | null>(null);
  const [selectedNum, setSelectedNum] = useState<NumberItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── Fetch both data sources ── */
  const { data: rawTransactions = [], isLoading: loadingTx } = useQuery({
    queryKey: getListTransactionsQueryKey(),
    queryFn: listTransactions,
  });

  const { data: numbers = [], isLoading: loadingNums } = useListNumberHistory({
    query: { queryKey: getListNumberHistoryQueryKey() },
  });

  const transactions = rawTransactions as unknown as TxItem[];
  const numberHistory = numbers as unknown as NumberItem[];
  const isLoading = loadingTx || loadingNums;

  /* ── Build unified list ── */
  const unified = useMemo<UnifiedItem[]>(() => {
    const txItems: UnifiedItem[] = transactions
      .filter(t => t.type === "recharge")
      .map(t => ({ kind: "tx", data: t, createdAt: new Date(t.createdAt) }));

    const numItems: UnifiedItem[] = numberHistory
      .map(n => ({ kind: "num", data: n, createdAt: new Date(n.createdAt) }));

    return [...txItems, ...numItems].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [transactions, numberHistory]);

  /* ── Filtered items based on tab + status + search ── */
  const filtered = useMemo<UnifiedItem[]>(() => {
    let items = unified;

    if (tab === "recharges") items = items.filter(i => i.kind === "tx");
    if (tab === "achats") items = items.filter(i => i.kind === "num");

    if (statusFilter !== "all") {
      items = items.filter(i => {
        const s = i.kind === "tx" ? i.data.status : i.data.status;
        if (statusFilter === "completed") return s === "completed" || s === "received";
        if (statusFilter === "pending") return s === "pending";
        if (statusFilter === "failed") return s === "failed" || s === "cancelled" || s === "expired";
        return true;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => {
        if (i.kind === "tx") {
          return (i.data.method ?? "").toLowerCase().includes(q) ||
            (i.data.description ?? "").toLowerCase().includes(q) ||
            (i.data.phoneNumber ?? "").includes(q) ||
            (i.data.externalDepositId ?? "").toLowerCase().includes(q);
        } else {
          return i.data.service.name.toLowerCase().includes(q) ||
            i.data.phoneNumber.includes(q) ||
            i.data.country.name.toLowerCase().includes(q);
        }
      });
    }

    return items;
  }, [unified, tab, statusFilter, search]);

  /* ── Group by date ── */
  const grouped = useMemo(() => {
    const groups: { label: string; items: UnifiedItem[] }[] = [];
    let lastLabel = "";
    for (const item of filtered) {
      const label = formatGroupDate(item.createdAt);
      if (label !== lastLabel) {
        groups.push({ label, items: [] });
        lastLabel = label;
      }
      groups[groups.length - 1].items.push(item);
    }
    return groups;
  }, [filtered]);

  const completedDeposits = transactions.filter(t => t.type === "recharge" && t.status === "completed").length;
  const purchaseCount = numberHistory.length;

  const TABS = [
    { id: "all" as const, label: "Tout", count: transactions.filter(t => t.type === "recharge").length + purchaseCount },
    { id: "recharges" as const, label: "Dépôts", count: transactions.filter(t => t.type === "recharge").length },
    { id: "achats" as const, label: "Achats", count: purchaseCount },
  ];

  const STATUS_FILTERS = [
    { id: "all" as const, label: "Tous" },
    { id: "completed" as const, label: "Complétés", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    { id: "pending" as const, label: "En attente", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    { id: "failed" as const, label: "Échoués", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  ];

  return (
    <>
      {/* Detail modals */}
      <AnimatePresence>
        {selectedTx && <DepositDetailSheet tx={selectedTx} onClose={() => setSelectedTx(null)} />}
        {selectedNum && <PurchaseDetailSheet num={selectedNum} onClose={() => setSelectedNum(null)} />}
      </AnimatePresence>

      <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden">
        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-card-border/30">
          {/* Title row */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h1 className="text-lg font-black text-foreground">Historique</h1>
              <p className="text-[11px] text-muted-foreground">{completedDeposits} dépôts · {purchaseCount} achats</p>
            </div>
            <button
              onClick={() => { setShowSearch(s => !s); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 80); }}
              className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              {showSearch ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          {/* Search bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Rechercher une transaction..."
                      className="w-full pl-9 pr-9 py-2.5 text-sm bg-card border border-card-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                    {search && (
                      <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tabs */}
          <div className="px-5 pb-0">
            <div className="flex gap-1 bg-card border border-card-border rounded-xl p-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all",
                    tab === t.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                  {!isLoading && (
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                      tab === t.id ? "bg-white/20 text-white" : "bg-secondary text-muted-foreground"
                    )}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Status filters */}
          <div className="px-5 pt-3 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={cn(
                  "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  statusFilter === f.id
                    ? f.color ?? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-card border-card-border text-muted-foreground hover:border-primary/20"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="px-4 pt-4 pb-28">
          {/* Stats */}
          {!isLoading && <StatsBar transactions={transactions} numbers={numberHistory} />}

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <div className="space-y-5">
              {grouped.map(group => (
                <div key={group.label}>
                  {/* Date group header */}
                  <div className="flex items-center gap-3 mb-2.5">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">{group.label}</p>
                    <div className="flex-1 h-[1px] bg-card-border/30" />
                    <p className="text-[10px] text-muted-foreground/40 flex-shrink-0">{group.items.length}</p>
                  </div>

                  <div className="space-y-2">
                    {group.items.map((item, idx) => (
                      <motion.div
                        key={item.kind === "tx" ? item.data.id : item.data.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                      >
                        {item.kind === "tx" ? (
                          <DepositCard tx={item.data} onClick={() => setSelectedTx(item.data)} />
                        ) : (
                          <PurchaseCard num={item.data} onClick={() => setSelectedNum(item.data)} />
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}

              {/* End marker */}
              <div className="flex items-center gap-3 py-4">
                <div className="flex-1 h-[1px] bg-card-border/20" />
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30 font-semibold">
                  <Shield className="w-3 h-3" />
                  Fin de l'historique · 100 max
                </div>
                <div className="flex-1 h-[1px] bg-card-border/20" />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Main export ─── */
export default function History() {
  return (
    <AuthGuard>
      <AppLayout>
        <HistoryContent />
      </AppLayout>
    </AuthGuard>
  );
}
