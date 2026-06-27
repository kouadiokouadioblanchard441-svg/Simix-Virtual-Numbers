import { useEffect, useState } from "react";

export function Bienvenue() {
  const [step, setStep] = useState<"confetti" | "done">("confetti");
  const [particles, setParticles] = useState<{ id: number; x: number; color: string; delay: number; size: number }[]>([]);

  useEffect(() => {
    const colors = ["#7C3AED", "#A78BFA", "#EC4899", "#F472B6", "#38BDF8", "#34D399", "#FBBF24"];
    const items = Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.8,
      size: Math.random() * 6 + 5,
    }));
    setParticles(items);
    const t = setTimeout(() => setStep("done"), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(160deg, #0d0916 0%, #120d1f 40%, #0f0d1a 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Glow ambiant */}
      <div style={{
        position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)",
        width: 340, height: 340,
        background: "radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)",
        borderRadius: "50%", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "5%", right: "-60px",
        width: 220, height: 220,
        background: "radial-gradient(circle, rgba(236,72,153,0.12) 0%, transparent 70%)",
        borderRadius: "50%", pointerEvents: "none",
      }} />

      {/* Confetti particles */}
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: "-10px",
            width: p.size,
            height: p.size,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            background: p.color,
            animation: `fall ${1.8 + p.delay}s ease-in ${p.delay}s forwards`,
            opacity: 0,
          }}
        />
      ))}

      <style>{`
        @keyframes fall {
          0%   { transform: translateY(0) rotate(0deg);   opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(900px) rotate(360deg); opacity: 0; }
        }
        @keyframes popIn {
          0%   { transform: scale(0.4) translateY(30px); opacity: 0; }
          65%  { transform: scale(1.08) translateY(-6px); }
          100% { transform: scale(1) translateY(0);      opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.5); }
          50%       { box-shadow: 0 0 0 14px rgba(124,58,237,0); }
        }
      `}</style>

      {/* Logo Simix en haut */}
      <div style={{
        position: "absolute", top: 36, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 8,
        animation: "fadeUp 0.5s ease both",
      }}>
        {/* Icône S */}
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
          <defs>
            <linearGradient id="bg-m" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#5B21B6"/>
              <stop offset="100%" stopColor="#2E0D7A"/>
            </linearGradient>
            <linearGradient id="s-m" x1="20" y1="8" x2="20" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#BAD7FF"/>
              <stop offset="100%" stopColor="#22D3EE"/>
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="10" fill="url(#bg-m)"/>
          <path d="M26.5 13.5C26.5 9.5 13.5 9 13.5 16.2C13.5 20.2 26.5 20.5 26.5 24.2C26.5 31 13.5 30.5 13.5 27"
            stroke="url(#s-m)" strokeWidth="3.4" strokeLinecap="round" fill="none"/>
        </svg>
        <span style={{
          fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em",
          background: "linear-gradient(125deg, #fff 0%, #dde8ff 35%, #c4b5fd 80%, #a78bfa 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>imix</span>
      </div>

      {/* Emoji trophée animé */}
      <div style={{
        fontSize: 72,
        animation: "popIn 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.2s both",
        marginBottom: 24,
        filter: "drop-shadow(0 0 20px rgba(251,191,36,0.4))",
      }}>🎉</div>

      {/* Titre principal */}
      <div style={{
        animation: "fadeUp 0.5s ease 0.5s both",
        textAlign: "center",
        marginBottom: 12,
      }}>
        <p style={{ color: "#a78bfa", fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          Compte créé avec succès
        </p>
        <h1 style={{
          fontSize: 30, fontWeight: 900, lineHeight: 1.15,
          color: "#fff", margin: 0,
        }}>
          Bienvenue,<br/>
          <span style={{
            background: "linear-gradient(90deg, #a78bfa, #ec4899)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Kouamé&nbsp;!</span>
        </h1>
      </div>

      {/* Sous-titre */}
      <p style={{
        color: "#94a3b8", fontSize: 14, textAlign: "center",
        lineHeight: 1.6, maxWidth: 280, margin: "0 0 40px",
        animation: "fadeUp 0.5s ease 0.65s both",
      }}>
        Ton compte Simix est prêt.<br/>
        Recharge ton solde et commande<br/>ton premier numéro virtuel.
      </p>

      {/* Card récapitulatif */}
      <div style={{
        width: "100%", maxWidth: 320,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(167,139,250,0.2)",
        borderRadius: 20,
        padding: "20px 24px",
        marginBottom: 32,
        animation: "fadeUp 0.5s ease 0.8s both",
      }}>
        {[
          { icon: "💜", label: "Solde disponible", value: "0 FCFA" },
          { icon: "📱", label: "Numéros actifs",   value: "0" },
          { icon: "🌍", label: "Pays disponibles", value: "20+" },
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 0",
            borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>{item.label}</span>
            </div>
            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Bouton principal */}
      <button style={{
        width: "100%", maxWidth: 320,
        padding: "16px 0",
        borderRadius: 14,
        border: "none",
        background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
        color: "#fff",
        fontSize: 16,
        fontWeight: 700,
        cursor: "pointer",
        animation: "fadeUp 0.5s ease 0.95s both, pulseGlow 2s ease 1.5s 3",
        letterSpacing: "0.01em",
      }}>
        Recharger mon solde →
      </button>

      {/* Lien secondaire */}
      <p style={{
        color: "#64748b", fontSize: 13, marginTop: 16,
        animation: "fadeUp 0.5s ease 1.1s both",
        cursor: "pointer",
      }}>
        Explorer d'abord l'application
      </p>
    </div>
  );
}
