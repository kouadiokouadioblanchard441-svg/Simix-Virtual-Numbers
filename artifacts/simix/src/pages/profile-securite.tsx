import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, Shield, Smartphone, Eye, EyeOff, AlertTriangle, LogOut, CheckCircle, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FAKE_SESSIONS = [
  { id: "1", device: "iPhone 14 Pro", location: "Abidjan, CI", lastActive: "Actif maintenant", current: true, icon: "📱" },
  { id: "2", device: "Chrome — Windows", location: "Abidjan, CI", lastActive: "Il y a 2 heures", current: false, icon: "💻" },
  { id: "3", device: "Firefox — Android", location: "Dakar, SN", lastActive: "Hier, 18h32", current: false, icon: "📱" },
];

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
  const [twoFa, setTwoFa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState(FAKE_SESSIONS);
  const [pwd, setPwd] = useState({ current: "", newPwd: "", confirm: "" });

  const handleChangePwd = async () => {
    if (!pwd.current) { toast({ title: "Mot de passe actuel manquant", description: "Veuillez saisir votre mot de passe actuel pour confirmer le changement.", variant: "destructive" }); return; }
    if (pwd.newPwd.length < 6) { toast({ title: "Mot de passe trop court", description: "Votre nouveau mot de passe doit contenir au moins 6 caractères.", variant: "destructive" }); return; }
    if (pwd.newPwd !== pwd.confirm) { toast({ title: "Mots de passe différents", description: "La confirmation ne correspond pas au nouveau mot de passe saisi. Veuillez les vérifier.", variant: "destructive" }); return; }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSaving(false);
    setPwd({ current: "", newPwd: "", confirm: "" });
    toast({ title: "Mot de passe mis à jour", description: "Votre mot de passe a été modifié avec succès." });
  };

  const handleRevokeSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    toast({ title: "Session révoquée", description: "La session a été déconnectée." });
  };

  const handleRevokeAll = () => {
    setSessions((prev) => prev.filter((s) => s.current));
    toast({ title: "Sessions révoquées", description: "Toutes les autres sessions ont été déconnectées." });
  };

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
              <p className="text-lg font-black text-foreground">Bon <span className="text-emerald-400">72/100</span></p>
            </div>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: "72%" }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Activez la 2FA pour atteindre 100/100.</p>
        </div>

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
              onClick={() => {
                setTwoFa(!twoFa);
                toast({ title: twoFa ? "2FA désactivée" : "2FA activée", description: twoFa ? "La double authentification a été désactivée." : "Vous recevrez un code SMS à chaque connexion." });
              }}
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

        {/* Sessions actives */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Sessions actives</h3>
            </div>
            {sessions.length > 1 && (
              <button onClick={handleRevokeAll} className="text-xs text-red-400 font-semibold hover:text-red-300 transition-colors">
                Tout déconnecter
              </button>
            )}
          </div>
          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 bg-secondary rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-xl flex-shrink-0">{s.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{s.device}</p>
                    {s.current && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">Actuel</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.location} · {s.lastActive}</p>
                </div>
                {!s.current && (
                  <button onClick={() => handleRevokeSession(s.id)} className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors flex-shrink-0">
                    <LogOut className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <AlertTriangle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-emerald-400/90 leading-relaxed">
            Si vous pensez que votre compte a été compromis, changez immédiatement votre mot de passe et déconnectez toutes les autres sessions.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
