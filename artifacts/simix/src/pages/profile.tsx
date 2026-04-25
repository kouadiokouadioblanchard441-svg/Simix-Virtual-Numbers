import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useGetMe, getGetMeQueryKey, useLogout, getGetDashboardSummaryQueryKey, useGetDashboardSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { formatFCFA } from "@/lib/format";
import { User as UserIcon, Shield, Bell, CreditCard, Lock, HelpCircle, LogOut, ChevronRight } from "lucide-react";

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
    { icon: UserIcon, label: "Informations personnelles", href: "#" },
    { icon: Shield, label: "Sécurité", href: "#" },
    { icon: Bell, label: "Notifications", href: "#" },
    { icon: CreditCard, label: "Méthodes de paiement", href: "#" },
    { icon: Lock, label: "Confidentialité", href: "#" },
    { icon: HelpCircle, label: "Aide et support", href: "#" },
  ];

  return (
    <div className="flex-1 w-full bg-background overflow-y-auto overflow-x-hidden pt-12 pb-8 px-6">
      <h1 className="text-xl font-bold text-foreground mb-6">Mon profil</h1>

      {/* User Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 bg-card border border-card-border p-4 rounded-2xl mb-6">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-bold relative">
          {user?.fullName?.charAt(0).toUpperCase()}
          {user?.verified && (
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-[#10B981] rounded-full border-2 border-card flex items-center justify-center">
              <Shield className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">{user?.fullName}</h2>
          <p className="text-sm text-muted-foreground">{user?.phone}</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-card-border p-4 rounded-2xl">
          <p className="text-xs text-muted-foreground font-medium mb-1">Statut</p>
          <p className="text-lg font-bold text-foreground capitalize text-primary mb-2">{user?.status || "Standard"}</p>
          <button className="text-xs text-muted-foreground flex items-center font-medium">
            Voir les niveaux <ChevronRight className="w-3 h-3 ml-1" />
          </button>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card border border-card-border p-4 rounded-2xl flex flex-col justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Dépenses totales</p>
            <p className="text-lg font-bold text-foreground mb-1">{formatFCFA(summary?.totalSpent || 0)}</p>
          </div>
          <p className="text-xs text-muted-foreground">{summary?.totalNumbers || 0} numéros</p>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Mon compte</h3>
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden mb-8">
          {settingsItems.map((item, i) => (
            <div key={i} className={`flex items-center justify-between p-4 ${i !== settingsItems.length - 1 ? 'border-b border-card-border' : ''} active:bg-secondary/50`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground">
                  <item.icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
        </div>

        <button 
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="w-full flex items-center justify-between p-4 bg-card border border-card-border rounded-2xl text-destructive active:bg-destructive/10"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold">Se déconnecter</span>
          </div>
        </button>
      </motion.div>
    </div>
  );
}
