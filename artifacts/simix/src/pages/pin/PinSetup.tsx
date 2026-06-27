import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NumericKeypad } from "@/components/pin/NumericKeypad";
import { SimixLogo, SimixIcon } from "@/components/simix-logo";
import { savePin, type PinUser } from "@/lib/pin/pin-store";
import { Shield, CheckCircle2 } from "lucide-react";

const PIN_LENGTH = 6;

interface PinSetupProps {
  user: PinUser;
  onComplete: () => void;
  isChange?: boolean;
}

type Step = "create" | "confirm" | "saving" | "done";

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function PinSetup({ user, onComplete, isChange = false }: PinSetupProps) {
  const [step, setStep] = useState<Step>("create");
  const [firstPin, setFirstPin] = useState<string>("");
  const [digits, setDigits] = useState<string[]>([]);
  const [mismatch, setMismatch] = useState(false);

  const handleDigit = useCallback(
    async (d: string) => {
      if (step === "saving" || step === "done") return;
      if (digits.length >= PIN_LENGTH) return;

      const next = [...digits, d];
      setDigits(next);

      if (next.length < PIN_LENGTH) return;

      const entered = next.join("");

      if (step === "create") {
        setFirstPin(entered);
        setDigits([]);
        setStep("confirm");
        return;
      }

      if (step === "confirm") {
        if (entered !== firstPin) {
          setMismatch(true);
          setTimeout(() => {
            setMismatch(false);
            setDigits([]);
            setFirstPin("");
            setStep("create");
          }, 800);
          return;
        }

        setStep("saving");
        await savePin(user.id, entered);
        setStep("done");
        setTimeout(() => {
          onComplete();
        }, 700);
      }
    },
    [digits, step, firstPin, user.id, onComplete],
  );

  const handleDelete = useCallback(() => {
    if (step === "saving" || step === "done") return;
    setDigits((prev) => prev.slice(0, -1));
  }, [step]);

  const dotColor = (i: number): string => {
    const filled = i < digits.length;
    if (step === "done") return "bg-emerald-500 border-emerald-500";
    if (mismatch && filled) return "bg-red-500 border-red-500";
    if (mismatch) return "border-red-500/50";
    if (filled) return "bg-primary border-primary";
    return "border-card-border bg-transparent";
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center justify-between px-6 py-10 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Logo */}
      <div className="flex flex-col items-center z-10 pt-4">
        <SimixLogo size={32} />
      </div>

      <div className="flex flex-col items-center gap-8 z-10 w-full">
        {/* Icon + title */}
        <AnimatePresence mode="wait">
          {step === "done" ? (
            <motion.div
              key="done"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <p className="text-lg font-black text-foreground">PIN configuré !</p>
            </motion.div>
          ) : (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/30 ring-2 ring-primary/20">
                <SimixIcon size={44} />
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                    {isChange ? "Modifier le PIN" : "Sécuriser votre accès"}
                  </span>
                </div>
                <p className="text-base font-bold text-foreground">
                  {step === "create"
                    ? "Créez votre code PIN à 6 chiffres"
                    : "Confirmez votre code PIN"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {step === "create"
                    ? "Ce code vous permettra d'ouvrir l'application rapidement."
                    : "Saisissez à nouveau le même code pour confirmer."}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PIN dots */}
        <motion.div
          animate={mismatch ? { x: [-10, 10, -8, 8, -5, 5, 0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex gap-4"
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ scale: i < digits.length ? 1.15 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${dotColor(i)}`}
            />
          ))}
        </motion.div>

        <AnimatePresence>
          {mismatch && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-red-400 font-medium -mt-4"
            >
              Les codes ne correspondent pas. Recommencez.
            </motion.p>
          )}
        </AnimatePresence>

        {/* Keypad */}
        <NumericKeypad
          onDigit={handleDigit}
          onDelete={handleDelete}
          disabled={step === "saving" || step === "done"}
        />
      </div>

      {/* Progress steps */}
      <div className="z-10 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full transition-colors ${step !== "done" ? "bg-primary" : "bg-primary/40"}`} />
        <div className={`w-2 h-2 rounded-full transition-colors ${step === "confirm" || step === "saving" ? "bg-primary" : "bg-card-border"}`} />
        <div className={`w-2 h-2 rounded-full transition-colors ${step === "done" ? "bg-emerald-500" : "bg-card-border"}`} />
      </div>
    </div>
  );
}
