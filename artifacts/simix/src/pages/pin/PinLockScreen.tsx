import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NumericKeypad } from "@/components/pin/NumericKeypad";
import { SimixLogo, SimixIcon } from "@/components/simix-logo";
import {
  checkPin,
  getPinSettings,
  MAX_ATTEMPTS,
  type PinUser,
} from "@/lib/pin/pin-store";

const PIN_LENGTH = 6;

interface PinLockScreenProps {
  user: PinUser;
  onUnlock: () => void;
  onForgotPin: () => void;
}

type ScreenState = "idle" | "checking" | "error" | "success" | "locked" | "unavailable";

interface LockoutStatus {
  locked: boolean;
  failedCount: number;
  remainingMs: number;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function PinLockScreen({ user, onUnlock, onForgotPin }: PinLockScreenProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [state, setState] = useState<ScreenState>("checking");
  const [lockout, setLockout] = useState<LockoutStatus>({
    locked: false,
    failedCount: 0,
    remainingMs: 0,
  });
  const [remaining, setRemaining] = useState(0);
  const shakeRef = useRef(0);

  // Load the authoritative PIN lock state from the server.
  useEffect(() => {
    let active = true;
    void getPinSettings().then((settings) => {
      if (!active || !settings.available || !settings.pinEnabled) {
        if (active) setState("unavailable");
        return;
      }
      const remainingMs = settings.pinLockRemainingMs;
      setLockout({
        locked: remainingMs > 0,
        failedCount: MAX_ATTEMPTS - settings.pinAttemptsRemaining,
        remainingMs,
      });
      setRemaining(remainingMs);
      setState(remainingMs > 0 ? "locked" : "idle");
    }).catch(() => {
      if (active) setState("unavailable");
    });
    return () => {
      active = false;
    };
  }, [user.id]);

  // Countdown is only a display; the backend remains authoritative.
  useEffect(() => {
    if (!lockout.locked) return;
    const deadline = Date.now() + lockout.remainingMs;
    const id = setInterval(() => {
      const ms = deadline - Date.now();
      if (ms <= 0) {
        setLockout({ locked: false, failedCount: 0, remainingMs: 0 });
        setState("idle");
        setRemaining(0);
      } else {
        setRemaining(ms);
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockout.locked, lockout.remainingMs]);

  const submitPin = useCallback(
    async (pin: string) => {
      setState("checking");
      let result;
      try {
        result = await checkPin(user.id, pin);
      } catch {
        setState("unavailable");
        return;
      }

      if (result.success) {
        setLockout({ locked: false, failedCount: 0, remainingMs: 0 });
        setState("success");
        setTimeout(() => {
          onUnlock();
        }, 600);
      } else {
        const nextLockout: LockoutStatus = {
          locked: result.locked,
          failedCount: MAX_ATTEMPTS - result.attemptsRemaining,
          remainingMs: result.remainingMs,
        };
        setLockout(nextLockout);
        if (result.locked) {
          setState("locked");
          setRemaining(result.remainingMs);
        } else {
          setState("error");
          shakeRef.current += 1;
          setTimeout(() => {
            setState("idle");
            setDigits([]);
          }, 700);
        }
      }
    },
    [user.id, onUnlock],
  );

  const handleDigit = useCallback(
    (d: string) => {
      if (state === "checking" || state === "success" || state === "locked" || state === "unavailable") return;
      if (digits.length >= PIN_LENGTH) return;

      const next = [...digits, d];
      setDigits(next);
      setState("idle");

      if (next.length === PIN_LENGTH) {
        submitPin(next.join(""));
      }
    },
    [digits, state, submitPin],
  );

  const handleDelete = useCallback(() => {
      if (state === "checking" || state === "success" || state === "locked" || state === "unavailable") return;
    setDigits((prev) => prev.slice(0, -1));
    setState("idle");
  }, [state]);

  const dotColor = (i: number): string => {
    const filled = i < digits.length;
    if (state === "success") return "bg-emerald-500 border-emerald-500 scale-110";
    if (state === "error" && filled) return "bg-red-500 border-red-500";
    if (state === "error" && !filled) return "border-red-500/50";
    if (filled) return "bg-primary border-primary";
    return "border-card-border bg-transparent";
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center justify-between px-6 py-10 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[200px] h-[200px] bg-violet-800/10 blur-[80px] rounded-full pointer-events-none" />

      {/* Top: Logo */}
      <div className="flex flex-col items-center z-10 pt-4">
        <SimixLogo size={32} />
      </div>

      {/* Middle: Avatar + name + dots + keypad */}
      <div className="flex flex-col items-center gap-8 z-10 w-full">
        {/* Avatar */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/30 ring-2 ring-primary/20">
            <SimixIcon size={44} />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-foreground">{user.fullName || "Utilisateur"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {state === "locked"
                ? `🔒 Bloqué — réessayez dans ${formatRemaining(remaining)}`
                : state === "checking"
                  ? "Vérification en cours..."
                  : state === "unavailable"
                    ? "Vérification serveur indisponible"
                    : "Entrez votre code PIN"}
            </p>
          </div>
        </motion.div>

        {/* PIN dots */}
        <motion.div
          key={shakeRef.current}
          animate={
            state === "error"
              ? { x: [-10, 10, -8, 8, -5, 5, -3, 3, 0] }
              : { x: 0 }
          }
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex gap-4"
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <motion.div
              key={i}
              animate={{
                scale: i < digits.length ? 1.15 : 1,
              }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${dotColor(i)}`}
            />
          ))}
        </motion.div>

        {/* Error / attempts warning */}
        <AnimatePresence mode="wait">
          {state === "error" && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-red-400 font-medium -mt-4"
            >
              PIN incorrect.{" "}
              {lockout.failedCount < MAX_ATTEMPTS
                ? `${MAX_ATTEMPTS - lockout.failedCount} tentative${MAX_ATTEMPTS - lockout.failedCount > 1 ? "s" : ""} restante${MAX_ATTEMPTS - lockout.failedCount > 1 ? "s" : ""}.`
                : ""}
            </motion.p>
          )}
          {state === "unavailable" && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-red-400 font-medium -mt-4 text-center"
            >
              Le serveur ne peut pas vérifier votre PIN. Rechargez la page et réessayez.
            </motion.p>
          )}
        </AnimatePresence>

        {/* Keypad */}
        <NumericKeypad
          onDigit={handleDigit}
          onDelete={handleDelete}
          disabled={state === "checking" || state === "success" || state === "locked" || state === "unavailable"}
        />
      </div>

      {/* Bottom: Forgot PIN */}
      <div className="z-10 flex flex-col items-center gap-2">
        <button
          onClick={onForgotPin}
          className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium py-2 px-4"
        >
          PIN oublié ?
        </button>
      </div>
    </div>
  );
}
