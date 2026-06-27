import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { SimixIcon } from "@/components/simix-logo";
import { useGetMe } from "@workspace/api-client-react";

function getFirstName(fullName?: string | null): string {
  if (!fullName) return "";
  return fullName.trim().split(" ")[0] ?? fullName;
}

interface Particle {
  id: number;
  x: number;
  color: string;
  delay: number;
  size: number;
  round: boolean;
}

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const firstName = getFirstName(user?.fullName);
  const redirected = useRef(false);

  const [particles] = useState<Particle[]>(() => {
    const colors = ["#7C3AED", "#A78BFA", "#EC4899", "#F472B6", "#38BDF8", "#34D399", "#FBBF24", "#FB923C"];
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.9,
      size: Math.random() * 7 + 5,
      round: Math.random() > 0.5,
    }));
  });

  useEffect(() => {
    if (redirected.current) return;
    const t = setTimeout(() => {
      redirected.current = true;
      setLocation("/dashboard");
    }, 3500);
    return () => clearTimeout(t);
  }, [setLocation]);

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[360px] h-[360px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-[200px] h-[200px] bg-pink-500/10 blur-[80px] rounded-full pointer-events-none" />

      {/* Confetti */}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(110vh) rotate(480deg); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: 0,
            width: p.size,
            height: p.size,
            borderRadius: p.round ? "50%" : "3px",
            background: p.color,
            animation: `confetti-fall ${1.8 + p.delay * 1.2}s ease-in ${p.delay * 0.6}s forwards`,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      ))}

      {/* Logo top */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="absolute top-10 left-1/2 -translate-x-1/2"
      >
        <SimixIcon size={36} />
      </motion.div>

      {/* Main content */}
      <div className="flex flex-col items-center z-10 w-full">
        {/* Emoji */}
        <motion.div
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
          className="text-7xl mb-6 select-none"
          style={{ filter: "drop-shadow(0 0 24px rgba(251,191,36,0.4))" }}
        >
          🎉
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.35 }}
          className="text-center mb-3"
        >
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">
            Compte créé avec succès
          </p>
          <h1 className="text-3xl font-black text-foreground leading-tight">
            Bienvenue{firstName ? "," : " !"}<br />
            {firstName && (
              <span
                style={{
                  background: "linear-gradient(90deg, #a78bfa, #ec4899)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {firstName}&nbsp;!
              </span>
            )}
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="text-sm text-muted-foreground text-center leading-relaxed max-w-[260px] mb-9"
        >
          Ton compte Simix est prêt.<br />
          Recharge ton solde et commande<br />ton premier numéro virtuel.
        </motion.p>

        {/* Info card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.65 }}
          className="w-full max-w-xs bg-card border border-card-border rounded-2xl overflow-hidden mb-8"
        >
          {[
            { icon: "💜", label: "Solde disponible",  value: "0 FCFA" },
            { icon: "📱", label: "Numéros actifs",    value: "0" },
            { icon: "🌍", label: "Pays disponibles",  value: "20+" },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              className={`flex items-center justify-between px-5 py-3.5 ${i < arr.length - 1 ? "border-b border-card-border" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{row.icon}</span>
                <span className="text-sm text-muted-foreground">{row.label}</span>
              </div>
              <span className="text-sm font-bold text-foreground">{row.value}</span>
            </div>
          ))}
        </motion.div>

        {/* CTA button */}
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.8 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => { redirected.current = true; setLocation("/dashboard"); }}
          className="w-full max-w-xs h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base transition-colors shadow-lg shadow-primary/30"
        >
          Commencer →
        </motion.button>

        {/* Skip link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1 }}
          className="text-xs text-muted-foreground mt-4 cursor-pointer hover:text-foreground transition-colors"
          onClick={() => { redirected.current = true; setLocation("/dashboard"); }}
        >
          Redirection automatique dans quelques secondes...
        </motion.p>
      </div>
    </div>
  );
}
