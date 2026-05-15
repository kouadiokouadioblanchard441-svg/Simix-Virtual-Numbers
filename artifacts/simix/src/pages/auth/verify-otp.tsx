import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Mail, RefreshCw, CheckCircle2, AlertCircle, Lock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SimixLogo } from "@/components/simix-logo";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost(path: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Une erreur est survenue");
  return data;
}

async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Une erreur est survenue");
  return data;
}

const RESEND_COOLDOWN = 60;

export default function VerifyOtp() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [purpose, setPurpose] = useState<"register" | "inactivity">("register");
  const [userEmail, setUserEmail] = useState("");

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    apiGet("/api/auth/otp/status")
      .then((data) => {
        if (!data.needsVerification) {
          setLocation("/dashboard");
          return;
        }
        setPurpose(data.needsInactivityCheck ? "inactivity" : "register");
        setUserEmail(data.email ?? "");
        // Auto-send OTP on page load only if it's a fresh inactivity check
        // (registration OTP is already sent by the backend at registration/login time)
      })
      .catch(() => setLocation("/login"));
  }, []);

  /* Start cooldown immediately since backend sends OTP on register/login */
  useEffect(() => {
    setCooldown(RESEND_COOLDOWN);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      const v = value.replace(/\D/g, "").slice(-1);
      const next = [...digits];
      next[index] = v;
      setDigits(next);
      setStatus("idle");
      setErrorMsg("");
      if (v && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
      if (next.every((d) => d !== "") && next.join("").length === 6) {
        submitCode(next.join(""));
      }
    },
    [digits],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (!digits[index] && index > 0) {
          const next = [...digits];
          next[index - 1] = "";
          setDigits(next);
          inputRefs.current[index - 1]?.focus();
        } else {
          const next = [...digits];
          next[index] = "";
          setDigits(next);
        }
      } else if (e.key === "ArrowLeft" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowRight" && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const next = pasted.split("");
      setDigits(next);
      inputRefs.current[5]?.focus();
      submitCode(pasted);
    }
  }, []);

  const submitCode = useCallback(async (code: string) => {
    setIsVerifying(true);
    setStatus("idle");
    try {
      await apiPost("/api/auth/otp/verify", { code });
      setStatus("success");
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setTimeout(() => setLocation("/dashboard"), 1200);
    } catch (err: unknown) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Code incorrect";
      setErrorMsg(msg);
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      await apiPost("/api/auth/otp/resend");
      setCooldown(RESEND_COOLDOWN);
      setDigits(["", "", "", "", "", ""]);
      setStatus("idle");
      setErrorMsg("");
      inputRefs.current[0]?.focus();
      toast({ title: "Code renvoyé", description: `Un nouveau code a été envoyé à ${userEmail}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors du renvoi";
      toast({ title: "Code non renvoyé", description: msg || "Une erreur est survenue lors du renvoi du code. Réessayez dans quelques instants.", variant: "destructive" });
    } finally {
      setIsResending(false);
    }
  };

  const maskedEmail = userEmail
    ? userEmail.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 6)) + c)
    : "votre email";

  const isInactivity = purpose === "inactivity";

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 z-10">
        <button
          onClick={() => setLocation("/login")}
          className="w-10 h-10 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <SimixLogo size={32} />
        <div className="w-10 h-10 rounded-xl border border-primary/30 flex items-center justify-center bg-primary/10">
          <Lock className="w-4 h-4 text-primary" />
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
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${isInactivity ? "bg-amber-500/10 border border-amber-500/20" : "bg-primary/10 border border-primary/20"}`}>
                {isInactivity ? (
                  <Shield className="w-9 h-9 text-amber-400" />
                ) : (
                  <Mail className="w-9 h-9 text-primary" />
                )}
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className={`absolute -inset-1 rounded-3xl border ${isInactivity ? "border-amber-500/20" : "border-primary/20"} border-dashed`}
              />
            </motion.div>
          </div>

          {/* Titles */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 ${isInactivity ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-primary/10 text-primary border border-primary/20"}`}>
                {isInactivity ? "🔐 Vérification de sécurité" : "✉️ Confirmation d'email"}
              </span>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {isInactivity ? "Vérifiez votre identité" : "Vérifiez votre email"}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isInactivity
                  ? "Reconnexion après une longue inactivité détectée. Un code de sécurité a été envoyé à"
                  : "Pour activer votre compte, entrez le code à 6 chiffres envoyé à"}
              </p>
              <p className="text-sm font-semibold text-foreground mt-1">{maskedEmail}</p>
            </motion.div>
          </div>

          {/* OTP Inputs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  className="relative"
                >
                  <input
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    disabled={isVerifying || status === "success"}
                    className={`w-12 h-14 text-center text-xl font-bold rounded-2xl border-2 bg-card transition-all duration-200 focus:outline-none
                      ${status === "success"
                        ? "border-green-500 text-green-400 bg-green-500/10"
                        : status === "error" && !d
                        ? "border-red-500/60 bg-red-500/5"
                        : d
                        ? "border-primary text-foreground bg-primary/5"
                        : "border-card-border text-foreground focus:border-primary focus:bg-primary/5"
                      }
                      ${isVerifying ? "opacity-60 cursor-not-allowed" : "cursor-text"}
                    `}
                  />
                </motion.div>
              ))}
            </div>

            {/* Status feedback */}
            <AnimatePresence mode="wait">
              {status === "error" && errorMsg && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{errorMsg}</p>
                </motion.div>
              )}
              {status === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <p className="text-sm text-green-400 font-medium">Email vérifié ! Redirection...</p>
                </motion.div>
              )}
              {isVerifying && status === "idle" && (
                <motion.div
                  key="verifying"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center gap-2 mt-4"
                >
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Vérification en cours...</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Submit button */}
          {status !== "success" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="mb-6"
            >
              <Button
                onClick={() => {
                  const code = digits.join("");
                  if (code.length === 6) submitCode(code);
                }}
                disabled={digits.join("").length !== 6 || isVerifying}
                className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white shadow-lg shadow-primary/25 disabled:opacity-40"
              >
                {isVerifying ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Vérification...
                  </span>
                ) : "Confirmer le code"}
              </Button>
            </motion.div>
          )}

          {/* Resend section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center"
          >
            <p className="text-sm text-muted-foreground mb-2">Vous n'avez pas reçu le code ?</p>
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || isResending || status === "success"}
              className="flex items-center gap-2 mx-auto text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-primary hover:text-primary/80"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
              {cooldown > 0
                ? `Renvoyer dans ${cooldown}s`
                : isResending
                ? "Envoi en cours..."
                : "Renvoyer le code"}
            </button>
          </motion.div>

          {/* Security info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 p-4 bg-card border border-card-border rounded-2xl"
          >
            <div className="flex gap-3">
              <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Protection de votre compte</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ce code est valable <strong className="text-foreground">10 minutes</strong> et ne peut être utilisé qu'une seule fois. Ne le partagez jamais.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
