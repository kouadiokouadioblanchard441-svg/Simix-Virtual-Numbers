import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Camera, User, Phone, Mail, AtSign, Globe, CheckCircle, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const COUNTRY_CODES = [
  { code: "+225", name: "Côte d'Ivoire", flag: "🇨🇮" },
  { code: "+221", name: "Sénégal", flag: "🇸🇳" },
  { code: "+237", name: "Cameroun", flag: "🇨🇲" },
  { code: "+233", name: "Ghana", flag: "🇬🇭" },
  { code: "+234", name: "Nigeria", flag: "🇳🇬" },
  { code: "+254", name: "Kenya", flag: "🇰🇪" },
  { code: "+223", name: "Mali", flag: "🇲🇱" },
  { code: "+226", name: "Burkina Faso", flag: "🇧🇫" },
  { code: "+228", name: "Togo", flag: "🇹🇬" },
  { code: "+229", name: "Bénin", flag: "🇧🇯" },
];

async function compressAndEncode(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const maxDim = 400;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > 400_000 && quality > 0.25) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(dataUrl);
    };
    img.onerror = reject;
    img.src = url;
  });
}

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: user?.fullName ?? "",
    username: user?.username ?? "",
    email: user?.email ?? "",
    country: "+225",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8_000_000) {
      toast({ title: "Image trop grande", description: "Maximum 8MB", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const dataUrl = await compressAndEncode(file);
      setAvatarPreview(dataUrl);
      const res = await fetch(`${BASE}/api/auth/me/avatar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatar: dataUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Erreur upload");
      }
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Photo de profil mise à jour ✓" });
    } catch (err) {
      setAvatarPreview(null);
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      toast({ title: "Erreur", description: "Le nom complet est requis.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/auth/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          username: form.username,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Erreur de sauvegarde");
      }
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Profil mis à jour ✓", description: "Vos informations ont été sauvegardées." });
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = avatarPreview ?? user?.avatar ?? null;
  const initials = (user?.fullName ?? "S")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto pb-28">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-3 sticky top-0 bg-background/95 backdrop-blur-sm z-20 border-b border-card-border/50">
        <button
          onClick={() => setLocation("/profile")}
          className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-base font-bold text-foreground">Informations personnelles</h1>
        <div className="w-9 h-9" />
      </div>

      <div className="px-5 pt-6">
        {/* Avatar section */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center mb-8">
          <div className="relative">
            <div
              onClick={handleAvatarClick}
              className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-violet-500/40 shadow-xl shadow-violet-900/20 cursor-pointer hover:opacity-90 transition-opacity"
            >
              {uploadingAvatar ? (
                <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              ) : avatarSrc ? (
                <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-3xl font-black">
                  {initials}
                </div>
              )}
            </div>
            <button
              onClick={handleAvatarClick}
              disabled={uploadingAvatar}
              className="absolute -bottom-2 -right-2 w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center border-2 border-background shadow-lg hover:bg-violet-500 transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            {uploadingAvatar ? "Upload en cours…" : "Appuyez sur la photo pour la modifier"}
          </p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">JPG, PNG, WebP — Max 8MB</p>
        </motion.div>

        {/* Form */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-4">

          {/* Nom complet */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AtSign className="w-3.5 h-3.5" /> Nom d'utilisateur
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">@</span>
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
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Numéro de téléphone
            </label>
            <div className="relative">
              <input
                type="text"
                value={user?.phone ?? "Non défini"}
                readOnly
                className="w-full bg-secondary/40 border border-card-border rounded-2xl px-4 py-3.5 text-sm text-muted-foreground cursor-not-allowed"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60 bg-secondary px-2 py-0.5 rounded-full">Non modifiable</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1 ml-1">Contactez le support pour modifier votre numéro.</p>
          </div>

          {/* Pays */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Pays
            </label>
            <select
              value={form.country}
              onChange={(e) => handleChange("country", e.target.value)}
              className="w-full bg-card border border-card-border rounded-2xl px-4 py-3.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name} ({c.code})</option>
              ))}
            </select>
          </div>

          {/* Badge vérifié */}
          {user?.verified && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-400">Compte vérifié</p>
                <p className="text-xs text-muted-foreground">Votre identité a été vérifiée avec succès.</p>
              </div>
            </div>
          )}

          {/* Bouton sauvegarder */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-2 flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 disabled:opacity-60 text-white font-bold rounded-2xl transition-opacity shadow-lg shadow-violet-500/20"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sauvegarde...</>
            ) : (
              <><Save className="w-4 h-4" /> Sauvegarder les modifications</>
            )}
          </button>

          <p className="text-center text-[11px] text-muted-foreground pb-4">
            Membre depuis {new Date(user?.createdAt ?? Date.now()).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
