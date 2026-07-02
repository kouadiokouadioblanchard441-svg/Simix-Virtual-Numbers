import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DURATION = 4000;

const VARIANT_STYLES = {
  default: {
    accent: "#7c3aed",
    borderColor: "rgba(124,58,237,0.45)",
    bg: "linear-gradient(145deg, rgba(22,12,50,0.99) 0%, rgba(14,8,36,0.99) 100%)",
    glowColor: "rgba(124,58,237,0.18)",
    overlayColor: "rgba(10,5,25,0.55)",
    icon: CheckCircle2,
    iconBg: "rgba(124,58,237,0.15)",
    iconColor: "#a78bfa",
    label: "Notification",
  },
  success: {
    accent: "#10b981",
    borderColor: "rgba(16,185,129,0.45)",
    bg: "linear-gradient(145deg, rgba(4,22,16,0.99) 0%, rgba(2,14,10,0.99) 100%)",
    glowColor: "rgba(16,185,129,0.18)",
    overlayColor: "rgba(2,10,8,0.55)",
    icon: CheckCircle2,
    iconBg: "rgba(16,185,129,0.15)",
    iconColor: "#34d399",
    label: "Succès",
  },
  destructive: {
    accent: "#ef4444",
    borderColor: "rgba(239,68,68,0.45)",
    bg: "linear-gradient(145deg, rgba(24,6,6,0.99) 0%, rgba(16,4,4,0.99) 100%)",
    glowColor: "rgba(239,68,68,0.18)",
    overlayColor: "rgba(12,3,3,0.55)",
    icon: XCircle,
    iconBg: "rgba(239,68,68,0.15)",
    iconColor: "#f87171",
    label: "Erreur",
  },
  warning: {
    accent: "#f59e0b",
    borderColor: "rgba(245,158,11,0.45)",
    bg: "linear-gradient(145deg, rgba(24,18,4,0.99) 0%, rgba(16,12,2,0.99) 100%)",
    glowColor: "rgba(245,158,11,0.18)",
    overlayColor: "rgba(12,9,2,0.55)",
    icon: AlertTriangle,
    iconBg: "rgba(245,158,11,0.15)",
    iconColor: "#fbbf24",
    label: "Attention",
  },
  info: {
    accent: "#3b82f6",
    borderColor: "rgba(59,130,246,0.45)",
    bg: "linear-gradient(145deg, rgba(4,14,32,0.99) 0%, rgba(2,8,22,0.99) 100%)",
    glowColor: "rgba(59,130,246,0.18)",
    overlayColor: "rgba(2,6,16,0.55)",
    icon: Info,
    iconBg: "rgba(59,130,246,0.15)",
    iconColor: "#60a5fa",
    label: "Information",
  },
} as const;

type VariantKey = keyof typeof VARIANT_STYLES;

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const visible = toasts.filter((t) => t.open);
  const current = visible[0] ?? null;

  return (
    <AnimatePresence mode="wait">
      {current && (() => {
        const variantKey = (current.variant ?? "default") as VariantKey;
        const v = VARIANT_STYLES[variantKey] ?? VARIANT_STYLES.default;
        const Icon = v.icon;

        return (
          <>
            {/* Backdrop */}
            <motion.div
              key={`backdrop-${current.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[198] pointer-events-none"
              style={{ background: v.overlayColor, backdropFilter: "blur(2px)" }}
            />

            {/* Toast card — center screen */}
            <motion.div
              key={current.id}
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              initial={{ opacity: 0, scale: 0.82, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10, transition: { duration: 0.18, ease: "easeIn" } }}
              transition={{ type: "spring", damping: 20, stiffness: 340, mass: 0.7 }}
              className="fixed z-[199] left-1/2 top-1/2 pointer-events-auto"
              style={{ translateX: "-50%", translateY: "-50%" }}
            >
              <div
                className="relative overflow-hidden rounded-3xl w-[calc(100vw-48px)] max-w-sm"
                style={{
                  background: v.bg,
                  border: `1px solid ${v.borderColor}`,
                  boxShadow: `0 32px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 80px ${v.glowColor}`,
                }}
              >
                {/* Top accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-[2px]"
                  style={{ background: `linear-gradient(90deg, transparent, ${v.accent} 30%, ${v.accent} 70%, transparent)` }}
                />

                <div className="px-6 pt-7 pb-6 flex flex-col items-center text-center gap-4">
                  {/* Icon */}
                  <motion.div
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 14, stiffness: 380, delay: 0.06 }}
                    className="w-16 h-16 rounded-[22px] flex items-center justify-center"
                    style={{
                      background: v.iconBg,
                      border: `1px solid ${v.borderColor}`,
                      boxShadow: `0 8px 32px ${v.glowColor}`,
                    }}
                  >
                    <Icon
                      className="w-8 h-8"
                      style={{ color: v.iconColor }}
                      strokeWidth={2}
                    />
                  </motion.div>

                  {/* Label */}
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-[11px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: v.accent }}
                  >
                    {v.label}
                  </motion.span>

                  {/* Title */}
                  {current.title && (
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 }}
                      className="text-[17px] font-bold text-white leading-snug tracking-[-0.02em] -mt-2"
                    >
                      {current.title}
                    </motion.p>
                  )}

                  {/* Description */}
                  {current.description && (
                    <motion.p
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.16 }}
                      className="text-[13.5px] text-zinc-400 leading-relaxed -mt-1"
                    >
                      {current.description}
                    </motion.p>
                  )}

                  {/* Action button */}
                  {current.action && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="w-full mt-1"
                    >
                      {current.action}
                    </motion.div>
                  )}
                </div>

                {/* Close button */}
                <button
                  onClick={() => dismiss(current.id)}
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl text-zinc-600 hover:text-zinc-300 transition-colors"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Progress bar */}
                <motion.div
                  className="absolute bottom-0 left-0 h-[3px]"
                  style={{ background: `linear-gradient(90deg, ${v.accent}60, ${v.accent})`, borderRadius: "0 0 0 24px" }}
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: DURATION / 1000, ease: "linear" }}
                  onAnimationComplete={() => dismiss(current.id)}
                />
              </div>
            </motion.div>
          </>
        );
      })()}
    </AnimatePresence>
  );
}
