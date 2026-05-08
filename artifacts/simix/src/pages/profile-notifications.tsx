import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, MessageSquare, Mail, Smartphone, Shield, Tag, Newspaper, Moon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type NotifKey = "sms_transactions" | "email_transactions" | "push_transactions" | "sms_security" | "email_security" | "push_promotions" | "email_news" | "sms_reminders";

const DEFAULT_PREFS: Record<NotifKey, boolean> = {
  sms_transactions: true,
  email_transactions: true,
  push_transactions: true,
  sms_security: true,
  email_security: true,
  push_promotions: false,
  email_news: false,
  sms_reminders: true,
};

export default function ProfileNotifications() {
  return (
    <AuthGuard>
      <AppLayout>
        <NotificationsContent />
      </AppLayout>
    </AuthGuard>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? "bg-primary" : "bg-secondary border border-card-border"}`}
    >
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? "translate-x-6" : "translate-x-0.5"}`} />
    </button>
  );
}

function NotifRow({ icon: Icon, label, sub, value, onChange, color = "text-foreground" }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3.5 border-b border-card-border/40 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{sub}</p>
        </div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function NotificationsContent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [quietHours, setQuietHours] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (key: NotifKey, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    toast({ title: "Préférences sauvegardées", description: "Vos notifications ont été mises à jour." });
  };

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-6 pb-3 border-b border-card-border/50">
        <button onClick={() => setLocation("/profile")} className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Notifications</h1>
        <div className="w-9 h-9" />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        {/* Transactions */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Transactions</h3>
              <p className="text-[10px] text-muted-foreground">Achats, rechargements, remboursements</p>
            </div>
          </div>
          <div className="mt-2">
            <NotifRow icon={MessageSquare} label="SMS" sub="Reçu après chaque transaction" value={prefs.sms_transactions} onChange={(v) => update("sms_transactions", v)} color="text-emerald-400" />
            <NotifRow icon={Mail} label="Email" sub="Reçu dans votre boîte mail" value={prefs.email_transactions} onChange={(v) => update("email_transactions", v)} color="text-blue-400" />
            <NotifRow icon={Smartphone} label="Notification push" sub="Alerte sur votre téléphone" value={prefs.push_transactions} onChange={(v) => update("push_transactions", v)} color="text-violet-400" />
          </div>
        </div>

        {/* Sécurité */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Sécurité</h3>
              <p className="text-[10px] text-muted-foreground">Connexions, alertes et activités suspectes</p>
            </div>
          </div>
          <p className="text-xs text-red-400/80 mb-2">Recommandé : ne pas désactiver</p>
          <div>
            <NotifRow icon={MessageSquare} label="Alertes SMS" sub="Nouvelle connexion ou activité suspecte" value={prefs.sms_security} onChange={(v) => update("sms_security", v)} color="text-red-400" />
            <NotifRow icon={Mail} label="Alertes Email" sub="Rapport de sécurité hebdomadaire" value={prefs.email_security} onChange={(v) => update("email_security", v)} color="text-red-400" />
          </div>
        </div>

        {/* Promotions */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Tag className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Promotions & offres</h3>
              <p className="text-[10px] text-muted-foreground">Réductions, codes promo, offres exclusives</p>
            </div>
          </div>
          <div className="mt-2">
            <NotifRow icon={Smartphone} label="Notifications push" sub="Offres et promotions en temps réel" value={prefs.push_promotions} onChange={(v) => update("push_promotions", v)} color="text-amber-400" />
            <NotifRow icon={MessageSquare} label="SMS rappels" sub="Rappels d'offres expirantes" value={prefs.sms_reminders} onChange={(v) => update("sms_reminders", v)} color="text-amber-400" />
          </div>
        </div>

        {/* Actualités */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <Newspaper className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Actualités Simix</h3>
              <p className="text-[10px] text-muted-foreground">Nouvelles fonctionnalités et mises à jour</p>
            </div>
          </div>
          <div className="mt-2">
            <NotifRow icon={Mail} label="Newsletter" sub="Envoyée une fois par mois" value={prefs.email_news} onChange={(v) => update("email_news", v)} color="text-sky-400" />
          </div>
        </div>

        {/* Heures silencieuses */}
        <div className="bg-card border border-card-border rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center">
                <Moon className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Mode silencieux</h3>
                <p className="text-xs text-muted-foreground">Aucune notif de 22h à 7h du matin</p>
              </div>
            </div>
            <Toggle value={quietHours} onChange={setQuietHours} />
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
        >
          {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {saving ? "Sauvegarde..." : "Sauvegarder les préférences"}
        </button>
      </motion.div>
    </div>
  );
}
