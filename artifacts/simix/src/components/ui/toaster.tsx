import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DURATION = 4500;

const VARIANT_STYLES = {
  default: {
    accent: "#7c3aed",
    borderColor: "rgba(124,58,237,0.4)",
    bg: "rgba(16,10,36,0.97)",
    glowColor: "rgba(124,58,237,0.12)",
    icon: CheckCircle2,
    iconClass: "text-violet-400",
  },
  success: {
    accent: "#10b981",
    borderColor: "rgba(16,185,129,0.4)",
    bg: "rgba(6,22,18,0.97)",
    glowColor: "rgba(16,185,129,0.12)",
    icon: CheckCircle2,
    iconClass: "text-emerald-400",
  },
  destructive: {
    accent: "#ef4444",
    borderColor: "rgba(239,68,68,0.4)",
    bg: "rgba(22,6,6,0.97)",
    glowColor: "rgba(239,68,68,0.12)",
    icon: XCircle,
    iconClass: "text-red-400",
  },
  warning: {
    accent: "#f59e0b",
    borderColor: "rgba(245,158,11,0.4)",
    bg: "rgba(22,16,4,0.97)",
    glowColor: "rgba(245,158,11,0.12)",
    icon: AlertTriangle,
    iconClass: "text-amber-400",
  },
  info: {
    accent: "#3b82f6",
    borderColor: "rgba(59,130,246,0.4)",
    bg: "rgba(6,14,30,0.97)",
    glowColor: "rgba(59,130,246,0.12)",
    icon: Info,
    iconClass: "text-blue-400",
  },
} as const;

type VariantKey = keyof typeof VARIANT_STYLES;

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const visible = toasts.filter((t) => t.open);

  return (
    <div
      aria-live="assertive"
      className="fixed z-[200] bottom-5 left-0 right-0 flex flex-col items-center gap-2.5 pointer-events-none px-4 sm:items-end sm:right-5 sm:left-auto sm:w-[400px] sm:px-0"
    >
      <AnimatePresence mode="sync">
        {visible.map((t) => {
          const variantKey = (t.variant ?? "default") as VariantKey;
          const v = VARIANT_STYLES[variantKey] ?? VARIANT_STYLES.default;
          const Icon = v.icon;

          return (
            <motion.div
              key={t.id}
              role="alert"
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.94, transition: { duration: 0.16 } }}
              transition={{ type: "spring", damping: 22, stiffness: 320, mass: 0.7 }}
              className="pointer-events-auto relative overflow-hidden rounded-2xl w-full max-w-sm sm:max-w-none backdrop-blur-xl"
              style={{
                background: v.bg,
                border: `1px solid ${v.borderColor}`,
                boxShadow: `0 24px 64px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 40px ${v.glowColor}`,
              }}
            >
              {/* Top thin accent line */}
              <div
                className="absolute top-0 left-3 right-3 h-[1px] rounded-full opacity-60"
                style={{ background: `linear-gradient(90deg, transparent, ${v.accent} 40%, ${v.accent} 60%, transparent)` }}
              />

              {/* Left accent bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
                style={{ background: v.accent }}
              />

              {/* Content */}
              <div className="flex items-start gap-3 px-4 py-3.5 pl-[18px]">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-[-1px]"
                  style={{ background: `${v.accent}18` }}
                >
                  <Icon className={`w-4 h-4 ${v.iconClass}`} strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0 pt-[1px]">
                  {t.title && (
                    <p className="text-[13px] font-semibold text-white leading-snug tracking-[-0.01em]">
                      {t.title}
                    </p>
                  )}
                  {t.description && (
                    <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                      {t.description}
                    </p>
                  )}
                  {t.action && <div className="mt-2">{t.action}</div>}
                </div>

                <button
                  onClick={() => dismiss(t.id)}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/8 transition-all mt-[-1px]"
                  aria-label="Fermer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Progress bar */}
              <motion.div
                className="absolute bottom-0 left-0 h-[2px] rounded-full"
                style={{ background: v.accent, opacity: 0.5 }}
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: DURATION / 1000, ease: "linear" }}
                onAnimationComplete={() => dismiss(t.id)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
