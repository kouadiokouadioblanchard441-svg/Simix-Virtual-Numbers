import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useAnimation, PanInfo } from "framer-motion";
import {
  XCircle,
  AlertTriangle,
  Info,
  Wifi,
  WifiOff,
  CreditCard,
  ShieldAlert,
  X,
  Loader2,
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
  security: 6500,
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
    pulse?: boolean;
  }
> = {
  success: {
    accent: "#10b981",
    border: "rgba(16,185,129,0.3)",
    bg: "rgba(4,18,12,0.97)",
    glow: "rgba(16,185,129,0.12)",
    iconColor: "#10b981",
    Icon: CheckIcon,
    label: "Succès",
  },
  error: {
    accent: "#ef4444",
    border: "rgba(239,68,68,0.3)",
    bg: "rgba(18,4,4,0.97)",
    glow: "rgba(239,68,68,0.12)",
    iconColor: "#ef4444",
    Icon: XCircle,
    label: "Erreur",
  },
  warning: {
    accent: "#f59e0b",
    border: "rgba(245,158,11,0.3)",
    bg: "rgba(18,12,2,0.97)",
    glow: "rgba(245,158,11,0.12)",
    iconColor: "#f59e0b",
    Icon: AlertTriangle,
    label: "Attention",
  },
  info: {
    accent: "#3b82f6",
    border: "rgba(59,130,246,0.3)",
    bg: "rgba(3,10,24,0.97)",
    glow: "rgba(59,130,246,0.12)",
    iconColor: "#3b82f6",
    Icon: Info,
    label: "Info",
  },
  loading: {
    accent: "#8b5cf6",
    border: "rgba(139,92,246,0.3)",
    bg: "rgba(8,4,20,0.97)",
    glow: "rgba(139,92,246,0.12)",
    iconColor: "#8b5cf6",
    Icon: Loader2,
    label: "Chargement",
    spin: true,
  },
  network: {
    accent: "#06b6d4",
    border: "rgba(6,182,212,0.3)",
    bg: "rgba(2,12,18,0.97)",
    glow: "rgba(6,182,212,0.12)",
    iconColor: "#06b6d4",
    Icon: Wifi,
    label: "Réseau",
  },
  payment: {
    accent: "#34d399",
    border: "rgba(52,211,153,0.3)",
    bg: "rgba(2,16,12,0.97)",
    glow: "rgba(52,211,153,0.12)",
    iconColor: "#34d399",
    Icon: CreditCard,
    label: "Paiement",
  },
  security: {
    accent: "#f97316",
    border: "rgba(249,115,22,0.3)",
    bg: "rgba(18,8,2,0.97)",
    glow: "rgba(249,115,22,0.12)",
    iconColor: "#f97316",
    Icon: ShieldAlert,
    label: "Sécurité",
    pulse: true,
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   ANIMATED CHECK ICON (SVG stroke-dashoffset)
───────────────────────────────────────────────────────────────────────────── */

function CheckIcon({ className, style, strokeWidth }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke={String(style?.color ?? "#10b981")} strokeWidth={strokeWidth ?? 2.2} strokeLinecap="round" strokeLinejoin="round">
      <motion.circle
        cx="12" cy="12" r="10"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      <motion.polyline
        points="7.5 12.5 10.5 15.5 16.5 9.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.3, ease: "easeOut" }}
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   POSITION CLASSES
───────────────────────────────────────────────────────────────────────────── */

const POSITION_CLASSES: Record<ToastPosition, string> = {
  "top-right": "top-4 right-4 items-end",
  "top-center": "top-4 left-0 right-0 items-center",
  "bottom-center": "bottom-20 left-0 right-0 items-center sm:bottom-4",
  "bottom-right": "bottom-20 right-4 items-end sm:bottom-4",
};

const SLIDE_IN: Record<ToastPosition, object> = {
  "top-right": { x: 70, opacity: 0, scale: 0.92 },
  "top-center": { y: -24, opacity: 0, scale: 0.94 },
  "bottom-center": { y: 24, opacity: 0, scale: 0.94 },
  "bottom-right": { x: 70, opacity: 0, scale: 0.92 },
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
   SINGLETON — callable outside React tree
───────────────────────────────────────────────────────────────────────────── */

let _dispatch: ((type: ToastType, opts: ToastOptions) => string) | null = null;
let _dismiss: ((id: string) => void) | null = null;
let _dismissAll: (() => void) | null = null;

/* ─────────────────────────────────────────────────────────────────────────────
   PROGRESS BAR — with pause-on-hover support
───────────────────────────────────────────────────────────────────────────── */

function ProgressBar({
  duration,
  accent,
  onComplete,
  isPaused,
}: {
  duration: number;
  accent: string;
  onComplete: () => void;
  isPaused: boolean;
}) {
  const controls = useAnimation();
  const remainingRef = useRef(duration);
  const startRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!isPaused) {
      startRef.current = Date.now();
      controls
        .start({
          width: "0%",
          transition: { duration: remainingRef.current / 1000, ease: "linear" },
        })
        .then(() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete();
          }
        });
    } else {
      if (startRef.current !== null) {
        const elapsed = Date.now() - startRef.current;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
        startRef.current = null;
      }
      controls.stop();
    }
  }, [isPaused]);

  return (
    <motion.div
      className="absolute bottom-0 left-0 h-[3px] rounded-full"
      style={{ background: `linear-gradient(90deg, ${accent}99, ${accent})`, opacity: 0.9 }}
      initial={{ width: "100%" }}
      animate={controls}
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
      className="relative w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0"
      style={{ background: `${cfg.accent}16` }}
      initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", damping: 14, stiffness: 350, delay: 0.04 }}
    >
      {cfg.pulse && (
        <motion.div
          className="absolute inset-0 rounded-[14px]"
          style={{ border: `1.5px solid ${cfg.accent}` }}
          animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        />
      )}
      <motion.div
        animate={cfg.spin ? { rotate: 360 } : {}}
        transition={cfg.spin ? { repeat: Infinity, duration: 0.9, ease: "linear" } : {}}
      >
        <Icon
          className="w-[19px] h-[19px]"
          style={{ color: cfg.iconColor }}
          strokeWidth={2.1}
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
  const [isPaused, setIsPaused] = useState(false);

  const isNetworkError =
    toast.type === "network" &&
    (toast.title.toLowerCase().includes("perd") ||
      toast.title.toLowerCase().includes("hors") ||
      toast.title.toLowerCase().includes("off") ||
      toast.title.toLowerCase().includes("lost") ||
      toast.title.toLowerCase().includes("perdu"));

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 72 || Math.abs(info.offset.y) > 72) {
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
      dragElastic={0.18}
      onDragEnd={handleDragEnd}
      onHoverStart={() => setIsPaused(true)}
      onHoverEnd={() => setIsPaused(false)}
      initial={SLIDE_IN[position]}
      animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.88,
        filter: "blur(3px)",
        y: position.startsWith("bottom") ? 8 : -8,
        transition: { duration: 0.22, ease: "easeIn" },
      }}
      transition={{ type: "spring", damping: 26, stiffness: 340, mass: 0.75 }}
      className="pointer-events-auto relative overflow-hidden rounded-[20px] w-full cursor-grab active:cursor-grabbing select-none"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.035) inset, 0 0 60px ${cfg.glow}`,
        backdropFilter: "blur(24px) saturate(200%)",
        WebkitBackdropFilter: "blur(24px) saturate(200%)",
        maxWidth: "26rem",
      }}
    >
      {/* Top shimmer */}
      <div
        className="absolute top-0 left-6 right-6 h-px rounded-full"
        style={{
          background: `linear-gradient(90deg, transparent, ${cfg.accent}70 40%, ${cfg.accent}70 60%, transparent)`,
        }}
      />

      {/* Left accent bar */}
      <motion.div
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
        style={{ background: `linear-gradient(180deg, ${cfg.accent}, ${cfg.accent}80)` }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.28, ease: "easeOut", delay: 0.04 }}
      />

      {/* Content */}
      <div className="flex items-start gap-3 px-4 py-3.5 pl-[18px]">
        <ToastIcon cfg={cfg} type={toast.type} isNetworkError={isNetworkError} />

        <div className="flex-1 min-w-0 pt-0.5">
          <motion.span
            className="block text-[10px] font-bold uppercase tracking-[0.08em] mb-0.5"
            style={{ color: cfg.accent, opacity: 0.75 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.75 }}
            transition={{ delay: 0.1 }}
          >
            {cfg.label}
          </motion.span>
          <motion.p
            className="text-[13.5px] font-semibold text-white leading-snug tracking-[-0.015em]"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07, type: "spring", damping: 20, stiffness: 300 }}
          >
            {toast.title}
          </motion.p>
          {toast.description && (
            <motion.p
              className="text-[12px] text-zinc-400 mt-0.5 leading-relaxed"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.11 }}
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
              className="mt-2 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{
                color: cfg.accent,
                background: `${cfg.accent}18`,
                border: `1px solid ${cfg.accent}35`,
              }}
              whileHover={{ scale: 1.03, background: `${cfg.accent}28` }}
              whileTap={{ scale: 0.96 }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              {toast.action.label}
            </motion.button>
          )}
        </div>

        <motion.button
          onClick={() => onDismiss(toast.id)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white transition-colors mt-[-2px]"
          style={{ background: "rgba(255,255,255,0.06)" }}
          aria-label="Fermer la notification"
          whileHover={{ scale: 1.12, background: "rgba(255,255,255,0.14)" }}
          whileTap={{ scale: 0.88 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      </div>

      {/* Pause indicator */}
      {isPaused && toast.duration > 0 && (
        <motion.div
          className="absolute top-2 right-10 text-[9px] font-semibold uppercase tracking-wider"
          style={{ color: cfg.accent, opacity: 0.5 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
        >
          ⏸
        </motion.div>
      )}

      {/* Progress bar */}
      {toast.duration > 0 && (
        <ProgressBar
          duration={toast.duration}
          accent={cfg.accent}
          onComplete={() => onDismiss(toast.id)}
          isPaused={isPaused}
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
        maxWidth: "calc(min(100vw - 24px, 26rem))",
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
    const id =
      opts.id ??
      `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration =
      opts.duration !== undefined ? opts.duration : DEFAULT_DURATIONS[type];
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
  if (!ctx)
    throw new Error("useSimixToast must be used inside SimixToastProvider");

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
  loading: (opts: ToastOptions) =>
    _dispatch?.("loading", { duration: 0, ...opts }),
  network: (opts: ToastOptions) => _dispatch?.("network", opts),
  payment: (opts: ToastOptions) => _dispatch?.("payment", opts),
  security: (opts: ToastOptions) => _dispatch?.("security", opts),
  dismiss: (id: string) => _dismiss?.(id),
  dismissAll: () => _dismissAll?.(),
};
