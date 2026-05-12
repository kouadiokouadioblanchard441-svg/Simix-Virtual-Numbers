import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Info, Trash2, X, CheckCircle2 } from "lucide-react";

/* ── Types ─────────────────────────────────────────────── */
type ConfirmVariant = "danger" | "warning" | "info" | "success";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface ConfirmCtx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

/* ── Context ────────────────────────────────────────────── */
const ConfirmContext = createContext<ConfirmCtx | null>(null);

const VARIANT_CFG = {
  danger: {
    icon: Trash2,
    iconBg: "bg-red-500/15",
    iconColor: "text-red-400",
    accent: "#ef4444",
    border: "border-red-800/30",
    confirmClass: "bg-red-600 hover:bg-red-700 text-white shadow-red-900/40",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-400",
    accent: "#f59e0b",
    border: "border-amber-800/30",
    confirmClass: "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-900/40",
  },
  info: {
    icon: Info,
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-400",
    accent: "#3b82f6",
    border: "border-blue-800/30",
    confirmClass: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/40",
  },
  success: {
    icon: CheckCircle2,
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-400",
    accent: "#7c3aed",
    border: "border-violet-800/30",
    confirmClass: "bg-violet-600 hover:bg-violet-700 text-white shadow-violet-900/40",
  },
} as const;

/* ── Provider ───────────────────────────────────────────── */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({
    title: "",
    variant: "danger",
  });

  const resolveRef = useRef<(val: boolean) => void>(() => {});

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setOpts({ variant: "danger", ...options });
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = () => {
    setOpen(false);
    resolveRef.current(true);
  };

  const handleCancel = () => {
    setOpen(false);
    resolveRef.current(false);
  };

  const cfg = VARIANT_CFG[opts.variant ?? "danger"];
  const Icon = cfg.icon;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm"
              onClick={handleCancel}
            />

            {/* Modal */}
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.93, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", damping: 22, stiffness: 320, mass: 0.8 }}
              className="fixed inset-0 z-[301] flex items-center justify-center px-4 pointer-events-none"
            >
              <div
                className={`pointer-events-auto w-full max-w-sm rounded-3xl border ${cfg.border} overflow-hidden`}
                style={{
                  background: "linear-gradient(160deg, rgba(20,14,40,0.98) 0%, rgba(12,8,24,0.99) 100%)",
                  boxShadow: `0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 60px ${cfg.accent}15`,
                }}
              >
                {/* Top accent line */}
                <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, transparent, ${cfg.accent}, transparent)` }} />

                <div className="p-6 space-y-4">
                  {/* Header */}
                  <div className="flex items-start gap-4">
                    <div className={`w-11 h-11 rounded-2xl ${cfg.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${cfg.iconColor}`} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <h2 className="text-white font-semibold text-base leading-snug">{opts.title}</h2>
                      {opts.message && (
                        <p className="text-zinc-400 text-sm mt-1.5 leading-relaxed">{opts.message}</p>
                      )}
                    </div>
                    <button
                      onClick={handleCancel}
                      className="flex-shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors p-1 rounded-xl hover:bg-white/5 -mt-0.5 -mr-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2.5 pt-1">
                    <button
                      onClick={handleCancel}
                      className="flex-1 px-4 py-2.5 rounded-2xl border border-zinc-700/60 text-zinc-400 text-sm font-medium hover:bg-white/5 hover:text-white transition-all"
                    >
                      {opts.cancelLabel ?? "Annuler"}
                    </button>
                    <button
                      onClick={handleConfirm}
                      className={`flex-1 px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-lg transition-all ${cfg.confirmClass}`}
                    >
                      {opts.confirmLabel ?? "Confirmer"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

/* ── Hook ───────────────────────────────────────────────── */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmDialogProvider>");
  return ctx.confirm;
}
