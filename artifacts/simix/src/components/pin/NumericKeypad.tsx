import { motion } from "framer-motion";
import { Delete } from "lucide-react";

interface NumericKeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
  showBiometric?: boolean;
  onBiometric?: () => void;
}

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["bio", "0", "del"],
] as const;

export function NumericKeypad({
  onDigit,
  onDelete,
  disabled = false,
  showBiometric = false,
  onBiometric,
}: NumericKeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] mx-auto select-none">
      {KEYS.flat().map((key) => {
        if (key === "del") {
          return (
            <KeyButton
              key="del"
              disabled={disabled}
              onClick={onDelete}
              aria-label="Supprimer"
            >
              <Delete className="w-5 h-5 text-foreground" />
            </KeyButton>
          );
        }

        if (key === "bio") {
          return showBiometric && onBiometric ? (
            <KeyButton key="bio" disabled={disabled} onClick={onBiometric} aria-label="Biométrie">
              <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
            </KeyButton>
          ) : (
            <div key="bio" className="h-[60px]" />
          );
        }

        return (
          <KeyButton
            key={key}
            disabled={disabled}
            onClick={() => onDigit(key)}
            aria-label={key}
          >
            <span className="text-xl font-semibold text-foreground">{key}</span>
          </KeyButton>
        );
      })}
    </div>
  );
}

function KeyButton({
  children,
  onClick,
  disabled,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="h-[60px] rounded-2xl bg-card border border-card-border flex items-center justify-center
                 hover:bg-secondary active:bg-secondary transition-colors
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </motion.button>
  );
}
