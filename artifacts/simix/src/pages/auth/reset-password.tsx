import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw, Shield, Lock } from "lucide-react";
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

const RESEND_COOLDOWN = 60;

type Step = "otp" | "password" | "done";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const userIdParam = params.get("userId") ?? "";

  const [step, setStep] = useState<Step>("otp");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpStatus, setOtpStatus] = useState<"idle" | "error">("idle");
  const [otpError, setOtpError] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [isResending, setIsResending] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");

  const [verifiedCode, setVerifiedCode] = useState("");

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!userIdParam) setLocation("/forgot-password");
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      const v = value.replace(/\D/g, "").slice(-1);
      const next = [...digits];
      next[index] = v;
      setDigits(next);
      setOtpStatus("idle");
      setOtpError("");
      if (v && index < 5) inputRefs.current[index + 1]?.focus();
      if (next.every((d) => d !== "") && next.join("").length === 6) {
        submitOtp(next.join(""));
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
      setDigits(pasted.split(""));
      inputRefs.current[5]?.focus();
      submitOtp(pasted);
    }
  }, []);

  const submitOtp = useCallback(async (code: string) => {
    setIsVerifying(true);
    setOtpStatus("idle");
    try {
      await apiPost("/api/auth/forgot-password/verify", { userId: userIdParam, code });
      setVerifiedCode(code);
      setStep("password");
    } catch (err: unknown) {
      setOtpStatus("error");
      const msg = err instanceof Error ? err.message : "Code incorrect";
      setOtpError(msg);
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setIsVerifying(false);
    }
  }, [userIdParam]);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      await apiPost("/api/auth/forgot-password/resend", { userId: userIdParam });
      setCooldown(RESEND_COOLDOWN);
      setDigits(["", "", "", "", "", ""]);
      setOtpStatus("idle");
      setOtpError("");
      inputRefs.current[0]?.focus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setOtpError(msg);
    } finally {
      setIsResending(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError("");

    if (newPassword.length < 6) {
      setPwdError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("Les mots de passe ne correspondent pas.");
      return;
    }

    setIsSaving(true);
    try {
      await apiPost("/api/auth/reset-password", {
        userId: userIdParam,
        code: verifiedCode,
        newPassword,
      });
      setStep("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de la réinitialisation";
      setPwdError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const passwordStrength = (() => {
    if (!newPassword) return { score: 0, label: "", color: "" };
    let s = 0;
    if (newPassword.length >= 8) s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[^A-Za-z0-9]/.test(newPassword)) s++;
    const labels = ["", "Faible", "Moyen", "Fort", "Très fort"];
    const colors = ["", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"];
    return { score: s, label: labels[s], color: colors[s] };
  })();

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 z-10">
        <button
          onClick={() => step === "password" ? setStep("otp") : setLocation("/forgot-password")}
          className="w-10 h-10 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <SimixLogo size={32} />
        <div className="w-10 h-10 rounded-xl border border-primary/20 flex items-center justify-center bg-primary/5">
          <Shield className="w-4 h-4 text-primary" />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10 z-10">

        {/* ── STEP: OTP ── */}
        <AnimatePresence mode="wait">
          {step === "otp" && (
            <motion.div
              key="otp"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm"
            >
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20">
                    <KeyRound className="w-9 h-9 text-red-400" />
                  </div>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-1 rounded-3xl border border-red-500/15 border-dashed"
                  />
                </div>
              </div>

              <div className="text-center mb-8">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 bg-red-500/10 text-red-400 border border-red-500/20">
                  🔑 Code de réinitialisation
                </span>
                <h1 className="text-2xl font-bold text-foreground mb-2">Entrez votre code</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Saisissez le code à 6 chiffres envoyé à votre adresse email.
                </p>
              </div>

              {/* OTP Inputs */}
              <div className="mb-6">
                <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      disabled={isVerifying}
                      className={`w-12 h-14 text-center text-xl font-bold rounded-2xl border-2 bg-card transition-all duration-200 focus:outline-none
                        ${otpStatus === "error" && !d
                          ? "border-red-500/60 bg-red-500/5"
                          : d
                          ? "border-red-400/60 text-foreground bg-red-500/5"
                          : "border-card-border text-foreground focus:border-red-400/60 focus:bg-red-500/5"
                        }
                        ${isVerifying ? "opacity-60 cursor-not-allowed" : "cursor-text"}
                      `}
                    />
                  ))}
                </div>

                <AnimatePresence>
                  {otpStatus === "error" && otpError && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                    >
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-sm text-red-400">{otpError}</p>
                    </motion.div>
                  )}
                  {isVerifying && (
                    <motion.div
                      key="verifying"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center gap-2 mt-4"
                    >
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">Vérification...</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Button
                onClick={() => { const c = digits.join(""); if (c.length === 6) submitOtp(c); }}
                disabled={digits.join("").length !== 6 || isVerifying}
                className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white shadow-lg shadow-primary/25 disabled:opacity-40 mb-6"
              >
                {isVerifying ? "Vérification..." : "Valider le code"}
              </Button>

              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Vous n'avez pas reçu le code ?</p>
                <button
                  onClick={handleResend}
                  disabled={cooldown > 0 || isResending}
                  className="flex items-center gap-2 mx-auto text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-primary hover:text-primary/80"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
                  {cooldown > 0 ? `Renvoyer dans ${cooldown}s` : isResending ? "Envoi..." : "Renvoyer le code"}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP: New Password ── */}
          {step === "password" && (
            <motion.div
              key="password"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="w-full max-w-sm"
            >
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-primary/10 border border-primary/20">
                    <Lock className="w-9 h-9 text-primary" />
                  </div>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-1 rounded-3xl border border-primary/15 border-dashed"
                  />
                </div>
              </div>

              <div className="text-center mb-8">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 bg-primary/10 text-primary border border-primary/20">
                  ✅ Code vérifié — Nouveau mot de passe
                </span>
                <h1 className="text-2xl font-bold text-foreground mb-2">Créez un nouveau mot de passe</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Choisissez un mot de passe fort et unique pour sécuriser votre compte.
                </p>
              </div>

              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Nouveau mot de passe</label>
                  <div className="relative h-14">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showPwd ? "text" : "password"}
                      placeholder="Minimum 6 caractères"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setPwdError(""); }}
                      autoComplete="new-password"
                      className="pl-11 pr-12 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl"
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Password strength */}
                  {newPassword && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= passwordStrength.score ? passwordStrength.color : "bg-card-border"}`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{passwordStrength.label}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Confirmer le mot de passe</label>
                  <div className="relative h-14">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showConfirm ? "text" : "password"}
                      placeholder="Répétez votre mot de passe"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setPwdError(""); }}
                      autoComplete="new-password"
                      className={`pl-11 pr-12 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl ${
                        confirmPassword && newPassword !== confirmPassword ? "border-red-500/40" : confirmPassword && newPassword === confirmPassword ? "border-green-500/40" : ""
                      }`}
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {pwdError && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                    >
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-sm text-red-400">{pwdError}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  disabled={!newPassword || !confirmPassword || isSaving}
                  className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white shadow-lg shadow-primary/25 disabled:opacity-40"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Enregistrement...
                    </span>
                  ) : "Enregistrer le nouveau mot de passe"}
                </Button>
              </form>
            </motion.div>
          )}

          {/* ── STEP: Done ── */}
          {step === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-sm text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                className="w-24 h-24 rounded-3xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle2 className="w-12 h-12 text-green-400" />
              </motion.div>

              <h1 className="text-2xl font-bold text-foreground mb-3">Mot de passe réinitialisé !</h1>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                Votre mot de passe a été mis à jour avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
              </p>

              <Button
                onClick={() => setLocation("/login")}
                className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white shadow-lg shadow-primary/25"
              >
                Se connecter
              </Button>

              <div className="mt-6 p-4 bg-card border border-card-border rounded-2xl text-left">
                <div className="flex gap-3">
                  <Shield className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Pour votre sécurité, toutes vos sessions actives ont été maintenues. Pensez à choisir un mot de passe unique et différent de vos autres comptes.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
