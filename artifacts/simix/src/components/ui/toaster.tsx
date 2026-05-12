import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DURATION = 4500;

const VARIANT_STYLES = {
  default: {
    accent: "#7c3aed",
    borderColor: "rgba(124,58,237,0.35)",
    bg: "linear-gradient(135deg, rgba(46,16,101,0.55) 0%, rgba(15,10,30,0.95) 100%)",
    icon: CheckCircle2,
    iconClass: "text-violet-400",
  },
  success: {
    accent: "#10b981",
    borderColor: "rgba(16,185,129,0.35)",
    bg: "linear-gradient(135deg, rgba(6,78,59,0.45) 0%, rgba(15,10,30,0.95) 100%)",
    icon: CheckCircle2,
    iconClass: "text-emerald-400",
  },
  destructive: {
    accent: "#ef4444",
    borderColor: "rgba(239,68,68,0.35)",
    bg: "linear-gradient(135deg, rgba(69,10,10,0.55) 0%, rgba(15,10,30,0.95) 100%)",
    icon: XCircle,
    iconClass: "text-red-400",
  },
  warning: {
    accent: "#f59e0b",
    borderColor: "rgba(245,158,11,0.35)",
    bg: "linear-gradient(135deg, rgba(69,45,5,0.55) 0%, rgba(15,10,30,0.95) 100%)",
    icon: AlertTriangle,
    iconClass: "text-amber-400",
  },
  info: {
    accent: "#3b82f6",
    borderColor: "rgba(59,130,246,0.35)",
    bg: "linear-gradient(135deg, rgba(10,30,75,0.55) 0%, rgba(15,10,30,0.95) 100%)",
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
      className="fixed bottom-5 right-4 z-[200] flex flex-col gap-2.5 w-[calc(100vw-2rem)] sm:w-[400px] pointer-events-none"
    >
      <AnimatePresence mode="sync">
        {visible.map((t) => {
          const variantKey = ((t.variant ?? "default") as VariantKey);
          const v = VARIANT_STYLES[variantKey] ?? VARIANT_STYLES.default;
          const Icon = v.icon;

          return (
            <motion.div
              key={t.id}
              role="alert"
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.93, transition: { duration: 0.18 } }}
              transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.75 }}
              className="pointer-events-auto relative overflow-hidden rounded-2xl backdrop-blur-md"
              style={{
                background: v.bg,
                border: `1px solid ${v.borderColor}`,
                boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset`,
              }}
            >
              {/* Left accent bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
                style={{ background: v.accent }}
              />

              {/* Main content */}
              <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
                <Icon
                  className={`w-5 h-5 mt-[1px] flex-shrink-0 ${v.iconClass}`}
                  strokeWidth={2}
                />
                <div className="flex-1 min-w-0">
                  {t.title && (
                    <p className="text-sm font-semibold text-white leading-snug">
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

                {/* Close button */}
                <button
                  onClick={() => dismiss(t.id)}
                  className="flex-shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-white/6 mt-[-2px]"
                  aria-label="Fermer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Progress bar */}
              <motion.div
                className="absolute bottom-0 left-0 h-[2px]"
                style={{ background: v.accent, opacity: 0.55 }}
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
