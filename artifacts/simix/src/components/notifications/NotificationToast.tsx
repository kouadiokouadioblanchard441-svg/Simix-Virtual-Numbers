import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Wallet, Phone, Clock, RefreshCw, Info, Shield, Gift, Star, Zap, Megaphone } from "lucide-react";
import { useLocation } from "wouter";

export interface ToastNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  link?: string | null;
  createdAt: string;
}

const TOAST_DURATION = 5500;

function toastIcon(type: string) {
  switch (type) {
    case "sms":       return <MessageSquare className="w-4 h-4" />;
    case "deposit":   return <Wallet className="w-4 h-4" />;
    case "purchase":  return <Phone className="w-4 h-4" />;
    case "refund":    return <RefreshCw className="w-4 h-4" />;
    case "expired":   return <Clock className="w-4 h-4" />;
    case "security":  return <Shield className="w-4 h-4" />;
    case "bonus":     return <Gift className="w-4 h-4" />;
    case "promotion": return <Star className="w-4 h-4" />;
    case "system":    return <Zap className="w-4 h-4" />;
    case "announcement": return <Megaphone className="w-4 h-4" />;
    default:          return <Info className="w-4 h-4" />;
  }
}

function toastColors(type: string): { bg: string; border: string; icon: string; glow: string } {
  switch (type) {
    case "sms":       return { bg: "from-violet-600/20 to-indigo-600/15", border: "border-violet-500/40", icon: "text-violet-300 bg-violet-500/20", glow: "shadow-violet-500/20" };
    case "deposit":   return { bg: "from-green-600/20 to-emerald-600/15", border: "border-green-500/40", icon: "text-green-300 bg-green-500/20", glow: "shadow-green-500/20" };
    case "purchase":  return { bg: "from-blue-600/20 to-cyan-600/15", border: "border-blue-500/40", icon: "text-blue-300 bg-blue-500/20", glow: "shadow-blue-500/20" };
    case "refund":    return { bg: "from-orange-600/20 to-yellow-600/15", border: "border-orange-500/40", icon: "text-orange-300 bg-orange-500/20", glow: "shadow-orange-500/20" };
    case "expired":   return { bg: "from-red-600/15 to-orange-600/10", border: "border-red-500/30", icon: "text-red-300 bg-red-500/15", glow: "shadow-red-500/15" };
    case "security":  return { bg: "from-red-600/20 to-rose-600/15", border: "border-red-500/40", icon: "text-red-300 bg-red-500/20", glow: "shadow-red-500/20" };
    case "bonus":     return { bg: "from-green-600/20 to-teal-600/15", border: "border-green-500/40", icon: "text-green-300 bg-green-500/20", glow: "shadow-green-500/20" };
    default:          return { bg: "from-violet-600/15 to-purple-600/10", border: "border-violet-500/30", icon: "text-violet-300 bg-violet-500/15", glow: "shadow-violet-500/15" };
  }
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastNotification;
  onDismiss: (id: string) => void;
}) {
  const [, setLocation] = useLocation();
  const colors = toastColors(toast.type);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);
      setProgress(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const handleClick = () => {
    onDismiss(toast.id);
    const dest = toast.link || "/history";
    setLocation(dest);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`relative w-[320px] rounded-2xl border overflow-hidden cursor-pointer bg-gradient-to-br ${colors.bg} ${colors.border} shadow-xl ${colors.glow}`}
      style={{ backdropFilter: "blur(20px)" }}
      onClick={handleClick}
    >
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5">
        <motion.div
          className="h-full bg-white/30 rounded-full"
          style={{ width: `${progress}%` }}
          transition={{ duration: 0.05 }}
        />
      </div>

      <div className="flex items-start gap-3 px-4 py-3.5 pt-4">
        {/* Icon */}
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
          {toastIcon(toast.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight truncate">{toast.title}</p>
          <p className="text-xs text-white/65 mt-0.5 leading-relaxed line-clamp-2">{toast.body}</p>
        </div>

        {/* Close */}
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors flex-shrink-0 mt-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export function NotificationToast() {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const notif = (e as CustomEvent<ToastNotification>).detail;
      setToasts(prev => {
        if (prev.find(t => t.id === notif.id)) return prev;
        return [notif, ...prev].slice(0, 5);
      });

      setTimeout(() => dismiss(notif.id), TOAST_DURATION);
    };

    window.addEventListener("simix:notification", handler);
    return () => window.removeEventListener("simix:notification", handler);
  }, [dismiss]);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
