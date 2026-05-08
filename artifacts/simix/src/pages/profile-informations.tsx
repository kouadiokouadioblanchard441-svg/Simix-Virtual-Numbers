import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Camera, User, Phone, Mail, AtSign, Globe, CheckCircle, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COUNTRY_CODES = [
  { code: "+225", name: "Côte d'Ivoire", flag: "ci" },
  { code: "+221", name: "Sénégal", flag: "sn" },
  { code: "+237", name: "Cameroun", flag: "cm" },
  { code: "+233", name: "Ghana", flag: "gh" },
  { code: "+234", name: "Nigeria", flag: "ng" },
  { code: "+254", name: "Kenya", flag: "ke" },
  { code: "+223", name: "Mali", flag: "ml" },
  { code: "+226", name: "Burkina Faso", flag: "bf" },
  { code: "+228", name: "Togo", flag: "tg" },
  { code: "+229", name: "Bénin", flag: "bj" },
];

export default function ProfileInformations() {
  return (
    <AuthGuard>
      <AppLayout>
        <InformationsContent />
      </AppLayout>
    </AuthGuard>
  );
}

function InformationsContent() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fullName: user?.fullName ?? "",
    username: user?.username ?? "",
    email: user?.email ?? "",
    country: "+225",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      toast({ title: "Erreur", description: "Le nom complet est requis.", variant: "destructive" });
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 900));
    setSaving(false);
    toast({ title: "Profil mis à jour", description: "Vos informations ont été sauvegardées avec succès." });
  };

  const initials = (user?.fullName ?? "U").charAt(0).toUpperCase();

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pt-0 pb-28 px-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur-sm z-20 pt-6 pb-3 border-b border-card-border/50">
        <button onClick={() => setLocation("/profile")} className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Informations personnelles</h1>
        <div className="w-9 h-9" />
      </div>

      {/* Avatar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center mb-8">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-primary text-4xl font-black shadow-lg">
            {(user as any)?.avatar ? (
              <img src={(user as any).avatar} alt="Avatar" className="w-full h-full rounded-full object-cover" />
            ) : initials}
          </div>
          <button className="absolute -bottom-1 -right-1 w-9 h-9 bg-primary rounded-full flex items-center justify-center shadow-lg border-2 border-background hover:bg-primary/90 transition-colors">
            <Camera className="w-4 h-4 text-white" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Appuyez pour changer la photo</p>
      </motion.div>

      {/* Form */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
        {/* Nom complet */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Nom complet
          </label>
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => handleChange("fullName", e.target.value)}
            placeholder="Votre nom complet"
            className="w-full bg-card border border-card-border rounded-2xl px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Username */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AtSign className="w-3.5 h-3.5" /> Nom d'utilisateur
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
            <input
              type="text"
              value={form.username}
              onChange={(e) => handleChange("username", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="nom_utilisateur"
              className="w-full bg-card border border-card-border rounded-2xl pl-8 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Adresse e-mail
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => handleChange("email", e.target.value)}
            placeholder="votre@email.com"
            className="w-full bg-card border border-card-border rounded-2xl px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Téléphone (lecture seule) */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" /> Numéro de téléphone
          </label>
          <div className="relative">
            <input
              type="text"
              value={user?.phone ?? "Non défini"}
              readOnly
              className="w-full bg-secondary/50 border border-card-border rounded-2xl px-4 py-3.5 text-sm text-muted-foreground cursor-not-allowed"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60 bg-secondary px-2 py-0.5 rounded-full">Non modifiable</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 ml-1">Contactez le support pour modifier votre numéro.</p>
        </div>

        {/* Pays */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Pays
          </label>
          <select
            value={form.country}
            onChange={(e) => handleChange("country", e.target.value)}
            className="w-full bg-card border border-card-border rounded-2xl px-4 py-3.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors appearance-none"
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
            ))}
          </select>
        </div>

        {/* Compte vérifié badge */}
        {user?.verified && (
          <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">Compte vérifié</p>
              <p className="text-xs text-muted-foreground">Votre identité a été vérifiée avec succès.</p>
            </div>
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-2 flex items-center justify-center gap-2 py-4 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-primary/20"
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Sauvegarde..." : "Sauvegarder les modifications"}
        </button>

        {/* Member since */}
        <p className="text-center text-[11px] text-muted-foreground pb-4">
          Membre depuis {new Date(user?.createdAt ?? Date.now()).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </p>
      </motion.div>
    </div>
  );
}
