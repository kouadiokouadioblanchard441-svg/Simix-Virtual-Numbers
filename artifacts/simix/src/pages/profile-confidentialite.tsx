import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, Eye, Database, Trash2, Download, ChevronRight, Shield, AlertTriangle, FileText, Cookie, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? "bg-primary" : "bg-secondary border border-card-border"}`}>
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? "translate-x-6" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function ProfileConfidentialite() {
  return (
    <AuthGuard>
      <AppLayout>
        <ConfidentialiteContent />
      </AppLayout>
    </AuthGuard>
  );
}

function ConfidentialiteContent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [prefs, setPrefs] = useState({
    analytics: false,
    personalized: false,
    dataSharing: false,
    profileVisible: true,
  });

  const update = (k: keyof typeof prefs, v: boolean) => setPrefs((p) => ({ ...p, [k]: v }));

  const handleExport = async () => {
    toast({ title: "Exportation en cours", description: "Vous recevrez vos données par email dans les 48h." });
  };

  const handleDelete = () => {
    if (deleteConfirm !== "SUPPRIMER") {
      toast({ title: "Confirmation incorrecte", description: "Veuillez saisir SUPPRIMER pour confirmer.", variant: "destructive" });
      return;
    }
    toast({ title: "Demande enregistrée", description: "Votre compte sera supprimé dans les 30 jours. Vous pouvez annuler en vous reconnectant." });
    setShowDelete(false);
    setDeleteConfirm("");
  };

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-6 pb-3 border-b border-card-border/50">
        <button onClick={() => setLocation("/profile")} className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Confidentialité</h1>
        <div className="w-9 h-9" />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        {/* RGPD badge */}
        <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-2xl">
          <Shield className="w-5 h-5 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-primary">Conforme RGPD & lois africaines</p>
            <p className="text-xs text-muted-foreground">Simix respecte votre vie privée et vos données personnelles.</p>
          </div>
        </div>

        {/* Data preferences */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Visibilité & données</h3>
          </div>
          <div className="space-y-0">
            {[
              { key: "profileVisible" as const, label: "Profil public", sub: "Votre nom peut être vu par les autres utilisateurs" },
              { key: "analytics" as const, label: "Statistiques d'usage", sub: "Nous aider à améliorer l'app avec vos données anonymisées" },
              { key: "personalized" as const, label: "Publicités personnalisées", sub: "Recevoir des offres adaptées à votre usage" },
              { key: "dataSharing" as const, label: "Partage avec partenaires", sub: "Partager vos données avec nos partenaires de confiance" },
            ].map(({ key, label, sub }) => (
              <div key={key} className="flex items-center justify-between py-3.5 border-b border-card-border/40 last:border-0 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
                <Toggle value={prefs[key]} onChange={(v) => update(key, v)} />
              </div>
            ))}
          </div>
        </div>

        {/* Documents légaux */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Documents légaux</h3>
          </div>
          <div className="space-y-1">
            {[
              { label: "Politique de confidentialité", date: "Mise à jour jan. 2026", href: "/profile/politique-confidentialite", icon: Shield, color: "text-primary bg-primary/10" },
              { label: "Conditions générales d'utilisation", date: "Mise à jour jan. 2026", href: "/profile/cgu", icon: FileText, color: "text-blue-400 bg-blue-500/10" },
              { label: "Politique des cookies", date: "Mise à jour jan. 2026", href: "/profile/cookies", icon: Cookie, color: "text-emerald-400 bg-emerald-500/10" },
              { label: "Mentions légales", date: "Mise à jour jan. 2026", href: "/profile/mentions-legales", icon: Building2, color: "text-violet-400 bg-violet-500/10" },
            ].map(({ label, date, href, icon: Icon, color }) => (
              <button key={label} onClick={() => setLocation(href)} className="w-full flex items-center gap-3 py-3 text-left hover:bg-secondary/50 transition-colors rounded-xl px-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color.split(" ")[1]}`}>
                  <Icon className={`w-4 h-4 ${color.split(" ")[0]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{date}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Mes données */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Mes données</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-secondary rounded-2xl">
              <div>
                <p className="text-sm font-semibold text-foreground">Exporter mes données</p>
                <p className="text-xs text-muted-foreground">Recevez une copie de vos données par email</p>
              </div>
              <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-primary/20 text-primary text-xs font-semibold rounded-xl hover:bg-primary/30 transition-colors flex-shrink-0">
                <Download className="w-3.5 h-3.5" />
                Exporter
              </button>
            </div>
            <div className="text-xs text-muted-foreground p-3 bg-secondary/50 rounded-xl leading-relaxed">
              Simix conserve vos données pendant 3 ans après la dernière activité. Vous pouvez demander la suppression à tout moment.
            </div>
          </div>
        </div>

        {/* Delete account */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-bold text-red-400">Zone de danger</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            La suppression de votre compte est irréversible. Toutes vos données, historique et solde seront définitivement effacés.
          </p>
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)} className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-sm rounded-xl hover:bg-red-500/20 transition-colors">
              <Trash2 className="w-4 h-4" />
              Supprimer mon compte
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-red-400 font-medium">Tapez <strong>SUPPRIMER</strong> pour confirmer :</p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="SUPPRIMER"
                className="w-full bg-card border border-red-500/30 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-500"
              />
              <div className="flex gap-2">
                <button onClick={() => { setShowDelete(false); setDeleteConfirm(""); }} className="flex-1 py-2.5 bg-secondary text-foreground text-sm font-semibold rounded-xl hover:bg-secondary/80 transition-colors">
                  Annuler
                </button>
                <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600 transition-colors">
                  Confirmer
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
