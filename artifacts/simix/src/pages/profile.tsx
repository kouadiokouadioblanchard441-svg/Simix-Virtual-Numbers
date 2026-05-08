import { useRef, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetMe, getGetMeQueryKey, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { formatFCFA } from "@/lib/format";
import { User as UserIcon, Shield, Bell, CreditCard, Lock, HelpCircle, LogOut, ChevronRight, Camera, Crown, Eye, TrendingUp, ShoppingBag } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Profile() {
  return (
    <AuthGuard>
      <AppLayout>
        <ProfileContent />
      </AppLayout>
    </AuthGuard>
  );
}

async function compressImage(file: File, maxSizeKB = 300): Promise<string> {
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
      let quality = 0.85;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > maxSizeKB * 1024 * 1.37 && quality > 0.3) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(dataUrl);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function ProfileContent() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const logoutMutation = useLogout();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      queryClient.clear();
      setLocation("/login");
    } catch (e) {
      console.error(e);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await compressImage(file);
      const res = await fetch(`${BASE}/api/auth/me/avatar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatar: dataUrl }),
      });
      if (res.ok) queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initials = (user?.fullName ?? user?.username ?? "S")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const settingsItems = [
    { icon: UserIcon, label: "Informations personnelles", sub: "Nom, email, téléphone", href: "/profile/informations", color: "text-violet-500", bg: "bg-violet-500/10" },
    { icon: Shield, label: "Sécurité", sub: "Mot de passe & 2FA", href: "/profile/securite", color: "text-blue-500", bg: "bg-blue-500/10" },
    { icon: Bell, label: "Notifications", sub: "Préférences d'alertes", href: "/profile/notifications", color: "text-amber-500", bg: "bg-amber-500/10" },
    { icon: CreditCard, label: "Méthodes de paiement", sub: "Orange Money, Wave, MTN…", href: "/profile/paiement", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { icon: Lock, label: "Confidentialité", sub: "Données & politique", href: "/profile/confidentialite", color: "text-rose-500", bg: "bg-rose-500/10" },
    { icon: HelpCircle, label: "Aide et support", sub: "FAQ & assistance", href: "/profile/aide", color: "text-sky-500", bg: "bg-sky-500/10" },
  ];

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pb-28">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />

      {/* Header gradient */}
      <div className="relative">
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-violet-600/20 via-violet-900/8 to-transparent pointer-events-none" />

        <div className="relative z-10 px-5 pt-6 pb-5">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-extrabold text-foreground">Mon profil</h1>
            {user?.isAdmin && (
              <Link href="/admin">
                <button className="h-9 px-3 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400 text-xs font-bold flex items-center gap-1.5 hover:bg-violet-600/30 transition-colors">
                  Admin
                </button>
              </Link>
            )}
          </div>

          {/* Avatar + Identity Card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-violet-900/60 via-card to-card border border-card-border rounded-3xl p-5 mb-4 shadow-lg">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden border-2 border-violet-500/40 shadow-lg shadow-violet-900/30">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-black">
                      {initials}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-violet-600 rounded-xl flex items-center justify-center border-2 border-background shadow-md hover:bg-violet-500 transition-colors"
                >
                  {uploadingAvatar ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-3 h-3 text-white" />
                  )}
                </button>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-base font-extrabold text-white truncate">{user?.fullName ?? "—"}</h2>
                  {user?.verified && (
                    <span className="flex-shrink-0 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">✓</span>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground truncate mb-0.5">@{user?.username ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground/70 truncate">{user?.phone ?? "—"}</p>
                {user?.email && (
                  <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{user.email}</p>
                )}
              </div>
            </div>

            {/* Status badge */}
            <div className="mt-4 pt-4 border-t border-card-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-foreground">Statut : </span>
                <span className="bg-amber-500/15 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">{user?.status ?? "Standard"}</span>
              </div>
              <button onClick={() => setLocation("/profile/informations")} className="text-xs text-violet-400 font-semibold hover:underline flex items-center gap-0.5">
                Modifier <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>

          {/* Balance + Stats */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
            className="bg-card border border-card-border rounded-2xl p-4 mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Solde disponible</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-foreground tracking-tight">{formatFCFA(user?.balance ?? 0)}</span>
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <Link href="/wallet">
                <button className="h-10 px-4 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-full flex items-center gap-1.5 transition-colors shadow-md shadow-violet-500/25">
                  + Recharger
                </button>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/60 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
                  <p className="text-[10px] text-muted-foreground font-medium">Total dépensé</p>
                </div>
                <p className="text-sm font-black text-foreground">{formatFCFA((user as any)?.totalSpent ?? 0)}</p>
              </div>
              <div className="bg-secondary/60 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                  <p className="text-[10px] text-muted-foreground font-medium">Transactions</p>
                </div>
                <p className="text-sm font-black text-foreground">{(user as any)?.transactionsCount ?? 0}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Settings list */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="px-5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Mon compte</p>
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden divide-y divide-card-border/50 mb-4 shadow-sm">
          {settingsItems.map((item, i) => (
            <button
              key={i}
              onClick={() => setLocation(item.href)}
              className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-secondary/40 transition-colors text-left"
            >
              <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0`}>
                <item.icon className={`w-[18px] h-[18px] ${item.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{item.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{item.sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="w-full flex items-center gap-4 px-4 py-3.5 bg-rose-500/8 border border-rose-500/20 rounded-2xl text-rose-400 hover:bg-rose-500/15 transition-colors mb-6"
        >
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center flex-shrink-0">
            <LogOut className="w-[18px] h-[18px]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold leading-tight">Se déconnecter</p>
            <p className="text-[11px] text-rose-400/60">Fermer la session en cours</p>
          </div>
        </button>

        <p className="text-center text-[10px] text-muted-foreground/50 pb-2">Simix v1.0 — Paiements mobile sécurisés</p>
      </motion.div>
    </div>
  );
}
