import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, CheckCheck, Loader2, Bell,
  MessageSquare, Wallet, Phone, RefreshCw, Clock,
  Shield, Gift, Star, Zap, Megaphone, Info,
} from "lucide-react";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { SimixIcon } from "@/components/simix-logo";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/* ─── Helpers ─────────────────────────────────────────────────────── */

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "EEE d MMM yyyy 'à' HH:mm", { locale: fr });
  } catch {
    return dateStr;
  }
}

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

/* ─── Notification avatar: Simix logo + type badge ────────────────── */

function NotifAvatar({ type, isRead }: { type: string; isRead: boolean }) {
  const badge = typeBadge(type);
  return (
    <div className="relative flex-shrink-0">
      {/* Outer circle — Simix violet gradient */}
      <div
        className="w-[54px] h-[54px] rounded-full flex items-center justify-center"
        style={{
          background: isRead
            ? "linear-gradient(140deg, #4C1D95 0%, #2E0D7A 100%)"
            : "linear-gradient(140deg, #6D28D9 0%, #5B21B6 45%, #2E0D7A 100%)",
          boxShadow: isRead
            ? "0 2px 10px rgba(109,40,217,0.2)"
            : "0 4px 20px rgba(109,40,217,0.55), 0 0 0 1px rgba(167,139,250,0.2)",
        }}
      >
        <SimixIcon size={34} />
      </div>

      {/* Type badge — bottom-right */}
      <div
        className={`absolute bottom-0 right-0 w-[22px] h-[22px] rounded-full border-2 border-background flex items-center justify-center ${badge.bg}`}
        style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }}
      >
        {badge.icon}
      </div>

      {/* Unread indicator — top-left pulsing dot */}
      {!isRead && (
        <motion.div
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-violet-400 border-2 border-background"
          style={{ boxShadow: "0 0 8px rgba(167,139,250,0.9)" }}
        />
      )}
    </div>
  );
}

/* ─── Single notification row ─────────────────────────────────────── */

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
      className={`flex gap-4 px-4 py-4 border-b border-card-border/25 last:border-0 cursor-pointer transition-colors active:scale-[0.99] ${
        !notif.isRead
          ? "bg-violet-600/[0.06] hover:bg-violet-600/[0.09]"
          : "hover:bg-card/60"
      }`}
      onClick={handleClick}
    >
      <NotifAvatar type={notif.type} isRead={notif.isRead} />

      <div className="flex-1 min-w-0 pt-0.5">
        {/* Title + date row */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className={`text-sm font-bold leading-snug ${notif.isRead ? "text-muted-foreground" : "text-foreground"}`}>
            {notif.title}
          </p>
          <span className={`text-[10px] font-medium flex-shrink-0 ${notif.isRead ? "text-muted-foreground/50" : "text-violet-400"}`}>
            {formatDate(notif.createdAt)}
          </span>
        </div>

        {/* Body */}
        <p className={`text-xs leading-relaxed ${notif.isRead ? "text-muted-foreground/55" : "text-muted-foreground"}`}>
          {notif.body}
        </p>

        {/* Simix branding line */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60" />
          <p className="text-[10px] font-medium"
            style={{ color: "rgba(139, 92, 246, 0.6)" }}
          >
            Simix · Numéros virtuels
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Page content ────────────────────────────────────────────────── */

function NotificationsContent() {
  const [, setLocation] = useLocation();
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications(true);

  return (
    <div className="flex-1 flex flex-col w-full bg-background overflow-hidden">

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 pt-6 pb-3 border-b border-card-border/50 sticky top-0 z-20"
        style={{
          background: "rgba(var(--background-rgb, 10,8,20), 0.95)",
          backdropFilter: "blur(16px)",
        }}
      >
        {/* Back */}
        <button
          onClick={() => setLocation("/dashboard")}
          className="w-10 h-10 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>

        {/* Title */}
        <div className="flex flex-col items-center">
          <h1 className="text-base font-bold text-foreground">Notifications</h1>
          {unreadCount > 0 && (
            <span className="text-[10px] font-semibold text-violet-400 mt-0.5">
              {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Mark all read */}
        <button
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            border: "1px solid rgba(139,92,246,0.45)",
            color: "#a78bfa",
            background: unreadCount > 0 ? "rgba(109,40,217,0.08)" : "transparent",
          }}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Tout lire
        </button>
      </div>

      {/* ── Notification list ── */}
      <div className="flex-1 overflow-y-auto pb-28">

        {/* Loading */}
        {loading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #3B1D6E 0%, #1E0A3C 100%)" }}
            >
              <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
            </div>
            <p className="text-xs text-muted-foreground">Chargement des notifications…</p>
          </div>
        )}

        {/* Empty */}
        {!loading && notifications.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4"
          >
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #3B1D6E 0%, #1E0A3C 100%)",
                boxShadow: "0 8px 32px rgba(109,40,217,0.3)",
              }}
            >
              <Bell className="w-10 h-10 text-violet-400/60" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground mb-1.5">Aucune notification</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
                Vos notifications de transactions, sécurité et promotions apparaîtront ici en temps réel.
              </p>
            </div>
            {/* Decorative dots */}
            <div className="flex gap-2 mt-2">
              {[0.4, 0.7, 0.5].map((o, i) => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3 }}
                  className="w-1.5 h-1.5 rounded-full bg-violet-500"
                  style={{ opacity: o }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* List */}
        <AnimatePresence>
          {notifications.map((notif, i) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.3) }}
            >
              <NotifItem notif={notif} onRead={markRead} />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Footer branding when there are items */}
        {notifications.length > 0 && (
          <div className="py-6 flex flex-col items-center gap-1.5">
            <SimixIcon size={22} />
            <p className="text-[10px] text-muted-foreground/40">
              Notifications sécurisées · Temps réel activé
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Export ──────────────────────────────────────────────────────── */

export default function ProfileNotifications() {
  return (
    <AuthGuard>
      <AppLayout>
        <NotificationsContent />
      </AppLayout>
    </AuthGuard>
  );
}
