import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCheck, Loader2, Bell, MessageSquare, Wallet, Phone,
  RefreshCw, Clock, Shield, Gift, Star, Zap, Megaphone, Info,
  Inbox, ArrowRight,
} from "lucide-react";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { useListNumberHistory } from "@workspace/api-client-react";
import { SimixIcon } from "@/components/simix-logo";
import { ServiceIcon } from "@/components/service-icon";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

/* ─── Date helpers ──────────────────────────────────────────────── */

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "EEE d MMM · HH:mm", { locale: fr });
  } catch {
    return dateStr;
  }
}

function formatRelative(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isToday(d)) return formatDistanceToNow(d, { locale: fr, addSuffix: true });
    if (isYesterday(d)) return "Hier";
    return format(d, "d MMM", { locale: fr });
  } catch {
    return dateStr;
  }
}

/* ─── Notification type badge ───────────────────────────────────── */

interface BadgeDef { bg: string; icon: React.ReactNode }

function typeBadge(type: string): BadgeDef {
  switch (type) {
    case "sms":          return { bg: "bg-violet-600",  icon: <MessageSquare className="w-2.5 h-2.5 text-white" /> };
    case "deposit":      return { bg: "bg-emerald-500", icon: <Wallet        className="w-2.5 h-2.5 text-white" /> };
    case "purchase":     return { bg: "bg-blue-500",    icon: <Phone         className="w-2.5 h-2.5 text-white" /> };
    case "refund":       return { bg: "bg-orange-500",  icon: <RefreshCw     className="w-2.5 h-2.5 text-white" /> };
    case "expired":      return { bg: "bg-red-500",     icon: <Clock         className="w-2.5 h-2.5 text-white" /> };
    case "security":     return { bg: "bg-red-600",     icon: <Shield        className="w-2.5 h-2.5 text-white" /> };
    case "bonus":        return { bg: "bg-emerald-600", icon: <Gift          className="w-2.5 h-2.5 text-white" /> };
    case "promotion":    return { bg: "bg-pink-500",    icon: <Star          className="w-2.5 h-2.5 text-white" /> };
    case "system":       return { bg: "bg-blue-600",    icon: <Zap           className="w-2.5 h-2.5 text-white" /> };
    case "announcement": return { bg: "bg-purple-600",  icon: <Megaphone     className="w-2.5 h-2.5 text-white" /> };
    default:             return { bg: "bg-violet-600",  icon: <Info          className="w-2.5 h-2.5 text-white" /> };
  }
}

/* ─── Notification avatar ───────────────────────────────────────── */

function NotifAvatar({ type, isRead }: { type: string; isRead: boolean }) {
  const badge = typeBadge(type);
  return (
    <div className="relative flex-shrink-0">
      <div
        className="w-[50px] h-[50px] rounded-full flex items-center justify-center"
        style={{
          background: isRead
            ? "linear-gradient(140deg, #4C1D95 0%, #2E0D7A 100%)"
            : "linear-gradient(140deg, #6D28D9 0%, #5B21B6 45%, #2E0D7A 100%)",
          boxShadow: isRead
            ? "0 2px 10px rgba(109,40,217,0.2)"
            : "0 4px 20px rgba(109,40,217,0.55), 0 0 0 1px rgba(167,139,250,0.2)",
        }}
      >
        <SimixIcon size={28} />
      </div>
      <div
        className={cn(
          "absolute bottom-0 right-0 w-[20px] h-[20px] rounded-full border-2 border-background flex items-center justify-center",
          badge.bg,
        )}
        style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }}
      >
        {badge.icon}
      </div>
      {!isRead && (
        <motion.div
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full bg-violet-400 border-2 border-background"
          style={{ boxShadow: "0 0 8px rgba(167,139,250,0.9)" }}
        />
      )}
    </div>
  );
}

/* ─── Single notification row ───────────────────────────────────── */

function NotifItem({ notif, onRead }: { notif: AppNotification; onRead: (id: string) => void }) {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    if (!notif.isRead) onRead(notif.id);
    if (notif.link) setLocation(notif.link);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-3.5 px-4 py-4 border-b border-card-border/20 last:border-0 cursor-pointer transition-colors active:scale-[0.99]",
        !notif.isRead ? "bg-violet-600/[0.06] hover:bg-violet-600/[0.09]" : "hover:bg-card/60",
      )}
      onClick={handleClick}
    >
      <NotifAvatar type={notif.type} isRead={notif.isRead} />
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className={cn(
            "text-sm font-bold leading-snug",
            notif.isRead ? "text-muted-foreground" : "text-foreground",
          )}>
            {notif.title}
          </p>
          <span className={cn(
            "text-[10px] font-medium flex-shrink-0",
            notif.isRead ? "text-muted-foreground/50" : "text-violet-400",
          )}>
            {formatDate(notif.createdAt)}
          </span>
        </div>
        <p className={cn(
          "text-xs leading-relaxed",
          notif.isRead ? "text-muted-foreground/55" : "text-muted-foreground",
        )}>
          {notif.body}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60" />
          <p className="text-[10px] font-medium" style={{ color: "rgba(139, 92, 246, 0.6)" }}>
            Simix · Numéros virtuels
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── SMS message card ──────────────────────────────────────────── */

interface SmsMessage {
  id: string;
  sender: string;
  body: string;
  code?: string;
  receivedAt: string;
}

interface NumberWithMessages {
  id: string;
  phoneNumber: string;
  status: string;
  service: { id: string; name: string; slug: string; color: string };
  country: { name: string; code: string; flag: string; dialCode: string };
  messages: SmsMessage[];
  createdAt: string;
}

function SmsCard({ num }: { num: NumberWithMessages }) {
  const [, setLocation] = useLocation();
  const msgs = num.messages ?? [];
  if (msgs.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mb-3 bg-card border border-card-border rounded-2xl overflow-hidden shadow-sm"
    >
      {/* Number header */}
      <button
        onClick={() => setLocation(`/numbers/${num.id}`)}
        className="w-full flex items-center gap-3 px-4 py-3 border-b border-card-border/40 hover:bg-secondary/40 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-500/10 flex-shrink-0">
          <ServiceIcon slug={num.service.slug} size={20} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-bold text-foreground truncate">{num.service.name}</p>
          <p className="text-[11px] text-muted-foreground font-mono">{num.country.flag} {num.phoneNumber}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-violet-400 font-semibold">
            {msgs.length} SMS
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </button>

      {/* Messages */}
      <div className="divide-y divide-card-border/20">
        {msgs.slice(0, 3).map((msg) => (
          <div key={msg.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-violet-400">{msg.sender}</span>
              <span className="text-[10px] text-muted-foreground/60">{formatRelative(msg.receivedAt)}</span>
            </div>
            {msg.code && (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg mb-1.5"
                style={{ background: "rgba(109,40,217,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}
              >
                <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">Code</span>
                <span className="text-sm font-black text-violet-300 tracking-widest">{msg.code}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{msg.body}</p>
          </div>
        ))}
        {msgs.length > 3 && (
          <button
            onClick={() => setLocation(`/numbers/${num.id}`)}
            className="w-full px-4 py-2.5 text-[11px] text-violet-400 font-semibold hover:bg-violet-500/5 transition-colors text-center"
          >
            Voir {msgs.length - 3} message{msgs.length - 3 > 1 ? "s" : ""} de plus →
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Notifications tab ─────────────────────────────────────────── */

function NotificationsTab() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications(true);

  if (loading && notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #3B1D6E 0%, #1E0A3C 100%)" }}>
          <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
        </div>
        <p className="text-xs text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  if (!loading && notifications.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4"
      >
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #3B1D6E 0%, #1E0A3C 100%)", boxShadow: "0 8px 32px rgba(109,40,217,0.3)" }}>
          <Bell className="w-9 h-9 text-violet-400/60" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground mb-1.5">Aucune notification</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
            Vos alertes de transactions, sécurité et promotions apparaîtront ici en temps réel.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      {/* Mark all read bar */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-card-border/30">
          <span className="text-xs text-muted-foreground">
            <span className="font-bold text-violet-400">{unreadCount}</span> non lue{unreadCount > 1 ? "s" : ""}
          </span>
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-violet-400 hover:bg-violet-500/10 transition-colors"
            style={{ border: "1px solid rgba(139,92,246,0.3)" }}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Tout marquer lu
          </button>
        </div>
      )}

      <AnimatePresence>
        {notifications.map((notif, i) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.25) }}
          >
            <NotifItem notif={notif} onRead={markRead} />
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="py-6 flex flex-col items-center gap-1.5">
        <SimixIcon size={20} />
        <p className="text-[10px] text-muted-foreground/40">Notifications sécurisées · Temps réel activé</p>
      </div>
    </div>
  );
}

/* ─── Messages tab ──────────────────────────────────────────────── */

function MessagesTab() {
  const { data, isLoading } = useListNumberHistory({ limit: 50, offset: 0 });

  const numbersWithMessages: NumberWithMessages[] = (
    (data as any)?.numbers ?? []
  ).filter((n: NumberWithMessages) => (n.messages ?? []).length > 0);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #3B1D6E 0%, #1E0A3C 100%)" }}>
          <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
        </div>
        <p className="text-xs text-muted-foreground">Chargement des messages…</p>
      </div>
    );
  }

  if (numbersWithMessages.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4"
      >
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #3B1D6E 0%, #1E0A3C 100%)", boxShadow: "0 8px 32px rgba(109,40,217,0.3)" }}>
          <Inbox className="w-9 h-9 text-violet-400/60" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground mb-1.5">Aucun message reçu</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
            Les SMS reçus sur vos numéros virtuels apparaîtront ici avec les codes de vérification.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="pt-3 pb-6">
      <AnimatePresence>
        {numbersWithMessages.map((num, i) => (
          <motion.div
            key={num.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.05, 0.3) }}
          >
            <SmsCard num={num} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─── Tab bar ───────────────────────────────────────────────────── */

type Tab = "notifications" | "messages";

function TabBar({ active, onSelect, unreadCount }: { active: Tab; onSelect: (t: Tab) => void; unreadCount: number }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "notifications",
      label: "Notifications",
      icon: <Bell className="w-4 h-4" />,
    },
    {
      id: "messages",
      label: "Messages",
      icon: <MessageSquare className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex border-b border-card-border/50 px-4 gap-1">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all relative",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.id === "notifications" && unreadCount > 0 && (
              <span className="min-w-[18px] h-[18px] bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            {isActive && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-violet-500 rounded-full"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Page content ──────────────────────────────────────────────── */

function NotificationsPageContent() {
  const [activeTab, setActiveTab] = useState<Tab>("notifications");
  const { unreadCount } = useNotifications(true);

  return (
    <div className="flex-1 flex flex-col w-full bg-background overflow-hidden">

      {/* ── Header ── */}
      <div
        className="px-5 pt-6 pb-0 sticky top-0 z-20"
        style={{
          background: "rgba(var(--background-rgb, 10,8,20), 0.97)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Centre de messages</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Notifications &amp; SMS reçus</p>
          </div>
          {/* Simix logo mark */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #6D28D9 0%, #4C1D95 100%)", boxShadow: "0 4px 16px rgba(109,40,217,0.4)" }}
          >
            <SimixIcon size={24} />
          </div>
        </div>

        {/* Tabs */}
        <TabBar active={activeTab} onSelect={setActiveTab} unreadCount={unreadCount} />
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: activeTab === "notifications" ? -12 : 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: activeTab === "notifications" ? 12 : -12 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "notifications" ? <NotificationsTab /> : <MessagesTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Export ────────────────────────────────────────────────────── */

export default function NotificationsPage() {
  return (
    <AuthGuard>
      <AppLayout>
        <NotificationsPageContent />
      </AppLayout>
    </AuthGuard>
  );
}
