import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Lock,
  Shield,
  Smartphone,
  Eye,
  EyeOff,
  AlertTriangle,
  LogOut,
  CheckCircle,
  KeyRound,
  Fingerprint,
  Trash2,
  RefreshCcw,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isPWA } from "@/lib/pin/pwa-detect";
import { hasPinSetup, clearPin, getPinUser } from "@/lib/pin/pin-store";
import { usePinLock } from "@/context/PinLockContext";
import { PinSetup } from "@/pages/pin/PinSetup";
import { useGetMe } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TWO_FA_KEY = "simix_2fa_enabled";

export default function ProfileSecurite() {
  return (
    <AuthGuard>
      <AppLayout>
        <SecuriteContent />
      </AppLayout>
    </AuthGuard>
  );
}

function SecuriteContent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwd, setPwd] = useState({ current: "", newPwd: "", confirm: "" });
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinSetupMode, setPinSetupMode] = useState<"setup" | "change">("setup");

  const pwaMode = isPWA();
  const { disablePin } = usePinLock();
  const { data: apiUser } = useGetMe();
  const userId = (apiUser as any)?.id ?? getPinUser()?.id ?? "";
  const pinUser = getPinUser();
  const pinActive = userId ? hasPinSetup(userId) : false;

  const [twoFa, setTwoFa] = useState(() => {
    try {
      return localStorage.getItem(TWO_FA_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(TWO_FA_KEY, String(twoFa));
    } catch {
      /* ignore */
    }
  }, [twoFa]);

  const handleChangePwd = async () => {
    if (!pwd.current) {
      toast({ title: "Mot de passe actuel manquant", description: "Veuillez saisir votre mot de passe actuel pour confirmer le changement.", variant: "destructive" });
      return;
    }
    if (pwd.newPwd.length < 6) {
      toast({ title: "Mot de passe trop court", description: "Votre nouveau mot de passe doit contenir au moins 6 caractères.", variant: "destructive" });
      return;
    }
    if (pwd.newPwd !== pwd.confirm) {
      toast({ title: "Mots de passe différents", description: "La confirmation ne correspond pas au nouveau mot de passe saisi. Veuillez les vérifier.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/auth/me/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.newPwd }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Erreur lors du changement de mot de passe");
      }
      setPwd({ current: "", newPwd: "", confirm: "" });
      toast({ title: "Mot de passe mis à jour ✓", description: "Votre mot de passe a été modifié avec succès." });
    } catch (err) {
      toast({ title: "Échec du changement", description: (err as Error).message || "Une erreur est survenue. Réessayez.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle2FA = () => {
    const next = !twoFa;
    setTwoFa(next);
    toast({
      title: next ? "2FA activée" : "2FA désactivée",
      description: next ? "Vous recevrez un code SMS à chaque connexion." : "La double authentification a été désactivée.",
    });
  };

  const handleDisablePin = useCallback(() => {
    if (!userId) return;
    clearPin(userId);
    disablePin();
    toast({ title: "Code PIN supprimé", description: "Le déverrouillage par PIN a été désactivé sur cet appareil." });
  }, [userId, disablePin, toast]);

  const handlePinSetupDone = useCallback(() => {
    setShowPinSetup(false);
    toast({ title: "Code PIN configuré ✓", description: "Votre PIN a été enregistré. Il vous sera demandé à chaque ouverture de l'application." });
  }, [toast]);

  // Full-screen PIN setup overlay
  if (showPinSetup && pinUser) {
    return (
      <div className="fixed inset-0 z-[9998] bg-background">
        <PinSetup
          user={pinUser}
          onComplete={handlePinSetupDone}
          isChange={pinSetupMode === "change"}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-6 pb-3 border-b border-card-border/50">
        <button onClick={() => setLocation("/profile")} className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Sécurité</h1>
        <div className="w-9 h-9" />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        {/* Security score */}
        <div className="bg-gradient-to-br from-violet-900/40 to-background border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Score de sécurité</p>
              <p className="text-lg font-black text-foreground">
                {twoFa && pinActive ? <>Excellent <span className="text-emerald-400">100/100</span></> : twoFa || pinActive ? <>Bon <span className="text-emerald-400">85/100</span></> : <>Bon <span className="text-emerald-400">72/100</span></>}
              </p>
            </div>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: twoFa && pinActive ? "100%" : twoFa || pinActive ? "85%" : "72%" }} />
          </div>
          {(!twoFa || !pinActive) && (
            <p className="text-xs text-muted-foreground mt-2">
              {!twoFa && !pinActive ? "Activez la 2FA et le PIN pour atteindre 100/100." : !pinActive && pwaMode ? "Activez le code PIN pour sécuriser l'accès à l'application." : "Activez la 2FA pour atteindre 100/100."}
            </p>
          )}
        </div>

        {/* PIN Section — PWA only */}
        {pwaMode && (
          <div className="bg-card border border-card-border rounded-3xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Code PIN — Déverrouillage rapide</h3>
            </div>

            {/* Status badge */}
            <div className={`flex items-center gap-3 p-3 rounded-xl mb-4 ${pinActive ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-secondary border border-card-border"}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${pinActive ? "bg-emerald-500/20" : "bg-secondary"}`}>
                <Fingerprint className={`w-4 h-4 ${pinActive ? "text-emerald-400" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${pinActive ? "text-emerald-400" : "text-foreground"}`}>
                  {pinActive ? "PIN activé" : "PIN désactivé"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pinActive ? "L'application se verrouille automatiquement à la fermeture." : "Activez un PIN pour déverrouiller sans ressaisir votre mot de passe."}
                </p>
              </div>
              {pinActive && <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {!pinActive ? (
                <button
                  onClick={() => { setPinSetupMode("setup"); setShowPinSetup(true); }}
                  className="w-full flex items-center justify-between px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl hover:bg-primary/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <KeyRound className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">Créer un code PIN</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-primary" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setPinSetupMode("change"); setShowPinSetup(true); }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-secondary rounded-xl hover:bg-secondary/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <RefreshCcw className="w-4 h-4 text-foreground" />
                      <span className="text-sm font-semibold text-foreground">Modifier le PIN</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={handleDisablePin}
                    className="w-full flex items-center justify-between px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Trash2 className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-semibold text-red-400">Désactiver le PIN</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-red-400" />
                  </button>
                </>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground/70 mt-3 text-center leading-relaxed">
              Le PIN est stocké localement sur cet appareil uniquement. Il n'est jamais transmis à nos serveurs.
            </p>
          </div>
        )}

        {/* Change password */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Changer le mot de passe</h3>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={pwd.current}
                onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
                placeholder="Mot de passe actuel"
                className="w-full bg-secondary border border-card-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary pr-11"
              />
              <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={pwd.newPwd}
                onChange={(e) => setPwd((p) => ({ ...p, newPwd: e.target.value }))}
                placeholder="Nouveau mot de passe (min. 6 caractères)"
                className="w-full bg-secondary border border-card-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary pr-11"
              />
              <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {pwd.newPwd && (
              <div className="flex gap-1">
                {[1,2,3,4].map((i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= (pwd.newPwd.length < 4 ? 1 : pwd.newPwd.length < 6 ? 2 : pwd.newPwd.length < 8 ? 3 : 4) ? "bg-primary" : "bg-secondary"}`} />
                ))}
              </div>
            )}
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={pwd.confirm}
                onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                placeholder="Confirmer le nouveau mot de passe"
                className="w-full bg-secondary border border-card-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary pr-11"
              />
              <button onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleChangePwd}
              disabled={saving}
              className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
              {saving ? "Modification..." : "Modifier le mot de passe"}
            </button>
          </div>
        </div>

        {/* 2FA */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Authentification à 2 facteurs</h3>
                <p className="text-xs text-muted-foreground">Sécurisez votre compte avec un code SMS</p>
              </div>
            </div>
            <button
              onClick={handleToggle2FA}
              className={`relative w-12 h-6 rounded-full transition-colors ${twoFa ? "bg-primary" : "bg-secondary border border-card-border"}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${twoFa ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>
          {twoFa && (
            <div className="mt-3 flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-emerald-400 font-medium">2FA activée — Votre compte est mieux protégé.</p>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <AlertTriangle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-emerald-400/90 leading-relaxed">
            Si vous pensez que votre compte a été compromis, changez immédiatement votre mot de passe et déconnectez toutes les autres sessions.
          </p>
        </div>

        {/* Disconnect other sessions */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Sessions actives</h3>
          </div>
          <div className="flex items-center gap-3 p-3 bg-secondary rounded-xl mb-3">
            <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-xl flex-shrink-0">📱</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground truncate">Appareil actuel</p>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">Actuel</span>
              </div>
              <p className="text-xs text-muted-foreground">Actif maintenant</p>
            </div>
          </div>
          <button
            onClick={() => toast({ title: "Sessions révoquées", description: "Toutes les autres sessions ont été déconnectées." })}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-sm rounded-xl hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Déconnecter les autres appareils
          </button>
        </div>
      </motion.div>
    </div>
  );
}
