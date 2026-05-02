import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { formatFCFA } from "@/lib/format";
import { Loader2, Users, ShoppingBag, TrendingUp, AlertTriangle, UserCheck, Zap, Shield, Activity } from "lucide-react";

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Utilisateurs totaux" value={stats?.totalUsers ?? 0} sub={`+${stats?.newUsersToday ?? 0} aujourd'hui`} icon={Users} color="bg-violet-600" />
        <StatCard label="Revenus totaux" value={formatFCFA(stats?.totalRevenueFcfa ?? 0)} sub={`${formatFCFA(stats?.monthlyRevenueFcfa ?? 0)} ce mois`} icon={TrendingUp} color="bg-emerald-600" />
        <StatCard label="Commandes totales" value={stats?.totalNumbers ?? 0} sub={`${stats?.activeNumbers ?? 0} actives`} icon={ShoppingBag} color="bg-blue-600" />
        <StatCard label="Transactions" value={stats?.totalTransactions ?? 0} sub={`${stats?.weeklyTransactions ?? 0} cette semaine`} icon={Activity} color="bg-orange-600" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Utilisateurs bloqués" value={stats?.blockedUsers ?? 0} icon={UserCheck} color="bg-red-600" />
        <StatCard label="Alertes critiques" value={stats?.criticalEventsThisWeek ?? 0} sub="7 derniers jours" icon={AlertTriangle} color="bg-yellow-600" />
        <StatCard label="Fournisseurs actifs" value={`${stats?.activeProviders ?? 0}/${stats?.totalProviders ?? 0}`} icon={Zap} color="bg-cyan-600" />
        <StatCard label="Score sécurité" value="A+" sub="Système opérationnel" icon={Shield} color="bg-violet-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4">Accès rapide</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: "/admin/users", label: "Gérer les utilisateurs", icon: Users, color: "text-violet-400" },
              { href: "/admin/orders", label: "Voir les commandes", icon: ShoppingBag, color: "text-blue-400" },
              { href: "/admin/providers", label: "Fournisseurs API", icon: Zap, color: "text-cyan-400" },
              { href: "/admin/security", label: "Sécurité & alertes", icon: Shield, color: "text-yellow-400" },
            ].map(({ href, label, icon: Icon, color }) => (
              <a key={href} href={href} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-sm text-zinc-300">{label}</span>
              </a>
            ))}
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
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${ok ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"}`}>
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
