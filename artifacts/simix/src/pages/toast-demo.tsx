import { useState } from "react";
import { useSimixToast } from "@/lib/simix-toast";
import { SimixLogo } from "@/components/simix-logo";
import { useLocation } from "wouter";
import { ArrowLeft, Zap, Play, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

type Position = "top-right" | "top-center" | "bottom-center" | "bottom-right";

const POSITIONS: { value: Position; label: string }[] = [
  { value: "top-right", label: "↗ Haut droite" },
  { value: "top-center", label: "↑ Haut centre" },
  { value: "bottom-center", label: "↓ Bas centre" },
  { value: "bottom-right", label: "↘ Bas droite" },
];

const DEMOS = [
  {
    type: "success" as const,
    label: "Succès",
    color: "#10b981",
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.3)",
    examples: [
      { title: "Connexion réussie", description: "Bienvenue sur SIMIX, Kouassi David 👋" },
      { title: "Numéro acheté", description: "Votre numéro virtuel +1 (213) est maintenant disponible." },
      { title: "Profil mis à jour", description: "Vos informations ont été enregistrées." },
    ],
  },
  {
    type: "error" as const,
    label: "Erreur",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.3)",
    examples: [
      { title: "Échec du paiement", description: "Votre transaction a été refusée. Réessayez." },
      { title: "Numéro indisponible", description: "Ce numéro n'est plus disponible dans ce pays." },
      { title: "Mot de passe incorrect", description: "Vérifiez vos identifiants et réessayez." },
    ],
  },
  {
    type: "warning" as const,
    label: "Attention",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.3)",
    examples: [
      { title: "Solde faible", description: "Il vous reste moins de 500 FCFA. Rechargez votre compte." },
      { title: "Numéro expirant bientôt", description: "Votre numéro expire dans 5 minutes." },
      { title: "Session expirée", description: "Vous allez être déconnecté dans 2 minutes." },
    ],
  },
  {
    type: "info" as const,
    label: "Info",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.12)",
    border: "rgba(59,130,246,0.3)",
    examples: [
      { title: "Code OTP envoyé", description: "Le code de vérification a été envoyé au +225 07 01 23 45 67." },
      { title: "Mise à jour disponible", description: "Une nouvelle version de SIMIX est disponible." },
      { title: "Maintenance planifiée", description: "Interruption de service prévue le 30 juin à 02h00." },
    ],
  },
  {
    type: "loading" as const,
    label: "Chargement",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.12)",
    border: "rgba(139,92,246,0.3)",
    examples: [
      { title: "Transaction en cours…", description: "Validation de votre paiement Orange Money." },
      { title: "Recherche d'un numéro…", description: "Attribution d'un numéro US disponible." },
      { title: "Synchronisation…", description: "Mise à jour de votre portefeuille." },
    ],
  },
  {
    type: "network" as const,
    label: "Réseau",
    color: "#06b6d4",
    bg: "rgba(6,182,212,0.12)",
    border: "rgba(6,182,212,0.3)",
    examples: [
      { title: "Connexion rétablie", description: "Vous êtes de nouveau en ligne." },
      { title: "Connexion Internet perdue", description: "Vérifiez votre réseau et réessayez." },
      { title: "Débit lent détecté", description: "Votre connexion est instable." },
    ],
  },
  {
    type: "payment" as const,
    label: "Paiement",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
    border: "rgba(52,211,153,0.3)",
    examples: [
      { title: "Paiement confirmé", description: "2 500 FCFA ont été crédités sur votre compte." },
      { title: "Remboursement effectué", description: "750 FCFA ont été remboursés automatiquement." },
      { title: "Recharge réussie", description: "10 000 FCFA via Orange Money · N° 07 01 23 45 67." },
    ],
  },
  {
    type: "security" as const,
    label: "Sécurité",
    color: "#f97316",
    bg: "rgba(249,115,22,0.12)",
    border: "rgba(249,115,22,0.3)",
    examples: [
      { title: "Nouvelle connexion détectée", description: "Connexion depuis Abidjan, CI · iPhone 15 · Il y a 1 min." },
      { title: "Mot de passe modifié", description: "Votre mot de passe a été changé avec succès." },
      { title: "Tentative suspecte bloquée", description: "5 tentatives échouées depuis 41.184.x.x." },
    ],
  },
];

export default function ToastDemo() {
  const [, navigate] = useLocation();
  const toast = useSimixToast();
  const [position, setPosition] = useState<Position>("bottom-center");
  const [activeType, setActiveType] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fireToast = (
    type: (typeof DEMOS)[number]["type"],
    example: { title: string; description: string }
  ) => {
    if (type === "loading") {
      if (loadingId) {
        toast.dismiss(loadingId);
        setLoadingId(null);
        return;
      }
      const id = toast.showLoading({ ...example, position });
      setLoadingId(id ?? null);
      return;
    }
    const methods = {
      success: toast.showSuccess,
      error: toast.showError,
      warning: toast.showWarning,
      info: toast.showInfo,
      network: toast.showNetwork,
      payment: toast.showPayment,
      security: toast.showSecurity,
    } as const;
    methods[type as keyof typeof methods]({ ...example, position });
  };

  const fireAll = () => {
    DEMOS.forEach((demo, i) => {
      setTimeout(() => {
        if (demo.type === "loading") return;
        const ex = demo.examples[0];
        const methods = {
          success: toast.showSuccess,
          error: toast.showError,
          warning: toast.showWarning,
          info: toast.showInfo,
          network: toast.showNetwork,
          payment: toast.showPayment,
          security: toast.showSecurity,
        } as const;
        if (demo.type !== "loading") {
          methods[demo.type as keyof typeof methods]({ ...ex, position });
        }
      }, i * 300);
    });
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-xl border-b border-white/6">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <SimixLogo size={26} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toast.dismissAll()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
            >
              <RotateCcw className="w-3 h-3" />
              Tout fermer
            </button>
            <button
              onClick={fireAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 transition-all"
            >
              <Zap className="w-3 h-3" />
              Tout tester
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs font-semibold mb-3"
          >
            <Zap className="w-3 h-3" />
            Toast Notifications
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-2xl font-black tracking-tight text-white"
          >
            Système de Notifications
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm text-zinc-400 mt-1"
          >
            8 types · Glassmorphism · Swipe to dismiss · Auto-stack · File d'attente
          </motion.p>
        </div>

        {/* Position picker */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="mb-8"
        >
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Position des toasts
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {POSITIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPosition(p.value)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                  position === p.value
                    ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/20"
                    : "bg-white/5 border-white/8 text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Toast type cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DEMOS.map((demo, di) => (
            <motion.div
              key={demo.type}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + di * 0.04 }}
              className={`rounded-2xl border overflow-hidden transition-all ${
                activeType === demo.type ? "ring-1" : ""
              }`}
              style={{
                background: demo.bg,
                borderColor: demo.border,
                ...(activeType === demo.type ? { boxShadow: `0 0 0 1px ${demo.color}50` } : {}),
              }}
              onMouseEnter={() => setActiveType(demo.type)}
              onMouseLeave={() => setActiveType(null)}
            >
              {/* Card header */}
              <div
                className="px-4 py-3 flex items-center justify-between border-b"
                style={{ borderColor: demo.border }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: demo.color }}
                  />
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: demo.color }}
                  >
                    {demo.label}
                  </span>
                </div>
                {demo.type === "loading" && loadingId && (
                  <span className="text-[10px] text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full">
                    En cours · cliquer pour fermer
                  </span>
                )}
              </div>

              {/* Examples */}
              <div className="p-3 space-y-2">
                {demo.examples.map((ex, ei) => (
                  <button
                    key={ei}
                    onClick={() => fireToast(demo.type, ex)}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-black/20 hover:bg-black/40 border border-white/5 hover:border-white/12 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-white truncate">
                          {ex.title}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed line-clamp-1">
                          {ex.description}
                        </p>
                      </div>
                      <Play
                        className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: demo.color }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Queue demo */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-6 rounded-2xl border border-white/8 bg-white/3 p-4"
        >
          <p className="text-xs font-bold text-zinc-300 mb-1">
            🗂️ Test de la file d'attente
          </p>
          <p className="text-xs text-zinc-500 mb-3">
            Max 4 toasts visibles. Les suivants attendent en file. Cliquez pour
            déclencher 6 toasts d'un coup.
          </p>
          <button
            onClick={() => {
              ["Paiement n°1", "Succès n°2", "Erreur n°3", "Info n°4", "Warning n°5", "Sécurité n°6"].forEach((title, i) => {
                const types = ["payment", "success", "error", "info", "warning", "security"] as const;
                setTimeout(() => {
                  toast.show(types[i], { title, description: `Toast ${i + 1} — en file si > 4 visibles`, position });
                }, i * 100);
              });
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-white/8 transition-all"
          >
            Déclencher 6 toasts
          </button>
        </motion.div>

        {/* Usage code */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 rounded-2xl border border-white/8 bg-zinc-900/60 overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-white/6 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            <span className="text-[11px] text-zinc-500 ml-2 font-mono">usage.tsx</span>
          </div>
          <pre className="p-4 text-[11px] text-zinc-300 font-mono leading-relaxed overflow-x-auto">
            {`import { useSimixToast } from "@/lib/simix-toast";

function MyComponent() {
  const { showSuccess, showError, showPayment } = useSimixToast();

  const handlePay = async () => {
    showPayment({
      title: "Paiement confirmé",
      description: "2 500 FCFA crédités",
      position: "bottom-center",
      action: { label: "Voir détails", onClick: () => navigate("/wallet") },
    });
  };
}`}
          </pre>
        </motion.div>
      </div>
    </div>
  );
}
