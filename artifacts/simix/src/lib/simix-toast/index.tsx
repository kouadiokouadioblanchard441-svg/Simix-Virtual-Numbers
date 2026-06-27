import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { AnimatePresence, motion, PanInfo } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Wifi,
  WifiOff,
  CreditCard,
  ShieldAlert,
  X,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────────────────── */

export type ToastType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading"
  | "network"
  | "payment"
  | "security";

export type ToastPosition =
  | "top-right"
  | "top-center"
  | "bottom-center"
  | "bottom-right";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  title: string;
  description?: string;
  duration?: number;
  position?: ToastPosition;
  action?: ToastAction;
}

interface ToastItem extends Required<Omit<ToastOptions, "action" | "id">> {
  id: string;
  type: ToastType;
  createdAt: number;
  dedupeKey: string;
  action?: ToastAction;
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */

const MAX_VISIBLE = 4;
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4500,
  loading: 0,
  network: 5000,
  payment: 5500,
  security: 6000,
};

const DEFAULT_POSITION: ToastPosition = "bottom-center";

/* ─────────────────────────────────────────────────────────────────────────────
   DESIGN TOKENS — per type
───────────────────────────────────────────────────────────────────────────── */

const TYPE_CONFIG: Record<
  ToastType,
  {
    accent: string;
    border: string;
    bg: string;
    glow: string;
    iconColor: string;
    Icon: React.ElementType;
    label: string;
    spin?: boolean;
    wifiOff?: boolean;
  }
> = {
  success: {
    accent: "#10b981",
    border: "rgba(16,185,129,0.35)",
    bg: "rgba(5,20,14,0.96)",
    glow: "rgba(16,185,129,0.14)",
    iconColor: "#10b981",
    Icon: CheckCircle2,
    label: "Succès",
  },
  error: {
    accent: "#ef4444",
    border: "rgba(239,68,68,0.35)",
    bg: "rgba(20,5,5,0.96)",
    glow: "rgba(239,68,68,0.14)",
    iconColor: "#ef4444",
    Icon: XCircle,
    label: "Erreur",
  },
  warning: {
    accent: "#f59e0b",
    border: "rgba(245,158,11,0.35)",
    bg: "rgba(20,14,2,0.96)",
    glow: "rgba(245,158,11,0.14)",
    iconColor: "#f59e0b",
    Icon: AlertTriangle,
    label: "Attention",
  },
  info: {
    accent: "#3b82f6",
    border: "rgba(59,130,246,0.35)",
    bg: "rgba(4,12,28,0.96)",
    glow: "rgba(59,130,246,0.14)",
    iconColor: "#3b82f6",
    Icon: Info,
    label: "Info",
  },
  loading: {
    accent: "#8b5cf6",
    border: "rgba(139,92,246,0.35)",
    bg: "rgba(10,6,24,0.96)",
    glow: "rgba(139,92,246,0.14)",
    iconColor: "#8b5cf6",
    Icon: Loader2,
    label: "Chargement",
    spin: true,
  },
  network: {
    accent: "#06b6d4",
    border: "rgba(6,182,212,0.35)",
    bg: "rgba(3,14,20,0.96)",
    glow: "rgba(6,182,212,0.14)",
    iconColor: "#06b6d4",
    Icon: Wifi,
    label: "Réseau",
  },
  payment: {
    accent: "#34d399",
    border: "rgba(52,211,153,0.35)",
    bg: "rgba(3,18,14,0.96)",
    glow: "rgba(52,211,153,0.14)",
    iconColor: "#34d399",
    Icon: CreditCard,
    label: "Paiement",
  },
  security: {
    accent: "#f97316",
    border: "rgba(249,115,22,0.35)",
    bg: "rgba(20,10,3,0.96)",
    glow: "rgba(249,115,22,0.14)",
    iconColor: "#f97316",
    Icon: ShieldAlert,
    label: "Sécurité",
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   POSITION CLASSES
───────────────────────────────────────────────────────────────────────────── */

const POSITION_CLASSES: Record<ToastPosition, string> = {
  "top-right": "top-4 right-4 items-end",
  "top-center": "top-4 left-0 right-0 items-center",
  "bottom-center": "bottom-4 left-0 right-0 items-center",
  "bottom-right": "bottom-4 right-4 items-end",
};

const SLIDE_IN: Record<ToastPosition, object> = {
  "top-right": { x: 60, opacity: 0, scale: 0.94 },
  "top-center": { y: -30, opacity: 0, scale: 0.94 },
  "bottom-center": { y: 30, opacity: 0, scale: 0.94 },
  "bottom-right": { x: 60, opacity: 0, scale: 0.94 },
};

/* ─────────────────────────────────────────────────────────────────────────────
   STATE & REDUCER
───────────────────────────────────────────────────────────────────────────── */

interface State {
  queue: ToastItem[];
  visible: ToastItem[];
}

type Action =
  | { type: "ADD"; toast: ToastItem }
  | { type: "DISMISS"; id: string }
  | { type: "DISMISS_ALL" }
  | { type: "PROMOTE" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD": {
      const allDedupeKeys = [
        ...state.visible.map((t) => t.dedupeKey),
        ...state.queue.map((t) => t.dedupeKey),
      ];
      if (allDedupeKeys.includes(action.toast.dedupeKey)) return state;

      if (state.visible.length < MAX_VISIBLE) {
        return { ...state, visible: [...state.visible, action.toast] };
      }
      return { ...state, queue: [...state.queue, action.toast] };
    }
    case "DISMISS": {
      const newVisible = state.visible.filter((t) => t.id !== action.id);
      if (state.queue.length > 0) {
        const [next, ...rest] = state.queue;
        return { visible: [...newVisible, next], queue: rest };
      }
      return { ...state, visible: newVisible };
    }
    case "DISMISS_ALL":
      return { visible: [], queue: [] };
    case "PROMOTE": {
      if (state.queue.length > 0 && state.visible.length < MAX_VISIBLE) {
        const [next, ...rest] = state.queue;
        return { visible: [...state.visible, next], queue: rest };
      }
      return state;
    }
    default:
      return state;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONTEXT
───────────────────────────────────────────────────────────────────────────── */

interface ToastContextValue {
  show: (type: ToastType, opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/* ─────────────────────────────────────────────────────────────────────────────
   SINGLETON — allows calling toast() outside React tree
───────────────────────────────────────────────────────────────────────────── */

let _dispatch: ((type: ToastType, opts: ToastOptions) => string) | null = null;
let _dismiss: ((id: string) => void) | null = null;
let _dismissAll: (() => void) | null = null;

/* ─────────────────────────────────────────────────────────────────────────────
   PROGRESS BAR
───────────────────────────────────────────────────────────────────────────── */

function ProgressBar({
  duration,
  accent,
  onComplete,
}: {
  duration: number;
  accent: string;
  onComplete: () => void;
}) {
  return (
    <motion.div
      className="absolute bottom-0 left-0 h-[2.5px] rounded-full"
      style={{ background: accent, opacity: 0.7 }}
      initial={{ width: "100%" }}
      animate={{ width: "0%" }}
      transition={{ duration: duration / 1000, ease: "linear" }}
      onAnimationComplete={onComplete}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ANIMATED ICON
───────────────────────────────────────────────────────────────────────────── */

function ToastIcon({
  cfg,
  type,
  isNetworkError,
}: {
  cfg: (typeof TYPE_CONFIG)[ToastType];
  type: ToastType;
  isNetworkError?: boolean;
}) {
  const Icon = isNetworkError ? WifiOff : cfg.Icon;
  return (
    <motion.div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${cfg.accent}18` }}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", damping: 14, stiffness: 300, delay: 0.05 }}
    >
      <motion.div
        animate={cfg.spin ? { rotate: 360 } : {}}
        transition={
          cfg.spin ? { repeat: Infinity, duration: 1, ease: "linear" } : {}
        }
      >
        <Icon
          className="w-[18px] h-[18px]"
          style={{ color: cfg.iconColor }}
          strokeWidth={2.2}
        />
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SINGLE TOAST ITEM
───────────────────────────────────────────────────────────────────────────── */

function ToastCard({
  toast,
  position,
  onDismiss,
}: {
  toast: ToastItem;
  position: ToastPosition;
  onDismiss: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[toast.type];
  const isNetworkError =
    toast.type === "network" &&
    (toast.title.toLowerCase().includes("perd") ||
      toast.title.toLowerCase().includes("hors") ||
      toast.title.toLowerCase().includes("off") ||
      toast.title.toLowerCase().includes("lost"));

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const threshold = 80;
    const isRight =
      position === "top-right" || position === "bottom-right";
    if (Math.abs(info.offset.x) > threshold || Math.abs(info.offset.y) > threshold) {
      onDismiss(toast.id);
    }
  };

  return (
    <motion.div
      key={toast.id}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      layout
      layoutId={toast.id}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      initial={SLIDE_IN[position]}
      animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.92,
        filter: "blur(2px)",
        transition: { duration: 0.2, ease: "easeIn" },
      }}
      transition={{ type: "spring", damping: 24, stiffness: 320, mass: 0.8 }}
      className="pointer-events-auto relative overflow-hidden rounded-2xl w-full cursor-grab active:cursor-grabbing select-none"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 50px ${cfg.glow}`,
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        maxWidth: "26rem",
      }}
    >
      {/* Top shimmer line */}
      <div
        className="absolute top-0 left-4 right-4 h-px rounded-full"
        style={{
          background: `linear-gradient(90deg, transparent, ${cfg.accent}80 40%, ${cfg.accent}80 60%, transparent)`,
        }}
      />

      {/* Left accent bar */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        style={{ background: cfg.accent }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />

      {/* Content */}
      <div className="flex items-start gap-3 px-4 py-3.5 pl-[18px]">
        <ToastIcon cfg={cfg} type={toast.type} isNetworkError={isNetworkError} />

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2 mb-0.5">
            <motion.span
              className="text-[10px] font-semibold uppercase tracking-wider opacity-60"
              style={{ color: cfg.accent }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ delay: 0.1 }}
            >
              {cfg.label}
            </motion.span>
          </div>
          <motion.p
            className="text-[13px] font-semibold text-white leading-snug tracking-[-0.01em]"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            {toast.title}
          </motion.p>
          {toast.description && (
            <motion.p
              className="text-[12px] text-zinc-400 mt-0.5 leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 }}
            >
              {toast.description}
            </motion.p>
          )}
          {toast.action && (
            <motion.button
              onClick={() => {
                toast.action!.onClick();
                onDismiss(toast.id);
              }}
              className="mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all"
              style={{
                color: cfg.accent,
                background: `${cfg.accent}18`,
                border: `1px solid ${cfg.accent}30`,
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              {toast.action.label}
            </motion.button>
          )}
        </div>

        <motion.button
          onClick={() => onDismiss(toast.id)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white transition-all mt-[-2px]"
          style={{ background: "rgba(255,255,255,0.05)" }}
          aria-label="Fermer"
          whileHover={{ scale: 1.1, background: "rgba(255,255,255,0.12)" }}
          whileTap={{ scale: 0.9 }}
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      </div>

      {/* Progress bar */}
      {toast.duration > 0 && (
        <ProgressBar
          duration={toast.duration}
          accent={cfg.accent}
          onComplete={() => onDismiss(toast.id)}
        />
      )}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONTAINER — renders one stack per position used
───────────────────────────────────────────────────────────────────────────── */

function ToastContainer({
  toasts,
  position,
  onDismiss,
}: {
  toasts: ToastItem[];
  position: ToastPosition;
  onDismiss: (id: string) => void;
}) {
  const isBottom = position.startsWith("bottom");
  return (
    <div
      className={`fixed z-[9999] flex flex-col pointer-events-none px-3 sm:px-0 gap-2.5 ${POSITION_CLASSES[position]}`}
      style={{
        maxWidth: "calc(100vw - 24px)",
        flexDirection: isBottom ? "column-reverse" : "column",
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {toasts.map((t) => (
          <ToastCard
            key={t.id}
            toast={t}
            position={position}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PROVIDER
───────────────────────────────────────────────────────────────────────────── */

export function SimixToastProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { queue: [], visible: [] });

  const show = useCallback((type: ToastType, opts: ToastOptions): string => {
    const id = opts.id ?? `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration =
      opts.duration !== undefined
        ? opts.duration
        : DEFAULT_DURATIONS[type];
    const position = opts.position ?? DEFAULT_POSITION;
    const dedupeKey = `${type}::${opts.title}`;
    const toast: ToastItem = {
      id,
      type,
      title: opts.title,
      description: opts.description ?? "",
      duration,
      position,
      createdAt: Date.now(),
      dedupeKey,
      action: opts.action,
    };
    dispatch({ type: "ADD", toast });
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    dispatch({ type: "DISMISS", id });
  }, []);

  const dismissAll = useCallback(() => {
    dispatch({ type: "DISMISS_ALL" });
  }, []);

  useEffect(() => {
    _dispatch = show;
    _dismiss = dismiss;
    _dismissAll = dismissAll;
    return () => {
      _dispatch = null;
      _dismiss = null;
      _dismissAll = null;
    };
  }, [show, dismiss, dismissAll]);

  const byPosition = useMemo(() => {
    const map = new Map<ToastPosition, ToastItem[]>();
    for (const t of state.visible) {
      const pos = t.position;
      if (!map.has(pos)) map.set(pos, []);
      map.get(pos)!.push(t);
    }
    return map;
  }, [state.visible]);

  return (
    <ToastContext.Provider value={{ show, dismiss, dismissAll }}>
      {children}
      {Array.from(byPosition.entries()).map(([position, toasts]) => (
        <ToastContainer
          key={position}
          position={position}
          toasts={toasts}
          onDismiss={dismiss}
        />
      ))}
    </ToastContext.Provider>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   HOOK
───────────────────────────────────────────────────────────────────────────── */

export function useSimixToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useSimixToast must be used inside SimixToastProvider");

  return useMemo(
    () => ({
      showSuccess: (opts: ToastOptions) => ctx.show("success", opts),
      showError: (opts: ToastOptions) => ctx.show("error", opts),
      showWarning: (opts: ToastOptions) => ctx.show("warning", opts),
      showInfo: (opts: ToastOptions) => ctx.show("info", opts),
      showLoading: (opts: ToastOptions) =>
        ctx.show("loading", { duration: 0, ...opts }),
      showNetwork: (opts: ToastOptions) => ctx.show("network", opts),
      showPayment: (opts: ToastOptions) => ctx.show("payment", opts),
      showSecurity: (opts: ToastOptions) => ctx.show("security", opts),
      show: ctx.show,
      dismiss: ctx.dismiss,
      dismissAll: ctx.dismissAll,
    }),
    [ctx]
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   GLOBAL SINGLETON — callable outside React tree
───────────────────────────────────────────────────────────────────────────── */

export const simixToast = {
  success: (opts: ToastOptions) => _dispatch?.("success", opts),
  error: (opts: ToastOptions) => _dispatch?.("error", opts),
  warning: (opts: ToastOptions) => _dispatch?.("warning", opts),
  info: (opts: ToastOptions) => _dispatch?.("info", opts),
  loading: (opts: ToastOptions) => _dispatch?.("loading", { duration: 0, ...opts }),
  network: (opts: ToastOptions) => _dispatch?.("network", opts),
  payment: (opts: ToastOptions) => _dispatch?.("payment", opts),
  security: (opts: ToastOptions) => _dispatch?.("security", opts),
  dismiss: (id: string) => _dismiss?.(id),
  dismissAll: () => _dismissAll?.(),
};
