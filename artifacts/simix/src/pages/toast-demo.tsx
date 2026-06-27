import { useState, useRef } from "react";
import { useSimixToast } from "@/lib/simix-toast";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Zap,
  RotateCcw,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Wifi,
  CreditCard,
  ShieldAlert,
  Layers,
  Code2,
  Smartphone,
  MousePointer2,
  Pause,
} from "lucide-react";

type Position = "top-right" | "top-center" | "bottom-center" | "bottom-right";

/* ─── POSITION CONFIG ────────────────────────────────────────────────────── */

const POSITIONS: { value: Position; label: string; short: string }[] = [
  { value: "top-right", label: "Haut droite", short: "↗" },
  { value: "top-center", label: "Haut centre", short: "↑" },
  { value: "bottom-center", label: "Bas centre", short: "↓" },
  { value: "bottom-right", label: "Bas droite", short: "↘" },
];

/* ─── TYPE CONFIG ────────────────────────────────────────────────────────── */

const TYPE_CONFIG = [
  {
    type: "success" as const,
    label: "Succès",
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.2)",
    Icon: CheckCircle2,
    examples: [
      { title: "Connexion réussie", description: "Bienvenue sur SIMIX, Kouassi David 👋" },
      { title: "Numéro acheté", description: "Votre numéro virtuel +1 (213) est maintenant disponible." },
      { title: "Profil mis à jour", description: "Vos informations ont été enregistrées avec succès." },
    ],
  },
  {
    type: "error" as const,
    label: "Erreur",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.2)",
    Icon: XCircle,
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
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    Icon: AlertTriangle,
    examples: [
      { title: "Solde faible", description: "Il vous reste moins de 500 FCFA. Rechargez votre compte." },
      { title: "Numéro expirant bientôt", description: "Votre numéro virtuel expire dans 5 minutes." },
      { title: "Session expirée", description: "Vous allez être déconnecté dans 2 minutes." },
    ],
  },
  {
    type: "info" as const,
    label: "Info",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.2)",
    Icon: Info,
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
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.2)",
    Icon: Loader2,
    examples: [
      { title: "Transaction en cours…", description: "Validation de votre paiement Orange Money." },
      { title: "Recherche d'un numéro…", description: "Attribution d'un numéro US disponible." },
      { title: "Synchronisation…", description: "Mise à jour de votre portefeuille en cours." },
    ],
  },
  {
    type: "network" as const,
    label: "Réseau",
    color: "#06b6d4",
    bg: "rgba(6,182,212,0.08)",
    border: "rgba(6,182,212,0.2)",
    Icon: Wifi,
    examples: [
      { title: "Connexion rétablie", description: "Vous êtes de nouveau en ligne. Synchronisation…" },
      { title: "Connexion Internet perdue", description: "Vérifiez votre réseau et réessayez." },
      { title: "Débit lent détecté", description: "Votre connexion est instable. Certaines fonctions peuvent être lentes." },
    ],
  },
  {
    type: "payment" as const,
    label: "Paiement",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.2)",
    Icon: CreditCard,
    examples: [
      { title: "Paiement confirmé", description: "2 500 FCFA ont été crédités sur votre compte SIMIX." },
      { title: "Remboursement effectué", description: "750 FCFA ont été remboursés automatiquement." },
      { title: "Recharge réussie", description: "10 000 FCFA via Orange Money · N° 07 01 23 45 67." },
    ],
  },
  {
    type: "security" as const,
    label: "Sécurité",
    color: "#f97316",
    bg: "rgba(249,115,22,0.08)",
    border: "rgba(249,115,22,0.2)",
    Icon: ShieldAlert,
    examples: [
      { title: "Nouvelle connexion détectée", description: "Connexion depuis Abidjan, CI · iPhone 15 · Il y a 1 min." },
      { title: "Mot de passe modifié", description: "Votre mot de passe a été changé avec succès." },
      { title: "Tentative suspecte bloquée", description: "5 tentatives échouées depuis 41.184.x.x." },
    ],
  },
];

/* ─── SCENARIOS ─────────────────────────────────────────────────────────── */

const SCENARIOS = [
  {
    id: "login",
    label: "Connexion utilisateur",
    emoji: "🔐",
    color: "#10b981",
    description: "Flux de connexion complet",
    steps: [
      { type: "loading" as const, title: "Connexion en cours…", description: "Vérification de vos identifiants.", delay: 0 },
      { type: "success" as const, title: "Connexion réussie", description: "Bienvenue sur SIMIX, Kouassi David 👋", delay: 1800 },
    ],
  },
  {
    id: "purchase",
    label: "Achat de numéro",
    emoji: "📱",
    color: "#34d399",
    description: "Achat d'un numéro virtuel US",
    steps: [
      { type: "loading" as const, title: "Recherche d'un numéro…", description: "Attribution d'un numéro US disponible.", delay: 0 },
      { type: "payment" as const, title: "Paiement déduit", description: "750 FCFA débités de votre solde.", delay: 2000 },
      { type: "success" as const, title: "Numéro attribué ✓", description: "Votre numéro +1 (415) 234-5678 est prêt.", delay: 3200 },
    ],
  },
  {
    id: "recharge",
    label: "Recharge Orange Money",
    emoji: "💰",
    color: "#f59e0b",
    description: "Recharge via mobile money",
    steps: [
      { type: "info" as const, title: "Paiement initié", description: "Entrez votre code Orange Money pour confirmer.", delay: 0 },
      { type: "loading" as const, title: "Confirmation en cours…", description: "En attente de validation Orange Money.", delay: 1200 },
      { type: "payment" as const, title: "Recharge confirmée ✓", description: "5 000 FCFA crédités sur votre compte SIMIX.", delay: 3500 },
    ],
  },
  {
    id: "security",
    label: "Alerte de sécurité",
    emoji: "🛡️",
    color: "#f97316",
    description: "Nouvelle connexion suspecte",
    steps: [
      { type: "security" as const, title: "Nouvelle connexion détectée", description: "Paris, FR · Chrome · Il y a quelques secondes.", delay: 0 },
      { type: "warning" as const, title: "Vérifiez votre compte", description: "Si ce n'était pas vous, changez votre mot de passe.", delay: 1500 },
    ],
  },
  {
    id: "network",
    label: "Coupure réseau",
    emoji: "📡",
    color: "#06b6d4",
    description: "Perte et rétablissement réseau",
    steps: [
      { type: "network" as const, title: "Connexion Internet perdue", description: "Vérifiez votre réseau Wi-Fi ou données mobiles.", delay: 0 },
      { type: "network" as const, title: "Connexion rétablie ✓", description: "Vous êtes de nouveau en ligne. Synchronisation…", delay: 2500 },
      { type: "success" as const, title: "Données synchronisées", description: "Toutes vos données sont à jour.", delay: 4500 },
    ],
  },
];

/* ─── COMPONENT ─────────────────────────────────────────────────────────── */

export default function ToastDemo() {
  const [, navigate] = useLocation();
  const toast = useSimixToast();
  const [position, setPosition] = useState<Position>("bottom-center");
  const [loadingIds, setLoadingIds] = useState<Record<string, string>>({});
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const scenarioTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* fire single toast */
  const fireToast = (
    type: (typeof TYPE_CONFIG)[number]["type"],
    example: { title: string; description: string },
    key: string
  ) => {
    if (type === "loading") {
      if (loadingIds[key]) {
        toast.dismiss(loadingIds[key]);
        setLoadingIds((prev) => { const n = { ...prev }; delete n[key]; return n; });
        return;
      }
      const id = toast.showLoading({ ...example, position });
      if (id) setLoadingIds((prev) => ({ ...prev, [key]: id }));
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

  /* fire all */
  const fireAll = () => {
    toast.dismissAll();
    TYPE_CONFIG.forEach((demo, i) => {
      setTimeout(() => {
        if (demo.type === "loading") return;
        const ex = demo.examples[0];
        const methods = {
          success: toast.showSuccess, error: toast.showError,
          warning: toast.showWarning, info: toast.showInfo,
          network: toast.showNetwork, payment: toast.showPayment,
          security: toast.showSecurity,
        } as const;
        if (demo.type !== "loading") {
          methods[demo.type as keyof typeof methods]({ ...ex, position });
        }
      }, i * 280);
    });
  };

  /* run scenario */
  const runScenario = (scenario: (typeof SCENARIOS)[number]) => {
    if (runningScenario === scenario.id) return;
    scenarioTimers.current.forEach(clearTimeout);
    scenarioTimers.current = [];
    toast.dismissAll();
    setRunningScenario(scenario.id);

    const loadingIdsInScenario: string[] = [];

    scenario.steps.forEach((step, idx) => {
      const t = setTimeout(() => {
        if (step.type === "loading") {
          const id = toast.showLoading({ title: step.title, description: step.description, position });
          if (id) loadingIdsInScenario.push(id);
        } else {
          loadingIdsInScenario.forEach((id) => toast.dismiss(id));
          loadingIdsInScenario.length = 0;
          const methods = {
            success: toast.showSuccess, error: toast.showError,
            warning: toast.showWarning, info: toast.showInfo,
            network: toast.showNetwork, payment: toast.showPayment,
            security: toast.showSecurity,
          } as const;
          if (step.type !== "loading") {
            methods[step.type as keyof typeof methods]({
              title: step.title,
              description: step.description,
              position,
            });
          }
        }
        if (idx === scenario.steps.length - 1) {
          setTimeout(() => setRunningScenario(null), 600);
        }
      }, step.delay);
      scenarioTimers.current.push(t);
    });
  };

  /* position visual map */
  const positionDotClass: Record<Position, string> = {
    "top-right": "top-1 right-1",
    "top-center": "top-1 left-1/2 -translate-x-1/2",
    "bottom-center": "bottom-1 left-1/2 -translate-x-1/2",
    "bottom-right": "bottom-1 right-1",
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white">

      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.06] hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-[13px] font-bold text-white leading-none">Toast System</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">SIMIX Notifications</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { toast.dismissAll(); setLoadingIds({}); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-zinc-400 hover:text-white bg-white/[0.05] hover:bg-white/10 transition-all"
            >
              <RotateCcw className="w-3 h-3" />
              Fermer tout
            </button>
            <button
              onClick={fireAll}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold bg-violet-600 hover:bg-violet-500 transition-all shadow-lg shadow-violet-500/20"
            >
              <Zap className="w-3 h-3" />
              Tout tester
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">

        {/* ─── HERO ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden border border-white/[0.07] bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 sm:p-8"
        >
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-indigo-600/8 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 text-[11px] font-bold mb-4">
              <Zap className="w-3 h-3" />
              Système de Notifications Premium
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
              Toast Notifications
            </h1>
            <p className="text-sm text-zinc-400 mb-6 max-w-md leading-relaxed">
              8 types · Glassmorphism · Pause au survol · Swipe pour fermer · File d'attente · Zéro dépendance lourde
            </p>

            {/* Stats row */}
            <div className="flex flex-wrap gap-3">
              {[
                { icon: Layers, label: "8 types", sub: "de notifications" },
                { icon: Smartphone, label: "Mobile-first", sub: "responsive" },
                { icon: MousePointer2, label: "Swipe", sub: "pour fermer" },
                { icon: Pause, label: "Pause", sub: "au survol" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.07]">
                  <s.icon className="w-3.5 h-3.5 text-violet-400" />
                  <div>
                    <p className="text-[11px] font-bold text-white leading-none">{s.label}</p>
                    <p className="text-[10px] text-zinc-500">{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ─── POSITION SELECTOR ───────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <SectionTitle icon={Smartphone} title="Position des toasts" />
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="grid grid-cols-2 gap-2 flex-1">
              {POSITIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPosition(p.value)}
                  className={`px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all border text-left ${
                    position === p.value
                      ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/25"
                      : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
                  }`}
                >
                  <span className="mr-1.5">{p.short}</span>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Mini position map */}
            <div className="relative w-28 h-20 rounded-2xl bg-zinc-900 border border-white/[0.08] flex-shrink-0">
              <div className="absolute inset-2 rounded-xl border border-white/[0.05]" />
              {POSITIONS.map((p) => (
                <motion.div
                  key={p.value}
                  className={`absolute w-3 h-3 rounded-full ${positionDotClass[p.value]}`}
                  style={{
                    background: position === p.value ? "#8b5cf6" : "rgba(255,255,255,0.15)",
                  }}
                  animate={{ scale: position === p.value ? [1, 1.3, 1] : 1 }}
                  transition={{ repeat: position === p.value ? Infinity : 0, duration: 1.2 }}
                />
              ))}
              <p className="absolute bottom-1.5 left-0 right-0 text-center text-[8px] text-zinc-600 font-medium">APERÇU</p>
            </div>
          </div>
        </motion.section>

        {/* ─── SCENARIOS RÉELS ─────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
        >
          <SectionTitle icon={Play} title="Scénarios réels" sub="Simule de vrais flux applicatifs avec séquences animées" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SCENARIOS.map((scenario) => {
              const isRunning = runningScenario === scenario.id;
              return (
                <motion.button
                  key={scenario.id}
                  onClick={() => runScenario(scenario)}
                  disabled={isRunning}
                  className="text-left p-4 rounded-2xl border transition-all relative overflow-hidden group"
                  style={{
                    background: isRunning
                      ? `${scenario.color}12`
                      : "rgba(255,255,255,0.03)",
                    borderColor: isRunning ? `${scenario.color}40` : "rgba(255,255,255,0.08)",
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isRunning && (
                    <motion.div
                      className="absolute bottom-0 left-0 h-[2px] rounded-full"
                      style={{ background: scenario.color }}
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{
                        duration: (scenario.steps[scenario.steps.length - 1].delay + 1500) / 1000,
                        ease: "linear",
                      }}
                    />
                  )}
                  <div className="text-2xl mb-2">{scenario.emoji}</div>
                  <p className="text-[13px] font-bold text-white leading-snug">{scenario.label}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{scenario.description}</p>
                  <div className="flex items-center gap-1 mt-3">
                    {scenario.steps.map((s, i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: isRunning ? scenario.color : "rgba(255,255,255,0.2)" }}
                      />
                    ))}
                    <span className="text-[10px] text-zinc-600 ml-1">
                      {scenario.steps.length} étape{scenario.steps.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  {isRunning && (
                    <div className="absolute top-3 right-3 flex items-center gap-1">
                      <motion.div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: scenario.color }}
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                      />
                      <span className="text-[10px] font-semibold" style={{ color: scenario.color }}>En cours</span>
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        {/* ─── TYPE SHOWCASE ───────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <SectionTitle icon={Layers} title="Tous les types" sub="Cliquez un exemple pour déclencher le toast" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TYPE_CONFIG.map((demo, di) => (
              <motion.div
                key={demo.type}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 + di * 0.04 }}
                className="rounded-2xl border overflow-hidden"
                style={{
                  background: activeCard === demo.type ? demo.bg : "rgba(255,255,255,0.02)",
                  borderColor: activeCard === demo.type ? demo.border : "rgba(255,255,255,0.07)",
                  transition: "background 0.2s, border-color 0.2s",
                }}
                onMouseEnter={() => setActiveCard(demo.type)}
                onMouseLeave={() => setActiveCard(null)}
              >
                {/* Card header */}
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{
                    borderBottom: `1px solid ${activeCard === demo.type ? demo.border : "rgba(255,255,255,0.05)"}`,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-xl flex items-center justify-center"
                      style={{ background: `${demo.color}18` }}
                    >
                      <demo.Icon className="w-3.5 h-3.5" style={{ color: demo.color }} strokeWidth={2.2} />
                    </div>
                    <span className="text-[12px] font-bold" style={{ color: demo.color }}>
                      {demo.label}
                    </span>
                  </div>
                  {demo.type === "loading" && loadingIds["loading-ex"] && (
                    <span className="text-[10px] text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                      Cliquer pour fermer
                    </span>
                  )}
                </div>

                {/* Examples */}
                <div className="p-2.5 space-y-1.5">
                  {demo.examples.map((ex, ei) => (
                    <button
                      key={ei}
                      onClick={() => fireToast(demo.type, ex, demo.type === "loading" ? "loading-ex" : `${demo.type}-${ei}`)}
                      className="w-full text-left px-3 py-2.5 rounded-xl transition-all group relative overflow-hidden"
                      style={{
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid rgba(255,255,255,0.04)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.45)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.25)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.04)";
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-white truncate">{ex.title}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed line-clamp-1">
                            {ex.description}
                          </p>
                        </div>
                        <Play
                          className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: demo.color }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ─── QUEUE TEST ──────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <SectionTitle icon={Layers} title="Test de la file d'attente" />
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-zinc-200">
                  Maximum 4 toasts visibles simultanément
                </p>
                <p className="text-[12px] text-zinc-500 mt-1 leading-relaxed">
                  Les toasts supplémentaires attendent en file et s'affichent automatiquement dès qu'un slot se libère.
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    const types = ["payment", "success", "error", "info", "warning", "security"] as const;
                    const titles = ["Paiement n°1", "Succès n°2", "Erreur n°3", "Info n°4", "Warning n°5", "Sécurité n°6"];
                    types.forEach((t, i) => {
                      setTimeout(() => {
                        toast.show(t, {
                          title: titles[i],
                          description: `Toast ${i + 1}/6 — en file si > 4 visibles`,
                          position,
                        });
                      }, i * 80);
                    });
                  }}
                  className="px-4 py-2.5 rounded-xl text-[12px] font-bold bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/25 text-violet-300 transition-all"
                >
                  6 toasts d'un coup
                </button>
              </div>
            </div>

            {/* Visual queue indicator */}
            <div className="mt-4 flex items-center gap-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[10px] font-bold text-violet-400"
                  >
                    {n}
                  </div>
                ))}
              </div>
              <span className="text-[11px] text-zinc-600">slots visibles</span>
              <span className="text-zinc-700 mx-1">+</span>
              <div className="flex gap-1">
                {[5, 6].map((n) => (
                  <div
                    key={n}
                    className="w-8 h-8 rounded-lg bg-zinc-800/60 border border-white/5 flex items-center justify-center text-[10px] font-bold text-zinc-600"
                  >
                    {n}
                  </div>
                ))}
              </div>
              <span className="text-[11px] text-zinc-600">en file</span>
            </div>
          </div>
        </motion.section>

        {/* ─── CODE SNIPPET ────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.38 }}
        >
          <SectionTitle icon={Code2} title="Intégration" sub="Utilisable depuis n'importe quel composant React" />
          <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 overflow-hidden">
            {/* macOS-style title bar */}
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <span className="text-[11px] text-zinc-500 ml-2 font-mono">exemple.tsx</span>
            </div>
            <pre className="p-5 text-[11.5px] text-zinc-300 font-mono leading-relaxed overflow-x-auto">
{`import { useSimixToast } from "@/lib/simix-toast";

// ── Dans un composant React ──────────────────────────────
function MonComposant() {
  const { showSuccess, showError, showPayment, showLoading, dismiss } = useSimixToast();

  const handlePaiement = async () => {
    const id = showLoading({
      title: "Paiement en cours…",
      description: "Validation via Orange Money.",
      position: "bottom-center",
    });

    try {
      await payerViaOrangeMoney();
      dismiss(id);
      showPayment({
        title: "Paiement confirmé ✓",
        description: "5 000 FCFA crédités sur votre compte.",
        action: { label: "Voir le solde", onClick: () => navigate("/wallet") },
      });
    } catch {
      dismiss(id);
      showError({ title: "Paiement échoué", description: "Réessayez ou contactez le support." });
    }
  };
}

// ── En dehors de React (services, utils…) ───────────────
import { simixToast } from "@/lib/simix-toast";

simixToast.security({ title: "Nouvelle connexion détectée", description: "Paris, FR · Chrome" });
simixToast.network({ title: "Connexion rétablie", description: "Vous êtes de nouveau en ligne." });`}
            </pre>
          </div>
        </motion.section>

        {/* Bottom padding */}
        <div className="h-8" />
      </div>
    </div>
  );
}

/* ─── SECTION TITLE ─────────────────────────────────────────────────────── */

function SectionTitle({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ElementType;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-0.5">
        <Icon className="w-4 h-4 text-violet-400" />
        <h2 className="text-[14px] font-bold text-white">{title}</h2>
      </div>
      {sub && <p className="text-[12px] text-zinc-500 ml-6">{sub}</p>}
    </div>
  );
}
