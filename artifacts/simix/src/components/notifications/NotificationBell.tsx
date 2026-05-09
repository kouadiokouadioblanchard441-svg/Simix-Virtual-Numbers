import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Check, CheckCheck, Info, Shield, Gift, Megaphone, Zap, Star, Loader2 } from "lucide-react";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { Link } from "wouter";

function typeIcon(type: string) {
  switch (type) {
    case "security": return <Shield className="w-3.5 h-3.5 text-red-400" />;
    case "bonus": return <Gift className="w-3.5 h-3.5 text-green-400" />;
    case "promotion": return <Star className="w-3.5 h-3.5 text-amber-400" />;
    case "system": return <Zap className="w-3.5 h-3.5 text-blue-400" />;
    case "announcement": return <Megaphone className="w-3.5 h-3.5 text-purple-400" />;
    default: return <Info className="w-3.5 h-3.5 text-violet-400" />;
  }
}

function typeColor(type: string) {
  switch (type) {
    case "security": return "bg-red-500/15 border-red-500/20";
    case "bonus": return "bg-green-500/15 border-green-500/20";
    case "promotion": return "bg-amber-500/15 border-amber-500/20";
    case "system": return "bg-blue-500/15 border-blue-500/20";
    case "announcement": return "bg-purple-500/15 border-purple-500/20";
    default: return "bg-violet-500/15 border-violet-500/20";
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "À l'instant";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}j`;
}

function NotifItem({ notif, onRead }: { notif: AppNotification; onRead: (id: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:brightness-110 ${
        notif.isRead ? "bg-white/3 border-white/5" : `${typeColor(notif.type)}`
      }`}
      onClick={() => { if (!notif.isRead) onRead(notif.id); }}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
        notif.isRead ? "bg-white/5" : typeColor(notif.type)
      }`}>
        {typeIcon(notif.type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs font-semibold leading-tight ${notif.isRead ? "text-white/60" : "text-white"}`}>
            {notif.title}
          </p>
          <span className="text-[10px] text-white/30 flex-shrink-0">{timeAgo(notif.createdAt)}</span>
        </div>
        <p className={`text-[11px] mt-0.5 leading-relaxed line-clamp-2 ${notif.isRead ? "text-white/35" : "text-white/70"}`}>
          {notif.body}
        </p>
      </div>
      {!notif.isRead && (
        <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0 mt-1.5 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
      )}
    </motion.div>
  );
}

export function NotificationBell({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications(isAuthenticated);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center text-foreground relative hover:bg-secondary transition-colors"
      >
        <motion.div
          animate={unreadCount > 0 ? { rotate: [0, -15, 15, -10, 10, 0] } : {}}
          transition={{ duration: 0.5, repeat: unreadCount > 0 ? Infinity : 0, repeatDelay: 4 }}
        >
          <Bell className="w-[18px] h-[18px]" />
        </motion.div>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 border-2 border-card rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute right-0 top-12 z-50 w-[340px] max-h-[500px] flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(160deg, rgba(18,12,35,0.98) 0%, rgba(12,8,25,0.98) 100%)",
              border: "1px solid rgba(124,58,237,0.3)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(124,58,237,0.15)",
              backdropFilter: "blur(20px)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-violet-400" />
                <span className="text-white font-bold text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <span className="bg-violet-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {unreadCount} non lues
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="p-1.5 text-white/40 hover:text-green-400 rounded-lg hover:bg-white/5 transition-colors"
                    title="Tout marquer lu"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(124,58,237,0.3) transparent" }}>
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-3">
                    <Bell className="w-6 h-6 text-violet-400/50" />
                  </div>
                  <p className="text-white/50 text-sm font-medium">Aucune notification</p>
                  <p className="text-white/25 text-xs mt-1">Les nouvelles notifications apparaîtront ici</p>
                </div>
              ) : (
                notifications.map(n => (
                  <NotifItem key={n.id} notif={n} onRead={markRead} />
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2.5 border-t border-white/8 flex-shrink-0">
                <p className="text-[10px] text-white/25 text-center">
                  Temps réel activé · Notifications sécurisées
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
