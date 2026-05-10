import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Phone, ArrowLeft, KeyRound, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimixLogo } from "@/components/simix-logo";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost(path: string, body: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Une erreur est survenue");
  return data;
}

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [userId, setUserId] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    setIsLoading(true);
    setStatus("idle");
    setErrorMsg("");

    try {
      const data = await apiPost("/api/auth/forgot-password", { identifier: identifier.trim() });
      setUserId(data.userId ?? "");
      setStatus("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Une erreur est survenue";
      setErrorMsg(msg);
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "success") {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

        <div className="flex items-center justify-between px-6 pt-6 pb-4 z-10">
          <button onClick={() => setLocation("/login")} className="w-10 h-10 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <SimixLogo size={32} />
          <div className="w-10" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10 z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
              className="w-20 h-20 rounded-3xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6"
            >
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </motion.div>

            <h1 className="text-2xl font-bold text-foreground mb-3">Email envoyé !</h1>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              Si un compte correspond à <strong className="text-foreground">{identifier}</strong>, vous recevrez un code de réinitialisation dans quelques secondes.
            </p>
            <p className="text-xs text-muted-foreground mb-8">Vérifiez aussi vos spams.</p>

            <Button
              onClick={() => setLocation(`/reset-password?userId=${encodeURIComponent(userId)}`)}
              className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white shadow-lg shadow-primary/25 mb-4"
            >
              Saisir le code reçu
            </Button>

            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Retour à la connexion
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex items-center justify-between px-6 pt-6 pb-4 z-10">
        <Link href="/login" className="w-10 h-10 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <SimixLogo size={32} />
        <div className="w-10 h-10 rounded-xl border border-red-500/20 flex items-center justify-center bg-red-500/5">
          <KeyRound className="w-4 h-4 text-red-400" />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10 z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="relative"
            >
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20">
                <KeyRound className="w-9 h-9 text-red-400" />
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-1 rounded-3xl border border-red-500/15 border-dashed"
              />
            </motion.div>
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 bg-red-500/10 text-red-400 border border-red-500/20">
                🔑 Mot de passe oublié
              </span>
              <h1 className="text-2xl font-bold text-foreground mb-2">Récupérer mon compte</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Entrez votre email, téléphone ou nom d'utilisateur. Nous vous enverrons un code de réinitialisation.
              </p>
            </motion.div>
          </div>

          {/* Form */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Email, téléphone ou identifiant
              </label>
              <div className="relative h-14">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="exemple@email.com ou +225..."
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setStatus("idle");
                    setErrorMsg("");
                  }}
                  className="pl-11 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl"
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>

            <AnimatePresence>
              {status === "error" && errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{errorMsg}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={!identifier.trim() || isLoading}
              className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white shadow-lg shadow-primary/25 disabled:opacity-40"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Envoi en cours...
                </span>
              ) : "Envoyer le code de réinitialisation"}
            </Button>
          </motion.form>

          {/* Info box */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mt-6 p-4 bg-card border border-card-border rounded-2xl"
          >
            <div className="flex gap-3">
              <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Plusieurs options acceptées</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Vous pouvez utiliser votre <strong className="text-foreground">adresse email</strong>, votre <strong className="text-foreground">numéro de téléphone</strong> ou votre <strong className="text-foreground">nom d'utilisateur</strong>.
                </p>
              </div>
            </div>
          </motion.div>

          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Retour à la connexion
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
