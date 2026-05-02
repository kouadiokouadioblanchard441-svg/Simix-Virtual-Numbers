import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetMe, getGetMeQueryKey, useLogout, getGetDashboardSummaryQueryKey, useGetDashboardSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { formatFCFA } from "@/lib/format";
import { User as UserIcon, Shield, Bell, CreditCard, Lock, HelpCircle, LogOut, ChevronRight, Download, MoreVertical, X, Camera, Crown, Phone, Mail, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Profile() {
  return (
    <AuthGuard>
      <AppLayout>
        <ProfileContent />
      </AppLayout>
    </AuthGuard>
  );
}

function ProfileContent() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() }});
  const { data: summary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() }});
  const logoutMutation = useLogout();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      queryClient.clear();
      setLocation("/login");
    } catch (e) {
      console.error(e);
    }
  };

  const settingsItems = [
    { icon: UserIcon, label: "Informations personnelles", sub: "Gérer vos informations de compte" },
    { icon: Shield, label: "Sécurité", sub: "Mot de passe, 2FA, sessions actives" },
    { icon: Bell, label: "Notifications", sub: "Gérer vos préférences de notifications" },
    { icon: CreditCard, label: "Méthodes de paiement", sub: "Gérer vos moyens de paiement" },
    { icon: Lock, label: "Confidentialité", sub: "Politique de confidentialité et données" },
    { icon: HelpCircle, label: "Aide et support", sub: "FAQ, contact et assistance" },
  ];

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pt-6 pb-24 px-5">
      
      <div className="flex items-center justify-between mb-6 sticky top-0 bg-background z-20 pt-2 pb-2">
        <button onClick={() => setLocation('/dashboard')} className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors -ml-2">
          <div className="w-8 h-8 bg-card border border-card-border rounded-full flex items-center justify-center shadow-sm">
             <X className="w-4 h-4" />
          </div>
        </button>
        <h1 className="text-lg font-bold text-foreground">Mon profil</h1>
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
             <Download className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
             <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* User Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-violet-900 to-background border border-card-border rounded-3xl p-5 mb-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold border-2 border-card-border overflow-hidden">
              {user?.fullName?.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-card rounded-full flex items-center justify-center border border-card-border cursor-pointer hover:bg-secondary">
              <Camera className="w-3.5 h-3.5 text-foreground" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-white">{user?.fullName}</h2>
              {user?.verified && (
                <span className="bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  ✓ Vérifié
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Phone className="w-3 h-3" /> {user?.phone}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Mail className="w-3 h-3" /> {user?.email || "Email non défini"}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">Membre depuis janv. 2024</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </motion.div>

      {/* Statut card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-card-border p-4 rounded-2xl flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
          <Crown className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">Statut : <span className="text-primary bg-primary/10 px-2 py-0.5 rounded-md ml-1">{user?.status || "Standard"}</span></h3>
          <p className="text-xs text-muted-foreground leading-tight mt-1">Effectuez plus d'achats pour débloquer des avantages exclusifs !</p>
        </div>
        <Button variant="outline" size="sm" className="border-primary text-primary hover:bg-primary/10 hover:text-primary rounded-xl text-xs h-9 px-3 font-semibold shrink-0">
          Voir les niveaux
        </Button>
      </motion.div>

      {/* Mon solde card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card border border-card-border p-5 rounded-2xl mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Mon solde</h4>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-foreground">{formatFCFA(user?.balance || 0)}</h2>
              <Eye className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-[10px] text-muted-foreground">Solde disponible</p>
          </div>
          <Link href="/wallet">
            <Button className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-full h-10 px-4 text-sm font-bold shadow-none">
              + Recharger
            </Button>
          </Link>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 bg-secondary rounded-xl p-3 flex justify-between items-center cursor-pointer hover:bg-secondary/80 transition-colors">
            <div>
              <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Total dépensé</p>
              <p className="text-sm font-bold text-foreground">{formatFCFA(summary?.totalSpent || 0)}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 bg-secondary rounded-xl p-3 flex justify-between items-center cursor-pointer hover:bg-secondary/80 transition-colors">
            <div>
              <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Transactions</p>
              <p className="text-sm font-bold text-foreground">{(summary as any)?.transactionsCount ?? 32}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h3 className="text-lg font-bold text-foreground mb-4">Mon compte</h3>
        <div className="space-y-3 mb-8">
          {settingsItems.map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-card border border-card-border rounded-2xl hover:bg-secondary/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-foreground">
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">{item.label}</h4>
                  <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          ))}

          {/* Logout row */}
          <button 
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="w-full flex items-center justify-between p-4 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-2xl text-[#EF4444] hover:bg-[#EF4444]/20 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#EF4444]/20 flex items-center justify-center">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-bold">Se déconnecter</h4>
                <p className="text-[10px] text-[#EF4444]/70">Déconnexion de votre compte</p>
              </div>
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
