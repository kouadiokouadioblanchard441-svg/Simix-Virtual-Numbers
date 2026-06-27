import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, Users, ShoppingBag, TrendingUp, AlertTriangle, UserCheck, Zap, Shield, Activity, Power, PowerOff, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-zinc-400 text-sm mt-0.5">{label}</div>
        {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function MaintenanceToggle() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-settings-maintenance"],
    queryFn: adminApi.getSettings,
    refetchInterval: 30000,
  });

  const isMaintenanceOn = settings?.maintenance_mode === "true";

  const toggle = useMutation({
    mutationFn: () => adminApi.updateSettings({ maintenance_mode: isMaintenanceOn ? "false" : "true" }),
    onSuccess: () => {
      toast({
        title: isMaintenanceOn ? "Mode maintenance désactivé" : "Mode maintenance activé",
        description: isMaintenanceOn
          ? "La plateforme est de nouveau accessible aux utilisateurs."
          : "Les utilisateurs voient maintenant la page de maintenance.",
      });
      qc.invalidateQueries({ queryKey: ["admin-settings-maintenance"] });
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${isMaintenanceOn ? "bg-orange-950/30 border-orange-700/40" : "bg-zinc-900 border-zinc-800"}`}>
      <div className={`p-2.5 rounded-lg ${isMaintenanceOn ? "bg-orange-600" : "bg-zinc-700"}`}>
        {isMaintenanceOn ? <PowerOff className="w-5 h-5 text-white" /> : <Power className="w-5 h-5 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-sm ${isMaintenanceOn ? "text-orange-300" : "text-white"}`}>
          Mode maintenance
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {isMaintenanceOn ? "Plateforme en maintenance — utilisateurs bloqués" : "Plateforme opérationnelle"}
        </div>
      </div>
      <button
        onClick={() => {
          if (!isMaintenanceOn) {
            if (!confirm("Activer le mode maintenance ? Les utilisateurs ne pourront plus accéder à la plateforme.")) return;
          }
          toggle.mutate();
        }}
        disabled={isLoading || toggle.isPending}
        className={`shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 ${
          isMaintenanceOn
            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
            : "bg-orange-600 hover:bg-orange-700 text-white"
        }`}
      >
        {toggle.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {isMaintenanceOn ? "Désactiver" : "Activer"}
      </button>
    </div>
  );
}

function FiveSimBalanceAlert() {
  const { data: providers } = useQuery({
    queryKey: ["admin-providers-balance-check"],
    queryFn: adminApi.getProviders,
    refetchInterval: 60000,
  });

  const { data: settings } = useQuery({
    queryKey: ["admin-settings-maintenance"],
    queryFn: adminApi.getSettings,
  });

  const fivesimProvider = providers?.find(p => p.slug === "5sim" && p.active);

  const { data: balance } = useQuery({
    queryKey: ["admin-fivesim-balance", fivesimProvider?.id],
    queryFn: () => adminApi.getProviderBalance(fivesimProvider!.id),
    enabled: !!fivesimProvider,
    refetchInterval: 60000,
  });

  const threshold = Number(settings?.fivesim_balance_alert_threshold ?? 5);

  if (!fivesimProvider || balance === undefined) return null;
  if (balance === null) return null;

  const isLow = balance.balance < threshold;

  if (!isLow) return null;

  return (
    <div className="bg-red-950/40 border border-red-700/40 rounded-xl p-4 flex items-start gap-3">
      <Bell className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
      <div>
        <div className="text-red-300 font-semibold text-sm">⚠️ Solde 5sim faible</div>
        <div className="text-zinc-400 text-xs mt-1">
          Solde actuel : <span className="text-white font-mono font-bold">${balance.balance.toFixed(2)} USD</span>
          {" "}— seuil d'alerte : <span className="text-zinc-300">${threshold} USD</span>
        </div>
        <a href="/admin/providers" className="text-red-400 hover:text-red-300 text-xs mt-1 inline-block underline">
          Recharger le compte 5sim →
        </a>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.getStats(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Tableau de bord</h1>
        <p className="text-zinc-400 text-sm mt-1">Vue d'ensemble de la plateforme Simix</p>
      </div>

      <FiveSimBalanceAlert />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Utilisateurs totaux" value={stats?.totalUsers ?? 0} sub={`+${stats?.newUsersToday ?? 0} aujourd'hui`} icon={Users} color="bg-violet-600" />
        <StatCard label="Revenus totaux" value={formatFCFA(stats?.totalRevenueFcfa ?? 0)} sub={`${formatFCFA(stats?.monthlyRevenueFcfa ?? 0)} ce mois`} icon={TrendingUp} color="bg-emerald-600" />
        <StatCard label="Commandes totales" value={stats?.totalNumbers ?? 0} sub={`${stats?.activeNumbers ?? 0} actives`} icon={ShoppingBag} color="bg-blue-600" />
        <StatCard label="Transactions" value={stats?.totalTransactions ?? 0} sub={`${stats?.weeklyTransactions ?? 0} cette semaine`} icon={Activity} color="bg-orange-600" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Utilisateurs bloqués" value={stats?.blockedUsers ?? 0} icon={UserCheck} color="bg-red-600" />
        <StatCard label="Alertes critiques" value={stats?.criticalEventsThisWeek ?? 0} sub="7 derniers jours" icon={AlertTriangle} color="bg-emerald-600" />
        <StatCard label="Fournisseurs actifs" value={`${stats?.activeProviders ?? 0}/${stats?.totalProviders ?? 0}`} icon={Zap} color="bg-cyan-600" />
        <StatCard label="Score sécurité" value="A+" sub="Système opérationnel" icon={Shield} color="bg-violet-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <MaintenanceToggle />
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-white mb-4">Accès rapide</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/admin/users", label: "Gérer les utilisateurs", icon: Users, color: "text-violet-400" },
                { href: "/admin/orders", label: "Voir les commandes", icon: ShoppingBag, color: "text-blue-400" },
                { href: "/admin/providers", label: "Fournisseurs API", icon: Zap, color: "text-cyan-400" },
                { href: "/admin/security", label: "Sécurité & alertes", icon: Shield, color: "text-emerald-400" },
              ].map(({ href, label, icon: Icon, color }) => (
                <a key={href} href={href} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-sm text-zinc-300">{label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4">Statut de la plateforme</h2>
          <div className="space-y-3">
            {[
              { label: "Serveur API", status: "Opérationnel", ok: true },
              { label: "Base de données", status: "Opérationnel", ok: true },
              { label: "Fournisseurs SMS", status: stats?.activeProviders ? "Actif" : "Non configuré", ok: (stats?.activeProviders ?? 0) > 0 },
              { label: "Détection de fraude", status: "Actif", ok: true },
            ].map(({ label, status, ok }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                <span className="text-sm text-zinc-300">{label}</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${ok ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <AdminGuard>
      <AdminLayout>
        <DashboardContent />
      </AdminLayout>
    </AdminGuard>
  );
}
