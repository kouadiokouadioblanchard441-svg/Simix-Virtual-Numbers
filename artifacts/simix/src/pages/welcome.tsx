import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { SimixIcon } from "@/components/simix-logo";
import { useGetMe } from "@workspace/api-client-react";

/* ── Detect if running as an installed PWA ── */
function isPWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}

const WELCOMED_KEY = "simix_welcomed_v1";

function hasBeenWelcomed(): boolean {
  try { return localStorage.getItem(WELCOMED_KEY) === "true"; } catch { return false; }
}
function markWelcomed(): void {
  try { localStorage.setItem(WELCOMED_KEY, "true"); } catch {}
}

function getFirstName(fullName?: string | null): string {
  if (!fullName) return "";
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function formatBalance(n?: number | null): string {
  if (n == null) return "0 FCFA";
  return n.toLocaleString("fr-FR") + " FCFA";
}

/* ── Confetti particle ── */
interface Particle { id: number; x: number; color: string; delay: number; dur: number; size: number; round: boolean; }

const COLORS = ["#7C3AED","#A78BFA","#EC4899","#F472B6","#38BDF8","#34D399","#FBBF24","#FB923C","#60A5FA","#F87171"];

const PARTICLES: Particle[] = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
  delay: Math.random() * 1.4,
  dur: 2.0 + Math.random() * 1.4,
  size: Math.random() * 8 + 5,
  round: Math.random() > 0.5,
}));

/* ── Circular countdown ring ── */
function CountdownRing({ value, max }: { value: number; max: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const progress = (value / max) * circ;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="rotate-[-90deg]">
      <circle cx="28" cy="28" r={r} stroke="#ffffff18" strokeWidth="3" fill="none" />
      <circle
        cx="28" cy="28" r={r}
        stroke="url(#ringGrad)" strokeWidth="3" fill="none"
        strokeDasharray={`${progress} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.9s ease" }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const AUTO_REDIRECT_S = 5;

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const firstName = getFirstName(user?.fullName);
  const redirected = useRef(false);

  const [ready, setReady] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_S);

  /* ── Guard: only show in PWA, only on first visit ── */
  useEffect(() => {
    if (!isPWA() || hasBeenWelcomed()) {
      setLocation("/dashboard");
      return;
    }
    markWelcomed();
    setReady(true);
  }, []);

  /* ── Auto-redirect countdown ── */
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(t);
          if (!redirected.current) { redirected.current = true; setLocation("/dashboard"); }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [ready, setLocation]);

  const goNow = () => {
    if (redirected.current) return;
    redirected.current = true;
    setLocation("/dashboard");
  };

  if (!ready) return null;

  const balance = formatBalance(user?.balance);

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center overflow-hidden relative">

      {/* Confetti CSS */}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity:1; }
          85%  { opacity: 0.9; }
          100% { transform: translateY(110vh) rotate(540deg); opacity:0; }
        }
      `}</style>
      {PARTICLES.map(p => (
        <div key={p.id} aria-hidden style={{
          position: "absolute", left: `${p.x}%`, top: 0,
          width: p.size, height: p.size,
          borderRadius: p.round ? "50%" : "4px",
          background: p.color,
          animation: `confetti-fall ${p.dur}s ease-in ${p.delay}s both`,
          pointerEvents: "none", zIndex: 0,
        }} />
      ))}

      {/* Background glows */}
      <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-60px] left-1/2 -translate-x-1/2 w-[320px] h-[320px] bg-primary/25 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-[-40px] w-[220px] h-[220px] bg-pink-500/12 blur-[90px] rounded-full" />
        <div className="absolute bottom-40 left-[-40px] w-[180px] h-[180px] bg-violet-400/10 blur-[80px] rounded-full" />
      </div>

      {/* ── Top bar ── */}
      <div className="w-full flex items-center justify-center pt-12 z-10">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <SimixIcon size={40} />
        </motion.div>
      </div>

      {/* ── Hero section ── */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 px-6 w-full">

        {/* Confetti emoji */}
        <motion.div
          initial={{ scale: 0, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.1 }}
          className="text-[72px] leading-none mb-6 select-none"
          style={{ filter: "drop-shadow(0 0 30px rgba(251,191,36,0.35))" }}
        >
          🎉
        </motion.div>

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mb-4"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/25 text-xs font-semibold text-primary tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Compte créé avec succès
          </span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.4 }}
          className="text-3xl font-black text-center text-foreground leading-tight mb-3"
        >
          Bienvenue{firstName ? "," : " !"}{"\n"}
          {firstName && (
            <span style={{
              background: "linear-gradient(100deg, #a78bfa 0%, #ec4899 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              {firstName}&nbsp;!
            </span>
          )}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.52 }}
          className="text-sm text-muted-foreground text-center leading-relaxed max-w-[240px] mb-8"
        >
          Ton espace Simix est prêt.<br />
          Recharge et commande ton premier numéro virtuel.
        </motion.p>

        {/* Stats card */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.65 }}
          className="w-full max-w-[320px] rounded-2xl overflow-hidden mb-8"
          style={{ background: "linear-gradient(145deg, #1a1035 0%, #130d2e 100%)", border: "1px solid rgba(167,139,250,0.15)" }}
        >
          {/* Gradient top line */}
          <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, #a78bfa60, #ec489940, transparent)" }} />

          {[
            { emoji: "💜", label: "Solde disponible",  value: balance,  highlight: true },
            { emoji: "📱", label: "Numéros actifs",    value: "0",      highlight: false },
            { emoji: "🌍", label: "Pays disponibles",  value: "20+",    highlight: false },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              className={`flex items-center justify-between px-5 py-4 ${i < arr.length - 1 ? "border-b" : ""}`}
              style={{ borderColor: "rgba(167,139,250,0.1)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl leading-none">{row.emoji}</span>
                <span className="text-sm text-zinc-400">{row.label}</span>
              </div>
              <span className={`text-sm font-bold ${row.highlight ? "text-violet-300" : "text-white"}`}>
                {row.value}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Primary CTA */}
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.8 }}
          whileTap={{ scale: 0.97 }}
          onClick={goNow}
          className="w-full max-w-[320px] h-14 rounded-2xl font-bold text-base text-white transition-opacity active:opacity-90 mb-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #7C3AED 0%, #a855f7 50%, #ec4899 100%)", boxShadow: "0 8px 32px rgba(124,58,237,0.35)" }}
        >
          <span className="relative z-10">Commencer l'aventure →</span>
          {/* Shine effect */}
          <motion.div
            animate={{ x: ["−100%", "200%"] }}
            transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
            className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12"
          />
        </motion.button>

        {/* Countdown row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1 }}
          className="flex items-center gap-3 cursor-pointer group"
          onClick={goNow}
        >
          <div className="relative">
            <CountdownRing value={countdown} max={AUTO_REDIRECT_S} />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
              {countdown}
            </span>
          </div>
          <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
            Redirection automatique…
          </span>
        </motion.div>
      </div>

      {/* Bottom safe area spacer */}
      <div className="h-8" />
    </div>
  );
}
